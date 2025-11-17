import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch leads from unified_leads view (includes chat_sessions and dashboard_leads)
    const { data: leads, error } = await supabase
      .from('unified_leads')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(100)

    if (error) throw error

    // Map to dashboard format
    const mappedLeads = leads?.map((lead) => ({
      id: lead.id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      source: lead.source || 'web',
      timestamp: lead.timestamp,
      status: lead.status,
      booking_date: lead.booking_date,
      booking_time: lead.booking_time,
      metadata: lead.metadata,
    }))

    return NextResponse.json({ leads: mappedLeads || [] })
  } catch (error) {
    console.error('Error fetching web agent leads:', error)
    return NextResponse.json(
      { error: 'Failed to fetch leads' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    // Generate external_session_id if not provided
    const externalSessionId = body.external_session_id || body.chat_session_id || `web_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Set initial status based on booking_status
    // If booking is confirmed, set to "Call Booked", otherwise "New Lead"
    const initialStatus = body.booking_status === 'confirmed' ? 'Call Booked' : 'New Lead'

    // Store session in sessions table
    const { data, error } = await supabase
      .from('sessions')
      .insert({
        external_session_id: externalSessionId,
        user_name: body.name,
        email: body.email,
        phone: body.phone,
        channel: 'web',
        status: initialStatus,
        booking_status: body.booking_status || null,
        booking_date: body.booking_date || null,
        booking_time: body.booking_time || null,
        channel_data: {
          chat_session_id: body.chat_session_id || null,
          ...(body.metadata || {}),
        },
      })
      .select()
      .single()

    if (error) throw error

    // Map session to lead format for backward compatibility
    const lead = {
      id: data.id,
      name: data.user_name,
      email: data.email,
      phone: data.phone,
      source: data.channel,
      timestamp: data.created_at,
      status: data.status || initialStatus,
      booking_date: data.booking_date,
      booking_time: data.booking_time,
      metadata: data.channel_data,
    }

    return NextResponse.json({ lead })
  } catch (error) {
    console.error('Error creating web agent lead:', error)
    return NextResponse.json(
      { error: 'Failed to create lead' },
      { status: 500 }
    )
  }
}


