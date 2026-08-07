import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/services'
import { sendTelegramMessage, tgEscape } from '@/lib/services/telegram'
import { answerQuestion } from '@/lib/services/telegramAsk'

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

/** What PROXe says when someone new arrives, or when asked what it does. */
export function introMessage(names: string[] = []): string {
  const hello = names.length ? `Welcome ${names.join(', ')}.` : 'Hello.'
  return [
    `👋 <b>${hello}</b>`,
    '',
    "I'm PROXe. I watch the leads for WindChasers and post here so nobody has to go looking.",
    '',
    '<b>What I post on my own</b>',
    'Three reports a day - 9am, 1pm and 8pm. New leads, where they came from, what they want, calls made, bookings and demos.',
    '',
    '<b>Ask me any time</b>',
    '/report - the day so far, up to this second',
    '/calls - calls logged today, and by whom',
    '',
    '<b>Or ask in your own words</b>',
    'Use /ask, or just reply to any message of mine:',
    '<code>/ask how many leads today</code>',
    '<code>/ask leads from Instagram yesterday</code>',
    '<code>/ask cabin crew leads this week</code>',
    '<code>/ask how many booked today</code>',
    '<code>/ask demos taken</code>',
    '',
    '<i>For your own call-back reminders, open the dashboard, Configure, Notifications, Connect Telegram. Those come to you privately, not here.</i>',
  ].join('\n')
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
    if (!chatId) return ok({ ignored: 'no chat' })

    // Someone joined the group. Introduce yourself once, to the room - a bot
    // that sits silent until spoken to is a bot nobody knows how to speak to.
    if (Array.isArray(msg?.new_chat_members) && msg.new_chat_members.length) {
      const joined = msg.new_chat_members
        .filter((m: any) => !m.is_bot)
        .map((m: any) => tgEscape(m.first_name || 'there'))
      if (joined.length) {
        await sendTelegramMessage(introMessage(joined), { chatId: String(chatId) })
      }
      return ok({ handled: 'welcome' })
    }

    const text = String(msg?.text || '').trim()
    if (!text) return ok({ ignored: 'no text' })

    const supabase: any = getServiceClient()
    if (!supabase) return ok({ ignored: 'no service client' })

    const start = text.match(/^\/start\s+([A-Z0-9]{6,16})$/i)
    if (!start) {
      // TWO commands, and nothing else.
      //
      // Free-text questions were tried and dropped: @mentions did not reach
      // the bot reliably under privacy mode, and a feature that answers
      // sometimes is worse than one that is not offered. Commands always
      // arrive, so commands are what exist. More can be added when one is
      // actually wanted.
      const base = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '')

      if (/^\/report(@\S+)?\b/i.test(text)) {
        // Fire and forget - the brief route posts the card itself, and waiting
        // on it here would risk Telegram retrying the whole update.
        if (base) fetch(`${base}/api/cron/telegram-brief?kind=pulse`).catch(() => {})
        return ok({ handled: 'report' })
      }

      if (/^\/calls(@\S+)?\b/i.test(text)) {
        const answer = await answerQuestion('how many calls today')
        await sendTelegramMessage(answer || 'Could not read the calls just now.', { chatId: String(chatId) })
        return ok({ handled: 'calls' })
      }

      if (/^\/(help|start)(@\S+)?\b/i.test(text)) {
        await sendTelegramMessage(introMessage(), { chatId: String(chatId) })
        return ok({ handled: 'help' })
      }

      // Free-text questions, by every route that actually reaches a bot in a
      // group under privacy mode:
      //   /ask ...          a command, so it always arrives
      //   a REPLY to PROXe  replies to the bot are always delivered
      //   @mention          delivered on most clients, not all - hence the
      //                     other two, which do not depend on it
      const botName = String(process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '').toLowerCase()
      const isAsk = /^\/ask(@\S+)?\b/i.test(text)
      const isReplyToBot = msg?.reply_to_message?.from?.is_bot === true
      const isMention = !!botName && text.toLowerCase().includes(`@${botName}`)
      const isPrivate = msg?.chat?.type === 'private'

      if (isAsk || isReplyToBot || isMention || isPrivate) {
        const question = text
          .replace(/^\/ask(@\S+)?\s*/i, '')
          .replace(new RegExp(`@${botName}`, 'ig'), '')
          .trim()
        const answer = await answerQuestion(question || 'help')
        await sendTelegramMessage(answer || 'Ask me about leads, calls, bookings or demos.', {
          chatId: String(chatId),
        })
        return ok({ handled: 'asked' })
      }

      return ok({ handled: 'not a command' })
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
