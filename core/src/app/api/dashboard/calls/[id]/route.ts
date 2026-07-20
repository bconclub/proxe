import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'

export const dynamic = 'force-dynamic'

// GET /api/dashboard/calls/[id]
// Returns one call with its full transcript. `id` is the call_id
// (voice_sessions.external_session_id); voice_sessions.id (UUID) is accepted as a
// fallback so the route works whichever key the UI holds.
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    if (!id) {
      return NextResponse.json({ error: 'Missing call id' }, { status: 400 })
    }

    const supabase = getServiceClient() || authClient

    // Resolve the call by external_session_id first, then by UUID id.
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    let session: any = null
    {
      const { data } = await supabase
        .from('voice_sessions')
        .select('*')
        .eq('external_session_id', id)
        .maybeSingle()
      session = data
    }
    if (!session && isUuid) {
      const { data } = await supabase
        .from('voice_sessions')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      session = data
    }
    if (!session) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 })
    }

    const callId = session.external_session_id || id

    // Transcript turns + summary row for this call (channel='voice', matched by
    // call_id, not lead_id - loads even with no lead linkage). Also capture the
    // lead the transcript is linked to + the real duration, as fallbacks for a
    // stale/un-enriched session row.
    let turns: Array<{ sender: string; content: string; createdAt: string }> = []
    let recordingUrl: string | null = session.recording_url || null
    let summary: string | null = session.call_summary || null
    let endedReason: string | null = null
    let convLeadId: string | null = null
    let convDuration: number | null = null
    {
      const { data: convs } = await supabase
        .from('conversations')
        .select('lead_id, sender, content, metadata, created_at')
        .eq('channel', 'voice')
        .filter('metadata->>call_id', 'eq', callId)
        .order('created_at', { ascending: true })
      ;(convs || []).forEach((c: any) => {
        if (c.lead_id && !convLeadId) convLeadId = c.lead_id
        if (c?.metadata?.summary) {
          recordingUrl = c.metadata.recording_url || recordingUrl
          endedReason = c.metadata.ended_reason || endedReason
          if (typeof c.metadata.duration_seconds === 'number') convDuration = c.metadata.duration_seconds
          if (c.content && c.content !== '(call recording)') summary = summary || c.content
        } else {
          turns.push({ sender: c.sender, content: c.content, createdAt: c.created_at })
        }
      })
    }

    const resolvedLeadId: string | null = session.lead_id || convLeadId || null
    const lead = resolvedLeadId
      ? (await supabase
          .from('all_leads')
          .select('id, customer_name, email, phone, lead_score, lead_stage')
          .eq('id', resolvedLeadId)
          .maybeSingle()).data
      : null

    const ended = !!(endedReason || summary)
    const status = (ended && session.call_status !== 'completed') ? 'completed' : (session.call_status || null)

    return NextResponse.json({
      call: {
        id: callId,
        sessionId: session.id,
        callId,
        leadId: resolvedLeadId,
        leadName: lead?.customer_name || null,
        leadScore: lead?.lead_score ?? null,
        leadStage: lead?.lead_stage || null,
        phone: session.customer_phone || session.customer_phone_normalized || lead?.phone || null,
        direction: (session.call_direction as string) || 'inbound',
        status,
        durationSeconds: session.call_duration_seconds || convDuration || 0,
        recordingUrl,
        summary,
        endedReason,
        sentiment: session.sentiment || null,
        createdAt: session.created_at,
        turns,
      },
    })
  } catch (error) {
    console.error('[api/dashboard/calls/[id]] error:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Failed to fetch call', details: process.env.NODE_ENV === 'development' ? msg : undefined },
      { status: 500 }
    )
  }
}
