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

    // Get all bookings from database (include metadata and unified_context)
    const { data: bookings, error: bookingsError } = await supabase
      .from('unified_leads')
      .select('id, name, email, phone, booking_date, booking_time, first_touchpoint, last_touchpoint, source, metadata, unified_context')
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

        // Build event title and description using booking details from metadata if available
        const courseInterest = booking.metadata?.courseInterest || booking.unified_context?.windchasers?.course_interest;
        const sessionType = booking.metadata?.sessionType;
        const conversationSummary = booking.metadata?.conversationSummary || booking.metadata?.conversation_summary || booking.unified_context?.web?.conversation_summary;
        
        // Map course interest codes to readable names
        const courseNameMap: Record<string, string> = {
          'pilot': 'Pilot Training',
          'helicopter': 'Helicopter Training',
          'drone': 'Drone Training',
          'cabin': 'Cabin Crew Training',
        };
        const courseDisplayName = courseInterest && courseNameMap[courseInterest.toLowerCase()] 
          ? courseNameMap[courseInterest.toLowerCase()] 
          : courseInterest || 'Aviation Course Inquiry';

        // Build event title: Candidate Name - Course Details [Session Type]
        let eventTitle = `${booking.name || 'Unnamed'} - ${courseDisplayName}`;
        if (sessionType) {
          const sessionTypeLabel = sessionType === 'offline' ? 'Facility Visit' : 'Online';
          eventTitle += ` [${sessionTypeLabel}]`;
        } else {
          // Fallback to simple title if no details
          eventTitle = `Windchasers Demo - ${booking.name || 'Unnamed'}`;
        }

        // Build description - use stored description if available, otherwise build from details
        let description = '';
        if (booking.metadata?.description) {
          // Use stored description (shorter unified description)
          description = booking.metadata.description;
        } else {
          // Build description from available details
          description = `Windchasers Aviation Academy - Consultation Booking\n\n`;
          description += `Candidate Information:\n`;
          description += `Name: ${booking.name || 'N/A'}\n`;
          description += `Email: ${booking.email || 'N/A'}\n`;
          description += `Phone: ${booking.phone || 'N/A'}\n\n`;
          
          if (courseDisplayName && courseDisplayName !== 'Aviation Course Inquiry') {
            description += `Course Interest: ${courseDisplayName}\n\n`;
          }
          
          if (sessionType) {
            const sessionTypeDisplay = sessionType === 'offline' 
              ? 'Offline / Facility Visit' 
              : sessionType === 'online' 
              ? 'Online Session' 
              : sessionType;
            description += `Session Type: ${sessionTypeDisplay}\n\n`;
          }
          
          if (conversationSummary) {
            description += `Conversation Summary:\n${conversationSummary}\n\n`;
          }
          
          description += `Booking Details:\n`;
          description += `Date: ${bookingDate}\n`;
          description += `Time: ${bookingTime}\n\n`;
          description += `Source: ${booking.first_touchpoint || booking.last_touchpoint || booking.source || 'web'}`;
        }

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

        // Add location based on session type
        if (sessionType === 'offline') {
          eventData.location = 'Windchasers Aviation Academy Facility';
        } else if (sessionType === 'online') {
          eventData.location = 'Online Session (Video Call)';
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
