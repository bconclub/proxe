import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'bconclubx@gmail.com';
const TIMEZONE = process.env.GOOGLE_CALENDAR_TIMEZONE || 'Asia/Kolkata';

// Available time slots (in UTC+5:30 / Asia/Kolkata)
const AVAILABLE_SLOTS = [
  '11:00', // 11:00 AM
  '13:00', // 1:00 PM
  '15:00', // 3:00 PM
  '16:00', // 4:00 PM
  '17:00', // 5:00 PM
  '18:00', // 6:00 PM
];

async function getAuthClient() {
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!serviceAccountEmail || !privateKey) {
    throw new Error('Google Calendar credentials not configured');
  }

  // Clean up the private key: handle escaped newlines, CRLF, and ensure proper formatting
  privateKey = privateKey
    .replace(/\\n/g, '\n')  // Replace escaped newlines
    .replace(/\r\n/g, '\n') // Replace CRLF with LF
    .replace(/\r/g, '\n')   // Replace any remaining CR with LF
    .trim();                // Remove leading/trailing whitespace

  // Ensure the key starts and ends with proper markers
  if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
    throw new Error('Invalid private key format: missing BEGIN marker');
  }
  if (!privateKey.includes('-----END PRIVATE KEY-----')) {
    throw new Error('Invalid private key format: missing END marker');
  }

  const auth = new google.auth.JWT({
    email: serviceAccountEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  });

  return auth;
}

