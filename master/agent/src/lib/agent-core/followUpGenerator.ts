/**
 * Follow-Up Button Generator — Claude-powered contextual buttons
 * Brand-aware: uses brand config for button pools and Claude prompt context
 */

import { generateShort } from './claudeClient';
import { Channel } from './types';

/** Brand-specific button pools for fallback/static generation */
const brandButtonPools: Record<string, {
  firstMessage: string[];
  defaultFallback: string;
  costButtons: string[];
  interestButtons: string[];
  genericButtons: string[];
  bookingAware: string[];
  claudeContext: string;
  exploreKeywords: string[];
}> = {
  windchasers: {
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
    exploreKeywords: ['explore training options', 'explore training'],
  },
  bcon: {
    firstMessage: ['Explore AI Solutions', 'Book a Strategy Call', 'See Our Work', 'How It Works', 'Learn More'],
    defaultFallback: 'Book a Strategy Call',
    costButtons: ['Get a Proposal', 'See Pricing', 'Book Strategy Call'],
    interestButtons: ['Book Strategy Call', 'See Case Studies', 'Start a Project'],
    genericButtons: ['Book a Strategy Call', 'Explore AI Solutions', 'See Our Work', 'Get a Proposal', 'How It Works'],
    bookingAware: ['See Case Studies', 'How It Works', 'Get a Proposal'],
    claudeContext: `BCON AI business solutions chatbot.
BCON helps businesses understand and implement AI solutions:
- AI in Business — Custom AI automation, chatbots, workflow optimization
- Brand Marketing — AI-powered campaigns, content strategy
- Business Apps — Custom web apps, dashboards, SaaS products
- PROXe Platform — AI-powered business operating system

AVAILABLE BUTTON TYPES:
- Information: "Learn More", "See Case Studies", "How It Works"
- Exploration: "Explore AI Solutions", "See Our Work"
- Booking: "Book Strategy Call", "Schedule Demo"
- Next Steps: "Get a Proposal", "Start a Project"`,
    exploreKeywords: ['explore ai solutions', 'explore ai'],
  },
  proxe: {
    firstMessage: ['Deploy PROXe', 'Book a Demo', 'PROXe Pricing', 'Learn More'],
    defaultFallback: 'Book a Demo',
    costButtons: ['PROXe Pricing', 'Compare Plans', 'Book a Demo'],
    interestButtons: ['Deploy PROXe', 'Book a Demo', 'See Features'],
    genericButtons: ['Deploy PROXe', 'Book a Demo', 'PROXe Pricing', 'See Features'],
    bookingAware: ['See Features', 'Compare Plans', 'Deploy PROXe'],
    claudeContext: `PROXe AI-powered business platform chatbot.
PROXe is an AI-powered business operating system:
- Web PROXe — AI chat widget for websites
- WhatsApp PROXe — WhatsApp AI agent
- Voice PROXe — Voice AI agent
- Social PROXe — Social media AI agent

AVAILABLE BUTTON TYPES:
- Information: "Learn More", "See Features", "Compare Plans"
- Exploration: "What's PROXe", "See Integrations"
- Booking: "Book a Demo", "Schedule Call"
- Next Steps: "Deploy PROXe", "PROXe Pricing"`,
    exploreKeywords: ['explore proxe', "what's proxe"],
  },
};

function getBrandPool(brand?: string) {
  return brandButtonPools[brand || 'windchasers'] || brandButtonPools['windchasers'];
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

  // WhatsApp and other non-web channels don't get buttons
  if (channel !== 'web') {
    return [];
  }

  const lowerMessage = userMessage.toLowerCase();
  const isFirstMessage = messageCount === 1 || messageCount === 0;
  const usedButtonsLower = usedButtons.map(b => b.toLowerCase());

  // Check for explore click → show explore buttons from brand config
  if (pool.exploreKeywords.some(kw => lowerMessage.includes(kw)) && exploreButtons.length > 0) {
    return exploreButtons;
  }

  // User has existing booking → filter out booking buttons
  if (hasExistingBooking) {
    return generateBookingAwareButtons(isFirstMessage, usedButtons, usedButtonsLower, pool);
  }

  // Normal flow: 3-2-1 button structure
  if (isFirstMessage) {
    return await generateFirstMessageButtons(userMessage, assistantMessage, messageCount, usedButtons, usedButtonsLower, pool);
  }

  return await generateSubsequentButtons(userMessage, assistantMessage, messageCount, usedButtons, usedButtonsLower, pool);
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
  pool: ReturnType<typeof getBrandPool>
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
    const generated = await generateContextualButton(userMessage, assistantMessage, messageCount, pool);
    if (generated && !usedButtonsLower.includes(generated.toLowerCase())) {
      return [generated];
    }
    return finalPool.length > 0 ? [finalPool[Math.floor(Math.random() * finalPool.length)]] : [pool.defaultFallback];
  } catch {
    return finalPool.length > 0 ? [finalPool[Math.floor(Math.random() * finalPool.length)]] : [pool.defaultFallback];
  }
}

/**
 * Generate a single contextual button using Claude
 */
async function generateContextualButton(
  userMessage: string,
  assistantMessage: string,
  messageCount: number,
  pool: ReturnType<typeof getBrandPool>
): Promise<string | null> {
  const systemPrompt = `You create one short, direct follow-up call-to-action button label for ${pool.claudeContext}

BUTTON GENERATION RULES:
- First user message (messageCount = 1): Generate 1 button most relevant to their question
- Subsequent messages: Generate 1 button for the next logical step
- 3-7 words. Title case. No emojis.
- Be contextual - match the conversation flow
- NEVER repeat what was just explained
- NEVER suggest something they already understood

TONE: Direct, professional. No sales-y language.

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
