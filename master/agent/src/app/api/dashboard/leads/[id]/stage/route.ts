import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Allowed lead stages
const ALLOWED_STAGES = [
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

// Sub-stages for High Intent
const HIGH_INTENT_SUB_STAGES = [
  'proposal',
  'negotiation',
  'on-hold'
]

export async function PATCH(
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
    const { stage, sub_stage, override_reason } = body

    // Validate stage
    if (!stage || !ALLOWED_STAGES.includes(stage)) {
      return NextResponse.json(
        { error: `Invalid stage. Must be one of: ${ALLOWED_STAGES.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate sub_stage if provided
    if (sub_stage && stage === 'High Intent' && !HIGH_INTENT_SUB_STAGES.includes(sub_stage)) {
      return NextResponse.json(
        { error: `Invalid sub_stage for High Intent. Must be one of: ${HIGH_INTENT_SUB_STAGES.join(', ')}` },
        { status: 400 }
      )
    }

    // Get current lead state
    const { data: currentLead, error: fetchError } = await supabase
      .from('all_leads')
      .select('lead_stage, sub_stage, lead_score, stage_override')
      .eq('id', leadId)
      .single()

    if (fetchError || !currentLead) {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      )
    }

    const oldStage = currentLead.lead_stage
    const oldSubStage = currentLead.sub_stage
    const wasOverridden = currentLead.stage_override

    // Update lead stage (set both override columns for compatibility)
    const updateData: any = {
      lead_stage: stage,
      stage_override: true, // Mark as manually overridden
      is_manual_override: true, // Also set this for compatibility
      updated_at: new Date().toISOString()
    }

    if (sub_stage !== undefined) {
      updateData.sub_stage = sub_stage
    } else if (stage !== 'High Intent') {
      // Clear sub_stage if not High Intent
      updateData.sub_stage = null
    }

    const { data: updatedLead, error: updateError } = await supabase
      .from('all_leads')
      .update(updateData)
      .eq('id', leadId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating lead stage:', updateError)
      return NextResponse.json(
        { error: 'Failed to update lead stage' },
        { status: 500 }
      )
    }

    // Log stage change
    const { data: stageChange, error: logError } = await supabase
      .from('lead_stage_changes')
      .insert({
        lead_id: leadId,
        old_stage: oldStage,
        new_stage: stage,
        old_sub_stage: oldSubStage,
        new_sub_stage: sub_stage || null,
        old_score: currentLead.lead_score,
        new_score: currentLead.lead_score,
        changed_by: user.id,
        is_automatic: false,
        change_reason: override_reason || 'Manual stage update'
      })
      .select('id')
      .single()

    if (logError) {
      console.error('Error logging stage change:', logError)
      // Don't fail the request if logging fails
    }

    // Create or update override record
    if (!wasOverridden) {
      // Create new override
      const { error: overrideError } = await supabase
        .from('lead_stage_overrides')
        .insert({
          lead_id: leadId,
          overridden_stage: stage,
          overridden_sub_stage: sub_stage || null,
          overridden_by: user.id,
          override_reason: override_reason || 'Manual stage override',
          is_active: true
        })

      if (overrideError) {
        console.error('Error creating override record:', overrideError)
        // Don't fail the request if override record creation fails
      }
    } else {
      // Update existing override
      const { error: overrideUpdateError } = await supabase
        .from('lead_stage_overrides')
        .update({
          overridden_stage: stage,
          overridden_sub_stage: sub_stage || null,
          override_reason: override_reason || 'Manual stage override update',
          updated_at: new Date().toISOString()
        })
        .eq('lead_id', leadId)
        .eq('is_active', true)

      if (overrideUpdateError) {
        console.error('Error updating override record:', overrideUpdateError)
        // Don't fail the request if override record update fails
      }
    }

    return NextResponse.json({
      success: true,
      lead: updatedLead,
      change_logged: !logError,
      stage_change_id: stageChange?.id || null
    })
  } catch (error) {
    console.error('Error updating lead stage:', error)
    return NextResponse.json(
      { error: 'Failed to update lead stage' },
      { status: 500 }
    )
  }
}

// Endpoint to remove stage override (allow automatic scoring to take over)
export async function DELETE(
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

    // Remove override flag (clear both columns for compatibility)
    const { error: updateError } = await supabase
      .from('all_leads')
      .update({
        stage_override: false,
        is_manual_override: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId)

    if (updateError) {
      console.error('Error removing override:', updateError)
      return NextResponse.json(
        { error: 'Failed to remove stage override' },
        { status: 500 }
      )
    }

    // Deactivate override records
    const { error: deactivateError } = await supabase
      .from('lead_stage_overrides')
      .update({
        is_active: false,
        removed_at: new Date().toISOString()
      })
      .eq('lead_id', leadId)
      .eq('is_active', true)

    if (deactivateError) {
      console.error('Error deactivating override records:', deactivateError)
    }

    // Recalculate score and stage automatically
    const { data: recalcResult, error: recalcError } = await supabase.rpc(
      'update_lead_score_and_stage',
      {
        lead_uuid: leadId,
        user_uuid: user.id
      }
    )

    if (recalcError) {
      console.error('Error recalculating after override removal:', recalcError)
    }

    return NextResponse.json({
      success: true,
      message: 'Stage override removed, automatic scoring resumed',
      recalculated: !recalcError,
      result: recalcResult
    })
  } catch (error) {
    console.error('Error removing stage override:', error)
    return NextResponse.json(
      { error: 'Failed to remove stage override' },
      { status: 500 }
    )
  }
}

