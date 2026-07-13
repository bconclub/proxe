/**
 * Log Call — records the call activity, then either:
 *
 *  1. HUMAN-DECISION mode (body has `decision` — sent only by bcon's
 *     LogCallDecisionHub): the human reviewed the AI's proposed plan at the hub
 *     and picked an action. We log the call, save a rich decision_log record
 *     (context + ai plan + human choice + agreement) for the brain to learn
 *     from, execute the chosen action, and mark the lead human-owned so the
 *     worker stops its generic auto-cadence.
 *  2. LEGACY auto mode (no `decision` — every other brand, and bcon's plain
 *     quick-log): routes through the shared noteOrchestrator with the outcome
 *     as a strong classification signal.
 *       "Connected"  + notes → classifier sees full text, e.g. POST_CALL / BOOKING_MADE / CONVERTED
 *       "No Answer"  / "Busy" / "Voicemail" → classifier (or shortcut) → RNR
 *          → triggers 4-step follow-up sequence + missed_call_followup task
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { classifyAndAct, getServiceClient, resolveBookingDate, type CallOutcome } from '@/lib/services'
import { assignOwnerOnTouch } from '@/lib/services/leadOwnership'
import { canAccessLeadId } from '@/lib/services/leadAccess'
import { BRAND_ID } from '@/configs'

export const dynamic = 'force-dynamic'

const VALID_OUTCOMES: CallOutcome[] = ['Connected', 'No Answer', 'Busy', 'Voicemail']

type HubAction = 'book' | 'move' | 'sequence' | 'task' | 'close' | 'none'
interface HumanDecision {
  action: HubAction
  reason?: string
  detail?: {
    stage?: string
    sequence?: 'ghost' | 'engaged' | 'reengage'
    date?: string
    time?: string
    note?: string
  }
}

// Sequences offered by the hub map to the three flows (hand back to AI).
const SEQUENCES: Record<string, Array<{ type: string; offsetMs: number }>> = {
  ghost: [
    { type: 'follow_up_24h', offsetMs: 24 * 3600e3 },
    { type: 'follow_up_day3', offsetMs: 3 * 86400e3 },
    { type: 'follow_up_day7', offsetMs: 7 * 86400e3 },
  ],
  engaged: [
    { type: 'follow_up_day1', offsetMs: 1 * 86400e3 },
    { type: 'follow_up_day3', offsetMs: 3 * 86400e3 },
    { type: 'follow_up_day5', offsetMs: 5 * 86400e3 },
  ],
  reengage: [
    { type: 're_engage', offsetMs: 2 * 86400e3 },
  ],
}

const PENDING = ['pending', 'queued', 'in_queue', 'awaiting_approval']
const AUTO_FOLLOWUP_TYPES = ['follow_up_24h', 'follow_up_day1', 'follow_up_day3', 'follow_up_day5', 'follow_up_day7', 'follow_up_day30', 'follow_up_day90', 're_engage', 'nudge_waiting', 'push_to_book', 'missed_call_followup', 'post_call_followup']

/** Loose agreement: did the human land on the same family the brain proposed? */
function computeAgreement(aiAction: string | undefined, humanAction: HubAction): { matched: boolean; delta: string } {
  const family: Record<string, string> = {
    book: 'book', post_call: 'task', sequence: 'sequence', close: 'close', nurture: 'sequence', message: 'task', none: 'none',
    move: 'close', task: 'task',
  }
  const ai = family[aiAction || 'none'] || 'none'
  const human = family[humanAction] || humanAction
  return { matched: ai === human, delta: `ai:${aiAction || 'none'} → human:${humanAction}` }
}

