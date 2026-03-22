import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, getClient } from '@/lib/services'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params
    const supabase = getServiceClient() || getClient()
    if (!supabase) {
      return NextResponse.json({ error: 'No database connection' }, { status: 500 })
    }

    const body = await request.json()
    const { action, scheduled_at } = body

    if (!action || !['cancel', 'reschedule', 'send_now'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action. Must be cancel, reschedule, or send_now' }, { status: 400 })
    }

    // Fetch the task
    const { data: task, error: fetchError } = await supabase
      .from('agent_tasks')
      .select('id, status, task_type, lead_name')
      .eq('id', taskId)
      .maybeSingle()

    if (fetchError || !task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    if (task.status !== 'pending' && task.status !== 'queued') {
      return NextResponse.json({ error: `Cannot modify task with status "${task.status}"` }, { status: 400 })
    }

    if (action === 'cancel') {
      const { error } = await supabase
        .from('agent_tasks')
        .update({
          status: 'cancelled',
          completed_at: new Date().toISOString(),
          error_message: 'Cancelled from dashboard',
        })
        .eq('id', taskId)

      if (error) throw error
      return NextResponse.json({ success: true, message: `Cancelled ${task.task_type} for ${task.lead_name}` })
    }

    if (action === 'reschedule') {
      if (!scheduled_at) {
        return NextResponse.json({ error: 'scheduled_at is required for reschedule' }, { status: 400 })
      }
      const { error } = await supabase
        .from('agent_tasks')
        .update({
          scheduled_at: new Date(scheduled_at).toISOString(),
          metadata: { ...(task as any).metadata, timing_reason: `Rescheduled from dashboard to ${new Date(scheduled_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}` },
        })
        .eq('id', taskId)

      if (error) throw error
      return NextResponse.json({ success: true, message: `Rescheduled ${task.task_type} for ${task.lead_name}` })
    }

    if (action === 'send_now') {
      const { error } = await supabase
        .from('agent_tasks')
        .update({
          scheduled_at: new Date().toISOString(),
          metadata: { ...(task as any).metadata, timing_reason: 'Sent now from dashboard' },
        })
        .eq('id', taskId)

      if (error) throw error
      return NextResponse.json({ success: true, message: `${task.task_type} for ${task.lead_name} will fire on next worker run` })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('[tasks/action] Error:', error)
    return NextResponse.json(
      { error: 'Failed to perform action', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
