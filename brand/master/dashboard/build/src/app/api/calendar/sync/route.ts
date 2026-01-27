import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@/lib/supabase/server'

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

    // Get all bookings from database
    const { data: bookings, error: bookingsError } = await supabase
      .from('unified_leads')
      .select('*')
      .not('booking_date', 'is', null)
      .not('booking_time', 'is', null)
      .not('booking_date', 'eq', '')
      .not('booking_time', 'eq', '')

    if (bookingsError) {
      throw bookingsError
    }

    if (!bookings || bookings.length === 0) {
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

        const eventTitle = `Master Meeting - ${booking.name || 'Unnamed'}`

        const eventData = {
          summary: eventTitle,
          description: `Master Booking\n\nName: ${booking.name || 'N/A'}\nEmail: ${booking.email || 'N/A'}\nPhone: ${booking.phone || 'N/A'}\n\nSource: ${booking.first_touchpoint || booking.last_touchpoint || booking.source || 'web'}`,
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

              // Update booking metadata with new event ID
              await supabase
                .from('unified_leads')
                .update({
                  metadata: {
                    ...booking.metadata,
                    googleEventId: newEvent.data.id,
                  },
                })
                .eq('id', booking.id)

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

            // Update booking metadata with event ID
            await supabase
              .from('unified_leads')
              .update({
                metadata: {
                  ...booking.metadata,
                  googleEventId: newEvent.data.id,
                },
              })
              .eq('id', booking.id)

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
