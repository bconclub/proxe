import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'
import { generateResponse } from '@/lib/agent-core'
import { BRAND_ID } from '@/configs'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BRAIN_MODEL = 'claude-sonnet-4-6'

/**
 * POST /api/dashboard/brain
 *
 * The dashboard "brain" — a Q&A endpoint over the live dashboard data. Gathers
 * compact aggregates (lead counts, pipeline, today's activity, upcoming
 * bookings) and asks Sonnet 4.6 to answer the operator's question from that
 * snapshot. Read-only; answers strictly from the data we pass in.
 *
 * Body: { question: string, history?: {role:'user'|'assistant',content:string}[] }
 */

// Parse a stored booking date/time into an absolute instant (IST), or null.
function parseBookingIST(date: any, time: any): Date | null {
  if (!date) return null
  let hhmm = '12:00'
  const t = String(time || '').trim()
  const ampm = t.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i)
  if (ampm) {
    let h = parseInt(ampm[1], 10) % 12
    if (/p/i.test(ampm[3])) h += 12
    hhmm = `${String(h).padStart(2, '0')}:${ampm[2] || '00'}`
  } else if (/^\d{1,2}:\d{2}/.test(t)) {
    hhmm = t.slice(0, 5)
  }
  const d = new Date(`${String(date).slice(0, 10)}T${hhmm}:00+05:30`)
  return isNaN(d.getTime()) ? null : d
}

function bookingFromCtx(uc: any): { date: string | null; time: string | null } {
  const c = uc || {}
  for (const ch of ['web', 'whatsapp', 'voice', 'social']) {
    const b = c[ch] || {}
    const date = b.booking_date || b.booking?.date
    if (date) return { date, time: b.booking_time || b.booking?.time || null }
  }
  return { date: null, time: null }
}

