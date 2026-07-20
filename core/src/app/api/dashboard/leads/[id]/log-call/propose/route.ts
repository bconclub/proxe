/**
 * Log-call PROPOSE - read-only. Given a draft call note + outcome, return:
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
import { buildCallContextSnapshot } from '@/lib/services/logCallContext'

// Re-deploy nudge: prior build hung on a stale restored cache (local build clean).
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

    // Snapshot of WHO this lead is right now, built by the shared helper so the
    // chat route sees the exact same picture. Never lets a fetch hiccup kill the
    // suggestion.
    const context_snapshot = await buildCallContextSnapshot(supabase, leadId)

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
