import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/services'
import { sendTelegramMessage, telegramConfigured, tgEscape, tgLink } from '@/lib/services/telegram'
import { BRAND_ID, getBrandConfig } from '@/configs'
import { getOfflineEvent } from '@/configs/offline-events'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Scheduled Telegram briefs.
 *
 * GET /api/cron/telegram-brief?kind=morning|pulse|evening
 *
 *   morning - what happened yesterday, and what today is committed to
 *   pulse   - what changed since the previous pulse boundary (hourly, working day)
 *   evening - the day so far, as a close-of-play summary
 *
 * Everything is computed in IST because that is the working day being reported
 * on; Vercel crons fire in UTC, so the schedules in vercel.json are the
 * IST-minus-5:30 conversions.
 *
 * Soft-gated on telegramConfigured(): a deployment without a bot token simply
 * reports skipped, so this route is harmless in every brand that has not opted
 * in. No brand check beyond that - the env IS the opt-in.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '')

/** Wall-clock IST parts for an instant. */
function istParts(d: Date) {
  const ist = new Date(d.getTime() + IST_OFFSET_MS)
  return {
    y: ist.getUTCFullYear(),
    m: ist.getUTCMonth(),
    d: ist.getUTCDate(),
    hour: ist.getUTCHours(),
    minute: ist.getUTCMinutes(),
  }
}

/** UTC instant for a given IST wall-clock day boundary. */
function istMidnightUtc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d, 0, 0, 0) - IST_OFFSET_MS)
}

function istDateLabel(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(d)
}

function istTimeLabel(d: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d)
}

/** "wings-of-freedom" style key or a channel name into something readable. */
function sourceLabel(lead: any): string {
  return String(lead.first_touchpoint || lead.last_touchpoint || 'direct').replace(/_/g, ' ')
}

