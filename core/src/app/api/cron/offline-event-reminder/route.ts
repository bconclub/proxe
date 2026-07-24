/**
 * Cron: Offline-event reminders (windchasers)
 * GET /api/cron/offline-event-reminder
 *
 * Offline-event (demo class) leads (unified_context.windchasers.lead_type =
 * 'offline_event') get two follow-ups, mirroring webinar-reminder's shape:
 *   • Not yet registered (no offline_event_registered_at) → ONE "confirm your
 *     seat" nudge with the landing-page link, fired once, any time before the
 *     event (not date-gated - the template has no date/time param, so there's
 *     nothing to get stale). This is what actually drives the registration
 *     count up.
 *   • Registered → ONE "get directions" reminder in the EVENING BEFORE their
 *     specific session (window: 14-22h before start) - not 1 hour before, per
 *     explicit instruction. WhatsApp resends the approved confirmation
 *     template; email carries the real address + Maps link (WhatsApp
 *     templates can't be edited post-approval to add those).
 *
 * Idempotent via per-step markers on the lead's context
 * (offline_event_register_reminder_sent / offline_event_directions_reminder_sent).
 *
 * Registered in vercel.json's crons array (hourly) - no external scheduler
 * setup needed, unlike webinar-reminder.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, logMessage, sendOfflineEventRegisterNudge, sendOfflineEventConfirm, sendEmail } from '@/lib/services'
import { BRAND_ID } from '@/configs'
import { renderWaTemplate } from '@/configs/whatsapp-template-bodies'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const NUDGE_TEMPLATE = 'windchasers_offline_event_register_nudge_v3'
const CONFIRM_TEMPLATE = 'windchasers_offline_event_confirmation_v2'

// Real campus address - same one used site-wide (Footer.tsx/Navbar.tsx/contact-us).
// Can't live in lib/offline-events.ts (that's the separate site repo) - duplicated
// here deliberately since this is the backend's own copy for the email send.
const VENUE_ADDRESS = 'WindChasers Aviation Academy, Kothanur, Bengaluru, Karnataka 560077'
const VENUE_MAPS_URL = 'https://maps.google.com/maps?q=WindChasers+Aviation+Academy+Kothanur+Bengaluru'
const LANDING_URL = 'https://windchasers.in/dgca-demo-class'

// The two fixed sessions for this event (mirrors lib/offline-events.ts's
// DEMO_CLASS_SESSIONS in the site repo). A not-yet-registered lead's
// offline_event_date is often just a day preference ("27 July") with no
// year/time - map those to the known session start so window math works.
const KNOWN_SESSIONS: Record<string, string> = {
  '27 july': '2026-07-27T11:00:00+05:30',
  '28 july': '2026-07-28T11:00:00+05:30',
}

/** Parse a stored offline_event_date into epoch ms. Handles both the full
 *  landing-page label ("27 July 2026 at 11:00 AM IST") and the short FB-ad
 *  day-preference form ("27 July"). Returns NaN if genuinely unparseable. */
