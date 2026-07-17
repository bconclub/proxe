/**
 * /api/dashboard/reconcile-bookings  (POST, Lokazen only)
 *
 * One-time backfill for bookings that were AGREED in chat but never registered
 * (the Google-Calendar-404 + soft-callback era). Scans recent Lokazen leads with
 * no booking on record, re-reads their conversation, and if a slot + date was
 * clearly agreed:
 *   - future slot  -> registers the booking (shows in Upcoming; the calendar sync
 *                     then creates the event) + a Slack booking alert.
 *   - past slot    -> a Slack "missed booking, please call" alert (never a fake
 *                     upcoming booking for a time that already passed).
 *
 * Conservative: only acts when BOTH an online slot (3/4/5 PM) and a concrete date
 * are readable AND the conversation is actually a booking context. Auth: x-api-key
 * must equal INBOUND_API_KEY (same secret the inbound webhook uses).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/services'
import { storeBooking, isAllowedBookingTime } from '@/lib/services/bookingManager'
import { notifySlackBooking, notifySlackLead } from '@/lib/services/slackNotifier'
import { BRAND_ID, getBrandConfig } from '@/configs'

export const dynamic = 'force-dynamic'

// online slots only: 3/4/5 PM -> 15/16/17:00
function readTime(s: string): string | null {
  const m = s.match(/\b([3-5])\s*(?::\s*0?0)?\s*p\.?\s*m\.?/i) || s.match(/\b(15|16|17)\s*:\s*00\b/)
  if (!m) return null
  const h = Number(m[1])
  return `${h >= 15 ? h : h + 12}:00`
}

// Resolve today/tomorrow/weekday/ISO relative to a reference instant (when the
// slot was agreed), in IST. Old chats that said "today" must NOT resolve to
// the reconciliation day.
function readDate(s: string, refISO: string): string | null {
  const iso = s.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/)
  if (iso) return iso[0]
  const [ry, rm, rd] = refISO.split('-').map(Number)
  const baseUTC = Date.UTC(ry, rm - 1, rd, 12, 0, 0)
  const isoAt = (o: number) => new Date(baseUTC + o * 86400000).toISOString().slice(0, 10)
  const dowAt = (o: number) => new Date(baseUTC + o * 86400000).getUTCDay()
  const low = s.toLowerCase()
  if (/\btomorrow\b/.test(low)) { let o = 1; while (dowAt(o) === 0) o++; return isoAt(o) }
  if (/\btoday\b/.test(low)) return isoAt(0)
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  for (let i = 1; i < 7; i++) {
    if (new RegExp(`\\b${days[i]}\\b`).test(low)) {
      for (let o = 1; o <= 7; o++) if (dowAt(o) === i) return isoAt(o)
    }
  }
  return null
}

export async function POST(request: NextRequest) {
  if (BRAND_ID !== 'lokazen') {
    return NextResponse.json({ error: 'Lokazen only' }, { status: 400 })
  }
  const key = request.headers.get('x-api-key')?.trim()
  if (!key || key !== process.env.INBOUND_API_KEY?.trim()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabase = getServiceClient()
  if (!supabase) return NextResponse.json({ error: 'No DB' }, { status: 500 })

  const dryRun = request.nextUrl.searchParams.get('dry') === '1'
  const days = Math.min(Number(request.nextUrl.searchParams.get('days') || 10), 30)
  const sinceISO = new Date(Date.now() - days * 86400000).toISOString()

  // Candidate leads: Lokazen, recently active, with NO booking on record.
  const { data: leads, error } = await supabase
    .from('all_leads')
    .select('id, customer_name, phone, customer_phone_normalized, email, unified_context, last_interaction_at')
    .gte('last_interaction_at', sinceISO)
    .order('last_interaction_at', { ascending: false })
    .limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const hasBooking = (uc: any) =>
    !!(uc?.whatsapp?.booking_date || uc?.web?.booking_date || uc?.voice?.booking_date)

  const registered: any[] = []
  const missedPast: any[] = []
  let scanned = 0

  for (const lead of leads || []) {
    const uc = lead.unified_context || {}
    if (hasBooking(uc)) continue
    const phone = lead.customer_phone_normalized || lead.phone
    if (!phone) continue
    scanned++

    // Pull the lead's recent conversation.
    const { data: convs } = await supabase
      .from('conversations')
      .select('content, sender, created_at')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false })
      .limit(20)
    if (!convs || !convs.length) continue

    const corpus = convs.map((c) => String(c.content || ''))
    const blob = corpus.join(' \n ')
    // Must actually be a booking context, else a stray "3 pm" would fire.
    if (!/\b(book|call you|call ?back|callback|what time|slot|team will|3 pm|4 pm|5 pm)\b/i.test(blob)) continue

    let time24: string | null = null
    for (const s of corpus) { const t = readTime(s); if (t) { time24 = t; break } }
    if (!time24 || !isAllowedBookingTime(time24, 'online')) continue

    // Reference = when the booking was agreed (latest message), IST.
    const refISO = new Date(convs[0].created_at || Date.now()).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    let dateISO: string | null = null
    for (const s of corpus) { const d = readDate(s, refISO); if (d) { dateISO = d; break } }
    if (!dateISO) continue

    const [dy, dm, dd] = dateISO.split('-').map(Number)
    if (new Date(Date.UTC(dy, dm - 1, dd, 12)).getUTCDay() === 0) continue // Sunday closed

    const hour = Number(time24.split(':')[0])
    const timeDisplay = `${((hour + 11) % 12) + 1}:00 PM`
    const bookingAtMs = new Date(`${dateISO}T${time24}:00+05:30`).getTime()
    const name = lead.customer_name || 'Lead'
    const isFuture = bookingAtMs > Date.now()

    if (dryRun) {
      ;(isFuture ? registered : missedPast).push({ id: lead.id, name, dateISO, timeDisplay, future: isFuture })
      continue
    }

    if (isFuture) {
      try {
        await storeBooking(
          `wa_meta_${phone}`,
          { date: dateISO, time: timeDisplay, status: 'Call Booked', name, phone, email: lead.email || undefined, sessionType: 'online', title: `Callback - ${name}` },
          'whatsapp',
          supabase,
        )
        await notifySlackBooking({
          brandLabel: getBrandConfig()?.name || 'Lokazen', name, phone, email: lead.email || null,
          leadType: String(uc?.lokazen?.user_type || '') || null,
          dateTime: `${dateISO} · ${timeDisplay}`,
          title: 'Reconciled callback (backfilled from chat)', channel: 'whatsapp', summary: null,
        })
        registered.push({ id: lead.id, name, dateISO, timeDisplay })
      } catch (e: any) {
        console.error('[reconcile] persist failed', lead.id, e?.message || e)
      }
    } else {
      // Past-time agreement — the call slot already passed. Flag the team to call.
      try {
        await notifySlackLead({
          brandLabel: getBrandConfig()?.name || 'Lokazen', title: 'Missed booking — please call',
          name, phone, leadType: String(uc?.lokazen?.user_type || '') || null,
          detail: `Agreed a callback for ${timeDisplay} on ${dateISO} but it was never registered and the time has passed. Please call to reschedule.`,
          footer: 'reconciled · missed',
        })
        missedPast.push({ id: lead.id, name, dateISO, timeDisplay })
      } catch (e: any) {
        console.error('[reconcile] missed notify failed', lead.id, e?.message || e)
      }
    }
  }

  return NextResponse.json({
    ok: true, dryRun, days, scanned,
    registered_count: registered.length, missed_past_count: missedPast.length,
    registered, missedPast,
  })
}
