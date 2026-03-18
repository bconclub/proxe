import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Parse a time reference from note text and return a scheduled_at Date in IST.
 */
function parseCallbackTime(noteText: string): Date | null {
  const lower = noteText.toLowerCase()
  const now = new Date()
  const istOffsetMs = 5.5 * 60 * 60 * 1000
  const nowIST = new Date(now.getTime() + istOffsetMs)

  const atTimeMatch = lower.match(/(?:call\s*(?:back)?|follow\s*up)\s*(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
  if (atTimeMatch) {
    let hour = parseInt(atTimeMatch[1])
    const minutes = atTimeMatch[2] ? parseInt(atTimeMatch[2]) : 0
    const ampm = atTimeMatch[3]?.toLowerCase()
    if (ampm === 'am' && hour === 12) hour = 0
    else if (ampm === 'pm' && hour !== 12) hour += 12
    else if (!ampm && hour >= 1 && hour <= 8) hour += 12
    const scheduled = new Date(nowIST)
    scheduled.setUTCHours(hour, minutes, 0, 0)
    return new Date(scheduled.getTime() - istOffsetMs)
  }

  if (lower.includes('tomorrow')) {
    const tomorrow = new Date(nowIST)
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
    tomorrow.setUTCHours(10, 0, 0, 0)
    return new Date(tomorrow.getTime() - istOffsetMs)
  }

  const inDaysMatch = lower.match(/(?:follow\s*up|call\s*(?:back)?)\s*in\s+(\d+)\s*days?/)
  if (inDaysMatch) {
    const days = parseInt(inDaysMatch[1])
    const future = new Date(nowIST)
    future.setUTCDate(future.getUTCDate() + days)
    future.setUTCHours(10, 0, 0, 0)
    return new Date(future.getTime() - istOffsetMs)
  }

  return null
}

function hasCallbackIntent(noteText: string): boolean {
  const lower = noteText.toLowerCase()
  return /call\s*back|call\s*at\s+\d|call\s*tomorrow|follow\s*up/.test(lower)
}

/**
 * POST /api/dashboard/leads/[id]/log-call
 * Log a manual call outcome with optional notes.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    const createdBy = user?.email || 'system'

    const leadId = params.id
    const body = await request.json()
    const { outcome, notes } = body

    const validOutcomes = ['Connected', 'No Answer', 'Busy', 'Voicemail']
    if (!outcome || !validOutcomes.includes(outcome)) {
      return NextResponse.json({ error: 'Invalid outcome. Must be one of: ' + validOutcomes.join(', ') }, { status: 400 })
    }

    // 1. Fetch lead data
    const { data: lead, error: leadError } = await supabase
      .from('all_leads')
      .select('unified_context, customer_name, customer_phone_normalized, phone')
      .eq('id', leadId)
      .single()

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    const actions: string[] = []
    const leadPhone = lead.customer_phone_normalized || lead.phone?.replace(/\D/g, '').slice(-10) || null
    const leadName = lead.customer_name || 'Lead'

    // 2. Insert activity record
    await supabase
      .from('activities')
      .insert({
        lead_id: leadId,
        activity_type: 'manual_call',
        note: notes ? `[${outcome}] ${notes.trim()}` : `[${outcome}]`,
        created_by: createdBy,
      })

    // 3. Update last_interaction_at and last_touchpoint
    await supabase
      .from('all_leads')
      .update({
        last_interaction_at: new Date().toISOString(),
        last_touchpoint: 'voice',
      })
      .eq('id', leadId)

    // 4. Invalidate cached summary
    const existingCtx = lead.unified_context || {}
    await supabase
      .from('all_leads')
      .update({ unified_context: { ...existingCtx, unified_summary: null } })
      .eq('id', leadId)

    // 5. "No Answer" → auto-create missed_call_followup task
    if (outcome === 'No Answer') {
      const scheduledAt = new Date(Date.now() + 5 * 60 * 1000) // 5 minutes from now
      const { error: taskError } = await supabase
        .from('agent_tasks')
        .insert({
          task_type: 'missed_call_followup',
          task_description: `Missed call follow-up for ${leadName}`,
          lead_id: leadId,
          lead_phone: leadPhone,
          lead_name: leadName,
          status: 'pending',
          scheduled_at: scheduledAt.toISOString(),
          metadata: { source: 'log_call', outcome },
          created_at: new Date().toISOString(),
        })
      if (taskError) {
        console.error('[LogCall] Failed to create missed_call_followup task:', taskError.message)
      } else {
        actions.push(`missed_call_followup_task_created:${scheduledAt.toISOString()}`)
      }
    }

    // 6. "Connected" + actionable notes → parse same as admin notes
    if (outcome === 'Connected' && notes?.trim()) {
      const trimmedNotes = notes.trim()
      const lowerNotes = trimmedNotes.toLowerCase()

      // Callback/follow-up intent
      if (hasCallbackIntent(trimmedNotes)) {
        const scheduledAt = parseCallbackTime(trimmedNotes)
        if (scheduledAt) {
          const { error: taskError } = await supabase
            .from('agent_tasks')
            .insert({
              task_type: 'human_callback',
              task_description: trimmedNotes,
              lead_id: leadId,
              lead_phone: leadPhone,
              lead_name: leadName,
              status: 'pending',
              scheduled_at: scheduledAt.toISOString(),
              metadata: { source: 'log_call', outcome },
              created_at: new Date().toISOString(),
            })
          if (!taskError) {
            actions.push(`callback_task_created:${scheduledAt.toISOString()}`)
          }
        }
      }

      // "not interested" / "lost" / "dead lead" → Closed Lost
      if (/not\s*interested|lost|dead\s*lead/.test(lowerNotes)) {
        await supabase
          .from('all_leads')
          .update({ lead_stage: 'Closed Lost', stage_override: true })
          .eq('id', leadId)
        actions.push('stage_updated:Closed Lost')
      }

      // "converted" / "signed" / "closed won" / "deal done" → Converted
      if (/converted|signed|closed\s*won|deal\s*done/.test(lowerNotes)) {
        await supabase
          .from('all_leads')
          .update({ lead_stage: 'Converted', stage_override: true })
          .eq('id', leadId)
        actions.push('stage_updated:Converted')
      }
    }

    return NextResponse.json({ success: true, outcome, actions })
  } catch (error) {
    console.error('Error logging call:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
