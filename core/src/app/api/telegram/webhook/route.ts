import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/services'
import { sendTelegramMessage, tgEscape } from '@/lib/services/telegram'

export const dynamic = 'force-dynamic'

/**
 * POST /api/telegram/webhook - the bot's inbox.
 *
 * Handles exactly one thing: `/start <code>`, which binds the Telegram chat
 * that sent it to the dashboard user who minted that code. Everything else
 * gets a short reply pointing back at the dashboard, because a bot that
 * silently ignores you reads as broken.
 *
 * This endpoint is PUBLIC - Telegram calls it, not a logged-in browser - so it
 * authenticates the caller by the secret registered with setWebhook. Without
 * that check anyone who found the URL could post a forged /start and attach
 * their own chat to somebody else's reminders.
 *
 * Always returns 200. Telegram retries non-2xx responses, and a retry storm
 * over a message we were never going to act on is worse than dropping it.
 */

function ok(body: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: true, ...body })
}

export async function POST(request: NextRequest) {
  try {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET
    if (secret) {
      const got = request.headers.get('x-telegram-bot-api-secret-token')
      if (got !== secret) return ok({ ignored: 'bad secret' })
    }

    const update = await request.json().catch(() => null)
    const msg = update?.message || update?.edited_message
    const chatId = msg?.chat?.id
    const text = String(msg?.text || '').trim()
    if (!chatId || !text) return ok({ ignored: 'no message' })

    const supabase: any = getServiceClient()
    if (!supabase) return ok({ ignored: 'no service client' })

    const start = text.match(/^\/start\s+([A-Z0-9]{6,16})$/i)
    if (!start) {
      if (/^\/start\b/.test(text)) {
        await sendTelegramMessage(
          'Hi. To connect this chat to your PROXe account, open the dashboard, go to Configure and tap "Connect Telegram". That gives you a link to tap.',
          { chatId: String(chatId) },
        )
      }
      return ok({ handled: 'no code' })
    }

    const code = start[1].toUpperCase()
    const { data: user } = await supabase
      .from('dashboard_users')
      .select('id, full_name, email, telegram_code_expires')
      .eq('telegram_link_code', code)
      .maybeSingle()

    if (!user) {
      await sendTelegramMessage('That code is not valid. Generate a fresh one from the dashboard.', { chatId: String(chatId) })
      return ok({ handled: 'unknown code' })
    }

    // An expired code must fail closed. A stale link forwarded to someone else
    // is exactly the case this protects against.
    if (user.telegram_code_expires && new Date(user.telegram_code_expires).getTime() < Date.now()) {
      await sendTelegramMessage('That link has expired. Generate a fresh one from the dashboard.', { chatId: String(chatId) })
      return ok({ handled: 'expired' })
    }

    const username = msg?.from?.username ? `@${msg.from.username}` : null
    const { error } = await supabase
      .from('dashboard_users')
      .update({
        telegram_chat_id: String(chatId),
        telegram_username: username,
        telegram_linked_at: new Date().toISOString(),
        // Burn the code - one link, one use.
        telegram_link_code: null,
        telegram_code_expires: null,
      })
      .eq('id', user.id)

    if (error) {
      // Almost always the unique index: this chat is already somebody else's.
      await sendTelegramMessage('Could not connect this chat - it may already be linked to another account.', { chatId: String(chatId) })
      return ok({ handled: 'link failed', error: error.message })
    }

    const name = user.full_name || (user.email || '').split('@')[0] || 'there'
    await sendTelegramMessage(
      `Connected. ${tgEscape(name)}, your follow-up reminders will come here.\n\nWhen you log a call and promise to ring someone back, this chat gets the nudge at that time.`,
      { chatId: String(chatId) },
    )
    return ok({ handled: 'linked', user: user.id })
  } catch (error: any) {
    console.error('[telegram/webhook] failed:', error?.message || error)
    return ok({ error: 'handled' })
  }
}
