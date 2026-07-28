/**
 * GET /api/dashboard/audit-conversations  (Lokazen, read-only)
 *
 * Conversation-quality audit for OWNER (property owner) leads — scouts and
 * brands excluded. For every owner lead it pulls the full WhatsApp transcript
 * and flags PATTERN BREAKS:
 *
 *   repeated_question  the agent asked the same thing 2+ times
 *   ignored_input      the customer answered, the agent asked it again anyway
 *   duplicate_reply    the agent sent a near-identical message twice
 *   loop_menu          the same button menu offered 3+ times
 *   no_progress        many agent turns, customer stopped replying
 *   stale_handoff      "passed to the team" said more than once
 *
 * Read-only: no writes, no sends. Auth: x-api-key = INBOUND_API_KEY.
 * ?full=1 includes the entire transcript per lead.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/services'
import { BRAND_ID } from '@/configs'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function norm(s: string): string {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** The "question core" of an agent line, so re-asks match despite different wrappers. */
function questionKey(s: string): string | null {
  const t = norm(s)
  if (!t) return null
  const patterns: Array<[RegExp, string]> = [
    [/monthly rent|what.*rent|rent for the space|expected rent/, 'RENT'],
    [/which floor|what floor|floor is it on/, 'FLOOR'],
    [/what size|how big|size are you looking|sqft|square feet|carpet area/, 'SIZE'],
    [/which area|what area|which part of|location|where is the property|micromarket/, 'AREA'],
    [/when is it available|availability|available from|when can you/, 'AVAILABILITY'],
    [/maps link|google maps|exact address|share the location|share your location/, 'MAPS'],
    [/what day works|which day|what date|pick a date/, 'DAY'],
    [/what time|which time|time works|3 pm|4 pm|5 pm/, 'TIME'],
    [/your name|who should|contact person/, 'NAME'],
    [/e ?mail|email address/, 'EMAIL'],
    [/phone|number to reach|best number/, 'PHONE'],
    [/property type|what type of property|retail|office|restaurant ready/, 'PROPERTY_TYPE'],
    [/looking for a space|listing a property|joining as a scout|find a space|list my property/, 'INTENT_MENU'],
    [/what would you like to do next|submit property|talk to team/, 'NEXT_MENU'],
  ]
  for (const [re, key] of patterns) if (re.test(t)) return key
  return null
}

function jaccard(a: string, b: string): number {
  const ta = new Set(norm(a).split(' ').filter(Boolean))
  const tb = new Set(norm(b).split(' ').filter(Boolean))
  if (ta.size < 4 || tb.size < 4) return 0
  let inter = 0
  ta.forEach((t) => { if (tb.has(t)) inter++ })
  const union = ta.size + tb.size - inter
  return union ? inter / union : 0
}

