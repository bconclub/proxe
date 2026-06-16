/**
 * Cron: WhatsApp pop-up drop-off welcome
 * GET /api/cron/wa-prelaunch-welcome
 *
 * When a visitor clicks the website WhatsApp pop-up, /api/agent/wa-prelaunch
 * records the lead with unified_context.pending_wa_message = true + pending_wa_at
 * + the page_url they came from — but clicking the button is NOT the same as
 * actually messaging. Many drop off before sending anything.
 *
 * This cron, ~7 minutes after the click, pushes the welcome template IF they
 * still haven't messaged on WhatsApp — routed by the page they came from
 * (pilot page → pilot welcome, anything else → generic). If they DID message,
 * the agent is already handling them, so we skip + clear the flag (never
 * double-greet).
 *
 * Schedule this URL in the same external scheduler that hits
 * /api/cron/booking-reminders (Bearer CRON_SECRET), e.g. every 5 minutes.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, logMessage, sendWelcomeTemplate, pickWelcomeTemplate } from '@/lib/services'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Wait window before pushing the welcome to a drop-off (founder: ~7 min).
const WAIT_MINUTES = 7
// Don't re-engage clicks older than this (avoids blasting an old backlog on
// first deploy; a click from days ago is cold and may have been handled).
const MAX_AGE_HOURS = 24

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServiceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'No Supabase client' }, { status: 500 })
  }

  const now = Date.now()
  const results = { checked: 0, sent: 0, already_messaged: 0, skipped: 0, errors: 0 }
  const log: string[] = []

  // Pending pop-up clicks awaiting a first message.
  const { data: pending, error: queryErr } = await supabase
    .from('all_leads')
    .select('id, customer_name, phone, unified_context')
    .filter('unified_context->>pending_wa_message', 'eq', 'true')
    .limit(200)

  if (queryErr) {
    return NextResponse.json({ success: false, error: queryErr.message }, { status: 500 })
  }

  for (const lead of pending || []) {
    results.checked++
    try {
      const ctx: any = lead.unified_context || {}
      const pendingAt = ctx.pending_wa_at ? new Date(ctx.pending_wa_at).getTime() : null
      if (!pendingAt || isNaN(pendingAt)) { results.skipped++; continue }

      const ageMin = (now - pendingAt) / 60_000
      if (ageMin < WAIT_MINUTES) { results.skipped++; continue }       // not waited long enough yet
      if (ageMin > MAX_AGE_HOURS * 60) {                                // too old — clear, don't send
        await clearFlag(supabase, lead.id, ctx)
        results.skipped++
        continue
      }

      // Did they actually message on WhatsApp since the click? If so, the agent
      // is handling them — skip + clear so we never double-greet.
      const { data: inbound } = await supabase
        .from('conversations')
        .select('id')
        .eq('lead_id', lead.id)
        .eq('channel', 'whatsapp')
        .eq('sender', 'customer')
        .gte('created_at', ctx.pending_wa_at)
        .limit(1)
        .maybeSingle()

      if (inbound) {
        await clearFlag(supabase, lead.id, ctx)
        results.already_messaged++
        continue
      }

      if (!lead.phone) { results.skipped++; continue }

      // Route by the page they came from (pilot → pilot welcome, else generic).
      const pageUrl = ctx.raw_form_fields?.page_url || null
      const sourceLabel = ctx.attribution?.source_label || null
      const tpl = pickWelcomeTemplate(pageUrl, sourceLabel)

      const result = await sendWelcomeTemplate(lead.phone, lead.customer_name || '', tpl)
      if (!result.success) {
        results.errors++
        log.push(`lead=${lead.id} send failed: ${result.error}`)
        // Clear anyway so a permanently-failing lead isn't retried every run.
        await clearFlag(supabase, lead.id, ctx)
        continue
      }

      const firstName = (lead.customer_name || 'there').split(' ')[0]
      await logMessage(
        lead.id,
        'whatsapp',
        'agent',
        `Hey ${firstName}! (${tpl} template)`,
        'template',
        { source: 'wa_prelaunch_welcome', template_name: tpl, page_url: pageUrl, trigger: 'popup_dropoff' },
        supabase,
      )
      await clearFlag(supabase, lead.id, ctx)
      results.sent++
    } catch (e: any) {
      results.errors++
      log.push(`lead=${lead.id} error: ${e?.message || e}`)
    }
  }

  return NextResponse.json({ success: true, results, log, timestamp: new Date(now).toISOString() })
}

/** Clear the pending flag (re-merge onto the snapshot ctx we already hold). */
async function clearFlag(supabase: any, leadId: string, ctx: any): Promise<void> {
  await supabase
    .from('all_leads')
    .update({
      unified_context: {
        ...ctx,
        pending_wa_message: false,
        pending_wa_resolved_at: new Date().toISOString(),
      },
    })
    .eq('id', leadId)
}
