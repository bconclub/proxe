/**
 * Prompt Builder — Channel-aware, brand-aware prompt construction
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
      // Default to windchasers for unknown brands (each deployment sets NEXT_PUBLIC_BRAND_ID)
      return getWindchasersSystemPrompt(context, messageCount);
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
  } = options;

  // Resolve brand: explicit param > env var > default
  const resolvedBrand = brand || process.env.NEXT_PUBLIC_BRAND_ID || 'windchasers';

  // Build the core system prompt (brand-specific)
  const systemPrompt = buildSystemPrompt(resolvedBrand, userName, knowledgeBase, messageCount, channel, crossChannelContext);

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
  crossChannelContext?: string
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

  return getBrandSystemPrompt(brand, knowledgeBase || '', messageCount) + nameLine + channelNote + crossChannelNote;
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

  // Channel-specific formatting instructions
  const formattingInstructions = channel === 'whatsapp'
    ? 'You are a lead qualification assistant. Use plain text only — NO HTML tags, NO markdown. Use simple line breaks for spacing. Short, punchy sentences. ABSOLUTE MAXIMUM: 2 sentences per response.'
    : 'You are a lead qualification assistant. Format ALL responses with double line breaks between paragraphs (<br><br>). Short, punchy sentences. Consistent spacing throughout. ABSOLUTE MAXIMUM: 2 sentences per response.';

  // Inject current date for WhatsApp so Claude can resolve relative dates ("tomorrow", "next Monday")
  const dateContext = channel === 'whatsapp'
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
This conversation is happening on WhatsApp. You MUST:
- Use PLAIN TEXT only. No HTML tags (<br>, <b>, <a>, etc.)
- No markdown formatting (no **, no ##, no [](), no backticks)
- Use simple line breaks for paragraph spacing
- Keep responses SHORT — 1-2 sentences max, mobile screens are small
- No bullet points with special characters — use simple dashes (-) if needed
- Be conversational and friendly, like texting a friend
- No "click here" links — WhatsApp users can't click embedded HTML
- If sharing a URL, paste it as plain text on its own line
=================================================================================

=================================================================================
BOOKING TOOLS (WHATSAPP ONLY)
=================================================================================
You have access to booking tools. Use them when the user wants to schedule a
consultation call.

BOOKING FLOW:
1. When user expresses interest in booking (says "book", "schedule", "call"):
   - Ask which date works for them (suggest "tomorrow" or "this week")
   - Once they give a date, use check_availability to get open slots
   - Present the available times as a simple numbered list
   - Once they pick a time, confirm their name
   - Use book_consultation to finalize the booking

2. IMPORTANT RULES:
   - ALWAYS use check_availability BEFORE booking to verify the slot is open
   - ALWAYS confirm date + time with the user before calling book_consultation
   - The user phone number is already known from WhatsApp — do NOT ask for it
   - Email is OPTIONAL — only ask if it comes up naturally, do NOT block on it
   - If no slots are available, suggest the next day
   - Convert vague dates: "tomorrow" = today + 1, "next Monday" = next Monday
   - After successful booking, confirm with date, time, and a friendly message
   - Keep the booking conversation SHORT — do not over-explain
=================================================================================`;
  }

  if (channel === 'voice') {
    return `

IMPORTANT: This conversation is on a voice channel. Keep responses very brief,
natural-sounding, and easy to speak aloud. Avoid any formatting, lists, or URLs.`;
  }

  // Web channel — default (HTML formatting is fine)
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
