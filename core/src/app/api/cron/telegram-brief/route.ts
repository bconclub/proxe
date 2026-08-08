import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/services'
import { sendTelegramMessage, sendTelegramPhoto, telegramConfigured, tgEscape, tgLink } from '@/lib/services/telegram'
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
  //   morning - since 8pm last night, the stretch nobody was watching
  //   evening - today so far
  //   pulse   - 1pm, today from midnight



  let windowStart: Date
  let windowEnd: Date
  if (kind === 'morning') {
    // Since last night's brief, not "all of yesterday". The evening report
    // already covered the working day; what the morning has to answer is what
    // arrived while nobody was watching.
    windowStart = new Date(yesterdayStart.getTime() + 20 * 3_600_000)
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
                 wc_intent:unified_context->${BRAND_ID}->>offline_event_intent,
                 wc_ev_reg:unified_context->${BRAND_ID}->>offline_event_registered_at,
                 wc_zoom:unified_context->${BRAND_ID}->>zoom_registered,
                 wc_web_reg:unified_context->${BRAND_ID}->>webinar_registered_at,
                 wc_applied:unified_context->${BRAND_ID}->>scholarship_applied_at,
                 attr_label:unified_context->attribution->>source_label,
                 attr_source:unified_context->attribution->>source`)
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
        // 'note' counts as a call. One counsellor logs every call as a note -
        // "number not connecting", "candidate is busy call later" - thirty of
        // them in a fortnight, all plainly phone calls. Counting only
        // activity_type='call' reported her as having done nothing while she
        // owned more leads than anyone.
        .select('id, lead_id, created_by, created_at, activity_type')
        .in('activity_type', ['call', 'manual_call', 'note'])
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
    // Bookings live in unified_context, NOT web_sessions. Reading the wrong
    // table is why every report has said "0 booked today" while five calls
    // were actually on the calendar - a zero that looked like a quiet day and
    // was really an empty query.
    const todayIst = new Date(todayStart.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)
    const { data: bookedLeads } = await supabase
      .from('all_leads')
      .select(`id, customer_name, phone,
               wa_d:unified_context->whatsapp->>booking_date, wa_t:unified_context->whatsapp->>booking_time,
               vo_d:unified_context->voice->>booking_date,    vo_t:unified_context->voice->>booking_time,
               web_d:unified_context->web->>booking_date,     web_t:unified_context->web->>booking_time,
               so_d:unified_context->social->>booking_date,   so_t:unified_context->social->>booking_time`)
      .eq('lead_stage', 'Booking Made')
      .limit(500)

    const bookings = (bookedLeads || [])
      .map((l: any) => ({
        lead_id: l.id,
        name: l.customer_name || 'Unknown',
        phone: l.phone,
        booking_date: l.wa_d || l.vo_d || l.web_d || l.so_d || null,
        booking_time: l.wa_t || l.vo_t || l.web_t || l.so_t || null,
      }))
      .filter((b: any) => b.booking_date === todayIst)
      .sort((a: any, b: any) => String(a.booking_time || '').localeCompare(String(b.booking_time || '')))

    // ── Render ──────────────────────────────────────────────────────────────
    const brand = getBrandConfig().name
    const lines: string[] = []
    const heading =
      kind === 'morning'
        ? `☀️ <b>MORNING REPORT</b>`
        : kind === 'evening'
          ? `🌆 <b>EVENING REPORT</b>`
          : `🕛 <b>MIDDAY REPORT</b>`
    // Say which stretch of time this covers. Without it every report is just
    // "some leads came in" and two of them look identical.
    const windowNote =
      kind === 'morning'
        ? `Since 8pm yesterday`
        : 'Today so far'
    // FOUR messages, not one wall.
    //
    // Header, categories, sources and operations in a single message is
    // unreadable on a phone: by the time you reach the calls you have lost the
    // headline. Telegram has no tables, and its only monospace is a code block
    // - grey panel, Copy button, reads like something to run - so the
    // structure has to come from the messages themselves. One heading each.
    const sections: string[] = []
    /**
     * Width-setter.
     *
     * A Telegram bubble is as wide as its longest line, so four messages of
     * different content come out four different widths and the report looks
     * ragged. The same rule under every heading makes them all one width.
     * 22 characters - wide enough to set the shape, short enough not to wrap
     * on a small phone.
     */
    const RULE = ''
    lines.push(heading)
    lines.push(`<i>${windowNote}</i>`)
    lines.push('')

    // A brief is a SHAPE, not a roster. Naming forty leads is unreadable on a
    // phone and tells you nothing you can act on; "40 in, 28 pilot, mostly
    // Meta, Richard made 18 calls" is the same information you can act on.
    // Individual leads have their own feed, and the dashboard has the list.
    /**
     * Counts as indented lines under their heading. Plain text, never a code
     * block: Telegram renders those as a grey panel with a Copy button, which
     * reads as something to run rather than something to know.
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
      // Plain lines, NOT <pre>. Telegram dresses a pre block up as code, with
      // a grey panel and a Copy button - it reads like something to run rather
      // than something to know. Alignment is not worth that.
      return rows.map(([k, n]) => `${tgEscape(k)} - <b>${n}</b>`).join('\n')
    }

    /**
     * Where the lead really came from.
     *
     * first_touchpoint only says HOW they reached us - 'form', 'whatsapp' -
     * and "Website 13" is the least useful answer in the report: nobody
     * arrives on a landing page by accident, they arrive from an ad. The
     * attribution block carries the actual origin (Instagram, Google Ads,
     * Google Organic) and 58 of 59 leads have it, so it wins whenever present.
     * The touchpoint mapping below is the fallback for the ones that don't.
     */
    const sourceOf = (l: any) => {
      // One bucket per PLATFORM. Facebook Ads and Facebook are the same place,
      // as are Google Ads and Google Organic - splitting them made five thin
      // rows out of three real ones, and the paid/organic split belongs in an
      // ads report, not in a lead brief. Anything genuinely new still gets its
      // own row through the fallback below.
      const both = `${l.attr_label || ''} ${l.attr_source || ''}`.toLowerCase().trim()
      if (both) {
        if (/instagram|^ig\b|\big\b/.test(both)) return 'Instagram'
        if (/facebook|^fb\b|\bfb\b|meta/.test(both)) return 'Facebook'
        if (/google/.test(both)) return 'Google'
        if (/whatsapp|\bwa\b/.test(both)) return 'WhatsApp'
        if (/direct/.test(both)) return 'Direct'
      }
      const label = String(l.attr_label || '').trim()
      if (label) return label
      const attr = String(l.attr_source || '').toLowerCase().trim()
      if (attr) return attr.charAt(0).toUpperCase() + attr.slice(1)
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

    /**
     * What the leads came for, as CATEGORIES.
     *
     * Not event names: "Wings of Freedom" means nothing to read in six months
     * and changes every campaign. "Offline event" is the shape of the work,
     * and the registry still holds which one for anyone who opens the
     * dashboard. A specific event only earns its name when it needs one.
     *
     * Unknowns are not their own line - they are already inside the total, and
     * "18 didn't say" as the biggest row buries the rows that matter.
     */
    const courseOf = (l: any): 'pilot' | 'cabin' | null => {
      const c = String(l.wc_course || '').toLowerCase()
      if (!c) return null
      if (/cabin|crew|air ?host/.test(c)) return 'cabin'
      if (/pilot|dgca|cpl|ppl|flight|aviation/.test(c)) return 'pilot'
      return null
    }

    const cat = {
      pilot: 0,
      cabin: 0,
      offline: 0,
      offlineReg: 0,
      offlineInterested: 0,
      offlineScholarship: 0,
      online: 0,
      onlineReg: 0,
      onlineInterested: 0,
    }
    for (const l of newLeads as any[]) {
      const type = String(l.wc_type || '').toLowerCase()
      const isOffline = type === 'offline_event' || !!l.wc_event
      const isOnline = type === 'webinar' || !!l.wc_web_reg

      if (isOffline) {
        cat.offline++
        // Interested is EVERYONE who came for the event - registered or not.
        // It was the not-registered remainder, which made the two rows read
        // as rivals ("7 registered, 2 interested") when registered people are
        // obviously interested too.
        cat.offlineInterested++
        if (l.wc_ev_reg) cat.offlineReg++
        // Scholarship means the full application form was submitted, not that
        // a box was ticked while registering. 30 ticked the box; 6 finished
        // the form. Counting the ticks made the pipeline look five times
        // healthier than it is.
        if (l.wc_applied) cat.offlineScholarship++
      } else if (isOnline) {
        cat.online++
        // Same rule as offline: interested is everyone. Registered means
        // registered ON ZOOM - filling our form is interest, the seat only
        // exists once Zoom has them.
        cat.onlineInterested++
        if (String(l.wc_zoom || '').toLowerCase() === 'true') cat.onlineReg++
      }

      const c = courseOf(l)
      if (c === 'pilot') cat.pilot++
      else if (c === 'cabin') cat.cabin++
    }

    lines.push(`<b>${newLeads.length} new lead${newLeads.length === 1 ? '' : 's'}</b>`)
    // Header + headline is message one, and stands alone: the number is the
    // thing most people read and nothing else.
    sections.push(lines.join('\n'))
    lines.length = 0

    if (newLeads.length) {
      // WHAT they want comes first. It is the question anyone opening this
      // actually has - what kind of work arrived. Where it came from matters
      // to whoever buys the ads, and can wait a few lines.
      const want: string[] = []
      if (cat.pilot) want.push(`Pilot / DGCA - <b>${cat.pilot}</b>`)
      if (cat.cabin) want.push(`Cabin Crew - <b>${cat.cabin}</b>`)
      // Interested first: it is the whole group, and the rows beneath it are
      // subsets narrowing down. Registered before scholarship, because that is
      // the order someone actually moves through.
      if (cat.offline) {
        want.push(`Offline event`)
        want.push(`   interested - <b>${cat.offlineInterested}</b>`)
        want.push(`   registered - <b>${cat.offlineReg}</b>`)
        want.push(`   scholarship - <b>${cat.offlineScholarship}</b>`)
      }
      if (cat.online) {
        want.push(`Online event`)
        want.push(`   interested - <b>${cat.onlineInterested}</b>`)
        want.push(`   registered - <b>${cat.onlineReg}</b>`)
      }
      // <blockquote> is the one real layout tool Telegram gives a bot: an
      // indented block with a coloured bar down the left, and unlike <pre> no
      // grey panel and no Copy button making a report look like code.
      if (want.length) sections.push(`<b>LEAD CATEGORIES</b>\n${want.join('\n')}`)

      const src = block(newLeads, sourceOf, 6)
      if (src) sections.push(`<b>SOURCES</b>\n${src}`)
    }

    // Everything the team did, under its own heading.
    const ops: string[] = []

    // Morning has no touched count. The window is 8pm to 9am - nobody was
    // working, so any number here is the agent's overnight replies, and
    // reading it as team activity flatters a night when nothing happened.
    if (kind !== 'morning') {
      ops.push(`Leads touched - <b>${touched.length}</b>`)
    }

    ops.push(`Calls logged - <b>${calls.length}</b>`)

    // EVERY caller, including the ones who made none.
    //
    // Listing only people with calls made a quiet day invisible - the report
    // read "Richard 61, Haseeb 33" and said nothing about the three others who
    // logged nothing at all. A zero is the more useful number of the two.
    const callerRows: Array<[string, number]> = []
    const byUser = new Map<string, number>()
    for (const c of calls) {
      const k = String((c as any).created_by || '')
      if (k) byUser.set(k, (byUser.get(k) || 0) + 1)
    }
    const { data: teamUsers } = await supabase
      .from('dashboard_users')
      .select('id, full_name, email')
      .eq('is_active', true)

    // Only the people whose job is calling. An admin parked at 0 every day is
    // noise that teaches people to skip the whole line.
    const callerList = (getBrandConfig().callers || []).map((e) => e.toLowerCase())
    for (const u of teamUsers || []) {
      if (callerList.length && !callerList.includes(String(u.email || '').toLowerCase())) continue
      const name = u.full_name || (u.email || '').split('@')[0] || 'Someone'
      callerRows.push([name, byUser.get(u.id) || 0])
    }
    // Busiest first, and anyone on zero drops to the bottom in name order.
    callerRows.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    if (callerRows.length) {
      ops.push(callerRows.map(([name, n]) => `   ${tgEscape(name)} - <b>${n}</b>`).join('\n'))
    }

    // The day's calendar, at the bottom where the eye stops. This is the part
    // that changes what someone does next - a count of bookings tells you the
    // day is busy, the times tell you when to be free.
    //
    // EVERY booking for today, not just the ones still ahead. Dropping the
    // passed ones made the number shrink through the day - 6 in the morning,
    // 1 by evening - which read as bookings being lost rather than kept. What
    // the day was worth does not go down as the day goes on.
    //
    // Named for WHO did it: a booking is the agent's work, off its own
    // conversation, and a demo taken is a person's. Side by side the gap
    // between them is the point.
    ops.push(`PROXe booked calls - <b>${bookings.length}</b>`)

    // Demos actually TAKEN today. Booked is a plan; taken is the outcome, and
    // only a human answering "did it happen" moves a lead there - which is why
    // this can read zero on a day with five bookings.
    const { count: demosToday } = await supabase
      .from('lead_stage_changes')
      .select('id', { count: 'exact', head: true })
      .in('new_stage', ['Demo Taken', 'Demo Done', 'Call Done'])
      .gte('created_at', todayStart.toISOString())

    ops.push(`Actual demos taken - <b>${demosToday || 0}</b>`)

    let opsMsg = `<b>OPERATIONS</b>\n${ops.join('\n')}`
    if (APP_URL) {
      opsMsg += `\n\n${tgLink('Open dashboard', `${APP_URL}/dashboard`)}`
    }

    sections.push(opsMsg)
    const html = sections.join('\n\n')

    // ── The same report as a PICTURE ────────────────────────────────────────
    // Telegram gives a bot no tables and no alignment, so text was always
    // going to be a list of lines however it was arranged. An image has none
    // of those limits - columns line up, headings carry weight, and it renders
    // the same on every phone rather than depending on font size and width.
    //
    // Numbers travel in the URL; the card route holds no logic and touches no
    // database, so Telegram can fetch it directly and there is nothing to
    // upload from here.
    const cardRows: Array<{ label: string; value: number | string; sub?: boolean }> = []
    if (cat.pilot) cardRows.push({ label: 'Pilot / DGCA', value: cat.pilot })
    if (cat.cabin) cardRows.push({ label: 'Cabin Crew', value: cat.cabin })
    if (cat.offline) {
      cardRows.push({ label: 'Offline event', value: cat.offlineInterested })
      cardRows.push({ label: 'registered', value: cat.offlineReg, sub: true })
      cardRows.push({ label: 'scholarship', value: cat.offlineScholarship, sub: true })
    }
    if (cat.online) {
      cardRows.push({ label: 'Online event', value: cat.onlineInterested })
      cardRows.push({ label: 'registered', value: cat.onlineReg, sub: true })
    }

    const srcCounts = new Map<string, number>()
    for (const l of newLeads as any[]) {
      const k = sourceOf(l)
      if (k) srcCounts.set(k, (srcCounts.get(k) || 0) + 1)
    }

    const opsRows: Array<{ label: string; value: number | string; sub?: boolean }> = []
    if (kind !== 'morning') opsRows.push({ label: 'Leads touched', value: touched.length })
    opsRows.push({ label: 'Calls logged', value: calls.length })
    for (const [name, n] of callerRows) opsRows.push({ label: name, value: n, sub: true })
    opsRows.push({ label: 'PROXe booked calls', value: bookings.length })
    opsRows.push({ label: 'Actual demos taken', value: demosToday || 0 })

    const cardData = {
      title: kind === 'morning' ? 'MORNING REPORT' : kind === 'evening' ? 'EVENING REPORT' : 'MIDDAY REPORT',
      window: kind === 'morning' ? 'Since 8pm yesterday' : 'Today so far',
      headline: String(newLeads.length),
      headlineLabel: newLeads.length === 1 ? 'new lead' : 'new leads',
      sections: [
        { heading: 'LEAD CATEGORIES', rows: cardRows },
        {
          heading: 'SOURCES',
          rows: Array.from(srcCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([label, value]) => ({ label, value })),
        },
        { heading: 'OPERATIONS', rows: opsRows },
      ].filter((s) => s.rows.length),
    }
    const cardUrl = APP_URL
      ? `${APP_URL}/api/reports/brief-card?d=${encodeURIComponent(Buffer.from(JSON.stringify(cardData)).toString('base64'))}`
      : null

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

    // One message per section, in order. A short gap keeps them in sequence -
    // Telegram does not guarantee ordering for messages fired at once, and a
    // report whose SOURCES arrive above its headline is worse than the wall
    // this replaced.
    // ONE message. Four bubbles read as scattered, and the rules and
    // blockquotes that were meant to hold them together added a wrapping bar,
    // a grey box and a stray quote glyph. Plain text, bold headings, blank
    // lines between sections - nothing that can render differently on a phone
    // than it does here.
    // Picture first, words as the safety net. If the card fails to render or
    // Telegram cannot fetch it, the report still has to arrive - a prettier
    // format is not worth a silent day.
    let sent = cardUrl
      ? await sendTelegramPhoto(cardUrl, `${cardData.title} · ${cardData.window}`)
      : { success: false, error: 'no APP_URL' }
    if (!sent.success) {
      console.error('[telegram-brief] card send failed, falling back to text:', sent.error)
      sent = await sendTelegramMessage(sections.join('\n\n'), { disablePreview: true })
    }
    return NextResponse.json({
      success: sent.success,
      messages: sections.length,
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
