import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'
import { generateResponse } from '@/lib/agent-core'
import { BRAND_ID } from '@/configs'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// The Brain reasons here — pin Sonnet 5 explicitly (more reasoning than the
// Haiku/quick paths). Independent of the global CLAUDE_MODEL.
const BRAIN_REASONING_MODEL = 'claude-sonnet-5'

/**
 * POST /api/dashboard/brain/learning-summary
 *
 * Manual-trigger deep learning read. Pulls today's conversations + recent
 * human decisions and asks Sonnet 5: what did the brain actually LEARN today —
 * not just sequence tweaks, but shifts in understanding, objection patterns,
 * what worked. Returns a structured summary the Learning tab renders.
 */
export async function POST() {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getServiceClient() || authClient
    const brand = BRAND_ID

    const istDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    const istMidnight = new Date(`${istDate}T00:00:00+05:30`).getTime()

    // ── Today's conversations ────────────────────────────────────────────────
    const { data: convs } = await supabase
      .from('conversations')
      .select('lead_id, sender, content, channel, created_at')
      .gte('created_at', new Date(istMidnight).toISOString())
      .order('created_at', { ascending: true })
      .limit(600)

    const messages = convs || []
    const leadIds = new Set(messages.map((m: any) => m.lead_id).filter(Boolean))
    const chatsAnalyzed = leadIds.size

    // Group into compact per-lead transcripts (cap to keep tokens bounded).
    const byLead: Record<string, string[]> = {}
    for (const m of messages) {
      const id = m.lead_id || 'unknown'
      if (!byLead[id]) byLead[id] = []
      if (byLead[id].length >= 16) continue
      const who = String(m.sender || '').toLowerCase().includes('lead') || m.sender === 'user' ? 'Lead' : 'PROXe'
      const text = String(m.content || '').replace(/\s+/g, ' ').slice(0, 240)
      if (text) byLead[id].push(`${who}: ${text}`)
    }
    const transcripts = Object.entries(byLead)
      .slice(0, 40)
      .map(([, lines], i) => `--- Chat ${i + 1} ---\n${lines.join('\n')}`)
      .join('\n\n')

    // ── Recent human decisions (what the brain is being corrected toward) ────
    const { data: leads } = await supabase
      .from('all_leads')
      .select('customer_name, unified_context')
      .eq('brand', brand)
      .limit(2000)

    const decisions: string[] = []
    for (const l of leads || []) {
      const log = (l as any).unified_context?.decision_log
      if (!Array.isArray(log)) continue
      for (const d of log) {
        const at = String(d.at || '')
        if (at < new Date(istMidnight).toISOString()) continue
        const ai = d.ai_proposed_plan?.action || 'none'
        const human = d.human_decision?.action || 'none'
        const matched = d.agreement?.matched ? 'agreed' : 'overrode'
        const reason = d.human_decision?.reason ? ` ("${d.human_decision.reason}")` : ''
        decisions.push(`${(l as any).customer_name || 'Lead'}: AI→${ai}, human ${matched}→${human}${reason}`)
      }
    }

    if (chatsAnalyzed === 0 && decisions.length === 0) {
      return NextResponse.json({
        chats_analyzed: 0,
        biggest_learning: null,
        understanding_shifts: [],
        objection_patterns: [],
        note: 'No chats or decisions logged today yet.',
      })
    }

    const systemPrompt = `You are PROXe Brain, reflecting on today's live conversations for the ${brand} sales agent.
From the chats and human decisions below, extract what the brain should LEARN — go beyond sequence timing. Look for: shifts in what leads actually want, recurring objections and what answered them, tone that landed, questions that stalled, where the AI proposal diverged from the human and why.

Return STRICT JSON only, no prose around it, in this exact shape:
{
  "biggest_learning": "<one sharp sentence — the single most important takeaway today>",
  "understanding_shifts": ["<3 to 5 bullets: concrete shifts in understanding of leads/what works>"],
  "objection_patterns": ["<0 to 4 bullets: objections seen today + the angle that worked, if any>"]
}
Be specific and grounded ONLY in the data. No invented figures. No em dashes.

TODAY (IST): ${istDate}
CHATS ANALYZED: ${chatsAnalyzed}

CONVERSATIONS:
${transcripts || '(none)'}

HUMAN DECISIONS TODAY:
${decisions.slice(0, 40).join('\n') || '(none)'}`

    let raw: string
    try {
      raw = await generateResponse(systemPrompt, 'Produce the JSON summary now.', 1024, BRAIN_REASONING_MODEL, 'brain')
    } catch (err: any) {
      console.error('[brain/learning-summary] model failed:', err?.message || err)
      return NextResponse.json({ error: 'The brain could not reflect right now. Try again.' }, { status: 502 })
    }

    // Parse the JSON out of the reply (tolerate code fences / stray text).
    let parsed: any = null
    const m = raw.match(/\{[\s\S]*\}/)
    try { parsed = JSON.parse(m ? m[0] : raw) } catch { /* fall through */ }
    if (!parsed || typeof parsed !== 'object') {
      return NextResponse.json({
        chats_analyzed: chatsAnalyzed,
        biggest_learning: raw.slice(0, 240),
        understanding_shifts: [],
        objection_patterns: [],
      })
    }

    return NextResponse.json({
      chats_analyzed: chatsAnalyzed,
      decisions_today: decisions.length,
      biggest_learning: typeof parsed.biggest_learning === 'string' ? parsed.biggest_learning : null,
      understanding_shifts: Array.isArray(parsed.understanding_shifts) ? parsed.understanding_shifts.slice(0, 5) : [],
      objection_patterns: Array.isArray(parsed.objection_patterns) ? parsed.objection_patterns.slice(0, 4) : [],
      generated_at: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[brain/learning-summary] Error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
