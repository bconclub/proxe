/**
 * services/bookingManager.ts — Booking storage + Google Calendar integration
 *
 * Extracted from:
 *   - web-agent/src/lib/chatSessions.ts: storeBooking() (1321-1492), checkExistingBooking() (1495-1669)
 *   - web-agent/src/app/api/calendar/book/route.ts: Google Calendar event creation
 *   - web-agent/src/app/api/calendar/availability/route.ts: slot availability
 *
 * Tables: web_sessions, all_leads
 * Env vars: GOOGLE_CALENDAR_ID, GOOGLE_CALENDAR_TIMEZONE,
 *           GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient, getClient } from './supabase';
import { getISTTimestamp, cleanSummary, formatTimeForDisplay, formatDate } from './utils';
import { getChannelTable, type Channel } from './sessionManager';
import { updateLeadProfile } from './leadManager';

// ─── Config ─────────────────────────────────────────────────────────────────

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'bconclubx@gmail.com';
const TIMEZONE = process.env.GOOGLE_CALENDAR_TIMEZONE || 'Asia/Kolkata';

// Available time slots (Asia/Kolkata)
const AVAILABLE_SLOTS = [
  '11:00', // 11:00 AM
  '13:00', // 1:00 PM
  '15:00', // 3:00 PM
  '16:00', // 4:00 PM
  '17:00', // 5:00 PM
  '18:00', // 6:00 PM
];

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BookingData {
  date: string;       // YYYY-MM-DD
  time: string;       // "11:00 AM" format
  googleEventId?: string;
  status?: 'pending' | 'confirmed' | 'Call Booked' | 'cancelled';
  name?: string;
  email?: string;
  phone?: string;
  courseInterest?: string;
  sessionType?: string;
  description?: string;
  conversationSummary?: string;
}

export interface ExistingBooking {
  exists: boolean;
  bookingDate?: string | null;
  bookingTime?: string | null;
  bookingStatus?: 'pending' | 'confirmed' | 'Call Booked' | 'cancelled' | null;
  bookingCreatedAt?: string | null;
}

export interface TimeSlot {
  time: string;        // Display: "11:00 AM"
  time24: string;      // "11:00"
  available: boolean;
  displayTime: string;
}

// ─── Google Calendar Auth ───────────────────────────────────────────────────

/**
 * Get Google Calendar auth client (JWT with service account)
 */
