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

export type BookingSessionType = 'online' | 'offline';

// Online runs three fixed start times only — 3:00, 4:00, 5:00 PM (hourly step,
// last start 5 PM since each session is 60 min). Offline keeps 30-min granularity.
const BOOKING_WINDOWS: Record<BookingSessionType, { start: string; end: string; stepMinutes: number }> = {
  online: { start: '15:00', end: '18:00', stepMinutes: 60 },
  offline: { start: '11:00', end: '19:00', stepMinutes: 30 },
};
const BOOKING_DURATION_MINUTES = 60;

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

export function getAvailableBookingSlotStarts(sessionType?: string | null): string[] {
  const { start, end, stepMinutes } = BOOKING_WINDOWS[normalizeBookingSessionType(sessionType)];
  const slots: string[] = [];
  const lastStart = timeToMinutes(end) - BOOKING_DURATION_MINUTES;
  for (let minutes = timeToMinutes(start); minutes <= lastStart; minutes += stepMinutes) {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    slots.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
  }
  return slots;
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

  // If we don't have a lead_id yet, look it up by session.
  // NOTE: whatsapp_sessions has NO external_session_id column (it's keyed by
  // id / customer_phone_normalized), so this lookup silently fails for WhatsApp.
  // Guarded to web_sessions where the column actually exists.
  if (!leadId && tableName === 'web_sessions') {
    const { data: sessionLookup } = await client
      .from(tableName)
      .select('lead_id')
      .eq('external_session_id', externalSessionId)
      .maybeSingle();
    leadId = sessionLookup?.lead_id || null;
  }

  // Phone fallback — the reliable resolver for WhatsApp (phone is always known)
  // and a safety net for any channel where the session lookup didn't resolve a
  // lead. Without this the booking is silently dropped: leadId stays null, the
  // all_leads update below is skipped, and nothing is ever saved.
  if (!leadId && booking.phone) {
    const normalizedPhone = (booking.phone || '').replace(/\D/g, '').slice(-10);
    if (normalizedPhone) {
      const { data: leadByPhone } = await client
        .from('all_leads')
        .select('id')
        .eq('customer_phone_normalized', normalizedPhone)
        .maybeSingle();
      leadId = leadByPhone?.id || null;
    }
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

    // all_leads has NO scalar booking_date/booking_time columns — the booking
    // lives in unified_context.<channel>.booking_date (set in mergedCtx above),
    // which is exactly what the dashboard/pipeline/score routes read. Previously
    // this update also set booking_date/booking_time, and because those columns
    // don't exist Supabase rejected the ENTIRE update — so unified_context never
    // got written and the booking silently vanished (agent said "Done", nothing
    // saved). The error wasn't even checked. Persist via unified_context only.
    const { error: leadUpdateError } = await client
      .from('all_leads')
      .update({
        unified_context: mergedCtx,
        last_touchpoint: channel,
        last_interaction_at: getISTTimestamp(),
        metadata: { ...existingLeadMeta, ...mergedMetadata },
      })
      .eq('id', leadId);

    if (leadUpdateError) {
      console.error('[bookingManager] Failed to persist booking to all_leads', { leadId, error: leadUpdateError });
    } else {
      console.log('[bookingManager] Updated all_leads with booking info', { leadId, bookingDate: booking.date, bookingTime: booking.time });
    }
  } else {
    console.error('[bookingManager] Could not find lead_id to save booking - data may be lost', { externalSessionId, channel });
  }
}

// ─── Calendar Availability ──────────────────────────────────────────────────

/**
 * Check available calendar slots for a given date
 * Returns array of time slots with availability status
 */
/** Normalize a stored booking_time ("4:00 PM", "16:00", "16:00:00") to "HH:MM" 24h. */
function toTime24(t: string): string {
  const s = (t || '').trim();
  const ampm = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const p = ampm[3].toUpperCase();
    if (p === 'PM' && h !== 12) h += 12;
    if (p === 'AM' && h === 12) h = 0;
    return `${h.toString().padStart(2, '0')}:${ampm[2]}`;
  }
  const hm = s.match(/^(\d{1,2}):(\d{2})/);
  return hm ? `${hm[1].padStart(2, '0')}:${hm[2]}` : s;
}

/**
 * Slots already taken by an EXISTING booking on this date (any lead, any channel).
 * Google Calendar free/busy is not a reliable conflict source here (it's often
 * unconfigured, which made every slot "available" and allowed two leads to book
 * the same time). We check our own DB instead.
 */
async function getBookedTime24sForDate(dateStr: string): Promise<Set<string>> {
  const taken = new Set<string>();
  const client = getServiceClient() || getClient();
  if (!client) return taken;
  try {
    const { data: leads } = await client
      .from('all_leads')
      .select('unified_context')
      .not('unified_context', 'is', null);
    for (const l of (leads || []) as Array<{ unified_context: any }>) {
      const uc = l.unified_context || {};
      for (const ch of ['web', 'whatsapp', 'voice']) {
        const c = uc[ch] || {};
        const bd = c.booking_date || c.booking?.date;
        const bt = c.booking_time || c.booking?.time;
        if (bd === dateStr && bt) taken.add(toTime24(String(bt)));
      }
    }
    const { data: sess } = await client
      .from('web_sessions')
      .select('booking_time')
      .eq('booking_date', dateStr)
      .not('booking_time', 'is', null);
    for (const s of (sess || []) as Array<{ booking_time: string | null }>) {
      if (s.booking_time) taken.add(toTime24(String(s.booking_time)));
    }
  } catch (e) {
    console.error('[bookingManager] getBookedTime24sForDate failed', e);
  }
  return taken;
}

