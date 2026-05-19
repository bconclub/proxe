/**
 * services/whatsappSender.ts - Shared WhatsApp message sending helpers
 *
 * Extracted so both the booking flow (engine.ts) and cron reminders
 * can send WhatsApp messages via the Meta Cloud API.
 *
 * Supports:
 *   - Free-form text messages (within 24h window)
 *   - Template messages (outside 24h window - reminders, re-engagement)
 *   - Auto-fallback: try text first, retry with template if 24h error
 */

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

function getCredentials() {
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    console.error('[whatsappSender] Missing META_WHATSAPP_PHONE_NUMBER_ID or META_WHATSAPP_ACCESS_TOKEN');
    return null;
  }
  return { phoneNumberId, accessToken };
}

/** Normalize phone: strip everything except digits */
function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, '');
}

/** Extract the dynamic suffix from a template URL parameter.
 *  e.g. "https://meet.google.com/abc-defg-hij" → "abc-defg-hij"
 *  e.g. "https://calendar.google.com/calendar/event?eid=XYZ" → "XYZ"
 *  Falls back to the full string if no known pattern matches. */
function extractUrlSuffix(url: string): string {
  // Google Meet: extract code after /
  const meetMatch = url.match(/meet\.google\.com\/(.+)/);
  if (meetMatch) return meetMatch[1];
  // Google Calendar: extract eid param
  const calMatch = url.match(/[?&]eid=([^&]+)/);
  if (calMatch) return calMatch[1];
  // Fallback: return as-is
  return url;
}

/**
 * Send a free-form text message via Meta Cloud API.
 * Only works within the 24-hour customer-initiated window.
 */
