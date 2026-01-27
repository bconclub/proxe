import { getMasterSystemPrompt } from '@/api/prompts/master-prompt';

type HistoryEntry = {
  role: 'user' | 'assistant';
  content: string;
};

interface PromptOptions {
  brand: string;
  userName?: string | null;
  summary?: string;
  history?: HistoryEntry[];
  knowledgeBase?: string;
  message: string;
  bookingAlreadyScheduled?: boolean;
}

function buildCorePrompt(brand: string, userName?: string | null, knowledgeBase?: string): string {
  const normalizedBrand = brand.toLowerCase();
  
  // Use the detailed Master prompt for master brand
  if (normalizedBrand === 'master') {
    const nameLine = userName ? `\n\nThe user is ${userName}. Address them by name once, then continue naturally.` : '';
    return getMasterSystemPrompt(knowledgeBase || '') + nameLine;
  }

  // Fallback for other brands - use Master prompt
  const nameLine = userName ? `\n\nThe user is ${userName}. Address them by name once, then continue naturally.` : '';
  return getMasterSystemPrompt(knowledgeBase || '') + nameLine;
}

function formatHistory(history: HistoryEntry[] = []): string {
  if (history.length === 0) {
    return 'No prior turns.';
  }

  return history
    .map((entry) => `${entry.role === 'user' ? 'User' : 'Assistant'}: ${entry.content}`)
    .join('\n');
}

export function buildPrompt({
  brand,
  userName,
  summary,
  history,
  knowledgeBase,
  message,
  bookingAlreadyScheduled,
}: PromptOptions) {
  const normalizedBrand = brand.toLowerCase();
  const isMaster = normalizedBrand === 'master';
  const system = buildCorePrompt(brand, userName, knowledgeBase);

  const summaryBlock = summary
    ? `Conversation summary so far:\n${summary}\n`
    : 'Conversation summary so far:\nNo summary captured yet.\n';

  const historyBlock = `Recent turns:\n${formatHistory(history)}\n`;

  // For Master, knowledge base is already in system prompt, so don't duplicate it
  const knowledgeBlock = isMaster
    ? '' // Knowledge base already in system prompt via getMasterSystemPrompt
    : (knowledgeBase && knowledgeBase.trim().length > 0
      ? `Relevant knowledge base snippets:\n${knowledgeBase.trim()}\n`
      : 'Relevant knowledge base snippets:\nNone found. Answer from brand knowledge.');

  const bookingNote = bookingAlreadyScheduled
    ? 'Reminder: the user already scheduled a booking. Acknowledge it and avoid rebooking.'
    : '';

  const instructions = [
    summaryBlock,
    historyBlock,
    knowledgeBlock,
    bookingNote,
    'You are a lead qualification assistant. Format ALL responses with double line breaks between paragraphs (<br><br>). Short, punchy sentences. Consistent spacing throughout. Never mix formatting styles mid-conversation. Apply this exact formatting to EVERY message you send, regardless of content type. ABSOLUTE MAXIMUM: 2 sentences per response. Never exceed 2 sentences.',
  ].filter(Boolean).join('\n\n');

  const userPrompt = `${instructions}\n\nLatest user message:\n${message}\n\nCraft your reply:`;

  return { systemPrompt: system, userPrompt };
}