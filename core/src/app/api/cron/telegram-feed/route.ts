import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/services'
import { sendTelegramMessage, telegramConfigured, tgEscape, tgLink } from '@/lib/services/telegram'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/cron/telegram-feed
 *
 * The group hears about a lead when a HUMAN IS NEEDED. Nothing else.
 *
 * It used to post every arrival, every booking, every win. Forty leads a day
 * is forty pings, and a group that pings forty times gets muted - after which
 * the one message that actually needed somebody is unread too. Volume belongs
 * in the brief (counts, twice a day); the dashboard has the list.
 *
 * needs_human_followup is set by intake when the agent cannot proceed: a
 * WhatsApp send failed, a conversation log failed, the agent handed off. Those
 * are the moments where nothing happens next unless a person acts.
 *
 * Dedupe is by lead id, kept in the same settings row as the watermark. A flag
 * that stays true must not re-alert every ten minutes forever, and it cannot
 * key off the flag clearing - being told is not the same as being handled.
 */

const STATE_KEY = 'telegram_feed_watermark'
/** Ceiling per run. More than this and something systemic is wrong. */
const MAX_ITEMS = 8
/** How many alerted ids to remember. Comfortably more than a busy week. */
const MEMORY = 500

interface FeedState {
  since?: string
  alerted?: string[]
}

async function readState(supabase: any): Promise<FeedState | null> {
  const { data } = await supabase
    .from('dashboard_settings')
    .select('value')
    .eq('key', STATE_KEY)
    .maybeSingle()
  return (data?.value as FeedState) || null
}

async function writeState(supabase: any, state: FeedState) {
  await supabase.from('dashboard_settings').upsert(
    { key: STATE_KEY, value: state, description: 'Telegram group feed - watermark + already-alerted leads' },
    { onConflict: 'key' },
  )
}

export async function GET(_request: NextRequest) {
  try {
    if (!telegramConfigured()) {
      return NextResponse.json({ ok: true, skipped: 'TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set' })
    }
    const supabase: any = getServiceClient()
    if (!supabase) return NextResponse.json({ error: 'Service client unavailable' }, { status: 500 })

    const now = new Date().toISOString()
    const state = await readState(supabase)
    if (!state?.since) {
      // First run: start from now. Nobody wants the existing backlog of
      // stuck leads arriving one at a time as if they just happened.
      await writeState(supabase, { since: now, alerted: [] })
      return NextResponse.json({ ok: true, started: true, note: 'watching from now' })
    }

    const alerted = new Set(state.alerted || [])
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '')

    const { data: stuck, error } = await supabase
      .from('all_leads')
      .select('id, customer_name, phone, lead_stage, last_interaction_at, first_touchpoint')
      .eq('needs_human_followup', true)
      .order('last_interaction_at', { ascending: false })
      .limit(50)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const fresh = (stuck || []).filter((l: any) => !alerted.has(l.id))
    if (!fresh.length) {
      await writeState(supabase, { since: now, alerted: Array.from(alerted).slice(-MEMORY) })
      return NextResponse.json({ ok: true, waiting: (stuck || []).length, posted: 0 })
    }

    const batch = fresh.slice(0, MAX_ITEMS)

    // The last thing they said. Without it the alert says somebody is stuck
    // but not on what, and whoever picks it up has to open the lead to find
    // out whether it is urgent.
    const lastMsg = new Map<string, string>()
    const { data: msgs } = await supabase
      .from('conversations')
      .select('lead_id, content, created_at')
      .eq('sender', 'customer')
      .in('lead_id', batch.map((l: any) => l.id))
      .order('created_at', { ascending: false })
      .limit(200)
    for (const m of msgs || []) {
      if (m.lead_id && !lastMsg.has(m.lead_id)) {
        lastMsg.set(m.lead_id, String(m.content || '').replace(/\s+/g, ' ').slice(0, 140))
      }
    }

    let posted = 0
    for (const l of batch) {
      const name = tgEscape(l.customer_name || 'Unknown')
      const said = lastMsg.get(l.id)
      const lines = [
        `🙋 <b>Someone needs you</b>`,
        `${appUrl ? tgLink(name, `${appUrl}/dashboard/leads?leadId=${l.id}`) : `<b>${name}</b>`}${l.phone ? ` · ${tgEscape(l.phone)}` : ''}`,
      ]
      if (l.lead_stage) lines.push(`<i>${tgEscape(l.lead_stage)}</i>`)
      if (said) lines.push(`\n"${tgEscape(said)}"`)
      if (l.phone) {
        lines.push(`\n${tgLink('Reply on WhatsApp', `https://wa.me/${String(l.phone).replace(/\D/g, '')}`)}`)
      }

      const res = await sendTelegramMessage(lines.join('\n'), { disablePreview: true })
      if (res.success) { posted++; alerted.add(l.id) }
      await new Promise((r) => setTimeout(r, 400))
    }

    await writeState(supabase, { since: now, alerted: Array.from(alerted).slice(-MEMORY) })

    return NextResponse.json({
      ok: true,
      waiting: (stuck || []).length,
      posted,
      remaining: fresh.length - batch.length,
    })
  } catch (error: any) {
    console.error('[telegram-feed] failed:', error?.message || error)
    return NextResponse.json({ error: error?.message || 'unknown' }, { status: 500 })
  }
}