export async function sendWhatsAppText(
  to: string,
  message: string,
): Promise<{ success: boolean; error?: string }> {
  const creds = getCredentials();
  if (!creds) return { success: false, error: 'Missing credentials' };

  try {
    const res = await fetch(`${GRAPH_API_BASE}/${creds.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizePhone(to),
        type: 'text',
        text: { preview_url: true, body: message },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('[whatsappSender] Text send failed:', res.status, errBody);
      return { success: false, error: errBody };
    }

    return { success: true };
  } catch (err: any) {
    console.error('[whatsappSender] Text send error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Send a template message via Meta Cloud API.
 * Works outside the 24-hour window (requires approved templates).
 *
 * @param templateName - The approved template name in Meta (e.g. "booking_confirmation")
 * @param components - Template variable components
 */
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  components: Array<{
    type: 'body' | 'header' | 'button';
    sub_type?: 'url' | 'quick_reply';
    index?: number;
    parameters: Array<any>;
  }>,
  languageCode: string = 'en',
): Promise<{
  success: boolean;
  error?: string;
  messageId?: string;  // Meta's wamid… — needed for delivery status tracking
  statusCode?: number; // HTTP status from Graph API (200, 400, 401, etc.)
}> {
  const creds = getCredentials();
  if (!creds) return { success: false, error: 'Missing credentials (META_WHATSAPP_PHONE_NUMBER_ID / META_WHATSAPP_ACCESS_TOKEN)' };

  try {
    const res = await fetch(`${GRAPH_API_BASE}/${creds.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizePhone(to),
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          components,
        },
      }),
    });

    const statusCode = res.status;

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`[whatsappSender] Template send FAILED status=${statusCode} template=${templateName} to=${normalizePhone(to)}:`, errBody);
      return { success: false, error: errBody, statusCode };
    }

    const body = await res.json().catch(() => ({}));
    const messageId = body?.messages?.[0]?.id;
    console.log(`[whatsappSender] Template send OK status=${statusCode} template=${templateName} to=${normalizePhone(to)} messageId=${messageId}`);
    return { success: true, messageId, statusCode };
  } catch (err: any) {
    console.error(`[whatsappSender] Template send EXCEPTION template=${templateName} to=${normalizePhone(to)}:`, err?.message || err);
    return { success: false, error: err?.message || String(err) };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Template-body renderers — match the Meta-approved template strings exactly so
// what we log to `conversations` is what the customer actually sees on WhatsApp.
// Update these whenever the corresponding Meta template body changes.
// ──────────────────────────────────────────────────────────────────────────────

export function renderPATResultBody(
  firstName: string,
  score100: number,
  tierLabel: string,
  tierMessage: string,
): string {
  return `Hi ${firstName}, your Pilot Assessment result is in: *${score100}/100* — Tier: *${tierLabel}*. ${tierMessage}`;
}

export function renderDemoOnlineBody(
  firstName: string,
  dateDisplay: string,
  timeDisplay: string,
): string {
  return [
    `Hi ${firstName}, your online demo session is confirmed.`,
    ``,
    `Date: *${dateDisplay}*`,
    `Time: *${timeDisplay}*`,
    ``,
    `*What to expect:* programs walkthrough, eligibility check, clear next steps.`,
    ``,
    `Meeting link arrives 30 minutes before the session.`,
    ``,
    `See you online.`,
    `_Team Windchasers_`,
  ].join('\n');
}

export function renderDemoOfflineBody(
  firstName: string,
  dateDisplay: string,
  timeDisplay: string,
): string {
  return [
    `Hi ${firstName}, your demo session is confirmed.`,
    ``,
    `Date: *${dateDisplay}*`,
    `Time: *${timeDisplay}*`,
    ``,
    `*What to expect:* programs walkthrough, eligibility check, clear next steps.`,
    ``,
    `See you at the academy.`,
    `_Team Windchasers_`,
  ].join('\n');
}

/**
 * Send a booking confirmation message.
 * Tries free-form text first (within 24h window), falls back to template.
 *
 * Template: booking_confirmation
 *   {{1}} = name, {{2}} = call title, {{3}} = date/time display
 */
export async function sendBookingConfirmation(
  to: string,
  name: string,
  title: string,
  dateTimeDisplay: string,
  meetLink: string,
): Promise<boolean> {
  const message =
    `Hey ${name}! Your ${title} with the BCON team is confirmed.\n\n` +
    `📅 ${dateTimeDisplay} IST\n` +
    (meetLink ? `📍 ${meetLink}\n\n` : '\n') +
    `Talk soon!`;

  // Try free-form text first (should work within 24h window)
  const textResult = await sendWhatsAppText(to, message);

  if (textResult.success) {
    console.log('[whatsappSender] Booking confirmation sent (text)');
    return true;
  }

  // If text failed (likely 24h window), try template
  // Template vars: {{1}}=name, {{2}}=title, {{3}}=dateTime + URL button for meet link
  console.log('[whatsappSender] Text failed, trying template fallback...');
  const templateComponents: Array<any> = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: name },
        { type: 'text', text: title },
        { type: 'text', text: dateTimeDisplay },
      ],
    },
  ];
  // Add URL button parameter if meet link is provided
  // booking_confirmation button 0 = "Add to Calendar" (URL: calendar.google.com/...?eid={{1}})
  if (meetLink) {
    templateComponents.push({
      type: 'button',
      sub_type: 'url',
      index: 0,
      parameters: [{ type: 'text', text: extractUrlSuffix(meetLink) }],
    });
  }
  const templateResult = await sendWhatsAppTemplate(to, 'booking_confirmation', templateComponents);

  if (templateResult.success) {
    console.log('[whatsappSender] Booking confirmation sent (template)');
    return true;
  }

  console.error('[whatsappSender] Both text and template failed for', to);
  return false;
}

/**
 * Send a booking reminder message (always uses template - outside 24h window).
 *
 * Template: booking_reminder
 *   {{1}} = name, {{2}} = call title, {{3}} = date/time display
 */
