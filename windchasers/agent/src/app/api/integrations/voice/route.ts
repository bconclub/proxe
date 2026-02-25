import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    // Verify webhook signature if needed
    const apiKey = request.headers.get('x-api-key')
    if (apiKey !== process.env.VOICE_API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const supabase = await createClient()

    // Generate external_session_id if not provided
    const externalSessionId = body.external_session_id || body.call_id || `voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Store session in sessions table
    const { data, error } = await supabase
      .from('sessions')
      .insert({
        external_session_id: externalSessionId,
        user_name: body.name,
        email: body.email,
        phone: body.phone,
        channel: 'voice',
        booking_status: body.booking_status || (body.booking_date ? 'confirmed' : null),
        booking_date: body.booking_date || null,
        booking_time: body.booking_time || null,
        channel_data: {
          call_id: body.call_id,
          duration: body.duration,
          transcript: body.transcript,
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
      status: data.booking_status === 'confirmed' ? 'booked' : 
              data.booking_status === 'pending' ? 'pending' :
              data.booking_status === 'cancelled' ? 'cancelled' : null,
      booking_date: data.booking_date,
      booking_time: data.booking_time,
      metadata: data.channel_data,
    }

    return NextResponse.json({ success: true, lead })
  } catch (error) {
    console.error('Error processing voice webhook:', error)
    return NextResponse.json(
      { error: 'Failed to process webhook' },
      { status: 500 }
    )
  }
}


