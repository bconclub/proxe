import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'

export const dynamic = 'force-dynamic'

/**
 * Connect a person's Telegram to their dashboard account.
 *
 * GET  - am I linked, and to what
 * POST - mint a single-use code and hand back a t.me link to tap
 * DELETE - unlink
 *
 * Deliberately NOT "paste your chat id here": a numeric Telegram chat id is
 * not something anyone knows about themselves, and asking for it means sending
 * people to a third-party bot to look it up. Tapping a link is one action and
 * proves ownership of the chat at the same time.
 *
 * The code expires and is single use, so a link shared by accident cannot
 * point someone else's reminders at a stranger's chat.
 */

const CODE_TTL_MINUTES = 30

function mintCode(): string {
  // Unambiguous alphabet - no 0/O or 1/I - because this ends up read aloud or
  // retyped when the tap does not work.
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 8 }, () => A[Math.floor(Math.random() * A.length)]).join('')
}

async function me() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  return user
}

export async function GET() {
  try {
    const user = await me()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const supabase: any = getServiceClient()
    if (!supabase) return NextResponse.json({ error: 'Service client unavailable' }, { status: 500 })

    const { data, error } = await supabase
      .from('dashboard_users')
      .select('telegram_chat_id, telegram_username, telegram_linked_at')
      .eq('id', user.id)
      .maybeSingle()

    if (error) {
      // Migration 042 not applied yet - say so plainly rather than reporting
      // "not linked", which would send someone hunting for a bot that is fine.
      return NextResponse.json({ linked: false, error: error.message, needsMigration: true })
    }
    return NextResponse.json({
      linked: !!data?.telegram_chat_id,
      username: data?.telegram_username || null,
      linkedAt: data?.telegram_linked_at || null,
      botConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_USERNAME),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'unknown' }, { status: 500 })
  }
}

export async function POST() {
  try {
    const user = await me()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const supabase: any = getServiceClient()
    if (!supabase) return NextResponse.json({ error: 'Service client unavailable' }, { status: 500 })

    const bot = process.env.TELEGRAM_BOT_USERNAME
    if (!bot) {
      return NextResponse.json(
        { error: 'TELEGRAM_BOT_USERNAME is not set, so there is no bot to link to.' },
        { status: 400 },
      )
    }

    const code = mintCode()
    const expires = new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString()

    const { error } = await supabase
      .from('dashboard_users')
      .update({ telegram_link_code: code, telegram_code_expires: expires })
      .eq('id', user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      code,
      expiresAt: expires,
      // Telegram passes whatever follows ?start= to the bot as /start <payload>.
      url: `https://t.me/${String(bot).replace(/^@/, '')}?start=${code}`,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'unknown' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const user = await me()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const supabase: any = getServiceClient()
    if (!supabase) return NextResponse.json({ error: 'Service client unavailable' }, { status: 500 })

    const { error } = await supabase
      .from('dashboard_users')
      .update({
        telegram_chat_id: null,
        telegram_username: null,
        telegram_linked_at: null,
        telegram_link_code: null,
        telegram_code_expires: null,
      })
      .eq('id', user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, linked: false })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'unknown' }, { status: 500 })
  }
}