export async function sendBookingReminder(
  to: string,
  name: string,
  title: string,
  timeDisplay: string,
  meetLink: string,
  type: '24h' | '1h' | '30m',
): Promise<boolean> {
  const templateName = 'booking_reminder';

  const dateTimeText =
    type === '24h' ? `tomorrow at ${timeDisplay} IST` :
    type === '1h'  ? `today, starts in 1 hour` :
                     `today, starts in 30 minutes`;

  const message24h =
    `Hey ${name}! Quick reminder, your ${title} with BCON is tomorrow at ${timeDisplay} IST.\n\n` +
    (meetLink ? `📍 ${meetLink}\n\n` : '') +
    `See you there!`;

  const message1h =
    `Hey ${name}! Your ${title} with BCON starts in 1 hour.\n\n` +
    (meetLink ? `📍 ${meetLink}\n\n` : '') +
    `Ready when you are.`;

  const message30m =
    `Hey ${name}! Your ${title} with BCON starts in 30 minutes!\n\n` +
    (meetLink ? `📍 Join here: ${meetLink}\n\n` : '') +
    `See you soon!`;

  // Reminders are always outside 24h window - use template
  // Template vars: {{1}}=name, {{2}}=title, {{3}}=dateTime + URL button for meet link
  const reminderComponents: Array<any> = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: name },
        { type: 'text', text: title },
        { type: 'text', text: dateTimeText },
      ],
    },
  ];
  // booking_reminder button 0 = "Join Meeting" (URL: meet.google.com/{{1}})
  // Always include button param - Meta requires it even if no real link
  reminderComponents.push({
    type: 'button',
    sub_type: 'url',
    index: 0,
    parameters: [{ type: 'text', text: meetLink ? extractUrlSuffix(meetLink) : 'bconclub.com' }],
  });
  const result = await sendWhatsAppTemplate(to, templateName, reminderComponents);

  if (result.success) {
    console.log(`[whatsappSender] ${type} reminder sent to ${to}`);
    return true;
  }

  // If template not yet approved, try text as fallback (might work if recent interaction)
  const fallbackMessage =
    type === '24h' ? message24h :
    type === '1h'  ? message1h :
                     message30m;
  const textResult = await sendWhatsAppText(to, fallbackMessage);
  if (textResult.success) {
    console.log(`[whatsappSender] ${type} reminder sent via text fallback to ${to}`);
    return true;
  }

  console.error(`[whatsappSender] ${type} reminder failed for ${to}`);
  return false;
}

/**
 * Welcome message for leads who came in via a Facebook / Meta Lead Ad form.
 * Distinct from the generic first-outreach so we can tailor copy to ad context.
 *
 * Template: windchasers_facebook_welcome
 *   {{1}} = first name
 */
export async function sendFacebookLeadWelcome(
  to: string,
  name: string,
): Promise<{ success: boolean; error?: string }> {
  const firstName = (name || 'there').split(' ')[0];
  return sendWhatsAppTemplate(to, 'windchasers_facebook_welcome', [
    {
      type: 'body',
      parameters: [{ type: 'text', text: firstName }],
    },
  ]);
}

// NOTE: sendFirstOutreach() was removed because the 'windchasers_followup'
// template was never approved in Meta — every call was failing silently.
// To re-enable a first-outreach flow:
//   1. Submit a new template in Meta Business Manager and wait for approval
//   2. Add a new sender here referencing the approved name
//   3. Wire it back into inbound/route.ts where the disabled branch is
//      commented out

/**
 * Send a demo booking confirmation message.
 *
 * Two templates depending on format:
 *
 * OFFLINE — windchasers_demo_offline_v1
 *   {{1}} = first name · {{2}} = date · {{3}} = time
 *   No buttons (no Meet link, no Add to Calendar — user comes to the facility).
 *
 * ONLINE — windchasers_demo_online (note: no _v1 suffix; Meta-approved name)
 *   {{1}} = first name · {{2}} = date · {{3}} = time
 *   Button 0 (URL, dynamic): base64 Google Calendar eventId.
 *   URL pattern registered in Meta: https://calendar.google.com/calendar/event?eid={{1}}
 *   The Meet link itself arrives via booking_reminder 30 mins before the session.
 */
export type DemoFormat = 'online' | 'offline';

export async function sendDemoConfirmation(
  to: string,
  name: string,
  dateDisplay: string,
  timeDisplay: string,
  format: DemoFormat,
  _calendarEventId?: string | null,
): Promise<{ success: boolean; error?: string }> {
  const firstName = (name || 'there').split(' ')[0];
  // Both demo templates use the same 3 NAMED body params and have STATIC buttons
  // (Get Directions link / Quick Reply buttons). No button component is needed
  // in the send call.
  // The `_calendarEventId` arg is kept on the signature for backward compat /
  // future use if the online template ever switches to a dynamic Add-to-Cal URL.
  const components: Array<any> = [
    {
      type: 'body',
      parameters: [
        { type: 'text', parameter_name: 'customer_name', text: firstName },
        { type: 'text', parameter_name: 'date',          text: dateDisplay },
        { type: 'text', parameter_name: 'time',          text: timeDisplay },
      ],
    },
  ];
  const templateName = format === 'offline'
    ? 'windchasers_demo_offline_v1'
    : 'windchasers_demo_online';
  return sendWhatsAppTemplate(to, templateName, components);
}

