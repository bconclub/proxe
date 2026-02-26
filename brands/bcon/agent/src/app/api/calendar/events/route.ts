import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'bconclubx@gmail.com'
const TIMEZONE = process.env.GOOGLE_CALENDAR_TIMEZONE || 'Asia/Kolkata'

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
    scopes: ['https://www.googleapis.com/auth/calendar'],
  })

  return auth
}

// GET - List events
export async function GET(request: NextRequest) {
  try {
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

    const searchParams = request.nextUrl.searchParams
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const maxResults = parseInt(searchParams.get('maxResults') || '250')

    const auth = await getAuthClient()
    const calendar = google.calendar({ version: 'v3', auth })

    const timeMin = startDate
      ? new Date(startDate).toISOString()
      : new Date().toISOString()
    const timeMax = endDate
      ? new Date(endDate).toISOString()
      : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString() // 90 days from now

    const response = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin,
      timeMax,
      timeZone: TIMEZONE,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults,
    })

    const events = (response.data.items || []).map((event) => ({
      id: event.id,
      summary: event.summary,
      description: event.description,
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
      attendees: event.attendees?.map((a) => ({
        email: a.email,
        displayName: a.displayName,
      })),
      htmlLink: event.htmlLink,
      status: event.status,
    }))

    return NextResponse.json({
      events,
      total: events.length,
    })
  } catch (error: any) {
    console.error('Error fetching calendar events:', error)
    return NextResponse.json(
      {
        error: error.message || 'Failed to fetch calendar events',
        details: error.details || 'Unknown error occurred',
      },
      { status: 500 }
    )
  }
}

// POST - Create event
export async function POST(request: NextRequest) {
  try {
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

    const body = await request.json()
    const { date, time, name, email, phone, description } = body

    if (!date || !time || !name) {
      return NextResponse.json(
        { error: 'Missing required fields: date, time, name' },
        { status: 400 }
      )
    }

    const auth = await getAuthClient()
    const calendar = google.calendar({ version: 'v3', auth })

    // Parse time
    let hour: number, minute: number

    if (time.includes('AM') || time.includes('PM')) {
      const [timePart, period] = time.split(' ')
      const [h, m] = timePart.split(':').map(Number)
      hour = period === 'PM' && h !== 12 ? h + 12 : period === 'AM' && h === 12 ? 0 : h
      minute = m || 0
    } else {
      [hour, minute = 0] = time.split(':').map(Number)
    }

    // Create event start/end times
    const eventStart = `${date}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00+05:30`
    const endHour = hour + 1
    const eventEnd = `${date}T${endHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00+05:30`

    const eventTitle = `BCON Strategy Call - ${name}`

    const eventData = {
      summary: eventTitle,
      description:
        description ||
        `BCON Strategy Call Booking\n\nName: ${name}\nEmail: ${email || 'N/A'}\nPhone: ${phone || 'N/A'}`,
      start: {
        dateTime: eventStart,
        timeZone: TIMEZONE,
      },
      end: {
        dateTime: eventEnd,
        timeZone: TIMEZONE,
      },
      attendees: email ? [{ email, displayName: name }] : [],
    }

    const createdEvent = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: eventData,
    })

    return NextResponse.json({
      success: true,
      event: {
        id: createdEvent.data.id,
        summary: createdEvent.data.summary,
        start: createdEvent.data.start?.dateTime,
        end: createdEvent.data.end?.dateTime,
        htmlLink: createdEvent.data.htmlLink,
      },
    })
  } catch (error: any) {
    console.error('Error creating calendar event:', error)
    return NextResponse.json(
      {
        error: error.message || 'Failed to create calendar event',
        details: error.details || 'Unknown error occurred',
      },
      { status: 500 }
    )
  }
}

// PUT - Update event
export async function PUT(request: NextRequest) {
  try {
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

    const body = await request.json()
    const { eventId, date, time, name, email, phone, description } = body

    if (!eventId) {
      return NextResponse.json({ error: 'Missing required field: eventId' }, { status: 400 })
    }

    const auth = await getAuthClient()
    const calendar = google.calendar({ version: 'v3', auth })

    // Get existing event first
    const existingEvent = await calendar.events.get({
      calendarId: CALENDAR_ID,
      eventId,
    })

    if (!existingEvent.data) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Parse time if provided
    let eventStart = existingEvent.data.start?.dateTime
    let eventEnd = existingEvent.data.end?.dateTime

    if (date && time) {
      let hour: number, minute: number

      if (time.includes('AM') || time.includes('PM')) {
        const [timePart, period] = time.split(' ')
        const [h, m] = timePart.split(':').map(Number)
        hour = period === 'PM' && h !== 12 ? h + 12 : period === 'AM' && h === 12 ? 0 : h
        minute = m || 0
      } else {
        [hour, minute = 0] = time.split(':').map(Number)
      }

      eventStart = `${date}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00+05:30`
      const endHour = hour + 1
      eventEnd = `${date}T${endHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00+05:30`
    }

    const eventData = {
      summary: name ? `BCON Strategy Call - ${name}` : existingEvent.data.summary,
      description:
        description ||
        existingEvent.data.description ||
        `BCON Strategy Call Booking\n\nName: ${name || 'N/A'}\nEmail: ${email || 'N/A'}\nPhone: ${phone || 'N/A'}`,
      start: {
        dateTime: eventStart,
        timeZone: TIMEZONE,
      },
      end: {
        dateTime: eventEnd,
        timeZone: TIMEZONE,
      },
      attendees: email ? [{ email, displayName: name || 'Guest' }] : existingEvent.data.attendees || [],
    }

    const updatedEvent = await calendar.events.update({
      calendarId: CALENDAR_ID,
      eventId,
      requestBody: eventData,
    })

    return NextResponse.json({
      success: true,
      event: {
        id: updatedEvent.data.id,
        summary: updatedEvent.data.summary,
        start: updatedEvent.data.start?.dateTime,
        end: updatedEvent.data.end?.dateTime,
        htmlLink: updatedEvent.data.htmlLink,
      },
    })
  } catch (error: any) {
    console.error('Error updating calendar event:', error)
    return NextResponse.json(
      {
        error: error.message || 'Failed to update calendar event',
        details: error.details || 'Unknown error occurred',
      },
      { status: 500 }
    )
  }
}

// DELETE - Delete event
export async function DELETE(request: NextRequest) {
  try {
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

    const searchParams = request.nextUrl.searchParams
    const eventId = searchParams.get('eventId')

    if (!eventId) {
      return NextResponse.json({ error: 'Missing required parameter: eventId' }, { status: 400 })
    }

    const auth = await getAuthClient()
    const calendar = google.calendar({ version: 'v3', auth })

    await calendar.events.delete({
      calendarId: CALENDAR_ID,
      eventId,
    })

    return NextResponse.json({
      success: true,
      message: 'Event deleted successfully',
    })
  } catch (error: any) {
    console.error('Error deleting calendar event:', error)
    return NextResponse.json(
      {
        error: error.message || 'Failed to delete calendar event',
        details: error.details || 'Unknown error occurred',
      },
      { status: 500 }
    )
  }
}
