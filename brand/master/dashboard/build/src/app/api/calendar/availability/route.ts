import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'bconclubx@gmail.com'
const TIMEZONE = process.env.GOOGLE_CALENDAR_TIMEZONE || 'Asia/Kolkata'

// Available time slots (in UTC+5:30 / Asia/Kolkata)
const AVAILABLE_SLOTS = [
  '11:00', // 11:00 AM
  '13:00', // 1:00 PM
  '15:00', // 3:00 PM
  '16:00', // 4:00 PM
  '17:00', // 5:00 PM
  '18:00', // 6:00 PM
]

async function getAuthClient() {
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  let privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY

  if (!serviceAccountEmail || !privateKey) {
    throw new Error('Google Calendar credentials not configured')
  }

  privateKey = privateKey
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()

  if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
    throw new Error('Invalid private key format: missing BEGIN marker')
  }
  if (!privateKey.includes('-----END PRIVATE KEY-----')) {
    throw new Error('Invalid private key format: missing END marker')
  }

  const auth = new google.auth.JWT({
    email: serviceAccountEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  })

  return auth
}

function formatTimeForDisplay(time24: string): string {
  const [hour, minute] = time24.split(':').map(Number)
  const period = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
  return `${hour12}:${minute.toString().padStart(2, '0')} ${period}`
}

export async function POST(request: NextRequest) {
  // `date` is used in success and error responses; declare outside `try`
  // so it's available in `catch` even if parsing fails.
  let date: string | undefined
  try {
    ;({ date } = await request.json())

    if (!date) {
      return NextResponse.json({ error: 'Date is required' }, { status: 400 })
    }

    const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY

    if (!serviceAccountEmail || !privateKey) {
      return NextResponse.json({
        date,
        availability: {},
        slots: AVAILABLE_SLOTS.map((slot) => {
          const displayTime = formatTimeForDisplay(slot)
          return {
            time: displayTime,
            time24: slot,
            available: true,
            displayTime: displayTime,
          }
        }),
        warning: 'Google Calendar credentials not configured. Showing all slots as available.',
      })
    }

    const auth = await getAuthClient()
    const calendar = google.calendar({ version: 'v3', auth })

    const dateStr = date.split('T')[0]
    const startOfDay = `${dateStr}T00:00:00+05:30`
    const endOfDay = `${dateStr}T23:59:59+05:30`

    const startOfDayUTC = new Date(`${dateStr}T00:00:00+05:30`).toISOString()
    const endOfDayUTC = new Date(`${dateStr}T23:59:59+05:30`).toISOString()

    let response
    try {
      response = await calendar.events.list({
        calendarId: CALENDAR_ID,
        timeMin: startOfDayUTC,
        timeMax: endOfDayUTC,
        timeZone: TIMEZONE,
        singleEvents: true,
        orderBy: 'startTime',
      })
    } catch (calendarError: any) {
      let errorMessage = 'Failed to check calendar availability'
      let details = calendarError.message || 'Unknown error'
      let suggestion = ''

      if (calendarError.code === 404 || details.includes('Not Found')) {
        errorMessage = 'Calendar not found or access denied'
        details = `The calendar "${CALENDAR_ID}" was not found or the service account doesn't have access.`
        suggestion = `Please share the calendar "${CALENDAR_ID}" with the service account email "${serviceAccountEmail}" and give it "See all event details" permission.`
      } else if (calendarError.code === 403 || details.includes('Forbidden')) {
        errorMessage = 'Access denied to calendar'
        details = `The service account "${serviceAccountEmail}" doesn't have permission to access the calendar "${CALENDAR_ID}".`
        suggestion = `Share the calendar "${CALENDAR_ID}" with "${serviceAccountEmail}" and give it "See all event details" permission.`
      }

      return NextResponse.json(
        {
          error: errorMessage,
          details: details,
          suggestion: suggestion,
          calendarId: CALENDAR_ID,
          serviceAccountEmail: serviceAccountEmail,
          date,
          availability: {},
          slots: AVAILABLE_SLOTS.map((slot) => {
            const displayTime = formatTimeForDisplay(slot)
            return {
              time: displayTime,
              time24: slot,
              available: true, // Default to available on error
              displayTime: displayTime,
            }
          }),
        },
        { status: calendarError.code === 404 || calendarError.code === 403 ? 403 : 500 }
      )
    }

    const events = response.data.items || []
    const availability: Record<string, boolean> = {}

    AVAILABLE_SLOTS.forEach((slot) => {
      const [hour, minute] = slot.split(':').map(Number)
      const slotStart = `${dateStr}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00+05:30`
      const slotEndHour = hour + 1
      const slotEnd = `${dateStr}T${slotEndHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00+05:30`

      const slotStartDate = new Date(slotStart)
      const slotEndDate = new Date(slotEnd)

      const conflictingEvent = events.find((event: any) => {
        if (!event.start || !event.end) return false

        let eventStart: Date
        let eventEnd: Date

        if (event.start.dateTime) {
          eventStart = new Date(event.start.dateTime)
        } else if (event.start.date) {
          const eventDate = new Date(event.start.date + 'T00:00:00')
          const eventDateEnd = new Date(event.end.date + 'T00:00:00')
          const slotDate = new Date(dateStr + 'T00:00:00')

          if (slotDate >= eventDate && slotDate < eventDateEnd) {
            return true
          }
          return false
        } else {
          return false
        }

        if (event.end.dateTime) {
          eventEnd = new Date(event.end.dateTime)
        } else if (event.end.date) {
          eventEnd = new Date(event.end.date + 'T23:59:59')
        } else {
          return false
        }

        const hasOverlap =
          (slotStartDate >= eventStart && slotStartDate < eventEnd) ||
          (slotEndDate > eventStart && slotEndDate <= eventEnd) ||
          (slotStartDate <= eventStart && slotEndDate >= eventEnd)

        return hasOverlap
      })

      const isAvailable = !conflictingEvent
      availability[slot] = isAvailable
    })

    return NextResponse.json({
      date,
      availability,
      slots: AVAILABLE_SLOTS.map((slot) => {
        const displayTime = formatTimeForDisplay(slot)
        return {
          time: displayTime,
          time24: slot,
          available: availability[slot],
          displayTime: displayTime,
        }
      }),
    })
  } catch (error: any) {
    console.error('Error checking availability:', error)
    
    // Provide specific guidance for common errors
    let errorMessage = error.message || 'Failed to check availability'
    let details = error.details || 'Unknown error occurred'
    
    if (error.message?.includes('DECODER') || error.message?.includes('unsupported') || 
        error.code === 'ERR_OSSL_UNSUPPORTED' || error.message?.includes('Invalid private key format')) {
      errorMessage = 'Invalid private key format'
      details = 'The private key format is invalid. Please ensure your GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY environment variable contains the full private key with proper line breaks.'
    }
    
    return NextResponse.json(
      {
        error: errorMessage,
        details: details,
        date,
        availability: {},
        slots: AVAILABLE_SLOTS.map((slot) => {
          const displayTime = formatTimeForDisplay(slot)
          return {
            time: displayTime,
            time24: slot,
            available: true, // Default to available on error
            displayTime: displayTime,
          }
        }),
      },
      { status: 500 }
    )
  }
}
