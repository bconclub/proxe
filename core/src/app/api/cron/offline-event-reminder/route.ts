/**
 * Cron: Offline-event reminders (windchasers)
 * GET /api/cron/offline-event-reminder
 *
 * Drives reminders for EVERY event in the offline-event registry
 * (core/src/configs/offline-events.ts). Two follow-ups per lead per event,
 * mirroring webinar-reminder's shape:
 *   • Not yet registered (no registered_at) → ONE "confirm your seat" nudge
 *     carrying that event's own landing link. Not date-gated beyond the
 *     event's own cutoff - the template has no date/time param, so there's
 *     nothing to go stale.
 *   • Registered → ONE "get directions" reminder in the EVENING BEFORE their
 *     session (14-22h before start), not an hour before. WhatsApp resends the
 *     approved confirmation template; email carries the venue + Maps link
 *     (approved WhatsApp templates can't be edited to add those).
 *
 * Everything event-specific - sessions, venue, landing URL, cutoff - comes
 * from the registry. Reminder markers live at
 * unified_context.windchasers.offline_events[key].*, so a lead reminded about
 * one event can still be reminded about the next. Legacy leads carrying only
 * the old flat fields are handled by readOfflineEvents()'s synthesis, which
 * seeds those markers - so nobody is re-messaged about a past event.
 *
 * Registered in core/vercel.json (every 10 min).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, logMessage, sendOfflineEventRegisterNudge, sendOfflineEventConfirm, sendEmail } from '@/lib/services'
import { BRAND_ID } from '@/configs'
import {
  getOfflineEvent,
  eventLastSessionMs,
  resolveSessionStartMs,
  offlineEventSendsEnabled,
  type OfflineEventConfig,
} from '@/configs/offline-events'
import { resolveOfflineEventKey, readOfflineEventEntry, writeOfflineEvent } from '@/lib/offlineEventContext'
import { renderWaTemplate } from '@/configs/whatsapp-template-bodies'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const CONFIRM_TEMPLATE = 'windchasers_offline_event_confirmation_v2'

/** How long after the last session we stop nudging people to register. */
const POST_EVENT_GRACE_MS = 6 * 3_600_000
/** Directions reminder window: the evening before an 11 AM start. */
const DIRECTIONS_WINDOW_MIN_H = 14
const DIRECTIONS_WINDOW_MAX_H = 22

