import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/services'
import { sendWhatsAppTemplate } from '@/lib/services/whatsappSender'
import { BRAND_ID } from '@/configs'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/cron/campaign-send
 *
 * Sends scheduled campaigns, slowly and on the record.
 *
 * Slowly, because a hundred identical marketing templates leaving one number
 * inside a minute is what gets a WABA rate-limited or flagged. PER_MINUTE
 * paces it; the cron interval decides how many go per run.
 *
 * On the record, because "sent" has to be auditable per person. Every
 * recipient gets a campaign_sends row BEFORE the send is attempted, and the
 * unique index on (campaign_id, lead_id) is what makes a double-fired cron
 * harmless: the second insert conflicts, and that recipient is skipped rather
 * than messaged twice.
 *
 * Nothing here decides WHO gets messaged - the campaign's stored audience
 * filter does. This route only walks that list.
 */

const PER_MINUTE = 2
const CRON_MINUTES = 10
/** Ceiling per run. The CRON INTERVAL is what paces the campaign, not a sleep
 *  inside the function: at 2/min over a 10-minute gap this is the whole budget. */
const MAX_PER_RUN = PER_MINUTE * CRON_MINUTES

/**
 * Gap between sends INSIDE one run. Deliberately small.
 *
 * This was 30s - 60s/PER_MINUTE - which made a full batch need ten minutes
 * while the function is killed at sixty seconds. Each run managed two sends
 * before dying, so 154 messages took twelve hours instead of one, and the
 * counter update at the end of the loop was never reached.
 *
 * The rate is the cron's job. Twenty sends spaced a second apart finish in
 * twenty seconds, and the next run is ten minutes later: still 2/minute.
 */
const GAP_MS = 1_000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Audience -> leads. Only the filters the builder can actually produce. */
async function resolveAudience(supabase: any, filters: Record<string, any>, limit: number) {
  let q = supabase
    .from('all_leads')
    .select('id, customer_name, phone, customer_phone_normalized')
    .limit(limit)

  if (filters?.offline_event_key) {
    q = q.eq(`unified_context->${BRAND_ID}->>offline_event_key`, String(filters.offline_event_key))
  }
  if (filters?.offline_event_intent) {
    q = q.eq(`unified_context->${BRAND_ID}->>offline_event_intent`, String(filters.offline_event_intent))
  }
  if (filters?.lead_stage) q = q.eq('lead_stage', String(filters.lead_stage))

  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data || []
}

