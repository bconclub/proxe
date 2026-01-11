import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

    // Call the PostgreSQL function to recalculate score
    const { data, error } = await supabase.rpc('update_lead_score_and_stage', {
      lead_uuid: leadId,
      user_uuid: user.id
    })

    if (error) {
      console.error('Error calculating lead score:', error)
      return NextResponse.json(
        { error: 'Failed to calculate lead score', details: error.message },
        { status: 500 }
      )
    }

    // Fetch updated lead data
    const { data: leadData, error: fetchError } = await supabase
      .from('all_leads')
      .select('id, lead_score, lead_stage, sub_stage, last_scored_at')
      .eq('id', leadId)
      .single()

    if (fetchError) {
      console.error('Error fetching updated lead:', fetchError)
    }

    return NextResponse.json({
      success: true,
      result: data,
      lead: leadData
    })
  } catch (error) {
    console.error('Error in score calculation:', error)
    return NextResponse.json(
      { error: 'Failed to calculate lead score' },
      { status: 500 }
    )
  }
}


