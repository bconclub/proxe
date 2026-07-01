/**
 * services/bookingManager.ts - Booking storage + Google Calendar integration
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

// ─── Slot-availability helpers (ported from Windchasers) ─────────────────────
// BCON does not split bookings by session type (WC has online/offline windows);
// BCON uses a single fixed AVAILABLE_SLOTS list. The `sessionType` param is kept
// for API parity with WC + the cancel/booking UI, but is currently ignored.
// FLAG FOR REVIEW: if BCON later needs distinct online/offline windows, replace
// AVAILABLE_SLOTS with a BOOKING_WINDOWS map like WC.

export type BookingSessionType = 'online' | 'offline';

export function normalizeBookingSessionType(sessionType?: string | null): BookingSessionType {
  return sessionType === 'offline' ? 'offline' : 'online';
}

function timeToMinutes(time24: string): number {
  const [hour, minute] = time24.split(':').map(Number);
  return hour * 60 + minute;
}

function normalizeBookingTime(time: string): string | null {
  if (!time) return null;
  const trimmed = time.trim();

  if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
    const [hour, minute] = trimmed.split(':').map(Number);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    }
    return null;
  }

  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const period = match[3].toUpperCase();

  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
  if (period === 'PM' && hour !== 12) hour += 12;
  if (period === 'AM' && hour === 12) hour = 0;

  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getAvailableBookingSlotStarts(sessionType?: string | null): string[] {
  // BCON: single fixed slot list (sessionType ignored — see note above).
  return [...AVAILABLE_SLOTS];
}

export function isAllowedBookingTime(time: string, sessionType?: string | null): boolean {
  const normalizedTime = normalizeBookingTime(time);
  return !!normalizedTime && getAvailableBookingSlotStarts(sessionType).includes(normalizedTime);
}

/**
 * Slot starts that are still bookable for a SPECIFIC date.
 * For any future date this is the full window. For TODAY (IST) we drop slots
 * whose start time has already passed — otherwise a customer messaging at
 * 8:30 PM would be offered (or booked into) a 3:00 PM slot that is long gone.
 */
