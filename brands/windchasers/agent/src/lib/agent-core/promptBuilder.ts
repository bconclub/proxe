/**
 * Prompt Builder - Channel-aware, brand-aware prompt construction
 * Merged from: web-agent/lib/promptBuilder.ts + dashboard/integrations/whatsapp/system-prompt
 */

import { Channel, HistoryEntry } from './types';
import { getWindchasersSystemPrompt } from '../../configs/prompts/windchasers-prompt';
import { getWindchasersWebSystemPrompt } from '../../configs/prompts/windchasers-web-prompt';
import { isLikelyRealPersonName } from '../services/utils';

interface PromptOptions {
  channel: Channel;
  userName?: string | null;
  userEmail?: string | null;
  userPhone?: string | null;
  summary?: string;
  history?: HistoryEntry[];
  knowledgeBase?: string;
  message: string;
  bookingAlreadyScheduled?: boolean;
  messageCount?: number;
  crossChannelContext?: string;
  /** Kept for backward compat with call sites; ignored — this fork is windchasers. */
  brand?: string;
  formData?: Record<string, any> | null;
}

/**
 * Get system prompt for this brand (windchasers — this is the windchasers fork).
 */
function getBrandSystemPrompt(context: string, messageCount?: number, channel?: Channel): string {
  return channel === 'web'
    ? getWindchasersWebSystemPrompt(context, messageCount)
    : getWindchasersSystemPrompt(context, messageCount);
}

/**
 * Build system prompt + user prompt for Claude
 */
export function buildPrompt(options: PromptOptions): { systemPrompt: string; userPrompt: string } {
  const {
    channel,
    userName,
    userEmail,
    userPhone,
    summary,
    history,
    knowledgeBase,
    message,
    bookingAlreadyScheduled,
    messageCount,
    crossChannelContext,
    formData,
  } = options;

  // Build the core system prompt (windchasers-only fork)
  let systemPrompt = buildSystemPrompt(userName, knowledgeBase, messageCount, channel, crossChannelContext, formData, userEmail, userPhone);

  // Calculate lead's average message length from history to enforce mirroring
  if (history && history.length > 0) {
    const userMessages = history.filter(h => h.role === 'user');
    if (userMessages.length > 0) {
      const avgLen = Math.round(userMessages.reduce((sum, m) => sum + m.content.length, 0) / userMessages.length);
      if (avgLen < 20) {
        systemPrompt += `\n\nIMPORTANT: This lead sends very short messages (avg ${avgLen} chars). Keep all replies under 15 words. One sentence only.`;
      }
    }
  }

  // Build the user prompt with context
  const userPrompt = buildUserPrompt({
    summary,
    history,
    message,
    bookingAlreadyScheduled,
    messageCount,
    channel,
  });

  return { systemPrompt, userPrompt };
}

/**
 * Build the system prompt with windchasers personality and knowledge context
 */
