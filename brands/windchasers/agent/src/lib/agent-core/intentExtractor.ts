/**
 * Intent Extractor - Keyword-based intent classification
 * Extracted from web-agent/api/chat/route.ts (lines 437-489)
 */

import { ExtractedIntent } from './types';

/**
 * Extract user intent from a message using keyword matching
 */
export function extractIntent(
  message: string,
  usedButtons?: string[]
): ExtractedIntent {
  const lowerMessage = message.toLowerCase();
  const intent: ExtractedIntent = {};

  // Track button clicks
  if (usedButtons && usedButtons.length > 0) {
    intent.buttonClicks = usedButtons;
  }

  // Track questions asked
  const questions: string[] = [];
  if (lowerMessage.includes('cost') || lowerMessage.includes('price') || lowerMessage.includes('fee')) {
    questions.push('cost');
  }
  if (lowerMessage.includes('eligibility') || lowerMessage.includes('qualification') || lowerMessage.includes('requirements')) {
    questions.push('eligibility');
  }
  if (lowerMessage.includes('timeline') || lowerMessage.includes('duration') || lowerMessage.includes('how long')) {
    questions.push('timeline');
  }
  if (lowerMessage.includes('course') || lowerMessage.includes('program') || lowerMessage.includes('training')) {
    questions.push('course');
  }
  if (questions.length > 0) {
    intent.questionsAsked = questions;
  }

  // Track user type
  if (lowerMessage.includes('student') || lowerMessage.includes('myself')) {
    intent.userType = 'student';
  } else if (lowerMessage.includes('parent') || lowerMessage.includes('child') || lowerMessage.includes('son') || lowerMessage.includes('daughter')) {
    intent.userType = 'parent';
  } else if (lowerMessage.includes('professional') || lowerMessage.includes('career change')) {
    intent.userType = 'professional';
  }

  // Track course interest
  if (lowerMessage.includes('pilot') && !lowerMessage.includes('helicopter')) {
    intent.courseInterest = 'pilot';
  } else if (lowerMessage.includes('helicopter')) {
    intent.courseInterest = 'helicopter';
  } else if (lowerMessage.includes('drone')) {
    intent.courseInterest = 'drone';
  } else if (lowerMessage.includes('cabin crew') || lowerMessage.includes('flight attendant')) {
    intent.courseInterest = 'cabin';
  }

  // Track timeline
  if (lowerMessage.includes('asap') || lowerMessage.includes('immediately') || lowerMessage.includes('soon')) {
    intent.timeline = 'asap';
  } else if (lowerMessage.includes('1-3') || lowerMessage.includes('1 to 3') || lowerMessage.includes('few months')) {
    intent.timeline = '1-3mo';
  } else if (lowerMessage.includes('6+') || lowerMessage.includes('6 months') || lowerMessage.includes('half year')) {
    intent.timeline = '6+mo';
  } else if (lowerMessage.includes('1 year') || lowerMessage.includes('1yr')) {
    intent.timeline = '1yr+';
  }

  return intent;
}

// ─── Pain Point Extraction (keyword-based, zero token cost) ─────────────────

interface PainPointMatch {
  painPoint: string;
  specificity: number; // higher = more specific, should overwrite generic
}

