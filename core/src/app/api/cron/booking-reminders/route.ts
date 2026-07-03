/**
 * Cron: Booking Reminders
 * GET /api/cron/booking-reminders
 *
 * Sends WhatsApp reminders for upcoming bookings:
 *   - 24h before: "Quick reminder - your call is tomorrow at [Time]"
 *   - 1h before:  "Your BCON call starts in 1 hour"
 *   - 30m before: "Your BCON call starts in 30 minutes"
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

  // ─── Single query: all active bookings ─────────────────────────────────
  const { data: allBookings, error: queryErr } = await supabase
    .from('whatsapp_sessions')
    .select('id, lead_id, customer_name, customer_phone, booking_date, booking_time, booking_meet_link, booking_title, booking_status, reminder_24h_sent, reminder_1h_sent')
    .not('booking_date', 'is', null)
    .not('booking_time', 'is', null)
    .not('booking_status', 'eq', 'cancelled');

  cronLog.push(`query: ${allBookings?.length || 0} bookings, err=${queryErr?.message || 'none'}`);

  if (queryErr || !allBookings) {
    return NextResponse.json({
      success: false,
      error: queryErr?.message || 'No data',
      cronLog,
      timestamp: now.toISOString(),
    });
  }

  // Time windows
  const from24h = new Date(now.getTime() + 20 * 60 * 60 * 1000);
  const to24h   = new Date(now.getTime() + 28 * 60 * 60 * 1000);
  const from1h  = new Date(now.getTime() + 30 * 60 * 1000);
  const to1h    = new Date(now.getTime() + 90 * 60 * 1000);
  const from30m = new Date(now.getTime() + 15 * 60 * 1000);
  const to30m   = new Date(now.getTime() + 45 * 60 * 1000);

  for (const session of allBookings) {
    if (!session.booking_date || !session.booking_time || !session.customer_phone) continue;

    const bookingDateTime = new Date(`${session.booking_date}T${session.booking_time}+05:30`);
    const name = session.customer_name || 'there';
    const title = session.booking_title || 'AI Lead Strategy Call';
    const meetLink = session.booking_meet_link || '';
    const timeDisplay = formatTimeDisplay(session.booking_time);

    // 24h reminder
    if (bookingDateTime >= from24h && bookingDateTime <= to24h && !session.reminder_24h_sent) {
      cronLog.push(`24h: sending to ${name} (${session.customer_phone})`);
      const sent = await sendBookingReminder(session.customer_phone, name, title, timeDisplay, meetLink, '24h');
      if (sent) {
        await supabase.from('whatsapp_sessions').update({ reminder_24h_sent: true }).eq('id', session.id);
        results.reminders_24h++;
      } else {
        results.errors++;
        cronLog.push(`24h: FAILED for ${session.customer_phone}`);
      }
    }

    // 1h reminder
    if (bookingDateTime >= from1h && bookingDateTime <= to1h && !session.reminder_1h_sent) {
      cronLog.push(`1h: sending to ${name} (${session.customer_phone})`);
      const sent = await sendBookingReminder(session.customer_phone, name, title, timeDisplay, meetLink, '1h');
      if (sent) {
        await supabase.from('whatsapp_sessions').update({ reminder_1h_sent: true }).eq('id', session.id);
        results.reminders_1h++;
      } else {
        results.errors++;
        cronLog.push(`1h: FAILED for ${session.customer_phone}`);
      }
    }

    // 30m reminder
    if (bookingDateTime >= from30m && bookingDateTime <= to30m) {
      cronLog.push(`30m: sending to ${name} (${session.customer_phone})`);
      const sent = await sendBookingReminder(session.customer_phone, name, title, timeDisplay, meetLink, '30m');
      if (sent) {
        results.reminders_30m++;
      } else {
        results.errors++;
        cronLog.push(`30m: FAILED for ${session.customer_phone}`);
      }
    }
  }

  console.log('[reminders] Done:', results);

  return NextResponse.json({
    success: true,
    ...results,
    timestamp: now.toISOString(),
    cronLog,
    windows: {
      now: now.toISOString(),
      from24h: from24h.toISOString(),
      to24h: to24h.toISOString(),
      from1h: from1h.toISOString(),
      to1h: to1h.toISOString(),
      from30m: from30m.toISOString(),
      to30m: to30m.toISOString(),
    },
  });
}

/** Convert "18:00" to "6:00 PM" */
function formatTimeDisplay(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${(m || 0).toString().padStart(2, '0')} ${period}`;
}
