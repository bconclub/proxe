/**
 * lib/agent-core/conversationIntelligence.ts  (BCON)
 *
 * AI-based business-lead profile extraction from conversation history.
 * Used by the WhatsApp Meta webhook + web chat postProcess (+ an admin
 * backfill route) — keyword matching alone misses casual phrasing
 * ("we can't keep up with enquiries" doesn't trip "leads").
 *
 * BCON is an AI-first marketing solutions brand selling to BUSINESSES — so
 * this extracts a B2B qualification profile (business type, service interest,
 * pain point, urgency, lead volume, decision-maker). It deliberately does NOT
 * reuse Windchasers' aviation/student schema.
 *
 * Cheap to run: Claude Haiku, ~$0.0001 per extraction.
 */

export type ServiceInterest =
  | 'AI Brand Audit'
  | 'Lead Automation'
  | 'Marketing / Ads'
  | 'Website / Funnel'
  | 'AI Agent / Chatbot'
  | 'Other';
export type BusinessUserType = 'owner' | 'partner' | 'employee' | 'agency' | 'freelancer';
export type Timeline = 'asap' | '1-3mo' | '3-6mo' | 'exploring';

export interface ConversationProfile {
  /** What the business actually does, verbatim-ish ("tyre retreading", "interior design"). */
  business_type?: string | null;
  /** Which BCON service they're leaning toward. */
  service_interest?: ServiceInterest | null;
  /** Their main problem in their own words — the hook for the AI Brand Audit pitch. */
  pain_point?: string | null;
  /** How soon they want to move. */
  timeline?: Timeline | null;
  /** Rough monthly lead / enquiry / customer volume if stated ("about 100 leads"). */
  lead_volume?: string | null;
  /** Whether the person is the decision maker for the business. */
  user_type?: BusinessUserType | null;
  /** A 1-line summary of their main interest. */
  key_interest_signal?: string | null;
  // Customer's real name when they explicitly state it in chat. Used to fix
  // garbled WhatsApp/Instagram display names. Auto-promotion to customer_name
  // happens in the webhook handler, NOT here.
  full_name?: string | null;
}

interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

