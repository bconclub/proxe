/**
 * GET /api/dashboard/flows/stats
 * 
 * Get template statistics + lead counts per stage
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTemplateStats } from '@/lib/services/templateLibrary'
import { JOURNEY_STAGES, JourneyStageId, LEAD_STAGE_TO_JOURNEY } from '@/lib/constants/flowStages'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const brand = searchParams.get('brand') || 'default'

    // Get template stats
    const templateStats = await getTemplateStats(brand)

    // Get lead counts per stage
    const { data: leads, error: leadsError } = await supabase
      .from('all_leads')
      .select('lead_stage, id')
      .in('brand', [brand, 'bcon'])
      .not('lead_stage', 'is', null)

    if (leadsError) {
      console.error('[API] Failed to fetch leads:', leadsError)
    }

    // Group leads by journey stage
    const leadCounts: Record<JourneyStageId, number> = {
      one_touch: 0,
      low_touch: 0,
      engaged: 0,
      high_intent: 0,
      booking_made: 0,
      no_show: 0,
      demo_taken: 0,
      proposal_sent: 0,
      converted: 0,
    }

    // Also track by lead_stage directly for debugging
    const rawCounts: Record<string, number> = {}

    leads?.forEach(lead => {
      const stage = lead.lead_stage || 'Unknown'
      rawCounts[stage] = (rawCounts[stage] || 0) + 1
      
      const journeyStage = LEAD_STAGE_TO_JOURNEY[stage] || 'one_touch'
      leadCounts[journeyStage] = (leadCounts[journeyStage] || 0) + 1
    })

    // Get template assignments for each stage
    const { data: templates } = await supabase
      .from('follow_up_templates')
      .select('*')
      .eq('brand', brand)

    // Group templates by stage
    const templatesByStage: Record<string, any[]> = {}
    templates?.forEach(t => {
      if (!templatesByStage[t.stage]) templatesByStage[t.stage] = []
      templatesByStage[t.stage].push(t)
    })

    // Calculate coverage per stage
    const coverageByStage: Record<string, { 
      totalSlots: number
      filledSlots: number
      approvedSlots: number
      pendingSlots: number
      emptySlots: number
      coverage: number
    }> = {}

    JOURNEY_STAGES.forEach(stage => {
      if (stage.isTerminal) {
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

      const stageTemplates = templatesByStage[stage.id] || []
      const expectedSlots = stage.timingRules.reduce((acc, rule) => acc + rule.channels.length, 0)
      
      const approved = stageTemplates.filter(t => t.meta_status === 'approved').length
      const pending = stageTemplates.filter(t => t.meta_status === 'pending').length
      const rejected = stageTemplates.filter(t => t.meta_status === 'rejected').length
      
      coverageByStage[stage.id] = {
        totalSlots: expectedSlots,
        filledSlots: stageTemplates.length,
        approvedSlots: approved,
        pendingSlots: pending,
        emptySlots: expectedSlots - stageTemplates.length,
        coverage: expectedSlots > 0 ? Math.round((approved / expectedSlots) * 100) : 100,
      }
    })

    return NextResponse.json({
      success: true,
      stats: {
        templateStats,
        leadCounts,
        rawCounts,
        coverageByStage,
        totalLeads: leads?.length || 0,
      },
    })
  } catch (error) {
    console.error('[API] Failed to fetch stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    )
  }
}
