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

// Brand marks for the message body (the sender AVATAR/name is set on the Slack
// app itself — app webhooks ignore per-message username/icon). The logo must be
// a public PNG/JPG URL Slack can fetch (SVG is not rendered). Both overridable
// per-deployment so another brand's channel can reuse this notifier.
const SLACK_BRAND_COLOR = process.env.SLACK_BRAND_COLOR || '#E4002B'; // matches the logo (red)
const SLACK_LOGO_URL = process.env.SLACK_LOGO_URL || 'https://proxe.lokazen.in/logo.png';

export interface SlackResult {
  success: boolean;
  skipped?: boolean;
  error?: string;
}

/** Low-level: POST a raw Slack message payload (text, blocks, and/or attachments). */
export async function sendSlackMessage(payload: {
  text: string;
  blocks?: unknown[];
  attachments?: unknown[];
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

/** Big bold headline (header blocks are plain_text only — no markdown/emoji). */
const header = (title: string) => ({
  type: 'header',
  text: { type: 'plain_text', text: title.slice(0, 150), emoji: false },
});

/** Top branding row: PROXe logo thumbnail + "PROXe · <brand>". */
const brandRow = (brand: string) => ({
  type: 'context',
  elements: [
    { type: 'image', image_url: SLACK_LOGO_URL, alt_text: 'PROXe' },
    { type: 'mrkdwn', text: brand && brand !== 'PROXe' ? `*PROXe* · ${brand}` : '*PROXe*' },
  ],
});

/**
 * Wrap the message in a single attachment so it gets the brand-colour left
 * stripe, with the logo/header on top. Falls back to plain blocks if Slack ever
 * rejects the attachment. `text` is the notification/preview line.
 */
function brandedSend(title: string, brand: string, content: unknown[], text: string, color: string = SLACK_BRAND_COLOR): Promise<SlackResult> {
  const blocks = [header(title), brandRow(brand), ...content.filter(Boolean)];
  return sendSlackMessage({ text, attachments: [{ color, blocks }] });
}

/**
 * Distinct left-stripe colour per Lokazen audience so the team can tell an
 * owner / brand / scout apart at a glance — not one uniform red for everything.
 */
function colorForLeadType(leadType?: string | null): string {
  const t = (leadType || '').toLowerCase();
  if (t.includes('scout')) return '#16A34A'; // green  — scouts
  if (t.includes('owner')) return '#2563EB'; // blue   — property owners
  if (t.includes('brand')) return '#7C3AED'; // purple — brands
  return SLACK_BRAND_COLOR;                   // brand red — fallback / unknown
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

  const who = clean(b.name) || 'Lead';
  const content: unknown[] = [
    section(clean(b.leadType) ? `*${who}*  ·  _${clean(b.leadType)}_` : `*${who}*`),
  ];
  if (clean(b.title)) content.push(section(clean(b.title)));
  content.push(fieldsSection([
    ['Phone', b.phone],
    ['Email', b.email],
    ['When', b.dateTime],
    ['Channel', b.channel],
  ]));
  if (clean(b.summary)) content.push(context(`_${clean(b.summary).slice(0, 500)}_`));

  const text = `New booking · ${brand}: ${who}${b.dateTime ? ` · ${clean(b.dateTime)}` : ''}`;
  return brandedSend('New booking', brand, content, text);
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
  // URL buttons (work from an incoming webhook — no Slack app needed). Each
  // opens a link (e.g. the lead in the dashboard). TRUE in-Slack state buttons
  // (Resolved without leaving Slack) would need a Slack app + request URL.
  actions?: { text: string; url: string; style?: 'primary' | 'danger' }[];
}

/** A lead alert — new lead, hot lead, or a needs-human escalation. */
export async function notifySlackLead(l: LeadNotice): Promise<SlackResult> {
  if (!SLACK_WEBHOOK_URL) return { success: false, skipped: true };
  const brand = l.brandLabel || 'PROXe';
  const title = l.title || 'Lead';

  const who = clean(l.name) || clean(l.email) || clean(l.phone) || 'Lead';
  const content: unknown[] = [
    section(clean(l.leadType) ? `*${who}*  ·  _${clean(l.leadType)}_` : `*${who}*`),
  ];

  // What the lead wants comes first (the glanceable line), then contact/meta.
  const detail = fieldsSection(l.detailFields || []);
  if (detail) content.push(detail);
  else if (clean(l.detail)) content.push(section(`_${clean(l.detail).slice(0, 500)}_`));

  content.push(fieldsSection([
    ['Phone', l.phone],
    ['Email', l.email],
    ['Source', l.source],
    ['Stage', l.stage],
  ]));

  if (l.footer) content.push(context(`_${clean(l.footer)}_`));

  // Action buttons (URL buttons — open the lead in the dashboard so a human can
  // act / mark it resolved there). Rendered when actions are supplied.
  if (l.actions?.length) {
    content.push({
      type: 'actions',
      elements: l.actions.slice(0, 5).map((a) => ({
        type: 'button',
        text: { type: 'plain_text', text: a.text.slice(0, 75), emoji: false },
        url: a.url,
        ...(a.style ? { style: a.style } : {}),
      })),
    });
  }

  const text = `${title} · ${brand}: ${who}${l.score != null ? ` · score ${l.score}` : ''}`;
  return brandedSend(title, brand, content, text, colorForLeadType(l.leadType));
}