const PROFILE_SYSTEM_PROMPT = `You are a B2B sales assistant analyzing a WhatsApp/web conversation between a business owner and BCON (an AI-first marketing solutions company).
Extract the CUSTOMER's business PROFILE from what they have said.

Return JSON ONLY (no prose, no markdown, no code fences):
{
  "business_type": "string | null",
  "service_interest": "AI Brand Audit | Lead Automation | Marketing / Ads | Website / Funnel | AI Agent / Chatbot | Other | null",
  "pain_point": "string | null",
  "timeline": "asap | 1-3mo | 3-6mo | exploring | null",
  "lead_volume": "string | null",
  "user_type": "owner | partner | employee | agency | freelancer | null",
  "key_interest_signal": "1-line summary of their main interest",
  "full_name": "string | null"
}

Rules:
- ONLY set a field if the CUSTOMER (not the assistant) said something that supports it.
- business_type: what the business actually does, in plain words ("tyre retreading", "interior design studio", "dental clinic"). Do NOT guess from the brand name alone.
- service_interest (pick the ONE most likely from what they said):
    - "AI Brand Audit" = they want a review/audit, "where do I start", general help
    - "Lead Automation" = handling/following up enquiries, not missing leads, CRM, WhatsApp automation
    - "Marketing / Ads" = ads, reach, more customers, social media marketing
    - "Website / Funnel" = website, landing page, funnel, online presence
    - "AI Agent / Chatbot" = AI assistant, chatbot, auto-replies
    - "Other" = clearly a service none of the above covers
- pain_point: their main problem in their own words ("losing leads", "no time to follow up", "ads not converting"). Short.
- timeline:
    - "asap" = wants to start now / urgently
    - "1-3mo" = next 1-3 months
    - "3-6mo" = a few months out
    - "exploring" = just looking, no urgency
- lead_volume: only if they mention a number/volume of leads, enquiries, or customers ("around 100 leads a month", "50-60 enquiries").
- user_type:
    - "owner" = they own the business
    - "partner" = co-owner / partner
    - "employee" = works there but not the owner
    - "agency" = a marketing/agency reaching out on behalf of clients
    - "freelancer" = solo / freelancer
- key_interest_signal: short sentence describing what they're most interested in.
- full_name: ONLY set when the customer EXPLICITLY states their own name in
    their messages. Examples that qualify:
      "Hi, I'm Kiran"
      "My name is Bhavesh"
      "This is Anu from Onecly"
      "Tippu here"
    Examples that DO NOT qualify:
      "My partner's name is Rohan"   (that's not the customer)
      "We work with Sachin"          (referring to someone else)
      "Hi"                           (no name stated)
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
    .slice(-30) // Last 30 messages — plenty of context, caps token cost
    .map((m) => `${m.role === 'user' ? 'Customer' : 'Assistant'}: ${m.content}`)
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
          { role: 'user', content: `Conversation:\n\n${transcript}\n\nExtract the customer's business profile as JSON.` },
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
    if (parsed.business_type && typeof parsed.business_type === 'string') {
      out.business_type = parsed.business_type.trim() || null;
    }
    if (
      parsed.service_interest &&
      ['AI Brand Audit', 'Lead Automation', 'Marketing / Ads', 'Website / Funnel', 'AI Agent / Chatbot', 'Other'].includes(
        parsed.service_interest,
      )
    ) {
      out.service_interest = parsed.service_interest;
    }
    if (parsed.pain_point && typeof parsed.pain_point === 'string') {
      out.pain_point = parsed.pain_point.trim() || null;
    }
    if (parsed.timeline && ['asap', '1-3mo', '3-6mo', 'exploring'].includes(parsed.timeline)) {
      out.timeline = parsed.timeline;
    }
    if (parsed.lead_volume && typeof parsed.lead_volume === 'string') {
      out.lead_volume = parsed.lead_volume.trim() || null;
    }
    if (parsed.user_type && ['owner', 'partner', 'employee', 'agency', 'freelancer'].includes(parsed.user_type)) {
      out.user_type = parsed.user_type;
    }
    if (parsed.key_interest_signal && typeof parsed.key_interest_signal === 'string') {
      out.key_interest_signal = parsed.key_interest_signal.trim() || null;
    }
    // full_name: Haiku is told to only set this when the customer states their
    // own name explicitly. Defence-in-depth: clean any decorative junk and
    // run a sanity check so brand/UI labels/business names don't sneak through.
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
    // the brand context — that would create a confusing duplicate.
    if (key === 'full_name') continue;
    if (value !== null && value !== undefined && value !== '') {
      merged[key] = value;
    }
  }
  return merged;
}

// ── Local name sanitizers ─────────────────────────────────────────────────────
// Self-contained (BCON's services/utils doesn't export these). Strips emoji /
// decorative junk and rejects values that are clearly not a person's name so a
// business name or label never gets promoted to customer_name.

export function cleanDisplayName(raw: string): string {
  if (!raw) return '';
  return raw
    // drop anything that isn't a letter, space, hyphen or apostrophe
    .replace(/[^\p{L}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isLikelyRealPersonName(name: string): boolean {
  if (!name) return false;
  const n = name.trim();
  if (n.length < 2 || n.length > 40) return false;
  // must contain at least one letter
  if (!/\p{L}/u.test(n)) return false;
  // reject obvious non-names / placeholders
  const lower = n.toLowerCase();
  const blocked = ['na', 'n/a', 'none', 'nil', 'nothing', 'test', 'unknown', 'customer', 'user', 'admin', 'bcon'];
  if (blocked.includes(lower)) return false;
  // reject if it looks like a business suffix-only string
  if (/\b(pvt|ltd|llp|inc|enterprises|retreaders|interiors|solutions|technologies)\b/i.test(lower) && n.split(' ').length <= 2) {
    return false;
  }
  return true;
}
