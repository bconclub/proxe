/**
 * Follow-Up Button Generator — Claude-powered contextual buttons
 * Extracted from web-agent/api/chat/route.ts (lines 199-331, 1086-1289)
 */

import { generateShort } from './claudeClient';
import { Channel } from './types';

/**
 * Generate follow-up buttons based on conversation context
 */
export async function generateFollowUps(params: {
  channel: Channel;
  userMessage: string;
  assistantMessage: string;
  messageCount: number;
  usedButtons: string[];
  hasExistingBooking: boolean;
  exploreButtons: string[];
}): Promise<string[]> {
  const { channel, userMessage, assistantMessage, messageCount, usedButtons, hasExistingBooking, exploreButtons } = params;

  // WhatsApp and other non-web channels don't get buttons
  if (channel !== 'web') {
    return [];
  }

  const lowerMessage = userMessage.toLowerCase();
  const isFirstMessage = messageCount === 1 || messageCount === 0;
  const usedButtonsLower = usedButtons.map(b => b.toLowerCase());

  // Check for "Explore Training Options" click → show 4 program buttons
  if ((lowerMessage.includes('explore training options') || lowerMessage.includes('explore training')) && exploreButtons.length > 0) {
    return exploreButtons;
  }

  // User has existing booking → filter out booking buttons
  if (hasExistingBooking) {
    return generateBookingAwareButtons(isFirstMessage, usedButtons, usedButtonsLower);
  }

  // Normal flow: 3-2-1 button structure
  if (isFirstMessage) {
    return await generateFirstMessageButtons(userMessage, assistantMessage, messageCount, usedButtons, usedButtonsLower);
  }

  return await generateSubsequentButtons(userMessage, assistantMessage, messageCount, usedButtons, usedButtonsLower);
}

/**
 * Generate buttons when user has an existing booking
 */
function generateBookingAwareButtons(
  isFirstMessage: boolean,
  usedButtons: string[],
  usedButtonsLower: string[]
): string[] {
  const bookingActionButtons = ['Reschedule Call', 'View Booking Details'];

  if (isFirstMessage) {
    const nonBookingButtons = ['Get Course Details', 'Check Eligibility', 'Financing Options'];
    return [...nonBookingButtons, ...bookingActionButtons].slice(0, 2);
  }

  const availableButtons = ['Get Course Details', 'Check Eligibility', 'Financing Options', ...bookingActionButtons];
  const unusedButtons = availableButtons.filter(btn =>
    !usedButtonsLower.includes(btn.toLowerCase()) && !isSimilarToAny(btn, usedButtons)
  );

  const pool = unusedButtons.length > 0 ? unusedButtons : availableButtons;
  return pool.length > 0 ? [pool[Math.floor(Math.random() * pool.length)]] : ['Reschedule Call'];
}

/**
 * Generate 2 buttons for the first message
 */
async function generateFirstMessageButtons(
  userMessage: string,
  assistantMessage: string,
  messageCount: number,
  usedButtons: string[],
  usedButtonsLower: string[]
): Promise<string[]> {
  try {
    const generated = await generateContextualButton(userMessage, assistantMessage, messageCount);

    if (generated) {
      const firstMessagePool = [
        'Explore Training Options', 'Book a Demo Session',
        'Get Cost Breakdown', 'Check Eligibility', 'Learn More'
      ];

      const availableButtons = firstMessagePool.filter(btn =>
        btn.toLowerCase() !== generated.toLowerCase() &&
        !usedButtonsLower.includes(btn.toLowerCase()) &&
        !isSimilarToAny(btn, [generated, ...usedButtons])
      );

      const secondButton = availableButtons.length > 0
        ? availableButtons[Math.floor(Math.random() * availableButtons.length)]
        : 'Book a Demo Session';

      return [generated, secondButton].filter(Boolean);
    }

    return ['Explore Training Options', 'Book a Demo Session'];
  } catch {
    return ['Explore Training Options', 'Book a Demo Session'];
  }
}

/**
 * Generate 1 button for subsequent messages
 */
