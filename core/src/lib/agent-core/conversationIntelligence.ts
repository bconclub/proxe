/**
 * lib/agent-core/conversationIntelligence.ts
 *
 * AI-based intent / profile extraction from conversation history.
 * Used by the WhatsApp Meta webhook + web chat postProcess + an admin
 * backfill route - keyword matching alone misses too many casual messages
 * ("I wanna fly planes" doesn't trip "pilot").
 *
 * Cheap to run: Claude Haiku, ~$0.0001 per extraction.
 */

import { isLikelyRealPersonName, cleanDisplayName } from '@/lib/services/utils';

export type CourseInterest = 'DGCA' | 'Flight' | 'Heli' | 'Cabin';
export type UserType = 'student' | 'parent' | 'professional' | 'early_stage';
export type Timeline = 'asap' | '1-3mo' | '6+mo' | '1yr+';

export interface ConversationProfile {
  user_type?: UserType | null;
  course_interest?: CourseInterest | null;
  timeline?: Timeline | null;
  education?: string | null;
  city?: string | null;
  age?: number | null;
  key_interest_signal?: string | null;
  // Customer's real name when they explicitly state it in chat. Used to fix
  // garbled WhatsApp/Instagram display names (e.g. "♥⁠╣firru╠⁠♥" → "Firdose").
  // Auto-promotion to customer_name happens in the webhook handler, NOT here.
  full_name?: string | null;
}

interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

const PROFILE_SYSTEM_PROMPT = `You are an aviation training counsellor's assistant analyzing a WhatsApp conversation between a customer and the counsellor.
Extract the customer's PROFILE from what they have said.

Return JSON ONLY (no prose, no markdown, no code fences):
{
  "user_type": "student | parent | professional | early_stage | null",
  "course_interest": "DGCA | Flight | Heli | Cabin | null",
  "timeline": "asap | 1-3mo | 6+mo | 1yr+ | null",
  "education": "string | null",
  "city": "string | null",
  "age": number | null,
  "key_interest_signal": "1-line summary of their main interest",
  "full_name": "string | null"
}

Rules:
- ONLY set a field if the CUSTOMER (not the counsellor) said something that supports it.
- user_type:
    - "student" = they are the aspiring pilot, in or just out of 12th
    - "parent" = asking on behalf of son/daughter
    - "professional" = career changer with work experience
    - "early_stage" = below 12th / very young / exploring
- course_interest (pick ONE most likely based on what they said):
    - "DGCA" = generic "pilot training" / "become a pilot" / "CPL" / "ground classes"
    - "Flight" = explicitly mentioned flight training abroad / hours / actual flying schools
    - "Heli" = helicopter pilot
    - "Cabin" = cabin crew / flight attendant / air hostess
- timeline:
    - "asap" = wants to start this month / urgently
    - "1-3mo" = next 1-3 months
    - "6+mo" = within the year but not urgent
    - "1yr+" = a year or more out
- education: extract verbatim if mentioned ("12th PCM", "BCom 2nd year", "Working Professional")
- city: only if explicitly mentioned
- age: only if explicitly mentioned as a number
- Set fields to null when the conversation doesn't clearly indicate.
- key_interest_signal: short sentence describing what they're most interested in.
- full_name: ONLY set when the customer EXPLICITLY states their own name in
    their messages. Examples that qualify:
      "Hi, I'm Firdose Taj"
      "My name is Rakesh"
      "This is Anu, looking for info on CPL"
      "Aamiri here"
    Examples that DO NOT qualify:
      "My son's name is Rohan"   (that's not the customer)
      "I want to be like Sachin" (referring to someone else)
      "Hi"                       (no name stated)
    Extract just the person's name (first + last if given), no titles
    (Mr./Mrs./Dr.), no decorations. If unsure, return null. Null is safer
    than guessing.

Do NOT invent or guess. Null is better than a wrong value.`;

export async function extractProfileFromConversation(
  history: HistoryMessage[],
): Promise<ConversationProfile | null> {
  if (!history || history.length === 0) return null;

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    console.error('[conversationIntelligence] CLAUDE_API_KEY not set');
    return null;
  }

  // Format conversation for the classifier
  const transcript = history
    .slice(-30) // Last 30 messages - plenty of context, caps token cost
    .map((m) => `${m.role === 'user' ? 'Customer' : 'Counsellor'}: ${m.content}`)
    .join('\n');

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 384,
        system: PROFILE_SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: `Conversation:\n\n${transcript}\n\nExtract the customer's profile as JSON.` },
        ],
      }),
    });

    if (!response.ok) {
      console.error('[conversationIntelligence] Claude API error:', response.status, await response.text());
      return null;
    }

    const data = await response.json();
    const responseText = data.content?.[0]?.text || '{}';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[conversationIntelligence] Could not parse JSON from response:', responseText);
      return null;
    }
    const parsed = JSON.parse(jsonMatch[0]);

    // Normalize and validate
    const out: ConversationProfile = {};
    if (parsed.user_type && ['student', 'parent', 'professional', 'early_stage'].includes(parsed.user_type)) {
      out.user_type = parsed.user_type;
    }
    if (parsed.course_interest && ['DGCA', 'Flight', 'Heli', 'Cabin'].includes(parsed.course_interest)) {
      out.course_interest = parsed.course_interest;
    }
    if (parsed.timeline && ['asap', '1-3mo', '6+mo', '1yr+'].includes(parsed.timeline)) {
      out.timeline = parsed.timeline;
    }
    if (parsed.education && typeof parsed.education === 'string') {
      out.education = parsed.education.trim() || null;
    }
    if (parsed.city && typeof parsed.city === 'string') {
      out.city = parsed.city.trim() || null;
    }
    if (typeof parsed.age === 'number' && parsed.age >= 10 && parsed.age <= 100) {
      out.age = Math.round(parsed.age);
    }
    if (parsed.key_interest_signal && typeof parsed.key_interest_signal === 'string') {
      out.key_interest_signal = parsed.key_interest_signal.trim() || null;
    }
    // full_name: Haiku is told to only set this when the customer states their
    // own name explicitly. Defence-in-depth: clean any decorative junk and
    // run it through isLikelyRealPersonName so brand/UI labels/business names
    // don't sneak through.
    if (parsed.full_name && typeof parsed.full_name === 'string') {
      const cleaned = cleanDisplayName(parsed.full_name);
      if (cleaned && isLikelyRealPersonName(cleaned)) {
        out.full_name = cleaned;
      }
    }

    return out;
  } catch (err) {
    console.error('[conversationIntelligence] Extraction failed:', err);
    return null;
  }
}

/**
 * Merge a newly extracted profile into the existing brand context.
 * Never overwrites a non-null existing value with null (preserves data).
 * Always uses the new value when both are present.
 */
export function mergeProfile(
  existing: Record<string, any> = {},
  next: ConversationProfile,
): Record<string, any> {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(next)) {
    // full_name is handled separately at the call site (promoted to
    // customer_name when the stored name is garbled). Don't store it inside
    // the brand context - that would create a confusing duplicate.
    if (key === 'full_name') continue;
    if (value !== null && value !== undefined && value !== '') {
      merged[key] = value;
    }
  }
  // timeline syncs to plan_to_fly for legacy consumers
  if (next.timeline) merged.plan_to_fly = next.timeline;
  return merged;
}
