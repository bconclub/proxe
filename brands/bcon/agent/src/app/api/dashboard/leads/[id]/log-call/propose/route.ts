/**
 * Log-call PROPOSE — read-only. Given a draft call note + outcome, return:
 *   - context_snapshot : the lead's intent/stage/temperature at this moment
 *   - ai_proposed_plan : what the worker WOULD do (via the shared classifier)
 *
 * The log-call hub shows this so the human can confirm or override. Writes
 * NOTHING. The actual decision + execution + learning record happen on the
 * POST to ../log-call (the commit step).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { classifyNote, proposePlan, getServiceClient, type CallOutcome } from '@/lib/services'

export const dynamic = 'force-dynamic'

const VALID_OUTCOMES: CallOutcome[] = ['Connected', 'No Answer', 'Busy', 'Voicemail']

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getServiceClient() || authClient
    const leadId = params.id
    const body = await request.json().catch(() => ({}))
    const outcome = body?.outcome as CallOutcome | undefined
    const notes = (body?.notes || '').toString().trim()

    if (outcome && !VALID_OUTCOMES.includes(outcome)) {
      return NextResponse.json({ error: `Invalid outcome` }, { status: 400 })
    }

    const { data: lead, error } = await supabase
      .from('all_leads')
      .select('customer_name, lead_stage, lead_score, response_count, last_touchpoint, last_interaction_at, created_at, unified_context')
      .eq('id', leadId)
      .single()
    if (error || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    const ctx = lead.unified_context || {}
    const profile = ctx.web?.profile || ctx.profile || {}
    const daysSinceFirstTouch = lead.created_at
      ? Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86400000)
      : null

    // Snapshot of WHO this lead is right now — the half of the learning record
    // that explains "this kind of person came in".
    const context_snapshot = {
      stage: lead.lead_stage || null,
      score: lead.lead_score ?? null,
      temperature: ctx.lead_temperature || null,
      response_count: lead.response_count ?? 0,
      last_touchpoint: lead.last_touchpoint || null,
      days_since_first_touch: daysSinceFirstTouch,
      service_interest: profile.service_interest || ctx.service_interest || null,
      business: profile.company || profile.business || ctx.business || null,
      pain_point: profile.pain_point || ctx.pain_point || null,
      summary: ctx.unified_summary || null,
    }

    const classification = await classifyNote(notes, outcome)
    const ai_proposed_plan = proposePlan(classification)

    return NextResponse.json({ context_snapshot, ai_proposed_plan, classification })
  } catch (err) {
    console.error('[log-call/propose] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
