/**
 * Prompt Builder - Channel-aware, brand-aware prompt construction
 * Merged from: web-agent/lib/promptBuilder.ts + dashboard/integrations/whatsapp/system-prompt
 */

import { Channel, HistoryEntry } from './types';
import { getWindchasersSystemPrompt } from '../../configs/prompts/windchasers-prompt';
import { getBconSystemPrompt } from '../../configs/prompts/bcon-prompt';

interface PromptOptions {
  channel: Channel;
  userName?: string | null;
  summary?: string;
  history?: HistoryEntry[];
  knowledgeBase?: string;
  message: string;
  bookingAlreadyScheduled?: boolean;
  messageCount?: number;
  crossChannelContext?: string;
  brand?: string;
  formData?: Record<string, any> | null;
}

/**
 * Get brand-specific system prompt
 */
function getBrandSystemPrompt(brand: string, context: string, messageCount?: number): string {
  switch (brand) {
    case 'bcon':
      return getBconSystemPrompt(context, messageCount);
    case 'windchasers':
      return getWindchasersSystemPrompt(context, messageCount);
    default:
      return getBconSystemPrompt(context, messageCount);
  }
}

/**
 * Build system prompt + user prompt for Claude
 */
export function buildPrompt(options: PromptOptions): { systemPrompt: string; userPrompt: string } {
  const {
    channel,
    userName,
    summary,
    history,
    knowledgeBase,
    message,
    bookingAlreadyScheduled,
    messageCount,
    crossChannelContext,
    brand,
    formData,
  } = options;

  // Resolve brand: explicit param > env var > default
  const resolvedBrand = brand || process.env.NEXT_PUBLIC_BRAND_ID || process.env.NEXT_PUBLIC_BRAND || 'bcon';

  // Build the core system prompt (brand-specific)
  const systemPrompt = buildSystemPrompt(resolvedBrand, userName, knowledgeBase, messageCount, channel, crossChannelContext, formData);

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
 * Build the system prompt with brand personality and knowledge context
 */
function buildSystemPrompt(
  brand: string,
  userName?: string | null,
  knowledgeBase?: string,
  messageCount?: number,
  channel?: Channel,
  crossChannelContext?: string,
  formData?: Record<string, any> | null,
): string {
  const nameLine = userName
    ? `\n\nThe user is ${userName}. Address them by name once, then continue naturally.`
    : '';

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

  return getBrandSystemPrompt(brand, knowledgeBase || '', messageCount) + nameLine + channelNote + crossChannelNote + formDataNote;
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
    ? 'Plain text only. Max 2 sentences.'
    : 'Format with <br><br> between paragraphs. Max 2 sentences.';

  // Inject current date so Claude can resolve relative dates ("tomorrow", "next Monday")
  const dateContext = (channel === 'whatsapp' || channel === 'web')
    ? `Today's date: ${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })} (${new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Kolkata' })})`
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
- Simple line breaks for spacing. Dashes (-) for lists.
- SHORT: 1-2 sentences max. Mobile screens are small.
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
    return `

=================================================================================
WEB CHAT RULES (MUST FOLLOW)
=================================================================================
This conversation is on the web chat widget. You MUST:
- Responses can be 2-4 sentences (slightly longer than WhatsApp).
- You can use **bold** for emphasis sparingly.
- Collect name and email early in conversation - web visitors don't have phone numbers by default.
- Ask "What's your name?" naturally in the first few messages.
- Ask "What's the best email to reach you?" before booking.
- Same probing rules as WhatsApp: minimum 3 qualifying questions before suggesting a call.
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
