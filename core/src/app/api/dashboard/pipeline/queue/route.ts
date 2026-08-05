import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'
import { BRAND_ID } from '@/configs'

export const dynamic = 'force-dynamic'

/**
 * GET /api/dashboard/pipeline/queue?owner=me|all|<userId>
 *
 * The human pipeline. Not a funnel report - a single list of things waiting on
 * a person, most-owed first.
 *
 * The work is of two kinds and they belong in ONE list, because a salesperson
 * does not think in buckets, they think "what do I do next":
 *
 *   followup     a call-back this person promised, from
 *                activities.next_followup_date. Overdue ones lead the list -
 *                a promise you have already broken outranks everything.
 *   ask          a booking whose date has passed with nobody saying whether it
 *                happened. The system refuses to guess: a date passing is not
 *                evidence anyone turned up, which is why Demo Done reads zero
 *                until someone answers.
 *   booking      booked today or within the week.
 *   rnr          rang, no reply, untouched for 2+ days and with no follow-up
 *                already promised.
 *
 * Bookings live in unified_context, NOT in a column - this brand's all_leads
 * has no booking_date at all, and they are spread across whatsapp, voice and
 * web shapes, so all are read via JSON-path projection rather than hauling the
 * whole context object across the wire for every lead.
 */

const RNR_STALE_DAYS = 2
const UPCOMING_DAYS = 7
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

/** IST calendar day for an instant, as YYYY-MM-DD. */
function istDay(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)
}

export type QueueKind = 'followup' | 'ask' | 'booking' | 'rnr'

export interface QueueCard {
  id: string
  name: string
  phone: string | null
  stage: string
  owner_id: string | null
  created_at: string | null
  booking_date: string | null
  booking_time: string | null
  followup_at: string | null
  followup_note: string | null
  followup_activity_id: string | null
  kind: QueueKind
  /** Which counter this row feeds, and which filter chip shows it. */
  bucket: string
  /** Lower sorts first. Band first, then how long it has been waiting. */
  urgency: number
}

// Bands. The gap between them is wide enough that nothing inside a band can
// ever outrank the band above it.
const BAND = {
  followupOverdue: 0,
  ask: 1,
  followupToday: 2,
  bookingToday: 3,
  followupUpcoming: 4,
  bookingUpcoming: 5,
  rnr: 6,
} as const

const band = (b: number, tiebreak: number) => b * 1e12 + tiebreak

