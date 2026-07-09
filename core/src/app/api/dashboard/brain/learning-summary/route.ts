import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'
import { generateResponse } from '@/lib/agent-core'
import { getTokenUsage, type TokenUsageDoc, type UsageBucket } from '@/lib/token-usage'
import { BRAND_ID } from '@/configs'
import { getBrainConfig } from '@/lib/brain/brainConfig'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// The Brain reasons here — pinned to Sonnet 5 (more reasoning than the
// Haiku/quick paths). Independent of the global CLAUDE_MODEL.
const BRAIN_REASONING_MODEL = 'claude-sonnet-5'

/**
 * The recursive-learning readout.
 *
 * GET  → fast stats, no model call: what the brain is ingesting (leads, chats,
 *        notes, decisions) + what its reasoning costs (token_usage 'brain'
 *        bucket: today / 7 days / all-time).
 * POST → the reflection itself: Sonnet 5 reads TODAY's conversations + human
 *        decisions + admin notes and reports what changed in its understanding.
 *        Returns the sources it read and the token cost of the reflection call
 *        (measured as the delta of the 'brain' bucket around the call).
 */

function istDayKey(offsetDays = 0): string {
  const d = new Date(Date.now() - offsetDays * 86400000)
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function emptyBucket(): UsageBucket {
  return { input_tokens: 0, output_tokens: 0, calls: 0, cost_usd: 0 }
}

/** Aggregate the 'brain' + total spend for today / last 7 IST days / all-time. */
function usageWindows(doc: TokenUsageDoc | null) {
  const brainToday = emptyBucket(), brain7d = emptyBucket(), totalToday = emptyBucket()
  if (doc?.byDay) {
    for (let i = 0; i < 7; i++) {
      const day = doc.byDay[istDayKey(i)]
      if (!day) continue
      addAssign(brain7d, day.brain)
      if (i === 0) {
        addAssign(brainToday, day.brain)
        for (const k of Object.keys(day)) addAssign(totalToday, (day as any)[k])
      }
    }
  }
  const brainAll = doc?.byCategory?.brain || emptyBucket()
  return { brain_today: brainToday, brain_7d: brain7d, brain_all_time: brainAll, all_categories_today: totalToday }
}
function addAssign(target: UsageBucket, b?: UsageBucket | null): void {
  if (!b) return
  target.input_tokens += b.input_tokens || 0
  target.output_tokens += b.output_tokens || 0
  target.calls += b.calls || 0
  target.cost_usd += b.cost_usd || 0
}

/** Gather what the brain can read today: conversations, decisions, notes. */
async function gatherSources(supabase: any, brand: string) {
  const istDate = istDayKey()
  const istMidnightIso = new Date(`${istDate}T00:00:00+05:30`).toISOString()

  const [convRes, leadsRes] = await Promise.all([
    supabase.from('conversations')
      .select('lead_id, sender, content, channel, created_at')
      .gte('created_at', istMidnightIso)
      .order('created_at', { ascending: true })
      .limit(600),
    supabase.from('all_leads')
      .select('customer_name, unified_context')
      .in('brand', [brand, 'default'])
      .limit(2000),
  ])

  const messages = convRes.data || []
  const leadIds = new Set(messages.map((m: any) => m.lead_id).filter(Boolean))

  // Per-lead compact transcripts (token-bounded).
  const byLead: Record<string, string[]> = {}
  for (const m of messages as any[]) {
    const id = m.lead_id || 'unknown'
    if (!byLead[id]) byLead[id] = []
    if (byLead[id].length >= 16) continue
    const who = String(m.sender || '').toLowerCase().includes('customer') || m.sender === 'user' ? 'Lead' : 'PROXe'
    const text = String(m.content || '').replace(/\s+/g, ' ').slice(0, 240)
    if (text) byLead[id].push(`${who}: ${text}`)
  }
  const transcripts = Object.entries(byLead)
    .slice(0, 40)
    .map(([, lines], i) => `--- Chat ${i + 1} ---\n${lines.join('\n')}`)
    .join('\n\n')

  // Decisions + notes across leads.
  const decisionsToday: string[] = []
  let decisionsTotal = 0
  const notesToday: string[] = []
  let notesTotal = 0
  for (const l of (leadsRes.data || []) as any[]) {
    const log = l.unified_context?.decision_log
    if (Array.isArray(log)) {
      decisionsTotal += log.length
      for (const d of log) {
        const at = String(d.at || '')
        if (at < istMidnightIso) continue
        const ai = d.ai_proposed_plan?.action || 'none'
        const human = d.human_decision?.action || 'none'
        const matched = d.agreement?.matched ? 'agreed' : 'overrode'
        const reason = d.human_decision?.reason ? ` ("${d.human_decision.reason}")` : ''
        decisionsToday.push(`${l.customer_name || 'Lead'}: AI→${ai}, human ${matched}→${human}${reason}`)
      }
    }
    const notes = l.unified_context?.admin_notes
    if (Array.isArray(notes)) {
      notesTotal += notes.length
      for (const n of notes) {
        const at = String(n?.at || n?.created_at || '')
        if (at < istMidnightIso) continue
        const text = String(n?.note || n?.text || '').replace(/\s+/g, ' ').slice(0, 160)
        if (text) notesToday.push(`${l.customer_name || 'Lead'}: ${text}`)
      }
    }
  }

  return {
    istDate,
    transcripts,
    decisionsToday,
    notesToday,
    counts: {
      leads_scanned: (leadsRes.data || []).length,
      chats_today: leadIds.size,
      messages_today: messages.length,
      decisions_today: decisionsToday.length,
      decisions_total: decisionsTotal,
      notes_today: notesToday.length,
      notes_total: notesTotal,
    },
  }
}

export async function GET() {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getServiceClient() || authClient
    const { counts, istDate } = await gatherSources(supabase, BRAND_ID)
    const usage = usageWindows(await getTokenUsage())
    return NextResponse.json({ today_ist: istDate, sources: counts, usage })
  } catch (err) {
    console.error('[brain/learning-summary] GET error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}

export async function POST() {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getServiceClient() || authClient
    const src = await gatherSources(supabase, BRAND_ID)

    if (src.counts.chats_today === 0 && src.counts.decisions_today === 0 && src.counts.notes_today === 0) {
      return NextResponse.json({
        chats_analyzed: 0,
        sources: src.counts,
        biggest_learning: null,
        understanding_shifts: [],
        objection_patterns: [],
        note: 'No chats, notes or decisions logged today yet.',
      })
    }

    const before = usageWindows(await getTokenUsage())

    const systemPrompt = `You are PROXe Brain, reflecting on today's live activity for ${getBrainConfig().reflectionPersona}.
From the chats, human decisions and team notes below, extract what the brain should LEARN — go beyond sequence timing. Look for: shifts in what leads actually want, recurring objections and what answered them, tone that landed, questions that stalled, where the AI proposal diverged from the human and why, and anything the team's notes reveal that the chats don't.

Return STRICT JSON only, no prose around it, in this exact shape:
{
  "biggest_learning": "<one sharp sentence — the single most important takeaway today>",
  "understanding_shifts": ["<3 to 5 bullets: concrete shifts in understanding of leads/what works>"],
  "objection_patterns": ["<0 to 4 bullets: objections seen today + the angle that worked, if any>"],
  "recursive_actions": ["<0 to 3 bullets: what the brain should now DO differently (timing, copy, routing) based on this>"]
}
Be specific and grounded ONLY in the data. No invented figures. No em dashes.

TODAY (IST): ${src.istDate}
CHATS: ${src.counts.chats_today} · DECISIONS: ${src.counts.decisions_today} · NOTES: ${src.counts.notes_today}

CONVERSATIONS:
${src.transcripts || '(none)'}

HUMAN DECISIONS TODAY:
${src.decisionsToday.slice(0, 40).join('\n') || '(none)'}

TEAM NOTES TODAY:
${src.notesToday.slice(0, 40).join('\n') || '(none)'}`

    let raw: string
    try {
      raw = await generateResponse(systemPrompt, 'Produce the JSON summary now.', 1200, BRAIN_REASONING_MODEL, 'brain')
    } catch (err: any) {
      console.error('[brain/learning-summary] model failed:', err?.message || err)
      return NextResponse.json({ error: 'The brain could not reflect right now. Try again.' }, { status: 502 })
    }

    const after = usageWindows(await getTokenUsage())
    const reflection_usage = {
      input_tokens: Math.max(0, after.brain_today.input_tokens - before.brain_today.input_tokens),
      output_tokens: Math.max(0, after.brain_today.output_tokens - before.brain_today.output_tokens),
      cost_usd: Math.max(0, after.brain_today.cost_usd - before.brain_today.cost_usd),
    }

    // Parse the JSON out of the reply (tolerate code fences / stray text).
    let parsed: any = null
    const m = raw.match(/\{[\s\S]*\}/)
    try { parsed = JSON.parse(m ? m[0] : raw) } catch { /* fall through */ }
    if (!parsed || typeof parsed !== 'object') {
      return NextResponse.json({
        chats_analyzed: src.counts.chats_today,
        sources: src.counts,
        usage: after,
        reflection_usage,
        biggest_learning: raw.slice(0, 240),
        understanding_shifts: [],
        objection_patterns: [],
        recursive_actions: [],
      })
    }

    return NextResponse.json({
      chats_analyzed: src.counts.chats_today,
      sources: src.counts,
      usage: after,
      reflection_usage,
      biggest_learning: typeof parsed.biggest_learning === 'string' ? parsed.biggest_learning : null,
      understanding_shifts: Array.isArray(parsed.understanding_shifts) ? parsed.understanding_shifts.slice(0, 5) : [],
      objection_patterns: Array.isArray(parsed.objection_patterns) ? parsed.objection_patterns.slice(0, 4) : [],
      recursive_actions: Array.isArray(parsed.recursive_actions) ? parsed.recursive_actions.slice(0, 3) : [],
      generated_at: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[brain/learning-summary] Error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