function buildSystemPrompt(
  userName?: string | null,
  knowledgeBase?: string,
  messageCount?: number,
  channel?: Channel,
  crossChannelContext?: string,
  formData?: Record<string, any> | null,
  userEmail?: string | null,
  userPhone?: string | null,
): string {
  // Guard: only inject the name when it looks like a real person, not a brand
  // label, UI string, or other junk that leaked into the customer_name column.
  // Shared with the wa-prelaunch capture endpoint so both ends agree.
  const nameLine = isLikelyRealPersonName(userName)
    ? `\n\nThe user is ${userName}. Address them by name once, then continue naturally.`
    : '';

  // KNOWN CONTACT block — tells the LLM exactly which fields are already
  // captured so it never re-asks for them. Aligns the booking gate, the
  // cost-guide ask, and any other "drop your contact" prompt to the actual
  // state of the lead row instead of a static "name and email" string.
  const knownContactBlock = (() => {
    const isKnown = (v?: string | null) => !!(v && String(v).trim());
    // For name specifically, "known" means a real-looking person name, not a
    // junk value like "Interior" that leaked in from the lead-capture form.
    const nameKnown = isLikelyRealPersonName(userName);
    const emailKnown = isKnown(userEmail);
    const phoneKnown = isKnown(userPhone);
    const missing: string[] = [];
    if (!nameKnown) missing.push('name');
    if (!phoneKnown) missing.push('phone');
    if (!emailKnown) missing.push('email');
    const fmtMissing =
      missing.length === 0 ? '(none — all three captured)'
      : missing.length === 1 ? missing[0]
      : missing.length === 2 ? `${missing[0]} and ${missing[1]}`
      : `${missing[0]}, ${missing[1]}, and ${missing[2]}`;

    return `\n\n=================================================================================\nKNOWN CONTACT (do not re-ask for fields marked KNOWN)\n=================================================================================\n- Name:  ${nameKnown ? `${userName} (KNOWN)` : '(missing)'}\n- Phone: ${phoneKnown ? '(KNOWN)' : '(missing)'}\n- Email: ${emailKnown ? '(KNOWN)' : '(missing)'}\n- Missing fields: ${fmtMissing}\n\nWhen any flow rule asks you to "drop your name, phone, and email" or similar, ONLY ask for the fields marked (missing). If all three are KNOWN, skip the contact ask entirely and proceed directly to the next step (confirm the action and move on).\n\nFor a missing-field ask, compose dynamically:\n- 0 missing: do not ask. Proceed.\n- 1 missing: "Drop your <field> and I will <action>."\n- 2 missing: "Drop your <field1> and <field2> and I will <action>."\n- 3 missing: "Drop your name, phone, and email and I will <action>."\n\nFor booking-gate asks (locking a slot), follow the same composition. Lead the line with the user's first name only if it is KNOWN. Never re-ask for a KNOWN field. Never use exclamation marks or emojis in this ask.`;
  })();

  // Channel-specific adjustments
  const channelNote = getChannelInstructions(channel);

  // Cross-channel context (e.g., "This user previously chatted on web about pilot training")
  const crossChannelNote = crossChannelContext
    ? `\n\n=================================================================================\nCROSS-CHANNEL CONTEXT\n=================================================================================\n${crossChannelContext}`
    : '';

  // Form data context - tell the AI what the lead already answered
  let formDataNote = '';
  if (formData && Object.keys(formData).length > 0) {
    const lines: string[] = [];
    if (formData.brand_name) lines.push(`Brand/Company: ${formData.brand_name}`);
    if (formData.has_website === true) lines.push('Has website: Yes');
    else if (formData.has_website === false) lines.push('Has website: No (still setting up)');
    if (formData.monthly_leads) lines.push(`Monthly leads they can handle: ${formData.monthly_leads}`);
    if (formData.urgency) lines.push(`Setup urgency: ${formData.urgency.replace(/_/g, ' ')}`);
    if (formData.has_ai_systems === true) lines.push('Already has AI systems running');
    else if (formData.has_ai_systems === false) lines.push('No AI systems yet (opportunity)');
    if (lines.length > 0) {
      formDataNote = `\n\n=================================================================================\nFORM DATA (lead filled this out before chatting)\n=================================================================================\n${lines.join('\n')}\n\nUse this to personalize your conversation. Do NOT ask questions they already answered in the form. Do NOT repeat this data back verbatim - weave it naturally into conversation.`;
    }
  }

  return getBrandSystemPrompt(knowledgeBase || '', messageCount, channel) + nameLine + knownContactBlock + channelNote + crossChannelNote + formDataNote;
}

/**
 * Build the user prompt with conversation context
 */
