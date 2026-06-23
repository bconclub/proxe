#!/usr/bin/env node
/**
 * backfill-bookings.js - Recover 7 missed WhatsApp bookings
 *
 * Creates Google Calendar events (with Meet links), updates DB,
 * and sends WhatsApp confirmations for future-date bookings.
 *
 * Usage:
 *   node scripts/backfill-bookings.js              # dry run
 *   node scripts/backfill-bookings.js --apply       # actually execute
 *
 * Env vars required (set them before running, or use a .env loader):
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
 *   GOOGLE_CALENDAR_ID           (default: bconclubx@gmail.com)
 *   META_WHATSAPP_PHONE_NUMBER_ID
 *   META_WHATSAPP_ACCESS_TOKEN
 *   NEXT_PUBLIC_BCON_SUPABASE_URL  (or SUPABASE_URL)
 *   BCON_SUPABASE_SERVICE_KEY      (or SUPABASE_SERVICE_ROLE_KEY)
 */

const { google } = require('googleapis');
const { createClient } = require('@supabase/supabase-js');

// ─── Config ──────────────────────────────────────────────────────────────────

const DRY_RUN = !process.argv.includes('--apply');
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'bconclubx@gmail.com';
const TIMEZONE = 'Asia/Kolkata';
const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

// ─── Supabase ────────────────────────────────────────────────────────────────

const supabaseUrl =
  process.env.NEXT_PUBLIC_BCON_SUPABASE_URL ||
  process.env.SUPABASE_URL;
const supabaseKey =
  process.env.BCON_SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

// ─── The 7 bookings to recover ───────────────────────────────────────────────