export function getBookableSlotStartsForDate(dateStr: string, sessionType?: string | null): string[] {
  const all = getAvailableBookingSlotStarts(sessionType);
  const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
  if (dateStr !== todayIST) return all;
  const hm = new Date().toLocaleTimeString('en-GB', {
    hour12: false, hour: '2-digit', minute: '2-digit', timeZone: TIMEZONE,
  });
  const [h, m] = hm.split(':').map(Number);
  const nowMinutes = h * 60 + m;
  return all.filter(slot => timeToMinutes(slot) > nowMinutes);
}

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
  title?: string;          // AI-generated call title
  meetLink?: string;       // Google Meet link
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
  // Dynamic import - googleapis is only needed when calendar features are used
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

  // Check both web_sessions and whatsapp_sessions for existing bookings
  const tables = [getChannelTable('web'), getChannelTable('whatsapp')];

  try {
    for (const tableName of tables) {
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
    ...(booking.meetLink ? { booking_meet_link: booking.meetLink } : {}),
    ...(booking.title ? { booking_title: booking.title } : {}),
  };

  let sessionData: any = null;

  const { data, error } = await client
    .from(tableName)
    .update(bookingUpdate)
    .eq('external_session_id', externalSessionId)
    .select('lead_id, conversation_summary, user_inputs_summary, metadata');

  if (error) {
    console.error('[bookingManager] Failed to store booking in session table', error);
    // Session update failed - but DON'T return early.
    // We still need to save booking data to all_leads below.
  } else if (data && data.length > 0) {
    sessionData = data[0];
  }

  // Sync to all_leads - ALWAYS attempt this, even if session update failed.
  // Resolve lead_id from session data, or from profile update, or by looking up the session.
  let leadId = sessionData?.lead_id || currentLeadId;

  // If we don't have a lead_id yet (session update failed), look it up directly
  if (!leadId) {
    const { data: sessionLookup } = await client
      .from(tableName)
      .select('lead_id')
      .eq('external_session_id', externalSessionId)
      .maybeSingle();
    leadId = sessionLookup?.lead_id || null;
  }

  if (leadId) {
    const unifiedContext = {
      [channel]: {
        conversation_summary: cleanSummary(sessionData?.conversation_summary || currentSession?.conversation_summary) || null,
        booking_status: booking.status ?? 'Call Booked',
        booking_date: booking.date,
        booking_time: booking.time,
        booking_meet_link: booking.meetLink || null,
        booking_title: booking.title || null,
        user_inputs: sessionData?.user_inputs_summary || currentSession?.user_inputs_summary || [],
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

    const { error: leadUpdateError } = await client
      .from('all_leads')
      .update({
        unified_context: mergedCtx,
        booking_date: booking.date,
        booking_time: booking.time,
        last_touchpoint: channel,
        last_interaction_at: getISTTimestamp(),
        metadata: { ...existingLeadMeta, ...mergedMetadata },
      })
      .eq('id', leadId);

    if (leadUpdateError) {
      // Fail loudly — otherwise the caller/agent confirms "booking recorded"
      // while nothing was actually persisted.
      throw new Error(`Failed to persist booking to all_leads: ${leadUpdateError.message || leadUpdateError}`);
    }

    console.log('[bookingManager] Updated all_leads with booking info', { leadId, bookingDate: booking.date, bookingTime: booking.time });
  } else {
    // No lead resolved — never silently swallow; the booking would be lost and
    // the agent would still claim success.
    throw new Error('Could not resolve a lead to save the booking');
  }
}

// ─── Calendar Availability ──────────────────────────────────────────────────

/**
 * Check available calendar slots for a given date
 * Returns array of time slots with availability status
 */
export async function getAvailableSlots(date: string, _sessionType?: string | null): Promise<TimeSlot[]> {
  // Past-time guard: for TODAY (IST), drop slots whose start already passed, so
  // a customer messaging at 9 PM is never offered an 11 AM / 3 PM slot that is
  // long gone. For any future date this is the full window. Every path below
  // maps over this filtered list instead of the raw AVAILABLE_SLOTS.
  const bookableSlots = getBookableSlotStartsForDate(date, _sessionType);

  const hasCredentials =
    !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    !!process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!hasCredentials) {
    // Return remaining slots as available when credentials are not configured
    return bookableSlots.map(slot => ({
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

    return bookableSlots.map(slot => {
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
    console.error('[bookingManager] Google Calendar check failed, falling back to Supabase', error);
    // Fallback: check Supabase for existing bookings on this date
    return checkAvailabilityFromSupabase(date);
  }
}

/**
 * Fallback: check availability from Supabase bookings when Google Calendar is unavailable
 */
async function checkAvailabilityFromSupabase(date: string): Promise<TimeSlot[]> {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return AVAILABLE_SLOTS.map(slot => ({
        time: formatTimeForDisplay(slot),
        time24: slot,
        available: true,
        displayTime: formatTimeForDisplay(slot),
      }));
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const dateStr = date.split('T')[0];

    // Check all_leads for bookings on this date
    const { data: bookedLeads } = await supabase
      .from('all_leads')
      .select('booking_time')
      .eq('booking_date', dateStr)
      .not('booking_time', 'is', null);

    // Check whatsapp_sessions for bookings on this date
    const { data: bookedSessions } = await supabase
      .from('whatsapp_sessions')
      .select('booking_time')
      .eq('booking_date', dateStr)
      .not('booking_time', 'is', null);

    // Combine all booked times
    const bookedTimes = new Set<string>();
    for (const row of [...(bookedLeads || []), ...(bookedSessions || [])]) {
      if (row.booking_time) {
        // Normalize time to HH:MM format
        const t = String(row.booking_time).substring(0, 5);
        bookedTimes.add(t);
      }
    }

    console.log(`[bookingManager] Supabase fallback: ${bookedTimes.size} booked slots on ${dateStr}:`, Array.from(bookedTimes));

    return AVAILABLE_SLOTS.map(slot => ({
      time: formatTimeForDisplay(slot),
      time24: slot,
      available: !bookedTimes.has(slot),
      displayTime: formatTimeForDisplay(slot),
    }));
  } catch (err) {
    console.error('[bookingManager] Supabase availability check failed', err);
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
  email?: string;
  phone: string;
  courseInterest?: string;
  sessionType?: string;
  conversationSummary?: string;
  title?: string;
}): Promise<{ eventId: string; eventLink: string; hasAttendees: boolean; meetLink: string | null } | null> {
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

    // Event title - use AI-generated title if provided, otherwise auto-generate
    let eventTitle: string;
    if (booking.title) {
      eventTitle = booking.title;
    } else {
      eventTitle = `${booking.name} - ${courseDisplayName}`;
      if (booking.sessionType) {
        const label = booking.sessionType === 'offline' ? 'Facility Visit' : 'Online';
        eventTitle += ` [${label}]`;
      }
    }

    // Description - brand-aware
    const brandName = (() => {
      try {
        const { getBrandConfig, getCurrentBrandId } = require('@/configs');
        return getBrandConfig(getCurrentBrandId()).name;
      } catch { return 'Consultation'; }
    })();
    let description = `${brandName} - Consultation Booking\n`;
    description += `BOOKING STATUS: CONFIRMED\n\n`;
    description += `Candidate Information:\nName: ${booking.name}\nEmail: ${booking.email || 'Not provided'}\nPhone: ${booking.phone}\n\n`;
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
    description += `Contact: ${booking.email || booking.phone}`;

    const hasRealEmail = booking.email &&
      !booking.email.includes('noemail@') &&
      booking.email.includes('@');

    const event: any = {
      summary: eventTitle,
      description,
      start: { dateTime: eventStart, timeZone: TIMEZONE },
      end: { dateTime: eventEnd, timeZone: TIMEZONE },
      // NO Google Meet conference: the calendar (bconclubx@gmail.com) is a
      // personal Gmail and the service account has no Domain-Wide Delegation, so
      // requesting a hangoutsMeet conference makes Google reject the whole insert
      // with "Invalid conference type value" — failing every booking. Meet
      // creation via a service account requires Google Workspace + DWD. Without
      // it we create a plain calendar event; customers get details via WhatsApp.
      // No attendees for the same DWD reason.
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 60 },
        ],
      },
    };

    if (booking.sessionType === 'offline') {
      event.location = `${brandName} Facility`;
    } else if (booking.sessionType === 'online') {
      event.location = 'Online Session (Video Call)';
    }

    const createdEvent = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: event,
    });

    if (!createdEvent?.data?.id) return null;

    // Extract Google Meet link from conference data
    const meetLink = createdEvent.data.conferenceData?.entryPoints?.find(
      (ep: any) => ep.entryPointType === 'video'
    )?.uri || null;

    return {
      eventId: createdEvent.data.id,
      eventLink: createdEvent.data.htmlLink || '',
      hasAttendees: false,
      meetLink,
    };
  } catch (error) {
    console.error('[bookingManager] Failed to create calendar event', error);
    return null;
  }
}

