/**
 * Telegram notifier - one-way messages to a chat or group via the Bot API.
 *
 * Mirrors slackNotifier's contract: env-gated, soft-fail, no-op when unset, so
 * only the deployment whose env carries a token can post and a Telegram outage
 * can never break the caller. The brand's VPS task-worker already talks to a
 * bot (approval gate + command polling); this is the server-side half, used by
 * scheduled briefs where the data lives.
 *
 * Env:
 *   TELEGRAM_BOT_TOKEN   - from @BotFather
 *   TELEGRAM_CHAT_ID     - the group/channel to post briefs into. Negative ids
 *                          are groups (e.g. -1001234567890). Falls back to
 *                          TELEGRAM_ADMIN_CHAT_ID so a deployment that already
 *                          set the worker's variable name keeps working.
 *
 * Formatting is HTML, not MarkdownV2: Telegram's MarkdownV2 requires escaping
 * roughly a dozen characters anywhere they appear, and a single unescaped '.'
 * or '-' in a lead's name returns 400 and drops the whole brief. HTML needs
 * exactly three escapes and is far harder to break with real customer data.
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_ADMIN_CHAT_ID || ''

/** Telegram rejects a sendMessage over 4096 chars outright. */
const MAX_LEN = 4096

export interface TelegramResult {
  success: boolean
  skipped?: boolean
  error?: string
  messageId?: number
}

/** The only three characters that can break Telegram's HTML parse mode. */
export function tgEscape(text: string | null | undefined): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** `<a href="...">label</a>`, with the label escaped. Use for deep links. */
export function tgLink(label: string, url: string): string {
  return `<a href="${tgEscape(url)}">${tgEscape(label)}</a>`
}

export function telegramConfigured(): boolean {
  return Boolean(BOT_TOKEN && CHAT_ID)
}

export async function sendTelegramMessage(
  html: string,
  opts: { chatId?: string; disablePreview?: boolean; silent?: boolean } = {},
): Promise<TelegramResult> {
  const chatId = opts.chatId || CHAT_ID
  if (!BOT_TOKEN || !chatId) {
    // Not an error: a deployment without the env simply doesn't post.
    return { success: false, skipped: true, error: 'TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set' }
  }

  // Truncate rather than let Telegram 400 the whole message. Losing the tail of
  // a long brief beats losing the brief.
  const text =
    html.length > MAX_LEN ? `${html.slice(0, MAX_LEN - 24)}\n\n<i>(truncated)</i>` : html

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: opts.disablePreview !== false,
        disable_notification: opts.silent === true,
      }),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok || body?.ok === false) {
      const description = body?.description || `HTTP ${res.status}`
      console.error('[telegram] send failed:', description)
      return { success: false, error: description }
    }
    return { success: true, messageId: body?.result?.message_id }
  } catch (err: any) {
    console.error('[telegram] send error:', err?.message || err)
    return { success: false, error: err?.message || 'unknown' }
  }
}
