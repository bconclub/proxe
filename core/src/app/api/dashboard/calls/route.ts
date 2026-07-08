import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'

export const dynamic = 'force-dynamic'

// GET /api/dashboard/calls
// Lists voice calls (inbound + outbound) for the Calls dashboard view.
//
// Data lives in two places and is merged here:
//   • voice_sessions  — one row per call (direction, status, duration, phone).
//   • conversations   — channel='voice' rows hold the transcript turns AND a
//                       "summary" row whose metadata carries recording_url,
//                       ended_reason and the call summary. The Vapi webhook
//                       writes recording/summary THERE (not onto voice_sessions),
//                       so we fall back to it when the voice_sessions columns are
//                       empty. Join key: conversations.metadata.call_id ===
//                       voice_sessions.external_session_id.
export async function GET(request: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServiceClient() || authClient
    const sp = request.nextUrl.searchParams
    const page = Math.max(1, parseInt(sp.get('page') || '1'))
    const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') || '50')))
    const offset = (page - 1) * limit
    // 'inbound' | 'outbound' | null (all)
    const direction = sp.get('direction')
    const status = sp.get('status')
    const startDate = sp.get('startDate')
    const endDate = sp.get('endDate')
    const search = sp.get('search')?.trim() || null

    let query = supabase
      .from('voice_sessions')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (direction) query = query.eq('call_direction', direction)
    if (status) query = query.eq('call_status', status)
    if (startDate) query = query.gte('created_at', startDate)
    if (endDate) query = query.lte('created_at', endDate)
    // Phone search at the DB layer; name search is applied after the lead join.
    if (search && search.length >= 2) {
      const digits = search.replace(/\D/g, '')
      if (digits.length >= 3) {
        query = query.ilike('customer_phone_normalized', `%${digits.slice(-10)}%`)
      }
    }

    const { data: sessions, error, count } = await query.range(offset, offset + limit - 1)
    if (error) {
      console.error('[api/dashboard/calls] voice_sessions error:', error.message)
      throw error
    }

    const rows = sessions || []
    const leadIds = Array.from(new Set(rows.map((r: any) => r.lead_id).filter(Boolean)))
    const callIds = Array.from(new Set(rows.map((r: any) => r.external_session_id).filter(Boolean)))

    // Lead names/scores for the rows on this page.
    const leadMap = new Map<string, any>()
    if (leadIds.length) {
      const { data: leads } = await supabase
        .from('all_leads')
        .select('id, customer_name, email, phone, lead_score, lead_stage')
        .in('id', leadIds)
      ;(leads || []).forEach((l: any) => leadMap.set(l.id, l))
    }

    // Voice conversation rows for these calls → recording/summary/turn-count.
    // Join on the call_id (conversations.metadata.call_id === external_session_id),
    // NOT lead_id — recordings/transcripts must surface even when the call has no
    // lead linkage. The Vapi webhook writes them with metadata.call_id regardless.
    type CallExtra = { recordingUrl: string | null; summary: string | null; endedReason: string | null; turnCount: number; leadId: string | null; durationSeconds: number | null }
    const extras = new Map<string, CallExtra>()
    if (callIds.length) {
      const { data: convs } = await supabase
        .from('conversations')
        .select('lead_id, sender, content, metadata, created_at')
        .eq('channel', 'voice')
        .filter('metadata->>call_id', 'in', `(${callIds.join(',')})`)
      ;(convs || []).forEach((c: any) => {
        const cid = c?.metadata?.call_id
        if (!cid) return
        const e = extras.get(cid) || { recordingUrl: null, summary: null, endedReason: null, turnCount: 0, leadId: null, durationSeconds: null }
        // The transcript/summary rows often carry the resolved lead even when the
        // voice_sessions row never got enriched — capture it so the contact name
        // resolves from here as a fallback.
        if (c.lead_id) e.leadId = e.leadId || c.lead_id
        if (c?.metadata?.summary) {
          // The summary row — carries the recording + ended reason + summary +
          // duration. Used as a fallback when the session row is stale.
          e.recordingUrl = c.metadata.recording_url || e.recordingUrl
          e.endedReason = c.metadata.ended_reason || e.endedReason
          if (typeof c.metadata.duration_seconds === 'number') e.durationSeconds = c.metadata.duration_seconds
          if (c.content && c.content !== '(call recording)') e.summary = c.content
        } else {
          e.turnCount += 1
        }
        extras.set(cid, e)
      })
    }

    // Backfill leadMap with any lead found on the conversations but not on the
    // session row — so "Unknown caller" calls (session.lead_id NULL) still resolve
    // their name/phone from the lead the transcript is linked to.
    const convLeadIds = Array.from(new Set(
      Array.from(extras.values()).map((e) => e.leadId).filter((id): id is string => !!id && !leadMap.has(id)),
    ))
    if (convLeadIds.length) {
      const { data: moreLeads } = await supabase
        .from('all_leads')
        .select('id, customer_name, email, phone, lead_score, lead_stage')
        .in('id', convLeadIds)
      ;(moreLeads || []).forEach((l: any) => leadMap.set(l.id, l))
    }

    let calls = rows.map((r: any) => {
      const extra = r.external_session_id ? extras.get(r.external_session_id) : undefined
      // Resolve the lead from the session, else from the lead the transcript is
      // linked to — so calls whose voice_sessions row never got enriched still
      // show the real contact instead of "Unknown caller".
      const resolvedLeadId = r.lead_id || extra?.leadId || null
      const lead = resolvedLeadId ? leadMap.get(resolvedLeadId) : null
      // If the session is stale (never enriched) but the call clearly ended
      // (summary row present), reflect "completed" + the real duration.
      const ended = !!(extra?.endedReason || extra?.summary)
      const status = (ended && r.call_status !== 'completed') ? 'completed' : (r.call_status || null)
      // Which engine placed the call. V2/V3 stamp an `engine:<name>` marker into
      // call_summary at dial time (test-call route); V1 (Vapi) has no marker.
      // That marker is also why we must NOT surface call_summary as summary text.
      const marker = String(r.call_summary || '').toLowerCase()
      const engine: 'vapi' | 'elevenlabs' | 'sarvam' =
        marker.includes('engine:sarvam') ? 'sarvam'
        : marker.includes('engine:elevenlabs') ? 'elevenlabs'
        : 'vapi'
      const realSummary = r.call_summary && !r.call_summary.startsWith('engine:') ? r.call_summary : null
      return {
        id: r.external_session_id || r.id,
        sessionId: r.id,
        callId: r.external_session_id || null,
        leadId: resolvedLeadId,
        leadName: lead?.customer_name || null,
        leadScore: lead?.lead_score ?? null,
        leadStage: lead?.lead_stage || null,
        phone: r.customer_phone || r.customer_phone_normalized || lead?.phone || null,
        direction: (r.call_direction as string) || 'inbound',
        status,
        durationSeconds: r.call_duration_seconds || extra?.durationSeconds || 0,
        recordingUrl: r.recording_url || extra?.recordingUrl || null,
        summary: realSummary || extra?.summary || null,
        endedReason: extra?.endedReason || null,
        sentiment: r.sentiment || null,
        engine,
        turnCount: extra?.turnCount ?? 0,
        createdAt: r.created_at,
      }
    })

    // V2 (ElevenLabs) has no post-call webhook, so its rows sit at "queued·0s"
    // forever. Lazily sync the still-pending ones from the conversation API on
    // list load (capped, parallel) and persist so they land completed with the
    // real duration — the V2 equivalent of the Vapi webhook / V3 telemetry.
    const elKey = process.env.ELEVENLABS_API_KEY
    const pendingEl = calls.filter(
      (c) => c.engine === 'elevenlabs' && c.callId && (c.status === 'queued' || (c.durationSeconds ?? 0) === 0),
    ).slice(0, 12)
    if (elKey && pendingEl.length) {
      await Promise.all(pendingEl.map(async (c) => {
        try {
          const cr = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${c.callId}`, { headers: { 'xi-api-key': elKey } })
          if (!cr.ok) return
          const conv: any = await cr.json()
          const st = conv?.status
          if (st !== 'done' && st !== 'failed') return // still in-progress/processing
          const dur = Math.round(conv?.metadata?.call_duration_secs ?? conv?.call_duration_secs ?? 0)
          c.status = st === 'done' ? 'completed' : 'failed'
          c.durationSeconds = dur
          if (typeof conv?.message_count === 'number') c.turnCount = conv.message_count
          await supabase.from('voice_sessions')
            .update({ call_status: c.status, call_duration_seconds: dur, updated_at: new Date().toISOString() })
            .eq('external_session_id', c.callId)
        } catch { /* soft-fail — leave the row as-is */ }
      }))
    }

    // Name search (post-join) — phone search already applied at the DB layer.
    if (search && search.length >= 2 && !/^\d+$/.test(search.replace(/\D/g, ''))) {
      const needle = search.toLowerCase()
      calls = calls.filter((c) => (c.leadName || '').toLowerCase().includes(needle))
    }

    return NextResponse.json({
      calls,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    })
  } catch (error) {
    console.error('[api/dashboard/calls] error:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Failed to fetch calls', details: process.env.NODE_ENV === 'development' ? msg : undefined },
      { status: 500 }
    )
  }
}
