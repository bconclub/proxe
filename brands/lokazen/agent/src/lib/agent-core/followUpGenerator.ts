/**
 * Follow-Up Button Generator - Claude-powered contextual buttons
 * Windchasers fork: single button pool for aviation training.
 */

import { generateShort } from './claudeClient';
import { Channel } from './types';
import { getBrandConfig } from '@/configs';

/** Windchasers button pool for fallback/static generation */
const windchasersPool = {
  firstMessage: ['Explore Training Options', 'Book a Demo Session', 'Get Cost Breakdown', 'Check Eligibility', 'Learn More'],
  defaultFallback: 'Book a Demo Session',
  costButtons: ['Get Cost Breakdown', 'Financing Options', 'Talk to Counselor'],
  interestButtons: ['Book 1:1 Consultation', 'Book Demo Online', 'Get Course Timeline'],
  genericButtons: ['Book a Demo Session', 'Get Cost Breakdown', 'Check Eligibility', 'Explore Training Options', 'Talk to Counselor'],
  bookingAware: ['Get Course Details', 'Check Eligibility', 'Financing Options'],
  claudeContext: `WindChasers aviation training chatbot.
WindChasers is an honest, transparent aviation training academy offering:
- Commercial Pilot License (CPL) training
- Helicopter Pilot Training
- Cabin Crew Training
- Drone Pilot Training
- DGCA Ground Classes

AVAILABLE BUTTON TYPES:
- Information: "Get Course Details", "Check Eligibility", "Learn More"
- Exploration: "Explore Training Options", "See Programs"
- Booking: "Book a Demo Session", "Book 1:1 Consultation", "Schedule Call"
- Next Steps: "Get Cost Breakdown", "Financing Options", "Course Timeline"`,
  exploreKeywords: ['explore training options', 'explore training', 'what courses', 'other course', 'which course', 'what program', 'other program', 'which program', 'what do you offer', 'what do you provide', 'courses do you', 'programs do you'],
};

/** Returns the windchasers button pool. The `brand` arg is ignored (kept for back-compat). */
function getBrandPool(_brand?: string) {
  return windchasersPool;
}

function detectLokazenStepButtons(assistantMessage: string): string[] {
  const r = assistantMessage.toLowerCase();

  const asksForFreeText = [
    "what's the brand name",
    "what's your brand name",
    "what is your brand name",
    'who am i speaking with',
    'which area is it in',
    'which area is the property in',
    'which area in bangalore can you cover',
    'best number to reach you',
    'name and phone',
    'google maps location',
    'full address',
  ].some((phrase) => r.includes(phrase));

  if (asksForFreeText) {
    return [];
  }
  if (r.includes('what type of space') || r.includes('what kind of brand') || r.includes('brand category')) {
    return ['QSR / F&B', 'Cafe / Restaurant', 'Retail'];
  }
  if (r.includes('preferred area') || r.includes('where are you looking')) {
    return ['North Bangalore', 'South Bangalore', 'East Bangalore'];
  }
  if (r.includes('space size') || r.includes('how much space') || r.includes('sqft')) {
    return ['Under 500 sqft', '500-1500 sqft', '1500+ sqft'];
  }
  if (r.includes('budget') || r.includes('monthly rent')) {
    return ['Under 50k', '50k-1.5L', 'Above 1.5L'];
  }
  if (r.includes('when do you need') || (r.includes('timeline') && r.includes('space'))) {
    return ['Immediately', '1-3 months', 'Just exploring'];
  }
  if (r.includes('which plan') || (r.includes('starter') && r.includes('professional') && r.includes('premium'))) {
    return ['Starter Rs 4,999', 'Professional 9,999', 'Premium Rs 19,999'];
  }
  if (r.includes('ready to get started') || r.includes('start this plan') || (r.includes('talk to loka') && r.includes('plan'))) {
    return ['Start this plan', 'Talk to Loka'];
  }
  if (r.includes('find a space') || (r.includes('list') && r.includes('property')) || (r.includes('help you with') && r.includes('lokazen'))) {
    return ['Find a space', 'List my property', 'Talk to Loka'];
  }
  return [];
}
const BANNED_BUTTONS = [
  'tell me my business',
  'learn more',
  'explore solutions',
  'click here',
  'get started',
];

