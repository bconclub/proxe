/**
 * Cron: stale conversation watchdog
 * GET /api/cron/stale-conversations
 *
 * WHY THIS EXISTS
 * When a teammate replies to a lead from the dashboard inbox (or from Slack),
 * the lead is stamped `metadata.human_takeover_at` and the bot goes SILENT on
 * that lead for 24 hours so it never talks over a colleague. That is correct
 * on its own, but nothing was watching the other side of it: if the human then
 * did not come back, the customer's next message hit a wall.
 *
 * Measured on Lokazen over 14 days (to 08 Aug 2026): 29 customer messages went
 * unanswered for 10 minutes or more, and 27 of those were under an active human
 * takeover. Four were never answered at all. Sarvesh waited 65 hours for "Any
 * update on other 3 properties i submitted?". Mithun's "you can call now" got
 * no reply, ever.
 *
 * So: every run, find leads whose newest message is FROM THE CUSTOMER and has
 * gone unanswered past the threshold, and ping the team on Slack. This is the
 * only scheduled job that watches conversation health - there is no worker
 * process anywhere else doing it.
 *
 * IDEMPOTENCY
 * Alerts are keyed to the specific unanswered message id and recorded on the
 * lead (`metadata.stale_alert_for_message`), so a lead that stays stale across
 * many runs is announced ONCE. A newer unanswered message re-arms it.
 *
 * GATING
 * Opt-in per brand via `features.staleConversationAlerts`. Off everywhere it is
 * not explicitly enabled, so enabling it on Lokazen cannot page another brand's
 * team.
 *
 * Schedule: every 30 minutes (core/vercel.json), Bearer CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/services'
import { sendSlackMessage, slackMention } from '@/lib/services/slackNotifier'
import { BRAND_ID, brandConfig } from '@/configs'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Alert once a customer message has gone unanswered this long. */
const STALE_AFTER_MS = 2 * 60 * 60 * 1000 // 2 hours
/**
 * Ignore anything older than this. A message that has been sitting for three
 * days is a triage problem, not a fresh alert, and back-filling them all on the
 * first run would dump dozens of pings into the channel at once.
 */
const MAX_AGE_MS = 24 * 60 * 60 * 1000

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || ''

function humanAge(ms: number): string {
  const h = Math.floor(ms / 3_600_000)
  const m = Math.round((ms % 3_600_000) / 60_000)
  if (h <= 0) return `${m}m`
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!brandConfig.features?.staleConversationAlerts) {
    return NextResponse.json({ skipped: 'feature disabled', brand: BRAND_ID })
  }

  const supabase = getServiceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'No service client' }, { status: 500 })
  }

  const now = Date.now()
  const since = new Date(now - MAX_AGE_MS - 60 * 60 * 1000).toISOString()

  // One pass over recent traffic. Volume is small (a few hundred rows), so
  // grouping in memory beats a query per lead.
  const { data: msgs, error } = await supabase
    .from('conversations')
    .select('id, lead_id, sender, content, created_at, metadata')
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(4000)

  if (error) {
    console.error('[stale-conversations] query failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const byLead = new Map<string, typeof msgs>()
  for (const m of msgs || []) {
    if (!m.lead_id) continue
    if (!byLead.has(m.lead_id)) byLead.set(m.lead_id, [])
    byLead.get(m.lead_id)!.push(m)
  }

  // Leads whose LAST message is an unanswered customer message in the window.
  const candidates: Array<{ leadId: string; msg: any; ageMs: number }> = []
  for (const [leadId, rows] of byLead) {
    const last = rows[rows.length - 1]
    if (!last || last.sender !== 'customer') continue
    const ageMs = now - new Date(last.created_at).getTime()
    if (ageMs < STALE_AFTER_MS || ageMs > MAX_AGE_MS) continue
    candidates.push({ leadId, msg: last, ageMs })
  }

  if (!candidates.length) {
    return NextResponse.json({ checked: byLead.size, stale: 0, alerted: 0 })
  }

  const { data: leads } = await supabase
    .from('all_leads')
    .select('id, customer_name, phone, metadata, unified_context')
    .in('id', candidates.map((c) => c.leadId))
  const leadMap = new Map((leads || []).map((l) => [l.id, l]))

  let alerted = 0
  const skipped: string[] = []

  for (const c of candidates.sort((a, b) => b.ageMs - a.ageMs)) {
    const lead = leadMap.get(c.leadId)
    if (!lead) continue

    const meta = (lead.metadata || {}) as Record<string, any>
    // Already announced THIS message - stay quiet.
    if (meta.stale_alert_for_message === c.msg.id) {
      skipped.push(c.leadId)
      continue
    }

    const ctx = (lead.unified_context as any)?.[BRAND_ID] || {}
    const audience = ctx.user_type || ctx.lead_type || 'lead'
    const takeoverAt = meta.human_takeover_at ? new Date(meta.human_takeover_at).getTime() : null
    const underTakeover = !!takeoverAt && now - takeoverAt < 24 * 60 * 60 * 1000
    const takeoverBy = meta.human_takeover_by || null

    // Amber for a bot-side gap, red once a teammate had explicitly taken the
    // lead over and then went quiet - that one is a promise we broke.
    const color = underTakeover ? '#D93F0B' : '#E3B341'
    const who = String(lead.customer_name || lead.phone || 'Unknown').trim()
    const preview = String(c.msg.content || '').replace(/\s+/g, ' ').slice(0, 180)
    const leadUrl = APP_URL ? `${APP_URL}/dashboard/inbox?lead=${c.leadId}` : null

    const headline = underTakeover
      ? `No reply for ${humanAge(c.ageMs)} after a teammate took this over`
      : `No reply for ${humanAge(c.ageMs)}`

    const mention = slackMention()
    const blocks: unknown[] = [
      { type: 'section', text: { type: 'mrkdwn', text: `*${headline}*` } },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Who*\n${who}` },
          { type: 'mrkdwn', text: `*Type*\n${String(audience)}` },
          { type: 'mrkdwn', text: `*Waiting*\n${humanAge(c.ageMs)}` },
          { type: 'mrkdwn', text: `*Taken over by*\n${takeoverBy ? String(takeoverBy) : 'nobody'}` },
        ],
      },
      { type: 'section', text: { type: 'mrkdwn', text: `*Their last message*\n>${preview || '(no text)'}` } },
    ]
    if (leadUrl) {
      blocks.push({
        type: 'actions',
        elements: [
          { type: 'button', text: { type: 'plain_text', text: 'Open conversation' }, url: leadUrl, style: 'primary' },
        ],
      })
    }

    const res = await sendSlackMessage({
      text: `${mention ? mention + ' ' : ''}${who} has been waiting ${humanAge(c.ageMs)} for a reply`.trim(),
      attachments: [{ color, blocks }],
    })

    if (res.success) {
      alerted++
      await supabase
        .from('all_leads')
        .update({ metadata: { ...meta, stale_alert_for_message: c.msg.id, stale_alert_sent_at: new Date().toISOString() } })
        .eq('id', c.leadId)
      console.log(`[stale-conversations] alerted lead=${c.leadId} waiting=${humanAge(c.ageMs)} takeover=${underTakeover}`)
    } else if (!res.skipped) {
      console.error(`[stale-conversations] slack send failed for lead=${c.leadId}: ${res.error}`)
    }
  }

  return NextResponse.json({
    checked: byLead.size,
    stale: candidates.length,
    alerted,
    alreadyAnnounced: skipped.length,
  })
}