/**
 * POST /api/dashboard/leads/[id]/log-call
 * Body: { outcome: 'Connected' | 'No Answer' | 'Busy' | 'Voicemail', notes?,
 *         decision?, ai_proposed_plan?, context_snapshot? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  let noteSaved = false // once true, this route must never return an error
  try {
    const authClient = await createClient()

    const {
      data: { user },
    } = await authClient.auth.getUser()
    const createdBy = user?.email || 'system'
    // activities.created_by is a UUID column on the older Windchasers-era
    // schemas — only ever a real user id, else null (email throws 22P02 and
    // 500s the whole log). BCON's schema stores text, and its fork logs the
    // email + 'manual_call' type; keep each brand on its live shape.
    const activityCreatedBy = BRAND_ID === 'bcon' ? createdBy : (user?.id || null)
    const activityType = BRAND_ID === 'bcon' ? 'manual_call' : 'call'
    const supabase = getServiceClient() || authClient

    const leadId = params.id

    // Lead-type access: restricted users can't act on leads outside their courses.
    if (user?.id && !(await canAccessLeadId(supabase, user.id, leadId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { outcome: rawOutcome, notes } = body as { outcome: CallOutcome; notes?: string }
    const decision = body?.decision as HumanDecision | undefined
    const aiProposedPlan = body?.ai_proposed_plan || null
    const contextSnapshot = body?.context_snapshot || null

    if (!rawOutcome || !VALID_OUTCOMES.includes(rawOutcome)) {
      return NextResponse.json(
        { error: `Invalid outcome. Must be one of: ${VALID_OUTCOMES.join(', ')}` },
        { status: 400 },
      )
    }

    const trimmedNotes = (notes || '').trim()
    // "Connected" left selected while the note clearly says nobody answered
    // (RNR etc.) is a mis-tap — normalize so the badge, note text, and the
    // classifier all agree with what actually happened.
    const RNR_TEXT = /\b(rnr|no answer|didn'?t pick|did ?not pick|no response|not responding|not replying|rang no|ring no|voicemail|busy|switched off|unreachable|not reachable|no show)\b/i
    const outcome: CallOutcome = rawOutcome === 'Connected' && RNR_TEXT.test(trimmedNotes) ? 'No Answer' : rawOutcome
    const activityNote = trimmedNotes ? `[${outcome}] ${trimmedNotes}` : `[${outcome}]`

    // 1. Insert call activity (always, regardless of orchestration outcome).
    const { error: activityError } = await supabase.from('activities').insert({
      lead_id: leadId,
      activity_type: activityType,
      note: activityNote,
      created_by: activityCreatedBy,
    })
    if (activityError) console.error('[log-call] activity insert failed (continuing — note is primary):', activityError.message)

    const { data: leadRow, error: leadErr } = await supabase
      .from('all_leads')
      .select('unified_context, customer_name, customer_phone_normalized, phone')
      .eq('id', leadId)
      .single()

    if (leadErr || !leadRow) {
      throw leadErr || new Error('Lead not found')
    }

    const existingCtx = leadRow.unified_context || {}
    const existingNotes: any[] = existingCtx.admin_notes || []
    const visibleNoteText = trimmedNotes
      ? `Call logged - ${outcome}: ${trimmedNotes}`
      : `Call logged - ${outcome}`
    const visibleNote = {
      id: `call_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      text: visibleNoteText,
      created_by: createdBy,
      created_at: new Date().toISOString(),
      source: 'log_call',
      outcome,
    }

    const { error: noteUpdateError } = await supabase
      .from('all_leads')
      .update({
        unified_context: {
          ...existingCtx,
          admin_notes: [...existingNotes, visibleNote],
        },
      })
      .eq('id', leadId)

    if (noteUpdateError && activityError) throw noteUpdateError // nothing persisted — honest failure
    if (noteUpdateError) console.error('[log-call] visible-note update failed (activity saved):', noteUpdateError.message)
    // From here on the call IS logged — nothing below may surface as an error.
    noteSaved = true

    // Logging a call = "I'm working this lead now" → become the owner.
    // Done BEFORE the orchestrator so its fresh context re-read keeps the owner.
    await assignOwnerOnTouch(supabase, leadId, user)

    // ── LEGACY auto mode: no human decision → classify + act as before ───────
    if (!decision) {
      const result = await classifyAndAct({
        leadId,
        text: trimmedNotes,
        outcome,
        createdBy,
        supabase: supabase as any,
      })
      return NextResponse.json({ success: true, outcome, mode: 'auto', ...result })
    }

    // ── HUMAN-DECISION mode (bcon LogCallDecisionHub commit) ─────────────────
    const leadName = leadRow.customer_name || 'Lead'
    const leadPhone = leadRow.customer_phone_normalized || leadRow.phone?.replace(/\D/g, '').slice(-10) || null
    const now = new Date()
    const actionsTaken: string[] = []
    let newStage: string | null = null
    let bookingVoice: Record<string, any> | null = null

    const detail = decision.detail || {}

    // ── "Accept the plan" → actually EXECUTE what the brain proposed ──────────
    // The classifier reads the note (e.g. "demo on 2nd July 4pm") and runs the
    // full orchestration: parse + store the booking, create reminders, set the
    // stage. Accepting must DO the plan, not just log it.
    if (decision.action === 'none') {
      const result = await classifyAndAct({ leadId, text: trimmedNotes, outcome, createdBy, supabase: supabase as any })
      const acceptRecord = {
        id: `dec_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        at: now.toISOString(), decided_by: createdBy, outcome,
        call_note: trimmedNotes || null, context_snapshot: contextSnapshot,
        ai_proposed_plan: aiProposedPlan,
        // Accepting = the human endorsed the AI's action, so record THAT action
        // (not "none") with accepted=true, so the Learning readout is meaningful.
        human_decision: { action: aiProposedPlan?.action || 'none', accepted: true, detail: {}, reason: decision.reason || null },
        agreement: { matched: true, delta: `accepted ai:${aiProposedPlan?.action || 'none'}` },
      }
      // Re-fetch AFTER classifyAndAct (it rewrites unified_context) then append.
      const { data: cr } = await supabase.from('all_leads').select('unified_context').eq('id', leadId).maybeSingle()
      const c = cr?.unified_context || {}
      const dl = Array.isArray(c.decision_log) ? c.decision_log : []
      await supabase.from('all_leads').update({
        unified_context: { ...c, decision_log: [...dl, acceptRecord] },
      }).eq('id', leadId)
      return NextResponse.json({ success: true, outcome, mode: 'accept', ...result })
    }

    // "task" and "book" keep the lead human-owned (you handle it).
    // "sequence" hands it back to the AI. Others just set state.
    const handBackToAi = decision.action === 'sequence'

    // Cancel the generic auto-cadence unless we're explicitly re-enrolling.
    if (decision.action !== 'sequence') {
      const { data: cancelled } = await supabase
        .from('agent_tasks')
        .update({ status: 'cancelled', completed_at: now.toISOString(), error_message: `Cancelled: human chose '${decision.action}' at log-call hub` })
        .eq('lead_id', leadId)
        .in('task_type', AUTO_FOLLOWUP_TYPES)
        .in('status', PENDING)
        .select('id')
      if (cancelled?.length) actionsTaken.push(`Cancelled ${cancelled.length} pending auto follow-ups`)
    }

    if (decision.action === 'book' && (detail.date || detail.time)) {
      const bookingAt = resolveBookingDate(detail.date || 'tomorrow', detail.time || null)
      const timeDisp = detail.time || 'scheduled time'
      const r24 = new Date(bookingAt.getTime() - 24 * 3600e3)
      const r30 = new Date(bookingAt.getTime() - 30 * 60e3)
      if (r24 > now) await supabase.from('agent_tasks').insert({ task_type: 'booking_reminder_24h', task_description: `24h reminder: ${leadName} at ${timeDisp}`, lead_id: leadId, lead_phone: leadPhone, lead_name: leadName, status: 'pending', scheduled_at: r24.toISOString(), metadata: { source: 'log_call_hub', booking_time: timeDisp, sequence: 'booking' }, created_at: now.toISOString() })
      if (r30 > now) await supabase.from('agent_tasks').insert({ task_type: 'booking_reminder_30m', task_description: `30min reminder: ${leadName}`, lead_id: leadId, lead_phone: leadPhone, lead_name: leadName, status: 'pending', scheduled_at: r30.toISOString(), metadata: { source: 'log_call_hub', booking_time: timeDisp, sequence: 'booking' }, created_at: now.toISOString() })
      newStage = 'Booking Made'
      // Store the booking so the Key Event / Upcoming widgets update (mirrors
      // the orchestrator's BOOKING_MADE behaviour).
      bookingVoice = {
        booking_date: bookingAt.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
        booking_time: bookingAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }),
        booking_status: 'Call Booked',
        booking_created_at: now.toISOString(),
      }
      actionsTaken.push(`Booking reminders set for ${detail.date || 'tomorrow'} ${timeDisp}`)
    } else if (decision.action === 'move' && detail.stage) {
      newStage = detail.stage
      actionsTaken.push(`Moved to ${detail.stage}`)
    } else if (decision.action === 'close' && detail.stage) {
      newStage = detail.stage
      actionsTaken.push(`Closed as ${detail.stage}`)
    } else if (decision.action === 'sequence' && detail.sequence) {
      const seq = SEQUENCES[detail.sequence] || []
      for (const s of seq) {
        await supabase.from('agent_tasks').insert({ task_type: s.type, task_description: `${detail.sequence} sequence: ${s.type} for ${leadName}`, lead_id: leadId, lead_phone: leadPhone, lead_name: leadName, status: 'pending', scheduled_at: new Date(now.getTime() + s.offsetMs).toISOString(), metadata: { source: 'log_call_hub', sequence: detail.sequence } , created_at: now.toISOString() })
      }
      newStage = 'In Sequence'
      actionsTaken.push(`Enrolled in ${detail.sequence} sequence (${seq.length} steps)`)
    } else if (decision.action === 'task' && (detail.date || detail.time)) {
      const dueAt = resolveBookingDate(detail.date || 'tomorrow', detail.time || null)
      await supabase.from('agent_tasks').insert({
        task_type: 'human_followup',
        task_description: detail.note || `Follow up with ${leadName}`,
        lead_id: leadId, lead_phone: leadPhone, lead_name: leadName,
        status: 'pending', scheduled_at: dueAt.toISOString(),
        metadata: { source: 'log_call_hub', remind_via: 'telegram', owner_email: createdBy, note: detail.note || null, human_task: true },
        created_at: now.toISOString(),
      })
      actionsTaken.push(`Reminder set for ${detail.date || 'tomorrow'} ${detail.time || ''}`.trim())
    }

    // 2. The learning record — context + ai plan + human choice + agreement.
    //    activities has no metadata column in BCON, so the structured record
    //    lives in unified_context.decision_log[] (same JSONB home as admin_notes).
    //    The Learning view rolls these up across leads.
    const agreement = computeAgreement(aiProposedPlan?.action, decision.action)
    const decisionRecord = {
      id: `dec_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      at: now.toISOString(),
      decided_by: createdBy,
      outcome,
      call_note: trimmedNotes || null,
      context_snapshot: contextSnapshot,
      ai_proposed_plan: aiProposedPlan,
      human_decision: { action: decision.action, detail, reason: decision.reason || null },
      agreement,
    }

    // 3. Apply stage + ownership flag + append the learning record.
    const { data: ctxRow } = await supabase.from('all_leads').select('unified_context').eq('id', leadId).maybeSingle()
    const ctx2 = ctxRow?.unified_context || {}
    const decisionLog: any[] = Array.isArray(ctx2.decision_log) ? ctx2.decision_log : []
    await supabase.from('all_leads').update({
      ...(newStage ? { lead_stage: newStage, stage_override: true } : {}),
      unified_context: {
        ...ctx2,
        owned_by_human: !handBackToAi,
        unified_summary: null,
        decision_log: [...decisionLog, decisionRecord],
        ...(bookingVoice ? { voice: { ...(ctx2.voice || {}), ...bookingVoice } } : {}),
      },
    }).eq('id', leadId)

    // 4. Plain (metadata-free) activity row so the decision shows in the timeline.
    await supabase.from('activities').insert({
      lead_id: leadId,
      activity_type: 'automation',
      note: `Decision: human chose '${decision.action}'${decision.reason ? ` (${decision.reason})` : ''} — AI proposed '${aiProposedPlan?.action || 'none'}', ${agreement.matched ? 'matched' : 'overridden'}${actionsTaken.length ? `. ${actionsTaken.join(', ')}` : ''}`,
      created_by: 'PROXe AI',
    })

    return NextResponse.json({ success: true, outcome, mode: 'human', actions_taken: actionsTaken, new_stage: newStage, owned_by_human: !handBackToAi, agreement })
  } catch (error) {
    console.error('[log-call] Error:', error)
    // The call note is already saved — surface a calm degraded result instead
    // of an error. The founder's log must NEVER appear to fail after the fact.
    if (noteSaved) {
      return NextResponse.json({
        success: true,
        mode: 'logged_only',
        actions_taken: ['Call note saved — follow-up automation hit a snag and was skipped'],
        orchestration_error: error instanceof Error ? error.message : 'unknown',
      })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
