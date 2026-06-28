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

    // Voice conversation rows for these leads → recording/summary/turn-count by call_id.
    type CallExtra = { recordingUrl: string | null; summary: string | null; endedReason: string | null; turnCount: number }
    const extras = new Map<string, CallExtra>()
    if (leadIds.length) {
      const { data: convs } = await supabase
        .from('conversations')
        .select('lead_id, sender, content, metadata, created_at')
        .eq('channel', 'voice')
        .in('lead_id', leadIds)
      ;(convs || []).forEach((c: any) => {
        const cid = c?.metadata?.call_id
        if (!cid) return
        const e = extras.get(cid) || { recordingUrl: null, summary: null, endedReason: null, turnCount: 0 }
        if (c?.metadata?.summary) {
          // The summary row — carries the recording + ended reason + summary text.
          e.recordingUrl = c.metadata.recording_url || e.recordingUrl
          e.endedReason = c.metadata.ended_reason || e.endedReason
          if (c.content && c.content !== '(call recording)') e.summary = c.content
        } else {
          e.turnCount += 1
        }
        extras.set(cid, e)
      })
    }

    let calls = rows.map((r: any) => {
      const lead = r.lead_id ? leadMap.get(r.lead_id) : null
      const extra = r.external_session_id ? extras.get(r.external_session_id) : undefined
      return {
        id: r.external_session_id || r.id,
        sessionId: r.id,
        callId: r.external_session_id || null,
        leadId: r.lead_id || null,
        leadName: lead?.customer_name || null,
        leadScore: lead?.lead_score ?? null,
        leadStage: lead?.lead_stage || null,
        phone: r.customer_phone || r.customer_phone_normalized || null,
        direction: (r.call_direction as string) || 'inbound',
        status: r.call_status || null,
        durationSeconds: r.call_duration_seconds ?? 0,
        recordingUrl: r.recording_url || extra?.recordingUrl || null,
        summary: r.call_summary || extra?.summary || null,
        endedReason: extra?.endedReason || null,
        sentiment: r.sentiment || null,
        turnCount: extra?.turnCount ?? 0,
        createdAt: r.created_at,
      }
    })

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
