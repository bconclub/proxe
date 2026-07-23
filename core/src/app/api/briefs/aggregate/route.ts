import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/services'
import { BRAND_ID, brandConfig } from '@/configs'

/**
 * Daily-brief aggregate feed — machine-to-machine, token-guarded.
 *
 * Purpose: give an EXTERNAL generator (the VPS cron that writes the Obsidian
 * daily briefs) a compact, schema-stable snapshot of ONE brand's activity for a
 * single day, so a model can extract patterns from it. This is NOT the human
 * dashboard route (founder-metrics): that one is session-authed and returns
 * all-time metrics. This one is read-only, bearer-token-authed, and windowed to
 * a single day of conversation-level content.
 *
 * Brand scoping is implicit: one-core deploys one brand per domain, so calling
 * https://proxe.windchasers.in/api/briefs/aggregate returns windchasers only.
 * The generator hits each brand's own domain in turn.
 *
 * Auth: Authorization: Bearer <BRIEFS_SECRET>. Falls back to CRON_SECRET so we
 * reuse the machine-auth secret the cron routes already trust. If NEITHER env
 * is set the route refuses (fail-closed) — it never serves customer data open.
 *
 * Query: ?date=YYYY-MM-DD (defaults to yesterday, brand timezone-naive UTC day).
 */

export const dynamic = 'force-dynamic'

// PostgREST caps un-ranged selects at 1000 rows. A single day per brand is far
// under that, so a plain select is safe here (no pagination needed).

function dayWindow(dateParam: string | null): { startISO: string; endISO: string; label: string } {
  // Anchor to a UTC calendar day. Callers that want a specific brand-local day
  // pass ?date=; otherwise we take "yesterday" relative to now (UTC).
  const base = dateParam ? new Date(`${dateParam}T00:00:00.000Z`) : new Date(Date.now() - 24 * 60 * 60 * 1000)
  if (Number.isNaN(base.getTime())) {
    throw new Error('invalid date param')
  }
  const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 0, 0, 0, 0))
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  const label = start.toISOString().slice(0, 10)
  return { startISO: start.toISOString(), endISO: end.toISOString(), label }
}

export async function GET(request: NextRequest) {
  // --- auth (fail-closed) ---------------------------------------------------
  const secret = process.env.BRIEFS_SECRET || process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'briefs feed disabled (no secret configured)' }, { status: 503 })
  }
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServiceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'service client unavailable' }, { status: 500 })
  }

  let window
  try {
    window = dayWindow(request.nextUrl.searchParams.get('date'))
  } catch {
    return NextResponse.json({ error: 'invalid date param (want YYYY-MM-DD)' }, { status: 400 })
  }
  const { startISO, endISO, label } = window

  // --- pull one day of conversation-level content across channels -----------
  // Column sets mirror the founder-metrics route (verified schema-safe). Voice
  // call facts only exist on bcon/pop tables, so keep the narrow select
  // elsewhere (a select on a missing column errors in PostgREST).
  const inDay = (q: any, col = 'created_at') => q.gte(col, startISO).lt(col, endISO)

  const [
    { data: newLeads, error: leadsError },
    { data: webSessions },
    { data: whatsappSessions },
    { data: voiceSessions },
    { data: stageChanges },
  ] = await Promise.all([
    inDay(supabase
      .from('all_leads')
      .select('id, customer_name, email, phone, lead_score, lead_stage, first_touchpoint, last_touchpoint, unified_context, created_at')
      .order('lead_score', { ascending: false })),
    inDay(supabase
      .from('web_sessions')
      .select('id, lead_id, message_count, conversation_summary, booking_status, last_message_at, created_at')
      .order('created_at', { ascending: true }), 'last_message_at'),
    inDay(supabase
      .from('whatsapp_sessions')
      .select('id, lead_id, message_count, conversation_summary, last_message_at, created_at')
      .order('created_at', { ascending: true }), 'last_message_at'),
    inDay(supabase
      .from('voice_sessions')
      .select(['bcon', 'pop'].includes(BRAND_ID)
        ? 'lead_id, call_direction, call_status, call_duration_seconds, created_at'
        : 'lead_id, created_at')
      .order('created_at', { ascending: true })),
    inDay(supabase
      .from('lead_stage_changes')
      .select('lead_id, old_stage, new_stage, new_score, changed_by, created_at')
      .order('created_at', { ascending: false })),
  ])

  if (leadsError) {
    return NextResponse.json({ error: 'query failed', detail: leadsError.message }, { status: 500 })
  }

  // Conversation summaries are the raw material for pattern extraction; strip
  // empties so the model isn't fed blanks.
  const conversations = [
    ...(webSessions || []).map((s: any) => ({ channel: 'web', ...s })),
    ...(whatsappSessions || []).map((s: any) => ({ channel: 'whatsapp', ...s })),
  ].filter((s) => (s.conversation_summary || '').trim().length > 0)

  return NextResponse.json(
    {
      brand: { id: BRAND_ID, name: brandConfig.name },
      date: label,
      window: { start: startISO, end: endISO },
      totals: {
        new_leads: newLeads?.length || 0,
        web_sessions: webSessions?.length || 0,
        whatsapp_sessions: whatsappSessions?.length || 0,
        voice_sessions: voiceSessions?.length || 0,
        stage_changes: stageChanges?.length || 0,
        conversations_with_summary: conversations.length,
      },
      new_leads: newLeads || [],
      conversations,
      voice_sessions: voiceSessions || [],
      stage_changes: stageChanges || [],
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