export async function GET(request: NextRequest) {
  try {
    const supabase: any = getServiceClient()
    if (!supabase) return NextResponse.json({ error: 'Service client unavailable' }, { status: 500 })

    // A test run sends to ONE number and touches no campaign state - it proves
    // the template renders before 122 people see it.
    const testPhone = request.nextUrl.searchParams.get('test_phone')
    const campaignId = request.nextUrl.searchParams.get('campaign_id')

    const now = new Date().toISOString()

    const { data: due, error: dueErr } = await supabase
      .from('campaigns')
      .select('*')
      .in('status', ['ready', 'sending'])
      .not('scheduled_at', 'is', null)
      .lte('scheduled_at', now)
      .order('scheduled_at', { ascending: true })
      .limit(1)

    if (dueErr) return NextResponse.json({ error: dueErr.message }, { status: 500 })

    const campaign = campaignId
      ? (await supabase.from('campaigns').select('*').eq('id', campaignId).maybeSingle()).data
      : (due || [])[0]

    if (!campaign) return NextResponse.json({ ok: true, skipped: 'nothing due' })

    const tpl = campaign.template || {}
    if (!tpl.name) {
      return NextResponse.json({ ok: false, error: 'campaign has no template' }, { status: 400 })
    }

    /** Body vars + the URL button's path segment, per recipient. */
    const componentsFor = (name: string) => {
      const first = String(name || '').split(' ')[0] || 'there'
      return [
        {
          type: 'body' as const,
          parameters: [{ type: 'text', parameter_name: 'customer_name', text: first }],
        },
        // The approved button is https://windchasers.in/{{1}} - the variable is
        // the path, so the tap lands on the track chooser.
        {
          type: 'button' as const,
          sub_type: 'url' as const,
          index: 0,
          parameters: [{ type: 'text', text: String(tpl.buttonParam || 'scholarship') }],
        },
      ]
    }

    if (testPhone) {
      const res = await sendWhatsAppTemplate(testPhone, tpl.name, componentsFor('there') as any)
      return NextResponse.json({ ok: res.success, test: true, to: testPhone, template: tpl.name, error: res.error || null })
    }

    // Claim the campaign so a second cron tick doesn't start it again.
    if (campaign.status === 'ready') {
      await supabase.from('campaigns').update({ status: 'sending', updated_at: now }).eq('id', campaign.id)
    }

    const audience = await resolveAudience(supabase, campaign.audience?.filters || {}, 2000)

    // Who already has a row - sent, failed or skipped - is who we do not touch.
    const { data: already } = await supabase
      .from('campaign_sends')
      .select('lead_id')
      .eq('campaign_id', campaign.id)
    const done = new Set((already || []).map((r: any) => r.lead_id))

    const pending = audience.filter((l: any) => !done.has(l.id))
    const batch = pending.slice(0, MAX_PER_RUN)

    let sent = 0
    let failed = 0
    let consecutiveFailures = 0

    for (const lead of batch) {
      const phone = lead.customer_phone_normalized || lead.phone
      if (!phone) {
        await supabase.from('campaign_sends').insert({
          campaign_id: campaign.id, lead_id: lead.id, phone: null,
          status: 'skipped', error: 'no phone', template_name: tpl.name,
        })
        continue
      }

      // Claim FIRST. If the send half-succeeds or this function dies mid-flight,
      // the row already exists and nobody gets a second message.
      const { error: claimErr } = await supabase.from('campaign_sends').insert({
        campaign_id: campaign.id, lead_id: lead.id, phone, status: 'pending',
        // WHICH message this was. A campaign sends several times over its
        // life and without this every send collapses into one total.
        template_name: tpl.name,
      })
      if (claimErr) continue // unique violation = another run has this one

      let ok = false
      let err = ''
      let msgId: string | null = null
      try {
        const res = await sendWhatsAppTemplate(phone, tpl.name, componentsFor(lead.customer_name) as any)
        ok = res.success
        err = res.error || ''
        msgId = (res as any).messageId || null
      } catch (e: any) {
        err = e?.message || 'send failed'
      }

      await supabase
        .from('campaign_sends')
        .update({
          status: ok ? 'sent' : 'failed',
          error: ok ? null : err.slice(0, 300),
          message_id: msgId,
        })
        .eq('campaign_id', campaign.id)
        .eq('lead_id', lead.id)

      // Log it as a conversation too. Not bookkeeping for its own sake: the
      // delivery webhook finds a message by metadata.wa_message_id and stamps
      // delivered/read onto that row, and the campaigns report reads those
      // stamps. Without this the send is invisible to both - which is why a
      // campaign that reached 154 people showed "0 sent, 0 campaigns".
      if (ok) {
        await supabase.from('conversations').insert({
          lead_id: lead.id,
          channel: 'whatsapp',
          sender: 'agent',
          content: String(tpl.body || `Campaign: ${campaign.name}`).slice(0, 2000),
          message_type: 'template',
          metadata: {
            template_name: tpl.name,
            template_language: 'en',
            wa_message_id: msgId,
            delivery_status: 'sent',
            auto_sent: true,
            trigger: 'campaign',
            campaign: campaign.id,
            campaign_name: campaign.name,
            sent_by: 'system (campaign)',
          },
        })
      }

      if (ok) { sent++; consecutiveFailures = 0 } else { failed++; consecutiveFailures++ }

      // Counters go up AS WE GO, not at the end. A run that dies partway
      // through - a timeout, a cold-start kill - must still leave behind a
      // truthful count, or the campaign reads "not sent yet" while a hundred
      // people have the message.
      await supabase
        .from('campaigns')
        .update({
          sent_count: (campaign.sent_count || 0) + sent,
          failed_count: (campaign.failed_count || 0) + failed,
          updated_at: new Date().toISOString(),
        })
        .eq('id', campaign.id)

      // Something systemic is wrong - a dead token, a paused number, a template
      // pulled from under us. Stop and leave the rest of the list intact.
      if (consecutiveFailures >= 5) break

      await sleep(GAP_MS)
    }

    const remaining = pending.length - batch.length
    const finished = remaining <= 0 && consecutiveFailures < 5

    await supabase
      .from('campaigns')
      .update({
        status: finished ? 'sent' : 'sending',
        sent_count: (campaign.sent_count || 0) + sent,
        failed_count: (campaign.failed_count || 0) + failed,
        ...(finished ? { sent_at: new Date().toISOString() } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaign.id)

    return NextResponse.json({
      ok: true,
      campaign: campaign.id,
      sent,
      failed,
      remaining,
      finished,
      halted: consecutiveFailures >= 5,
    })
  } catch (error: any) {
    console.error('[campaign-send] failed:', error?.message || error)
    return NextResponse.json({ error: error?.message || 'unknown' }, { status: 500 })
  }
}
