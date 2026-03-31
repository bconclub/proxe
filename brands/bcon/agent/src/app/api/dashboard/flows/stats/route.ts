/**
 * GET /api/dashboard/flows/stats
 * 
 * Get template statistics + lead counts per stage for the 9-stage flow builder
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, getClient } from '@/lib/services'

export const dynamic = 'force-dynamic'

// 9 Stage definitions (matching the flow builder)
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

    // 1. Get lead counts per stage
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

    // 2. Get template assignments
    const { data: templates, error: templatesError } = await supabase
      .from('follow_up_templates')
      .select('*')

    if (templatesError) {
      console.error('[flows/stats] Failed to fetch templates:', templatesError)
    }

    // Calculate coverage per stage
    const coverageByStage: Record<string, any> = {}
    
    STAGES.forEach(stage => {
      if (stage.id === 'converted') {
        coverageByStage[stage.id] = {
          totalSlots: 0,
          filledSlots: 0,
          approvedSlots: 0,
          pendingSlots: 0,
          emptySlots: 0,
          coverage: 100,
        }
        return
      }

      const stageTemplates = templates?.filter((t: any) => t.stage === stage.id) || []
      
      // Expected slots based on timing
      const expectedSlots = stage.id === 'one_touch' ? 4 : 
                           stage.id === 'booking_made' ? 3 :
                           ['low_touch', 'engaged'].includes(stage.id) ? 3 :
                           4 // high_intent, no_show, demo_taken, proposal_sent

      const approved = stageTemplates.filter((t: any) => t.meta_status === 'approved').length
      const pending = stageTemplates.filter((t: any) => t.meta_status === 'pending').length
      const rejected = stageTemplates.filter((t: any) => t.meta_status === 'rejected').length

      coverageByStage[stage.id] = {
        totalSlots: expectedSlots,
        filledSlots: stageTemplates.length,
        approvedSlots: approved,
        pendingSlots: pending,
        rejectedSlots: rejected,
        emptySlots: expectedSlots - approved,
        coverage: expectedSlots > 0 ? Math.round((approved / expectedSlots) * 100) : 0,
      }
    })

    // 3. Get task stats
    const { data: pendingTasks } = await supabase
      .from('agent_tasks')
      .select('id')
      .in('status', ['pending', 'queued'])

    const { data: completedToday } = await supabase
      .from('agent_tasks')
      .select('id')
      .eq('status', 'completed')
      .gte('completed_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

    return NextResponse.json({
      success: true,
      stats: {
        leadCounts,
        coverageByStage,
        templateStats: {
          total: templates?.length || 0,
          approved: templates?.filter((t: any) => t.meta_status === 'approved').length || 0,
          pending: templates?.filter((t: any) => t.meta_status === 'pending').length || 0,
          rejected: templates?.filter((t: any) => t.meta_status === 'rejected').length || 0,
        },
        taskStats: {
          pending: pendingTasks?.length || 0,
          completedToday: completedToday?.length || 0,
        },
        stages: STAGES,
      },
    })
  } catch (error) {
    console.error('[flows/stats] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch stats', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
