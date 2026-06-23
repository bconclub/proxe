/**
 * Backfill WhatsApp Bookings
 *
 * Recovers ~7 bookings that were confirmed via WhatsApp but never saved to the
 * database (due to the storeBooking early-return bug).
 *
 * How it works:
 *   1. Finds agent messages in `conversations` (channel=whatsapp) that confirm bookings
 *   2. Parses date + time from the confirmation text
 *   3. Cross-references with lead data (name, phone, email)
 *   4. Shows everything for review
 *   5. If --apply flag is set, writes to whatsapp_sessions + all_leads
 *
 * Usage:
 *   npx tsx scripts/backfill-whatsapp-bookings.ts          # dry run (shows what it finds)
 *   npx tsx scripts/backfill-whatsapp-bookings.ts --apply   # actually writes to DB
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Load .env.local manually (no dotenv dependency)
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.substring(0, eqIndex).trim();
    let value = trimmed.substring(eqIndex + 1).trim();
    // Strip quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

const supabaseUrl =
  process.env.NEXT_PUBLIC_BCON_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.BCON_SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SERVICE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

const DRY_RUN = !process.argv.includes('--apply');

// ─── Booking detection patterns ─────────────────────────────────────────────

const BOOKING_PATTERNS = [
  /(?:locked in|booked|confirmed).*?(?:for\s+)?(?:tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday)?\s*\(?([A-Za-z]+ \d{1,2}(?:st|nd|rd|th)?)\)?\s*(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))/i,
  /(?:locked in|booked|confirmed).*?(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))/i,
  /(?:booked|locked in|confirmed).*?(?:for\s+)?(\w+day(?:\s*,?\s*[A-Za-z]+ \d{1,2}(?:st|nd|rd|th)?)?)\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))/i,
];

// More specific patterns for common formats
const DATE_PATTERNS = [
  // "March 4th", "March 4", "Mar 4th"
  /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i,
  // "tomorrow (March 4th)"
  /tomorrow\s*\(([A-Za-z]+ \d{1,2}(?:st|nd|rd|th)?)\)/i,
  // "Monday", "Tuesday" etc
  /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i,
];

const TIME_PATTERNS = [
  /\b(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))\b/,
  /\b(\d{1,2}\s*(?:AM|PM|am|pm))\b/,
  /\bat\s+(\d{1,2}(?::\d{2})?)\s*(?:AM|PM|am|pm)?/i,
];

interface FoundBooking {
  leadId: string;
  leadName: string | null;
  leadPhone: string | null;
  leadEmail: string | null;
  messageContent: string;
  messageDate: string;
  parsedDate: string | null;
  parsedTime: string | null;
  whatsappSessionId: string | null;
  externalSessionId: string | null;
}

function parseBookingDate(text: string, messageCreatedAt: string): string | null {
  // Try "Month Day" pattern
  const monthMatch = text.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i,
  );
  if (monthMatch) {
    const month = monthMatch[1];
    const day = parseInt(monthMatch[2]);
    const msgDate = new Date(messageCreatedAt);
    const year = msgDate.getFullYear();
    const parsed = new Date(`${month} ${day}, ${year}`);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0]; // YYYY-MM-DD
    }
  }

  // Try "tomorrow"
  if (/\btomorrow\b/i.test(text)) {
    const msgDate = new Date(messageCreatedAt);
    msgDate.setDate(msgDate.getDate() + 1);
    return msgDate.toISOString().split('T')[0];
  }

  // Try day-of-week
  const dayMatch = text.match(
    /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i,
  );
  if (dayMatch) {
    const dayName = dayMatch[1].toLowerCase();
    const dayMap: Record<string, number> = {
      sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
      thursday: 4, friday: 5, saturday: 6,
    };
    const targetDay = dayMap[dayName];
    const msgDate = new Date(messageCreatedAt);
    const currentDay = msgDate.getDay();
    let daysUntil = targetDay - currentDay;
    if (daysUntil <= 0) daysUntil += 7;
    msgDate.setDate(msgDate.getDate() + daysUntil);
    return msgDate.toISOString().split('T')[0];
  }

  return null;
}

function parseBookingTime(text: string): string | null {
  // "6:00 PM", "3:00 PM", "11:00 AM"
  const timeMatch = text.match(/\b(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)\b/);
  if (timeMatch) {
    let hour = parseInt(timeMatch[1]);
    const min = timeMatch[2];
    const period = timeMatch[3].toUpperCase();
    if (period === 'PM' && hour !== 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    return `${hour.toString().padStart(2, '0')}:${min}`;
  }

  // "6 PM", "3 PM"
  const simpleMatch = text.match(/\b(\d{1,2})\s*(AM|PM|am|pm)\b/);
  if (simpleMatch) {
    let hour = parseInt(simpleMatch[1]);
    const period = simpleMatch[2].toUpperCase();
    if (period === 'PM' && hour !== 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    return `${hour.toString().padStart(2, '0')}:00`;
  }

  return null;
}

async function findBookings(): Promise<FoundBooking[]> {
  console.log('🔍 Searching conversations for WhatsApp booking confirmations...\n');

  // Find agent messages on WhatsApp that look like booking confirmations
  const { data: messages, error } = await supabase
    .from('conversations')
    .select('id, lead_id, content, created_at, metadata')
    .eq('channel', 'whatsapp')
    .eq('sender', 'agent')
    .or(
      'content.ilike.%locked in%,content.ilike.%booked%,content.ilike.%confirmed for%,content.ilike.%you\'re in%',
    )
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Error querying conversations:', error.message);
    return [];
  }

  if (!messages || messages.length === 0) {
    console.log('No booking confirmation messages found in conversations.');
    return [];
  }

  console.log(`Found ${messages.length} potential booking messages. Analyzing...\n`);

  const bookings: FoundBooking[] = [];
  const seenLeads = new Set<string>();

  for (const msg of messages) {
    // Skip if we already found a booking for this lead
    if (seenLeads.has(msg.lead_id)) continue;

    const content = msg.content || '';

    // Must contain a time reference to be a real booking
    const hasTime = TIME_PATTERNS.some(p => p.test(content));
    const hasBookingKeyword = /locked in|booked|confirmed|you're in/i.test(content);

    if (!hasBookingKeyword || !hasTime) continue;

    // Parse date and time
    const parsedDate = parseBookingDate(content, msg.created_at);
    const parsedTime = parseBookingTime(content);

    if (!parsedTime) continue; // Must have at least a time

    // Get lead details
    const { data: lead } = await supabase
      .from('all_leads')
      .select('id, customer_name, phone, email')
      .eq('id', msg.lead_id)
      .maybeSingle();

    // Check if this lead already has a booking in whatsapp_sessions
    const { data: existingSession } = await supabase
      .from('whatsapp_sessions')
      .select('id, external_session_id, booking_date, booking_time')
      .eq('lead_id', msg.lead_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Skip if already backfilled
    if (existingSession?.booking_date) {
      console.log(
        `  ⏭️  ${lead?.customer_name || msg.lead_id} - already has booking (${existingSession.booking_date} ${existingSession.booking_time}), skipping`,
      );
      continue;
    }

    seenLeads.add(msg.lead_id);

    bookings.push({
      leadId: msg.lead_id,
      leadName: lead?.customer_name || null,
      leadPhone: lead?.phone || null,
      leadEmail: lead?.email || null,
      messageContent: content.substring(0, 200),
      messageDate: msg.created_at,
      parsedDate,
      parsedTime,
      whatsappSessionId: existingSession?.id || null,
      externalSessionId: existingSession?.external_session_id || null,
    });
  }

  return bookings;
}

async function applyBooking(booking: FoundBooking): Promise<boolean> {
  const now = new Date().toISOString();

  // 1. Update whatsapp_sessions
  if (booking.whatsappSessionId) {
    const { error: sessionError } = await supabase
      .from('whatsapp_sessions')
      .update({
        booking_date: booking.parsedDate,
        booking_time: booking.parsedTime,
        booking_status: 'Call Booked',
        booking_created_at: booking.messageDate,
      })
      .eq('id', booking.whatsappSessionId);

    if (sessionError) {
      console.error(`  ❌ Failed to update whatsapp_sessions: ${sessionError.message}`);
      return false;
    }
  }

  // 2. Update all_leads.unified_context
  const { data: lead } = await supabase
    .from('all_leads')
    .select('unified_context')
    .eq('id', booking.leadId)
    .maybeSingle();

  const existingCtx = lead?.unified_context || {};
  const updatedCtx = {
    ...existingCtx,
    whatsapp: {
      ...(existingCtx.whatsapp || {}),
      booking_status: 'Call Booked',
      booking_date: booking.parsedDate,
      booking_time: booking.parsedTime,
    },
  };

  const { error: leadError } = await supabase
    .from('all_leads')
    .update({
      unified_context: updatedCtx,
      last_interaction_at: now,
    })
    .eq('id', booking.leadId);

  if (leadError) {
    console.error(`  ❌ Failed to update all_leads: ${leadError.message}`);
    return false;
  }

  return true;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  BCON - WhatsApp Booking Backfill Script');
  console.log(`  Mode: ${DRY_RUN ? '🔍 DRY RUN (preview only)' : '⚡ APPLYING CHANGES'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const bookings = await findBookings();

  if (bookings.length === 0) {
    console.log('\n✅ No unrecovered bookings found. Everything is synced.');
    return;
  }

  console.log(`\n📋 Found ${bookings.length} bookings to recover:\n`);
  console.log('───────────────────────────────────────────────────────────────');

  for (let i = 0; i < bookings.length; i++) {
    const b = bookings[i];
    console.log(`  ${i + 1}. ${b.leadName || 'Unknown'}`);
    console.log(`     Phone: ${b.leadPhone || 'N/A'}`);
    console.log(`     Email: ${b.leadEmail || 'N/A'}`);
    console.log(`     Date:  ${b.parsedDate || '⚠️  COULD NOT PARSE'}`);
    console.log(`     Time:  ${b.parsedTime || '⚠️  COULD NOT PARSE'}`);
    console.log(`     Msg:   "${b.messageContent.substring(0, 100)}..."`);
    console.log(`     Sent:  ${b.messageDate}`);
    console.log(`     Session: ${b.whatsappSessionId ? '✅ found' : '⚠️  no whatsapp_session'}`);
    console.log('');
  }

  const unparsed = bookings.filter(b => !b.parsedDate || !b.parsedTime);
  if (unparsed.length > 0) {
    console.log(`⚠️  ${unparsed.length} booking(s) have unparsed date/time - review manually above.`);
  }

  if (DRY_RUN) {
    console.log('───────────────────────────────────────────────────────────────');
    console.log('🔍 DRY RUN - no changes made.');
    console.log('   Run with --apply to write these bookings to the database:');
    console.log('   npx tsx scripts/backfill-whatsapp-bookings.ts --apply');
    return;
  }

  // Apply
  console.log('───────────────────────────────────────────────────────────────');
  console.log('⚡ Applying bookings...\n');

  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (const b of bookings) {
    if (!b.parsedDate || !b.parsedTime) {
      console.log(`  ⏭️  ${b.leadName || b.leadId} - skipped (could not parse date/time)`);
      skipped++;
      continue;
    }

    if (!b.whatsappSessionId) {
      console.log(`  ⏭️  ${b.leadName || b.leadId} - skipped (no whatsapp_session to update)`);
      skipped++;
      continue;
    }

    const ok = await applyBooking(b);
    if (ok) {
      console.log(`  ✅ ${b.leadName || b.leadId} - ${b.parsedDate} at ${b.parsedTime}`);
      success++;
    } else {
      failed++;
    }
  }

  console.log('\n───────────────────────────────────────────────────────────────');
  console.log(`✅ Done. ${success} recovered, ${failed} failed, ${skipped} skipped.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
