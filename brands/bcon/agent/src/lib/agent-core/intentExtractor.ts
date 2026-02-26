/**
 * Intent Extractor — Keyword-based intent classification
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
    lowerText.includes('appointment');
}