// ─── Cancel Booking ───────────────────────────────────────────────────────────

/**
 * Delete a Google Calendar event by id. Returns true on success (or if the
 * event is already gone — 404/410). Best-effort; never throws.
 */
export async function deleteCalendarEvent(eventId: string): Promise<boolean> {
  if (!eventId) return false;
  try {
    const { google } = await import('googleapis');
    const auth = await getGoogleCalendarAuth();
    const calendar = google.calendar({ version: 'v3', auth });
    await calendar.events.delete({ calendarId: CALENDAR_ID, eventId });
    console.log('[bookingManager] Deleted calendar event', eventId);
    return true;
  } catch (error: any) {
    const code = error?.code || error?.response?.status;
    if (code === 404 || code === 410) {
      console.warn('[bookingManager] Calendar event already gone', eventId);
      return true;
    }
    console.error('[bookingManager] Failed to delete calendar event', eventId, error?.message || error);
    return false;
  }
}

/**
 * Cancel a lead's booking completely (BCON storage model):
 *   1. Delete the Google Calendar event (if we have its id).
 *   2. Clear the booking from unified_context.<channel> (status → cancelled,
 *      date/time/meet-link/title nulled) so it drops out of Upcoming / pipeline.
 *   3. Null the top-level all_leads.booking_date / booking_time mirror.
 *   4. Clear booking columns on web_sessions (the only session table with them).
 *   5. Cancel pending booking_reminder_24h / _30m agent_tasks so no reminder fires.
 *
 * Used by the dashboard "Cancel booking" action. Best-effort per step; returns
 * what happened. DESTRUCTIVE on the calendar — never deletes without an explicit
 * event id, and reports a clear error when no booking exists.
 */
