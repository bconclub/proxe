/**
 * POST /api/agent/calendar/book — Create a booking + Google Calendar event
 *
 * Phase 3 of the Unified Agent Architecture.
 * Moved from web-agent/api/calendar/book/route.ts.
 *
 * Request: { date, time, name, email, phone, sessionId?, courseInterest?, sessionType? }
 * Response: { success, eventId, eventLink, message }
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  checkExistingBooking,
  createCalendarEvent,
  storeBooking,
  getServiceClient,
  getClient,
  formatDate,
  formatTimeForDisplay,
} from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      date,
      time,
      name,
      email,
      phone,
      sessionId,
      courseInterest,
      sessionType,
      brand = 'windchasers',
    } = body;

    if (!date || !time || !name || !email || !phone) {
      return NextResponse.json(
        { error: 'Missing required fields: date, time, name, email, phone' },
        { status: 400 },
      );
    }

    const supabase = getServiceClient() || getClient();

    // Check for existing booking
    const existingBooking = await checkExistingBooking(phone, email, supabase);

    if (existingBooking?.exists && existingBooking.bookingDate && existingBooking.bookingTime) {
      return NextResponse.json({
        success: false,
        alreadyBooked: true,
        message: `You already have a booking scheduled for ${formatDate(existingBooking.bookingDate)} at ${formatTimeForDisplay(existingBooking.bookingTime)}.`,
        bookingDate: existingBooking.bookingDate,
        bookingTime: existingBooking.bookingTime,
        bookingStatus: existingBooking.bookingStatus,
      });
    }

    // Check credentials
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
      return NextResponse.json(
        { error: 'Google Calendar credentials not configured' },
        { status: 503 },
      );
    }

    // Create Google Calendar event
    const calendarResult = await createCalendarEvent({
      date,
      time,
      name,
      email,
      phone,
      courseInterest,
      sessionType,
    });

    if (!calendarResult) {
      return NextResponse.json(
        { error: 'Failed to create calendar event' },
        { status: 500 },
      );
    }

    // Save booking to database
    if (sessionId) {
      try {
        await storeBooking(
          sessionId,
          {
            date: date.split('T')[0],
            time,
            googleEventId: calendarResult.eventId,
            status: 'confirmed',
            name,
            email,
            phone,
            courseInterest,
            sessionType,
          },
          'web',
          supabase,
        );
      } catch (storeError) {
        console.error('[agent/calendar/book] Failed to save booking to DB:', storeError);
        // Don't fail — calendar event was created successfully
      }
    }

    const dateStr = date.split('T')[0];
    const displayTime = formatTimeForDisplay(
      time.includes('AM') || time.includes('PM')
        ? (() => {
            const [tp, period] = time.split(' ');
            const [h, m] = tp.split(':').map(Number);
            const hour = period === 'PM' && h !== 12 ? h + 12 : period === 'AM' && h === 12 ? 0 : h;
            return `${hour}:${m.toString().padStart(2, '0')}`;
          })()
        : time,
    );

    return NextResponse.json({
      success: true,
      eventId: calendarResult.eventId,
      eventLink: calendarResult.eventLink,
      message: `Booking confirmed for ${formatDate(dateStr)} at ${displayTime}`,
      ...(calendarResult.hasAttendees ? {} : {
        warning: 'Attendee email added to description. Domain-Wide Delegation required for auto-invites.',
      }),
    });
  } catch (error: any) {
    console.error('[agent/calendar/book] Error:', error);

    let errorMessage = error.message || 'Failed to create booking';
    if (error.message?.includes('DECODER') || error.message?.includes('unsupported') || error.message?.includes('Invalid private key')) {
      errorMessage = 'Invalid private key format. Check GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.';
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 },
    );
  }
}
