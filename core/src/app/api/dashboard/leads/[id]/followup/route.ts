import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient, resolveBookingDate } from '@/lib/services'
import { assignOwnerOnTouch } from '@/lib/services/leadOwnership'
import { canAccessLeadId } from '@/lib/services/leadAccess'

export const dynamic = 'force-dynamic'

/**
 * POST /api/dashboard/leads/[id]/followup
 * Body: { activity_id: string, action: 'done' | 'snooze', date?: string, time?: string }
 *
 * Clears or moves a promised call-back. Follow-ups live in
 * activities.next_followup_date - a column the schema already had and nothing
 * read - rather than agent_tasks, whose inserts are dropped on the floor by
 * the trigger that stopped the automation.
 *
 * `done` nulls the date: the row survives as history of the call-back having
 * been promised, it simply stops being outstanding. `snooze` moves it. Both
 * are a touch, so both claim an unowned lead - the person working the queue is
 * the person who owns what they work.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const leadId = params.id
    // Cast: this project's typed Supabase client makes every .from() call
    // non-callable to tsc (the same ~90 pre-existing errors elsewhere).
    const supabase: any = getServiceClient() || authClient

    if (!(await canAccessLeadId(supabase, user.id, leadId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { activity_id, action, date, time } = (await request.json()) as {
      activity_id?: string
      action?: string
      date?: string
      time?: string
    }
    if (!activity_id) return NextResponse.json({ error: 'activity_id is required' }, { status: 400 })
    if (action !== 'done' && action !== 'snooze') {
      return NextResponse.json({ error: "action must be 'done' or 'snooze'" }, { status: 400 })
    }

    let nextAt: string | null = null
    if (action === 'snooze') {
      try {
        // No date given = the common "not today, try tomorrow" tap.
        nextAt = resolveBookingDate(date || 'tomorrow', time || null).toISOString()
      } catch {
        return NextResponse.json({ error: 'Could not read that date' }, { status: 400 })
      }
    }

    // Scoped by lead as well as id: an activity id from another lead must not
    // be resolvable through this lead's access check.
    const { error, data } = await supabase
      .from('activities')
      .update({ next_follow_up_date: nextAt })
      .eq('id', activity_id)
      .eq('lead_id', leadId)
      .select('id')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Follow-up not found on this lead' }, { status: 404 })
    }

    await assignOwnerOnTouch(supabase, leadId, user)

    return NextResponse.json({ success: true, action, next_followup_date: nextAt })
  } catch (err: any) {
    console.error('[followup] failed:', err?.message || err)
    return NextResponse.json({ error: err?.message || 'unknown' }, { status: 500 })
  }
}