/** Booking date+time out of the projected JSON paths. */
function readBooking(row: any): { date: string | null; time: string | null } {
  const webB = row.web_b || {}
  const candidates: Array<[any, any]> = [
    [row.web_d, row.web_t],
    [webB.date || webB.booking_date, webB.time || webB.booking_time],
    [row.wa_d, row.wa_t],
    [row.vo_d, row.vo_t],
    [row.so_d, row.so_t],
  ]
  for (const [d, t] of candidates) {
    if (d) return { date: String(d).slice(0, 10), time: t ? String(t) : null }
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

    const now = new Date()
    const today = istDay(now)
    const horizon = istDay(new Date(now.getTime() + UPCOMING_DAYS * 86_400_000))
    const staleBefore = new Date(now.getTime() - RNR_STALE_DAYS * 86_400_000).toISOString()
    const nowMs = now.getTime()

    // ── 1. Follow-ups. One indexed read (partial index covers exactly this
    //       predicate), then one keyed fetch of the leads behind them. No scan.
    const { data: fRows } = await supabase
      .from('activities')
      .select('id, lead_id, note, next_followup_date')
      .not('next_followup_date', 'is', null)
      .order('next_followup_date', { ascending: true })
      .limit(500)

    const followupRows: any[] = fRows || []
    const followupLeadIds = Array.from(new Set(followupRows.map((r) => r.lead_id).filter(Boolean)))
    const leadsById = new Map<string, any>()
    if (followupLeadIds.length) {
      const { data: fLeads } = await supabase
        .from('all_leads')
        .select('id, customer_name, phone, lead_stage, owner_id, created_at')
        .in('id', followupLeadIds)
      for (const l of fLeads || []) leadsById.set(l.id, l)
    }

    const attention: QueueCard[] = []
    const counts = {
      followupsOverdue: 0,
      followupsToday: 0,
      followupsUpcoming: 0,
      needsAnswer: 0,
      today: 0,
      upcoming: 0,
      rnr: 0,
      unassigned: 0,
    }
    // Leads that already have a promised call-back never appear as RNR too -
    // the promise IS the answer to "what about this one".
    const hasOpenFollowup = new Set<string>()

    for (const row of followupRows) {
      const lead = leadsById.get(row.lead_id)
      if (!lead) continue
      hasOpenFollowup.add(lead.id)
      // Unowned follow-ups stay visible to everyone - nobody to filter them to.
      const mine = ownerId === null || lead.owner_id === ownerId || !lead.owner_id
      if (!mine) continue

      const dueMs = Date.parse(row.next_followup_date)
      const dueDay = isFinite(dueMs) ? istDay(new Date(dueMs)) : null
      const overdue = isFinite(dueMs) && dueMs < nowMs
      const isToday = dueDay === today

      let b: number
      let bucket: string
      if (overdue && !isToday) { b = BAND.followupOverdue; bucket = 'followupsOverdue'; counts.followupsOverdue++ }
      else if (isToday) { b = BAND.followupToday; bucket = 'followupsToday'; counts.followupsToday++ }
      else { b = BAND.followupUpcoming; bucket = 'followupsUpcoming'; counts.followupsUpcoming++ }

      attention.push({
        id: lead.id,
        name: lead.customer_name || 'Unknown',
        phone: lead.phone || null,
        stage: lead.lead_stage || 'New',
        owner_id: lead.owner_id || null,
        created_at: lead.created_at || null,
        booking_date: null,
        booking_time: null,
        followup_at: row.next_followup_date,
        followup_note: row.note || null,
        followup_activity_id: row.id,
        kind: 'followup',
        bucket,
        // Soonest-promised first inside every band, so the oldest broken
        // promise is the very first row on the page.
        urgency: band(b, isFinite(dueMs) ? dueMs : nowMs),
      })
    }

    // ── 2. Bookings + RNR. Still a scan, but projected down to scalars: the
    //       old version shipped every lead's entire unified_context.
    const brandOutcome = `outcome:unified_context->${BRAND_ID}->booking_outcome`
    const SELECT = [
      'id', 'customer_name', 'phone', 'lead_stage', 'owner_id', 'created_at', 'last_interaction_at',
      'wa_d:unified_context->whatsapp->>booking_date',
      'wa_t:unified_context->whatsapp->>booking_time',
      'vo_d:unified_context->voice->>booking_date',
      'vo_t:unified_context->voice->>booking_time',
      'web_d:unified_context->web->>booking_date',
      'web_t:unified_context->web->>booking_time',
      'web_b:unified_context->web->booking',
      'so_d:unified_context->social->>booking_date',
      'so_t:unified_context->social->>booking_time',
      brandOutcome,
    ].join(', ')

    const rows: any[] = []
    let cursor: string | null = null
    for (let i = 0; i < 20; i++) {
      let q = supabase.from('all_leads').select(SELECT).order('id', { ascending: true }).limit(1000)
      if (cursor) q = q.gt('id', cursor)
      const { data, error } = await q
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!data || data.length === 0) break
      rows.push(...data)
      cursor = data[data.length - 1]?.id ?? null
      if (data.length < 1000 || !cursor) break
    }

    for (const lead of rows) {
      const mine = ownerId === null || lead.owner_id === ownerId
      const { date, time } = readBooking(lead)
      const answered = lead.outcome
      // An answer settles only the booking it was given for - book again and
      // the question comes back.
      const settled = answered && (!answered.for_booking_date || answered.for_booking_date === date)

      const base = {
        id: lead.id,
        name: lead.customer_name || 'Unknown',
        phone: lead.phone || null,
        stage: lead.lead_stage || 'New',
        owner_id: lead.owner_id || null,
        created_at: lead.created_at || null,
        booking_date: date,
        booking_time: time,
        followup_at: null,
        followup_note: null,
        followup_activity_id: null,
      }

      if (date && !settled && date < today) {
        const unowned = !lead.owner_id
        if (!unowned && !mine) continue
        if (unowned) counts.unassigned++
        else counts.needsAnswer++
        attention.push({
          ...base,
          kind: 'ask',
          bucket: unowned ? 'unassigned' : 'needsAnswer',
          // Oldest unanswered booking first: the longest anyone has been left
          // wondering.
          urgency: band(BAND.ask, Date.parse(`${date}T00:00:00Z`) || 0),
        })
        continue
      }
      if (!mine) continue

      if (date === today) {
        counts.today++
        attention.push({
          ...base,
          kind: 'booking',
          bucket: 'today',
          urgency: band(BAND.bookingToday, Date.parse(`${date}T${(time || '00:00').slice(0, 5)}:00Z`) || 0),
        })
        continue
      }
      if (date && date > today && date <= horizon) {
        counts.upcoming++
        attention.push({
          ...base,
          kind: 'booking',
          bucket: 'upcoming',
          urgency: band(BAND.bookingUpcoming, Date.parse(`${date}T00:00:00Z`) || 0),
        })
        continue
      }
      // RNR: the orchestrator parks these as 'In Sequence' rather than 'R&R',
      // so matching only 'R&R' found nothing. Both, minus anyone who already
      // has a call-back promised.
      if (
        (lead.lead_stage === 'R&R' || lead.lead_stage === 'In Sequence') &&
        !hasOpenFollowup.has(lead.id) &&
        (!lead.last_interaction_at || lead.last_interaction_at < staleBefore)
      ) {
        counts.rnr++
        attention.push({
          ...base,
          kind: 'rnr',
          bucket: 'rnr',
          urgency: band(BAND.rnr, Date.parse(lead.last_interaction_at || lead.created_at || '') || 0),
        })
      }
    }

    attention.sort((a, b) => a.urgency - b.urgency)

    return NextResponse.json({
      owner: ownerParam,
      counts,
      total: attention.length,
      // Capped: past a couple of hundred rows this stops being a queue and
      // starts being a backlog report. The counts stay exact.
      attention: attention.slice(0, 200),
    })
  } catch (err: any) {
    console.error('[pipeline/queue] failed:', err?.message || err)
    return NextResponse.json({ error: err?.message || 'unknown' }, { status: 500 })
  }
}
