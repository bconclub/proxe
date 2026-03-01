/**
 * POST /api/admin/create-booking — Manually create a booking + Google Calendar event
 * For admin use only — creates a booking for a lead that was promised one but
 * the tool wasn't called during the WhatsApp conversation.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  createCalendarEvent,
  storeBooking,
} from '@/lib/services/bookingManager'
import { ensureOrUpdateLead } from '@/lib/services/leadManager'
import { getBrandConfig, getCurrentBrandId } from '@/configs'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Verify auth
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, phone, email, date, time, channel = 'whatsapp', notes } = body

    if (!name || !phone || !date || !time) {
      return NextResponse.json(
        { error: 'Required: name, phone, date (YYYY-MM-DD), time (e.g. "10:00 AM")' },
        { status: 400 }
      )
    }

    const brandId = getCurrentBrandId()
    const brandConfig = getBrandConfig(brandId)

    // 1. Ensure lead exists
    const leadId = await ensureOrUpdateLead(name, email || null, phone, channel as any, undefined, supabase)
    console.log('[admin/create-booking] Lead ID:', leadId)

    // 2. Create Google Calendar event
    let calendarResult = null
    try {
      calendarResult = await createCalendarEvent({
        date,
        time,
        name,
        email: email || undefined,
        phone,
        sessionType: 'online',
        conversationSummary: notes || `Manual booking created via admin for ${brandConfig.name}`,
      })
      console.log('[admin/create-booking] Calendar event created:', calendarResult?.eventId)
    } catch (calError: any) {
      console.error('[admin/create-booking] Calendar error:', calError.message)
    }

    // 3. Find or create a session to store the booking
    const channelTable = channel === 'whatsapp' ? 'whatsapp_sessions' : 'web_sessions'

    // Try to find existing session for this lead
    let sessionId: string | null = null
    if (leadId) {
      const { data: existingSession } = await supabase
        .from(channelTable)
        .select('external_session_id')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      sessionId = existingSession?.external_session_id || null
    }

    // If no session found, store booking directly in all_leads
    if (sessionId) {
      await storeBooking(
        sessionId,
        {
          date,
          time,
          googleEventId: calendarResult?.eventId,
          status: 'Call Booked',
          name,
          email: email || undefined,
          phone,
          sessionType: 'online',
          conversationSummary: notes || undefined,
        },
        channel as any,
        supabase
      )
    } else if (leadId) {
      // Direct update to all_leads if no session exists
      const { data: existingLead } = await supabase
        .from('all_leads')
        .select('unified_context, metadata')
        .eq('id', leadId)
        .maybeSingle()

      const existingCtx = existingLead?.unified_context || {}
      const mergedCtx = {
        ...existingCtx,
        [channel]: {
          ...(existingCtx[channel] || {}),
          booking_date: date,
          booking_time: time,
          booking_status: 'Call Booked',
        },
      }

      await supabase
        .from('all_leads')
        .update({
          unified_context: mergedCtx,
          last_interaction_at: new Date().toISOString(),
          metadata: {
            ...(existingLead?.metadata || {}),
            googleEventId: calendarResult?.eventId || null,
            booking_confirmed_at: new Date().toISOString(),
          },
        })
        .eq('id', leadId)
    }

    return NextResponse.json({
      success: true,
      leadId,
      sessionId,
      calendarEventCreated: !!calendarResult,
      calendarEventId: calendarResult?.eventId || null,
      calendarEventLink: calendarResult?.eventLink || null,
      booking: { name, phone, email, date, time, channel },
    })
  } catch (error: any) {
    console.error('[admin/create-booking] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create booking' },
      { status: 500 }
    )
  }
}
