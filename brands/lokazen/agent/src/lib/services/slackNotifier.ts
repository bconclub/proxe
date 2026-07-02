/**
 * Slack notifier — one-way notifications to a Slack channel via an Incoming
 * Webhook. No bot token or scopes: create an Incoming Webhook for the target
 * channel (e.g. #lokazen-proxe) and put its URL in SLACK_WEBHOOK_URL.
 *
 * Messages use clean Block Kit formatting — a bold title line, bold field
 * labels, and italic meta — no emoji clutter, no walls of text. Everything
 * soft-fails: no SLACK_WEBHOOK_URL = no-op, and a Slack outage never breaks a
 * booking or a lead insert. The URL lives in each deployment's env, so only the
 * brand whose Vercel project has it set will post — no cross-brand leakage.
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

// ── Block Kit helpers (bold labels, italic meta, no emoji) ───────────────────

type Pair = [label: string, value?: string | number | null];

const clean = (v: unknown): string =>
  v == null ? '' : String(Array.isArray(v) ? v.join(', ') : v).replace(/\s+/g, ' ').trim();

const section = (mrkdwn: string) => ({ type: 'section', text: { type: 'mrkdwn', text: mrkdwn } });
const context = (mrkdwn: string) => ({ type: 'context', elements: [{ type: 'mrkdwn', text: mrkdwn.slice(0, 300) }] });

/** A labelled field for Slack's 2-column grid: bold label over value. */
function mrkdwnField(label: string, value: unknown): { type: 'mrkdwn'; text: string } | null {
  const v = clean(value);
  if (!v) return null;
  return { type: 'mrkdwn', text: `*${label}*\n${v}` };
}

/** A 2-column fields section from label/value pairs (Slack caps at 10). */
function fieldsSection(pairs: Pair[]): { type: 'section'; fields: unknown[] } | null {
  const fields = pairs
    .map(([label, value]) => mrkdwnField(label, value))
    .filter(Boolean)
    .slice(0, 10);
  if (!fields.length) return null;
  return { type: 'section', fields };
}

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

  const blocks: unknown[] = [section(`*New booking* · _${brand}_`)];
  const who = clean(b.name) || 'Lead';
  const line = clean(b.leadType) ? `*${who}*  ·  _${clean(b.leadType)}_` : `*${who}*`;
  blocks.push(section(line));
  if (clean(b.title)) blocks.push(section(clean(b.title)));

  const fs = fieldsSection([
    ['Phone', b.phone],
    ['Email', b.email],
    ['When', b.dateTime],
    ['Channel', b.channel],
  ]);
  if (fs) blocks.push(fs);
  if (clean(b.summary)) blocks.push(context(`_${clean(b.summary).slice(0, 500)}_`));

  const text = `New booking · ${brand}: ${who}${b.dateTime ? ` · ${clean(b.dateTime)}` : ''}`;
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
  detail?: string | null;         // free-text (rendered italic)
  detailFields?: Pair[];          // structured detail (2-col bold-label fields)
  title?: string;                 // headline text, e.g. "New lead" / "Needs human follow-up"
  footer?: string;                // small italic footer suffix
}

/** A lead alert — new lead, hot lead, or a needs-human escalation. */
export async function notifySlackLead(l: LeadNotice): Promise<SlackResult> {
  if (!SLACK_WEBHOOK_URL) return { success: false, skipped: true };
  const brand = l.brandLabel || 'PROXe';
  const title = l.title || 'Lead';

  const blocks: unknown[] = [section(`*${title}* · _${brand}_`)];

  const who = clean(l.name) || clean(l.email) || clean(l.phone) || 'Lead';
  const line = clean(l.leadType) ? `*${who}*  ·  _${clean(l.leadType)}_` : `*${who}*`;
  blocks.push(section(line));

  const core = fieldsSection([
    ['Phone', l.phone],
    ['Email', l.email],
    ['Source', l.source],
    ['Score', l.score != null ? String(l.score) : null],
    ['Stage', l.stage],
  ]);
  if (core) blocks.push(core);

  const detail = fieldsSection(l.detailFields || []);
  if (detail) blocks.push(detail);
  else if (clean(l.detail)) blocks.push(section(`_${clean(l.detail).slice(0, 500)}_`));

  blocks.push(context(`_${brand} · PROXe${l.footer ? ` · ${l.footer}` : ''}_`));

  const text = `${title} · ${brand}: ${who}${l.score != null ? ` · score ${l.score}` : ''}`;
  return sendSlackMessage({ text, blocks });
}
