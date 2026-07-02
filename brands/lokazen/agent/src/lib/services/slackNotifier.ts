/**
 * Slack notifier — one-way, richly-formatted notifications to a Slack channel
 * via an Incoming Webhook. No bot token or scopes needed: create an Incoming
 * Webhook for the target channel (e.g. #lokazen-proxe) and put its URL in
 * SLACK_WEBHOOK_URL.
 *
 * Every message is built with Block Kit (header + divider + 2-column fields +
 * context footer) — never a raw wall of text. Everything soft-fails: if
 * SLACK_WEBHOOK_URL is unset, calls are no-ops (dark until configured, and a
 * Slack outage never breaks a booking or a lead insert). Because the URL lives
 * in each deployment's env, only the brand whose Vercel project has it set will
 * post — no cross-brand leakage even though this module is shared.
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

// ── Block Kit helpers ────────────────────────────────────────────────────────

type Pair = [label: string, value?: string | number | null];

const clean = (v: unknown): string =>
  v == null ? '' : String(Array.isArray(v) ? v.join(', ') : v).replace(/\s+/g, ' ').trim();

/** A labelled mrkdwn field (rendered in Slack's 2-column grid). Null if empty. */
function mrkdwnField(label: string, value: unknown): { type: 'mrkdwn'; text: string } | null {
  const v = clean(value);
  if (!v) return null;
  return { type: 'mrkdwn', text: `*${label}*\n${v}` };
}

/** Build a fields section from label/value pairs (Slack caps at 10 fields). */
function fieldsSection(pairs: Pair[]): { type: 'section'; fields: unknown[] } | null {
  const fields = pairs
    .map(([label, value]) => mrkdwnField(label, value))
    .filter(Boolean)
    .slice(0, 10);
  if (!fields.length) return null;
  return { type: 'section', fields };
}

const HEADER = (text: string) => ({
  type: 'header',
  text: { type: 'plain_text', text: text.slice(0, 150), emoji: true },
});
const DIVIDER = { type: 'divider' };
const CONTEXT = (text: string) => ({
  type: 'context',
  elements: [{ type: 'mrkdwn', text: text.slice(0, 300) }],
});

// ── Booking notification ─────────────────────────────────────────────────────

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

  const blocks: unknown[] = [HEADER(`📅 New Booking · ${brand}`), DIVIDER];
  if (clean(b.title)) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*:pushpin: ${clean(b.title)}*` } });
  }
  const fs = fieldsSection([
    ['👤 Name', b.name],
    ['📱 Phone', b.phone],
    ['📧 Email', b.email],
    ['🏷️ Type', b.leadType],
    ['🗓️ When', b.dateTime],
    ['💬 Channel', b.channel],
  ]);
  if (fs) blocks.push(fs);
  if (clean(b.summary)) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `>${clean(b.summary).slice(0, 500)}` } });
  }
  blocks.push(DIVIDER, CONTEXT(`${brand} · PROXe · booking`));

  const text = `📅 New Booking · ${brand}: ${clean(b.name) || 'Lead'} (${clean(b.phone) || 'no phone'})${b.dateTime ? ` · ${clean(b.dateTime)}` : ''}`;
  return sendSlackMessage({ text, blocks });
}

// ── Lead notification (new lead / hot lead / needs-human) ────────────────────

export interface LeadNotice {
  brandLabel?: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  leadType?: string | null; // Brand / Property Owner
  score?: number | null;
  stage?: string | null;
  source?: string | null;
  detail?: string | null;         // free-text (rendered as a quote block)
  detailFields?: Pair[];          // structured detail (rendered as 2-col fields)
  headline?: string;              // override the header line
  footer?: string;                // override the context footer suffix
}

/** A lead alert — new lead, hot lead, or a needs-human escalation. */
export async function notifySlackLead(l: LeadNotice): Promise<SlackResult> {
  if (!SLACK_WEBHOOK_URL) return { success: false, skipped: true };
  const brand = l.brandLabel || 'PROXe';
  const head = l.headline || `🔥 Hot Lead · ${brand}`;

  const blocks: unknown[] = [HEADER(head), DIVIDER];

  const core = fieldsSection([
    ['👤 Name', l.name],
    ['📱 Phone', l.phone],
    ['📧 Email', l.email],
    ['🏷️ Type', l.leadType],
    ['📊 Score', l.score != null ? String(l.score) : null],
    ['📶 Stage', l.stage],
    ['🌐 Source', l.source],
  ]);
  if (core) blocks.push(core);

  // Structured Brand/Property detail as its own labelled fields block.
  const detail = fieldsSection(l.detailFields || []);
  if (detail) blocks.push(DIVIDER, detail);
  else if (clean(l.detail)) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `>${clean(l.detail).slice(0, 500)}` } });
  }

  blocks.push(DIVIDER, CONTEXT(`${brand} · PROXe${l.footer ? ` · ${l.footer}` : ''}`));

  const text = `${head}: ${clean(l.name) || 'Lead'} (${clean(l.phone) || 'no phone'})${l.score != null ? ` · score ${l.score}` : ''}`;
  return sendSlackMessage({ text, blocks });
}
