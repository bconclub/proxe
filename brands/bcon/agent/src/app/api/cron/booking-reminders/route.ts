/**
 * Cron: Booking Reminders
 * POST /api/cron/booking-reminders
 *
 * Runs every 30 minutes via Vercel Cron.
 * Sends WhatsApp reminders for upcoming bookings:
 *   - 24h before: "Quick reminder — your call is tomorrow at [Time]"
 *   - 1h before:  "Your BCON call starts in 1 hour"
 *
 * Uses template messages (since these are outside the 24h customer window).
 *
 * Authorization: Bearer CRON_SECRET
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/services';
import { sendBookingReminder } from '@/lib/services/whatsappSender';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  // Verify cron secret (Vercel sends this automatically for cron jobs)
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: 'No Supabase client' }, { status: 500 });
  }

  const now = new Date();
  const results = { reminders_24h: 0, reminders_1h: 0, reminders_30m: 0, errors: 0 };
  const cronLog: string[] = [];

  // ─── 24-hour reminders ───────────────────────────────────────────────────
  // Find bookings between 20h and 28h from now (covers the 30-min cron window)
  const from24h = new Date(now.getTime() + 20 * 60 * 60 * 1000); // +20h
  const to24h = new Date(now.getTime() + 28 * 60 * 60 * 1000);   // +28h

  // Try with reminder tracking columns; fall back without them if columns don't exist
  let upcoming24h: any[] | null = null;
  const { data: data24h, error: err24h } = await supabase
    .from('whatsapp_sessions')
    .select('id, lead_id, customer_name, customer_phone, booking_date, booking_time, booking_meet_link, booking_title, reminder_24h_sent')
    .not('booking_date', 'is', null)
    .not('booking_time', 'is', null)
    .or('reminder_24h_sent.is.null,reminder_24h_sent.eq.false')
    .not('booking_status', 'eq', 'cancelled');

  if (err24h) {
    console.warn('[reminders] 24h query failed (columns may not exist), retrying without reminder filter:', err24h.message);
    const { data: fallback24h } = await supabase
      .from('whatsapp_sessions')
      .select('id, lead_id, customer_name, customer_phone, booking_date, booking_time, booking_meet_link, booking_title')
      .not('booking_date', 'is', null)
      .not('booking_time', 'is', null);
    upcoming24h = fallback24h;
  } else {
    upcoming24h = data24h;
  }

  if (upcoming24h) {
    for (const session of upcoming24h) {
      if (!session.booking_date || !session.booking_time || !session.customer_phone) continue;

      // Parse booking datetime in IST
      const bookingDateTime = new Date(`${session.booking_date}T${session.booking_time}+05:30`);
      if (bookingDateTime < from24h || bookingDateTime > to24h) continue;

      const name = session.customer_name || 'there';
      const title = session.booking_title || 'AI Lead Strategy Call';
      const meetLink = session.booking_meet_link || '';
      const timeDisplay = formatTimeDisplay(session.booking_time);

      console.log(`[reminders] Sending 24h reminder to ${name} (${session.customer_phone})`);

      const sent = await sendBookingReminder(
        session.customer_phone,
        name,
        title,
        timeDisplay,
        meetLink,
        '24h',
      );

      if (sent) {
        await supabase
          .from('whatsapp_sessions')
          .update({ reminder_24h_sent: true })
          .eq('id', session.id);
        results.reminders_24h++;
      } else {
        results.errors++;
      }
    }
  }

  // ─── 1-hour reminders ────────────────────────────────────────────────────
  // Find bookings between 30min and 90min from now
  const from1h = new Date(now.getTime() + 30 * 60 * 1000);   // +30min
  const to1h = new Date(now.getTime() + 90 * 60 * 1000);     // +90min

  let upcoming1h: any[] | null = null;
  const { data: data1h, error: err1h } = await supabase
    .from('whatsapp_sessions')
    .select('id, lead_id, customer_name, customer_phone, booking_date, booking_time, booking_meet_link, booking_title, reminder_1h_sent')
    .not('booking_date', 'is', null)
    .not('booking_time', 'is', null)
    .or('reminder_1h_sent.is.null,reminder_1h_sent.eq.false')
    .not('booking_status', 'eq', 'cancelled');

  cronLog.push(`1h query: ${data1h?.length || 0} results, err=${err1h?.message || 'none'}`);
  if (err1h) {
    console.warn('[reminders] 1h query failed:', err1h.message);
    const { data: fallback1h } = await supabase
      .from('whatsapp_sessions')
      .select('id, lead_id, customer_name, customer_phone, booking_date, booking_time, booking_meet_link, booking_title')
      .not('booking_date', 'is', null)
      .not('booking_time', 'is', null);
    upcoming1h = fallback1h;
    cronLog.push(`1h fallback: ${fallback1h?.length || 0} results`);
  } else {
    upcoming1h = data1h;
  }

  // Check if test session is in the 1h results
  const testIn1h = upcoming1h?.find((s: any) => s.customer_phone === '919353253817' || s.customer_phone === '+919353253817');
  cronLog.push(`1h test session found: ${!!testIn1h}, phone=${testIn1h?.customer_phone || 'N/A'}, date=${testIn1h?.booking_date || 'N/A'}, time=${testIn1h?.booking_time || 'N/A'}`);

  if (upcoming1h) {
    for (const session of upcoming1h) {
      if (!session.booking_date || !session.booking_time || !session.customer_phone) continue;

      const bookingDateTime = new Date(`${session.booking_date}T${session.booking_time}+05:30`);
      if (bookingDateTime < from1h || bookingDateTime > to1h) {
        if (session.customer_phone === '919353253817' || session.customer_phone === '+919353253817') {
          cronLog.push(`1h SKIP test session: booking=${bookingDateTime.toISOString()} window=${from1h.toISOString()}-${to1h.toISOString()}`);
        }
        continue;
      }

      const name = session.customer_name || 'there';
      const title = session.booking_title || 'AI Lead Strategy Call';
      const meetLink = session.booking_meet_link || '';

      console.log(`[reminders] Sending 1h reminder to ${name} (${session.customer_phone})`);

      const sent = await sendBookingReminder(
        session.customer_phone,
        name,
        title,
        formatTimeDisplay(session.booking_time),
        meetLink,
        '1h',
      );

      if (sent) {
        await supabase
          .from('whatsapp_sessions')
          .update({ reminder_1h_sent: true })
          .eq('id', session.id);
        results.reminders_1h++;
      } else {
        results.errors++;
      }
    }
  }

  // ─── 30-minute reminders ──────────────────────────────────────────────
  // Find bookings between 15min and 45min from now
  const from30m = new Date(now.getTime() + 15 * 60 * 1000);   // +15min
  const to30m = new Date(now.getTime() + 45 * 60 * 1000);     // +45min

  // Skip reminder_30m_sent column (doesn't exist yet) — just query all active bookings
  let upcoming30m: any[] | null = null;
  const { data: data30m, error: err30m } = await supabase
    .from('whatsapp_sessions')
    .select('id, lead_id, customer_name, customer_phone, booking_date, booking_time, booking_meet_link, booking_title')
    .not('booking_date', 'is', null)
    .not('booking_time', 'is', null)
    .not('booking_status', 'eq', 'cancelled');

  cronLog.push(`30m query: ${data30m?.length || 0} results, err=${err30m?.message || 'none'}`);

  if (err30m) {
    console.warn('[reminders] 30m query failed:', err30m.message);
  }
  upcoming30m = data30m;

  if (upcoming30m) {
    for (const session of upcoming30m) {
      if (!session.booking_date || !session.booking_time || !session.customer_phone) continue;

      const bookingDateTime = new Date(`${session.booking_date}T${session.booking_time}+05:30`);
      if (bookingDateTime < from30m || bookingDateTime > to30m) {
        // Log near-misses for the test session
        if (session.customer_phone === '919353253817' || session.customer_phone === '+919353253817') {
          cronLog.push(`30m SKIP test session: booking=${bookingDateTime.toISOString()} window=${from30m.toISOString()}-${to30m.toISOString()}`);
        }
        continue;
      }

      const name = session.customer_name || 'there';
      const title = session.booking_title || 'AI Lead Strategy Call';
      const meetLink = session.booking_meet_link || '';

      console.log(`[reminders] Sending 30m reminder to ${name} (${session.customer_phone})`);

      const sent = await sendBookingReminder(
        session.customer_phone,
        name,
        title,
        formatTimeDisplay(session.booking_time),
        meetLink,
        '30m',
      );

      if (sent) {
        await supabase
          .from('whatsapp_sessions')
          .update({ reminder_30m_sent: true })
          .eq('id', session.id);
        results.reminders_30m++;
      } else {
        results.errors++;
      }
    }
  }

  console.log('[reminders] Done:', results);

  // Debug: include query diagnostics when ?debug=1
  const debug = req.nextUrl.searchParams.get('debug') === '1';
  const debugInfo: any = {};
  if (debug) {
    // Check what the 24h query returns
    const { data: dbg24h, error: dbgErr24h } = await supabase
      .from('whatsapp_sessions')
      .select('id, customer_name, customer_phone, booking_date, booking_time, booking_status, reminder_24h_sent, reminder_1h_sent')
      .not('booking_date', 'is', null)
      .not('booking_time', 'is', null)
      .limit(5);
    debugInfo.sessionsWithBookings = dbg24h?.length || 0;
    debugInfo.queryError = dbgErr24h?.message || null;
    debugInfo.sampleSessions = dbg24h?.map(s => ({
      name: s.customer_name,
      phone: s.customer_phone,
      date: s.booking_date,
      time: s.booking_time,
      status: s.booking_status,
      r24h: s.reminder_24h_sent,
      r1h: s.reminder_1h_sent,
    }));
    debugInfo.windows = {
      now: now.toISOString(),
      from24h: from24h.toISOString(),
      to24h: to24h.toISOString(),
      from1h: from1h.toISOString(),
      to1h: to1h.toISOString(),
      from30m: from30m.toISOString(),
      to30m: to30m.toISOString(),
    };
    // Check our specific test session
    const { data: testSession, error: testErr } = await supabase
      .from('whatsapp_sessions')
      .select('id, customer_name, customer_phone, booking_date, booking_time, booking_status, reminder_24h_sent, reminder_1h_sent')
      .eq('id', '2b6f56d7-69f3-453b-9f86-6e32b66c0796')
      .maybeSingle();
    debugInfo.testSession = testSession || testErr?.message || 'not found';
    // Count total sessions matching 1h query
    const { data: all1h, error: all1hErr } = await supabase
      .from('whatsapp_sessions')
      .select('id, customer_name, customer_phone, booking_date, booking_time, booking_status')
      .not('booking_date', 'is', null)
      .not('booking_time', 'is', null)
      .or('reminder_1h_sent.is.null,reminder_1h_sent.eq.false')
      .not('booking_status', 'eq', 'cancelled');
    debugInfo.total1hMatches = all1h?.length || 0;
    debugInfo.all1hErr = all1hErr?.message || null;
    // Check which are in window
    const inWindow = (all1h || []).filter(s => {
      const dt = new Date(`${s.booking_date}T${s.booking_time}+05:30`);
      return dt >= from1h && dt <= to1h;
    });
    debugInfo.inWindowCount = inWindow.length;
    debugInfo.inWindowSessions = inWindow.map(s => ({
      name: s.customer_name,
      phone: s.customer_phone,
      date: s.booking_date,
      time: s.booking_time,
    }));
  }

  return NextResponse.json({
    success: true,
    ...results,
    timestamp: now.toISOString(),
    cronLog,
    ...(debug ? { debug: debugInfo } : {}),
  });
}

/** Convert "18:00" to "6:00 PM" */
function formatTimeDisplay(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${(m || 0).toString().padStart(2, '0')} ${period}`;
}
