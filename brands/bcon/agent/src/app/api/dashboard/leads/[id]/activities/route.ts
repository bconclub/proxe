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
    // AUTHENTICATION DISABLED - No auth check needed
    // const {
    //   data: { user },
    // } = await supabase.auth.getUser()

    // if (!user) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // }
    
    // Use a placeholder user ID for logging (since auth is disabled)
    const user = { id: 'system' }

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

    // 2. Team actions: logged activities (from activities table)
    const { data: teamActivities, error: teamError } = await supabase
      .from('activities')
      .select(`
        id,
        activity_type,
        note,
        duration_minutes,
        next_followup_date,
        created_at,
        created_by,
        dashboard_users:created_by (
          id,
          name,
          email
        )
      `)
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })

    if (!teamError && teamActivities) {
      for (const activity of teamActivities) {
        // dashboard_users is an array from the relation query, get first element
        const creator = Array.isArray(activity.dashboard_users) 
          ? activity.dashboard_users[0] 
          : activity.dashboard_users
        activities.push({
          id: activity.id,
          type: 'team',
          actor: creator?.name || creator?.email || 'Team Member',
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