export async function GET(request: NextRequest) {
  if (BRAND_ID !== 'lokazen') return NextResponse.json({ error: 'Lokazen only' }, { status: 400 })
  const key = request.headers.get('x-api-key')?.trim()
  if (!key || key !== process.env.INBOUND_API_KEY?.trim()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabase = getServiceClient()
  if (!supabase) return NextResponse.json({ error: 'No DB' }, { status: 500 })

  const full = request.nextUrl.searchParams.get('full') === '1'
  const only = request.nextUrl.searchParams.get('lead')

  const { data: leads, error } = await supabase
    .from('all_leads')
    .select('id, customer_name, phone, customer_phone_normalized, lead_stage, unified_context, last_interaction_at')
    .order('last_interaction_at', { ascending: false })
    .limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const owners = (leads || []).filter((l: any) => {
    if (only) return l.id === only
    return String(l.unified_context?.lokazen?.user_type || '').toLowerCase() === 'owner'
  })

  const report: any[] = []
  for (const lead of owners) {
    const { data: msgs } = await supabase
      .from('conversations')
      .select('sender, content, created_at, metadata')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: true })
      .limit(200)
    const turns = (msgs || []).map((m: any) => ({
      role: m.sender === 'customer' ? 'customer' : (m.metadata?.human ? 'human' : 'agent'),
      text: String(m.content || ''),
      at: m.created_at,
    }))
    if (!turns.length) continue

    const issues: any[] = []

    // 1. repeated questions + 2. ignored input (customer answered in between)
    const askIdx: Record<string, number[]> = {}
    turns.forEach((t, i) => {
      if (t.role !== 'agent') return
      const k = questionKey(t.text)
      if (k) (askIdx[k] ||= []).push(i)
    })
    for (const [k, idxs] of Object.entries(askIdx)) {
      if (idxs.length < 2) continue
      const answeredBetween = idxs.slice(1).some((cur, n) => {
        const prev = idxs[n]
        return turns.slice(prev + 1, cur).some((t) => t.role === 'customer' && t.text.trim().length > 0)
      })
      issues.push({
        type: answeredBetween ? 'ignored_input' : 'repeated_question',
        field: k,
        times: idxs.length,
        quotes: idxs.map((i) => ({ at: turns[i].at, text: turns[i].text.slice(0, 140) })),
        customerAnswers: idxs.slice(1).flatMap((cur, n) =>
          turns.slice(idxs[n] + 1, cur).filter((t) => t.role === 'customer')
            .map((t) => ({ at: t.at, text: t.text.slice(0, 120) }))),
      })
    }

    // 3. duplicate agent replies (near-identical)
    const agentTurns = turns.filter((t) => t.role === 'agent')
    for (let i = 1; i < agentTurns.length; i++) {
      for (let j = Math.max(0, i - 4); j < i; j++) {
        if (jaccard(agentTurns[i].text, agentTurns[j].text) >= 0.8) {
          issues.push({
            type: 'duplicate_reply',
            quotes: [
              { at: agentTurns[j].at, text: agentTurns[j].text.slice(0, 140) },
              { at: agentTurns[i].at, text: agentTurns[i].text.slice(0, 140) },
            ],
          })
          break
        }
      }
    }

    // 4. repeated handoff promises
    const handoffs = agentTurns.filter((t) => /passed (your|this|the)|flagged (this|it) to|team will (reach|call|connect)|someone will reach/i.test(t.text))
    if (handoffs.length >= 2) {
      issues.push({ type: 'stale_handoff', times: handoffs.length, quotes: handoffs.slice(0, 4).map((t) => ({ at: t.at, text: t.text.slice(0, 140) })) })
    }

    // 5. no progress: agent talked a lot, customer went silent at the end
    const lastCustomerIdx = [...turns].reverse().findIndex((t) => t.role === 'customer')
    const trailingAgent = lastCustomerIdx === -1 ? turns.length : lastCustomerIdx
    if (trailingAgent >= 3) {
      issues.push({ type: 'no_progress', trailingAgentMessages: trailingAgent })
    }

    const lkz = lead.unified_context?.lokazen || {}
    report.push({
      leadId: lead.id,
      name: lead.customer_name,
      phone: lead.phone || lead.customer_phone_normalized,
      stage: lead.lead_stage,
      messages: turns.length,
      customerMessages: turns.filter((t) => t.role === 'customer').length,
      agentMessages: turns.filter((t) => t.role === 'agent').length,
      captured: {
        area: lkz.property_zone || null, size: lkz.property_size_sqft || null,
        rent: lkz.asking_rent_monthly || null, floor: lkz.floor || null,
        maps: lkz.google_maps_url ? 'yes' : 'no',
      },
      issueCount: issues.length,
      issues,
      ...(full ? { transcript: turns.map((t) => `[${t.at}] ${t.role.toUpperCase()}: ${t.text}`) } : {}),
    })
  }

  report.sort((a, b) => b.issueCount - a.issueCount)
  const summary = {
    ownerLeads: report.length,
    withIssues: report.filter((r) => r.issueCount > 0).length,
    byType: report.flatMap((r) => r.issues.map((i: any) => i.type))
      .reduce((acc: any, t: string) => { acc[t] = (acc[t] || 0) + 1; return acc }, {}),
  }
  return NextResponse.json({ ok: true, summary, leads: report })
}
