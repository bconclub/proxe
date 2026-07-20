/**
 * Token-usage metering - TEST / experimental.
 *
 * Records Claude token spend bucketed by category (agent chat, scoring,
 * notes & summaries, vision, …) so the team can see roughly where the spend
 * goes. Stored as a single JSON aggregate in dashboard_settings (key
 * 'token_usage') to avoid a schema migration while we evaluate the idea.
 *
 * Caveats (it's a test):
 *  - Read-modify-write on one row → counts can under-report under heavy
 *    concurrency. Fine for ballpark spend; revisit with a real table if we ship.
 *  - Costs are rough USD estimates from public per-model pricing.
 *  - Always fire-and-forget: metering must NEVER break or slow a real reply.
 */

import { getServiceClient } from '@/lib/services/supabase'

export type TokenCategory =
  | 'chat'          // WhatsApp / web / voice agent replies
  | 'scoring'       // lead scoring
  | 'notes_summary' // note classification + summaries
  | 'brain'         // Ask PROXe / Brain - TEXT (LLM: briefing words, Q&A)
  | 'brain_voice'   // Ask PROXe / Brain - VOICE (ElevenLabs TTS, char-billed)
  | 'vision'        // screenshot / image reads
  | 'other'

export const CATEGORY_LABELS: Record<TokenCategory, string> = {
  chat: 'Agent chat (WhatsApp/Web)',
  scoring: 'Lead scoring',
  notes_summary: 'Notes & summaries',
  brain: 'Ask PROXe (text)',
  brain_voice: 'Ask PROXe (voice)',
  vision: 'Screenshot reads',
  other: 'Other',
}

// Voice categories are billed by CHARACTERS spoken (ElevenLabs), not LLM
// tokens. The tracker stores the char count in `input_tokens` so the table's
// totals still add up to something meaningful, and cost comes from the
// per-1K-char price below instead of estimateCost().
export const VOICE_CATEGORIES: ReadonlySet<TokenCategory> = new Set<TokenCategory>(['brain_voice'])

const SETTINGS_KEY = 'token_usage'

export interface UsageBucket {
  input_tokens: number
  output_tokens: number
  calls: number
  cost_usd: number
}

export interface TokenUsageDoc {
  byCategory: Partial<Record<TokenCategory, UsageBucket>>
  // Per-IST-day buckets so the /tokens page can sum windows (24h / 7d / 30d).
  // Keyed 'YYYY-MM-DD'. byCategory stays the all-time cumulative ("All").
  byDay?: Record<string, Partial<Record<TokenCategory, UsageBucket>>>
  since: string
  updatedAt: string
}

/** IST calendar day key, e.g. "2026-06-18". */
function istDayKey(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

/** Add a call's tokens into a bucket map under `key`, returning the map. */
function addToBucket(
  map: Partial<Record<TokenCategory, UsageBucket>>,
  category: TokenCategory,
  inputTokens: number,
  outputTokens: number,
  model: string,
  cacheRead: number = 0,
  cacheWrite: number = 0,
): void {
  const b: UsageBucket = map[category] || { input_tokens: 0, output_tokens: 0, calls: 0, cost_usd: 0 }
  b.input_tokens += inputTokens || 0
  b.output_tokens += outputTokens || 0
  b.calls += 1
  b.cost_usd += estimateCost(model, inputTokens || 0, outputTokens || 0, cacheRead || 0, cacheWrite || 0)
  map[category] = b
}

/** Rough USD per 1M tokens (input, output) by model family. */
function priceFor(model: string): { in: number; out: number } {
  const m = (model || '').toLowerCase()
  if (m.includes('opus')) return { in: 15, out: 75 }
  if (m.includes('sonnet')) return { in: 3, out: 15 }
  if (m.includes('haiku')) return { in: 0.8, out: 4 }
  return { in: 1, out: 5 }
}

/**
 * Estimate a call's USD cost, correctly accounting for prompt caching.
 *
 * `inputTokens` is the TOTAL input (uncached + cache writes + cache reads).
 * Anthropic bills those tiers at very different rates:
 *   - uncached input : 1×   the input price
 *   - cache WRITE    : 1.25× (cache_creation_input_tokens)
 *   - cache READ     : 0.1×  (cache_read_input_tokens) - 10× cheaper
 * We cached a large system prompt on every chat call, so most "input" tokens
 * are cache reads. Pricing them all at 1× over-stated chat cost ~2×. Passing
 * cacheRead/cacheWrite (default 0 = treat all input as uncached) fixes it.
 */
export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheRead: number = 0,
  cacheWrite: number = 0,
): number {
  const p = priceFor(model)
  const uncached = Math.max(0, (inputTokens || 0) - (cacheRead || 0) - (cacheWrite || 0))
  return (
    (uncached / 1e6) * p.in +
    (cacheRead / 1e6) * p.in * 0.1 +
    (cacheWrite / 1e6) * p.in * 1.25 +
    (outputTokens / 1e6) * p.out
  )
}

