import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Extract booking date/time from a lead, checking all possible sources:
 * 1. Direct booking_date/booking_time columns on all_leads
 * 2. unified_context per-channel booking data
 * 3. Session table booking data (passed in separately)
 */
function getBookingData(lead: any, sessionBookings: Record<string, { date: string | null; time: string | null }>) {
  const uc = lead.unified_context || {}
  const webBooking = uc?.web?.booking || {}
  const whatsappBooking = uc?.whatsapp?.booking || {}
  const voiceBooking = uc?.voice?.booking || {}
  const socialBooking = uc?.social?.booking || {}
  const sessionBooking = sessionBookings[lead.id]

  const bookingDate =
    lead.booking_date ||
    uc?.web?.booking_date ||
    uc?.whatsapp?.booking_date ||
    uc?.voice?.booking_date ||
    uc?.social?.booking_date ||
    webBooking?.date || webBooking?.booking_date ||
    whatsappBooking?.date || whatsappBooking?.booking_date ||
    voiceBooking?.date || voiceBooking?.booking_date ||
    socialBooking?.date || socialBooking?.booking_date ||
    sessionBooking?.date ||
    null

  const bookingTime =
    lead.booking_time ||
    uc?.web?.booking_time ||
    uc?.whatsapp?.booking_time ||
    uc?.voice?.booking_time ||
    uc?.social?.booking_time ||
    webBooking?.time || webBooking?.booking_time ||
    whatsappBooking?.time || whatsappBooking?.booking_time ||
    voiceBooking?.time || voiceBooking?.booking_time ||
    socialBooking?.time || socialBooking?.booking_time ||
    sessionBooking?.time ||
    null

  return { bookingDate, bookingTime }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const searchParams = request.nextUrl.searchParams
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // Fetch ALL leads (we need to check unified_context + session tables too)
    const { data: allLeads, error: leadsError } = await supabase
      .from('all_leads')
      .select('*')

    if (leadsError) throw leadsError

    // Fetch booking data from all session tables
    const [
      { data: whatsappSessions },
      { data: webSessions },
      { data: voiceSessions },
      { data: socialSessions },
    ] = await Promise.all([
      supabase.from('whatsapp_sessions').select('lead_id, booking_date, booking_time'),
      supabase.from('web_sessions').select('lead_id, booking_date, booking_time'),
      supabase.from('voice_sessions').select('lead_id, booking_date, booking_time'),
      supabase.from('social_sessions').select('lead_id, booking_date, booking_time'),
    ])

    // Build session bookings map
    const sessionBookings: Record<string, { date: string | null; time: string | null }> = {}
    const addBookings = (sessions: any[]) => {
      sessions?.forEach((session: any) => {
        if (session.lead_id && (session.booking_date || session.booking_time)) {
          if (!sessionBookings[session.lead_id] || (!sessionBookings[session.lead_id].date && session.booking_date)) {
            sessionBookings[session.lead_id] = {
              date: session.booking_date || sessionBookings[session.lead_id]?.date || null,
              time: session.booking_time || sessionBookings[session.lead_id]?.time || null,
            }
          }
        }
      })
    }
    addBookings(whatsappSessions || [])
    addBookings(webSessions || [])
    addBookings(voiceSessions || [])
    addBookings(socialSessions || [])

    // Process all leads - extract booking data from all sources
    const bookings = (allLeads || [])
      .map((lead: any) => {
        const { bookingDate, bookingTime } = getBookingData(lead, sessionBookings)
        return { lead, bookingDate, bookingTime }
      })
      .filter(({ bookingDate }) => {
        if (!bookingDate) return false
        if (startDate && bookingDate < startDate) return false
        if (endDate && bookingDate > endDate) return false
        return true
      })
      .sort((a, b) => {
        const dateCompare = (a.bookingDate || '').localeCompare(b.bookingDate || '')
        if (dateCompare !== 0) return dateCompare
        return (a.bookingTime || '').localeCompare(b.bookingTime || '')
      })
      .map(({ lead, bookingDate, bookingTime }) => ({
        ...lead,
        booking_date: bookingDate,
        booking_time: bookingTime,
        name: lead.customer_name || lead.name || null,
        source: lead.first_touchpoint || lead.last_touchpoint || 'whatsapp',
        metadata: {
          ...lead.metadata,
          title: lead.booking_title || lead.metadata?.title || null,
        },
      }))

    // Also backfill: update all_leads.booking_date/booking_time for leads that have it in other sources but not directly
    const leadsToBackfill = bookings.filter((b: any) => {
      const originalLead = (allLeads || []).find((l: any) => l.id === b.id)
      return originalLead && !originalLead.booking_date && b.booking_date
    })

    if (leadsToBackfill.length > 0) {
      // Fire-and-forget backfill (don't block the response)
      Promise.all(
        leadsToBackfill.map((b: any) =>
          supabase
            .from('all_leads')
            .update({ booking_date: b.booking_date, booking_time: b.booking_time })
            .eq('id', b.id)
        )
      ).catch(err => console.error('Backfill error:', err))
    }

    return NextResponse.json({ bookings })
  } catch (error) {
    console.error('Error fetching bookings:', error)
    return NextResponse.json(
      { error: 'Failed to fetch bookings' },
      { status: 500 }
    )
  }
}
