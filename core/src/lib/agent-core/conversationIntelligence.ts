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
import { BRAND_ID } from '@/configs';

export type CourseInterest = 'DGCA' | 'Flight' | 'Heli' | 'Cabin';
export type UserType = 'student' | 'parent' | 'professional' | 'early_stage';
export type Timeline = 'asap' | '1-3mo' | '6+mo' | '1yr+';

/** Lokazen segments by audience, not by course. */
export type LokazenUserType = 'owner' | 'brand' | 'scout';

export interface ConversationProfile {
  user_type?: UserType | LokazenUserType | null;
  course_interest?: CourseInterest | null;
  timeline?: Timeline | string | null;
  education?: string | null;
  city?: string | null;
  age?: number | null;
  key_interest_signal?: string | null;
  /**
   * Lokazen commercial-real-estate fields (brand_name, target_zones,
   * required_size_sqft, property_zone, ...). Keys are validated against
   * LOKAZEN_STRING_FIELDS before they land here, so this stays a closed set
   * even though the index signature is open.
   */
  [lokazenField: string]: unknown;
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

// ── Lokazen (commercial real-estate) profile schema ────────────────────────
// The aviation prompt above has nowhere to put a brand name, a target zone, a
// size or a rent budget, so on Lokazen it extracted nothing and every WhatsApp
// lead landed with an empty brief. Field names below are the EXACT keys the web
// chat writes (app/api/agent/web/chat/route.ts) so both channels populate the
// same unified_context.lokazen shape and the dashboard reads one vocabulary.
const LOKAZEN_PROFILE_SYSTEM_PROMPT = `You are analysing a WhatsApp conversation between a customer and Lokazen, a commercial real-estate service in Bangalore.
Lokazen serves three audiences: BRANDS looking for commercial space, property OWNERS listing space, and SCOUTS (gig workers who spot vacant shops).
Extract the customer's PROFILE from what they have said.

Return JSON ONLY (no prose, no markdown, no code fences):
{
  "user_type": "owner | brand | scout | null",
  "city": "string | null",
  "timeline": "string | null",
  "key_interest_signal": "1-line summary of their main interest",
  "full_name": "string | null",

  "brand_name": "string | null",
  "brand_category": "string | null",
  "business_type": "string | null",
  "current_outlets": "string | null",
  "expansion_intent": "string | null",
  "target_zones": "string | null",
  "required_size_sqft": "string | null",
  "budget_monthly_rent": "string | null",
  "preferred_format": "string | null",

  "property_address": "string | null",
  "property_zone": "string | null",
  "property_type": "string | null",
  "property_size_sqft": "string | null",
  "asking_rent_monthly": "string | null",
  "availability_date": "string | null",
  "floor": "string | null",
  "frontage_ft": "string | null",
  "amenities": "string | null",

  "scout_area_covered": "string | null",
  "scout_knows_properties": "string | null"
}

Rules:
- ONLY set a field if the CUSTOMER (not Lokazen) said something that supports it.
- user_type:
    - "brand" = a business looking FOR space (has a brand/company, wants an outlet)
    - "owner" = has a property and wants to LIST it
    - "scout" = signed up to spot and submit vacant properties for a fee
- BRAND fields (brand_name ... preferred_format) apply ONLY when user_type is "brand".
  PROPERTY fields (property_* ... amenities) apply ONLY when user_type is "owner".
  Never fill both sets. A brand's requirement is required_size_sqft, NOT property_size_sqft.
- brand_name: the BUSINESS name, verbatim ("Dilawar Restaurant", "Open Momo"). Never a person's name.
- current_outlets: verbatim as stated ("4 outlets in Bangalore", "first outlet").
- target_zones / property_zone: capture ALL areas the customer names, comma-separated
  ("Indiranagar, Whitefield, JP Nagar"). A compass zone ("East Bangalore") also counts.
- required_size_sqft / property_size_sqft: verbatim ("600-1500 sqft", "1500+ sqft").
- budget_monthly_rent / asking_rent_monthly: verbatim ("1L-2.5L", "above 2.5L", "Rs 80,000").
- timeline / availability_date: verbatim ("Immediately", "within a month", "just exploring").
- Values are short verbatim strings, not sentences. Do not reformat numbers or units.
- Set fields to null when the conversation doesn't clearly indicate.
- full_name: ONLY when the customer EXPLICITLY states their OWN name.
    "Hi, I'm Sarvesh" qualifies. A brand name does NOT - "Dilawar Restaurant" is a
    business, it goes in brand_name and full_name stays null. If unsure, return null.

Do NOT invent or guess. Null is better than a wrong value.`;

// Lokazen string fields the validator accepts back from Haiku. Anything not in
// this list is dropped, so a hallucinated key can never reach unified_context.
const LOKAZEN_STRING_FIELDS = [
  'brand_name', 'brand_category', 'business_type', 'current_outlets', 'expansion_intent',
  'target_zones', 'required_size_sqft', 'budget_monthly_rent', 'preferred_format',
  'property_address', 'property_zone', 'property_type', 'property_size_sqft',
  'asking_rent_monthly', 'availability_date', 'floor', 'frontage_ft', 'amenities',
  'scout_area_covered', 'scout_knows_properties',
  'city', 'timeline', 'key_interest_signal',
] as const;

const IS_LOKAZEN = BRAND_ID === 'lokazen';

export async function extractProfileFromConversation(
  history: HistoryMessage[],
): Promise<ConversationProfile | null> {
  if (!history || history.length === 0) return null;

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    console.error('[conversationIntelligence] CLAUDE_API_KEY not set');
    return null;
  }

