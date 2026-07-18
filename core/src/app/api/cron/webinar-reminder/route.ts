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
import { getServiceClient, logMessage, sendWebinarReminder, sendWebinarRegisterNudge, sendWebinarStartingSoon, sendWebinarLiveNow } from '@/lib/services'
import { BRAND_ID } from '@/configs'
import { renderWaTemplate } from '@/configs/whatsapp-template-bodies'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Names logged on each send = the template that ACTUALLY goes out (v2/v3), so the
// inbox renders the exact approved copy + buttons. The senders send these too.
const TEMPLATE = 'windchasers_webinar_reminder_v2'
const NUDGE_TEMPLATE = 'windchasers_webinar_register_nudge_v2'
const STARTING_SOON_TEMPLATE = 'windchasers_webinar_starting_soon_v3'
const LIVE_TEMPLATE = 'windchasers_webinar_live_now_v3'

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
  const results = { checked: 0, sent24h: 0, sent2h: 0, sentStartingSoon: 0, sentLive: 0, nudged: 0, wouldSend: 0, skipped: 0, errors: 0 }
  const log: string[] = []
  // Kill-switch: no reminder/nudge reaches a real lead until this is explicitly
  // set to 'true' in the windchasers env. Default OFF = dry run: the cron still
  // computes who is DUE and logs it (results.wouldSend), but sends nothing and
  // sets no markers, so enabling it later delivers to everyone still eligible.
  const sendsEnabled = process.env.WINDCHASERS_WEBINAR_SENDS_ENABLED === 'true'
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
      // Skip only once well past the start — the "live now" step still fires for a
      // short window AFTER the webinar begins (hoursUntil goes slightly negative).
      if (hoursUntil <= -0.6) { results.skipped++; continue }

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
        if (!sendsEnabled) { results.wouldSend++; log.push(`lead=${lead.id} DRY-RUN nudge (sends disabled)`); continue }
        const result = await sendWebinarRegisterNudge(lead.phone, lead.customer_name || '', webinarName, registerUrl)
        if (!result.success) {
          results.errors++
          log.push(`lead=${lead.id} nudge send failed: ${result.error}`)
          continue // no marker on failure → retried next run (e.g. once Meta approves the template)
        }
        const nudgeName = (lead.customer_name || 'there').split(' ')[0]
        const nudgeRendered = renderWaTemplate(NUDGE_TEMPLATE, { customer_name: nudgeName, webinar_name: webinarName || 'our webinar' })
        await logMessage(
          lead.id,
          'whatsapp',
          'agent',
          nudgeRendered?.content || `Hi ${nudgeName}, you showed interest in our ${webinarName || 'our webinar'} webinar but haven't completed your registration yet. Tap Complete Registration to secure your spot.`,
          'template',
          { source: 'webinar_register_nudge', template_name: NUDGE_TEMPLATE, trigger: 'webinar_register_nudge', webinar_name: webinarName || null, webinar_date: rawDate, campaign: 'webinar', wa_message_id: result.messageId || null, delivery_status: result.messageId ? 'sent' : undefined, template_footer: nudgeRendered?.footer, template_buttons: nudgeRendered?.buttons, template_button_type: nudgeRendered?.buttonType, template_button_types: nudgeRendered?.buttonTypes },
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

      // Day-of sends to REGISTERED leads (they hold a personal Zoom join link):
      //   starting_soon ~30 min before (window 15-45 min out), live at start
      //   (6 min before → ~35 min after). Idempotent per marker; the every-10-min
      //   cron cadence lets these hit their tight windows. Carries the lead's own
      //   join link so they tap straight into the room.
      const joinUrl = String(wc.zoom_join_url || '').trim()
      if (registered && joinUrl) {
        let dayStep: 'starting_soon' | 'live' | null = null
        if (hoursUntil <= 0.1 && hoursUntil > -0.6 && !wc.webinar_live_sent) dayStep = 'live'
        else if (hoursUntil >= 0.3 && hoursUntil <= 0.6 && !wc.webinar_starting_soon_sent) dayStep = 'starting_soon'
        if (dayStep) {
          const webinarName = String(wc.webinar_name || '').trim()
          if (!sendsEnabled) { results.wouldSend++; log.push(`lead=${lead.id} DRY-RUN ${dayStep} (sends disabled)`); continue }
          const send = dayStep === 'live'
            ? await sendWebinarLiveNow(lead.phone, lead.customer_name || '', webinarName, joinUrl)
            : await sendWebinarStartingSoon(lead.phone, lead.customer_name || '', webinarName, joinUrl)
          if (!send.success) {
            results.errors++
            log.push(`lead=${lead.id} ${dayStep} send failed: ${send.error}`)
            continue // no marker on failure → retried next run
          }
          const dfn = (lead.customer_name || 'there').split(' ')[0]
          const tpl = dayStep === 'live' ? LIVE_TEMPLATE : STARTING_SOON_TEMPLATE
          // Log the EXACT approved template (clean body + button), not a stub — so
          // the inbox shows what the lead actually received (join link is in the
          // button, never inline). joinUrl stays out of the body by design.
          const rendered = renderWaTemplate(tpl, { customer_name: dfn, webinar_name: webinarName || 'our webinar' })
          const body = rendered?.content
            || (dayStep === 'live'
              ? `Hi ${dfn}, we are live now. ${webinarName || 'our webinar'} has started. Tap Join webinar below.`
              : `Hi ${dfn}, your ${webinarName || 'our webinar'} webinar starts in 30 minutes. Tap Join webinar below.`)
          await logMessage(
            lead.id, 'whatsapp', 'agent', body, 'template',
            // Store Meta's wamid so the delivery webhook can match this send and
            // stamp delivered/read (without it the campaign shows 0 delivered/read).
            { source: `webinar_${dayStep}`, template_name: tpl, trigger: `webinar_${dayStep}`, webinar_name: webinarName || null, webinar_date: rawDate, campaign: 'webinar_18jul', wa_message_id: send.messageId || null, delivery_status: send.messageId ? 'sent' : undefined, template_footer: rendered?.footer, template_buttons: rendered?.buttons, template_button_type: rendered?.buttonType, template_button_types: rendered?.buttonTypes },
            supabase,
          )
          await supabase
            .from('all_leads')
            .update({ unified_context: { ...ctx, windchasers: { ...wc, [`webinar_${dayStep}_sent`]: new Date(now).toISOString() } } })
            .eq('id', lead.id)
          if (dayStep === 'live') results.sentLive++
          else results.sentStartingSoon++
          continue
        }
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

      if (!sendsEnabled) { results.wouldSend++; log.push(`lead=${lead.id} DRY-RUN reminder ${step} (sends disabled)`); continue }
      const result = await sendWebinarReminder(lead.phone, lead.customer_name || '', webinarName, when)
      if (!result.success) {
        results.errors++
        log.push(`lead=${lead.id} step=${step} send failed: ${result.error}`)
        // No marker on failure — retried next run (e.g. once Meta approves the template).
        continue
      }

      const firstName = (lead.customer_name || 'there').split(' ')[0]
      const remRendered = renderWaTemplate(TEMPLATE, { customer_name: firstName, webinar_name: webinarName || 'our webinar', when })
      await logMessage(
        lead.id,
        'whatsapp',
        'agent',
        remRendered?.content || `Hi ${firstName}, a quick reminder about the ${webinarName || 'our webinar'} webinar. It starts ${when}.`,
        'template',
        { source: 'webinar_reminder', template_name: TEMPLATE, trigger: `webinar_reminder_${step}`, webinar_name: webinarName || null, webinar_date: rawDate, campaign: 'webinar', wa_message_id: result.messageId || null, delivery_status: result.messageId ? 'sent' : undefined, template_footer: remRendered?.footer, template_buttons: remRendered?.buttons, template_button_type: remRendered?.buttonType, template_button_types: remRendered?.buttonTypes },
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

  return NextResponse.json({ success: true, sendsEnabled, results, log, timestamp: new Date(now).toISOString() })
}