const BOOKINGS = [
  {
    leadId: '073c9be1-93ca-49f1-b696-e2e4d5c1a07b',
    name: 'Abu Jafar',
    email: 'abu.jafar@workplaneturban.com',
    phone: '+916360171453',
    brand: 'Work Planet Urban Solutions',
    date: '2026-03-04',
    time: '10:00 AM',
    title: 'AI Lead Qualification for Meta Ads - Work Planet Urban Solutions',
    description: 'Running Meta ads, 25-30% conversion, lead quality problem, wasting time manually qualifying',
  },
  {
    leadId: '103dad08-abb0-43d7-97c4-ce57bf3df918',
    name: null, // pull from DB
    email: null,
    phone: null,
    brand: 'Sparta Moto Defence',
    date: '2026-03-03',
    time: '11:00 AM',
    title: 'AI Lead Generation for Auto Detailing - Sparta Moto Defence',
    description: 'Paint protection film business, posting reels on Instagram/Facebook but can\'t reach people, algorithm not pushing content',
  },
  {
    leadId: '2c886a16-b32f-46fc-af6b-e1aea10ac207',
    name: null,
    email: null,
    phone: null,
    brand: 'SM Agro Seeds & Pots',
    date: '2026-03-06',
    time: '3:00 PM',
    title: 'Online Customer Acquisition - SM Agro Seeds & Pots',
    description: 'Local market + word of mouth only, doing 3L/month, wants online customers',
  },
  {
    leadId: '86305e62-c158-43c9-81b7-08c442d7bb9d',
    name: 'Ankush Bihani',
    email: 'ankushbihani45@gmail.com',
    phone: '+919593661548',
    brand: 'Sobha LTD',
    date: '2026-03-04',
    time: '6:00 PM',
    title: 'AI Lead Machine at Scale - Sobha LTD',
    description: 'Product business, needs 1000 leads/month, ASAP setup',
  },
  {
    leadId: '4819268a-555e-4abb-9c2d-39d9bba0a4fe',
    name: 'Rajkumar',
    email: null,
    phone: null,
    brand: 'Vips Paramedical College',
    date: '2026-03-04',
    time: '3:00 PM',
    title: 'AI Enrollment System for Multi-Branch Growth - Vips Paramedical College',
    description: 'College with multiple branches, 200 of 1000 seats filled, 50% conversion, needs AI to handle enrollment across branches',
  },
  {
    leadId: 'f382f3dd-70bd-4ff5-9416-43260b0b783c',
    name: 'Abhishek Vk',
    email: 'technology@digitalitup.in',
    phone: '+918310596381',
    brand: 'Digital It Up',
    date: '2026-03-04',
    time: '1:00 PM',
    title: 'AI Integration Strategy - Digital It Up',
    description: 'Digital agency from Mysore, exploring AI integration',
  },
  {
    leadId: 'b09a9467-71ff-48e6-93b0-78081e2d88e3',
    name: null,
    email: null,
    phone: null,
    brand: 'Makkala Mane',
    date: '2026-03-04',
    time: '3:00 PM',
    title: 'AI Lead Nurturing for Parent Enrollment - Makkala Mane',
    description: 'Daycare business, parents asking about price before understanding value, needs lead system that builds excitement',
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseTime(timeStr) {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) throw new Error(`Cannot parse time: ${timeStr}`);
  let hour = parseInt(match[1]);
  const minute = parseInt(match[2]);
  const period = match[3].toUpperCase();
  if (period === 'PM' && hour !== 12) hour += 12;
  if (period === 'AM' && hour === 12) hour = 0;
  return { hour, minute };
}

function isFutureDate(dateStr) {
  const now = new Date();
  const booking = new Date(dateStr + 'T23:59:59+05:30');
  return booking > now;
}

function formatDateDisplay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00+05:30');
  return d.toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

// ─── Google Calendar ─────────────────────────────────────────────────────────

async function getCalendarAuth() {
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!serviceAccountEmail || !privateKey) {
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY');
  }

  privateKey = privateKey
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  return new google.auth.JWT({
    email: serviceAccountEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
}

async function createCalendarEventWithMeet(booking) {
  const auth = await getCalendarAuth();
  const calendar = google.calendar({ version: 'v3', auth });

  const { hour, minute } = parseTime(booking.time);
  const dateStr = booking.date;

  const eventStart = `${dateStr}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00+05:30`;
  const endHour = hour + 1; // 1-hour event (30 min call + buffer)
  const eventEnd = `${dateStr}T${endHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00+05:30`;

  let description = `BCON - Strategy Call\n`;
  description += `BOOKING STATUS: CONFIRMED\n\n`;
  description += `Lead: ${booking.name}\n`;
  description += `Brand: ${booking.brand}\n`;
  description += `Phone: ${booking.phone}\n`;
  description += `Email: ${booking.email || 'Not provided'}\n`;
  description += `Lead ID: ${booking.leadId}\n\n`;
  description += `Discussion Points:\n${booking.description}\n`;

  const hasRealEmail = booking.email &&
    !booking.email.includes('noemail@') &&
    booking.email.includes('@');

  const event = {
    summary: booking.title,
    description,
    start: { dateTime: eventStart, timeZone: TIMEZONE },
    end: { dateTime: eventEnd, timeZone: TIMEZONE },
    conferenceData: {
      createRequest: {
        requestId: `backfill-${booking.leadId}-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 24 * 60 },
        { method: 'popup', minutes: 60 },
      ],
    },
  };

  let createdEvent;
  try {
    createdEvent = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: event,
      conferenceDataVersion: 1,
    });
  } catch (err) {
    throw err;
    }
  }

  const meetLink = createdEvent.data.conferenceData?.entryPoints?.find(
    (ep) => ep.entryPointType === 'video'
  )?.uri || null;

  return {
    eventId: createdEvent.data.id,
    eventLink: createdEvent.data.htmlLink || '',
    meetLink,
  };
}

// ─── WhatsApp ────────────────────────────────────────────────────────────────

async function sendWhatsAppMessage(to, message) {
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    console.error('  ⚠️  Missing META_WHATSAPP env vars - skipping WhatsApp send');
    return false;
  }

  // Normalize phone: strip + and ensure no leading spaces
  const normalizedTo = to.replace(/[^0-9]/g, '');

  const res = await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedTo,
      type: 'text',
      text: { preview_url: true, body: message },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`  ❌ WhatsApp send failed: ${res.status} ${err}`);
    return false;
  }

  return true;
}

// ─── DB Updates ──────────────────────────────────────────────────────────────

async function fetchLeadData(leadId) {
  const { data, error } = await supabase
    .from('all_leads')
    .select('customer_name, email, phone')
    .eq('id', leadId)
    .maybeSingle();

  if (error) {
    console.error(`  ⚠️  Failed to fetch lead ${leadId}:`, error.message);
    return null;
  }
  return data;
}

async function fetchWhatsAppSession(leadId) {
  const { data, error } = await supabase
    .from('whatsapp_sessions')
    .select('id, external_session_id, booking_date, booking_time')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(`  ⚠️  Failed to fetch whatsapp_session for ${leadId}:`, error.message);
    return null;
  }
  return data;
}

async function updateWhatsAppSession(sessionId, updates) {
  const { error } = await supabase
    .from('whatsapp_sessions')
    .update(updates)
    .eq('id', sessionId);

  if (error) {
    console.error(`  ❌ Failed to update whatsapp_sessions:`, error.message);
    return false;
  }
  return true;
}

async function updateLeadContext(leadId, bookingData) {
  const { data: lead } = await supabase
    .from('all_leads')
    .select('unified_context')
    .eq('id', leadId)
    .maybeSingle();

  const existingCtx = lead?.unified_context || {};
  const mergedCtx = {
    ...existingCtx,
    whatsapp: {
      ...(existingCtx.whatsapp || {}),
      booking_status: 'Call Booked',
      booking_date: bookingData.date,
      booking_time: bookingData.time,
      booking_meet_link: bookingData.meetLink || null,
      booking_title: bookingData.title || null,
    },
  };

  const { error } = await supabase
    .from('all_leads')
    .update({
      unified_context: mergedCtx,
      last_interaction_at: new Date().toISOString(),
    })
    .eq('id', leadId);

  if (error) {
    console.error(`  ❌ Failed to update all_leads:`, error.message);
    return false;
  }
  return true;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function processBooking(booking, index) {
  console.log(`\n─── ${index + 1}. ${booking.brand} ───────────────────────────`);

  // 1. Fill in missing data from DB
  if (!booking.name || !booking.phone) {
    const lead = await fetchLeadData(booking.leadId);
    if (lead) {
      if (!booking.name) booking.name = lead.customer_name || 'Unknown';
      if (!booking.email) booking.email = lead.email || null;
      if (!booking.phone) booking.phone = lead.phone || null;
    }
  }

  console.log(`  Name:  ${booking.name}`);
  console.log(`  Phone: ${booking.phone || 'N/A'}`);
  console.log(`  Email: ${booking.email || 'N/A'}`);
  console.log(`  Date:  ${booking.date} at ${booking.time}`);
  console.log(`  Title: ${booking.title}`);

  // 2. Check whatsapp_session
  const session = await fetchWhatsAppSession(booking.leadId);
  if (!session) {
    console.log(`  ⚠️  No whatsapp_session found - skipping`);
    return { success: false, reason: 'no session' };
  }

  if (session.booking_date) {
    console.log(`  ⏭️  Already has booking (${session.booking_date} ${session.booking_time}) - skipping`);
    return { success: false, reason: 'already booked' };
  }

  if (DRY_RUN) {
    console.log(`  🔍 DRY RUN - would create calendar event + update DB`);
    return { success: true, dryRun: true };
  }

  // 3. Create Google Calendar event with Meet link
  let calendarResult = null;
  try {
    calendarResult = await createCalendarEventWithMeet(booking);
    console.log(`  ✅ Calendar event created`);
    console.log(`  ✅ Meet link: ${calendarResult.meetLink || 'N/A'}`);
  } catch (err) {
    console.error(`  ❌ Calendar failed: ${err.message}`);
  }

  // 4. Send WhatsApp confirmation (only for future bookings)
  const future = isFutureDate(booking.date);
  if (future && booking.phone && calendarResult?.meetLink) {
    const dateDisplay = formatDateDisplay(booking.date);
    const message =
      `Hey ${booking.name}! Your call with the BCON team is confirmed.\n\n` +
      `📅 ${dateDisplay} at ${booking.time} IST\n` +
      `📍 ${calendarResult.meetLink}\n\n` +
      `Talk soon!`;

    const sent = await sendWhatsAppMessage(booking.phone, message);
    console.log(sent ? `  ✅ WhatsApp sent` : `  ⚠️  WhatsApp failed`);
  } else if (!future) {
    console.log(`  ⏭️  Past date - skipping WhatsApp`);
  } else if (!booking.phone) {
    console.log(`  ⚠️  No phone - skipping WhatsApp`);
  }

  // 5. Update whatsapp_sessions
  const sessionUpdated = await updateWhatsAppSession(session.id, {
    booking_date: booking.date,
    booking_time: booking.time,
    booking_status: 'Call Booked',
    booking_created_at: new Date().toISOString(),
    google_event_id: calendarResult?.eventId || null,
    booking_meet_link: calendarResult?.meetLink || null,
    booking_title: booking.title,
  });
  console.log(sessionUpdated ? `  ✅ whatsapp_sessions updated` : `  ❌ whatsapp_sessions failed`);

  // 6. Update all_leads
  const leadUpdated = await updateLeadContext(booking.leadId, {
    date: booking.date,
    time: booking.time,
    meetLink: calendarResult?.meetLink,
    title: booking.title,
  });
  console.log(leadUpdated ? `  ✅ all_leads updated` : `  ❌ all_leads failed`);

  return { success: true, calendarResult };
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  BCON - Backfill 7 Missed WhatsApp Bookings');
  console.log(`  Mode: ${DRY_RUN ? '🔍 DRY RUN' : '⚡ APPLYING'}`);
  console.log('═══════════════════════════════════════════════════════════');

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < BOOKINGS.length; i++) {
    const result = await processBooking({ ...BOOKINGS[i] }, i);
    if (result.success) success++;
    else if (result.reason === 'already booked') skipped++;
    else failed++;
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  Done: ${success} processed, ${skipped} skipped, ${failed} failed`);
  if (DRY_RUN) {
    console.log('  Run with --apply to execute');
  }
  console.log('═══════════════════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
