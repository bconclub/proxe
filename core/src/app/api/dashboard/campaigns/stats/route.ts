/**
 * Campaign stats — GET live delivery metrics for campaigns that were actually
 * SENT (as opposed to the planned campaigns in the builder store).
 *
 * Derived entirely from the `conversations` log — no separate table. A send is
 * an agent template row tagged with `metadata.campaign`; delivered/read come
 * from `metadata.delivery_status` (stamped by the Meta status webhook, matched
 * on wa_message_id); clicked counts recipients who tapped a quick-reply button
 * (inbound `trigger_kind` button/interactive_button). URL-button taps (e.g.
 * "Complete Registration") are NOT reported by Meta, so they can't be counted.
 */

import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/services'

export const dynamic = 'force-dynamic'

const SEND_LABELS: Record<string, string> = {
  webinar_reminder: 'Reminder',
  webinar_starting_soon: 'Starting soon',
  webinar_live: 'Live now',
  webinar_register_nudge: 'Registration nudge',
  webinar_thankyou: 'Thank you',
}

// Who each send targets — surfaced as the card's subtext.
const SEND_AUDIENCE: Record<string, string> = {
  webinar_reminder: 'registered leads',
  webinar_starting_soon: 'registered leads',
  webinar_live: 'registered leads',
  webinar_register_nudge: 'not-yet-registered leads',
  webinar_thankyou: 'webinar attendees',
}

