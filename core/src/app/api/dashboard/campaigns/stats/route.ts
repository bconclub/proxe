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
}

// Who each send targets — surfaced as the card's subtext.
const SEND_AUDIENCE: Record<string, string> = {
  webinar_reminder: 'registered leads',
  webinar_starting_soon: 'registered leads',
  webinar_live: 'registered leads',
  webinar_register_nudge: 'not-yet-registered leads',
}

// Two distinct campaigns share the webinar tag but hit opposite audiences:
// everything to REGISTERED leads (reminder + day-of) is one campaign; the
// registration NUDGE to the rest is its own. Split so each shows separately.
const SEND_GROUP: Record<string, 'registered' | 'nudge'> = {
  webinar_reminder: 'registered',
  webinar_starting_soon: 'registered',
  webinar_live: 'registered',
  webinar_register_nudge: 'nudge',
}
const GROUP_META: Record<string, { label: string; audience: string }> = {
  registered: { label: 'Reminders', audience: 'registered leads' },
  nudge: { label: 'Registration nudge', audience: 'not-yet-registered leads' },
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

  // Which recipients tapped a quick-reply button (e.g. "Join WhatsApp Group").
  // Two signals: (a) inbound customer button/interactive taps; (b) the bot's
  // deterministic quick-reply replies, which carry `quick_reply_trigger` — the
  // webinar "Join WhatsApp Group" tap is handled+answered before it's logged as
  // an inbound row, so (b) is the ONLY record of that click. Fetch recent rows
  // broadly and intersect in JS (a `.in()` over 100+ recipient ids returned
  // nothing; a PostgREST json `not.is` filter did too).
  const clickedLeads = new Set<string>()
  const { data: engagement } = await sb
    .from('conversations')
    .select('lead_id, sender, metadata')
    .order('created_at', { ascending: false })
    .limit(12000)
  for (const e of engagement || []) {
    const m: any = e.metadata || {}
    const tapped = !!m.quick_reply_trigger || (e.sender === 'customer' && (m.trigger_kind === 'button' || m.trigger_kind === 'interactive_button'))
    if (tapped && e.lead_id) clickedLeads.add(e.lead_id)
  }

  const byCampaign: Record<string, any> = {}
  for (const r of rows) {
    const m: any = r.metadata || {}
    const cid = m.campaign
    if (!cid) continue
    const src = m.source || m.template_name || 'send'
    const group = SEND_GROUP[src] || 'registered'
    const key = `${cid}:${group}`
    if (!byCampaign[key]) {
      byCampaign[key] = { id: key, campaign: cid, group, sends: {}, first: r.created_at, last: r.created_at, webinarName: m.webinar_name || null, eventName: null, leads: new Set<string>() }
    }
    const c = byCampaign[key]
    if (r.created_at < c.first) c.first = r.created_at
    if (r.created_at > c.last) c.last = r.created_at
    if (r.lead_id) c.leads.add(r.lead_id)

    // The reminder went to REGISTERED leads, so its webinar_name is the real
    // event title (the nudge's title is a different ad campaign name).
    if (src === 'webinar_reminder' && m.webinar_name) c.eventName = m.webinar_name
    if (!c.sends[src]) c.sends[src] = { source: src, template: m.template_name || null, sent: 0, delivered: 0, read: 0, leads: new Set<string>() }
    const s = c.sends[src]
    s.sent++
    if (r.lead_id) s.leads.add(r.lead_id)
    const ds = m.delivery_status
    if (ds === 'read') { s.read++; s.delivered++ }
    else if (ds === 'delivered') s.delivered++
  }

  const campaigns = Object.values(byCampaign)
    .map((c: any) => {
      const sends = Object.values(c.sends).map((s: any) => {
        const clicked = Array.from(s.leads as Set<string>).filter((id) => clickedLeads.has(id)).length
        return { label: SEND_LABELS[s.source] || s.source, audience: SEND_AUDIENCE[s.source] || null, template: s.template, sent: s.sent, delivered: s.delivered, read: s.read, clicked }
      })
      const totals = sends.reduce(
        (a: any, s: any) => ({ sent: a.sent + s.sent, delivered: a.delivered + s.delivered, read: a.read + s.read, clicked: a.clicked + s.clicked }),
        { sent: 0, delivered: 0, read: 0, clicked: 0 },
      )
      const gm = GROUP_META[c.group] || { label: '', audience: '' }
      const event = c.eventName || c.webinarName || c.campaign
      return {
        id: c.id,
        name: gm.label ? `${event} — ${gm.label}` : event,
        description: `${gm.audience || ''}${gm.audience ? ' · ' : ''}${sends.map((s: any) => s.label).join(' + ')}`,
        type: String(c.campaign).startsWith('webinar') ? 'Webinar' : 'Campaign',
        recipients: c.leads.size,
        firstSent: c.first,
        lastSent: c.last,
        sends,
        totals,
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