function parseOfflineEventDateMs(raw: string): number {
  const cleaned = String(raw || '').toLowerCase().trim()
  for (const [key, iso] of Object.entries(KNOWN_SESSIONS)) {
    if (cleaned.startsWith(key)) return new Date(iso).getTime()
  }
  const direct = new Date(raw).getTime()
  if (!isNaN(direct)) return direct
  const m = cleaned.match(/(\d{1,2})\s+([a-z]+)\s+(\d{4}).*?(\d{1,2}):(\d{2})\s*([ap]m)/i)
  if (!m) return NaN
  const months: Record<string, number> = {
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  }
  const mo = months[m[2]]
  if (mo === undefined) return NaN
  let hh = parseInt(m[4], 10) % 12
  if (/pm/.test(m[6])) hh += 12
  const day = parseInt(m[1], 10), yr = parseInt(m[3], 10), mm = parseInt(m[5], 10)
  return Date.UTC(yr, mo, day, hh, mm) - 5.5 * 3_600_000
}

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
  const results = { checked: 0, nudged: 0, directionsSent: 0, wouldSend: 0, skipped: 0, errors: 0 }
  const log: string[] = []
  // Kill-switch: no message reaches a real lead until this is explicitly set
  // to 'true' in the windchasers env. Default OFF = dry run: the cron still
  // computes who is DUE and logs it (results.wouldSend), but sends nothing and
  // sets no markers, so enabling it later delivers to everyone still eligible.
  const sendsEnabled = process.env.WINDCHASERS_OFFLINE_EVENT_SENDS_ENABLED === 'true'

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
    results.checked++
    try {
      const ctx: any = lead.unified_context || {}
      const wc: any = ctx.windchasers || {}
      if (!lead.phone) { results.skipped++; continue }

      const eventName = String(wc.offline_event_name || 'the WindChasers Demo Class').trim()
      const registered = !!wc.offline_event_registered_at
      const firstName = (lead.customer_name || 'there').split(' ')[0]

      if (!registered) {
        // ── Not registered → one-time "confirm your seat" nudge ─────────────
        if (wc.offline_event_register_reminder_sent) { results.skipped++; continue }
        // Too late once even the LATER session is well past - no point nudging.
        const lastSessionMs = new Date(KNOWN_SESSIONS['28 july']).getTime()
        if (now > lastSessionMs + 6 * 3_600_000) { results.skipped++; continue }

        if (!sendsEnabled) { results.wouldSend++; log.push(`lead=${lead.id} DRY-RUN nudge (sends disabled)`); continue }

        const result = await sendOfflineEventRegisterNudge(lead.phone, lead.customer_name || '', eventName)
        let waOk = result.success
        if (!result.success) {
          log.push(`lead=${lead.id} nudge send failed (falls back next run once approved): ${result.error}`)
        } else {
          const rendered = renderWaTemplate(NUDGE_TEMPLATE, { customer_name: firstName, event_name: eventName })
          await logMessage(
            lead.id, 'whatsapp', 'agent',
            rendered?.content || `Hi ${firstName}, you told us you're interested in ${eventName} - tap below to confirm your seat.`,
            'template',
            {
              source: 'offline_event_reminder', template_name: NUDGE_TEMPLATE, trigger: 'offline_event_register_reminder',
              offline_event_name: eventName, wa_message_id: result.messageId || null,
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
              `<p><a href="${LANDING_URL}">Tap here to confirm your seat</a>.</p>` +
              `<p>- Team WindChasers</p>`,
          })
          emailOk = !!emailResult.sent
          if (!emailResult.sent) log.push(`lead=${lead.id} nudge email failed: ${emailResult.error}`)
        }

        // Mark sent as long as AT LEAST one channel got through, so a lead
        // with a broken email but a working WhatsApp send (or vice versa)
        // isn't retried forever once it has genuinely reached them.
        if (waOk || emailOk) {
          await supabase.from('all_leads').update({
            unified_context: { ...ctx, windchasers: { ...wc, offline_event_register_reminder_sent: new Date(now).toISOString() } },
          }).eq('id', lead.id)
          results.nudged++
        } else {
          results.errors++
        }
        continue
      }

      // ── Registered → "get directions" reminder, evening before their session ──
      if (wc.offline_event_directions_reminder_sent) { results.skipped++; continue }
      const rawDate = wc.offline_event_date
      const startsAt = parseOfflineEventDateMs(rawDate)
      if (isNaN(startsAt)) { results.skipped++; continue }
      const hoursUntil = (startsAt - now) / 3_600_000
      // 14-22h before an 11 AM session = roughly 1 PM-9 PM the evening before.
      if (hoursUntil < 14 || hoursUntil > 22) { results.skipped++; continue }

      if (!sendsEnabled) { results.wouldSend++; log.push(`lead=${lead.id} DRY-RUN directions (sends disabled)`); continue }

      const [datePart, timePart] = String(rawDate || '').split(/\s+at\s+/i)
      const dateDisplay = (datePart || rawDate || 'the scheduled date').trim()
      const timeDisplay = (timePart || '11:00 AM IST').trim()
      const result = await sendOfflineEventConfirm(lead.phone, lead.customer_name || '', eventName, rawDate || `${dateDisplay} at ${timeDisplay}`)
      let waOk = result.success
      if (!result.success) {
        log.push(`lead=${lead.id} directions WhatsApp send failed: ${result.error}`)
      } else {
        const rendered = renderWaTemplate(CONFIRM_TEMPLATE, { customer_name: firstName, event_name: eventName, date: dateDisplay, time: timeDisplay })
        await logMessage(
          lead.id, 'whatsapp', 'agent',
          rendered?.content || `Hi ${firstName}, reminder - you're all set for ${eventName} on ${dateDisplay} at ${timeDisplay}.`,
          'template',
          {
            source: 'offline_event_reminder', template_name: CONFIRM_TEMPLATE, trigger: 'offline_event_directions_reminder',
            offline_event_name: eventName, offline_event_date: rawDate, wa_message_id: result.messageId || null,
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
            `<p><strong>Venue:</strong> ${VENUE_ADDRESS}<br/>` +
            `<a href="${VENUE_MAPS_URL}">Get directions</a></p>` +
            `<p>We can't wait to see you there!</p>` +
            `<p>- Team WindChasers</p>`,
        })
        emailOk = !!emailResult.sent
        if (!emailResult.sent) log.push(`lead=${lead.id} directions email failed: ${emailResult.error}`)
      }

      if (waOk || emailOk) {
        await supabase.from('all_leads').update({
          unified_context: { ...ctx, windchasers: { ...wc, offline_event_directions_reminder_sent: new Date(now).toISOString() } },
        }).eq('id', lead.id)
        results.directionsSent++
      } else {
        results.errors++
      }
    } catch (e: any) {
      results.errors++
      log.push(`lead=${lead.id} error: ${e?.message || e}`)
    }
  }

  return NextResponse.json({ success: true, sendsEnabled, results, log, timestamp: new Date(now).toISOString() })
}