function isBannedButton(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return BANNED_BUTTONS.some(banned => lower.includes(banned));
}

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
  brand?: string;
}): Promise<string[]> {
  const { channel, userMessage, assistantMessage, messageCount, usedButtons, hasExistingBooking, exploreButtons, brand } = params;
  const pool = getBrandPool(brand);
  const brandConfig = getBrandConfig(brand);
  const quickButtons = brandConfig.quickButtons || [];

  // WhatsApp and other non-web channels don't get buttons
  if (channel !== 'web') {
    return [];
  }

  const lowerMessage = userMessage.toLowerCase();
  const isFirstMessage = messageCount === 1 || messageCount === 0;
  const usedButtonsLower = usedButtons.map(b => b.toLowerCase());

  // Lokazen has a strict step flow. Do not show home buttons while collecting free text.
  if (brand === 'lokazen') {
    return detectLokazenStepButtons(assistantMessage);
  }

  // First message: always show hardcoded quickButtons from config, no AI generation
  if (isFirstMessage) {
    return quickButtons;
  }

  // Check for explore click → show explore buttons from brand config
  if (pool.exploreKeywords.some(kw => lowerMessage.includes(kw)) && exploreButtons.length > 0) {
    return exploreButtons;
  }

  // User has existing booking → filter out booking buttons
  if (hasExistingBooking) {
    return generateBookingAwareButtons(isFirstMessage, usedButtons, usedButtonsLower, pool);
  }

  // Subsequent messages: restricted dynamic generation from whitelist only
  const allowedButtons = [...quickButtons, ...exploreButtons];
  return await generateSubsequentButtons(userMessage, assistantMessage, messageCount, usedButtons, usedButtonsLower, pool, allowedButtons);
}

/**
 * Generate buttons when user has an existing booking
 */
function generateBookingAwareButtons(
  isFirstMessage: boolean,
  usedButtons: string[],
  usedButtonsLower: string[],
  pool: ReturnType<typeof getBrandPool>
): string[] {
  const bookingActionButtons = ['Reschedule Call', 'View Booking Details'];

  if (isFirstMessage) {
    return [...pool.bookingAware, ...bookingActionButtons].slice(0, 2);
  }

  const availableButtons = [...pool.bookingAware, ...bookingActionButtons];
  const unusedButtons = availableButtons.filter(btn =>
    !usedButtonsLower.includes(btn.toLowerCase()) && !isSimilarToAny(btn, usedButtons)
  );

  const finalPool = unusedButtons.length > 0 ? unusedButtons : availableButtons;
  return finalPool.length > 0 ? [finalPool[Math.floor(Math.random() * finalPool.length)]] : ['Reschedule Call'];
}

/**
 * Generate 2 buttons for the first message
 * NOTE: Currently unused — first message uses config.quickButtons directly
 */
