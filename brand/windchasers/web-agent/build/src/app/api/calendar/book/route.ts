import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { checkExistingBooking, storeBooking } from '@/lib/chatSessions';
import { createClient } from '@supabase/supabase-js';

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'bconclubx@gmail.com';
const TIMEZONE = process.env.GOOGLE_CALENDAR_TIMEZONE || 'Asia/Kolkata';

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
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  return auth;
}

export async function POST(request: NextRequest) {
  try {
    const { date, time, name, email, phone, brand = 'windchasers', sessionId, courseDetails, courseInterest, sessionType } = await request.json();

    if (!date || !time || !name || !email || !phone) {
      return NextResponse.json(
        { error: 'Missing required fields: date, time, name, email, phone' },
        { status: 400 }
      );
    }

    // Helper function to get Supabase client
    const getSupabaseClient = () => {
      const supabaseUrl = process.env.WINDCHASERS_SUPABASE_URL || process.env.NEXT_PUBLIC_WINDCHASERS_SUPABASE_URL;
      const supabaseKey = process.env.WINDCHASERS_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_WINDCHASERS_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseKey) return null;
      return createClient(supabaseUrl, supabaseKey);
    };

    // Find sessionId if not provided (by email or phone)
    let externalSessionId = sessionId;
    let sessionData: any = null;

    if (!externalSessionId) {
      try {
        const supabase = getSupabaseClient();
        if (supabase) {
          // Try to find session by email first, then phone
          const { data: sessionByEmail } = await supabase
            .from('web_sessions')
            .select('external_session_id')
            .eq('customer_email', email)
            .eq('brand', brand.toLowerCase())
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (sessionByEmail?.external_session_id) {
            externalSessionId = sessionByEmail.external_session_id;
          } else {
            // Try by phone
            const { data: sessionByPhone } = await supabase
              .from('web_sessions')
              .select('external_session_id')
              .eq('customer_phone', phone)
              .eq('brand', brand.toLowerCase())
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (sessionByPhone?.external_session_id) {
              externalSessionId = sessionByPhone.external_session_id;
            }
          }
        }
      } catch (sessionLookupError) {
        // Log but don't fail - we'll still create the calendar event
        console.warn('[Booking API] Could not find sessionId:', sessionLookupError);
      }
    }

    // Fetch session data to get course details and conversation summary
    if (externalSessionId) {
      try {
        const supabase = getSupabaseClient();
        if (supabase) {
          const { data: session } = await supabase
            .from('web_sessions')
            .select('conversation_summary, user_inputs_summary, customer_name, customer_phone, customer_email, lead_id')
            .eq('external_session_id', externalSessionId)
            .eq('brand', brand.toLowerCase())
            .maybeSingle();

          if (session) {
            sessionData = session;

            // Try to get course interest from all_leads unified_context if lead_id exists
            if (session.lead_id) {
              try {
                const { data: leadData } = await supabase
                  .from('all_leads')
                  .select('unified_context')
                  .eq('id', session.lead_id)
                  .maybeSingle();

                if (leadData?.unified_context?.windchasers?.course_interest) {
                  sessionData.course_interest = leadData.unified_context.windchasers.course_interest;
                }
              } catch (leadError) {
                console.warn('[Booking API] Could not fetch lead data:', leadError);
              }
            }
          }
        }
      } catch (sessionFetchError) {
        console.warn('[Booking API] Could not fetch session data:', sessionFetchError);
      }
    }

    // Extract course information from session data or provided parameters
    let courseInfo = courseDetails || courseInterest || '';
    let conversationSummary = '';
    let detectedSessionType = sessionType || '';

    if (sessionData) {
      // Get course interest from session data (from all_leads unified_context)
      if (sessionData.course_interest && !courseInfo) {
        courseInfo = sessionData.course_interest;
      }

      // Also try to extract from user_inputs_summary as fallback
      if (!courseInfo && sessionData.user_inputs_summary && Array.isArray(sessionData.user_inputs_summary)) {
        // Look for course-related inputs in the conversation
        const courseKeywords = ['pilot', 'helicopter', 'drone', 'cabin'];
        for (const input of sessionData.user_inputs_summary) {
          const inputText = (input.input || '').toLowerCase();
          for (const keyword of courseKeywords) {
            if (inputText.includes(keyword)) {
              courseInfo = keyword;
              break;
            }
          }
          if (courseInfo) break;
        }
      }

      // Get conversation summary
      if (sessionData.conversation_summary) {
        conversationSummary = sessionData.conversation_summary;
      }

      // Detect session type from conversation summary or user inputs if not provided
      if (!detectedSessionType) {
        const summaryText = (conversationSummary || '').toLowerCase();
        const allText = summaryText + ' ' + (sessionData.user_inputs_summary || [])
          .map((input: any) => (input.input || '').toLowerCase())
          .join(' ');

        // Keywords for offline/facility visit
        const offlineKeywords = ['offline', 'facility', 'visit', 'in-person', 'in person', 'campus', 'center', 'office', 'location', 'come to', 'visit us', 'physical'];
        // Keywords for online
        const onlineKeywords = ['online', 'zoom', 'video', 'virtual', 'call', 'meeting', 'remote', 'skype', 'google meet', 'teams'];

        const hasOfflineKeywords = offlineKeywords.some(keyword => allText.includes(keyword));
        const hasOnlineKeywords = onlineKeywords.some(keyword => allText.includes(keyword));

        if (hasOfflineKeywords && !hasOnlineKeywords) {
          detectedSessionType = 'offline';
        } else if (hasOnlineKeywords && !hasOfflineKeywords) {
          detectedSessionType = 'online';
        } else if (hasOfflineKeywords && hasOnlineKeywords) {
          // If both are mentioned, prioritize offline if facility/visit is mentioned
          if (allText.includes('facility') || allText.includes('visit') || allText.includes('campus')) {
            detectedSessionType = 'offline';
          } else {
            detectedSessionType = 'online';
          }
        }
      }
    }

    // Map course interest codes to readable names
    const courseNameMap: Record<string, string> = {
      'pilot': 'Pilot Training',
      'helicopter': 'Helicopter Training',
      'drone': 'Drone Training',
      'cabin': 'Cabin Crew Training',
    };

    const courseDisplayName = courseInfo && courseNameMap[courseInfo.toLowerCase()]
      ? courseNameMap[courseInfo.toLowerCase()]
      : courseInfo || 'Aviation Course Inquiry';

    // Check for existing booking by phone or email
    let existingBooking = null;
    try {
      existingBooking = await checkExistingBooking(phone, email, brand as 'windchasers');
    } catch (bookingCheckError) {
      // Log error but don't crash - allow booking to proceed
      console.error('[Booking API] Error checking existing booking:', bookingCheckError);
    }

    if (existingBooking?.exists && existingBooking.bookingDate && existingBooking.bookingTime) {
      const formattedDate = formatDate(existingBooking.bookingDate);
      const formattedTime = formatTimeForDisplay(existingBooking.bookingTime);

      return NextResponse.json({
        success: false,
        alreadyBooked: true,
        message: `You already have a booking scheduled for ${formattedDate} at ${formattedTime}.`,
        bookingDate: existingBooking.bookingDate,
        bookingTime: existingBooking.bookingTime,
        bookingStatus: existingBooking.bookingStatus,
      }, { status: 200 });
    }

    // Check if credentials are configured
    const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

    if (!serviceAccountEmail || !privateKey) {
      return NextResponse.json(
        {
          error: 'Google Calendar credentials not configured. Please set up GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY environment variables.',
          details: 'See GOOGLE_CALENDAR_SETUP.md for setup instructions.'
        },
        { status: 503 } // Service Unavailable
      );
    }

    const auth = await getAuthClient();
    const calendar = google.calendar({ version: 'v3', auth });

    // Parse date - use the date string directly to avoid timezone conversion issues
    // date should be in format "YYYY-MM-DD"
    const dateStr = date.split('T')[0]; // Extract YYYY-MM-DD if time is included

    // Parse time (format: "HH:MM" or "HH:MM AM/PM")
    let hour: number, minute: number;

    if (time.includes('AM') || time.includes('PM')) {
      // Format: "11:00 AM"
      const [timePart, period] = time.split(' ');
      const [h, m] = timePart.split(':').map(Number);
      hour = period === 'PM' && h !== 12 ? h + 12 : period === 'AM' && h === 12 ? 0 : h;
      minute = m;
    } else {
      // Format: "11:00" (24-hour)
      [hour, minute] = time.split(':').map(Number);
    }

    // Create event start/end times in Asia/Kolkata timezone format
    const eventStart = `${dateStr}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00+05:30`;
    const endHour = hour + 1;
    const eventEnd = `${dateStr}T${endHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00+05:30`;

    // Format display time
    const displayTime = formatTimeForDisplay(`${hour}:${minute.toString().padStart(2, '0')}`);

    // Event title: Candidate Name - Course Details [Session Type]
    let eventTitle = `${name} - ${courseDisplayName}`;
    if (detectedSessionType) {
      const sessionTypeLabel = detectedSessionType === 'offline' ? 'Facility Visit' : 'Online';
      eventTitle += ` [${sessionTypeLabel}]`;
    }

    // Build rich description with course details and conversation summary
    let description = `Windchasers Aviation Academy - Consultation Booking\n`;
    description += `BOOKING STATUS: CONFIRMED\n`;
    description += `BOOKING CONFIRMED IN SYSTEM: YES\n\n`;

    description += `Candidate Information:\n`;
    description += `Name: ${name}\n`;
    description += `Email: ${email}\n`;
    description += `Phone: ${phone}\n\n`;

    if (courseDisplayName && courseDisplayName !== 'Aviation Course Inquiry') {
      description += `Course Interest: ${courseDisplayName}\n\n`;
    }

    // Add session type (offline/facility visit vs online)
    if (detectedSessionType) {
      const sessionTypeDisplay = detectedSessionType === 'offline'
        ? 'Offline / Facility Visit'
        : detectedSessionType === 'online'
          ? 'Online Session'
          : detectedSessionType;
      description += `Session Type: ${sessionTypeDisplay}\n\n`;
    }

    if (conversationSummary) {
      // Clean the summary if it contains "no booking made yet" to avoid confusion
      const cleanedSummary = conversationSummary
        .replace(/no booking made yet/gi, 'booking is being finalized')
        .replace(/next step is booking/gi, 'booking confirmed');

      description += `Conversation Summary:\n${cleanedSummary}\n\n`;
    }

    description += `Booking Details:\n`;
    description += `Date: ${formatDate(date)}\n`;
    description += `Time: ${displayTime}\n\n`;

    // Add location based on session type
    if (detectedSessionType === 'offline') {
      description += `Location: Windchasers Aviation Academy Facility\n`;
      description += `(Please confirm exact address with candidate)\n\n`;
    } else if (detectedSessionType === 'online') {
      description += `Location: Online Session (Video Call)\n`;
      description += `(Meeting link will be shared separately)\n\n`;
    }

    description += `Contact: ${email}`;

    // Create event
    // Note: Service accounts cannot invite attendees without Domain-Wide Delegation
    // However, we'll try to add them and handle the error gracefully
    const event: any = {
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
      attendees: [
        { email: email, displayName: name },
      ],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 }, // 1 day before
          { method: 'popup', minutes: 30 }, // 30 minutes before
        ],
      },
    };

    // Add location based on session type
    if (detectedSessionType === 'offline') {
      event.location = 'Windchasers Aviation Academy Facility';
    } else if (detectedSessionType === 'online') {
      event.location = 'Online Session (Video Call)';
    }

    let createdEvent;
    let hasAttendees = false;

    try {
      createdEvent = await calendar.events.insert({
        calendarId: CALENDAR_ID,
        requestBody: event,
      });

      hasAttendees = true;
    } catch (calendarError: any) {

      let errorMessage = 'Failed to create calendar event';
      let details = calendarError.message || 'Unknown error';
      let suggestion = '';

      // Handle specific Google Calendar API errors
      if (calendarError.code === 404 || details.includes('Not Found')) {
        errorMessage = 'Calendar not found or access denied';
        details = `The calendar "${CALENDAR_ID}" was not found or the service account doesn't have access.`;
        suggestion = `Please share the calendar "${CALENDAR_ID}" with the service account email "${serviceAccountEmail}" and give it "Make changes to events" permission.`;
      } else if (calendarError.code === 403 || details.includes('Forbidden')) {
        if (details.includes('Domain-Wide Delegation') || details.includes('attendees')) {
          // Try creating event without attendees as fallback
          try {
            const { attendees, ...eventWithoutAttendees } = event;

            createdEvent = await calendar.events.insert({
              calendarId: CALENDAR_ID,
              requestBody: eventWithoutAttendees,
            });

            hasAttendees = false;

            // Continue to return success response below
          } catch (fallbackError: any) {
            return NextResponse.json(
              {
                error: 'Failed to create calendar event',
                details: fallbackError.message || 'Could not create event with or without attendees',
                suggestion: 'Check calendar permissions and service account configuration.',
                calendarId: CALENDAR_ID,
                serviceAccountEmail: serviceAccountEmail
              },
              { status: 503 }
            );
          }
        } else {
          errorMessage = 'Access denied to calendar';
          details = `The service account "${serviceAccountEmail}" doesn't have permission to create events in the calendar "${CALENDAR_ID}".`;
          suggestion = `Share the calendar "${CALENDAR_ID}" with "${serviceAccountEmail}" and give it "Make changes to events" permission.`;

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
      } else {
        // Other errors - return error response
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
    }

    // Return success response
    if (!createdEvent) {
      return NextResponse.json(
        {
          error: 'Failed to create calendar event',
          details: 'Event creation failed unexpectedly',
          suggestion: 'Please try again or contact support.'
        },
        { status: 500 }
      );
    }

    // Save booking to database
    if (externalSessionId) {
      try {
        await storeBooking(
          externalSessionId,
          {
            date: dateStr, // Use the parsed dateStr (YYYY-MM-DD format)
            time: time, // Original time format (e.g., "11:00 AM")
            googleEventId: createdEvent.data.id || undefined,
            status: 'confirmed',
            name: name,
            email: email,
            phone: phone,
            courseInterest: courseInfo || undefined,
            sessionType: detectedSessionType || undefined,
            description: description,
            conversationSummary: conversationSummary || undefined,
          },
          brand as 'windchasers'
        );
        console.log('[Booking API] Successfully saved booking to database', { externalSessionId, eventId: createdEvent.data.id });
      } catch (storeError) {
        // Log error but don't fail the request - calendar event was created successfully
        console.error('[Booking API] Failed to save booking to database:', storeError);
      }
    } else {
      console.warn('[Booking API] No sessionId found, booking not saved to database. Calendar event created successfully.');
    }

    return NextResponse.json({
      success: true,
      eventId: createdEvent.data.id,
      eventLink: createdEvent.data.htmlLink,
      message: `Booking confirmed for ${formatDate(date)} at ${displayTime}`,
      ...(hasAttendees ? {} : { warning: 'Attendee email added to description. Domain-Wide Delegation required to add attendees automatically.' })
    });
  } catch (error: any) {
    let errorMessage = error.message || 'Failed to create booking';
    let details = error.details || 'Unknown error occurred';

    // Provide specific guidance for OpenSSL decoder errors
    if (error.message?.includes('DECODER') || error.message?.includes('unsupported') ||
      error.code === 'ERR_OSSL_UNSUPPORTED' || error.message?.includes('1E08010C') ||
      error.message?.includes('Invalid private key format')) {
      errorMessage = 'Invalid private key format';
      details = 'The private key format is invalid. Please ensure your GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY environment variable contains the full private key with proper line breaks. The key should start with "-----BEGIN PRIVATE KEY-----" and end with "-----END PRIVATE KEY-----".';
    }

    return NextResponse.json(
      {
        error: errorMessage,
        details: details,
        type: error.name || 'Error',
        suggestion: errorMessage.includes('private key') ? 'Please verify your GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY environment variable is correctly formatted.' : undefined
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

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