const PAIN_POINT_PATTERNS: { pattern: RegExp; painPoint: string; specificity: number }[] = [
  // Lead generation problems (most common for BCON)
  { pattern: /\b(?:not\s+getting|don'?t\s+get|no|lack\s+of|need\s+more)\s+(?:enough\s+)?(?:leads?|customers?|clients?|inquir)/i, painPoint: 'not getting enough leads', specificity: 3 },
  { pattern: /\b(?:losing|lost|lose)\s+(?:leads?|customers?|clients?)/i, painPoint: 'losing leads to competition', specificity: 3 },
  { pattern: /\bleads?\s+(?:not|aren'?t|don'?t)\s+convert/i, painPoint: 'leads not converting', specificity: 3 },
  { pattern: /\b(?:low|poor|bad)\s+(?:conversion|close)\s+rate/i, painPoint: 'leads not converting', specificity: 3 },
  { pattern: /\bcan'?t\s+(?:handle|manage|keep\s+up\s+with)\s+(?:all\s+)?(?:the\s+)?(?:leads?|inquir|calls?|requests?)/i, painPoint: "can't handle incoming inquiries", specificity: 3 },
  { pattern: /\b(?:too\s+many|overwhelmed\s+with|flooded\s+with)\s+(?:leads?|inquir|calls?|messages?)/i, painPoint: "can't handle incoming inquiries", specificity: 3 },
  { pattern: /\bmissing\s+(?:calls?|leads?|inquir|messages?)/i, painPoint: "can't handle incoming inquiries", specificity: 2 },

  // Follow-up problems
  { pattern: /\bno\s+(?:follow[\s-]?up|followup)/i, painPoint: 'no follow-up system', specificity: 3 },
  { pattern: /\b(?:forget|forgetting|missed)\s+(?:to\s+)?(?:follow[\s-]?up|call\s+back|respond)/i, painPoint: 'no follow-up system', specificity: 2 },
  { pattern: /\bslow\s+(?:response|reply|follow[\s-]?up)/i, painPoint: 'no follow-up system', specificity: 2 },

  // Online presence
  { pattern: /\bno\s+(?:website|online\s+presence|digital\s+presence|social\s+media)/i, painPoint: 'no online presence', specificity: 3 },
  { pattern: /\b(?:need|want|build|create)\s+(?:a\s+)?website/i, painPoint: 'no online presence', specificity: 2 },

  // Manual / time problems
  { pattern: /\b(?:everything|all|it'?s?\s+all)\s+(?:is\s+)?manual/i, painPoint: 'manual processes eating time', specificity: 3 },
  { pattern: /\bmanual\s+(?:process|work|entry|tracking)/i, painPoint: 'manual processes eating time', specificity: 3 },
  { pattern: /\b(?:too\s+busy|no\s+time|spending\s+too\s+much\s+time|wasting\s+time)/i, painPoint: 'manual processes eating time', specificity: 2 },
  { pattern: /\b(?:doing\s+everything|handle\s+everything)\s+(?:myself|alone|by\s+hand)/i, painPoint: 'manual processes eating time', specificity: 2 },

  // Tracking / CRM
  { pattern: /\bno\s+(?:system|way|tool|crm)\s+(?:to\s+)?(?:track|manage|organize)/i, painPoint: 'no system to track customers', specificity: 3 },
  { pattern: /\b(?:track|tracking|manage|managing)\s+(?:customers?|leads?|clients?)\s+(?:is|feels?)\s+(?:hard|difficult|impossible|mess)/i, painPoint: 'no system to track customers', specificity: 3 },

  // Competition
  { pattern: /\bcompetit(?:ion|ors?)\s+(?:is|are)\s+(?:taking|stealing|getting|beating)/i, painPoint: 'losing leads to competition', specificity: 3 },
  { pattern: /\bcompetit(?:ion|ors?)\s+(?:has|have)\s+(?:better|more|an?\s+)/i, painPoint: 'losing leads to competition', specificity: 2 },

  // Generic fallbacks (lower specificity)
  { pattern: /\bi\s+need\s+(?:more\s+)?(?:leads?|customers?|clients?|sales?|business|growth)/i, painPoint: 'not getting enough leads', specificity: 1 },
  { pattern: /\b(?:grow|scale|expand)\s+(?:my|the|our)\s+business/i, painPoint: 'not getting enough leads', specificity: 1 },
  { pattern: /\b(?:struggling|stuck|not\s+growing)/i, painPoint: 'not getting enough leads', specificity: 1 },
];

/**
 * Extract pain point from a customer message using keyword matching.
 * Returns null if no pain point detected.
 * Higher specificity matches should overwrite lower ones.
 */
export function extractPainPoint(message: string): PainPointMatch | null {
  let best: PainPointMatch | null = null;

  for (const { pattern, painPoint, specificity } of PAIN_POINT_PATTERNS) {
    if (pattern.test(message)) {
      if (!best || specificity > best.specificity) {
        best = { painPoint, specificity };
      }
    }
  }

  return best;
}

// ─── Objection Detection (keyword-based, zero token cost) ───────────────────

interface DetectedObjection {
  type: 'price' | 'timing' | 'trust' | 'authority' | 'need';
}

const OBJECTION_PATTERNS: { pattern: RegExp; type: DetectedObjection['type'] }[] = [
  // Price objection
  { pattern: /\btoo\s+expensive\b/i, type: 'price' },
  { pattern: /\bcan'?t\s+afford\b/i, type: 'price' },
  { pattern: /\bout\s+of\s+(?:my\s+)?budget\b/i, type: 'price' },
  { pattern: /\btoo\s+much\b/i, type: 'price' },
  { pattern: /\bcost(?:s|ly)?\s+(?:too|a\s+lot)\b/i, type: 'price' },

  // Timing objection
  { pattern: /\bnot\s+(?:right\s+)?now\b/i, type: 'timing' },
  { pattern: /\bnot\s+the\s+right\s+time\b/i, type: 'timing' },
  { pattern: /\bmaybe\s+later\b/i, type: 'timing' },
  { pattern: /\bbusy\s+right\s+now\b/i, type: 'timing' },
  { pattern: /\bnext\s+(?:month|quarter|year)\b/i, type: 'timing' },

  // Trust objection
  { pattern: /\bnot\s+sure\s+about\s+this\b/i, type: 'trust' },
  { pattern: /\bseems?\s+too\s+good\b/i, type: 'trust' },
  { pattern: /\bhow\s+do\s+I\s+know\b/i, type: 'trust' },
  { pattern: /\bany\s+proof\b/i, type: 'trust' },
  { pattern: /\bany\s+(?:case\s+stud|testimonial|review|result)/i, type: 'trust' },
  { pattern: /\bis\s+this\s+(?:legit|real|genuine)\b/i, type: 'trust' },

  // Authority objection
  { pattern: /\bneed\s+to\s+(?:ask|check\s+with|talk\s+to)\s+my\b/i, type: 'authority' },
  { pattern: /\bnot\s+my\s+decision\b/i, type: 'authority' },
  { pattern: /\bhave\s+to\s+check\s+with\b/i, type: 'authority' },
  { pattern: /\bmy\s+(?:partner|boss|manager|team)\s+(?:needs?\s+to|has\s+to|should)\b/i, type: 'authority' },

  // Need objection
  { pattern: /\bdon'?t\s+need\s+this\b/i, type: 'need' },
  { pattern: /\bwe'?re\s+fine\b/i, type: 'need' },
  { pattern: /\balready\s+have\s+(?:something|a\s+solution|a\s+tool|a\s+system)\b/i, type: 'need' },
  { pattern: /\bnot\s+(?:looking|searching)\s+for\b/i, type: 'need' },
  { pattern: /\bdon'?t\s+(?:see\s+the\s+)?need\b/i, type: 'need' },
];

/**
 * Detect objections in a customer message using keyword matching.
 * Returns null if no objection detected.
 */
export function detectObjection(message: string): DetectedObjection | null {
  for (const { pattern, type } of OBJECTION_PATTERNS) {
    if (pattern.test(message)) {
      return { type };
    }
  }
  return null;
}

/**
 * Check if a message contains booking-related keywords
 */
export function isBookingIntent(message: string): boolean {
  const lowerText = message.toLowerCase().trim();
  return lowerText.includes('call') ||
    lowerText.includes('demo') ||
    lowerText.includes('book') ||
    lowerText.includes('schedule') ||
    lowerText.includes('meeting') ||
    lowerText.includes('appointment') ||
    lowerText.includes('consultation') ||
    lowerText.includes('slot') ||
    lowerText.includes('reschedule') ||
    lowerText.includes('cancel') ||
    lowerText.includes('when is it') ||
    lowerText.includes('what time') ||
    lowerText.includes('when is my') ||
    lowerText.includes('already booked') ||
    lowerText.includes('have a booking') ||
    lowerText.includes('have booked');
}