  // Format conversation for the classifier. The agent's label matters - calling
  // Lokazen's assistant a "Counsellor" nudges Haiku toward the aviation frame.
  const agentLabel = IS_LOKAZEN ? 'Lokazen' : 'Counsellor';
  const transcript = history
    .slice(-30) // Last 30 messages - plenty of context, caps token cost
    .map((m) => `${m.role === 'user' ? 'Customer' : agentLabel}: ${m.content}`)
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
        // Lokazen's schema has ~20 more fields than the aviation one.
        max_tokens: IS_LOKAZEN ? 768 : 384,
        system: IS_LOKAZEN ? LOKAZEN_PROFILE_SYSTEM_PROMPT : PROFILE_SYSTEM_PROMPT,
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

    // ── Lokazen: audience + commercial-real-estate fields ──────────────────
    if (IS_LOKAZEN) {
      const ut = String(parsed.user_type ?? '').toLowerCase().trim();
      if (['owner', 'brand', 'scout'].includes(ut)) out.user_type = ut as LokazenUserType;

      for (const field of LOKAZEN_STRING_FIELDS) {
        const raw = parsed[field];
        if (typeof raw !== 'string') continue;
        const val = raw.trim();
        // Haiku sometimes echoes the placeholder rather than omitting the key.
        if (!val || /^(null|n\/a|none|unknown|not mentioned)$/i.test(val)) continue;
        out[field] = val.slice(0, 200);
      }

      // A brand's requirement and an owner's property are different columns.
      // If the audience is known, drop the other side's fields so a
      // misclassified answer can't pollute the record.
      const BRAND_ONLY = ['brand_name', 'brand_category', 'business_type', 'current_outlets',
        'expansion_intent', 'target_zones', 'required_size_sqft', 'budget_monthly_rent', 'preferred_format'];
      const OWNER_ONLY = ['property_address', 'property_zone', 'property_type', 'property_size_sqft',
        'asking_rent_monthly', 'availability_date', 'floor', 'frontage_ft', 'amenities'];
      if (out.user_type === 'brand') for (const f of OWNER_ONLY) delete out[f];
      if (out.user_type === 'owner') for (const f of BRAND_ONLY) delete out[f];

      if (parsed.full_name && typeof parsed.full_name === 'string') {
        const cleaned = cleanDisplayName(parsed.full_name);
        // Guard against the business name being promoted to the person's name
        // ("Hi Bulbul Blablu"). If it matches what we captured as the brand,
        // it is not a person.
        const brandName = typeof out.brand_name === 'string' ? out.brand_name.toLowerCase() : '';
        if (cleaned && isLikelyRealPersonName(cleaned) && cleaned.toLowerCase() !== brandName) {
          out.full_name = cleaned;
        }
      }
      return out;
    }

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
  // timeline syncs to plan_to_fly for legacy AVIATION consumers only. On
  // Lokazen a timeline is "when do you need the space", nothing to do with
  // flying - the mirrored key was showing up on scouts and property owners.
  if (next.timeline && !IS_LOKAZEN) merged.plan_to_fly = next.timeline;
  return merged;
}
