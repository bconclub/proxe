/**
 * Conversation Summarizer — AI-powered summary generation
 * Extracted from web-agent/api/chat/summarize/route.ts
 */

import { generateResponse } from './claudeClient';
import { HistoryEntry } from './types';

/**
 * Generate or update a conversation summary
 * Uses Claude Sonnet for high-quality, concise summaries
 */
export async function generateSummary(
  previousSummary: string,
  history: HistoryEntry[]
): Promise<string> {
  if (history.length === 0) {
    return previousSummary;
  }

  // Clean metadata strings from previous summary
  const cleanedPrevious = previousSummary
    .replace(/\[User's name is[^\]]+\]/gi, '')
    .replace(/\[Booking Status:[^\]]+\]/gi, '')
    .replace(/\n\n+/g, '\n')
    .trim();

  // Clean and format history
  const cleanedHistory = history
    .map(entry => ({
      ...entry,
      content: entry.content
        .replace(/\[User's name is[^\]]+\]/gi, '')
        .replace(/\[Booking Status:[^\]]+\]/gi, '')
        .trim()
    }))
    .filter(entry => entry.content.length > 0);

  const formattedHistory = cleanedHistory
    .map(entry => `${entry.role === 'user' ? 'User' : 'Assistant'}: ${entry.content}`)
    .join('\n');

  const systemPrompt = `You are an AI conversation summarizer. Create a SHORT, focused summary (1 sentence, max ~50 tokens) focusing ONLY on:
- User's intent (what they want)
- Next steps (what action is needed or in progress)
- Booking status (if they have booked something: date/time/status)
- Topic/question category (what the question is related to)

Do NOT explain what the bot said or what the user said back. Do NOT describe the conversation flow. Just state: intent, next steps, booking status (if any), and topic. Be extremely concise.`;

  const userPrompt = `Previous summary:
${cleanedPrevious || '(none)'}

New conversation:
${formattedHistory}

Create a very short summary (1 sentence max). Focus ONLY on: intent, next steps, booking status (if booked), and what the question relates to. Do NOT explain the conversation flow or what was said.`;

  try {
    return await generateResponse(systemPrompt, userPrompt, 60);
  } catch (error) {
    console.error('[Summarizer] Failed to generate summary:', error);
    return cleanedPrevious;
  }
}
