import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/services'
import { sendTelegramMessage, tgEscape, tgLink } from '@/lib/services/telegram'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/cron/followup-reminder
 *
 * "He didn't pick up. Call him back tomorrow at 11." At 11, the person who
 * said that gets a message.
 *
 * Reads activities.next_follow_up_date - the same place the pipeline queue
 * reads - and messages the lead's OWNER on Telegram. Deliberately not
 * agent_tasks: inserts there are dropped by the trigger that stopped the
 * automation, which is exactly why promised call-backs used to reach nobody.
 *
 * Idempotent through followup_reminders, one row per activity. The cron runs
 * every ten minutes and would otherwise re-send the same nudge on every pass.
 * It cannot key off the follow-up being cleared instead, because being
 * reminded is not the same as having made the call.
 *
 * Soft-gated on telegramConfigured(): a brand with no bot token reports
 * skipped rather than failing.
 */

/** How early a reminder may go out. Ten minutes = the cron's own interval. */
const LEAD_MINUTES = 10
/** How late is too late - a reminder for a call promised yesterday is noise. */
const STALE_HOURS = 12
const MAX_PER_RUN = 30

export async function GET(_request: NextRequest) {
  try {
    // Only the TOKEN matters here. telegramConfigured() also demands a group
    // chat id, which is the daily brief's requirement - these reminders go to
    // a person's own chat, so a brand can run them without any group at all.
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return NextResponse.json({ ok: true, skipped: 'TELEGRAM_BOT_TOKEN not set' })
    }
    const supabase: any = getServiceClient()
    if (!supabase) return NextResponse.json({ error: 'Service client unavailable' }, { status: 500 })

    const now = Date.now()
    const dueBy = new Date(now + LEAD_MINUTES * 60_000).toISOString()
    const notBefore = new Date(now - STALE_HOURS * 3600_000).toISOString()

    const { data: rows, error } = await supabase
      .from('activities')
      .select('id, lead_id, note, next_follow_up_date')
      .not('next_follow_up_date', 'is', null)
      .lte('next_follow_up_date', dueBy)
      .gte('next_follow_up_date', notBefore)
      .order('next_follow_up_date', { ascending: true })
      .limit(MAX_PER_RUN)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const due = rows || []
    if (!due.length) return NextResponse.json({ ok: true, due: 0 })

    // Already-reminded, in one read rather than one per row.
    const { data: sentRows } = await supabase
      .from('followup_reminders')
      .select('activity_id')
      .in('activity_id', due.map((r: any) => r.id))
    const alreadySent = new Set((sentRows || []).map((r: any) => r.activity_id))

    const pending = due.filter((r: any) => !alreadySent.has(r.id))
    if (!pending.length) return NextResponse.json({ ok: true, due: due.length, sent: 0, note: 'all already reminded' })

    const { data: leads } = await supabase
      .from('all_leads')
      .select('id, customer_name, phone, owner_id, lead_stage')
      .in('id', pending.map((r: any) => r.lead_id).filter(Boolean))
    const leadById = new Map((leads || []).map((l: any) => [l.id, l]))

    const ownerIds = Array.from(new Set((leads || []).map((l: any) => l.owner_id).filter(Boolean)))
    const { data: users } = ownerIds.length
      ? await supabase
          .from('dashboard_users')
          .select('id, full_name, email, telegram_chat_id')
          .in('id', ownerIds)
      : { data: [] as any[] }
    const userById = new Map((users || []).map((u: any) => [u.id, u]))

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '')
    let sent = 0
    let skipped = 0

    for (const row of pending) {
      const lead: any = leadById.get(row.lead_id)
      if (!lead) { skipped++; continue }
      const owner: any = lead.owner_id ? userById.get(lead.owner_id) : null

      // No owner, or an owner who never linked Telegram: there is nobody to
      // reach. The follow-up still stands in the pipeline queue, which is the
      // surface that never depends on anyone connecting anything.
      const chatId = owner?.telegram_chat_id
      if (!chatId) { skipped++; continue }

      const whenIst = new Date(row.next_follow_up_date).toLocaleString('en-IN', {
        weekday: 'short', day: 'numeric', month: 'short',
        hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
      })
      const name = tgEscape(lead.customer_name || 'this lead')
      const phone = lead.phone ? `\n📞 ${tgEscape(lead.phone)}` : ''
      const why = row.note ? `\n<i>${tgEscape(String(row.note).slice(0, 200))}</i>` : ''
      const link = appUrl ? `\n\n${tgLink('Open the lead', `${appUrl}/dashboard/leads?leadId=${lead.id}`)}` : ''

      const html = `⏰ <b>Call back ${name}</b>\nYou said ${tgEscape(whenIst)}.${phone}${why}${link}`

      let ok = false
      let err = ''
      try {
        const res = await sendTelegramMessage(html, { chatId: String(chatId) })
        ok = res.success
        err = res.error || ''
      } catch (e: any) {
        err = e?.message || 'send failed'
      }

      // Recorded either way. A failed reminder that is not written down gets
      // retried every ten minutes forever.
      await supabase.from('followup_reminders').insert({
        activity_id: row.id,
        user_id: owner?.id || null,
        channel: 'telegram',
        ok,
        error: ok ? null : err.slice(0, 300),
      })

      if (ok) sent++
      else skipped++
    }

    return NextResponse.json({ ok: true, due: due.length, sent, skipped })
  } catch (error: any) {
    console.error('[followup-reminder] failed:', error?.message || error)
    return NextResponse.json({ error: error?.message || 'unknown' }, { status: 500 })
  }
}
