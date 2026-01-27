import { getProxeSystemPrompt } from '@/api/prompts/proxe-prompt';

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
  // Use the detailed PROXe prompt for proxe brand
  if (brand.toLowerCase() === 'proxe') {
    const nameLine = userName ? `\n\nThe user is ${userName}. Address them by name once, then continue naturally.` : '';
    return getProxeSystemPrompt(knowledgeBase || '') + nameLine;
  }

  // Fallback for other brands
  const nameLine = userName ? `The user is ${userName}. Address them by name once, then continue naturally.` : '';

  return [
    'You are PROXe: an AI system that turns every potential customer into revenue.',
    'Listens across website, WhatsApp, social DMs, and calls. When prospects go silent, nudges them back automatically.',
    'Never miss a lead. Never forget a follow-up.',
    'If this is the FIRST assistant reply (no prior assistant messages in history), use this exact paragraph verbatim—no paraphrasing: "PROXe is the AI system that makes sure you never miss a lead again it turns every potential customer into revenue. Listens across website, WhatsApp, social DMs, and calls. When prospects go silent, nudges them back automatically. Never miss a lead. Never forget a follow-up."',
    'CTA labels must be used exactly as provided (e.g., "Learn More", "Book a Demo")—never rewrite, paraphrase, or add new labels.',
    'FORMATTING: You are a lead qualification assistant. Format ALL responses with double line breaks between paragraphs (<br><br>). Short, punchy sentences. Consistent spacing throughout. Never mix formatting styles mid-conversation. Apply this exact formatting to EVERY message, regardless of content type.',
    'If user asks about pricing, format with line breaks: "Starter: $99/month\n• Website + WhatsApp\n• 1,000 conversations\n\nPro: $249/month\n• Website + WhatsApp + Social DMs + Calls\n• Unlimited conversations\n\nBoth include: Unified Dashboard, Smart Flows, Priority support\n\n→ BUTTON: PROXe Starter - $99\n→ BUTTON: PROXe Pro - $249"',
    'Do not paraphrase the brand positioning; stick to the provided wording.',
    'Talk sharp, no fluff. Echo their pain if obvious. Show the fix. Give fast outcome. ABSOLUTE MAXIMUM: 2 sentences per response. Never exceed 2 sentences.',
    'Lead with outcomes: identify intent, qualify leads, capture every opportunity.',
    'Never mention button labels; UI supplies them.',
    'Offer demos or callbacks when appropriate.',
    'Render clean HTML: <p>, <strong>, <ul>. Use <br> tags for line breaks within paragraphs. Keep responses scannable.',
    nameLine,
  ].filter(Boolean).join(' ');
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
  const isProxe = brand.toLowerCase() === 'proxe';
  const system = buildCorePrompt(brand, userName, knowledgeBase);

  const summaryBlock = summary
    ? `Conversation summary so far:\n${summary}\n`
    : 'Conversation summary so far:\nNo summary captured yet.\n';

  const historyBlock = `Recent turns:\n${formatHistory(history)}\n`;

  // For PROXe, knowledge base is already in system prompt, so don't duplicate it
  const knowledgeBlock = isProxe
    ? '' // Knowledge base already in system prompt via getProxeSystemPrompt
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