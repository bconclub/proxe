import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'
import { generateResponse } from '@/lib/agent-core'
import { BRAND_ID, getBrandConfig } from '@/configs'
import { buildLeadIndex, id8, parseActionsTrailer, validateActions, actionsPromptSpec } from '@/lib/brain/actions'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BRAIN_MODEL = 'claude-sonnet-4-6'

/**
 * POST /api/dashboard/brain
 *
 * The dashboard "brain" - a Q&A endpoint over the live dashboard data. Gathers
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

const TIERS = ['Contact', 'Voter', 'Supporter', 'Volunteer', 'Cadre']
const tierOf = (n: any) => TIERS[Math.max(0, Math.min(4, typeof n === 'number' ? n : 0))]

/**
 * Chat shortcuts (POP): a leading /command pulls that artifact's live slice;
 * @mentions look up a person/worker and what they've done. Everything is fetched
 * from the brand's own tables, so the answer stays guardrailed to real data.
 * Returns null when there's nothing to add (no command, no mentions, or non-pop).
 */
async function gatherCommandContext(sb: any, command: string | null, mentions: string[], istMidnight: number): Promise<any> {
  const ctx: any = {}
  const now = Date.now()
  const d7 = now - 7 * 86400000

  // ── /command → artifact summary ──
  if (command === 'warroom' || command === 'war' || command === 'wr') {
    const { data: rows } = await sb.from('vw_war_room_base').select('constituency, lean, loop_status, created_at').order('created_at', { ascending: false }).limit(4000)
    const R = rows || []
    const bySeat: Record<string, number> = {}; const lean: Record<string, number> = { supporter: 0, leaning: 0, undecided: 0, opposed: 0 }; let resolved = 0
    R.forEach((r: any) => { if (r.constituency) bySeat[r.constituency] = (bySeat[r.constituency] || 0) + 1; if (r.lean && lean[r.lean] !== undefined) lean[r.lean]++; if (r.loop_status === 'resolved') resolved++ })
    ctx.command = 'war_room'
    ctx.war_room = {
      active_seats: Object.keys(bySeat).length,
      top_constituencies: Object.entries(bySeat).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([constituency, count]) => ({ constituency, count })),
      lean_split: lean, loop_resolved: resolved, sampled: R.length,
    }
  } else if (['d2d', 'doortodoor', 'onground', 'ground', 'door'].includes(command || '')) {
    const { data: V } = await sb.from('d2d_visits').select('worker_name, constituency, outcome, created_at').order('created_at', { ascending: false }).limit(4000)
    const rows = V || []; const workers: Record<string, { visits: number; met: number }> = {}; const seats: Record<string, number> = {}; let met = 0, today = 0
    rows.forEach((v: any) => { if (v.outcome === 'met') met++; if (new Date(v.created_at).getTime() >= istMidnight) today++; if (v.worker_name) { const w = (workers[v.worker_name] ||= { visits: 0, met: 0 }); w.visits++; if (v.outcome === 'met') w.met++ } if (v.constituency) seats[v.constituency] = (seats[v.constituency] || 0) + 1 })
    ctx.command = 'd2d'
    ctx.d2d = {
      total_knocks: rows.length, met, today,
      top_workers: Object.entries(workers).sort((a, b) => b[1].visits - a[1].visits).slice(0, 5).map(([name, w]) => ({ name, visits: w.visits, met: w.met })),
      top_constituencies: Object.entries(seats).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([constituency, visits]) => ({ constituency, visits })),
    }
  } else if (command === 'listener' || command === 'listen') {
    const { data: S } = await sb.from('listen_signals').select('issue_category, is_crisis, is_opposition, is_positive, created_at').gte('created_at', new Date(d7).toISOString()).limit(2000)
    const rows = S || []; const cat: Record<string, number> = {}; let crisis = 0, opp = 0, pos = 0
    rows.forEach((s: any) => { if (s.issue_category) cat[s.issue_category] = (cat[s.issue_category] || 0) + 1; if (s.is_crisis) crisis++; if (s.is_opposition) opp++; if (s.is_positive) pos++ })
    ctx.command = 'listener'
    ctx.listener = { signals_7d: rows.length, crisis, opposition: opp, positive: pos, trending: Object.entries(cat).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([category, count]) => ({ category, count })) }
  } else if (['pulse', 'directives', 'feed'].includes(command || '')) {
    const { data: recos } = await sb.from('campaign_recommendations').select('title, source, constituency, status, created_at').order('created_at', { ascending: false }).limit(10)
    ctx.command = 'directives'
    ctx.directives = (recos || []).map((r: any) => ({ title: r.title, source: r.source, constituency: r.constituency, status: r.status }))
  } else if (command) {
    // Unknown command - tell the model so it can list the valid ones.
    ctx.command = 'unknown'
    ctx.unknown_command = command
    ctx.available_commands = ['/warroom', '/d2d', '/listener', '/directives']
  }

  // ── @mention → person / worker activity ──
  if (mentions.length) {
    ctx.mentions = []
    for (const name of mentions.slice(0, 4)) {
      const entry: any = { query: name }
      try {
        const { data: wv } = await sb.from('d2d_visits').select('worker_name, outcome, constituency, created_at').ilike('worker_name', `%${name}%`).order('created_at', { ascending: false }).limit(500)
        if (wv && wv.length) {
          entry.worker = {
            name: wv[0].worker_name, visits: wv.length,
            met: wv.filter((v: any) => v.outcome === 'met').length,
            constituencies: Array.from(new Set(wv.map((v: any) => v.constituency).filter(Boolean))).slice(0, 5),
            last_active: wv[0].created_at,
          }
        }
      } catch { /* d2d absent */ }
      try {
        const { data: lr } = await sb.from('all_leads').select('customer_name, intensity, grievance_category, lean, magnet, last_interaction_at').ilike('customer_name', `%${name}%`).limit(5)
        if (lr && lr.length) entry.people = lr.map((l: any) => ({ name: l.customer_name, tier: tierOf(l.intensity), grievance: l.grievance_category || null, lean: l.lean || null, channel: l.magnet || null }))
      } catch { /* pop columns absent */ }
      if (!entry.worker && !entry.people) entry.not_found = true
      ctx.mentions.push(entry)
    }
  }

  return (ctx.command || ctx.mentions) ? ctx : null
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
    const isPop = brand === 'pop'
    // Brain-drives-UI: when on, lead ids (short id8) ride in DATA so the model
    // can emit an ACTIONS trailer, validated server-side against the snapshot.
    const actionsOn = !!getBrandConfig().features?.brainActions
    // Intensity ladder labels (POP): all_leads.intensity 0-4.
    const TIER_LABELS = ['Contact', 'Voter', 'Supporter', 'Volunteer', 'Cadre']

    // IST day boundaries.
    const istDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) // YYYY-MM-DD
    const istMidnight = new Date(`${istDate}T00:00:00+05:30`).getTime()
    const weekStart = istMidnight - 6 * 86400000
    const now = Date.now()

    // ── Gather leads (aggregate in-process) ──────────────────────────────────
    const { data: leads } = await supabase
      .from('all_leads')
      // POP campaign columns (022/026) exist only for pop - append conditionally
      // so other brands' schemas don't error on the select.
      .select('id, customer_name, phone, lead_score, lead_stage, first_touchpoint, last_touchpoint, created_at, last_interaction_at, unified_context'
        + (isPop ? ', intensity, grievance_category, magnet, lean' : ''))
      .eq('brand', brand)
      .order('created_at', { ascending: false })
      .limit(2000)

    const safe = leads || []
    const byStage: Record<string, number> = {}
    const bySource: Record<string, number> = {}
    let today = 0, week = 0, hot = 0, warm = 0, cold = 0
    const todayLeads: any[] = []
    const upcoming: any[] = []
    // POP campaign accumulators - the intensity ladder + grievances + channel,
    // so the brain answers in campaign terms, not sales lead_stage names.
    const tierCounts = [0, 0, 0, 0, 0]
    const grievanceCounts: Record<string, number> = {}
    const channelCounts: Record<string, number> = {}

    for (const l of safe) {
      const created = l.created_at ? new Date(l.created_at).getTime() : 0
      const stage = l.lead_stage || 'New'
      byStage[stage] = (byStage[stage] || 0) + 1
      const src = l.first_touchpoint || l.last_touchpoint || 'unknown'
      bySource[src] = (bySource[src] || 0) + 1
      const score = l.lead_score ?? null
      if (score != null) { if (score >= 70) hot++; else if (score >= 40) warm++; else cold++ }
      if (isPop) {
        const t = typeof l.intensity === 'number' ? l.intensity : 0
        if (t >= 0 && t <= 4) tierCounts[t]++
        if (l.grievance_category) grievanceCounts[l.grievance_category] = (grievanceCounts[l.grievance_category] || 0) + 1
        const ch = l.magnet || src
        channelCounts[ch] = (channelCounts[ch] || 0) + 1
      }
      if (created >= istMidnight) {
        today++
        if (todayLeads.length < 40) todayLeads.push(isPop
          ? { ...(actionsOn ? { id: id8(l.id) } : {}), name: l.customer_name || 'Unknown', channel: l.magnet || src, tier: TIER_LABELS[Math.max(0, Math.min(4, l.intensity ?? 0))], grievance: l.grievance_category || null }
          : { ...(actionsOn ? { id: id8(l.id) } : {}), name: l.customer_name || 'Unknown', source: src, score, stage })
      }
      if (created >= weekStart) week++
      const b = bookingFromCtx(l.unified_context)
      const dt = parseBookingIST(b.date, b.time)
      if (dt && dt.getTime() >= now) {
        // Pass a human IST string - NOT a UTC ISO. The model was reading the UTC
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

    // ── Top leads by score (actions only) - makes "show me the top lead"
    // resolvable: the model needs a ranked list WITH ids to point at. ─────────
    const topLeads = actionsOn
      ? [...safe]
          .filter((l: any) => l.lead_score != null)
          .sort((a: any, b: any) => (b.lead_score ?? 0) - (a.lead_score ?? 0))
          .slice(0, 10)
          .map((l: any) => isPop
            ? { id: id8(l.id), name: l.customer_name || 'Unknown', score: l.lead_score, tier: tierOf(l.intensity) }
            : { id: id8(l.id), name: l.customer_name || 'Unknown', score: l.lead_score, stage: l.lead_stage || 'New' })
      : []

    // ── Today's stage changes ────────────────────────────────────────────────
    const { data: changes } = await supabase
      .from('lead_stage_changes')
      .select('lead_id, old_stage, new_stage, new_score, created_at')
      .gte('created_at', new Date(istMidnight).toISOString())
      .order('created_at', { ascending: false })
      .limit(60)
    const changeNames = new Map(safe.map((l: any) => [l.id, l.customer_name || 'Unknown']))
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

    const intensity_ladder: Record<string, number> = {}
    TIER_LABELS.forEach((lbl, i) => { intensity_ladder[lbl] = tierCounts[i] })

    // Chat shortcuts: a leading /command and/or @mentions. POP-only for now (the
    // commands map to POP artifacts + tables).
    const cmdMatch = question.match(/^\s*\/([a-zA-Z]+)/)
    const command = cmdMatch ? cmdMatch[1].toLowerCase() : null
    // Single token after @ (no spaces) so we don't swallow trailing sentence
    // words; an ilike '%token%' still matches full names by their first word.
    const mentions = (question.match(/@[A-Za-z][A-Za-z'’-]{0,30}/g) || [])
      .map((s: string) => s.slice(1).replace(/[.'’-]+$/, '').trim())
      .filter(Boolean)
    let command_context: any = null
    if (isPop && (command || mentions.length)) {
      try { command_context = await gatherCommandContext(supabase, command, mentions, istMidnight) }
      catch (e) { console.error('[brain] command context:', (e as Error).message) }
    }

    // POP gets a campaign-shaped snapshot (ladder + grievances + channels); every
    // other brand keeps the sales-shaped one (pipeline stages + sources). The
    // model can only speak from what's in DATA, so the shape IS the guardrail.
    const data = isPop ? {
      brand,
      today_ist: istDate,
      totals: { all_time: safe.length, today, last_7_days: week },
      intensity_ladder,
      top_grievances: grievanceCounts,
      by_channel: channelCounts,
      engagement_heat: { high_70plus: hot, medium_40to69: warm, low_under40: cold },
      conversations_today: convToday ?? 0,
      todays_new_people: todayLeads,
      upcoming_events: upcomingTop,
      ...(actionsOn && topLeads.length ? { most_engaged_people: topLeads } : {}),
      ...(command_context ? { command_context } : {}),
    } : {
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
      ...(actionsOn && topLeads.length ? { top_leads: topLeads } : {}),
    }
    const systemPrompt = `You are PROXe Brain - the analyst for the ${brand} ${isPop ? 'campaign dashboard' : 'sales dashboard'}.
${isPop ? 'This is a political campaign. Use campaign vocabulary ONLY: people / voters / supporters / volunteers / cadre / grievances / constituencies / events - NEVER sales terms (leads, pipeline, deals, bookings, customers, prospects, stages like "Qualified" or "Booking Made"). The DATA JSON is already campaign-shaped: intensity_ladder is the frontline funnel (Contact→Voter→Supporter→Volunteer→Cadre); top_grievances is issues raised by category; by_channel is how people were reached; engagement_heat is how active they are; upcoming_events is the event calendar. Answer strictly from these fields - do not invent sales stages.\n' : ''}Answer the operator's question using ONLY the DATA JSON below. Be concise and lead with the number/answer. Use plain language, short. If the question asks for something not present in DATA, say you don't have that yet - do not invent figures. Today (IST) is ${istDate}.

Times in DATA (e.g. upcoming_bookings "when") are already formatted IST strings - show them EXACTLY as given. Never convert, recompute, or restate a time in a different value.

FORMAT (built for a phone-sized panel, ~360px wide):
- For ANY numeric breakdown (counts by stage / source / score bucket, all-time splits) use a COMPACT markdown table: a header row + 2-3 columns max (e.g. "| Stage | Count |"). It renders as a clean table - always prefer this over listing numbers in prose.
- Keep prose to 1-2 short lines around each table. Use **bold** for standout numbers/names. Use "- " bullets only for non-numeric lists (e.g. lead names).
- No "---" divider lines, no "###" headings, no long paragraphs. Skimmable, not a report.

SHORTCUTS: if DATA has a "command_context", the operator used a shortcut. A leading /command (command_context.command = war_room / d2d / listener / directives) means "summarize that artifact" - answer from command_context.<that> and lead with the headline number. If command_context.command = "unknown", tell them the command isn't recognized and list command_context.available_commands. @mentions (command_context.mentions[]) ask about specific people/workers: for each, report what they've done from .worker (visits/met/constituencies/last_active) and/or .people (tier/grievance/lean/channel); if .not_found is true, say you couldn't find anyone by that name. Show names and times exactly as given.

This is a click-through tool - the founder taps follow-ups instead of typing. After your answer, output ONE final line starting with "FOLLOWUPS:" then 2-3 short next questions (under 6 words each) separated by " | ", each a natural drill-down from your answer and answerable from DATA. Examples: ${isPop ? '"Breakdown by constituency | Frontline today | Top grievances"' : '"Breakdown by source | Lead quality today | Show hot leads"'}. Put FOLLOWUPS only on that last line, nowhere else.
${actionsOn ? `\n${actionsPromptSpec(false)}\n` : ''}
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

    // Strip the ACTIONS trailer FIRST - the FOLLOWUPS regex below matches
    // across newlines and would swallow a trailing ACTIONS line into the chips.
    const parsedActions = actionsOn ? parseActionsTrailer(raw) : { text: raw, actions: [] }
    const actions = actionsOn ? validateActions(parsedActions.actions, buildLeadIndex(safe)) : []

    // Split the answer from the trailing "FOLLOWUPS: a | b | c" line.
    let answer = parsedActions.text
    let followups: string[] = []
    const fm = answer.match(/FOLLOWUPS:\s*(.+)\s*$/is)
    if (fm) {
      followups = fm[1].split('|').map((s) => s.trim()).filter(Boolean).slice(0, 3)
      answer = answer.slice(0, fm.index).trim()
    }

    return NextResponse.json({ success: true, answer, followups, actions, data_summary: { today, all_time: safe.length, upcoming: upcomingTop.length } })
  } catch (error: any) {
    console.error('[brain] Error:', error?.message || error)
    return NextResponse.json({ error: 'Failed to answer' }, { status: 500 })
  }
}
