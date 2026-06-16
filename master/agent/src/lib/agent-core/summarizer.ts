/**
 * Conversation Summarizer - AI-powered summary generation
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

  const systemPrompt = `You are summarizing a sales conversation for the BCON team. Generate a brief but complete summary that includes:
1. BUSINESS: What does this lead's business do? (from what THEY said, not form data)
2. PROBLEM: What challenges or needs did they mention?
3. DISCUSSION: What solutions or services were discussed?
4. BOOKING: Was a call booked? What date/time? Did booking succeed or fail?
5. STATUS: Are they engaged, cold, frustrated, or lost?
6. RED FLAGS: Did they ask for a human? Get upset? Hit any errors?
7. NEXT STEP: What should the team do next?

FORM FIELD INTERPRETATION - get these right:
- VOLUME means how many leads they WANT to handle, NOT how many they currently get. "Upto 100" = wants to scale to 100 leads.
- URGENCY means how ready they are to start, NOT how urgent their problem is.
- "No, I am setting up" for AI SYSTEMS = they have no AI yet, they are exploring.
- WEBSITE "Yes, I have" = they have a website. "No" = they don't.
Do NOT misrepresent these fields. "Upto 100 leads" does NOT mean "handles 100 leads."

Keep it to 3-5 sentences max. Be specific - use actual details from the conversation, not generic phrases like "high intent" or "shows interest".

BAD: "Lead shows high intent with 50% response rate. Re-engage with follow-up."
GOOD: "Wasi runs Design Lyf Realty & Interiors in Bangalore - interior design focus. Getting Meta ad leads but quality is poor. Tried to book Monday 3pm but booking tool looped. Got frustrated and asked for a human. Needs manual outreach to recover - call him directly."`;

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
