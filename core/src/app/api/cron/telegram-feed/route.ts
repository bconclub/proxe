import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/services'
import { sendTelegramMessage, telegramConfigured, tgEscape, tgLink } from '@/lib/services/telegram'
import { BRAND_ID } from '@/configs'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/cron/telegram-feed
 *
 * The group's running commentary: things worth the team seeing as they happen,
 * posted one at a time.
 *
 * Split of duties, deliberately:
 *   GROUP    - what happened (a lead arrived, a seat was booked, someone
 *              finished a scholarship application). Shared awareness.
 *   PERSONAL - what YOU owe (see cron/followup-reminder). A nudge is only
 *              useful to the person who made the promise; in a group it is
 *              noise to everyone else and easy to assume someone else has it.
 *
 * Written as a poller rather than Telegram calls sprinkled through the intake
 * routes: a lead landing must never wait on, or fail because of, a message to
 * a chat app.
 *
 * The watermark lives in dashboard_settings so a redeploy doesn't replay the
 * day. On the very first run it starts from NOW - nobody wants the backlog
 * posted one by one.
 */

const WATERMARK_KEY = 'telegram_feed_watermark'
/** Ceiling per run: a burst (ad spike, bulk import) posts a summary instead. */
const MAX_ITEMS = 12

async function readWatermark(supabase: any): Promise<string | null> {
  const { data } = await supabase
    .from('dashboard_settings')
    .select('value')
    .eq('key', WATERMARK_KEY)
    .maybeSingle()
  return (data?.value as any)?.since || null
}

async function writeWatermark(supabase: any, since: string) {
  await supabase.from('dashboard_settings').upsert(
    { key: WATERMARK_KEY, value: { since }, description: 'Telegram group feed - last posted timestamp' },
    { onConflict: 'key' },
  )
}

export async function GET(_request: NextRequest) {
  try {
    // The group feed genuinely needs a group, so this one keeps the full gate.
    if (!telegramConfigured()) {
      return NextResponse.json({ ok: true, skipped: 'TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set' })
    }
    const supabase: any = getServiceClient()
    if (!supabase) return NextResponse.json({ error: 'Service client unavailable' }, { status: 500 })

    const now = new Date().toISOString()
    const since = await readWatermark(supabase)
    if (!since) {
      await writeWatermark(supabase, now)
      return NextResponse.json({ ok: true, started: true, note: 'watermark set, feed starts from now' })
    }

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '')
    const leadLink = (id: string, label: string) =>
      appUrl ? tgLink(label, `${appUrl}/dashboard/leads?leadId=${id}`) : `<b>${tgEscape(label)}</b>`

    type Item = { at: string; html: string }
    const items: Item[] = []

    // 1. New leads.
    const { data: leads } = await supabase
      .from('all_leads')
      .select('id, customer_name, phone, first_touchpoint, created_at, wc:unified_context->windchasers')
      .gt('created_at', since)
      .order('created_at', { ascending: true })
      .limit(MAX_ITEMS * 2)

    for (const l of leads || []) {
      const wc: any = l.wc || {}
      const name = l.customer_name || 'Someone'
      const src = l.first_touchpoint ? ` · ${tgEscape(l.first_touchpoint)}` : ''
      // A scholarship tick at registration is the thing worth saying out loud.
      const tag =
        wc.offline_event_intent === 'scholarship'
          ? ' 🎓 <i>also applying for the scholarship</i>'
          : wc.offline_event_key
            ? ` · <i>${tgEscape(String(wc.offline_event_name || wc.offline_event_key))}</i>`
            : ''
      items.push({
        at: l.created_at,
        html: `🆕 ${leadLink(l.id, name)}${src}${tag}`,
      })
    }

    // 2. Stage changes that mean something: a booking, a demo taken, a win.
    const NOTABLE: Record<string, string> = {
      'Booking Made': '📅 booked',
      'Demo Taken': '✅ demo taken',
      'Closed Won': '🏆 won',
      'Converted': '🏆 converted',
      'Won': '🏆 won',
    }
    const { data: changes } = await supabase
      .from('lead_stage_changes')
      .select('lead_id, new_stage, changed_by, created_at')
      .gt('created_at', since)
      .in('new_stage', Object.keys(NOTABLE))
      .order('created_at', { ascending: true })
      .limit(MAX_ITEMS * 2)

    const changeLeadIds = Array.from(new Set((changes || []).map((c: any) => c.lead_id).filter(Boolean)))
    const nameById = new Map<string, string>()
    if (changeLeadIds.length) {
      const { data: cl } = await supabase.from('all_leads').select('id, customer_name').in('id', changeLeadIds)
      for (const l of cl || []) nameById.set(l.id, l.customer_name || 'Someone')
    }
    for (const c of changes || []) {
      items.push({
        at: c.created_at,
        html: `${NOTABLE[c.new_stage]} — ${leadLink(c.lead_id, nameById.get(c.lead_id) || 'Someone')}`,
      })
    }

    // 3. Completed scholarship applications - the milestone the team cares
    //    about most right now, and invisible in a stage change.
    const { data: applied } = await supabase
      .from('all_leads')
      .select('id, customer_name, applied_at:unified_context->windchasers->>scholarship_applied_at, track:unified_context->windchasers->>scholarship_track')
      .not('unified_context->windchasers->>scholarship_applied_at', 'is', null)
      .gt('unified_context->windchasers->>scholarship_applied_at', since)
      .limit(MAX_ITEMS)

    for (const a of applied || []) {
      const track = a.track ? ` · ${tgEscape(String(a.track).replace(/_/g, ' '))}` : ''
      items.push({
        at: a.applied_at,
        html: `🎓 <b>Scholarship application submitted</b> — ${leadLink(a.id, a.customer_name || 'Someone')}${track}`,
      })
    }

    if (!items.length) {
      await writeWatermark(supabase, now)
      return NextResponse.json({ ok: true, posted: 0 })
    }

    items.sort((a, b) => a.at.localeCompare(b.at))

    // A quiet stretch posts each item. A flood posts one line - a group that
    // pings forty times gets muted, and then nothing is seen at all.
    if (items.length > MAX_ITEMS) {
      await sendTelegramMessage(
        `📈 <b>${items.length} updates</b> in the last few minutes.\n${appUrl ? tgLink('Open the dashboard', `${appUrl}/dashboard`) : ''}`,
        { disablePreview: true },
      )
      await writeWatermark(supabase, now)
      return NextResponse.json({ ok: true, posted: 1, summarised: items.length })
    }

    let posted = 0
    for (const it of items) {
      const res = await sendTelegramMessage(it.html, { disablePreview: true })
      if (res.success) posted++
      // Telegram's own limit is ~20 messages/minute to one chat.
      await new Promise((r) => setTimeout(r, 400))
    }

    await writeWatermark(supabase, now)
    return NextResponse.json({ ok: true, posted, found: items.length })
  } catch (error: any) {
    console.error('[telegram-feed] failed:', error?.message || error)
    return NextResponse.json({ error: error?.message || 'unknown' }, { status: 500 })
  }
}