/**
 * @deprecated Use sendDemoConfirmation(... format, calendarEventId) directly.
 * Kept for backward compatibility with existing callers that haven't been
 * migrated yet. Defaults to offline format (safe — no Meet link assumed).
 *
 * The legacy parameter `meetLink` is intentionally unused: the new templates
 * don't take a Meet code in the body and the offline template has no button.
 */
export async function sendDemoBookedConfirmation(
  to: string,
  name: string,
  dateDisplay: string,
  timeDisplay: string,
  _meetLink?: string | null,
): Promise<{ success: boolean; error?: string }> {
  return sendDemoConfirmation(to, name, dateDisplay, timeDisplay, 'offline');
}

/**
 * Send a PAT (Pilot Aptitude Test) result message after the lead completes the test.
 *
 * Template: windchasers_pat_result_v1
 *   {{1}} = first name
 *   {{2}} = score displayed as /100 (e.g. "58") — converted from raw /150
 *   {{3}} = tier UX label (e.g. "Premium", "Strong", "Moderate", "Early Stage")
 *   {{4}} = tier-specific next-step message
 */
export const TIER_LABELS: Record<string, string> = {
  premium:     'Premium',
  strong:      'Strong',
  moderate:    'Moderate',
  'not-ready': 'Early Stage',
};

export const TIER_MESSAGES: Record<string, string> = {
  premium:
    'Strong fit for CPL track. A counsellor can walk you through timeline and next steps.',
  strong:
    "You're well-positioned. Worth a 1:1 to map your training path.",
  moderate:
    'Good foundation. A counsellor can map out the right program for your goals.',
  'not-ready':
    'Strong foundation matters more than first score. Talk to a counsellor about prep options.',
};

export async function sendPATResult(
  to: string,
  name: string,
  rawScore: number,
  tier: string,
): Promise<{ success: boolean; error?: string }> {
  const firstName = (name || 'there').split(' ')[0];
  const score100 = Math.round((Number(rawScore) * 100) / 150);
  const tierKey = (tier || '').toLowerCase().trim();
  const tierLabel = TIER_LABELS[tierKey] || tierKey
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase()) || 'Pending';
  const tierMessage = TIER_MESSAGES[tierKey] || 'A counsellor can walk you through the next steps.';

  // Meta template uses NAMED params (customer_name / score / tier / tier_message).
  // Quick-reply buttons are static — no button component needed in the send call.
  const components: Array<any> = [
    {
      type: 'body',
      parameters: [
        { type: 'text', parameter_name: 'customer_name', text: firstName },
        { type: 'text', parameter_name: 'score', text: String(score100) },
        { type: 'text', parameter_name: 'tier', text: tierLabel },
        { type: 'text', parameter_name: 'tier_message', text: tierMessage },
      ],
    },
  ];
  return sendWhatsAppTemplate(to, 'windchasers_pat_result_v1', components);
}

/**
 * Send a missed call follow-up message (R&R = Rang, No Reply).
 * Tries free-form text first (within 24h window), falls back to template.
 *
 * Template: missed_call_followup
 *   {{1}} = name, {{2}} = call title, {{3}} = booked time (or fallback text)
 */
export async function sendMissedCallMessage(
  to: string,
  name: string,
  title: string,
  bookedTimeDisplay: string | null,
): Promise<boolean> {
  const timeRef = bookedTimeDisplay
    ? ` at your booked time (${bookedTimeDisplay} IST)`
    : '';

  const message =
    `Hey ${name}, we tried calling you${timeRef} but weren't able to connect.\n\n` +
    `If you'd like to reschedule, just reply here and we'll set up a new time.\n\n` +
    `- The BCON Team`;

  // Try free-form text first (works if lead messaged within 24h)
  const textResult = await sendWhatsAppText(to, message);

  if (textResult.success) {
    console.log('[whatsappSender] Missed call message sent (text) to', to);
    return true;
  }

  // Fallback to template (for outside 24h window)
  console.log('[whatsappSender] Text failed for missed call, trying template fallback...');
  const templateResult = await sendWhatsAppTemplate(to, 'missed_call_followup', [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: name },
        { type: 'text', text: title },
        { type: 'text', text: bookedTimeDisplay || 'the scheduled time' },
      ],
    },
  ]);

  if (templateResult.success) {
    console.log('[whatsappSender] Missed call message sent (template) to', to);
    return true;
  }

  console.error('[whatsappSender] Both text and template failed for missed call to', to);
  return false;
}
