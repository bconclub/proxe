#!/usr/bin/env node
/**
 * backfill-calendar-events.js
 * Creates Google Calendar events for all 10 bookings + updates whatsapp_sessions in Supabase.
 *
 * Usage: node scripts/backfill-calendar-events.js
 *
 * Requires env vars:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

// Load .env.local
const fs = require('fs');
const path = require('path');
const envPath = path.resolve(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    // Remove surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
  console.log('📂 Loaded .env.local');
}

const { google } = require('googleapis');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// ─── Config ─────────────────────────────────────────────────────────────────
const CALENDAR_ID = 'bconclubx@gmail.com';
const TIMEZONE = 'Asia/Kolkata';
const EVENT_DURATION_MINUTES = 30;

// ─── Bookings ───────────────────────────────────────────────────────────────
const bookings = [
  {
    name: 'Abu Jafar',
    brand: 'Work Planet Urban Solutions',
    date: '2026-03-04',
    time: '10:00',
    email: 'abu.jafar@workplaneturban.com',
    phone: '+916360171453',
    leadId: '073c9be1-93ca-49f1-b696-e2e4d5c1a07b',
    title: 'AI Lead Qualification for Meta Ads - Work Planet Urban Solutions',
  },
  {
    name: null,
    brand: 'Sparta Moto Defence',
    date: '2026-03-03',
    time: '11:00',
    email: null,
    phone: null,
    leadId: '103dad08-abb0-43d7-97c4-ce57bf3df918',
    title: 'AI Lead Generation for Auto Detailing - Sparta Moto Defence',
  },
  {
    name: null,
    brand: 'SM Agro Seeds & Pots',
    date: '2026-03-06',
    time: '15:00',
    email: null,
    phone: null,
    leadId: '2c886a16-b32f-46fc-af6b-e1aea10ac207',
    title: 'Online Customer Acquisition - SM Agro Seeds & Pots',
  },
  {
    name: 'Ankush Bihani',
    brand: 'Sobha LTD',
    date: '2026-03-04',
    time: '18:00',
    email: 'ankushbihani45@gmail.com',
    phone: '+919593661548',
    leadId: '86305e62-c158-43c9-81b7-08c442d7bb9d',
    title: 'AI Lead Machine at Scale - Sobha LTD',
  },
  {
    name: 'Rajkumar',
    brand: 'Vips Paramedical College',
    date: '2026-03-04',
    time: '15:00',
    email: null,
    phone: null,
    leadId: '4819268a-555e-4abb-9c2d-39d9bba0a4fe',
    title: 'AI Enrollment System for Multi-Branch Growth - Vips Paramedical College',
  },
  {
    name: 'Abhishek Vk',
    brand: 'Digital It Up',
    date: '2026-03-04',
    time: '13:00',
    email: 'technology@digitalitup.in',
    phone: '+918310596381',
    leadId: 'f382f3dd-70bd-4ff5-9416-43260b0b783c',
    title: 'AI Integration Strategy - Digital It Up',
  },
  {
    name: null,
    brand: null,
    date: '2026-03-04',
    time: '15:00',
    email: null,
    phone: null,
    leadId: 'b09a9467-71ff-48e6-93b0-78081e2d88e3',
    title: 'AI Lead Nurturing for Parent Enrollment',
  },
  {
    name: 'Ramesh Babu',
    brand: 'Confexmeet',
    date: '2026-03-04',
    time: '13:00',
    email: 'ramesh.sri804@gmail.com',
    phone: '+9108431429127',
    leadId: 'c7324d53-1985-47f9-8930-61708767a142',
    title: 'AI Audience Targeting Strategy - Confexmeet',
  },
  {
    name: 'Leslin',
    brand: 'Claysol',
    date: '2026-03-04',
    time: '18:00',
    email: 'columbus@claysol.com',
    phone: '+918095288163',
    leadId: '7096a261-2551-46d7-8c7a-1b0f0ba055ea',
    title: 'AI Lead Generation for OTT & Automotive - Claysol',
  },
  {
    name: 'Manu Gowda',
    brand: 'Savari Holidays',
    date: '2026-03-04',
    time: '11:00',
    email: 'manumandya123@gmail.com',
    phone: '+919538221531',
    leadId: '1e5b4ae7-ab08-4087-82de-12f785511d87',
    title: 'Google Ads Conversion Fix - Savari Holidays',
  },
];

// ─── Auth ────────────────────────────────────────────────────────────────────

function getGoogleAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!email || !key) {
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY');
  }

  key = key
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  return new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn('⚠️  Missing Supabase env vars - skipping DB lookups');
    return null;
  }
  return createClient(url, key);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Backfilling Google Calendar events for 10 bookings...\n');

  const auth = getGoogleAuth();
  const calendar = google.calendar({ version: 'v3', auth });
  const supabase = getSupabase();

  let success = 0;
  let failed = 0;
  const results = [];

  for (let i = 0; i < bookings.length; i++) {
    const b = { ...bookings[i] };
    console.log(`── Booking ${i + 1}/${bookings.length}: ${b.title} ──`);

    // Step 1: Fill in missing fields from Supabase
    if (supabase && (!b.name || !b.email || !b.phone || !b.brand)) {
      try {
        const { data: lead } = await supabase
          .from('all_leads')
          .select('customer_name, email, phone, unified_context')
          .eq('id', b.leadId)
          .maybeSingle();

        if (lead) {
          if (!b.name && lead.customer_name) b.name = lead.customer_name;
          if (!b.email && lead.email) b.email = lead.email;
          if (!b.phone && lead.phone) b.phone = lead.phone;
          if (!b.brand) {
            // Try to get brand from unified_context
            const profile = lead.unified_context?.whatsapp?.profile;
            if (profile?.company) b.brand = profile.company;
          }
          console.log(`   DB lookup: name=${b.name}, email=${b.email}, phone=${b.phone}`);
        } else {
          console.log(`   ⚠️ Lead ${b.leadId} not found in DB`);
        }
      } catch (err) {
        console.log(`   ⚠️ DB lookup failed: ${err.message}`);
      }
    }

    // Append brand to title if it was null and we found one
    if (b.title === 'AI Lead Nurturing for Parent Enrollment' && b.brand) {
      b.title = `${b.title} - ${b.brand}`;
    }

    // Step 2: Create calendar event
    const startISO = `${b.date}T${b.time}:00`;
    const startDate = new Date(`${startISO}+05:30`);
    const endDate = new Date(startDate.getTime() + EVENT_DURATION_MINUTES * 60 * 1000);
    const endISO = endDate.toISOString().replace('Z', '+05:30').replace(/\.\d+/, '');

    // Build end time string properly
    const endHour = parseInt(b.time.split(':')[0]) + 0; // 30 min, same hour
    const endMin = parseInt(b.time.split(':')[1] || '0') + EVENT_DURATION_MINUTES;
    const endH = Math.floor(endMin / 60) + parseInt(b.time.split(':')[0]);
    const endM = endMin % 60;
    const endTimeISO = `${b.date}T${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`;

    try {
      const event = await calendar.events.insert({
        calendarId: CALENDAR_ID,
        conferenceDataVersion: 1,
        resource: {
          summary: b.title,
          description: [
            'BCON Strategy Call',
            `Lead: ${b.name || 'Unknown'}`,
            `Brand: ${b.brand || 'Unknown'}`,
            `Phone: ${b.phone || 'N/A'}`,
            `Lead ID: ${b.leadId}`,
          ].join('\n'),
          start: { dateTime: startISO, timeZone: TIMEZONE },
          end: { dateTime: endTimeISO, timeZone: TIMEZONE },
          conferenceData: {
            createRequest: {
              requestId: crypto.randomUUID(),
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          },
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'popup', minutes: 1440 },
              { method: 'popup', minutes: 60 },
            ],
          },
        },
      });

      const meetLink = event.data.conferenceData?.entryPoints?.find(
        (e) => e.entryPointType === 'video'
      )?.uri || null;
      const calendarLink = event.data.htmlLink;
      const eventId = event.data.id;

      console.log(`   ✅ Created | Meet: ${meetLink || 'none'} | Calendar: ${calendarLink}`);

      results.push({
        ...b,
        eventId,
        meetLink,
        calendarLink,
        success: true,
      });

      // Step 3: Update whatsapp_sessions with booking data
      if (supabase) {
        try {
          // Find the whatsapp session for this lead
          const { data: session } = await supabase
            .from('whatsapp_sessions')
            .select('id, external_session_id')
            .eq('lead_id', b.leadId)
            .maybeSingle();

          if (session) {
            await supabase
              .from('whatsapp_sessions')
              .update({
                booking_date: b.date,
                booking_time: b.time,
                booking_status: 'Call Booked',
                booking_title: b.title,
                booking_meet_link: meetLink || null,
              })
              .eq('id', session.id);
            console.log(`   📝 Updated whatsapp_sessions (session: ${session.id})`);
          } else {
            console.log(`   ⚠️ No whatsapp_session found for lead ${b.leadId}`);
          }

          // Also update all_leads unified_context with booking info
          const { data: lead } = await supabase
            .from('all_leads')
            .select('unified_context')
            .eq('id', b.leadId)
            .maybeSingle();

          if (lead) {
            const ctx = lead.unified_context || {};
            const wa = ctx.whatsapp || {};
            await supabase
              .from('all_leads')
              .update({
                unified_context: {
                  ...ctx,
                  whatsapp: {
                    ...wa,
                    booking_status: 'Call Booked',
                    booking_date: b.date,
                    booking_time: b.time,
                  },
                },
              })
              .eq('id', b.leadId);
            console.log(`   📝 Updated all_leads unified_context`);
          }
        } catch (dbErr) {
          console.log(`   ⚠️ DB update failed: ${dbErr.message}`);
        }
      }

      success++;
    } catch (err) {
      console.log(`   ❌ FAILED: ${err.message}`);
      results.push({ ...b, success: false, error: err.message });
      failed++;
    }

    console.log('');
  }

  console.log('═══════════════════════════════════════════════════');
  console.log(`Done! ✅ ${success} created, ❌ ${failed} failed`);
  console.log('═══════════════════════════════════════════════════');

  // Print summary
  for (const r of results) {
    const status = r.success ? '✅' : '❌';
    console.log(`${status} ${r.title} | ${r.date} ${r.time} | ${r.meetLink || r.error || 'no meet link'}`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
