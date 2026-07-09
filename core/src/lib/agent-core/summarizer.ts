/**
 * Conversation Summarizer - AI-powered summary generation
 * Extracted from web-agent/api/chat/summarize/route.ts
 */

import { generateResponse } from './claudeClient';
import { HistoryEntry } from './types';
import { getBrainConfig } from '@/lib/brain/brainConfig';

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

  // The summary voice is brand CONTENT: each brand supplies brain.summaryPrompt
  // in its config (pop = campaign grievance framing, bcon = sales framing);
  // brands without one get the neutral business prompt from brainConfig.
  const systemPrompt = getBrainConfig().summaryPrompt;

  const userPrompt = `Previous summary:
${cleanedPrevious || '(none)'}

New conversation:
${formattedHistory}

Update the summary with new information. Keep previous context (who they are, what they do) and add new developments. 3-5 sentences max. Use specific details from the conversation.`;

  try {
    return await generateResponse(systemPrompt, userPrompt, 300);
  } catch (error) {
    console.error('[Summarizer] Failed to generate summary:', error);
    return cleanedPrevious;
  }
}