export async function getGoogleCalendarAuth(): Promise<any> {
  // Dynamic import — googleapis is only needed when calendar features are used
  const { google } = await import('googleapis');

  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!serviceAccountEmail || !privateKey) {
    throw new Error('Google Calendar credentials not configured');
  }

  privateKey = privateKey
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
    throw new Error('Invalid private key format: missing BEGIN marker');
  }
  if (!privateKey.includes('-----END PRIVATE KEY-----')) {
    throw new Error('Invalid private key format: missing END marker');
  }

  return new google.auth.JWT({
    email: serviceAccountEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
}

// ─── Booking Check ──────────────────────────────────────────────────────────

/**
 * Check if a customer already has a booking by phone or email
 */
export async function checkExistingBooking(
  phone?: string | null,
  email?: string | null,
  supabase?: SupabaseClient | null,
): Promise<ExistingBooking> {
  const client = supabase || getClient();
  if (!client || (!phone && !email)) return { exists: false };

  const tableName = getChannelTable('web');

  try {
    let data = null;

    // Try by phone first
    if (phone) {
      const { data: phoneData } = await client
        .from(tableName)
        .select('booking_date, booking_time, booking_status, booking_created_at')
        .eq('customer_phone', phone)
        .not('booking_date', 'is', null)
        .not('booking_time', 'is', null)
        .order('booking_created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (phoneData?.booking_date) data = phoneData;
    }

    // Fallback to email
    if (!data && email) {
      const { data: emailData } = await client
        .from(tableName)
        .select('booking_date, booking_time, booking_status, booking_created_at')
        .eq('customer_email', email)
        .not('booking_date', 'is', null)
        .not('booking_time', 'is', null)
        .order('booking_created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (emailData?.booking_date) data = emailData;
    }

    if (data?.booking_date) {
      return {
        exists: true,
        bookingDate: data.booking_date,
        bookingTime: data.booking_time,
        bookingStatus: data.booking_status,
        bookingCreatedAt: data.booking_created_at,
      };
    }

    return { exists: false };
  } catch (error) {
    console.error('[bookingManager] Error checking existing booking', error);
    return { exists: false };
  }
}

// ─── Booking Storage ────────────────────────────────────────────────────────

/**
 * Store a booking in the session and sync to all_leads
 */
export async function storeBooking(
  externalSessionId: string,
  booking: BookingData,
  channel: Channel = 'web',
  supabase?: SupabaseClient | null,
): Promise<void> {
  const client = supabase || getServiceClient() || getClient();
  if (!client) {
    console.error('[bookingManager] No Supabase client available');
    return;
  }

  const tableName = getChannelTable(channel);

  // Update session profile if contact info is provided
  let currentLeadId: string | null = null;
  if (booking.name || booking.email || booking.phone) {
    const profileUpdates: { userName?: string; email?: string; phone?: string } = {};
    if (booking.name) profileUpdates.userName = booking.name;
    if (booking.email) profileUpdates.email = booking.email;
    if (booking.phone) profileUpdates.phone = booking.phone;

    currentLeadId = await updateLeadProfile(externalSessionId, profileUpdates, channel, client);
  }

  // Fetch current session for merging
  const { data: currentSession } = await client
    .from(tableName)
    .select('metadata, conversation_summary, lead_id, user_inputs_summary')
    .eq('external_session_id', externalSessionId)
    .maybeSingle();

  // Build booking metadata
  const bookingMetadata: Record<string, any> = {
    googleEventId: booking.googleEventId ?? null,
    courseInterest: booking.courseInterest || null,
    sessionType: booking.sessionType || null,
    description: booking.description || null,
    conversationSummary: booking.conversationSummary || null,
    booking_confirmed_at: getISTTimestamp(),
  };

  const existingMetadata = currentSession?.metadata || {};
  const mergedMetadata = { ...existingMetadata, ...bookingMetadata };

  // Update summary with booking status
  let updatedSummary = booking.conversationSummary || currentSession?.conversation_summary || '';
  const bookingStatusMsg = `[Booking Status: Confirmed for ${booking.date} at ${booking.time}]`;

  if (updatedSummary && !updatedSummary.includes('[Booking Status:')) {
    updatedSummary = `${updatedSummary}\n\n${bookingStatusMsg}`;
  } else if (!updatedSummary) {
    updatedSummary = bookingStatusMsg;
  }

  // Update session
  const bookingUpdate: Record<string, any> = {
    booking_date: booking.date,
    booking_time: booking.time,
    google_event_id: booking.googleEventId ?? null,
    booking_status: booking.status ?? 'Call Booked',
    booking_created_at: getISTTimestamp(),
    metadata: mergedMetadata,
    conversation_summary: updatedSummary,
  };

  const { data, error } = await client
    .from(tableName)
    .update(bookingUpdate)
    .eq('external_session_id', externalSessionId)
    .select('lead_id, conversation_summary, user_inputs_summary, metadata');

  if (error) {
    console.error('[bookingManager] Failed to store booking', error);

    // Fallback to old sessions table
    if (error.code === '42P01' || error.code === '42703') {
      await client
        .from('sessions')
        .update({
          booking_date: booking.date,
          booking_time: booking.time,
          google_event_id: booking.googleEventId ?? null,
          booking_status: booking.status ?? 'Call Booked',
          booking_created_at: getISTTimestamp(),
        })
        .eq('external_session_id', externalSessionId);
    }
    return;
  }

  // Sync to all_leads
  if (data && data.length > 0) {
    const sessionData = data[0];
    const leadId = sessionData.lead_id || currentLeadId;

    if (leadId) {
      const unifiedContext = {
        [channel]: {
          conversation_summary: cleanSummary(sessionData.conversation_summary) || null,
          booking_status: booking.status ?? 'Call Booked',
          booking_date: booking.date,
          booking_time: booking.time,
          user_inputs: sessionData.user_inputs_summary || [],
          booking_details: {
            courseInterest: booking.courseInterest || null,
            sessionType: booking.sessionType || null,
            description: booking.description || null,
          },
        },
      };

      const { data: existingLead } = await client
        .from('all_leads')
        .select('unified_context, metadata')
        .eq('id', leadId)
        .maybeSingle();

      const existingCtx = existingLead?.unified_context || {};
      const existingLeadMeta = existingLead?.metadata || {};

      const mergedCtx = {
        ...existingCtx,
        [channel]: {
          ...(existingCtx[channel] || {}),
          ...unifiedContext[channel],
        },
      };

      await client
        .from('all_leads')
        .update({
          unified_context: mergedCtx,
          last_touchpoint: channel,
          last_interaction_at: getISTTimestamp(),
          metadata: { ...existingLeadMeta, ...mergedMetadata },
        })
        .eq('id', leadId);

      console.log('[bookingManager] Updated all_leads with booking info', { leadId });
    }
  }
}

// ─── Calendar Availability ──────────────────────────────────────────────────

/**
 * Check available calendar slots for a given date
 * Returns array of time slots with availability status
 */
export async function getAvailableSlots(date: string): Promise<TimeSlot[]> {
  const hasCredentials =
    !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    !!process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!hasCredentials) {
    // Return all slots as available when credentials are not configured
    return AVAILABLE_SLOTS.map(slot => ({
      time: formatTimeForDisplay(slot),
      time24: slot,
      available: true,
      displayTime: formatTimeForDisplay(slot),
    }));
  }

  try {
    const { google } = await import('googleapis');
    const auth = await getGoogleCalendarAuth();
    const calendar = google.calendar({ version: 'v3', auth });

    const dateStr = date.split('T')[0];
    const startOfDayUTC = new Date(`${dateStr}T00:00:00+05:30`).toISOString();
    const endOfDayUTC = new Date(`${dateStr}T23:59:59+05:30`).toISOString();

    const response = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: startOfDayUTC,
      timeMax: endOfDayUTC,
      timeZone: TIMEZONE,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];

    return AVAILABLE_SLOTS.map(slot => {
      const [hour, minute] = slot.split(':').map(Number);
      const slotStart = new Date(`${dateStr}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00+05:30`);
      const slotEnd = new Date(`${dateStr}T${(hour + 1).toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00+05:30`);

      const hasConflict = events.some((event: any) => {
        if (!event.start || !event.end) return false;

        if (event.start.dateTime) {
          const eventStart = new Date(event.start.dateTime);
          const eventEnd = new Date(event.end.dateTime || event.end.date + 'T23:59:59');
          return (
            (slotStart >= eventStart && slotStart < eventEnd) ||
            (slotEnd > eventStart && slotEnd <= eventEnd) ||
            (slotStart <= eventStart && slotEnd >= eventEnd)
          );
        } else if (event.start.date) {
          // All-day event
          const eventDate = new Date(event.start.date + 'T00:00:00');
          const eventDateEnd = new Date(event.end.date + 'T00:00:00');
          const slotDate = new Date(dateStr + 'T00:00:00');
          return slotDate >= eventDate && slotDate < eventDateEnd;
        }
        return false;
      });

      return {
        time: formatTimeForDisplay(slot),
        time24: slot,
        available: !hasConflict,
        displayTime: formatTimeForDisplay(slot),
      };
    });
  } catch (error) {
    console.error('[bookingManager] Failed to check availability', error);
    // Fallback: return all slots as available
    return AVAILABLE_SLOTS.map(slot => ({
      time: formatTimeForDisplay(slot),
      time24: slot,
      available: true,
      displayTime: formatTimeForDisplay(slot),
    }));
  }
}

// ─── Calendar Event Creation ────────────────────────────────────────────────

/**
 * Create a Google Calendar event for a booking
 * Returns event ID and link, or null on failure
 */
export async function createCalendarEvent(booking: {
  date: string;
  time: string;
  name: string;
  email: string;
  phone: string;
  courseInterest?: string;
  sessionType?: string;
  conversationSummary?: string;
}): Promise<{ eventId: string; eventLink: string; hasAttendees: boolean } | null> {
  try {
    const { google } = await import('googleapis');
    const auth = await getGoogleCalendarAuth();
    const calendar = google.calendar({ version: 'v3', auth });

    const dateStr = booking.date.split('T')[0];

    // Parse time
    let hour: number, minute: number;
    if (booking.time.includes('AM') || booking.time.includes('PM')) {
      const [timePart, period] = booking.time.split(' ');
      const [h, m] = timePart.split(':').map(Number);
      hour = period === 'PM' && h !== 12 ? h + 12 : period === 'AM' && h === 12 ? 0 : h;
      minute = m;
    } else {
      [hour, minute] = booking.time.split(':').map(Number);
    }

    const eventStart = `${dateStr}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00+05:30`;
    const eventEnd = `${dateStr}T${(hour + 1).toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00+05:30`;

    // Course display name
    const courseNameMap: Record<string, string> = {
      pilot: 'Pilot Training',
      helicopter: 'Helicopter Training',
      drone: 'Drone Training',
      cabin: 'Cabin Crew Training',
    };
    const courseDisplayName =
      booking.courseInterest && courseNameMap[booking.courseInterest.toLowerCase()]
        ? courseNameMap[booking.courseInterest.toLowerCase()]
        : booking.courseInterest || 'Aviation Course Inquiry';

    // Event title
    let eventTitle = `${booking.name} - ${courseDisplayName}`;
    if (booking.sessionType) {
      const label = booking.sessionType === 'offline' ? 'Facility Visit' : 'Online';
      eventTitle += ` [${label}]`;
    }

    // Description
    let description = `BCON Club - Consultation Booking\n`;
    description += `BOOKING STATUS: CONFIRMED\n\n`;
    description += `Candidate Information:\nName: ${booking.name}\nEmail: ${booking.email}\nPhone: ${booking.phone}\n\n`;
    if (courseDisplayName !== 'Aviation Course Inquiry') {
      description += `Course Interest: ${courseDisplayName}\n\n`;
    }
    if (booking.sessionType) {
      const display = booking.sessionType === 'offline' ? 'Offline / Facility Visit' : 'Online Session';
      description += `Session Type: ${display}\n\n`;
    }
    if (booking.conversationSummary) {
      description += `Conversation Summary:\n${booking.conversationSummary}\n\n`;
    }
    description += `Booking Details:\nDate: ${formatDate(booking.date)}\nTime: ${formatTimeForDisplay(`${hour}:${minute.toString().padStart(2, '0')}`)}\n\n`;
    description += `Contact: ${booking.email}`;

    const event: any = {
      summary: eventTitle,
      description,
      start: { dateTime: eventStart, timeZone: TIMEZONE },
      end: { dateTime: eventEnd, timeZone: TIMEZONE },
      attendees: [{ email: booking.email, displayName: booking.name }],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 30 },
        ],
      },
    };

    if (booking.sessionType === 'offline') {
      event.location = 'BCON Club Facility';
    } else if (booking.sessionType === 'online') {
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
      // Try without attendees (Domain-Wide Delegation not available)
      if (calendarError.code === 403 && (calendarError.message?.includes('Domain-Wide') || calendarError.message?.includes('attendees'))) {
        const { attendees, ...eventWithoutAttendees } = event;
        createdEvent = await calendar.events.insert({
          calendarId: CALENDAR_ID,
          requestBody: eventWithoutAttendees,
        });
        hasAttendees = false;
      } else {
        throw calendarError;
      }
    }

    if (!createdEvent?.data?.id) return null;

    return {
      eventId: createdEvent.data.id,
      eventLink: createdEvent.data.htmlLink || '',
      hasAttendees,
    };
  } catch (error) {
    console.error('[bookingManager] Failed to create calendar event', error);
    return null;
  }
}