function buildUserPrompt(params: {
  summary?: string;
  history?: HistoryEntry[];
  message: string;
  bookingAlreadyScheduled?: boolean;
  messageCount?: number;
  channel?: Channel;
}): string {
  const { summary, history, message, bookingAlreadyScheduled, messageCount, channel } = params;

  const summaryBlock = summary
    ? `Conversation summary so far:\n${summary}\n`
    : 'Conversation summary so far:\nNo summary captured yet.\n';

  const historyBlock = `Recent turns:\n${formatHistory(history)}\n`;

  const bookingNote = bookingAlreadyScheduled
    ? 'Reminder: the user already scheduled a booking. Acknowledge it and avoid rebooking.'
    : '';

  // First message guidance
  const isFirstMessage = messageCount === 1 || messageCount === 0;
  const firstMessageGuidance = isFirstMessage
    ? `\n\n⚠️ CRITICAL: This is the FIRST user message (messageCount: ${messageCount || 0}).\n- Do NOT ask qualification questions (name, phone, email, user type, education, timeline, course interest).\n- Do NOT ask "Are you exploring this for yourself or for someone else?"\n- Do NOT mention costs, pricing, or investment unless user explicitly asks about it.\n- ONLY answer the user's question or greet them.\n- Keep it simple: answer what they asked, nothing more.`
    : '';

  // Third message guidance
  const thirdMessageGuidance = messageCount === 3
    ? '\n\nGuidance: This is the third user interaction. Encourage them to schedule a call in a single sentence.'
    : '';

  // Channel-specific formatting (WhatsApp rules are in system prompt + channel instructions)
  const formattingInstructions = channel === 'whatsapp'
    ? 'Plain text. Keep it tight: 1-2 sentences per paragraph. If the answer has multiple parts (e.g. a timeline AND the steps AND a call-to-action), split it into 2-3 short paragraphs separated by a blank line (\\n\\n) instead of one long block. Put any call-to-action ("Want me to set up a quick call?") on its own line as the last paragraph.'
    : 'Format with <br><br> between paragraphs. Max 2 sentences.';

  // Inject current date + a live "is today still bookable" rule so Claude never
  // offers "Today" or says it will check today's slots once the window has closed.
  const dateContext = (channel === 'whatsapp' || channel === 'web')
    ? (() => {
        const now = new Date();
        const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
        const weekday = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Kolkata' });
        const isoDate = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        const hm = now.toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
        const [h, m] = hm.split(':').map(Number);
        const nowMin = h * 60 + m;
        // Booking windows IST: online starts 15:00/16:00/17:00 (last start 17:00),
        // offline 11:00–19:00 (last start 18:00). With the 60-min lead rule,
        // "today" is bookable only while now + 60 ≤ last start.
        const isSunday = weekday === 'Sunday';
        const onlineOpenToday = !isSunday && nowMin + 60 <= 17 * 60;
        const offlineOpenToday = !isSunday && nowMin + 60 <= 18 * 60;
        const todayOpen = onlineOpenToday || offlineOpenToday;

        // Day axis for choosing which day buttons to show. We are CLOSED Sundays,
        // so "Tomorrow" must be skipped when tomorrow is a Sunday — offer the next
        // working day (e.g. Monday) instead.
        const [ty, tmo, td] = isoDate.split('-').map(Number);
        const baseUTC = Date.UTC(ty, tmo - 1, td, 12, 0, 0);
        const weekdayAt = (i: number) =>
          new Date(baseUTC + i * 86400000).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
        // Soonest open day at/after tomorrow (skip Sundays).
        let firstOpen = 1;
        while (weekdayAt(firstOpen) === 'Sunday') firstOpen++;
        const firstOpenLabel = firstOpen === 1 ? 'Tomorrow' : weekdayAt(firstOpen);

        // Exact day buttons to render for the "what date works?" question.
        const dayButtons = todayOpen
          ? `[BTN: Today][BTN: ${firstOpenLabel}][BTN: Pick a date]`
          : `[BTN: ${firstOpenLabel}][BTN: Pick a date]`;

        let todayRule: string;
        if (!todayOpen) {
          const reason = isSunday ? 'today is Sunday and we are closed' : "today's booking window has already closed";
          todayRule = `Do NOT offer a "Today" button and do NOT say you will check what's open today — ${reason}. For the date question, offer EXACTLY these buttons: ${dayButtons}, and briefly mention today's slots are done.`;
        } else if (!onlineOpenToday) {
          todayRule = `Today's online slots are done; only an in-person facility visit may still fit today. For the date question, offer EXACTLY these buttons: ${dayButtons}; only check today if the user explicitly asks for an in-person visit.`;
        } else {
          todayRule = `Today is still bookable. For the date question, offer EXACTLY these buttons: ${dayButtons}. When offering today's times, never propose a slot earlier than 60 minutes from now.`;
        }
        const closedRule = 'We are CLOSED on Sundays. NEVER offer, check, or confirm a Sunday date — if "tomorrow" or a requested date lands on a Sunday, use the next working day (Monday) instead.';

        // Deterministic upcoming-date map. The model was resolving "next Monday"
        // by doing calendar math and getting it wrong — give it an exact lookup,
        // with Sundays explicitly flagged as closed.
        const upcoming: string[] = [];
        for (let i = 0; i <= 13; i++) {
          const d = new Date(baseUTC + i * 86400000);
          const iso = d.toISOString().slice(0, 10);
          const wd = weekdayAt(i);
          const tag = i === 0 ? ' (today)' : i === 1 ? ' (tomorrow)' : '';
          const closedTag = wd === 'Sunday' ? ' — CLOSED' : '';
          upcoming.push(`  ${wd} ${iso}${tag}${closedTag}`);
        }
        const dateRef = `Upcoming dates — resolve EVERY relative date ("tomorrow", "this Friday", "next Monday") by matching this list. Do NOT calculate dates yourself. "Next <weekday>" = the soonest <weekday> listed below:\n${upcoming.join('\n')}`;

        return `Current IST: ${time} on ${weekday}, ${isoDate}. Booking windows IST (Mon–Sat): online 3:00 PM / 4:00 PM / 5:00 PM only, offline 11:00 AM–7:00 PM. ${todayRule} ${closedRule}\n\n${dateRef}`;
      })()
    : '';

  const instructions = [
    summaryBlock,
    historyBlock,
    bookingNote,
    formattingInstructions,
    dateContext,
    firstMessageGuidance,
    thirdMessageGuidance,
  ].filter(Boolean).join('\n\n');

  return `${instructions}\n\nLatest user message:\n${message}\n\nCraft your reply:`;
}