export async function cancelBooking(
  leadId: string,
  supabase: SupabaseClient,
): Promise<{ ok: boolean; calendarDeleted: boolean; remindersCancelled: number; error?: string }> {
  const { data: lead, error } = await supabase
    .from('all_leads')
    .select('unified_context, metadata')
    .eq('id', leadId)
    .maybeSingle();
  if (error || !lead) {
    return { ok: false, calendarDeleted: false, remindersCancelled: 0, error: 'Lead not found' };
  }

  const uc: Record<string, any> = lead.unified_context || {};
  const meta: Record<string, any> = lead.metadata || {};

  // Resolve the calendar event id from any place BCON stores it.
  // storeBooking writes it to all_leads.metadata.googleEventId and to the
  // session-table google_event_id column.
  const sessionGoogleEventId = await (async () => {
    const { data: ws } = await supabase
      .from('web_sessions')
      .select('google_event_id')
      .eq('lead_id', leadId)
      .not('google_event_id', 'is', null)
      .maybeSingle();
    return ws?.google_event_id || null;
  })();

  const eventId =
    meta.googleEventId || meta.google_event_id ||
    uc.web?.googleEventId || uc.web?.google_event_id ||
    uc.whatsapp?.googleEventId || uc.whatsapp?.google_event_id ||
    sessionGoogleEventId || null;

  // Defensive: do not proceed if there is no booking at all to cancel.
  const hasBooking =
    !!eventId ||
    ['web', 'whatsapp', 'voice', 'social'].some((ch) => {
      const blk = uc[ch];
      return blk && (blk.booking_date || blk.booking_status);
    });
  if (!hasBooking) {
    return { ok: false, calendarDeleted: false, remindersCancelled: 0, error: 'No booking found to cancel' };
  }

  let calendarDeleted = false;
  if (eventId) calendarDeleted = await deleteCalendarEvent(eventId);

  // Clear the booking from every channel block (BCON uses flat booking_* keys).
  const newUc: Record<string, any> = { ...uc };
  for (const ch of ['web', 'whatsapp', 'voice', 'social']) {
    const blk = newUc[ch];
    if (blk && (blk.booking_date || blk.booking_status)) {
      newUc[ch] = {
        ...blk,
        booking_status: 'cancelled',
        booking_date: null,
        booking_time: null,
        booking_meet_link: null,
        booking_title: null,
        booking_cancelled_at: getISTTimestamp(),
      };
    }
  }

  await supabase
    .from('all_leads')
    .update({ unified_context: newUc, booking_date: null, booking_time: null })
    .eq('id', leadId)
    .then(({ error: e }) => { if (e) console.warn('[cancelBooking] all_leads clear failed:', e.message); });

  // web_sessions is the only session table with booking columns — clear it too
  // so any session-booking fallback doesn't resurrect it.
  await supabase
    .from('web_sessions')
    .update({ booking_date: null, booking_time: null, booking_status: 'cancelled', google_event_id: null })
    .eq('lead_id', leadId)
    .then(({ error: e }) => { if (e) console.warn('[cancelBooking] web_sessions clear failed:', e.message); });

  // Cancel pending reminder tasks (BCON uses the same agent_tasks mechanism + types).
  const { count } = await supabase
    .from('agent_tasks')
    .update({ status: 'cancelled', completed_at: new Date().toISOString() }, { count: 'exact' })
    .eq('lead_id', leadId)
    .in('task_type', ['booking_reminder_24h', 'booking_reminder_30m'])
    .in('status', ['pending', 'queued']);

  console.log(`[cancelBooking] lead=${leadId} calendarDeleted=${calendarDeleted} remindersCancelled=${count ?? 0}`);
  return { ok: true, calendarDeleted, remindersCancelled: count ?? 0 };
}
