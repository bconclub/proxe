/**
 * Prompt Builder — Channel-aware, brand-aware prompt construction
 * Merged from: web-agent/lib/promptBuilder.ts + dashboard/integrations/whatsapp/system-prompt
 */

import { Channel, HistoryEntry } from './types';
import { getWindchasersSystemPrompt } from '../../configs/prompts/windchasers-prompt';

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
  } = options;

  // Build the core system prompt (brand-specific)
  const systemPrompt = buildSystemPrompt(userName, knowledgeBase, messageCount, channel, crossChannelContext);

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

  return getWindchasersSystemPrompt(knowledgeBase || '', messageCount) + nameLine + channelNote + crossChannelNote;
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

  const instructions = [
    summaryBlock,
    historyBlock,
    bookingNote,
    formattingInstructions,
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