async function generateSubsequentButtons(
  userMessage: string,
  assistantMessage: string,
  messageCount: number,
  usedButtons: string[],
  usedButtonsLower: string[]
): Promise<string[]> {
  const lowerMessage = userMessage.toLowerCase();
  const lowerResponse = assistantMessage.toLowerCase();

  // Build contextual button pool based on conversation
  let contextualButtons: string[];

  const isAskingCost = lowerMessage.includes('cost') || lowerMessage.includes('price') ||
    lowerMessage.includes('fee') || lowerMessage.includes('investment') ||
    lowerResponse.includes('₹') || lowerResponse.includes('lakh');

  const isInterestedInCourse = lowerMessage.includes('pilot') || lowerMessage.includes('helicopter') ||
    lowerMessage.includes('cabin crew') || lowerMessage.includes('drone') ||
    lowerResponse.includes('program');

  if (isAskingCost) {
    contextualButtons = ['Get Cost Breakdown', 'Financing Options', 'Talk to Counselor'];
  } else if (isInterestedInCourse) {
    contextualButtons = ['Book 1:1 Consultation', 'Book Demo Online', 'Get Course Timeline'];
  } else {
    contextualButtons = ['Book a Demo Session', 'Get Cost Breakdown', 'Check Eligibility', 'Explore Training Options', 'Talk to Counselor'];
  }

  const unusedButtons = contextualButtons.filter(btn =>
    !usedButtonsLower.includes(btn.toLowerCase()) && !isSimilarToAny(btn, usedButtons)
  );
  const pool = unusedButtons.length > 0 ? unusedButtons : contextualButtons;

  try {
    const generated = await generateContextualButton(userMessage, assistantMessage, messageCount);
    if (generated && !usedButtonsLower.includes(generated.toLowerCase())) {
      return [generated];
    }
    return pool.length > 0 ? [pool[Math.floor(Math.random() * pool.length)]] : ['Book a Demo Session'];
  } catch {
    return pool.length > 0 ? [pool[Math.floor(Math.random() * pool.length)]] : ['Book a Demo Session'];
  }
}

/**
 * Generate a single contextual button using Claude
 */
async function generateContextualButton(
  userMessage: string,
  assistantMessage: string,
  messageCount: number
): Promise<string | null> {
  const systemPrompt = `You create one short, direct follow-up call-to-action button label for BCON Club aviation training chatbot.

BCON Club is an honest, transparent aviation training academy offering:
- Commercial Pilot License (CPL) training
- Helicopter Pilot Training
- Cabin Crew Training
- Drone Pilot Training
- DGCA Ground Classes

AVAILABLE BUTTON TYPES (create contextual variations):
- Information: "Get Course Details", "Check Eligibility", "Learn More"
- Exploration: "Explore Training Options", "See Programs"
- Booking: "Book a Demo Session", "Book 1:1 Consultation", "Schedule Call"
- Next Steps: "Get Cost Breakdown", "Financing Options", "Course Timeline"

BUTTON GENERATION RULES:
- First user message (messageCount = 1): Generate 1 button most relevant to their question
- Subsequent messages: Generate 1 button for the next logical step
- 3-7 words. Title case. No emojis.
- Be contextual - match the conversation flow
- NEVER repeat what was just explained
- NEVER suggest something they already understood

TONE: Direct, honest, professional. Aviation career advisor voice. No sales-y language.

If no relevant follow-up is appropriate, respond with only: SKIP
Output ONLY the button label text. No quotes. No explanation.`;

  const userPrompt = `User's question: ${userMessage}\n\nAssistant's reply: ${assistantMessage}\n\nMessage count: ${messageCount}\n\nGenerate ONE contextual follow-up button label.`;

  try {
    const suggestion = await generateShort(systemPrompt, userPrompt, 60);
    const normalized = suggestion.split('\n').map(s => s.trim()).filter(Boolean)[0] || '';

    if (!normalized || normalized.toUpperCase() === 'SKIP') {
      return null;
    }

    return normalized.replace(/["']/g, '').trim();
  } catch {
    return null;
  }
}

// --- Helper functions ---

function areSimilarBookingButtons(button1: string, button2: string): boolean {
  const lower1 = button1.toLowerCase().trim();
  const lower2 = button2.toLowerCase().trim();

  if (lower1 === lower2) return true;

  const bookingKeywords = ['call', 'demo', 'book', 'schedule', 'meeting', 'appointment'];
  const hasBooking1 = bookingKeywords.some(k => lower1.includes(k));
  const hasBooking2 = bookingKeywords.some(k => lower2.includes(k));

  if (hasBooking1 && hasBooking2) {
    const hasCall1 = lower1.includes('call');
    const hasCall2 = lower2.includes('call');
    const hasDemo1 = lower1.includes('demo');
    const hasDemo2 = lower2.includes('demo');
    if ((hasCall1 && hasCall2) || (hasDemo1 && hasDemo2)) return true;
  }

  return false;
}

function isSimilarToAny(newButton: string, existingButtons: string[]): boolean {
  return existingButtons.some(existing => areSimilarBookingButtons(newButton, existing));
}
