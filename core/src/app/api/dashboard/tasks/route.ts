import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, getClient } from '@/lib/services'
// Brand-private template-body map (the board's outgoing-message preview).
import { TEMPLATE_BODIES, resolveTaskTemplate, fillTemplateWithChips, buildNudgePreview } from '@/configs/template-bodies'
import { BRAND_ID } from '@/configs'

export const dynamic = 'force-dynamic'

/** Render a short outgoing-message preview for a task.
 * bcon: variables stay VISIBLE as [[label]] chips (the UI styles them) and the
 * template the worker WILL send is resolved per task_type + bucket — so the
 * timeline shows the actual outgoing message per planned step. Other brands
 * keep the value-substituted preview their forks shipped. */
function renderPreview(t: any): string {
  const name = (t.lead_name || 'there').split(' ')[0]
  const md = t.metadata || {}
  if (BRAND_ID === 'bcon') {
    // Waiting nudges send a free-form, info-tiered message (not a fixed template).
    if (t.task_type === 'nudge_waiting') return buildNudgePreview(md)
    const tmpl = md.template_name || md.template || resolveTaskTemplate(t.task_type, md.bucket)
    if (tmpl && TEMPLATE_BODIES[tmpl]) {
      return fillTemplateWithChips(TEMPLATE_BODIES[tmpl])
    }
  } else {
    const tmpl = md.template_name || md.template
    if (tmpl && TEMPLATE_BODIES[tmpl]) {
      return TEMPLATE_BODIES[tmpl]
        .replace(/\{\{\s*customer_name\s*\}\}/g, name)
        .replace(/\{\{\s*brand_name\s*\}\}/g, md.brand_name || 'your brand')
        .replace(/\{\{\s*service_interest\s*\}\}/g, md.service_interest || 'your goals')
        .replace(/\{\{\s*booking_time\s*\}\}/g, md.booking_time || 'your slot')
        .replace(/\{\{\s*pain_point\s*\}\}/g, md.pain_point || 'that')
    }
  }
  // AI-dynamic tasks: message is generated at send time — use the stored
  // preview / description / angle as the best available hint.
  return md.preview || md.message_preview || t.task_description || md.completed_action ||
    `${String(t.task_type || 'task').replace(/_/g, ' ')} to ${t.lead_name || 'lead'}`
}

/** Who acted / will act: human name (approved/sent) vs PROXe automation. */
function deriveActor(t: any): { label: string; kind: 'human' | 'proxe' } {
  const md = t.metadata || {}
  if (md.approved && md.approved_by) return { label: md.approved_by, kind: 'human' }
  if (md.sent_by === 'founder' || md.approved) return { label: 'You', kind: 'human' }
  return { label: 'Automation', kind: 'proxe' }
}

/** Human-readable reason a task needs attention. */
function deriveStatusReason(t: any): string {
  const err = String(t.error_message || '')
  if (t.status === 'queued') return 'Awaiting your approval to send'
  if (/template/i.test(err)) return 'Template not found — needs setup'
  if (/24h|window/i.test(err)) return 'Outside 24h window — needs template'
  if (/phone|number|not synced|recipient/i.test(err)) return 'Phone number missing'
  if (/deliver|unreachable|failed to send/i.test(err)) return 'Delivery failed'
  return err || 'Needs attention'
}

