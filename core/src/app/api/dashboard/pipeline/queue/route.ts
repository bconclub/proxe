import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'
import { BRAND_ID } from '@/configs'

export const dynamic = 'force-dynamic'

/**
 * GET /api/dashboard/pipeline/queue?owner=me|all|<userId>
 *
 * The work queue behind the pipeline page. Not a report - a list of things
 * waiting on a human, newest obligation first:
 *
 *   needsAnswer  booking date has passed and nobody has said whether it
 *                happened. 149 of these on windchasers today, which is why
 *                Demo Done and No Show read 0.
 *   today        booked for today, with the time
 *   upcoming     booked in the next 7 days
 *   rnr          rang, no reply and untouched for 2+ days
 *   unassigned   past bookings with NO owner - nobody to ask, so they sit in
 *                a shared pool anyone can claim
 *
 * Bookings live in unified_context, NOT in a column: this brand's all_leads
 * has no booking_date at all, and web_sessions carries zero. They are spread
 * across whatsapp.booking_date (96), voice.booking_date (67) and
 * web.booking.date (30), so all three shapes are read.
 */

const RNR_STALE_DAYS = 2
const UPCOMING_DAYS = 7
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

/** IST calendar day for an instant, as YYYY-MM-DD. */
function istDay(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)
}

/** Booking date+time from any of the shapes leads actually use. */
function readBooking(lead: any): { date: string | null; time: string | null } {
  const uc = lead?.unified_context || {}
  for (const ch of ['web', 'whatsapp', 'voice', 'social']) {
    const blk = uc?.[ch] || {}
    const nested = blk.booking || {}
    const date = blk.booking_date || nested.date || nested.booking_date || null
    const time = blk.booking_time || nested.time || nested.booking_time || null
    if (date) return { date: String(date).slice(0, 10), time: time ? String(time) : null }
  }
  return { date: null, time: null }
}

export async function GET(request: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ownerParam = request.nextUrl.searchParams.get('owner') || 'me'
    const ownerId = ownerParam === 'me' ? user.id : ownerParam === 'all' ? null : ownerParam

    const supabase: any = getServiceClient() || authClient

    // Keyset-paged, narrow select. unified_context has to come along because
    // the booking lives inside it - there is no column to read instead.
    const rows: any[] = []
    let cursor: string | null = null
    for (let i = 0; i < 20; i++) {
      let q = supabase
        .from('all_leads')
        .select('id, customer_name, phone, lead_stage, owner_id, last_interaction_at, unified_context')
        .order('id', { ascending: true })
        .limit(1000)
      if (cursor) q = q.gt('id', cursor)
      const { data, error } = await q
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!data || data.length === 0) break
      rows.push(...data)
      cursor = data[data.length - 1]?.id ?? null
      if (data.length < 1000 || !cursor) break
    }

    const now = new Date()
    const today = istDay(now)
    const horizon = istDay(new Date(now.getTime() + UPCOMING_DAYS * 86_400_000))
    const staleBefore = new Date(now.getTime() - RNR_STALE_DAYS * 86_400_000).toISOString()

    const needsAnswer: any[] = []
    const todayList: any[] = []
    const upcoming: any[] = []
    const rnr: any[] = []
    const unassigned: any[] = []

    for (const lead of rows) {
      const wc = lead.unified_context?.[BRAND_ID] || {}
      const mine = ownerId === null || lead.owner_id === ownerId
      const { date, time } = readBooking(lead)
      const answered = wc.booking_outcome
      // An answer only settles the booking it was given for - book again and
      // the question comes back.
      const settled =
        answered && (!answered.for_booking_date || answered.for_booking_date === date)

      const card = {
        id: lead.id,
        name: lead.customer_name || 'Unknown',
        phone: lead.phone || null,
        stage: lead.lead_stage || 'New',
        owner_id: lead.owner_id || null,
        booking_date: date,
        booking_time: time,
      }

      if (date && !settled && date < today) {
        if (!lead.owner_id) unassigned.push(card)
        else if (mine) needsAnswer.push(card)
        continue
      }
      if (!mine) continue
      if (date === today) { todayList.push(card); continue }
      if (date && date > today && date <= horizon) { upcoming.push(card); continue }
      if (
        lead.lead_stage === 'R&R' &&
        (!lead.last_interaction_at || lead.last_interaction_at < staleBefore)
      ) {
        rnr.push(card)
      }
    }

    // Oldest obligation first - the thing you have kept someone waiting on
    // longest is the thing to do next.
    needsAnswer.sort((a, b) => String(a.booking_date).localeCompare(String(b.booking_date)))
    unassigned.sort((a, b) => String(a.booking_date).localeCompare(String(b.booking_date)))
    todayList.sort((a, b) => String(a.booking_time || '').localeCompare(String(b.booking_time || '')))
    upcoming.sort((a, b) => String(a.booking_date).localeCompare(String(b.booking_date)))

    return NextResponse.json({
      owner: ownerParam,
      counts: {
        needsAnswer: needsAnswer.length,
        today: todayList.length,
        upcoming: upcoming.length,
        rnr: rnr.length,
        unassigned: unassigned.length,
      },
      needsAnswer: needsAnswer.slice(0, 100),
      today: todayList.slice(0, 50),
      upcoming: upcoming.slice(0, 50),
      rnr: rnr.slice(0, 50),
      unassigned: unassigned.slice(0, 50),
    })
  } catch (err: any) {
    console.error('[pipeline/queue] failed:', err?.message || err)
    return NextResponse.json({ error: err?.message || 'unknown' }, { status: 500 })
  }
}
