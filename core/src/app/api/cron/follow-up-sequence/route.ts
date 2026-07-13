/**
 * Cron: RNR follow-up sequence sender
 * GET /api/cron/follow-up-sequence
 *
 * The note orchestrator schedules follow-up tasks when a call is RNR (rang/no
 * response) — missed_call_followup (+30m) and follow_up_day1/3/5 + re_engage —
 * but nothing was SENDING them. This processor fires the Meta-approved
 * re-engagement templates on due tasks:
 *   - first touch  → rnr_{pilot|generic}_1_v1
 *   - second touch → rnr_{pilot|generic}_2_v1
 * routed pilot vs generic by the lead's source, capped at 2 sends per lead.
 *
 * Stops the moment the lead replies on WhatsApp (cancels the rest of the
 * sequence). Templates bypass the 24h window, which is exactly why we use them
 * here for cold re-engagement.
 *
 * Schedule this URL in the same external scheduler as the other crons
 * (Bearer CRON_SECRET), e.g. every 5-10 minutes.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  getServiceClient,
  logMessage,
  sendWelcomeTemplate,
  sendNamedTemplate,
  isPilotSource,
  pickRnrTemplate,
} from '@/lib/services'
import { BRAND_ID } from '@/configs'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const RNR_TASK_TYPES = ['missed_call_followup', 'follow_up_day1', 'follow_up_day3', 'follow_up_day5', 're_engage']
// windchasers has two approved steps; bcon's ladder is rnr_1 + 3x rnr_2 (day
// 1/3/5) with re_engage on the non-RNR re-engagement template.
const MAX_RNR_SENDS = BRAND_ID === 'bcon' ? 4 : 2

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServiceClient()
  if (!supabase) return NextResponse.json({ error: 'No Supabase client' }, { status: 500 })

  const nowIso = new Date().toISOString()
  const results = { due: 0, sent: 0, replied_cancelled: 0, capped: 0, skipped: 0, errors: 0 }
  const log: string[] = []

  // Due RNR follow-up tasks, oldest first.
  const { data: due, error } = await supabase
    .from('agent_tasks')
    .select('id, lead_id, lead_phone, lead_name, task_type, scheduled_at, created_at, metadata')
    .in('task_type', RNR_TASK_TYPES)
    .eq('status', 'pending')
    .lte('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true })
    .limit(100)

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  for (const task of due || []) {
    results.due++
    try {
      // Lead replied since the task was created? Then they re-engaged — cancel
      // the whole remaining sequence and stop (the agent is handling them).
      const { data: replied } = await supabase
        .from('conversations')
        .select('id')
        .eq('lead_id', task.lead_id)
        .eq('channel', 'whatsapp')
        .eq('sender', 'customer')
        .gte('created_at', task.created_at)
        .limit(1)
        .maybeSingle()

      if (replied) {
        await supabase
          .from('agent_tasks')
          .update({ status: 'cancelled', completed_at: nowIso })
          .eq('lead_id', task.lead_id)
          .in('task_type', RNR_TASK_TYPES)
          .eq('status', 'pending')
        results.replied_cancelled++
        continue
      }

      // How many RNR templates already went to this lead? (cap at 2)
      const { data: priorMsgs } = await supabase
        .from('conversations')
        .select('metadata')
        .eq('lead_id', task.lead_id)
        .eq('sender', 'agent')
        .order('created_at', { ascending: false })
        .limit(40)
      const rnrSends = (priorMsgs || []).filter((m: any) =>
        /(^|_)rnr_/.test(String(m?.metadata?.template_name || '')), // rnr_* (windchasers) + bcon_service_rnr_* (bcon)
      ).length

      if (rnrSends >= MAX_RNR_SENDS) {
        await markDone(supabase, task.id, nowIso)
        results.capped++
        continue
      }

      // Fresh lead context for phone + pilot/generic routing.
      const { data: lead } = await supabase
        .from('all_leads')
        .select('phone, customer_name, unified_context')
        .eq('id', task.lead_id)
        .maybeSingle()

      const phone = task.lead_phone || lead?.phone
      if (!phone) { await markDone(supabase, task.id, nowIso); results.skipped++; continue }

      const ctx: any = lead?.unified_context || {}
      const name = task.lead_name || lead?.customer_name || ''
      const firstOnly = ((/\d/.test(name) ? '' : name) || 'there').split(' ')[0]
      const step: 1 | 2 = rnrSends === 0 ? 1 : 2
      let tpl: string
      let result: { success: boolean; error?: string; messageId?: string }

      if (BRAND_ID === 'bcon') {
        // bcon: approved pair with 3 NAMED params. re_engage closes the ladder
        // on the (single-param) re-engagement template instead of a third RNR.
        const serviceName = ctx.service_interest || ctx.bcon?.service_interest || ctx.form_data?.service_interest || 'our services'
        const brandName = ctx.company || ctx.form_data?.brand_name || ctx.bcon?.company || 'your business'
        if (task.task_type === 're_engage') {
          tpl = 'bcon_proxe_reengagement_noengage'
          result = await sendWelcomeTemplate(phone, name, tpl)
        } else {
          tpl = step === 1 ? 'bcon_service_rnr_1_v1' : 'bcon_service_rnr_2_v1'
          result = await sendNamedTemplate(phone, tpl, [
            { name: 'customer_name', value: firstOnly },
            { name: 'service_name', value: serviceName },
            { name: 'brand_name', value: brandName },
          ])
        }
      } else {
        const isPilot = isPilotSource(
          ctx.raw_form_fields?.page_url,
          ctx.attribution?.source_label,
          ctx.windchasers?.course_interest,
          ctx.course_interest,
        )
        tpl = pickRnrTemplate(isPilot, step)
        result = await sendWelcomeTemplate(phone, name, tpl) // single customer_name param
      }
      if (!result.success) {
        await markDone(supabase, task.id, nowIso) // don't retry a failing send forever
        results.errors++
        log.push(`task=${task.id} send failed: ${result.error}`)
        continue
      }

      const firstName = (name || 'there').split(' ')[0]
      await logMessage(
        task.lead_id,
        'whatsapp',
        'agent',
        `Hi ${firstName}! (${tpl} template)`,
        'template',
        { source: 'rnr_sequence', template_name: tpl, step, trigger: task.task_type },
        supabase,
      )
      await markDone(supabase, task.id, nowIso)
      results.sent++
    } catch (e: any) {
      results.errors++
      log.push(`task=${task.id} error: ${e?.message || e}`)
    }
  }

  return NextResponse.json({ success: true, results, log, timestamp: nowIso })
}

async function markDone(supabase: any, taskId: string, nowIso: string): Promise<void> {
  await supabase
    .from('agent_tasks')
    .update({ status: 'completed', completed_at: nowIso })
    .eq('id', taskId)
}