export async function GET() {
  const sb = getServiceClient()
  if (!sb) return NextResponse.json({ campaigns: [] })

  // Every agent template row, newest first; keep only the campaign-tagged ones.
  // (Filtering the JSON tag in JS is more robust than a PostgREST json `not.is`
  // filter, which silently returned nothing here.)
  const { data: sends } = await sb
    .from('conversations')
    .select('lead_id, metadata, created_at')
    .eq('sender', 'agent')
    .eq('message_type', 'template')
    .order('created_at', { ascending: false })
    .limit(8000)

  const rows = (sends || []).filter((r: any) => r.metadata && r.metadata.campaign)
  if (!rows.length) return NextResponse.json({ campaigns: [] })

  // Per-lead template send timeline (for click attribution). Each entry is a
  // template a lead received and when. Built from the campaign sends only.
  const sendTimeline: Record<string, Array<{ tpl: string; t: number }>> = {}
  for (const r of rows) {
    if (!r.lead_id) continue
    const m: any = r.metadata || {}
    const tpl = String(m.template_name || m.source || 'send')
    ;(sendTimeline[r.lead_id] = sendTimeline[r.lead_id] || []).push({ tpl, t: new Date(r.created_at).getTime() })
  }
  for (const id in sendTimeline) sendTimeline[id].sort((a, b) => a.t - b.t)

  // Clicks: a quick-reply tap (or inbound button) is attributed to the template
  // the lead LAST received before the tap. So a "Join WhatsApp Group" tap counts
  // for the reminder that carried the button, not for every template the lead
  // ever got. Two signals: (a) inbound customer button/interactive taps; (b) the
  // bot's deterministic quick-reply replies (`quick_reply_trigger`) — the group
  // tap is answered before it lands as an inbound row, so (b) is its only record.
  const clickedByTpl: Record<string, Set<string>> = {}
  const { data: engagement } = await sb
    .from('conversations')
    .select('lead_id, sender, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(12000)
  for (const e of engagement || []) {
    const m: any = e.metadata || {}
    const tapped = !!m.quick_reply_trigger || (e.sender === 'customer' && (m.trigger_kind === 'button' || m.trigger_kind === 'interactive_button'))
    if (!tapped || !e.lead_id) continue
    const tl = sendTimeline[e.lead_id]
    if (!tl) continue
    const tapT = new Date(e.created_at).getTime()
    let tpl: string | null = null
    for (const s of tl) {
      if (s.t <= tapT) tpl = s.tpl
      else break
    }
    if (tpl) (clickedByTpl[tpl] = clickedByTpl[tpl] || new Set<string>()).add(e.lead_id)
  }

  // Group by TEMPLATE — each template we send is its own campaign (one template,
  // one audience). Never merged. The user reasons per-template, so the card is
  // per-template.
  const byTpl: Record<string, any> = {}
  for (const r of rows) {
    const m: any = r.metadata || {}
    const tpl = String(m.template_name || m.source || 'send')
    if (!byTpl[tpl]) {
      byTpl[tpl] = { template: tpl, source: m.source || null, campaign: m.campaign || null, sent: 0, delivered: 0, read: 0, first: r.created_at, last: r.created_at, webinarName: m.webinar_name || null, leads: new Set<string>() }
    }
    const c = byTpl[tpl]
    if (r.created_at < c.first) c.first = r.created_at
    if (r.created_at > c.last) c.last = r.created_at
    if (r.lead_id) c.leads.add(r.lead_id)
    if (!c.source && m.source) c.source = m.source
    if (!c.campaign && m.campaign) c.campaign = m.campaign
    if (!c.webinarName && m.webinar_name) c.webinarName = m.webinar_name
    c.sent++
    const ds = m.delivery_status
    if (ds === 'read') { c.read++; c.delivered++ }
    else if (ds === 'delivered') c.delivered++
  }

  // Prettify a raw template name when we have no friendly label for its source.
  const prettyTpl = (name: string) =>
    name
      .replace(/^windchasers_/, '')
      .replace(/_v\d+$/i, '')
      .split('_')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')

  const campaigns = Object.values(byTpl)
    .map((c: any) => {
      const clicked = (clickedByTpl[c.template] || new Set<string>()).size
      const label = SEND_LABELS[c.source] || prettyTpl(c.template)
      const audience = SEND_AUDIENCE[c.source] || ''
      const send = { label, audience: audience || null, template: c.template, sent: c.sent, delivered: c.delivered, read: c.read, clicked }
      return {
        id: c.template,
        name: label,
        description: `${audience ? audience + ' · ' : ''}${c.template}`,
        type: String(c.campaign || '').startsWith('webinar') ? 'Webinar' : 'Campaign',
        recipients: c.leads.size,
        firstSent: c.first,
        lastSent: c.last,
        sends: [send],
        totals: { sent: c.sent, delivered: c.delivered, read: c.read, clicked },
      }
    })
    .sort((a: any, b: any) => (a.lastSent < b.lastSent ? 1 : -1))

  // Upcoming (scheduled, not-yet-sent) day-of webinar sends. Registered leads get
  // "starting soon" ~30 min before + "live now" at start — surface what's queued.
  const upcoming: any[] = []
  const { data: wleads } = await sb
    .from('all_leads')
    .select('unified_context')
    .filter('unified_context->windchasers->>lead_type', 'eq', 'webinar')
    .limit(2000)
  if (wleads && wleads.length) {
    const parseDate = (raw: string): number => {
      const d = new Date(raw).getTime()
      if (!isNaN(d)) return d
      const m = String(raw).match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4}).*?(\d{1,2}):(\d{2})\s*([ap]m)/i)
      if (!m) return NaN
      const months: Record<string, number> = { january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11 }
      const mo = months[m[2].toLowerCase()]
      if (mo === undefined) return NaN
      let hh = parseInt(m[4], 10) % 12
      if (/pm/i.test(m[6])) hh += 12
      return Date.UTC(parseInt(m[3], 10), mo, parseInt(m[1], 10), hh, parseInt(m[5], 10)) - 5.5 * 3_600_000
    }
    let webinarName = '', webinarMs = NaN, startingSoonPending = 0, livePending = 0
    for (const l of wleads) {
      const wc: any = (l.unified_context || {}).windchasers || {}
      if (!(wc.zoom_registered || wc.zoom_join_url)) continue
      if (!webinarName && wc.webinar_name) webinarName = wc.webinar_name
      if (isNaN(webinarMs) && wc.webinar_date) webinarMs = parseDate(wc.webinar_date)
      if (!wc.webinar_starting_soon_sent) startingSoonPending++
      if (!wc.webinar_live_sent) livePending++
    }
    if (!isNaN(webinarMs) && webinarMs > Date.now() - 3_600_000) {
      upcoming.push(
        { id: 'webinar_starting_soon', name: webinarName || 'Webinar', label: 'Starting soon (~30 min before)', scheduledAt: new Date(webinarMs - 30 * 60_000).toISOString(), audience: `${startingSoonPending} registered`, template: 'windchasers_webinar_starting_soon_v1' },
        { id: 'webinar_live', name: webinarName || 'Webinar', label: 'We are live', scheduledAt: new Date(webinarMs).toISOString(), audience: `${livePending} registered`, template: 'windchasers_webinar_live_now_v1' },
      )
    }
  }

  return NextResponse.json({ campaigns, upcoming })
}
