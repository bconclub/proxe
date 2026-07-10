/**
 * Slack Web API client — for the INTERACTIVE Slack app (buttons + two-way
 * replies), which the incoming-webhook notifier can't do. Uses a bot token
 * (SLACK_BOT_TOKEN, xoxb-…) so we can:
 *   - post messages and get back the `ts` (thread id) to map Slack ↔ lead,
 *   - render action buttons (Resolved / Not resolved / Assign to me),
 *   - reply in a thread, and update a message after a button click.
 *
 * Requires (per-deployment env):
 *   SLACK_BOT_TOKEN       xoxb-…  (Bot User OAuth Token)
 *   SLACK_SIGNING_SECRET  …       (verify incoming interactivity/events)
 *   SLACK_CHANNEL_ID      C…      (the channel the bot posts alerts to)
 * Everything soft-fails: no token = no-op, and Slack outages never throw into
 * a lead insert.
 */

import crypto from 'crypto';

const SLACK_API = 'https://slack.com/api';

export const slackBotConfigured = (): boolean => !!process.env.SLACK_BOT_TOKEN;
export const slackChannelId = (): string => process.env.SLACK_CHANNEL_ID || '';

interface PostResult { ok: boolean; ts?: string; channel?: string; error?: string }

async function slackCall(method: string, body: Record<string, unknown>): Promise<any> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return { ok: false, error: 'no_bot_token' };
  try {
    const res = await fetch(`${SLACK_API}/${method}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({ ok: false, error: 'bad_json' }));
    if (!data.ok) console.error(`[slackApi] ${method} failed:`, data.error);
    return data;
  } catch (err: any) {
    console.error(`[slackApi] ${method} exception:`, err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}

/** Post a message (optionally in a thread). Returns the ts so callers can map it. */
export async function slackPostMessage(opts: {
  channel?: string; text: string; blocks?: unknown[]; thread_ts?: string; attachments?: unknown[];
}): Promise<PostResult> {
  const channel = opts.channel || slackChannelId();
  if (!channel) return { ok: false, error: 'no_channel' };
  const data = await slackCall('chat.postMessage', {
    channel, text: opts.text, ...(opts.blocks ? { blocks: opts.blocks } : {}),
    ...(opts.attachments ? { attachments: opts.attachments } : {}),
    ...(opts.thread_ts ? { thread_ts: opts.thread_ts } : {}),
    unfurl_links: false, unfurl_media: false,
  });
  return { ok: !!data.ok, ts: data.ts, channel: data.channel, error: data.error };
}

/** Overwrite a message (e.g. after a Resolved button click). */
export async function slackUpdateMessage(opts: { channel: string; ts: string; text: string; blocks?: unknown[]; attachments?: unknown[] }): Promise<PostResult> {
  const data = await slackCall('chat.update', {
    channel: opts.channel, ts: opts.ts, text: opts.text,
    ...(opts.blocks ? { blocks: opts.blocks } : {}),
    ...(opts.attachments ? { attachments: opts.attachments } : {}),
  });
  return { ok: !!data.ok, ts: data.ts, channel: data.channel, error: data.error };
}

/** Look up a Slack user's display name (for "Resolved by …"). */
export async function slackUserName(userId: string): Promise<string> {
  if (!userId) return 'someone';
  const data = await slackCall('users.info', { user: userId });
  return data?.user?.profile?.display_name || data?.user?.real_name || data?.user?.name || 'someone';
}

export interface LeadAlert {
  brandLabel?: string;
  leadId: string;
  title: string;            // "Needs human follow-up" / "Scout support request"
  name?: string | null;
  leadType?: string | null; // Property Owner / Scout / Brand
  phone?: string | null;
  detail?: string | null;
  footer?: string | null;
  dashboardUrl?: string | null; // "View lead" link
  reply?: boolean;          // add the "reply in this thread → WhatsApp" hint
}

/** Blocks for a lead alert with Resolved / Not-resolved / View-lead buttons. */
export function leadAlertBlocks(a: LeadAlert, opts?: { resolved?: string }): unknown[] {
  const clean = (v: unknown) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());
  const brand = a.brandLabel || 'PROXe';
  const who = clean(a.name) || clean(a.phone) || 'Lead';
  const blocks: unknown[] = [
    { type: 'header', text: { type: 'plain_text', text: a.title.slice(0, 150), emoji: false } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `*PROXe* · ${brand}` }] },
    { type: 'section', text: { type: 'mrkdwn', text: clean(a.leadType) ? `*${who}*  ·  _${clean(a.leadType)}_` : `*${who}*` } },
  ];
  if (clean(a.detail)) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `_${clean(a.detail).slice(0, 500)}_` } });
  const fields: unknown[] = [];
  if (clean(a.phone)) fields.push({ type: 'mrkdwn', text: `*Phone*\n${clean(a.phone)}` });
  if (fields.length) blocks.push({ type: 'section', fields });

  if (opts?.resolved) {
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `✅ *Resolved* by ${opts.resolved}` }] });
  } else {
    const elements: unknown[] = [
      { type: 'button', style: 'primary', text: { type: 'plain_text', text: 'Resolved', emoji: false }, action_id: 'lead_resolve', value: a.leadId },
      { type: 'button', text: { type: 'plain_text', text: 'Reopen', emoji: false }, action_id: 'lead_reopen', value: a.leadId },
    ];
    if (a.dashboardUrl) elements.push({ type: 'button', text: { type: 'plain_text', text: 'View lead', emoji: false }, url: a.dashboardUrl });
    blocks.push({ type: 'actions', elements });
    if (a.reply) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: '💬 Reply in this thread to message the customer on WhatsApp.' }] });
  }
  if (clean(a.footer)) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `_${clean(a.footer)}_` }] });
  return blocks;
}

/**
 * Verify an incoming Slack request signature (interactivity + events).
 * https://api.slack.com/authentication/verifying-requests-from-slack
 * `rawBody` MUST be the exact raw request body string.
 */
export function verifySlackSignature(rawBody: string, timestamp: string | null, signature: string | null): boolean {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret || !timestamp || !signature) return false;
  // Reject requests older than 5 minutes (replay protection).
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 60 * 5) return false;
  const base = `v0:${timestamp}:${rawBody}`;
  const hmac = 'v0=' + crypto.createHmac('sha256', secret).update(base).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(signature));
  } catch { return false; }
}
