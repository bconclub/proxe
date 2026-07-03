/**
 * Token-usage metering — TEST / experimental.
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
  | 'brain'         // Ask PROXe
  | 'vision'        // screenshot / image reads
  | 'other'

export const CATEGORY_LABELS: Record<TokenCategory, string> = {
  chat: 'Agent chat (WhatsApp/Web)',
  scoring: 'Lead scoring',
  notes_summary: 'Notes & summaries',
  brain: 'Ask PROXe',
  vision: 'Screenshot reads',
  other: 'Other',
}

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
): void {
  const b: UsageBucket = map[category] || { input_tokens: 0, output_tokens: 0, calls: 0, cost_usd: 0 }
  b.input_tokens += inputTokens || 0
  b.output_tokens += outputTokens || 0
  b.calls += 1
  b.cost_usd += estimateCost(model, inputTokens || 0, outputTokens || 0)
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

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = priceFor(model)
  return (inputTokens / 1e6) * p.in + (outputTokens / 1e6) * p.out
}

/**
 * Add a Claude call's token usage to the running aggregate. Fire-and-forget —
 * callers should NOT await in a way that blocks the reply (use `void`).
 */
export async function recordTokenUsage(
  category: TokenCategory,
  model: string,
  inputTokens: number,
  outputTokens: number,
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
    addToBucket(cur.byCategory, category, inputTokens, outputTokens, model)
    // Per-IST-day bucket (for windowed views).
    if (!cur.byDay) cur.byDay = {}
    const dayKey = istDayKey()
    if (!cur.byDay[dayKey]) cur.byDay[dayKey] = {}
    addToBucket(cur.byDay[dayKey], category, inputTokens, outputTokens, model)
    cur.updatedAt = nowIso

    await svc
      .from('dashboard_settings')
      .upsert(
        {
          key: SETTINGS_KEY,
          value: cur,
          description: 'TEST: Claude token usage by category',
          // NB: dashboard_settings.updated_by is a UUID column — passing the
          // string 'system' 400s (22P02) and silently drops the write. Omit it.
        },
        { onConflict: 'key' },
      )
  } catch (e) {
    // Best-effort — never throw into a live reply path — but DO log, so a silent
    // write failure (like the updated_by UUID bug) is visible next time.
    console.error('[token-usage] write failed:', (e as any)?.message || e)
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
          // NB: dashboard_settings.updated_by is a UUID column — passing the
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
export function usageFrom(resp: any): { input: number; output: number } {
  const u = resp?.usage || {}
  const input = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0)
  const output = u.output_tokens || 0
  return { input, output }
}
