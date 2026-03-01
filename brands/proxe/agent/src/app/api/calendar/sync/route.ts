import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@/lib/supabase/server'
import { getBrandConfig, getCurrentBrandId } from '@/configs'

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'bconclubx@gmail.com'
const TIMEZONE = process.env.GOOGLE_CALENDAR_TIMEZONE || 'Asia/Kolkata'

async function getAuthClient() {
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  let privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY

  if (!serviceAccountEmail || !privateKey) {
    throw new Error('Google Calendar credentials not configured')
  }

  // Clean up the private key: handle escaped newlines, CRLF, and ensure proper formatting
  privateKey = privateKey
    .replace(/\\n/g, '\n')  // Replace escaped newlines
    .replace(/\r\n/g, '\n') // Replace CRLF with LF
    .replace(/\r/g, '\n')   // Replace any remaining CR with LF
    .trim()                 // Remove leading/trailing whitespace

  // Ensure the key starts and ends with proper markers
  if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
    throw new Error('Invalid private key format: missing BEGIN marker')
  }
  if (!privateKey.includes('-----END PRIVATE KEY-----')) {
    throw new Error('Invalid private key format: missing END marker')
  }

  const auth = new google.auth.JWT({
    email: serviceAccountEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  })

  return auth
}

export async function POST(request: NextRequest) {
  try {
    // Check if credentials are configured
    const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY

    if (!serviceAccountEmail || !privateKey) {
      return NextResponse.json(
        {
          error: 'Google Calendar credentials not configured',
          details: 'Please set up GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY environment variables.',
        },
        { status: 503 }
      )
    }

    const supabase = await createClient()
    const auth = await getAuthClient()
    const calendar = google.calendar({ version: 'v3', auth })

    // Get brand config for event titles/descriptions
    const brandId = getCurrentBrandId()
    const brandConfig = getBrandConfig(brandId)
    const brandName = brandConfig.name

    // Get all leads with booking data from all_leads + session tables
    const { data: leads, error: leadsError } = await supabase
      .from('all_leads')
      .select('id, customer_name, email, phone, first_touchpoint, last_touchpoint, unified_context, created_at')

    if (leadsError) {
      throw leadsError
    }

    // Get booking data from session tables
    const { data: webSessions } = await supabase
      .from('web_sessions')
      .select('lead_id, booking_date, booking_time, booking_status, metadata')
      .not('booking_date', 'is', null)

    const { data: whatsappSessions } = await supabase
      .from('whatsapp_sessions')
      .select('lead_id, booking_date, booking_time, booking_status, metadata')
      .not('booking_date', 'is', null)

    // Build booking records by merging lead data with session booking data
    const bookings: Array<{
      id: string
      name: string
      email: string | null
      phone: string | null
      booking_date: string
      booking_time: string
      first_touchpoint: string | null
      last_touchpoint: string | null
      unified_context: any
      metadata: any
      channel: string
    }> = []

    const safeLeads = leads || []

    // Helper: extract booking from unified_context
    const getUnifiedContextBooking = (lead: any) => {
      const ctx = lead.unified_context || {}
      for (const channel of ['web', 'whatsapp', 'voice', 'social']) {
        const channelCtx = ctx[channel] || {}
        const bookingDate = channelCtx.booking_date
        const bookingTime = channelCtx.booking_time
        if (bookingDate && bookingTime) {
          return { bookingDate, bookingTime, channel, metadata: channelCtx.metadata || {} }
        }
      }
      return null
    }

    // Collect bookings from session tables
    const processedLeadIds = new Set<string>()

    const addSessionBookings = (sessions: any[], channel: string) => {
      sessions?.forEach((session: any) => {
        if (!session.lead_id || !session.booking_date || !session.booking_time) return
        if (processedLeadIds.has(session.lead_id)) return

        const lead = safeLeads.find(l => l.id === session.lead_id)
        if (!lead) return

        processedLeadIds.add(session.lead_id)
        bookings.push({
          id: lead.id,
          name: lead.customer_name || 'Unknown',
          email: lead.email,
          phone: lead.phone,
          booking_date: session.booking_date,
          booking_time: session.booking_time,
          first_touchpoint: lead.first_touchpoint,
          last_touchpoint: lead.last_touchpoint,
          unified_context: lead.unified_context,
          metadata: session.metadata || {},
          channel,
        })
      })
    }

    addSessionBookings(webSessions || [], 'web')
    addSessionBookings(whatsappSessions || [], 'whatsapp')

    // Also check unified_context for leads not already found via sessions
    safeLeads.forEach(lead => {
      if (processedLeadIds.has(lead.id)) return
      const ucBooking = getUnifiedContextBooking(lead)
      if (ucBooking) {
        processedLeadIds.add(lead.id)
        bookings.push({
          id: lead.id,
          name: lead.customer_name || 'Unknown',
          email: lead.email,
          phone: lead.phone,
          booking_date: ucBooking.bookingDate,
          booking_time: ucBooking.bookingTime,
          first_touchpoint: lead.first_touchpoint,
          last_touchpoint: lead.last_touchpoint,
          unified_context: lead.unified_context,
          metadata: ucBooking.metadata,
          channel: ucBooking.channel,
        })
      }
    })

    if (bookings.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No bookings to sync',
        synced: 0,
        created: 0,
        updated: 0,
        errors: [],
      })
    }

    // Get all events from Google Calendar for the date range
    const now = new Date()
    const futureDate = new Date()
    futureDate.setMonth(futureDate.getMonth() + 6) // Sync next 6 months

    const { data: calendarEvents } = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: now.toISOString(),
      timeMax: futureDate.toISOString(),
      timeZone: TIMEZONE,
      singleEvents: true,
      orderBy: 'startTime',
    })

    const existingEvents = new Map(
      (calendarEvents?.items || []).map((event) => [
        event.id,
        event,
      ])
    )

    // Create a map of bookings by Google Event ID
    const bookingsByEventId = new Map(
      bookings
        .filter((b: any) => b.metadata?.googleEventId)
        .map((b: any) => [b.metadata.googleEventId, b])
    )

    let created = 0
    let updated = 0
    let errors: string[] = []

    // Sync each booking
    for (const booking of bookings) {
      try {
        const bookingDate = booking.booking_date
        const bookingTime = booking.booking_time

        if (!bookingDate || !bookingTime) continue

        // Parse time (format: "HH:MM" or "HH:MM AM/PM")
        let hour: number, minute: number

        if (bookingTime.includes('AM') || bookingTime.includes('PM')) {
          const [timePart, period] = bookingTime.split(' ')
          const [h, m] = timePart.split(':').map(Number)
          hour = period === 'PM' && h !== 12 ? h + 12 : period === 'AM' && h === 12 ? 0 : h
          minute = m || 0
        } else {
          [hour, minute = 0] = bookingTime.split(':').map(Number)
        }

        // Create event start/end times in timezone format
        const eventStart = `${bookingDate}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00+05:30`
        const endHour = hour + 1
        const eventEnd = `${bookingDate}T${endHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00+05:30`

        // Build event title and description using booking details
        const conversationSummary = booking.metadata?.conversationSummary || booking.metadata?.conversation_summary || booking.unified_context?.web?.conversation_summary

        // Build event title: Brand - Candidate Name [Channel]
        const channelLabel = booking.channel === 'whatsapp' ? 'WhatsApp' : booking.channel === 'web' ? 'Web' : booking.channel || 'Web'
        const eventTitle = `${brandName} Booking - ${booking.name} [${channelLabel}]`

        // Build description
        let description = `${brandName} - Consultation Booking\n\n`
        description += `Contact Information:\n`
        description += `Name: ${booking.name || 'N/A'}\n`
        description += `Email: ${booking.email || 'N/A'}\n`
        description += `Phone: ${booking.phone || 'N/A'}\n\n`

        if (conversationSummary) {
          description += `Conversation Summary:\n${conversationSummary}\n\n`
        }

        description += `Booking Details:\n`
        description += `Date: ${bookingDate}\n`
        description += `Time: ${bookingTime}\n`
        description += `Source: ${booking.first_touchpoint || booking.last_touchpoint || 'web'}`

        const eventData = {
          summary: eventTitle,
          description: description,
          start: {
            dateTime: eventStart,
            timeZone: TIMEZONE,
          },
          end: {
            dateTime: eventEnd,
            timeZone: TIMEZONE,
          },
          attendees: booking.email
            ? [{ email: booking.email, displayName: booking.name || 'Guest' }]
            : [],
        }

        const googleEventId = booking.metadata?.googleEventId

        if (googleEventId && existingEvents.has(googleEventId)) {
          // Update existing event
          try {
            await calendar.events.update({
              calendarId: CALENDAR_ID,
              eventId: googleEventId,
              requestBody: eventData,
            })
            updated++
          } catch (updateError: any) {
            // If update fails (e.g., event deleted), create new one
            if (updateError.code === 404) {
              const newEvent = await calendar.events.insert({
                calendarId: CALENDAR_ID,
                requestBody: eventData,
              })

              // Store google event ID in the session table metadata
              await updateBookingMetadata(supabase, booking, newEvent.data.id)
              created++
            } else {
              errors.push(`Failed to update booking ${booking.id}: ${updateError.message}`)
            }
          }
        } else {
          // Create new event
          try {
            const newEvent = await calendar.events.insert({
              calendarId: CALENDAR_ID,
              requestBody: eventData,
            })

            // Store google event ID in the session table metadata
            await updateBookingMetadata(supabase, booking, newEvent.data.id)
            created++
          } catch (createError: any) {
            errors.push(`Failed to create event for booking ${booking.id}: ${createError.message}`)
          }
        }
      } catch (error: any) {
        errors.push(`Error syncing booking ${booking.id}: ${error.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Synced ${bookings.length} bookings`,
      synced: bookings.length,
      created,
      updated,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('Error syncing calendar:', error)
    return NextResponse.json(
      {
        error: error.message || 'Failed to sync calendar',
        details: error.details || 'Unknown error occurred',
      },
      { status: 500 }
    )
  }
}

/**
 * Update booking metadata with Google Event ID.
 * Writes to the appropriate session table based on the booking channel.
 */
async function updateBookingMetadata(supabase: any, booking: any, googleEventId: string | null | undefined) {
  if (!googleEventId) return

  const table = booking.channel === 'whatsapp' ? 'whatsapp_sessions' : 'web_sessions'

  // Try updating the session table metadata
  const { error } = await supabase
    .from(table)
    .update({
      metadata: {
        ...(booking.metadata || {}),
        googleEventId,
      },
    })
    .eq('lead_id', booking.id)
    .not('booking_date', 'is', null)

  if (error) {
    console.warn(`Failed to store googleEventId for booking ${booking.id}:`, error)
  }
}
