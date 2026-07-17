/**
 * Cron: Webinar reminders (windchasers)
 * GET /api/cron/webinar-reminder
 *
 * Webinar registrants (unified_context.windchasers.lead_type = 'webinar',
 * tagged by /api/agent/leads/inbound from the Zoom → Pabbly registration
 * feed) get two WhatsApp reminders before their webinar_date:
 *   • ~24h before (window 20–28h)  → "tomorrow at <time>"
 *   • ~2h before  (window 1–4h)   → "in about 2 hours"
 *
 * Idempotent via per-step markers on the lead's context
 * (webinar_reminder_24h_sent / webinar_reminder_2h_sent), so the schedule
 * cadence is forgiving — run hourly.
 *
 * Schedule this URL in the same external scheduler that hits
 * /api/cron/booking-reminders (Bearer CRON_SECRET), hourly.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, logMessage, sendWebinarReminder, sendWebinarRegisterNudge } from '@/lib/services'
import { BRAND_ID } from '@/configs'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const TEMPLATE = 'windchasers_webinar_reminder_v1'
const NUDGE_TEMPLATE = 'windchasers_webinar_register_nudge_v1'

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
  const results = { checked: 0, sent24h: 0, sent2h: 0, nudged: 0, skipped: 0, errors: 0 }
  const log: string[] = []
  // Public Zoom registration page for the not-registered nudge. The nudge's v2
  // template carries this as a "Complete Registration" URL button; this value is
  // only used by the v1 fallback (body-embed) if v2 isn't approved. Env overrides
  // the baked-in default so the link can change without a redeploy.
  const registerUrl = process.env.WINDCHASERS_WEBINAR_REGISTER_URL || 'https://us06web.zoom.us/meeting/register/JGMzDhBqTJC635lNAhxx5w'

  const { data: registrants, error: queryErr } = await supabase
    .from('all_leads')
    .select('id, customer_name, phone, unified_context')
    .eq('brand', 'windchasers')
    .filter('unified_context->windchasers->>lead_type', 'eq', 'webinar')
    .limit(1000)

  if (queryErr) {
    return NextResponse.json({ success: false, error: queryErr.message }, { status: 500 })
  }

  for (const lead of registrants || []) {
    results.checked++
    try {
      const ctx: any = lead.unified_context || {}
      const wc: any = ctx.windchasers || {}
      const rawDate = wc.webinar_date
      if (!rawDate || !lead.phone) { results.skipped++; continue }

      const startsAt = new Date(rawDate).getTime()
      if (isNaN(startsAt)) { results.skipped++; continue }   // unparseable date — Pabbly should send ISO
      const hoursUntil = (startsAt - now) / 3_600_000
      if (hoursUntil <= 0) { results.skipped++; continue }   // already started / past

      // Zoom-registered leads hold a personal join link → they get the pre-webinar
      // reminders below. Leads who only gave name+phone (no join link) never
      // finished registration, so a "webinar tomorrow" reminder would be wrong —
      // they instead get a one-time "complete your registration" nudge while
      // there's still time to sign up.
      const registered = !!(wc.zoom_registered || wc.zoom_join_url)
      if (!registered) {
        if (wc.webinar_register_nudge_sent) { results.skipped++; continue } // once only
        if (hoursUntil < 3) { results.skipped++; continue }                 // too late to register
        if (!registerUrl) { results.skipped++; continue }                   // dormant until URL configured

        const webinarName = String(wc.webinar_name || '').trim()
        const result = await sendWebinarRegisterNudge(lead.phone, lead.customer_name || '', webinarName, registerUrl)
        if (!result.success) {
          results.errors++
          log.push(`lead=${lead.id} nudge send failed: ${result.error}`)
          continue // no marker on failure → retried next run (e.g. once Meta approves the template)
        }
        const nudgeName = (lead.customer_name || 'there').split(' ')[0]
        await logMessage(
          lead.id,
          'whatsapp',
          'agent',
          `Hi ${nudgeName}, you started signing up for ${webinarName || 'our webinar'} but didn't finish. Complete your registration here: ${registerUrl} (${NUDGE_TEMPLATE} template)`,
          'template',
          { source: 'webinar_register_nudge', template_name: NUDGE_TEMPLATE, trigger: 'webinar_register_nudge', webinar_name: webinarName || null, webinar_date: rawDate },
          supabase,
        )
        await supabase
          .from('all_leads')
          .update({
            unified_context: {
              ...ctx,
              windchasers: { ...wc, webinar_register_nudge_sent: new Date(now).toISOString() },
            },
          })
          .eq('id', lead.id)
        results.nudged++
        continue
      }

      // Which step is due? 2h step wins if both windows somehow overlap.
      let step: '24h' | '2h' | null = null
      if (hoursUntil >= 1 && hoursUntil <= 4 && !wc.webinar_reminder_2h_sent) step = '2h'
      else if (hoursUntil >= 20 && hoursUntil <= 28 && !wc.webinar_reminder_24h_sent) step = '24h'
      if (!step) { results.skipped++; continue }

      const timeDisplay = new Date(startsAt).toLocaleTimeString('en-IN', {
        hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
      })
      const when = step === '24h' ? `tomorrow at ${timeDisplay}` : `in about 2 hours (${timeDisplay})`
      const webinarName = String(wc.webinar_name || '').trim()

      const result = await sendWebinarReminder(lead.phone, lead.customer_name || '', webinarName, when)
      if (!result.success) {
        results.errors++
        log.push(`lead=${lead.id} step=${step} send failed: ${result.error}`)
        // No marker on failure — retried next run (e.g. once Meta approves the template).
        continue
      }

      const firstName = (lead.customer_name || 'there').split(' ')[0]
      await logMessage(
        lead.id,
        'whatsapp',
        'agent',
        `Hi ${firstName}, reminder: ${webinarName || 'our webinar'} starts ${when}. (${TEMPLATE} template)`,
        'template',
        { source: 'webinar_reminder', template_name: TEMPLATE, trigger: `webinar_reminder_${step}`, webinar_name: webinarName || null, webinar_date: rawDate },
        supabase,
      )
      // Mark the step sent (re-merge onto the snapshot ctx we already hold).
      await supabase
        .from('all_leads')
        .update({
          unified_context: {
            ...ctx,
            windchasers: { ...wc, [`webinar_reminder_${step}_sent`]: new Date(now).toISOString() },
          },
        })
        .eq('id', lead.id)
      if (step === '24h') results.sent24h++
      else results.sent2h++
    } catch (e: any) {
      results.errors++
      log.push(`lead=${lead.id} error: ${e?.message || e}`)
    }
  }

  return NextResponse.json({ success: true, results, log, timestamp: new Date(now).toISOString() })
}
