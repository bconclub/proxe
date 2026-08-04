import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/services'
import { sendTelegramMessage, telegramConfigured, tgEscape, tgLink } from '@/lib/services/telegram'
import { BRAND_ID, getBrandConfig } from '@/configs'

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

function leadLine(lead: any): string {
  const name = tgEscape(lead.customer_name || 'Unknown')
  const src = tgEscape(sourceLabel(lead))
  const label = APP_URL ? tgLink(name, `${APP_URL}/dashboard/inbox?lead=${lead.id}`) : `<b>${name}</b>`
  return `• ${label} <i>${src}</i>`
}

/** Group a set of leads by source, biggest first: "meta forms 12, web 3". */
function sourceBreakdown(leads: any[]): string {
  const counts = new Map<string, number>()
  for (const l of leads) {
    const k = sourceLabel(l)
    counts.set(k, (counts.get(k) || 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${tgEscape(k)} ${n}`)
    .join(', ')
}

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
    windowStart = yesterdayStart
    windowEnd = todayStart
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
    windowStart = new Date(windowEnd.getTime() - 3_600_000)
  }

  try {
    // Deliberately narrow selects - a brief needs a name, a source and an id,
    // never unified_context. Pulling the JSONB here would ship megabytes to
    // summarise a dozen rows.
    const [newLeadsRes, touchedRes, callsRes, attentionRes] = await Promise.all([
      supabase
        .from('all_leads')
        .select('id, customer_name, phone, first_touchpoint, last_touchpoint, created_at')
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
        .select('id, lead_id, created_at')
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
        ? `☀️ <b>Morning brief</b> · ${tgEscape(istDateLabel(now))}`
        : kind === 'evening'
          ? `🌆 <b>Day so far</b> · ${tgEscape(istDateLabel(now))}`
          : `📊 <b>${tgEscape(istTimeLabel(windowStart))} to ${tgEscape(istTimeLabel(windowEnd))}</b>`
    lines.push(heading)
    lines.push(`<i>${tgEscape(brand)}</i>`)
    lines.push('')

    const windowWord = kind === 'morning' ? 'Yesterday' : kind === 'evening' ? 'Today' : 'This hour'
    lines.push(`<b>${windowWord}</b>`)
    lines.push(`New leads: <b>${newLeads.length}</b>${newLeads.length ? ` — ${sourceBreakdown(newLeads)}` : ''}`)
    lines.push(`Touched: <b>${touched.length}</b>`)
    lines.push(`Calls logged: <b>${calls.length}</b>`)

    if (newLeads.length) {
      lines.push('')
      lines.push(`<b>Who came in</b>`)
      // Cap the roster: a brief is a prompt to act, not a data dump, and
      // Telegram hard-fails past 4096 chars.
      for (const l of newLeads.slice(0, 12)) lines.push(leadLine(l))
      if (newLeads.length > 12) lines.push(`<i>+ ${newLeads.length - 12} more</i>`)
    }

    if (kind === 'morning' || kind === 'evening') {
      lines.push('')
      lines.push(`<b>Calls booked today</b>`)
      if (!bookings.length) {
        lines.push('<i>Nothing on the calendar.</i>')
      } else {
        for (const b of bookings.slice(0, 12)) {
          const nm = tgEscape(bookingNames.get(b.lead_id) || 'Unknown')
          const who = APP_URL && b.lead_id ? tgLink(nm, `${APP_URL}/dashboard/inbox?lead=${b.lead_id}`) : `<b>${nm}</b>`
          const status = b.booking_status ? ` <i>${tgEscape(b.booking_status)}</i>` : ''
          lines.push(`• ${tgEscape(b.booking_time || '')} ${who}${status}`.trim())
        }
        if (bookings.length > 12) lines.push(`<i>+ ${bookings.length - 12} more</i>`)
      }
    }

    if (attention.length) {
      lines.push('')
      lines.push(`<b>Needs a human (${attention.length})</b>`)
      for (const l of attention.slice(0, 8)) {
        const nm = tgEscape(l.customer_name || 'Unknown')
        const who = APP_URL ? tgLink(nm, `${APP_URL}/dashboard/inbox?lead=${l.id}`) : `<b>${nm}</b>`
        lines.push(`• ${who} ${tgEscape(l.phone || '')}`.trim())
      }
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
