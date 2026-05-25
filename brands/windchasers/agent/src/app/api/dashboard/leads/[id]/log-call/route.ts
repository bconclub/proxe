/**
 * Log Call — records the call activity, then routes through the shared
 * noteOrchestrator with the outcome as a strong classification signal.
 *
 *   "Connected"  + notes → classifier sees full text, e.g. POST_CALL / BOOKING_MADE / CONVERTED
 *   "No Answer"  / "Busy" / "Voicemail" → classifier (or shortcut) → RNR
 *      → triggers 4-step follow-up sequence + missed_call_followup task
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { classifyAndAct, getServiceClient, type CallOutcome } from '@/lib/services'

export const dynamic = 'force-dynamic'

const VALID_OUTCOMES: CallOutcome[] = ['Connected', 'No Answer', 'Busy', 'Voicemail']

/**
 * POST /api/dashboard/leads/[id]/log-call
 * Body: { outcome: 'Connected' | 'No Answer' | 'Busy' | 'Voicemail', notes?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const authClient = await createClient()

    const {
      data: { user },
    } = await authClient.auth.getUser()
    const createdBy = user?.email || 'system'
    const supabase = getServiceClient() || authClient

    const leadId = params.id
    const body = await request.json()
    const { outcome, notes } = body as { outcome: CallOutcome; notes?: string }

    if (!outcome || !VALID_OUTCOMES.includes(outcome)) {
      return NextResponse.json(
        { error: `Invalid outcome. Must be one of: ${VALID_OUTCOMES.join(', ')}` },
        { status: 400 },
      )
    }

    const trimmedNotes = (notes || '').trim()
    const activityNote = trimmedNotes ? `[${outcome}] ${trimmedNotes}` : `[${outcome}]`

    // 1. Insert manual_call activity (always, regardless of orchestration outcome)
    const { error: activityError } = await supabase.from('activities').insert({
      lead_id: leadId,
      activity_type: 'manual_call',
      note: activityNote,
      created_by: createdBy,
    })
    if (activityError) throw activityError

    const { data: leadForNotes, error: leadForNotesError } = await supabase
      .from('all_leads')
      .select('unified_context')
      .eq('id', leadId)
      .single()

    if (leadForNotesError || !leadForNotes) {
      throw leadForNotesError || new Error('Lead not found')
    }

    const existingCtx = leadForNotes.unified_context || {}
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

    if (noteUpdateError) throw noteUpdateError

    // 2. Run shared orchestrator — it classifies + executes all actions
    //    (cancel/create tasks, stage/score updates, WhatsApp sends, etc.)
    //
    //    For empty notes with no-live-contact outcomes (No Answer / Busy /
    //    Voicemail), the orchestrator shortcuts to RNR without burning a
    //    Haiku call — the 4-step follow-up sequence fires automatically.
    const result = await classifyAndAct({
      leadId,
      text: trimmedNotes,
      outcome,
      createdBy,
      supabase: supabase as any,
    })

    return NextResponse.json({
      success: true,
      outcome,
      ...result,
    })
  } catch (error) {
    console.error('[log-call] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
