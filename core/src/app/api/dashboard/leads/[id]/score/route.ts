import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    // Auth gate: every dashboard API requires a logged-in Supabase session.
    // No role check here - viewer vs admin enforcement is done at write sites.
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const leadId = params.id

    // The lead modal computes the user-visible score client-side (message-aware
    // calculateLeadScore) and sends it here. We persist THAT value so the stored
    // lead_score - and therefore the dashboard's Avg Lead Score - matches exactly
    // what the user sees per lead, instead of the divergent SQL RPC value.
    const body = await request.json().catch(() => ({} as any))
    const clientScore =
      typeof body?.score === 'number' && isFinite(body.score)
        ? Math.max(0, Math.min(100, Math.round(body.score)))
        : null

    // Call the PostgreSQL function to recalculate stage (and its own score).
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

    // Overwrite lead_score with the client-computed (user-visible) value and
    // stamp last_scored_at so the metrics route treats it as fresh and won't
    // recompute it. Service role per dashboard-write policy; best-effort.
    if (clientScore != null) {
      const svc = getServiceClient() || supabase
      const { error: persistError } = await svc
        .from('all_leads')
        .update({ lead_score: clientScore, last_scored_at: new Date().toISOString() })
        .eq('id', leadId)
      if (persistError) {
        console.error('Failed to persist client score:', persistError.message)
      }
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