export async function GET(request: NextRequest) {
  try {
    // Use service role client to bypass RLS on agent_tasks table
    const supabase = getServiceClient() || getClient()
    if (!supabase) {
      console.error('[tasks/route] No Supabase client available')
      return NextResponse.json(
        { error: 'No database connection', tasks: [], stats: { completedToday: 0, failedToday: 0, pendingCount: 0, queuedCount: 0, successRate: 100 } },
        { status: 500 }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status')
    const type = searchParams.get('type')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const leadId = searchParams.get('lead_id')

    // Deprecated task types — no longer created, filter out any remaining
    const DEPRECATED_TYPES = ['post_booking_followup', 'booking_reminder_1h']

    const now = new Date()
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    // If explicit status filter, only run that query
    if (status) {
      let query = supabase
        .from('agent_tasks')
        .select('*')
        .eq('status', status)
        .order('scheduled_at', { ascending: false })

      if (type) query = query.eq('task_type', type)
      if (leadId) query = query.eq('lead_id', leadId)
      if (from) query = query.gte('created_at', from)
      if (to) query = query.lte('created_at', to)
      for (const dt of DEPRECATED_TYPES) query = query.neq('task_type', dt)

      const { data, error } = await query.limit(200)
      if (error) {
        console.error('[tasks/route] Filtered query error:', error.message, error.code)
        throw error
      }
      return NextResponse.json({ tasks: data || [] })
    }

    // Query 1: pending and in_queue tasks (no date filter)
    // The explicit `.neq('status','cancelled')` is belt-and-suspenders: we've
    // seen cancelled rows leak into Next Actions in the wild (suspected
    // PostgREST/connection caching quirk), so the extra filter guarantees
    // cancelled tasks never show up here even if .in() misbehaves.
    let pendingQuery = supabase
      .from('agent_tasks')
      .select('*')
      .in('status', ['pending', 'in_queue', 'queued'])
      .neq('status', 'cancelled')
      .neq('status', 'completed')
      .is('completed_at', null)
      .order('scheduled_at', { ascending: true })

    if (type) pendingQuery = pendingQuery.eq('task_type', type)
    if (leadId) pendingQuery = pendingQuery.eq('lead_id', leadId)
    for (const dt of DEPRECATED_TYPES) pendingQuery = pendingQuery.neq('task_type', dt)

    // Query 2: completed/failed tasks with date filter
    let historyQuery = supabase
      .from('agent_tasks')
      .select('*')
      .in('status', ['completed', 'failed', 'failed_24h_window'])
      .gte('created_at', from || (leadId ? '2020-01-01T00:00:00Z' : yesterday.toISOString()))
      .order('completed_at', { ascending: false })

    if (to) historyQuery = historyQuery.lte('created_at', to)
    if (type) historyQuery = historyQuery.eq('task_type', type)
    if (leadId) historyQuery = historyQuery.eq('lead_id', leadId)
    for (const dt of DEPRECATED_TYPES) historyQuery = historyQuery.neq('task_type', dt)

    const [pendingResult, historyResult] = await Promise.all([
      pendingQuery.limit(100),
      historyQuery.limit(200),
    ])

    if (pendingResult.error) {
      console.error('[tasks/route] Pending query error:', pendingResult.error.message, pendingResult.error.code)
      throw pendingResult.error
    }
    if (historyResult.error) {
      console.error('[tasks/route] History query error:', historyResult.error.message, historyResult.error.code)
      throw historyResult.error
    }

    console.log(`[tasks/route] Found ${pendingResult.data?.length || 0} pending, ${historyResult.data?.length || 0} history tasks`)

    const allTasks = [...(pendingResult.data || []), ...(historyResult.data || [])]

    // Enrich tasks with sequence info, temperature, and angle for frontend display
    const SEQUENCE_LABELS: Record<string, string> = {
      post_call: 'Post Call Sequence',
      no_response: 'No Response Sequence',
      dynamic: 'Dynamic Sequence',
      first_outreach: 'First Outreach Sequence',
    }
    const tasks = allTasks.map((t: any) => {
      const seq = t.metadata?.sequence
      const step = t.metadata?.step
      const totalSteps = t.metadata?.total_steps || 4
      const enriched: any = { ...t }

      // Sequence label
      if (seq && step != null) {
        enriched.sequence_label = `Step ${step} of ${totalSteps} - ${SEQUENCE_LABELS[seq] || seq}`
      }

      // Dashboard visibility: surface key decision data from metadata
      if (t.metadata?.next_action_reason) {
        enriched.next_action_reason = t.metadata.next_action_reason
      }
      if (t.metadata?.lead_temperature) {
        enriched.lead_temperature = t.metadata.lead_temperature
      }
      if (t.metadata?.message_angle) {
        enriched.message_angle = t.metadata.message_angle
      }
      if (t.metadata?.sequence_progress) {
        enriched.sequence_progress = t.metadata.sequence_progress
      }
      if (t.metadata?.timing_reason) {
        enriched.timing_reason = t.metadata.timing_reason
      }
      if (t.metadata?.confidence_score != null) {
        enriched.confidence_score = t.metadata.confidence_score
      }
      if (t.metadata?.completed_action) {
        enriched.completed_action = t.metadata.completed_action
      }

      // Outgoing-message preview: the actual template (filled with lead details)
      // this task will send. The inbox lead-panel timeline shows this when you
      // click a step, so you can see exactly what's going out per follow-up.
      enriched.preview = renderPreview(t)

      return enriched
    })

    // Stats
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000)

    const completedToday = (historyResult.data || []).filter(
      (t: any) => t.status === 'completed' && t.completed_at && new Date(t.completed_at) >= todayStart
    ).length
    const failedToday = (historyResult.data || []).filter(
      (t: any) => (t.status === 'failed' || t.status === 'failed_24h_window') && t.completed_at && new Date(t.completed_at) >= todayStart
    ).length
    const pendingCount = (pendingResult.data || []).filter((t: any) => t.status === 'pending').length
    const queuedCount = (pendingResult.data || []).filter((t: any) => t.status === 'queued').length
    // "Firing Next Hour" = pending tasks with scheduled_at in the next 1 hour
    const firingNextHour = (pendingResult.data || []).filter(
      (t) => t.status === 'pending' && t.scheduled_at && new Date(t.scheduled_at) <= oneHourFromNow
    ).length
    const successRate = completedToday + failedToday > 0
      ? Math.round((completedToday / (completedToday + failedToday)) * 100)
      : 100

    // Autonomy stats: calculate from task metadata
    const autoSentCount = allTasks.filter((t: any) =>
      t.status === 'completed' && t.metadata?.confidence_score >= 80
    ).length
    const manualApprovedCount = allTasks.filter((t: any) =>
      t.status === 'completed' && t.metadata?.approved_via === 'telegram'
    ).length
    const manualRejectedCount = allTasks.filter((t: any) =>
      t.status === 'cancelled' && t.error_message === 'Rejected via Telegram'
    ).length
    const totalDecisions = autoSentCount + manualApprovedCount + manualRejectedCount
    const autonomyLevel = totalDecisions > 0 ? Math.round((autoSentCount / totalDecisions) * 100) : 0

    // Confidence distribution of pending tasks
    const pendingWithConfidence = (pendingResult.data || []).filter((t: any) => t.metadata?.confidence_score != null)
    const confidenceDistribution = {
      high: pendingWithConfidence.filter((t: any) => t.metadata.confidence_score >= 80).length,
      medium: pendingWithConfidence.filter((t: any) => t.metadata.confidence_score >= 50 && t.metadata.confidence_score < 80).length,
      low: pendingWithConfidence.filter((t: any) => t.metadata.confidence_score < 50).length,
    }

    // ── Board view: KPIs + buckets + previews for the redesigned Tasks page ──
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const [comp7d, fail7d] = await Promise.all([
      supabase.from('agent_tasks').select('id', { count: 'exact', head: true })
        .eq('status', 'completed').gte('completed_at', sevenDaysAgo.toISOString()),
      supabase.from('agent_tasks').select('id', { count: 'exact', head: true })
        .in('status', ['failed', 'failed_24h_window']).gte('completed_at', sevenDaysAgo.toISOString()),
    ])
    const c7 = comp7d.count || 0, f7 = fail7d.count || 0
    const successRate7d = c7 + f7 > 0 ? Math.round((c7 / (c7 + f7)) * 100) : 100

    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
    const tomorrowEnd = new Date(todayEnd.getTime() + 24 * 60 * 60 * 1000)
    const pend = (pendingResult.data || [])
    const slim = (t: any) => ({
      id: t.id, lead_id: t.lead_id, lead_name: t.lead_name, task_type: t.task_type,
      status: t.status, scheduled_at: t.scheduled_at, channel: t.metadata?.channel || 'whatsapp',
      preview: renderPreview(t), actor: deriveActor(t), reason: deriveStatusReason(t),
      sequence_label: t.metadata?.sequence ? `Step ${t.metadata.step} of ${t.metadata.total_steps || 4}` : null,
    })

    // Next to fire: APPROVED-and-pending tasks due within 60 min (these actually send)
    const nextToFire = pend
      .filter((t: any) => t.status === 'pending' && t.scheduled_at && new Date(t.scheduled_at) <= oneHourFromNow)
      .sort((a: any, b: any) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
      .map(slim)

    // Needs attention: awaiting approval (queued) + recent failures/blocked.
    // Sort the queued ones NEWEST-FIRST (created_at desc) so the tasks the worker
    // just created surface at the top instead of being buried under stale ones.
    const needsAttention = [
      ...pend.filter((t: any) => t.status === 'queued')
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
      ...(historyResult.data || []).filter((t: any) =>
        (t.status === 'failed' || t.status === 'failed_24h_window') &&
        t.completed_at && new Date(t.completed_at) >= todayStart),
    ].map((t: any) => ({ ...slim(t), action: t.status === 'queued' ? 'approve' : (/template/i.test(t.error_message || '') ? 'fix_template' : /phone|number/i.test(t.error_message || '') ? 'update_contact' : 'retry') }))

    // Upcoming: pending beyond 60 min, grouped by horizon
    const upcomingPend = pend
      .filter((t: any) => t.status === 'pending' && t.scheduled_at && new Date(t.scheduled_at) > oneHourFromNow)
      .sort((a: any, b: any) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
    const fourHoursFromNow = new Date(now.getTime() + 4 * 60 * 60 * 1000)
    const upcoming = {
      nextHour: [] as any[], // (none — those are in nextToFire); kept for shape parity
      soon: upcomingPend.filter((t: any) => new Date(t.scheduled_at) <= fourHoursFromNow).map(slim),
      today: upcomingPend.filter((t: any) => { const d = new Date(t.scheduled_at); return d > fourHoursFromNow && d < todayEnd }).map(slim),
      tomorrow: upcomingPend.filter((t: any) => { const d = new Date(t.scheduled_at); return d >= todayEnd && d < tomorrowEnd }).map(slim),
      later: upcomingPend.filter((t: any) => new Date(t.scheduled_at) >= tomorrowEnd).map(slim),
    }

    // Activity feed: recent completed/failed
    const activity = (historyResult.data || [])
      .slice(0, 25)
      .map((t: any) => ({
        id: t.id, lead_id: t.lead_id, lead_name: t.lead_name, task_type: t.task_type,
        channel: t.metadata?.channel || 'whatsapp', status: t.status,
        outcome: t.status === 'completed' ? (t.metadata?.completed_action || 'Message sent') : (t.error_message || 'Failed'),
        actor: deriveActor(t), at: t.completed_at || t.created_at,
      }))

    const nextFires = nextToFire[0]?.scheduled_at
    const nextFiresInMs = nextFires ? Math.max(0, new Date(nextFires).getTime() - now.getTime()) : null
    const dueToday = pend.filter((t: any) => t.scheduled_at && new Date(t.scheduled_at) < todayEnd)

    const board = {
      kpis: {
        nextFiresInMs,
        dueToday: { total: dueToday.length, pending: dueToday.filter((t: any) => t.status === 'pending').length, queued: dueToday.filter((t: any) => t.status === 'queued').length },
        awaitingApproval: queuedCount,
        successRate7d,
        completedToday,
        queued: queuedCount,
      },
      nextToFire,
      needsAttention,
      upcoming,
      activity,
    }

    return NextResponse.json({
      tasks,
      board,
      stats: {
        completedToday,
        failedToday,
        pendingCount,
        queuedCount,
        firingNextHour,
        successRate,
        autonomy: {
          autonomy_level: autonomyLevel,
          total_decisions: totalDecisions,
          auto_sent: autoSentCount,
          manual_approved: manualApprovedCount,
          manual_rejected: manualRejectedCount,
          confidence_distribution: confidenceDistribution,
        },
      },
    })
  } catch (error) {
    console.error('[tasks/route] Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Failed to fetch tasks', details: errorMessage },
      { status: 500 }
    )
  }
}