/**
 * Get channel-specific prompt instructions
 */
function getChannelInstructions(channel?: Channel): string {
  if (channel === 'whatsapp') {
    return `

=================================================================================
WHATSAPP CHANNEL RULES (MUST FOLLOW)
=================================================================================
This conversation is on WhatsApp. You MUST:
- PLAIN TEXT only. No HTML, no markdown, no backticks.
- Keep paragraphs to 1-2 sentences each. Mobile screens are small.
- Do NOT send one long block. When the answer has multiple parts (e.g. a
  timeline, then the steps, then a call-to-action), split it into 2-3 short
  paragraphs separated by a BLANK LINE (\n\n). Put any call-to-action
  ("Want me to set up a quick call?") on its own line as the last paragraph.
- Dashes (-) for lists.
- NEVER use em dashes. Use commas or periods instead.
- Conversational tone, like texting a friend.
- URLs as plain text on their own line.
- Booking tool instructions are in the system prompt above.
=================================================================================`;
  }

  if (channel === 'voice') {
    return `

IMPORTANT: This conversation is on a voice channel. Keep responses very brief,
natural-sounding, and easy to speak aloud. Avoid any formatting, lists, or URLs.`;
  }

  // Web channel
  if (channel === 'web') {
    const webLeadNote = `- Collect name and email early in conversation - web visitors do not have phone numbers by default.\n- Ask "What's your name?" naturally in the first few messages.\n- Ask "What's the best email to reach you?" before booking.\n- Same probing rules as WhatsApp: minimum 3 qualifying questions before suggesting a call.`;

    return `

=================================================================================
WEB CHAT RULES (MUST FOLLOW)
=================================================================================
This conversation is on the web chat widget. You MUST:
- Responses can be 2-4 sentences (slightly longer than WhatsApp).
- You can use **bold** for emphasis sparingly.
${webLeadNote}
- Same booking flow: check_availability → book_consultation.
- After booking: "You're booked! Check your email for the calendar invite."
- You have the same booking tools as WhatsApp - use them the same way.
=================================================================================`;
  }

  return '';
}

/**
 * Format conversation history for prompt injection
 */
function formatHistory(history: HistoryEntry[] = []): string {
  if (history.length === 0) {
    return 'No prior turns.';
  }
  return history
    .map(entry => `${entry.role === 'user' ? 'User' : 'Assistant'}: ${entry.content}`)
    .join('\n');
}