/**
 * Rough USD per 1,000 characters for ElevenLabs TTS. ElevenLabs actually bills
 * in subscription credits, not per-char USD - these are ballpark conversions
 * for the "rough spend" panel (flash models cost ~half the credits of the
 * standard/v3 models). Match by model-id substring like priceFor().
 */
function voicePricePer1kChars(model: string): number {
  const m = (model || '').toLowerCase()
  if (m.includes('flash')) return 0.08          // eleven_flash_v2_5 (greeting)
  if (m.includes('v3')) return 0.15             // eleven_v3 (main briefing)
  if (m.includes('multilingual')) return 0.15   // eleven_multilingual_v2 (fallback)
  return 0.15
}

export function estimateVoiceCost(model: string, chars: number): number {
  return (Math.max(0, chars) / 1000) * voicePricePer1kChars(model)
}

/**
 * Add a Claude call's token usage to the running aggregate. Fire-and-forget -
 * callers should NOT await in a way that blocks the reply (use `void`).
 */
export async function recordTokenUsage(
  category: TokenCategory,
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheRead: number = 0,
  cacheWrite: number = 0,
): Promise<void> {
  try {
    if (!inputTokens && !outputTokens) return
    const svc = getServiceClient()
    if (!svc) {
      console.error('[token-usage] recordTokenUsage skipped: getServiceClient() returned null (missing service key in this runtime?)')
      return
    }

    const { data } = await svc
      .from('dashboard_settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .maybeSingle()

    const nowIso = new Date().toISOString()
    const cur: TokenUsageDoc =
      (data?.value as TokenUsageDoc) || { byCategory: {}, byDay: {}, since: nowIso, updatedAt: nowIso }

    // All-time cumulative bucket.
    addToBucket(cur.byCategory, category, inputTokens, outputTokens, model, cacheRead, cacheWrite)
    // Per-IST-day bucket (for windowed views).
    if (!cur.byDay) cur.byDay = {}
    const dayKey = istDayKey()
    if (!cur.byDay[dayKey]) cur.byDay[dayKey] = {}
    addToBucket(cur.byDay[dayKey], category, inputTokens, outputTokens, model, cacheRead, cacheWrite)
    cur.updatedAt = nowIso

    await svc
      .from('dashboard_settings')
      .upsert(
        {
          key: SETTINGS_KEY,
          value: cur,
          description: 'TEST: Claude token usage by category',
          // NB: dashboard_settings.updated_by is a UUID column - passing the
          // string 'system' 400s (22P02) and silently drops the write. Omit it.
        },
        { onConflict: 'key' },
      )
  } catch (e) {
    // Best-effort - never throw into a live reply path - but DO log, so a silent
    // write failure (like the updated_by UUID bug) is visible next time.
    console.error('[token-usage] write failed:', (e as any)?.message || e)
  }
}

/** Add a voice bucket's characters + char-billed cost into a map under `key`. */
function addVoiceToBucket(
  map: Partial<Record<TokenCategory, UsageBucket>>,
  category: TokenCategory,
  chars: number,
  model: string,
): void {
  const b: UsageBucket = map[category] || { input_tokens: 0, output_tokens: 0, calls: 0, cost_usd: 0 }
  b.input_tokens += chars || 0  // chars stored here so table totals stay meaningful
  b.calls += 1
  b.cost_usd += estimateVoiceCost(model, chars || 0)
  map[category] = b
}

/**
 * Record an ElevenLabs TTS call - billed by characters, not tokens. Same
 * fire-and-forget contract as recordTokenUsage; writes into the same
 * dashboard_settings 'token_usage' aggregate under a voice category.
 */
export async function recordVoiceUsage(
  category: TokenCategory,
  model: string,
  chars: number,
): Promise<void> {
  try {
    if (!chars) return
    const svc = getServiceClient()
    if (!svc) {
      console.error('[token-usage] recordVoiceUsage skipped: getServiceClient() returned null')
      return
    }
    const { data } = await svc
      .from('dashboard_settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .maybeSingle()

    const nowIso = new Date().toISOString()
    const cur: TokenUsageDoc =
      (data?.value as TokenUsageDoc) || { byCategory: {}, byDay: {}, since: nowIso, updatedAt: nowIso }

    addVoiceToBucket(cur.byCategory, category, chars, model)
    if (!cur.byDay) cur.byDay = {}
    const dayKey = istDayKey()
    if (!cur.byDay[dayKey]) cur.byDay[dayKey] = {}
    addVoiceToBucket(cur.byDay[dayKey], category, chars, model)
    cur.updatedAt = nowIso

    await svc
      .from('dashboard_settings')
      .upsert(
        { key: SETTINGS_KEY, value: cur, description: 'TEST: Claude token usage by category' },
        { onConflict: 'key' },
      )
  } catch (e) {
    console.error('[token-usage] voice write failed:', (e as any)?.message || e)
  }
}

/** Read the raw aggregate (for the /tokens page). */
export async function getTokenUsage(): Promise<TokenUsageDoc | null> {
  try {
    const svc = getServiceClient()
    if (!svc) return null
    const { data } = await svc
      .from('dashboard_settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .maybeSingle()
    return (data?.value as TokenUsageDoc) || null
  } catch {
    return null
  }
}

/** Reset the aggregate (so a test run can start clean). */
export async function resetTokenUsage(): Promise<void> {
  try {
    const svc = getServiceClient()
    if (!svc) return
    const nowIso = new Date().toISOString()
    await svc
      .from('dashboard_settings')
      .upsert(
        {
          key: SETTINGS_KEY,
          value: { byCategory: {}, byDay: {}, since: nowIso, updatedAt: nowIso } as TokenUsageDoc,
          description: 'TEST: Claude token usage by category',
          // NB: dashboard_settings.updated_by is a UUID column - passing the
          // string 'system' 400s (22P02) and silently drops the write. Omit it.
        },
        { onConflict: 'key' },
      )
  } catch {
    /* ignore */
  }
}

/**
 * Helper for the Anthropic SDK: pull input/output token counts out of a
 * response.usage object in a version-tolerant way.
 */
export function usageFrom(resp: any): { input: number; output: number; cacheRead: number; cacheWrite: number } {
  const u = resp?.usage || {}
  const cacheWrite = u.cache_creation_input_tokens || 0
  const cacheRead = u.cache_read_input_tokens || 0
  // `input` is the TOTAL (uncached + both cache tiers) so token COUNTS stay
  // accurate on the dashboard; estimateCost() re-prices the cache tiers cheaply.
  const input = (u.input_tokens || 0) + cacheWrite + cacheRead
  const output = u.output_tokens || 0
  return { input, output, cacheRead, cacheWrite }
}