export async function POST(request: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const question = typeof body?.question === 'string' ? body.question.trim() : ''
    if (!question) {
      return NextResponse.json({ error: 'Missing question' }, { status: 400 })
    }
    const history: Array<{ role: string; content: string }> = Array.isArray(body?.history)
      ? body.history.slice(-6)
      : []

    const supabase = getServiceClient() || authClient
    const brand = BRAND_ID

    // IST day boundaries.
    const istDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) // YYYY-MM-DD
    const istMidnight = new Date(`${istDate}T00:00:00+05:30`).getTime()
    const weekStart = istMidnight - 6 * 86400000
    const now = Date.now()

    // ── Gather leads (aggregate in-process) ──────────────────────────────────
    const { data: leads } = await supabase
      .from('all_leads')
      .select('id, customer_name, lead_score, lead_stage, first_touchpoint, last_touchpoint, created_at, last_interaction_at, unified_context')
      .eq('brand', brand)
      .order('created_at', { ascending: false })
      .limit(2000)

    const safe = leads || []
    const byStage: Record<string, number> = {}
    const bySource: Record<string, number> = {}
    let today = 0, week = 0, hot = 0, warm = 0, cold = 0
    const todayLeads: any[] = []
    const upcoming: any[] = []

    for (const l of safe) {
      const created = l.created_at ? new Date(l.created_at).getTime() : 0
      const stage = l.lead_stage || 'New'
      byStage[stage] = (byStage[stage] || 0) + 1
      const src = l.first_touchpoint || l.last_touchpoint || 'unknown'
      bySource[src] = (bySource[src] || 0) + 1
      const score = l.lead_score ?? null
      if (score != null) { if (score >= 70) hot++; else if (score >= 40) warm++; else cold++ }
      if (created >= istMidnight) {
        today++
        if (todayLeads.length < 40) todayLeads.push({ name: l.customer_name || 'Unknown', source: src, score, stage })
      }
      if (created >= weekStart) week++
      const b = bookingFromCtx(l.unified_context)
      const dt = parseBookingIST(b.date, b.time)
      if (dt && dt.getTime() >= now) {
        // Pass a human IST string — NOT a UTC ISO. The model was reading the UTC
        // hour as IST (4:00 PM IST = 10:30 UTC → "10:30 AM IST"), so every
        // upcoming time was wrong. Format in IST here so it can't be misread.
        const when = dt.toLocaleString('en-IN', {
          weekday: 'short', day: 'numeric', month: 'short',
          hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
        }) + ' IST'
        upcoming.push({ name: l.customer_name || 'Unknown', when, _ms: dt.getTime() })
      }
    }
    upcoming.sort((a, b) => a._ms - b._ms)
    const upcomingTop = upcoming.slice(0, 25).map(({ _ms, ...rest }) => rest)

    // ── Today's stage changes ────────────────────────────────────────────────
    const { data: changes } = await supabase
      .from('lead_stage_changes')
      .select('lead_id, old_stage, new_stage, new_score, created_at')
      .gte('created_at', new Date(istMidnight).toISOString())
      .order('created_at', { ascending: false })
      .limit(60)
    const changeNames = new Map(safe.map((l) => [l.id, l.customer_name || 'Unknown']))
    const todayActivity = (changes || []).slice(0, 40).map((c: any) => ({
      name: changeNames.get(c.lead_id) || 'Unknown',
      from: c.old_stage || null,
      to: c.new_stage,
      score: c.new_score ?? null,
    }))

    // ── Conversations today (count) ──────────────────────────────────────────
    const { count: convToday } = await supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', new Date(istMidnight).toISOString())

    const data = {
      brand,
      today_ist: istDate,
      totals: { all_time: safe.length, today, last_7_days: week },
      score_buckets: { hot_70plus: hot, warm_40to69: warm, cold_under40: cold },
      pipeline_by_stage: byStage,
      leads_by_source: bySource,
      conversations_today: convToday ?? 0,
      todays_new_leads: todayLeads,
      todays_status_changes: todayActivity,
      upcoming_bookings: upcomingTop,
    }

    const isPop = BRAND_ID === 'pop'
    const systemPrompt = `You are PROXe Brain — the analyst for the ${brand} ${isPop ? 'campaign dashboard' : 'sales dashboard'}.
${isPop ? 'Use campaign vocabulary throughout: people / voters / supporters / volunteers / cadre / grievances / constituencies / events — never sales terms (leads, pipeline, deals, bookings, customers, prospects). In the DATA JSON, "leads" = people/voters, "pipeline_by_stage" = the intensity ladder, "leads_by_source" = where people came in via, "upcoming_bookings" = upcoming events / callbacks.\n' : ''}Answer the operator's question using ONLY the DATA JSON below. Be concise and lead with the number/answer. Use plain language, short. If the question asks for something not present in DATA, say you don't have that yet — do not invent figures. Today (IST) is ${istDate}.

Times in DATA (e.g. upcoming_bookings "when") are already formatted IST strings — show them EXACTLY as given. Never convert, recompute, or restate a time in a different value.

FORMAT (built for a phone-sized panel, ~360px wide):
- For ANY numeric breakdown (counts by stage / source / score bucket, all-time splits) use a COMPACT markdown table: a header row + 2-3 columns max (e.g. "| Stage | Count |"). It renders as a clean table — always prefer this over listing numbers in prose.
- Keep prose to 1-2 short lines around each table. Use **bold** for standout numbers/names. Use "- " bullets only for non-numeric lists (e.g. lead names).
- No "---" divider lines, no "###" headings, no long paragraphs. Skimmable, not a report.

This is a click-through tool — the founder taps follow-ups instead of typing. After your answer, output ONE final line starting with "FOLLOWUPS:" then 2-3 short next questions (under 6 words each) separated by " | ", each a natural drill-down from your answer and answerable from DATA. Examples: ${isPop ? '"Breakdown by constituency | Frontline today | Top grievances"' : '"Breakdown by source | Lead quality today | Show hot leads"'}. Put FOLLOWUPS only on that last line, nowhere else.

DATA:
${JSON.stringify(data)}`

    const transcript = history
      .map((h) => `${h.role === 'assistant' ? 'Brain' : 'Operator'}: ${h.content}`)
      .join('\n')
    const userPrompt = transcript ? `${transcript}\nOperator: ${question}` : question

    let raw: string
    try {
      raw = await generateResponse(systemPrompt, userPrompt, 1024, BRAIN_MODEL, 'brain')
    } catch (err: any) {
      console.error('[brain] model call failed:', err?.message || err)
      return NextResponse.json({ error: 'The brain is unavailable right now. Try again in a moment.' }, { status: 502 })
    }

    // Split the answer from the trailing "FOLLOWUPS: a | b | c" line.
    let answer = raw
    let followups: string[] = []
    const fm = raw.match(/FOLLOWUPS:\s*(.+)\s*$/is)
    if (fm) {
      answer = raw.slice(0, fm.index).trim()
      followups = fm[1].split('|').map((s) => s.trim()).filter(Boolean).slice(0, 3)
    }

    return NextResponse.json({ success: true, answer, followups, data_summary: { today, all_time: safe.length, upcoming: upcomingTop.length } })
  } catch (error: any) {
    console.error('[brain] Error:', error?.message || error)
    return NextResponse.json({ error: 'Failed to answer' }, { status: 500 })
  }
}
