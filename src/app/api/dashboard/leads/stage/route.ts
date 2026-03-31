/**
 * API Routes for Lead Stage Detection (GPFC 2)
 * 
 * GET: Get detected stage for a lead
 * POST: Override stage or detect new stage
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { detectStage, overrideLeadStage, executeAction } from '@/lib/services/stageDetector'
import { JourneyStageId } from '@/lib/constants/flowStages'

export const dynamic = 'force-dynamic'

// GET /api/dashboard/leads/stage?leadId=xxx - Get stage detection
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const leadId = searchParams.get('leadId')

    if (!leadId) {
      return NextResponse.json(
        { error: 'Missing leadId parameter' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    
    // Get lead data
    const { data: lead, error } = await supabase
      .from('all_leads')
      .select('*')
      .eq('id', leadId)
      .single()

    if (error || !lead) {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      )
    }

    // Detect stage
    const detection = detectStage(lead)

    return NextResponse.json({
      success: true,
      detection,
      currentStage: lead.lead_stage,
    })
  } catch (error) {
    console.error('[API] Stage detection error:', error)
    return NextResponse.json(
      { error: 'Failed to detect stage' },
      { status: 500 }
    )
  }
}

// POST /api/dashboard/leads/stage - Override or update stage
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { leadId, action, stage, reason, actionId } = body

    if (!leadId) {
      return NextResponse.json(
        { error: 'Missing leadId' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Override stage manually
    if (action === 'override' && stage) {
      const success = await overrideLeadStage(leadId, stage as JourneyStageId, reason)
      
      if (!success) {
        return NextResponse.json(
          { error: 'Failed to override stage' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        stage,
        overridden: true,
      })
    }

    // Detect and update stage
    if (action === 'detect') {
      const { data: lead } = await supabase
        .from('all_leads')
        .select('*')
        .eq('id', leadId)
        .single()

      if (!lead) {
        return NextResponse.json(
          { error: 'Lead not found' },
          { status: 404 }
        )
      }

      const detection = detectStage(lead)

      // Update if should update
      if (detection.shouldUpdate) {
        await supabase
          .from('all_leads')
          .update({
            lead_stage: detection.detectedStage,
            stage_detected_at: new Date().toISOString(),
            stage_detected_by: detection.detectedBy,
          })
          .eq('id', leadId)
      }

      return NextResponse.json({
        success: true,
        detection,
        updated: detection.shouldUpdate,
      })
    }

    // Execute suggested action
    if (action === 'execute' && actionId) {
      // Get the action details from the detection
      const { data: lead } = await supabase
        .from('all_leads')
        .select('*')
        .eq('id', leadId)
        .single()

      if (!lead) {
        return NextResponse.json(
          { error: 'Lead not found' },
          { status: 404 }
        )
      }

      const detection = detectStage(lead)
      const actionToExecute = detection.suggestedActions.find(a => a.id === actionId)

      if (!actionToExecute) {
        return NextResponse.json(
          { error: 'Action not found' },
          { status: 404 }
        )
      }

      const success = await executeAction(leadId, actionToExecute)

      return NextResponse.json({
        success,
        action: actionToExecute,
      })
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    )
  } catch (error) {
    console.error('[API] Stage API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