export async function POST(request: NextRequest) {
  try {
    const { date } = await request.json();

    if (!date) {
      return NextResponse.json({ error: 'Date is required' }, { status: 400 });
    }

    // Check if credentials are configured
    const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    
    if (!serviceAccountEmail || !privateKey) {
      // Return all slots as available when credentials are not configured (for development)
      return NextResponse.json({
        date,
        availability: {},
        slots: AVAILABLE_SLOTS.map((slot) => {
          const displayTime = formatTimeForDisplay(slot);
          return {
            time: displayTime,
            time24: slot,
            available: true, // Default to available when credentials missing
            displayTime: displayTime,
          };
        }),
        warning: 'Google Calendar credentials not configured. Showing all slots as available.',
      });
    }

    let auth;
    try {
      auth = await getAuthClient();
    } catch (authError: any) {
      let errorMessage = 'Failed to authenticate with Google Calendar';
      let details = authError.message || 'Check your service account credentials';
      
      // Provide specific guidance for OpenSSL decoder errors
      if (authError.message?.includes('DECODER') || authError.message?.includes('unsupported') || 
          authError.code === 'ERR_OSSL_UNSUPPORTED' || authError.message?.includes('1E08010C')) {
        errorMessage = 'Invalid private key format';
        details = 'The private key format is invalid. Please ensure your GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY environment variable contains the full private key with proper line breaks. The key should start with "-----BEGIN PRIVATE KEY-----" and end with "-----END PRIVATE KEY-----".';
      } else if (authError.message?.includes('Invalid private key format')) {
        errorMessage = 'Invalid private key format';
        details = authError.message;
      }
      
      return NextResponse.json(
        { 
          error: errorMessage,
          details: details,
          suggestion: 'Please verify your GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY environment variable is correctly formatted.'
        },
        { status: 503 }
      );
    }

    const calendar = google.calendar({ version: 'v3', auth });

    // Parse date - use the date string directly to avoid timezone conversion issues
    // date should be in format "YYYY-MM-DD"
    const dateStr = date.split('T')[0]; // Extract YYYY-MM-DD if time is included
    
    // Create date range for the selected day (00:00 to 23:59 in Asia/Kolkata)
    // Format: YYYY-MM-DDTHH:mm:ss+05:30 (Asia/Kolkata offset)
    const startOfDay = `${dateStr}T00:00:00+05:30`;
    const endOfDay = `${dateStr}T23:59:59+05:30`;

    // Get all events for this day
    let response;
    try {
      // Convert Asia/Kolkata times to UTC for the API query
      // Google Calendar API expects times in RFC3339 format
      const startOfDayUTC = new Date(`${dateStr}T00:00:00+05:30`).toISOString();
      const endOfDayUTC = new Date(`${dateStr}T23:59:59+05:30`).toISOString();
      
      response = await calendar.events.list({
        calendarId: CALENDAR_ID,
        timeMin: startOfDayUTC,
        timeMax: endOfDayUTC,
        timeZone: TIMEZONE,
        singleEvents: true,
        orderBy: 'startTime',
      });
    } catch (calendarError: any) {
      let errorMessage = 'Failed to fetch calendar events';
      let details = calendarError.message || 'Unknown error';
      let suggestion = '';
      
      // Handle specific Google Calendar API errors
      if (calendarError.code === 404 || details.includes('Not Found')) {
        errorMessage = 'Calendar not found or access denied';
        details = `The calendar "${CALENDAR_ID}" was not found or the service account doesn't have access.`;
        suggestion = `Please share the calendar "${CALENDAR_ID}" with the service account email "${serviceAccountEmail}" and give it "Make changes to events" permission.`;
      } else if (calendarError.code === 403 || details.includes('Forbidden')) {
        errorMessage = 'Access denied to calendar';
        details = `The service account "${serviceAccountEmail}" doesn't have permission to access the calendar "${CALENDAR_ID}".`;
        suggestion = `Share the calendar "${CALENDAR_ID}" with "${serviceAccountEmail}" and give it "Make changes to events" permission.`;
      }
      
      return NextResponse.json(
        { 
          error: errorMessage,
          details: details,
          suggestion: suggestion,
          calendarId: CALENDAR_ID,
          serviceAccountEmail: serviceAccountEmail
        },
        { status: 503 }
      );
    }

    const events = response.data.items || [];

    // Check availability for each slot
    const availability: Record<string, boolean> = {};

    AVAILABLE_SLOTS.forEach((slot) => {
      const [hour, minute] = slot.split(':').map(Number);
      // Create slot time in Asia/Kolkata format: YYYY-MM-DDTHH:mm:ss+05:30
      const slotStart = `${dateStr}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00+05:30`;
      const slotEndHour = hour + 1;
      const slotEnd = `${dateStr}T${slotEndHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00+05:30`;
      
      const slotStartDate = new Date(slotStart);
      const slotEndDate = new Date(slotEnd);

      // Check if this slot conflicts with any existing event
      const conflictingEvent = events.find((event: any) => {
        if (!event.start || !event.end) return false;

        // Parse event times - handle both dateTime (with time) and date (all-day)
        let eventStart: Date;
        let eventEnd: Date;
        
        if (event.start.dateTime) {
          eventStart = new Date(event.start.dateTime);
        } else if (event.start.date) {
          // All-day event - check if it overlaps with our slot
          const eventDate = new Date(event.start.date + 'T00:00:00');
          const eventDateEnd = new Date(event.end.date + 'T00:00:00');
          const slotDate = new Date(dateStr + 'T00:00:00');
          
          // If event spans our date, consider it blocking
          if (slotDate >= eventDate && slotDate < eventDateEnd) {
            return true;
          }
          return false;
        } else {
          return false;
        }
        
        if (event.end.dateTime) {
          eventEnd = new Date(event.end.dateTime);
        } else if (event.end.date) {
          eventEnd = new Date(event.end.date + 'T23:59:59');
        } else {
          return false;
        }

        // Check for overlap between slot and event
        const hasOverlap = (
          (slotStartDate >= eventStart && slotStartDate < eventEnd) ||
          (slotEndDate > eventStart && slotEndDate <= eventEnd) ||
          (slotStartDate <= eventStart && slotEndDate >= eventEnd)
        );
        
        return hasOverlap;
      });

      const isAvailable = !conflictingEvent;
      availability[slot] = isAvailable;
    });

    return NextResponse.json({
      date,
      availability,
      slots: AVAILABLE_SLOTS.map((slot) => {
        const [hour, minute] = slot.split(':').map(Number);
        const displayTime = formatTimeForDisplay(slot);
        return {
          time: displayTime, // Return display format for frontend
          time24: slot, // Keep 24-hour format for reference
          available: availability[slot],
          displayTime: displayTime,
        };
      }),
    });
  } catch (error: any) {
    return NextResponse.json(
      { 
        error: error.message || 'Failed to check availability',
        details: error.details || 'Unknown error occurred',
        type: error.name || 'Error'
      },
      { status: 500 }
    );
  }
}

function formatTimeForDisplay(time24: string): string {
  const [hour, minute] = time24.split(':').map(Number);
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${hour12}:${minute.toString().padStart(2, '0')} ${period}`;
}

