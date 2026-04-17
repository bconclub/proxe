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
        skipped: 0,
        errors: [],
      })
    }

    // Get all events from Google Calendar (past 1 month + future 6 months)
    const pastDate = new Date()
    pastDate.setMonth(pastDate.getMonth() - 1)
    const futureDate = new Date()
    futureDate.setMonth(futureDate.getMonth() + 6)

    const { data: calendarEvents } = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: pastDate.toISOString(),
      timeMax: futureDate.toISOString(),
      timeZone: TIMEZONE,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 2500,
    })

    // Map by event ID for quick lookup
    const existingEventsById = new Map(
      (calendarEvents?.items || []).map((event) => [event.id, event])
    )

    // Build a fingerprint map: "name|date|hour" → event
    // This prevents creating duplicates when googleEventId is missing from DB
    const existingEventsByFingerprint = new Map<string, any>()
    for (const event of calendarEvents?.items || []) {
      if (!event.summary || !event.start?.dateTime) continue
      // Extract name from title like "BCON Booking - Savari [WhatsApp]"
      const nameMatch = event.summary.match(/Booking\s*-\s*(.+?)(?:\s*\[|$)/)
      const name = nameMatch?.[1]?.trim()?.toLowerCase() || ''
      const startDT = new Date(event.start.dateTime)
      const dateStr = startDT.toISOString().split('T')[0]
      const hourStr = startDT.getHours().toString().padStart(2, '0')
      const fingerprint = `${name}|${dateStr}|${hourStr}`
      // Keep the first (oldest) event for each fingerprint
      if (!existingEventsByFingerprint.has(fingerprint)) {
        existingEventsByFingerprint.set(fingerprint, event)
      }
    }

    let created = 0
    let updated = 0
    let skipped = 0
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
        }

        // Check all possible sources for googleEventId
        const googleEventId =
          booking.metadata?.googleEventId ||
          booking.metadata?.google_event_id ||
          booking.unified_context?.web?.metadata?.googleEventId ||
          booking.unified_context?.whatsapp?.metadata?.googleEventId ||
          null

        if (googleEventId && existingEventsById.has(googleEventId)) {
          // Update existing event that we have a tracked ID for
          try {
            await calendar.events.update({
              calendarId: CALENDAR_ID,
              eventId: googleEventId,
              requestBody: eventData,
            })
            updated++
          } catch (updateError: any) {
            if (updateError.code === 404) {
              // Event was deleted from calendar - re-create
              const newEvent = await calendar.events.insert({
                calendarId: CALENDAR_ID,
                requestBody: eventData,
              })
              await updateBookingMetadata(supabase, booking, newEvent.data.id)
              created++
            } else {
              errors.push(`Update failed for ${booking.name}: ${updateError.message}`)
            }
          }
        } else {
          // No tracked googleEventId - check if a matching event already exists
          // by matching name + date + hour (fingerprint dedup)
          const bookingName = (booking.name || '').toLowerCase().trim()
          const fingerprint = `${bookingName}|${bookingDate}|${hour.toString().padStart(2, '0')}`
          const existingMatch = existingEventsByFingerprint.get(fingerprint)

          if (existingMatch?.id) {
            // Event already exists on calendar - link it, don't create a duplicate
            console.log(`[calendar/sync] Linking existing event ${existingMatch.id} to booking ${booking.id} (${booking.name})`)
            await updateBookingMetadata(supabase, booking, existingMatch.id)
            // Also update the event details to latest
            try {
              await calendar.events.update({
                calendarId: CALENDAR_ID,
                eventId: existingMatch.id,
                requestBody: eventData,
              })
            } catch (_) { /* best effort update */ }
            updated++
          } else {
            // Truly new booking - create event
            try {
              const newEvent = await calendar.events.insert({
                calendarId: CALENDAR_ID,
                requestBody: eventData,
              })
              await updateBookingMetadata(supabase, booking, newEvent.data.id)
              // Add to fingerprint map so subsequent bookings in same batch don't duplicate
              existingEventsByFingerprint.set(fingerprint, { id: newEvent.data.id })
              created++
            } catch (createError: any) {
              errors.push(`Create failed for ${booking.name}: ${createError.message}`)
            }
          }
        }
      } catch (error: any) {
        errors.push(`Sync error for ${booking.name || booking.id}: ${error.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Synced ${bookings.length} bookings`,
      synced: bookings.length,
      created,
      updated,
      skipped,
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

  // Update session table metadata
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
    console.warn(`Failed to store googleEventId in session for booking ${booking.id}:`, error)
  }

  // Also persist googleEventId in all_leads.metadata (more reliable lookup)
  try {
    const { data: lead } = await supabase
      .from('all_leads')
      .select('metadata')
      .eq('id', booking.id)
      .maybeSingle()

    await supabase
      .from('all_leads')
      .update({
        metadata: {
          ...(lead?.metadata || {}),
          googleEventId,
        },
      })
      .eq('id', booking.id)
  } catch (e) {
    console.warn(`Failed to store googleEventId in all_leads for booking ${booking.id}:`, e)
  }
}
