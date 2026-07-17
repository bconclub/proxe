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
  webinar_register_nudge: 'Registration nudge',
}

// Who each send targets — surfaced as the card's subtext so it's obvious the
// campaign is a reminder to registered leads AND a nudge to the rest.
const SEND_AUDIENCE: Record<string, string> = {
  webinar_reminder: 'registered leads',
  webinar_register_nudge: 'not-yet-registered leads',
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
    if (!byCampaign[cid]) {
      byCampaign[cid] = { id: cid, sends: {}, first: r.created_at, last: r.created_at, webinarName: m.webinar_name || null, eventName: null, leads: new Set<string>() }
    }
    const c = byCampaign[cid]
    if (r.created_at < c.first) c.first = r.created_at
    if (r.created_at > c.last) c.last = r.created_at
    if (r.lead_id) c.leads.add(r.lead_id)

    const src = m.source || m.template_name || 'send'
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
      // One-line "what this is" so the card isn't just the (nudge) ad-campaign name.
      const description = sends
        .map((s: any) => `${s.label} → ${s.audience || `${s.sent}`}`)
        .join('  ·  ')
      return {
        id: c.id,
        name: c.eventName || c.webinarName || c.id,
        description,
        type: String(c.id).startsWith('webinar') ? 'Webinar' : 'Campaign',
        recipients: c.leads.size,
        firstSent: c.first,
        lastSent: c.last,
        sends,
        totals,
      }
    })
    .sort((a: any, b: any) => (a.lastSent < b.lastSent ? 1 : -1))

  return NextResponse.json({ campaigns })
}
