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
// Who to @-ping on every escalation. Set SLACK_MENTION_USER_ID per deployment;
// comma-separate for several. Each token maps to a real Slack mention:
//   channel / here / everyone  → <!channel> / <!here> / <!everyone>
//   U0ABC123 (member id)        → <@U0ABC123>
//   !subteam^S0ABC123 (group)   → <!subteam^S0ABC123>
// Empty = no ping (and no cross-brand bleed — only the brand whose env sets it).
const SLACK_MENTION = (process.env.SLACK_MENTION_USER_ID || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((id) => {
    const low = id.toLowerCase();
    if (low === 'channel' || low === 'here' || low === 'everyone') return `<!${low}>`;
    if (id.startsWith('!subteam^')) return `<${id}>`;
    return `<@${id}>`;
  })
  .join(' ');

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
  v == null ? '' : String(Array.isArray(v) ? v.join(', ') : v)
    .replace(/[—–]/g, '-') // never em/en dashes in alerts — use a hyphen
    .replace(/\s+/g, ' ')
    .trim();

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

// Alert stripe palette, by MEANING not audience, so the team reads the colour
// at a glance: booking = green, scout = orange, high-intensity issue = red,
// standard issue = amber.
const ALERT_GREEN = '#16A34A';  // booking confirmed
const ALERT_ORANGE = '#F97316'; // scout notification
const ALERT_RED = '#DC2626';    // high-intensity issue
const ALERT_AMBER = '#F59E0B';  // standard issue

/** Colour for an escalation/issue alert: scout = orange, else red (high
 *  intensity) or amber (standard), judged from the title + reason text. */
function alertColor(leadType?: string | null, title?: string | null, detail?: string | null): string {
  const who = `${leadType || ''} ${title || ''}`.toLowerCase();
  if (who.includes('scout')) return ALERT_ORANGE;
  const blob = `${title || ''} ${detail || ''}`.toLowerCase();
  const HIGH = /(payment|debit|deducted|refund|charged|chargeback|not received|angry|urgent|complaint|legal|fraud|failed|false booking|could not|couldn'?t|escalat|not working|stuck|double|abuse|threat)/;
  return HIGH.test(blob) ? ALERT_RED : ALERT_AMBER;
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
  leadUrl?: string;         // dashboard URL -> renders a "View lead" action button
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

  // Direct-action button on the lead (green = a confirmed booking).
  if (clean(b.leadUrl)) {
    content.push({
      type: 'actions',
      elements: [{ type: 'button', text: { type: 'plain_text', text: 'View lead in dashboard', emoji: false }, url: clean(b.leadUrl), style: 'primary' }],
    });
  }

  const text = `New booking · ${brand}: ${who}${b.dateTime ? ` · ${clean(b.dateTime)}` : ''}`;
  return brandedSend('New booking', brand, content, text, ALERT_GREEN);
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
  leadUrl?: string;               // dashboard URL — renders the lead name as a clickable "tag"
  title?: string;                 // headline text, e.g. "New lead" / "Needs human follow-up"
  footer?: string;                // small italic footer suffix
  // URL buttons (work from an incoming webhook — no Slack app needed). Each
  // opens a link (e.g. the lead in the dashboard). TRUE in-Slack state buttons
  // (Resolved without leaving Slack) would need a Slack app + request URL.
  actions?: { text: string; url: string; style?: 'primary' | 'danger' }[];
}

/** Compact channel chip — an icon + the channel name (WhatsApp / Web / …). */
function channelBadge(source?: string | null): string {
  const s = clean(source).toLowerCase();
  if (!s) return '';
  if (s.includes('whatsapp')) return '🟢 WhatsApp';
  if (s.includes('web')) return '🌐 Web';
  if (s.includes('voice') || s.includes('call')) return '📞 Voice';
  if (s.includes('instagram') || s.includes('ig')) return '📸 Instagram';
  if (s.includes('facebook') || s === 'fb') return '📘 Facebook';
  return `💬 ${clean(source)}`;
}

/**
 * A lead alert — new lead, hot lead, or a needs-human escalation. Compact by
 * design: a short attachment (5 blocks max) so Slack never collapses it behind
 * "show more" and the action button stays on the first view. Phone + channel
 * render as icon chips, not a fields grid. If SLACK_MENTION_USER_ID is set, the
 * alert @-pings that member/group so it actually notifies someone.
 */
export async function notifySlackLead(l: LeadNotice): Promise<SlackResult> {
  if (!SLACK_WEBHOOK_URL) return { success: false, skipped: true };
  const title = l.title || 'Lead';

  const who = clean(l.name) || clean(l.email) || clean(l.phone) || 'Lead';
  // Clickable "tag" for the lead (opens it in the dashboard).
  const whoTag = clean(l.leadUrl) ? `<${clean(l.leadUrl)}|${who}>` : `*${who}*`;

  const blocks: unknown[] = [
    header(title),
    // Mention (real ping) + lead tag + type on the first line.
    // NOTE: the @mention lives ONLY in the top-level notification text below (it
    // fires the ping there). Do NOT repeat it here or it shows twice.
    section(`${whoTag}${clean(l.leadType) ? `   ·   _${clean(l.leadType)}_` : ''}`),
  ];

  // Captured brief — the Brand/Property fields (category, areas, size, budget…),
  // one compact multiline block. Only non-empty fields render.
  const brief = (l.detailFields || [])
    .filter(([, v]) => clean(v == null ? '' : String(v)))
    .map(([k, v]) => `*${clean(k)}:*  ${clean(String(v))}`);
  if (brief.length) blocks.push(section(brief.join('\n')));

  // The issue, one glanceable italic line.
  if (clean(l.detail)) blocks.push(section(`_${clean(l.detail).slice(0, 400)}_`));

  // Compact meta: phone chip + channel chip on ONE line (no fields grid).
  const meta: string[] = [];
  if (clean(l.phone)) meta.push(`📞 ${clean(l.phone)}`);
  const cb = channelBadge(l.source);
  if (cb) meta.push(cb);
  if (meta.length) blocks.push(section(meta.join('       ')));

  // Action button — kept inside the short attachment so it shows on first view.
  if (l.actions?.length) {
    blocks.push({
      type: 'actions',
      elements: l.actions.slice(0, 3).map((a) => ({
        type: 'button',
        text: { type: 'plain_text', text: a.text.slice(0, 75), emoji: false },
        url: a.url,
        ...(a.style ? { style: a.style } : {}),
      })),
    });
  }

  // Mention also in the top-level notification text so the ping fires reliably.
  const text = `${SLACK_MENTION ? `${SLACK_MENTION} ` : ''}${title}: ${who}`;
  return sendSlackMessage({ text, attachments: [{ color: alertColor(l.leadType, l.title, l.detail), blocks }] });
}
