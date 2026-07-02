/**
 * Slack notifier — one-way notifications to a Slack channel via an Incoming
 * Webhook. No bot token or scopes needed: create an Incoming Webhook for the
 * target channel (e.g. #lokazen-proxe) and put its URL in SLACK_WEBHOOK_URL.
 *
 * Everything soft-fails: if SLACK_WEBHOOK_URL is unset, calls are no-ops (so
 * the integration is dark until the URL is configured, and a Slack outage
 * never breaks a booking or a lead insert). Because the URL lives in each
 * deployment's env, only the brand whose Vercel project has it set will post —
 * no cross-brand leakage even though this module is shared.
 */

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || '';

export interface SlackResult {
  success: boolean;
  skipped?: boolean;
  error?: string;
}

/** Low-level: POST a raw Slack message payload (text and/or Block Kit blocks). */
export async function sendSlackMessage(payload: {
  text: string;
  blocks?: unknown[];
}): Promise<SlackResult> {
  if (!SLACK_WEBHOOK_URL) {
    return { success: false, skipped: true };
  }
  try {
    const res = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[slackNotifier] send failed status=${res.status} body=${body.slice(0, 200)}`);
      return { success: false, error: `HTTP ${res.status}` };
    }
    return { success: true };
  } catch (err: any) {
    console.error('[slackNotifier] send exception:', err?.message || err);
    return { success: false, error: err?.message || String(err) };
  }
}

function field(label: string, value?: string | null): { type: 'mrkdwn'; text: string } | null {
  const v = (value ?? '').toString().trim();
  if (!v) return null;
  return { type: 'mrkdwn', text: `*${label}*\n${v}` };
}

export interface BookingNotice {
  brandLabel?: string;      // e.g. "Lokazen"
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  leadType?: string | null; // Brand / Property Owner / Scout
  dateTime?: string | null; // human-readable, e.g. "Thu, 3 Jul · 3:00 PM IST"
  title?: string | null;    // call topic
  channel?: string | null;  // web / whatsapp / voice
  summary?: string | null;  // short conversation summary
}

/** A call/demo has just been booked. */
export async function notifySlackBooking(b: BookingNotice): Promise<SlackResult> {
  if (!SLACK_WEBHOOK_URL) return { success: false, skipped: true };
  const brand = b.brandLabel || 'PROXe';
  const fields = [
    field('Name', b.name),
    field('Phone', b.phone),
    field('Email', b.email),
    field('Type', b.leadType),
    field('When', b.dateTime),
    field('Channel', b.channel),
  ].filter(Boolean);

  const blocks: unknown[] = [
    { type: 'header', text: { type: 'plain_text', text: `📅 New Booking — ${brand}`, emoji: true } },
  ];
  if (b.title) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*${b.title}*` } });
  if (fields.length) blocks.push({ type: 'section', fields });
  if (b.summary) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: b.summary.slice(0, 280) }] });

  const text = `📅 New Booking — ${brand}: ${b.name || 'Lead'} (${b.phone || 'no phone'})${b.dateTime ? ` · ${b.dateTime}` : ''}`;
  return sendSlackMessage({ text, blocks });
}

export interface LeadNotice {
  brandLabel?: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  leadType?: string | null; // Brand / Property Owner
  score?: number | null;
  stage?: string | null;
  source?: string | null;
  detail?: string | null;   // what they want (property type/size/zone, brand requirement, etc.)
  headline?: string;        // override the header line
}

/** A high-priority / hot lead needs attention. */
export async function notifySlackLead(l: LeadNotice): Promise<SlackResult> {
  if (!SLACK_WEBHOOK_URL) return { success: false, skipped: true };
  const brand = l.brandLabel || 'PROXe';
  const head = l.headline || `🔥 Hot Lead — ${brand}`;
  const fields = [
    field('Name', l.name),
    field('Phone', l.phone),
    field('Email', l.email),
    field('Type', l.leadType),
    field('Score', l.score != null ? String(l.score) : null),
    field('Stage', l.stage),
    field('Source', l.source),
  ].filter(Boolean);

  const blocks: unknown[] = [
    { type: 'header', text: { type: 'plain_text', text: head, emoji: true } },
  ];
  if (l.detail) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: l.detail } });
  if (fields.length) blocks.push({ type: 'section', fields });

  const text = `${head}: ${l.name || 'Lead'} (${l.phone || 'no phone'})${l.score != null ? ` · score ${l.score}` : ''}`;
  return sendSlackMessage({ text, blocks });
}