async function generateFirstMessageButtons(
  userMessage: string,
  assistantMessage: string,
  messageCount: number,
  usedButtons: string[],
  usedButtonsLower: string[],
  pool: ReturnType<typeof getBrandPool>
): Promise<string[]> {
  try {
    const generated = await generateContextualButton(userMessage, assistantMessage, messageCount, pool);

    if (generated) {
      const availableButtons = pool.firstMessage.filter(btn =>
        btn.toLowerCase() !== generated.toLowerCase() &&
        !usedButtonsLower.includes(btn.toLowerCase()) &&
        !isSimilarToAny(btn, [generated, ...usedButtons])
      );

      const secondButton = availableButtons.length > 0
        ? availableButtons[Math.floor(Math.random() * availableButtons.length)]
        : pool.defaultFallback;

      return [generated, secondButton].filter(Boolean);
    }

    return [pool.firstMessage[0], pool.defaultFallback];
  } catch {
    return [pool.firstMessage[0], pool.defaultFallback];
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
  usedButtonsLower: string[],
  pool: ReturnType<typeof getBrandPool>,
  allowedButtons: string[]
): Promise<string[]> {
  const lowerMessage = userMessage.toLowerCase();
  const lowerResponse = assistantMessage.toLowerCase();

  // Build contextual button pool based on conversation
  let contextualButtons: string[];

  const isAskingCost = lowerMessage.includes('cost') || lowerMessage.includes('price') ||
    lowerMessage.includes('fee') || lowerMessage.includes('investment') ||
    lowerResponse.includes('₹') || lowerResponse.includes('pricing');

  const isInterestedInService = lowerMessage.includes('pilot') || lowerMessage.includes('helicopter') ||
    lowerMessage.includes('cabin crew') || lowerMessage.includes('drone') ||
    lowerMessage.includes('ai') || lowerMessage.includes('automation') ||
    lowerResponse.includes('program') || lowerResponse.includes('solution');

  if (isAskingCost) {
    contextualButtons = pool.costButtons;
  } else if (isInterestedInService) {
    contextualButtons = pool.interestButtons;
  } else {
    contextualButtons = pool.genericButtons;
  }

  const unusedButtons = contextualButtons.filter(btn =>
    !usedButtonsLower.includes(btn.toLowerCase()) && !isSimilarToAny(btn, usedButtons)
  );
  const finalPool = unusedButtons.length > 0 ? unusedButtons : contextualButtons;

  try {
    const generated = await generateContextualButton(userMessage, assistantMessage, messageCount, pool, allowedButtons);
    if (generated && allowedButtons.some(btn => btn.toLowerCase() === generated.toLowerCase()) && !isBannedButton(generated)) {
      return [generated];
    }
    return allowedButtons.length > 0 ? [allowedButtons[0]] : [pool.defaultFallback];
  } catch {
    return allowedButtons.length > 0 ? [allowedButtons[0]] : [pool.defaultFallback];
  }
}

/**
 * Generate a single contextual button using Claude
 */
async function generateContextualButton(
  userMessage: string,
  assistantMessage: string,
  messageCount: number,
  pool: ReturnType<typeof getBrandPool>,
  allowedButtons?: string[]
): Promise<string | null> {
  const whitelistBlock = allowedButtons && allowedButtons.length > 0
    ? `\n\nSTRICT WHITELIST: You MUST choose ONLY from this exact list: [${allowedButtons.join(', ')}]. Never invent new buttons. If none fit, respond SKIP.`
    : '';

  const systemPrompt = `Based on what was just discussed, create one follow-up button that moves the conversation forward. Context: ${pool.claudeContext}

BUTTON RULES:
- 3-6 words. Title case. No emojis.
- Be SPECIFIC to the conversation - never generic like "Learn More" or "Explore Solutions" or "Get Started".
- Match what they actually talked about.
- NEVER repeat what was just explained.${whitelistBlock}

BANNED BUTTONS: Never generate "Tell Me My Business", "Learn More", "Explore Solutions", "Click Here", "Get Started", or any generic filler.

EXAMPLES:
- After discussing Meta ads: "Fix My Meta Ad Leads"
- After discussing pricing: "See Pricing Options"
- After qualifying: "Book a Quick Call"
- After discussing enrollment: "Fill My Empty Seats"
- After discussing AI chatbots: "Build My Chatbot"
- After discussing marketing: "Automate My Marketing"

If no relevant follow-up is appropriate, respond with only: SKIP
Output ONLY the button label text. No quotes. No explanation.`;

  const userPrompt = `User's question: ${userMessage}\n\nAssistant's reply: ${assistantMessage}\n\nMessage count: ${messageCount}\n\nGenerate ONE contextual follow-up button label.`;

  try {
    const suggestion = await generateShort(systemPrompt, userPrompt, 60);
    const normalized = suggestion.split('\n').map(s => s.trim()).filter(Boolean)[0] || '';

    if (!normalized || normalized.toUpperCase() === 'SKIP') {
      return null;
    }

    const cleaned = normalized.replace(/["']/g, '').trim();
    if (isBannedButton(cleaned)) {
      return null;
    }
    return cleaned;
  } catch {
    return null;
  }
}

// --- Helper functions ---

function areSimilarBookingButtons(button1: string, button2: string): boolean {
  const lower1 = button1.toLowerCase().trim();
  const lower2 = button2.toLowerCase().trim();

  if (lower1 === lower2) return true;

  const bookingKeywords = ['call', 'demo', 'book', 'schedule', 'meeting', 'appointment', 'strategy'];
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