type EventTally = { nudged: number; directionsSent: number; wouldSend: number; skipped: number; errors: number }
const emptyTally = (): EventTally => ({ nudged: 0, directionsSent: 0, wouldSend: 0, skipped: 0, errors: 0 })

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Windchasers-only flow; the route exists in every brand build but no-ops
  // elsewhere so a mis-scheduled cron can never message another brand's leads.
  if (BRAND_ID !== 'windchasers') {
    return NextResponse.json({ success: true, skipped: 'not windchasers' })
  }

  const supabase = getServiceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'No Supabase client' }, { status: 500 })
  }

  const now = Date.now()
  const byEvent: Record<string, EventTally> = {}
  const tally = (key: string): EventTally => (byEvent[key] ||= emptyTally())
  const log: string[] = []
  let checked = 0

  const { data: leads, error: queryErr } = await supabase
    .from('all_leads')
    .select('id, customer_name, phone, email, unified_context')
    .eq('brand', 'windchasers')
    .filter('unified_context->windchasers->>lead_type', 'eq', 'offline_event')
    .limit(1000)

  if (queryErr) {
    return NextResponse.json({ success: false, error: queryErr.message }, { status: 500 })
  }

  for (const lead of leads || []) {
    checked++
    const ctx: any = lead.unified_context || {}
    const wc: any = ctx.windchasers || {}
    const key = resolveOfflineEventKey(wc)

    try {
      if (!lead.phone) { tally(key).skipped++; continue }

      // A key with no registry entry is a free-text event we know nothing
      // about - no dates, no venue, no landing link. Never message those.
      const event: OfflineEventConfig | null = getOfflineEvent(key)
      if (!event) { tally(key).skipped++; continue }

      const entry = readOfflineEventEntry(wc, key)
      const sendsEnabled = offlineEventSendsEnabled(key)
      const firstName = (lead.customer_name || 'there').split(' ')[0]
      const eventName = entry.name || event.name

      // ── Not registered → one-time "confirm your seat" nudge ───────────────
      if (!entry.registered_at) {
        if (entry.register_reminder_sent) { tally(key).skipped++; continue }
        // PER-EVENT cutoff. This replaced a single global one hardcoded to the
        // Demo Class's last session, which silently disabled the nudge for
        // every offline-event lead once that date passed. Scoping it per event
        // is also what keeps past-event leads suppressed instead of blasting
        // them about something that already happened.
        if (now > eventLastSessionMs(event) + POST_EVENT_GRACE_MS) { tally(key).skipped++; continue }

        if (!sendsEnabled) {
          tally(key).wouldSend++
          log.push(`lead=${lead.id} event=${key} DRY-RUN nudge (sends disabled)`)
          continue
        }

        const result = await sendOfflineEventRegisterNudge(lead.phone, lead.customer_name || '', eventName, event.slugPath, {
          date: String(entry.date || event.sessions[0]?.label || '').split(/\s+at\s+/i)[0],
          time: event.timeDisplay,
        })
        const waOk = result.success
        if (!waOk) {
          log.push(`lead=${lead.id} event=${key} nudge WhatsApp failed: ${result.error}`)
        } else {
          const rendered = renderWaTemplate(result.templateUsed, { customer_name: firstName, event_name: eventName })
          await logMessage(
            lead.id, 'whatsapp', 'agent',
            rendered?.content || `Hi ${firstName}, tap below to confirm your seat for ${eventName}.`,
            'template',
            {
              source: 'offline_event_reminder', template_name: result.templateUsed,
              trigger: 'offline_event_register_reminder',
              offline_event_key: key, offline_event_name: eventName,
              wa_message_id: result.messageId || null,
              delivery_status: result.messageId ? 'sent' : undefined,
              template_footer: rendered?.footer, template_buttons: rendered?.buttons,
            },
            supabase,
          )
        }

        let emailOk = false
        if (lead.email) {
          const emailResult = await sendEmail({
            to: lead.email,
            subject: `Don't forget to confirm your seat - ${eventName}`,
            html: `<p>Hi ${firstName},</p>` +
              `<p>You told us you're interested in <strong>${eventName}</strong> - we'd love to see you there!</p>` +
              `<p><a href="${event.landingUrl}">Tap here to confirm your seat</a>.</p>` +
              `<p>- Team WindChasers</p>`,
          })
          emailOk = !!emailResult.sent
          if (!emailResult.sent) log.push(`lead=${lead.id} event=${key} nudge email failed: ${emailResult.error}`)
        }

        // Mark sent when AT LEAST one channel got through, so a lead with a
        // broken email but a working WhatsApp send (or vice versa) isn't
        // retried forever once it has genuinely reached them. A total failure
        // leaves the marker unset, so the next run retries - which is how the
        // WhatsApp path auto-upgrades once Meta approves the v4 template.
        if (waOk || emailOk) {
          await persistEventPatch(supabase, lead.id, key, { register_reminder_sent: new Date(now).toISOString() })
          tally(key).nudged++
        } else {
          tally(key).errors++
        }
        continue
      }

      // ── Registered → "get directions" reminder, evening before ────────────
      if (entry.directions_reminder_sent) { tally(key).skipped++; continue }
      const startsAt = resolveSessionStartMs(event, entry.date)
      if (isNaN(startsAt)) { tally(key).skipped++; continue }
      const hoursUntil = (startsAt - now) / 3_600_000
      if (hoursUntil < DIRECTIONS_WINDOW_MIN_H || hoursUntil > DIRECTIONS_WINDOW_MAX_H) {
        tally(key).skipped++
        continue
      }

      if (!sendsEnabled) {
        tally(key).wouldSend++
        log.push(`lead=${lead.id} event=${key} DRY-RUN directions (sends disabled)`)
        continue
      }

      const rawDate = entry.date || ''
      const [datePart, timePart] = String(rawDate).split(/\s+at\s+/i)
      const dateDisplay = (datePart || rawDate || event.sessions[0]?.label || 'the scheduled date').trim()
      const timeDisplay = (timePart || event.timeDisplay).trim()
      const result = await sendOfflineEventConfirm(
        lead.phone,
        lead.customer_name || '',
        eventName,
        rawDate || `${dateDisplay} at ${timeDisplay}`,
        event.whatsappGroupUrl ? event.key : undefined,
      )
      const waOk = result.success
      if (!waOk) {
        log.push(`lead=${lead.id} event=${key} directions WhatsApp failed: ${result.error}`)
      } else {
        const rendered = renderWaTemplate(CONFIRM_TEMPLATE, { customer_name: firstName, event_name: eventName, date: dateDisplay, time: timeDisplay })
        await logMessage(
          lead.id, 'whatsapp', 'agent',
          rendered?.content || `Hi ${firstName}, reminder - you're all set for ${eventName} on ${dateDisplay} at ${timeDisplay}.`,
          'template',
          {
            source: 'offline_event_reminder', template_name: CONFIRM_TEMPLATE,
            trigger: 'offline_event_directions_reminder',
            offline_event_key: key, offline_event_name: eventName, offline_event_date: rawDate || null,
            wa_message_id: result.messageId || null,
            delivery_status: result.messageId ? 'sent' : undefined,
            template_footer: rendered?.footer, template_buttons: rendered?.buttons,
          },
          supabase,
        )
      }

      let emailOk = false
      if (lead.email) {
        const emailResult = await sendEmail({
          to: lead.email,
          subject: `See you tomorrow - ${eventName}`,
          html: `<p>Hi ${firstName},</p>` +
            `<p>Quick reminder - you're all set for <strong>${eventName}</strong> on <strong>${dateDisplay}</strong> at <strong>${timeDisplay}</strong>.</p>` +
            `<p><strong>Venue:</strong> ${event.venue.address}<br/>` +
            `<a href="${event.venue.mapsUrl}">Get directions</a></p>` +
            `<p>We can't wait to see you there!</p>` +
            `<p>- Team WindChasers</p>`,
        })
        emailOk = !!emailResult.sent
        if (!emailResult.sent) log.push(`lead=${lead.id} event=${key} directions email failed: ${emailResult.error}`)
      }

      if (waOk || emailOk) {
        await persistEventPatch(supabase, lead.id, key, { directions_reminder_sent: new Date(now).toISOString() })
        tally(key).directionsSent++
      } else {
        tally(key).errors++
      }
    } catch (e: any) {
      tally(key).errors++
      log.push(`lead=${lead.id} event=${key} error: ${e?.message || e}`)
    }
  }

  return NextResponse.json({
    success: true,
    results: { checked, byEvent },
    log,
    timestamp: new Date(now).toISOString(),
  })
}

/**
 * Write a marker onto ONE event's entry.
 *
 * Re-reads the row immediately before updating: unified_context is a single
 * JSONB column, so a stale in-memory copy would clobber anything an inbound
 * registration wrote while this run was in flight. (A jsonb_set RPC touching
 * only the marker path is the fuller fix; this closes the realistic window.)
 *
 * mirrorFlat:false - a reminder about an older event must not repoint the flat
 * offline_event_* mirror, which tracks the lead's most RECENT event.
 */
async function persistEventPatch(
  supabase: any,
  leadId: string,
  key: string,
  patch: Record<string, string>,
): Promise<void> {
  const { data: fresh } = await supabase
    .from('all_leads')
    .select('unified_context')
    .eq('id', leadId)
    .maybeSingle()
  const freshCtx: any = fresh?.unified_context || {}
  const freshWc: any = freshCtx.windchasers || {}
  const updates = writeOfflineEvent(freshWc, key, patch, { mirrorFlat: false })
  await supabase
    .from('all_leads')
    .update({ unified_context: { ...freshCtx, windchasers: { ...freshWc, ...updates } } })
    .eq('id', leadId)
}