export async function getAvailableSlots(date: string, sessionType?: string | null): Promise<TimeSlot[]> {
  const dateStr = date.split('T')[0];
  const [year, month, day] = dateStr.split('-').map(Number);
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  if (dayOfWeek === 0) return [];

  // Drop slots already in the past when the requested date is today (IST).
  const allowedSlots = getBookableSlotStartsForDate(dateStr, sessionType);
  if (allowedSlots.length === 0) return [];

  // DB-level conflict check — a slot already booked by ANY lead is unavailable.
  // This is what prevents two customers being booked into the same time.
  const bookedTimes = await getBookedTime24sForDate(dateStr);

  const hasCredentials =
    !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    !!process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!hasCredentials) {
    // No calendar configured — availability is driven purely by existing DB bookings.
    return allowedSlots.map(slot => ({
      time: formatTimeForDisplay(slot),
      time24: slot,
      available: !bookedTimes.has(slot),
      displayTime: formatTimeForDisplay(slot),
    }));
  }

  try {
    const { google } = await import('googleapis');
    const auth = await getGoogleCalendarAuth();
    const calendar = google.calendar({ version: 'v3', auth });

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

    return allowedSlots.map(slot => {
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
        available: !hasConflict && !bookedTimes.has(slot),
        displayTime: formatTimeForDisplay(slot),
      };
    });
  } catch (error) {
    console.error('[bookingManager] Google Calendar check failed, falling back to Supabase', error);
    // Fallback: check Supabase for existing bookings on this date
    return checkAvailabilityFromSupabase(date, sessionType);
  }
}

/**
 * Fallback: check availability from Supabase bookings when Google Calendar is unavailable
 */
async function checkAvailabilityFromSupabase(date: string, sessionType?: string | null): Promise<TimeSlot[]> {
  const allowedSlots = getBookableSlotStartsForDate(date.split('T')[0], sessionType);
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return allowedSlots.map(slot => ({
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

    return allowedSlots.map(slot => ({
      time: formatTimeForDisplay(slot),
      time24: slot,
      available: !bookedTimes.has(slot),
      displayTime: formatTimeForDisplay(slot),
    }));
  } catch (err) {
    console.error('[bookingManager] Supabase availability check failed', err);
    return allowedSlots.map(slot => ({
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
    const sessionType = normalizeBookingSessionType(booking.sessionType);

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

    const bookingTime24 = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    if (!isAllowedBookingTime(bookingTime24, sessionType)) {
      console.error('[bookingManager] Refusing booking outside allowed window', {
        date: dateStr,
        time: bookingTime24,
        sessionType,
      });
      return null;
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
      const label = sessionType === 'offline' ? 'Facility Visit' : 'Online';
      eventTitle += ` [${label}]`;
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
    const display = sessionType === 'offline' ? 'Offline / Facility Visit' : 'Online Session';
    description += `Session Type: ${display}\n\n`;
    if (booking.conversationSummary) {
      description += `Conversation Summary:\n${booking.conversationSummary}\n\n`;
    }
    description += `Booking Details:\nDate: ${formatDate(booking.date)}\nTime: ${formatTimeForDisplay(`${hour}:${minute.toString().padStart(2, '0')}`)}\n\n`;
    description += `Contact: ${booking.email || booking.phone}`;

    const hasRealEmail = booking.email &&
      !booking.email.includes('noemail@') &&
      booking.email.includes('@');

    // Service accounts can only create Hangouts Meet conferences on Google
    // Workspace calendars (with Domain-Wide Delegation). On a personal Gmail
    // calendar (CALENDAR_ID ends in @gmail.com) the events.insert call throws
    // and we lose the whole event. Skip conferenceData for Gmail calendars and
    // include a Meet link in the description manually if you need one.
    const isPersonalGmailCalendar = /@gmail\.com$/i.test(CALENDAR_ID || '')

    const event: any = {
      summary: eventTitle,
      description,
      start: { dateTime: eventStart, timeZone: TIMEZONE },
      end: { dateTime: eventEnd, timeZone: TIMEZONE },
      // No attendees - service account lacks Domain-Wide Delegation; customers get details via WhatsApp
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 60 },
        ],
      },
    };

    if (!isPersonalGmailCalendar) {
      event.conferenceData = {
        createRequest: {
          requestId: `bcon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      }
    }

    if (sessionType === 'offline') {
      event.location = `${brandName} Facility`;
    } else if (sessionType === 'online') {
      event.location = 'Online Session (Video Call)';
    }

    const createdEvent = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: event,
      // Only request conference creation on Workspace calendars; harmless to
      // pass on Gmail but keeps the call clean.
      ...(isPersonalGmailCalendar ? {} : { conferenceDataVersion: 1 }),
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
