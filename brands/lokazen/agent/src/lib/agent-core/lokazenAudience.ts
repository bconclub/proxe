/**
 * Lokazen conversation-audience detection — shared by the web chat and
 * WhatsApp routes (and by engine.ts for KB scoping) so brand/owner/scout
 * detection has one source of truth instead of drifting per channel.
 */
import { AgentInput, HistoryEntry } from './types';

export type LokazenAudience = 'brand' | 'owner' | 'scout' | null;

function compactAnswer(value: unknown): string {
  return String(value || '')
    .replace(/\[BTN\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function lowerText(value: unknown): string {
  return compactAnswer(value).toLowerCase();
}

function latestAssistantPrompt(history: HistoryEntry[] | AgentInput['conversationHistory']): string {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i]?.role === 'assistant') return history[i].content || '';
  }
  return '';
}

/**
 * Detects which of the three Lokazen conversation flows (brand/owner/scout)
 * the current turn belongs to, from the previous assistant question and any
 * buttons clicked. Used both to persist the right lead type and to scope
 * knowledge-base retrieval so, e.g., a Scout's KYC question never surfaces
 * brand pricing, and vice versa.
 */
export function detectLokazenAudience(
  userMessage: string,
  conversationHistory: HistoryEntry[] | AgentInput['conversationHistory'],
  usedButtons: string[],
): LokazenAudience {
  const answerLower = compactAnswer(userMessage).toLowerCase();
  const previousAssistant = lowerText(latestAssistantPrompt(conversationHistory));
  const buttons = usedButtons.map(lowerText);

  const ownerQuestion =
    previousAssistant.includes('which area is the property') ||
    previousAssistant.includes('what type of property') ||
    previousAssistant.includes('what size is the space') ||
    previousAssistant.includes('how big is the space') ||
    previousAssistant.includes('monthly rent') ||
    previousAssistant.includes('asking rent') ||
    previousAssistant.includes('which floor') ||
    previousAssistant.includes('frontage') ||
    previousAssistant.includes('when is it available') ||
    previousAssistant.includes('amenities') ||
    previousAssistant.includes('parking') ||
    previousAssistant.includes('photos') ||
    previousAssistant.includes('google maps link') ||
    previousAssistant.includes('full address');

  const brandQuestion =
    previousAssistant.includes("what's your brand name") ||
    previousAssistant.includes('what is your brand name') ||
    previousAssistant.includes('what kind of brand') ||
    previousAssistant.includes('how many outlets') ||
    previousAssistant.includes('first outlet') ||
    previousAssistant.includes('expansion') ||
    previousAssistant.includes('which part of bangalore') ||
    previousAssistant.includes('which areas') ||
    previousAssistant.includes('preferred format') ||
    previousAssistant.includes('high-street') ||
    previousAssistant.includes('what size range') ||
    previousAssistant.includes('rent budget') ||
    previousAssistant.includes('budget range') ||
    previousAssistant.includes('when do you need the space');

  const scoutQuestion =
    previousAssistant.includes('which area can you cover') ||
    previousAssistant.includes('do you already know any vacant commercial properties') ||
    previousAssistant.includes("what's your name and phone number") ||
    previousAssistant.includes('would you like the team to help you get started') ||
    previousAssistant.includes('join us as a scout');

  if (buttons.some((b) => b.includes('list my property')) || answerLower.includes('list my property') || ownerQuestion) {
    return 'owner';
  }
  if (buttons.some((b) => b.includes('find commercial space')) || answerLower.includes('find commercial space') || brandQuestion) {
    return 'brand';
  }
  if (
    buttons.some((b) => b.includes('become a scout') || b.includes('join as a scout')) ||
    answerLower.includes('become a scout') ||
    answerLower.includes('join as a scout') ||
    scoutQuestion
  ) {
    return 'scout';
  }
  return null;
}
