import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/dashboard/leads/[id]/activities
 * Fetch unified activity log for a lead
 * Includes: PROXe actions, Team actions, Customer actions
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    // Auth gate: every dashboard API requires a logged-in Supabase session.
    // No role check here — viewer vs admin enforcement is done at write sites.
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const leadId = params.id

    // Fetch all activities for this lead
    const activities: any[] = []

    // 1. PROXe actions: messages sent, sequences triggered (from conversations table where sender='agent')
    const { data: proxeMessages, error: proxeError } = await supabase
      .from('conversations')
      .select('id, content, created_at, channel, sender, metadata')
      .eq('lead_id', leadId)
      .eq('sender', 'agent')
      .order('created_at', { ascending: false })

    if (!proxeError && proxeMessages) {
      for (const msg of proxeMessages) {
        activities.push({
          id: msg.id,
          type: 'proxe',
          actor: 'PROXe',
          action: 'Message sent',
          content: msg.content,
          channel: msg.channel,
          timestamp: msg.created_at,
          icon: 'message',
          color: '#8B5CF6', // Purple
        })
      }
    }

    // Check for sequences triggered (from metadata or unified_context)
    const { data: lead } = await supabase
      .from('all_leads')
      .select('unified_context')
      .eq('id', leadId)
      .single()

    if (lead?.unified_context?.sequence) {
      activities.push({
        id: `sequence-${leadId}`,
        type: 'proxe',
        actor: 'PROXe',
        action: 'Sequence triggered',
        content: `Sequence: ${lead.unified_context.sequence.name || 'Unknown'}`,
        timestamp: lead.unified_context.sequence.triggered_at || new Date().toISOString(),
        icon: 'sequence',
        color: '#8B5CF6', // Purple
      })
    }

    // 2. Team actions: logged activities (from activities table).
    // created_by is a TEXT label (default 'system'), NOT a FK to
    // dashboard_users — so we can't PostgREST-embed the creator. Select the
    // scalar columns and resolve the actor name in a second query only for
    // rows whose created_by is a real dashboard_users UUID.
    const { data: teamActivities, error: teamError } = await supabase
      .from('activities')
      .select('id, activity_type, note, duration_minutes, next_followup_date, created_at, created_by')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })

    if (!teamError && teamActivities) {
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      const creatorIds = Array.from(new Set(
        teamActivities
          .map((a: any) => a.created_by)
          .filter((v: any) => typeof v === 'string' && UUID_RE.test(v))
      ))
      const nameById: Record<string, string> = {}
      if (creatorIds.length > 0) {
        const { data: creators } = await supabase
          .from('dashboard_users')
          .select('id, name, email')
          .in('id', creatorIds)
        for (const u of (creators || []) as Array<{ id: string; name: string | null; email: string | null }>) {
          nameById[u.id] = u.name || u.email || 'Team Member'
        }
      }
      for (const activity of teamActivities) {
        const cb = activity.created_by
        const actor = (cb && nameById[cb]) || (cb && cb !== 'system' ? cb : 'Team Member')
        activities.push({
          id: activity.id,
          type: 'team',
          actor,
          action: activity.activity_type.charAt(0).toUpperCase() + activity.activity_type.slice(1),
          content: activity.note,
          duration_minutes: activity.duration_minutes,
          next_followup_date: activity.next_followup_date,
          timestamp: activity.created_at,
          icon: activity.activity_type,
          color: '#3B82F6', // Blue
          user_id: activity.created_by,
        })
      }
    }

    // 3. Customer actions: replies, link clicks, bookings (from conversations where sender='customer')
    const { data: customerMessages, error: customerError } = await supabase
      .from('conversations')
      .select('id, content, created_at, channel, sender, metadata')
      .eq('lead_id', leadId)
      .eq('sender', 'customer')
      .order('created_at', { ascending: false })

    if (!customerError && customerMessages) {
      for (const msg of customerMessages) {
        activities.push({
          id: msg.id,
          type: 'customer',
          actor: 'Customer',
          action: 'Replied',
          content: msg.content,
          channel: msg.channel,
          timestamp: msg.created_at,
          icon: 'reply',
          color: '#22C55E', // Green
        })
      }
    }

    // Check for bookings
    const { data: webSession } = await supabase
      .from('web_sessions')
      .select('booking_date, booking_time, booking_status, booking_created_at')
      .eq('lead_id', leadId)
      .not('booking_date', 'is', null)
      .single()

    if (webSession?.booking_date) {
      activities.push({
        id: `booking-${leadId}`,
        type: 'customer',
        actor: 'Customer',
        action: 'Booking made',
        content: `Booking scheduled for ${webSession.booking_date} at ${webSession.booking_time}`,
        timestamp: webSession.booking_created_at || new Date().toISOString(),
        icon: 'booking',
        color: '#22C55E', // Green
      })
    }

    // Sort by timestamp (newest first)
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    return NextResponse.json({
      success: true,
      activities,
    })
  } catch (error) {
    console.error('Error fetching activities:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/dashboard/leads/[id]/activities
 * Create a new activity/note for a lead
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const leadId = params.id
    const body = await request.json()
    const { activity_type, note, duration_minutes } = body

    if (!note?.trim()) {
      return NextResponse.json({ error: 'Note is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('activities')
      .insert({
        lead_id: leadId,
        activity_type: activity_type || 'note',
        note: note.trim(),
        duration_minutes: duration_minutes || null,
        created_by: 'system',
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, activity: data })
  } catch (error) {
    console.error('Error creating activity:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
