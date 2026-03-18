import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, getClient } from '@/lib/services'

export const dynamic = 'force-dynamic'

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
      if (from) query = query.gte('created_at', from)
      if (to) query = query.lte('created_at', to)

      const { data, error } = await query.limit(200)
      if (error) {
        console.error('[tasks/route] Filtered query error:', error.message, error.code)
        throw error
      }
      return NextResponse.json({ tasks: data || [] })
    }

    // Query 1: pending and in_queue tasks (no date filter)
    let pendingQuery = supabase
      .from('agent_tasks')
      .select('*')
      .in('status', ['pending', 'in_queue', 'queued'])
      .order('scheduled_at', { ascending: true })

    if (type) pendingQuery = pendingQuery.eq('task_type', type)

    // Query 2: completed/failed tasks with date filter
    let historyQuery = supabase
      .from('agent_tasks')
      .select('*')
      .in('status', ['completed', 'failed', 'failed_24h_window'])
      .gte('created_at', from || yesterday.toISOString())
      .order('completed_at', { ascending: false })

    if (to) historyQuery = historyQuery.lte('created_at', to)
    if (type) historyQuery = historyQuery.eq('task_type', type)

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

    // Enrich tasks with sequence info for frontend display
    const SEQUENCE_LABELS: Record<string, string> = {
      post_call: 'Post Call Sequence',
      no_response: 'No Response Sequence',
    }
    const tasks = allTasks.map((t: any) => {
      const seq = t.metadata?.sequence
      const step = t.metadata?.step
      const totalSteps = t.metadata?.total_steps || 4
      if (seq && step != null) {
        return {
          ...t,
          sequence_label: `Step ${step} of ${totalSteps} — ${SEQUENCE_LABELS[seq] || seq}`,
        }
      }
      return t
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

    return NextResponse.json({
      tasks,
      stats: {
        completedToday,
        failedToday,
        pendingCount,
        queuedCount,
        firingNextHour,
        successRate,
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
