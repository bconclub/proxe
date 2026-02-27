import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/dashboard/leads/[id]/override
 * Manual stage override with activity logging
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    // AUTHENTICATION DISABLED - No auth check needed
    // const {
    //   data: { user },
    // } = await supabase.auth.getUser()

    // if (!user) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // }
    
    // Use a placeholder user ID for logging (since auth is disabled)
    const user = { id: 'system' }

    const leadId = params.id
    const body = await request.json()
    const { 
      new_stage, 
      activity_type, 
      note, 
      duration_minutes, 
      next_followup_date 
    } = body

    // Validate required fields
    if (!new_stage) {
      return NextResponse.json({ error: 'new_stage is required' }, { status: 400 })
    }

    if (!activity_type || !note) {
      return NextResponse.json({ 
        error: 'activity_type and note are required when overriding stage' 
      }, { status: 400 })
    }

    // Validate activity_type
    const validActivityTypes = ['call', 'meeting', 'message', 'note']
    if (!validActivityTypes.includes(activity_type)) {
      return NextResponse.json({ 
        error: `activity_type must be one of: ${validActivityTypes.join(', ')}` 
      }, { status: 400 })
    }

    // Validate stage
    const allowedStages = [
      'New',
      'Engaged',
      'Qualified',
      'High Intent',
      'Booking Made',
      'Converted',
      'Closed Lost',
      'In Sequence',
      'Cold'
    ]
    if (!allowedStages.includes(new_stage)) {
      return NextResponse.json(
        { error: `Invalid stage. Must be one of: ${allowedStages.join(', ')}` },
        { status: 400 }
      )
    }

    // Round next_followup_date to 30-minute intervals if provided
    let roundedFollowupDate = null
    if (next_followup_date) {
      const date = new Date(next_followup_date)
      const minutes = date.getMinutes()
      const roundedMinutes = Math.round(minutes / 30) * 30
      date.setMinutes(roundedMinutes)
      date.setSeconds(0)
      date.setMilliseconds(0)
      roundedFollowupDate = date.toISOString()
    }

    // Get current lead stage
    const { data: lead, error: leadError } = await supabase
      .from('all_leads')
      .select('lead_stage, lead_score')
      .eq('id', leadId)
      .single()

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    const oldStage = lead.lead_stage

    // Insert activity
    const { data: activity, error: activityError } = await supabase
      .from('activities')
      .insert({
        lead_id: leadId,
        activity_type,
        note,
        duration_minutes: duration_minutes || null,
        next_followup_date: roundedFollowupDate,
        created_by: user.id,
      })
      .select()
      .single()

    if (activityError) {
      console.error('Error creating activity:', activityError)
      return NextResponse.json({ error: 'Failed to create activity' }, { status: 500 })
    }

    // Update lead stage and set manual override (both columns for compatibility)
    const { error: updateError } = await supabase
      .from('all_leads')
      .update({
        lead_stage: new_stage,
        stage_override: true,
        is_manual_override: true,
      })
      .eq('id', leadId)

    if (updateError) {
      console.error('Error updating lead:', updateError)
      return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 })
    }

    // Log to lead_stage_changes
    if (oldStage !== new_stage) {
      await supabase
        .from('lead_stage_changes')
        .insert({
          lead_id: leadId,
          old_stage: oldStage,
          new_stage: new_stage,
          old_score: lead.lead_score,
          new_score: lead.lead_score,
          changed_by: user.id,
          is_automatic: false,
          change_reason: note || 'Manual override',
        })
    }

    return NextResponse.json({
      success: true,
      lead_id: leadId,
      old_stage: oldStage,
      new_stage: new_stage,
      activity,
    })
  } catch (error) {
    console.error('Error overriding lead stage:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

