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
    parameters: Array<{ type: 'text'; text: string }>;
  }>,
  languageCode: string = 'en',
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
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          components,
        },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('[whatsappSender] Template send failed:', res.status, errBody);
      return { success: false, error: errBody };
    }

    return { success: true };
  } catch (err: any) {
    console.error('[whatsappSender] Template send error:', err.message);
    return { success: false, error: err.message };
  }
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
