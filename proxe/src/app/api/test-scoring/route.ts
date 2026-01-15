import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/test-scoring
 * Test endpoint to debug lead scoring
 * Input: { lead_id: string }
 * Output: Detailed scoring breakdown, errors, and database state
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    // AUTHENTICATION DISABLED - No auth check needed
    // const {
    //   data: { user },
    // } = await supabase.auth.getUser()

    // if (!user) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // }

    const body = await request.json()
    const { lead_id } = body

    if (!lead_id) {
      return NextResponse.json({ error: 'lead_id is required' }, { status: 400 })
    }

    const debugInfo: any = {
      lead_id,
      timestamp: new Date().toISOString(),
      checks: {},
      scoring: {},
      errors: [],
      database_state: {},
    }

    // 1. Check if lead exists
    const { data: lead, error: leadError } = await supabase
      .from('all_leads')
      .select('*')
      .eq('id', lead_id)
      .single()

    if (leadError || !lead) {
      debugInfo.errors.push(`Lead not found: ${leadError?.message || 'Unknown error'}`)
      return NextResponse.json(debugInfo, { status: 404 })
    }

    debugInfo.checks.lead_exists = true
    debugInfo.database_state.lead = {
      id: lead.id,
      name: lead.name,
      lead_score: lead.lead_score,
      lead_stage: lead.lead_stage,
      sub_stage: lead.sub_stage,
      stage_override: lead.stage_override,
      is_manual_override: lead.is_manual_override,
      last_scored_at: lead.last_scored_at,
      created_at: lead.created_at,
    }

    // 2. Check if scoring columns exist
    debugInfo.checks.has_lead_score_column = 'lead_score' in lead
    debugInfo.checks.has_lead_stage_column = 'lead_stage' in lead

    // 3. Check conversations table and count
    const { data: messages, error: messagesError } = await supabase
      .from('conversations')
      .select('id, channel, sender, created_at, lead_id')
      .eq('lead_id', lead_id)
      .order('created_at', { ascending: false })
      .limit(10)

    if (messagesError) {
      debugInfo.errors.push(`Error fetching messages: ${messagesError.message}`)
    } else {
      debugInfo.checks.messages_count = messages?.length || 0
      debugInfo.database_state.recent_messages = messages?.slice(0, 5) || []
    }

    // 4. Check if scoring function exists
    const { data: functionExists, error: functionError } = await supabase.rpc(
      'calculate_lead_score',
      { lead_uuid: lead_id }
    )

    if (functionError) {
      debugInfo.errors.push(`Scoring function error: ${functionError.message}`)
      debugInfo.checks.scoring_function_exists = false
    } else {
      debugInfo.checks.scoring_function_exists = true
      debugInfo.scoring.calculated_score = functionExists
    }

    // 5. Check trigger exists (can't query pg_trigger directly via Supabase client)
    // We'll test by checking if scoring works when we manually trigger it
    debugInfo.checks.trigger_test = 'Will test by manual scoring'

    // Alternative: Try to call update function directly
    try {
      const { data: updateResult, error: updateError } = await supabase.rpc(
        'update_lead_score_and_stage',
        {
          lead_uuid: lead_id,
          user_uuid: user.id,
        }
      )

      if (updateError) {
        debugInfo.errors.push(`Update function error: ${updateError.message}`)
        debugInfo.scoring.update_function_error = updateError
      } else {
        debugInfo.scoring.update_result = updateResult
      }
    } catch (err: any) {
      debugInfo.errors.push(`Update function exception: ${err.message}`)
    }

    // 6. Get detailed scoring breakdown (if function supports it)
    // Check message counts by channel
    const { data: messageStats, error: statsError } = await supabase
      .from('conversations')
      .select('channel, sender')
      .eq('lead_id', lead_id)

    if (!statsError && messageStats) {
      const stats: any = {}
      messageStats.forEach((msg) => {
        const key = `${msg.channel}_${msg.sender}`
        stats[key] = (stats[key] || 0) + 1
      })
      debugInfo.scoring.message_statistics = stats
      debugInfo.scoring.total_messages = messageStats.length
    }

    // 7. Check sessions (web, whatsapp, voice, social)
    const sessionChecks: any = {}
    const sessionTypes = ['web_sessions', 'whatsapp_sessions', 'voice_sessions', 'social_sessions']
    
    for (const sessionType of sessionTypes) {
      try {
        const { data: sessions, error: sessionError } = await supabase
          .from(sessionType)
          .select('id, booking_status, booking_date')
          .eq('lead_id', lead_id)
          .limit(5)

        if (!sessionError) {
          sessionChecks[sessionType] = {
            count: sessions?.length || 0,
            has_booking: sessions?.some((s: any) => s.booking_status === 'pending' || s.booking_status === 'confirmed') || false,
            sessions: sessions || [],
          }
        }
      } catch (err: any) {
        sessionChecks[sessionType] = { error: err.message }
      }
    }
    debugInfo.scoring.sessions = sessionChecks

    // 8. Fetch updated lead after scoring
    const { data: updatedLead, error: updatedError } = await supabase
      .from('all_leads')
      .select('lead_score, lead_stage, sub_stage, last_scored_at')
      .eq('id', lead_id)
      .single()

    if (!updatedError && updatedLead) {
      debugInfo.scoring.after_scoring = {
        lead_score: updatedLead.lead_score,
        lead_stage: updatedLead.lead_stage,
        sub_stage: updatedLead.sub_stage,
        last_scored_at: updatedLead.last_scored_at,
      }
    }

    // 9. Check if any leads have non-zero scores (sample check)
    const { data: sampleLeads, error: sampleError } = await supabase
      .from('all_leads')
      .select('id, name, lead_score, lead_stage')
      .not('lead_score', 'is', null)
      .gt('lead_score', 0)
      .limit(5)

    if (!sampleError) {
      debugInfo.checks.sample_leads_with_scores = sampleLeads || []
      debugInfo.checks.total_leads_with_scores = sampleLeads?.length || 0
    }

    // 10. Check unified_context for AI data
    if (lead.unified_context) {
      debugInfo.scoring.unified_context = lead.unified_context
    }

    return NextResponse.json({
      success: true,
      debug: debugInfo,
      summary: {
        lead_found: debugInfo.checks.lead_exists,
        scoring_function_works: debugInfo.checks.scoring_function_exists,
        calculated_score: debugInfo.scoring.calculated_score,
        final_score: debugInfo.scoring.after_scoring?.lead_score,
        final_stage: debugInfo.scoring.after_scoring?.lead_stage,
        errors_count: debugInfo.errors.length,
        messages_count: debugInfo.checks.messages_count,
      },
    })
  } catch (error: any) {
    console.error('Error in test-scoring:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        stack: error.stack,
      },
      { status: 500 }
    )
  }
}

