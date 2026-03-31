/**
 * GET /api/dashboard/flows/stats
 * 
 * Return lead counts per stage and template coverage stats for the Flow Builder page.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, getClient } from '@/lib/services'

export const dynamic = 'force-dynamic'

// 9 Stage definitions
const STAGES = [
  { id: 'one_touch', name: 'One Touch', timing: 'Day 1, 3, 7, 30' },
  { id: 'low_touch', name: 'Low Touch', timing: 'Day 3, 7, 30' },
  { id: 'engaged', name: 'Engaged', timing: 'Day 3, 7, 30' },
  { id: 'high_intent', name: 'High Intent', timing: 'Day 1, 3, 7' },
  { id: 'booking_made', name: 'Booking Made', timing: '24h, 30m, Day 7' },
  { id: 'no_show', name: 'No Show', timing: 'Immediate, Day 1, 3, 7' },
  { id: 'demo_taken', name: 'Demo Taken', timing: 'Day 1, 3, 7' },
  { id: 'proposal_sent', name: 'Proposal Sent', timing: 'Day 1, 3, 7' },
  { id: 'converted', name: 'Converted / Closed Lost', timing: 'Terminal' },
]

// Map lead_stage to journey stage
const LEAD_STAGE_MAP: Record<string, string> = {
  'New': 'one_touch',
  'One Touch': 'one_touch',
  'Qualified': 'low_touch',
  'Low Touch': 'low_touch',
  'Engaged': 'engaged',
  'High Intent': 'high_intent',
  'Booking Made': 'booking_made',
  'No Show': 'no_show',
  'Demo Taken': 'demo_taken',
  'Proposal Sent': 'proposal_sent',
  'Converted': 'converted',
  'Closed Won': 'converted',
  'Closed Lost': 'converted',
  'In Sequence': 'one_touch',
  'Cold': 'one_touch',
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getServiceClient() || getClient()
    if (!supabase) {
      return NextResponse.json({ error: 'No database connection' }, { status: 500 })
    }

    // 1. Query all_leads table - group by lead_stage
    const { data: leads, error: leadsError } = await supabase
      .from('all_leads')
      .select('lead_stage, id')
      .not('lead_stage', 'is', null)

    if (leadsError) {
      console.error('[flows/stats] Failed to fetch leads:', leadsError)
    }

    // Group leads by journey stage
    const leadCounts: Record<string, number> = {}
    STAGES.forEach(s => leadCounts[s.id] = 0)

    leads?.forEach((lead: any) => {
      const stageId = LEAD_STAGE_MAP[lead.lead_stage] || 'one_touch'
      leadCounts[stageId] = (leadCounts[stageId] || 0) + 1
    })

    // 2. Query follow_up_templates table
    const { data: templates, error: templatesError } = await supabase
      .from('follow_up_templates')
      .select('*')

    if (templatesError) {
      console.error('[flows/stats] Failed to fetch templates:', templatesError)
    }

    // Calculate coverage % per stage (approved templates / total slots needed)
    const coverageByStage: Record<string, number> = {}
    
    STAGES.forEach(stage => {
      if (stage.id === 'converted') {
        coverageByStage[stage.id] = 100
        return
      }

      const stageTemplates = templates?.filter((t: any) => t.stage === stage.id) || []
      
      // Expected slots based on timing rules
      const expectedSlots = stage.id === 'one_touch' ? 4 : 
                           stage.id === 'booking_made' ? 3 :
                           ['low_touch', 'engaged'].includes(stage.id) ? 3 :
                           4 // high_intent, no_show, demo_taken, proposal_sent

      const approved = stageTemplates.filter((t: any) => t.meta_status === 'approved').length
      coverageByStage[stage.id] = expectedSlots > 0 ? Math.round((approved / expectedSlots) * 100) : 0
    })

    // Build stages array with leadCount and coverage
    const stages = STAGES.map(stage => ({
      id: stage.id,
      name: stage.name,
      leadCount: leadCounts[stage.id] || 0,
      coverage: coverageByStage[stage.id] || 0,
    }))

    // Build templates array with stage/day/channel/status
    const templatesList = (templates || []).map((t: any) => ({
      stage: t.stage,
      day: t.day,
      channel: t.channel,
      status: t.meta_status,
      variant: t.variant,
      templateName: t.meta_template_name,
    }))

    return NextResponse.json({
      stages,
      templates: templatesList,
    })
  } catch (error) {
    console.error('[flows/stats] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch stats', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