// leadLine() and sourceBreakdown() lived here to print a lead per row. The
// brief now reports shape rather than a roster - forty names on a phone is
// unreadable and says nothing you can act on - so both are gone. Individual
// arrivals go to the group feed (cron/telegram-feed), one message each.

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const kind = (request.nextUrl.searchParams.get('kind') || 'pulse').toLowerCase()
  if (!['morning', 'pulse', 'evening'].includes(kind)) {
    return NextResponse.json({ error: `Unknown kind: ${kind}` }, { status: 400 })
  }
  // dry=1 returns the rendered brief without posting - how you check copy and
  // numbers without spamming the group.
  const dryRun = request.nextUrl.searchParams.get('dry') === '1'

  if (!telegramConfigured() && !dryRun) {
    return NextResponse.json({ success: true, skipped: 'telegram not configured' })
  }

  const supabase = getServiceClient()
  if (!supabase) return NextResponse.json({ error: 'No Supabase client' }, { status: 500 })

  const now = new Date()
  const t = istParts(now)
  const todayStart = istMidnightUtc(t.y, t.m, t.d)
  const tomorrowStart = new Date(todayStart.getTime() + 86_400_000)
  const yesterdayStart = new Date(todayStart.getTime() - 86_400_000)

  // The window each brief reports on.
  //   morning - all of yesterday
  //   evening - today so far
  //   pulse   - since the top of the previous hour, which is where the previous
  //             pulse fired. Fixed boundaries mean two pulses can never
  //             double-count or leave a gap, which a "last 60 minutes from now"
  //             window would do the moment a cron fires late.
  let windowStart: Date
  let windowEnd: Date
  if (kind === 'morning') {
    // Since last night's brief, not "all of yesterday". The evening report
    // already covered the working day; what the morning has to answer is what
    // arrived while nobody was watching.
    windowStart = new Date(yesterdayStart.getTime() + 19 * 3_600_000)
    windowEnd = now
  } else if (kind === 'evening') {
    windowStart = todayStart
    windowEnd = now
  } else {
    windowEnd = new Date(Date.UTC(
      new Date(now.getTime() + IST_OFFSET_MS).getUTCFullYear(),
      new Date(now.getTime() + IST_OFFSET_MS).getUTCMonth(),
      new Date(now.getTime() + IST_OFFSET_MS).getUTCDate(),
      new Date(now.getTime() + IST_OFFSET_MS).getUTCHours(), 0, 0,
    ) - IST_OFFSET_MS)
    // The midday report is "today so far", not "the last hour". Someone
    // reading at 1pm wants the day's shape, and an hour-slice of a quiet
    // afternoon reads as if nothing is happening.
    windowStart = todayStart
  }

  try {
    // Deliberately narrow selects - a brief needs a name, a source and an id,
    // never unified_context. Pulling the JSONB here would ship megabytes to
    // summarise a dozen rows.
    const [newLeadsRes, touchedRes, callsRes, attentionRes] = await Promise.all([
      supabase
        .from('all_leads')
        // What KIND of lead matters as much as how many - "40 leads" tells you
        // nothing you can act on, "28 pilot, 9 cabin crew" does. Read as JSON
        // paths so this stays a handful of scalars per row.
        .select(`id, customer_name, phone, first_touchpoint, last_touchpoint, created_at,
                 wc_type:unified_context->${BRAND_ID}->>lead_type,
                 wc_course:unified_context->${BRAND_ID}->>course_interest,
                 wc_event:unified_context->${BRAND_ID}->>offline_event_key,
                 wc_intent:unified_context->${BRAND_ID}->>offline_event_intent`)
        .gte('created_at', windowStart.toISOString())
        .lt('created_at', windowEnd.toISOString())
        .order('created_at', { ascending: false }),
      supabase
        .from('all_leads')
        .select('id, customer_name, first_touchpoint, last_touchpoint, last_interaction_at')
        .gte('last_interaction_at', windowStart.toISOString())
        .lt('last_interaction_at', windowEnd.toISOString()),
      supabase
        .from('activities')
        // created_by so the brief can say WHO made the calls, not just how
        // many were made.
        .select('id, lead_id, created_by, created_at')
        .eq('activity_type', 'call')
        .gte('created_at', windowStart.toISOString())
        .lt('created_at', windowEnd.toISOString()),
      supabase
        .from('all_leads')
        .select('id, customer_name, phone, last_interaction_at')
        .eq('needs_human_followup', true)
        .order('last_interaction_at', { ascending: false })
        .limit(10),
    ])

    const newLeads = newLeadsRes.data || []
    const touched = touchedRes.data || []
    const calls = callsRes.data || []
    const attention = attentionRes.data || []

    // Today's committed calls come from web_sessions, which is where this
    // brand's booking columns actually live - all_leads has no booking_date
    // here, and selecting one that doesn't exist 400s the whole query.
    const { data: bookingRows } = await supabase
      .from('web_sessions')
      .select('lead_id, booking_date, booking_time, booking_status')
      .gte('booking_date', new Date(todayStart.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10))
      .lte('booking_date', new Date(tomorrowStart.getTime() + IST_OFFSET_MS - 1).toISOString().slice(0, 10))

    const bookings = (bookingRows || []).filter((b: any) => b.booking_date)
    const bookingNames = new Map<string, string>()
    if (bookings.length) {
      const { data: bl } = await supabase
        .from('all_leads')
        .select('id, customer_name')
        .in('id', bookings.map((b: any) => b.lead_id).filter(Boolean))
      for (const l of bl || []) bookingNames.set(l.id, l.customer_name || 'Unknown')
    }

    // ── Render ──────────────────────────────────────────────────────────────
    const brand = getBrandConfig().name
    const lines: string[] = []
    const heading =
      kind === 'morning'
        ? `☀️ <b>MORNING</b> · ${tgEscape(istDateLabel(now))}`
        : kind === 'evening'
          ? `🌆 <b>EVENING</b> · ${tgEscape(istDateLabel(now))}`
          : `🕛 <b>MIDDAY</b> · ${tgEscape(istDateLabel(now))}`
    // Say which stretch of time this covers. Without it every report is just
    // "some leads came in" and two of them look identical.
    const windowNote =
      kind === 'morning'
        ? `Since ${tgEscape(istTimeLabel(windowStart))} yesterday`
        : 'Today so far'
    lines.push(heading)
    lines.push(`<i>${windowNote} · ${tgEscape(brand)}</i>`)
    lines.push('')

    // A brief is a SHAPE, not a roster. Naming forty leads is unreadable on a
    // phone and tells you nothing you can act on; "40 in, 28 pilot, mostly
    // Meta, Richard made 18 calls" is the same information you can act on.
    // Individual leads have their own feed, and the dashboard has the list.
    /**
     * Counts as an aligned block. Telegram renders <pre> in a monospace font,
     * which is the only way numbers line up in a column - and a column is what
     * makes this scannable at a glance instead of a sentence you have to read.
     */
    const block = (
      items: any[],
      pick: (x: any) => string | null | undefined,
      max = 6,
    ): string | null => {
      const m = new Map<string, number>()
      for (const it of items) {
        const k = (pick(it) || '').trim()
        if (!k) continue
        m.set(k, (m.get(k) || 0) + 1)
      }
      const rows = Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, max)
      if (!rows.length) return null
      const w = Math.max(...rows.map(([k]) => k.length))
      return `<pre>${rows
        .map(([k, n]) => `${tgEscape(k.padEnd(w))}  ${String(n).padStart(3)}`)
        .join('\n')}</pre>`
    }

    // Matched on substrings, not exact keys: the real values are things like
    // 'meta_forms' and 'fb_lead_form', which an exact map misses and then
    // prints raw, underscores and all.
    const sourceOf = (l: any) => {
      const raw = String(l.first_touchpoint || l.last_touchpoint || '').toLowerCase()
      const last = String(l.last_touchpoint || '').toLowerCase()
      if (!raw) return 'Unknown'
      if (/meta|facebook|instagram|fb_|\big\b/.test(raw)) return 'Meta'
      if (/whatsapp|\bwa\b/.test(raw)) return 'WhatsApp'
      if (/form|web|site|landing/.test(raw)) return 'Website'
      if (/voice|call/.test(raw)) return 'Call'
      // 'manual' does NOT mean somebody typed it in. Every one of these has a
      // WhatsApp last-touch: they messaged the number directly, with no prior
      // web or ad touch, and intake stamps 'manual' for want of a better word.
      // Counting them as hand-entered under-reports WhatsApp badly - it was a
      // fifth of a day's leads.
      if (/manual|admin|import/.test(raw)) {
        return /whatsapp|\bwa\b/.test(last) ? 'WhatsApp' : 'Added by hand'
      }
      if (/referr/.test(raw)) return 'Referral'
      const clean = raw.replace(/_/g, ' ')
      return clean.charAt(0).toUpperCase() + clean.slice(1)
    }

    // WHAT they came for is the line worth reading. "39 leads" is a number;
    // "12 Wings of Freedom, 9 pilot, 4 cabin crew" is something you can staff
    // and follow up against.
    //
    // An event lead is named by its EVENT, not the generic word - two events
    // running at once are different work, and "Event 12" hides which.
    const wantOf = (l: any) => {
      const type = String(l.wc_type || '').toLowerCase()
      if (type === 'webinar') return 'Webinar'
      if (type === 'offline_event' || l.wc_event) {
        const ev = getOfflineEvent(String(l.wc_event || ''))
        const label = ev?.name || 'Offline event'
        return l.wc_intent === 'scholarship' ? `${label} + scholarship` : label
      }
      const course = String(l.wc_course || '').trim()
      if (course) return course
      return 'Not said yet'
    }

    lines.push(`<b>${newLeads.length} new lead${newLeads.length === 1 ? '' : 's'}</b>`)
    if (newLeads.length) {
      const src = block(newLeads, sourceOf, 5)
      if (src) { lines.push(''); lines.push(src) }
      const want = block(newLeads, wantOf, 6)
      if (want) { lines.push(''); lines.push(want) }
    }

    // Morning deliberately omits this. Overnight nobody was working, so a
    // "touched" count at 9am measures the agent, not the team, and reads as
    // activity that did not happen. From midday on it is the day's progress.
    if (kind !== 'morning') {
      lines.push('')
      lines.push(`${touched.length} touched`)
    }

    lines.push('')
    lines.push(`<b>${calls.length} call${calls.length === 1 ? '' : 's'}</b>`)
    if (calls.length) {
      // Who did the calling. created_by is a user id on this schema, so it has
      // to be resolved to a name or the line reads as a row of UUIDs.
      const byUser = new Map<string, number>()
      for (const c of calls) {
        const k = String((c as any).created_by || '')
        if (k) byUser.set(k, (byUser.get(k) || 0) + 1)
      }
      const ids = Array.from(byUser.keys())
      const nameById = new Map<string, string>()
      if (ids.length) {
        const { data: us } = await supabase
          .from('dashboard_users')
          .select('id, full_name, email')
          .in('id', ids)
        for (const u of us || []) {
          nameById.set(u.id, u.full_name || (u.email || '').split('@')[0] || 'Someone')
        }
      }
      const rows = Array.from(byUser.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6)
      if (rows.length) {
        const w = Math.max(...rows.map(([id]) => (nameById.get(id) || 'Someone').length))
        lines.push(
          `<pre>${rows
            .map(([id, n]) => `${tgEscape((nameById.get(id) || 'Someone').padEnd(w))}  ${String(n).padStart(3)}`)
            .join('\n')}</pre>`,
        )
      }
    }

    if (kind === 'morning' || kind === 'evening') {
      lines.push('')
      lines.push(`${bookings.length} booked today`)
    }

    // The one line that asks for an action. Overdue call-backs are promises
    // already broken, which is why they sit at the bottom where the eye stops
    // rather than among the counts.
    const { count: overdue } = await supabase
      .from('activities')
      .select('id', { count: 'exact', head: true })
      .not('next_follow_up_date', 'is', null)
      .lt('next_follow_up_date', new Date().toISOString())

    if (overdue && overdue > 0) {
      lines.push('')
      lines.push(`⚠️ <b>${overdue} call-back${overdue === 1 ? '' : 's'} overdue</b>`)
    }

    if (APP_URL) {
      lines.push('')
      lines.push(tgLink('Open dashboard', `${APP_URL}/dashboard`))
    }

    const html = lines.join('\n')

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        kind,
        window: { from: windowStart.toISOString(), to: windowEnd.toISOString() },
        counts: {
          newLeads: newLeads.length,
          touched: touched.length,
          calls: calls.length,
          bookingsToday: bookings.length,
          needsHuman: attention.length,
        },
        html,
      })
    }

    // A pulse with nothing to report is noise. The morning and evening briefs
    // always go out - "nothing came in" is itself the signal at those hours.
    if (kind === 'pulse' && !newLeads.length && !touched.length && !calls.length) {
      return NextResponse.json({ success: true, skipped: 'quiet hour', kind })
    }

    const sent = await sendTelegramMessage(html)
    return NextResponse.json({
      success: sent.success,
      kind,
      brand: BRAND_ID,
      counts: {
        newLeads: newLeads.length,
        touched: touched.length,
        calls: calls.length,
        bookingsToday: bookings.length,
        needsHuman: attention.length,
      },
      error: sent.error,
    })
  } catch (err: any) {
    console.error('[telegram-brief] failed:', err?.message || err)
    return NextResponse.json({ success: false, error: err?.message || 'unknown' }, { status: 500 })
  }
}
