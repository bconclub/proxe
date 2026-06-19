/**
 * Cron: BCON RNR follow-up sequence sender   (GET /api/cron/follow-up-sequence)
 *
 * SCAFFOLDED + GATED OFF. The note orchestrator schedules follow-up tasks when a
 * call is RNR (rang / no response). This processor fires a Meta-approved
 * re-engagement template on due tasks, stops the moment the lead replies on
 * WhatsApp, and caps sends per lead.
 *
 * ⚠️ GATE: this cron does NOTHING until `BCON_RNR_TEMPLATE` is set to a real
 * Meta-approved re-engagement template name (BCON's own — WC uses `rnr_sequence`,
 * BCON needs its own approved template). Until then every run early-returns a
 * no-op, so there are no broken Meta sends in production. To activate: get a
 * template approved in Meta Business Manager, set BCON_RNR_TEMPLATE (and, if the
 * template takes no {{1}} name param, adjust `components` below), then schedule
 * this URL (Bearer CRON_SECRET) every 5–10 min in the external scheduler.
 *
 * Unlike WC, BCON is single-segment: one template, no pilot/generic routing.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, logMessage, sendWhatsAppTemplate } from '@/lib/services'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const RNR_TASK_TYPES = ['missed_call_followup', 'follow_up_day1', 'follow_up_day3', 'follow_up_day5', 're_engage']
const MAX_RNR_SENDS = 2 // cap re-engagement touches per lead
const RNR_TEMPLATE = process.env.BCON_RNR_TEMPLATE || '' // GATE: empty = cron is off
const RNR_LANG = process.env.BCON_RNR_TEMPLATE_LANG || 'en'
const RNR_SOURCE = 'bcon_reengage' // metadata tag used to count prior sends

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const nowIso = new Date().toISOString()

  // GATE — scaffolded but inactive until a real approved template is configured.
  if (!RNR_TEMPLATE) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'BCON_RNR_TEMPLATE not set — re-engagement cron is scaffolded but gated OFF until a Meta-approved BCON template is configured.',
      timestamp: nowIso,
    })
  }

  const supabase = getServiceClient()
  if (!supabase) return NextResponse.json({ error: 'No Supabase client' }, { status: 500 })

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
      // Lead replied since the task was created? Then they re-engaged — cancel the
      // whole remaining sequence and stop (the agent is handling them).
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

      // How many re-engagement templates already went to this lead? (cap)
      const { data: priorMsgs } = await supabase
        .from('conversations')
        .select('metadata')
        .eq('lead_id', task.lead_id)
        .eq('sender', 'agent')
        .order('created_at', { ascending: false })
        .limit(40)
      const rnrSends = (priorMsgs || []).filter((m: any) => m?.metadata?.source === RNR_SOURCE).length

      if (rnrSends >= MAX_RNR_SENDS) {
        await markDone(supabase, task.id, nowIso)
        results.capped++
        continue
      }

      // Fresh lead context for phone + name.
      const { data: lead } = await supabase
        .from('all_leads')
        .select('phone, customer_name')
        .eq('id', task.lead_id)
        .maybeSingle()

      const phone = task.lead_phone || lead?.phone
      if (!phone) { await markDone(supabase, task.id, nowIso); results.skipped++; continue }

      const name = task.lead_name || lead?.customer_name || ''
      const firstName = (name || 'there').split(' ')[0]

      // Assumes the approved template has a single {{1}} body param for the first
      // name. If yours takes none, set components to [].
      const components = [
        { type: 'body' as const, parameters: [{ type: 'text' as const, text: firstName }] },
      ]

      const result = await sendWhatsAppTemplate(phone, RNR_TEMPLATE, components, RNR_LANG)
      if (!result.success) {
        await markDone(supabase, task.id, nowIso) // don't retry a failing send forever
        results.errors++
        log.push(`task=${task.id} send failed: ${result.error}`)
        continue
      }

      await logMessage(
        task.lead_id,
        'whatsapp',
        'agent',
        `Hi ${firstName}! (${RNR_TEMPLATE} template)`,
        'template',
        { source: RNR_SOURCE, template_name: RNR_TEMPLATE, step: rnrSends + 1, trigger: task.task_type },
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
