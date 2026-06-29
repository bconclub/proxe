/**
 * Keyword-triggered quick-reply configs. When a customer's WhatsApp message
 * matches one of these triggers, we send a pre-defined interactive message
 * (body + up to 3 buttons) instead of calling the LLM. Faster, deterministic,
 * and matches how customers actually communicate (tap-driven, not type-driven).
 *
 * Trigger rules (deliberately conservative — we only short-circuit on SHORT
 * messages so multi-sentence questions still go through Claude):
 *   - Message is <= 4 words AND matches a trigger regex
 *
 * Button labels are capped at 20 chars by sendWhatsAppInteractiveButtons.
 *
 * When a customer TAPS a button, Meta echoes the title back to our webhook
 * as the next inbound message — so a tap on "How it works" arrives as a text
 * message "How it works", which Claude then handles normally with the existing
 * conversation history for context. (The route detects button taps and does NOT
 * re-fire a quick reply on them, to avoid a button-menu loop.)
 *
 * BCON is a B2B AI-first marketing company. The single CTA is booking a free
 * "AI Brand Audit". No aviation/pilot wording anywhere.
 */

export interface QuickReplyConfig {
  /** Optional header strip text (<= 60 chars) */
  header?: string;
  /** Main body text shown above the buttons (<= 1024 chars) */
  body: string;
  /** 1–3 button labels (each <= 20 chars) */
  buttons: string[];
  /** Used for analytics + logging; identifies which trigger fired */
  triggerKey: string;
}

interface QuickReplyTrigger {
  match: RegExp;
  config: QuickReplyConfig;
}

const TRIGGERS: QuickReplyTrigger[] = [
  // ── Greeting ──────────────────────────────────────────────────────────────
  {
    match: /\b(hi|hello|hey|hi there|hello there)\b/i,
    config: {
      triggerKey: 'greeting',
      body: "Hey, welcome to BCON. I'm PROXe, BCON's AI. How can I help you today?",
      buttons: ['Book AI Brand Audit', 'How it works', 'What I get'],
    },
  },
  // ── Pricing ───────────────────────────────────────────────────────────────
  {
    match: /\b(price|cost|pricing|charges?|how much|rates?|fees?)\b/i,
    config: {
      triggerKey: 'pricing',
      body: 'Happy to help. The best first step is a free AI Brand Audit where we map it out for your business — want to book one?',
      buttons: ['Book AI Brand Audit', 'How it works', 'Talk to team'],
    },
  },
  // ── What you do ───────────────────────────────────────────────────────────
  {
    match: /\b(what do you do|services|about|what is bcon|what's this|whats this)\b/i,
    config: {
      triggerKey: 'what_you_do',
      body: 'BCON builds AI systems for marketing — customer acquisition, brand, content & ads. AI-first, humans in the loop.',
      buttons: ['Book AI Brand Audit', 'How it works', 'See results'],
    },
  },
  // ── Audit / demo info ─────────────────────────────────────────────────────
  {
    match: /\b(audit|demo|session|meeting|consultation)\b/i,
    config: {
      triggerKey: 'audit_info',
      body: 'Great — the AI Brand Audit is a strategy session where we map a custom AI system for your business.',
      buttons: ['Book AI Brand Audit', "What's involved", 'Talk to team'],
    },
  },
  // ── Get started ───────────────────────────────────────────────────────────
  {
    match: /\b(get started|sign up|interested|let's go|lets go)\b/i,
    config: {
      triggerKey: 'get_started',
      body: "Let's get going — book your AI Brand Audit and we'll map it out together.",
      buttons: ['Book AI Brand Audit', 'Talk to team'],
    },
  },
  // ── Human ─────────────────────────────────────────────────────────────────
  {
    match: /\b(human|agent|talk to someone|real person|call me|talk to team)\b/i,
    config: {
      triggerKey: 'human',
      body: "Sure — I'll connect you with the BCON team.",
      buttons: ['Talk to team', 'Book AI Brand Audit'],
    },
  },
];

/**
 * Find a matching quick-reply config for a customer's message.
 * Returns null if no trigger fires OR if the message is too long (we treat
 * long messages as nuanced enough to need the LLM).
 */
export function findQuickReplyFor(message: string): QuickReplyConfig | null {
  if (!message) return null;
  const trimmed = message.trim();
  // Only short messages should short-circuit Claude. A long sentence like
  // "tell me about your pricing and what an audit involves please" deserves a
  // real LLM answer, not a button menu.
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount > 4) return null;
  for (const t of TRIGGERS) {
    if (t.match.test(trimmed)) return t.config;
  }
  return null;
}

/**
 * Strip LLM-emitted button markers from a free-form response and return
 * { text, buttons }. The prompt asks Claude to end its reply with
 *   [BTN: How it works][BTN: What's involved][BTN: Book AI Brand Audit]
 * when 2-3 distinct options apply.
 *
 * Returns:
 *   - text:    response with all [BTN: ...] tokens removed (trimmed)
 *   - buttons: extracted labels in order (cap 3, each cap 20 chars)
 */
export function extractButtonsFromLLMResponse(raw: string): { text: string; buttons: string[] } {
  if (!raw) return { text: '', buttons: [] };
  const buttons: string[] = [];
  const cleaned = raw.replace(/\[BTN:\s*([^\]]+)\]/gi, (_match, label) => {
    const t = String(label).trim().slice(0, 20);
    if (t && buttons.length < 3) buttons.push(t);
    return '';
  });
  return {
    text: cleaned.replace(/\s+$/g, '').trim(),
    buttons,
  };
}

/** Matches a booking time-slot label like "3:00 PM" / "11:30 AM". */
const TIME_SLOT_LABEL = /^\d{1,2}:\d{2}\s*(AM|PM)$/i;
const normTime = (s: string) => s.toUpperCase().replace(/\s+/g, '');

/**
 * Deterministic guard against offering an already-booked slot.
 *
 * The LLM is told to offer ONLY the open times check_availability returns, but
 * it sometimes parrots the prompt's example menu and offers a slot that is
 * actually taken. The customer then taps it and gets a "that's booked" bounce —
 * a bad experience. Given the open times from the tool, this strips any
 * time-slot [BTN: …] for a slot that is NOT open, and (only when it actually
 * removed one) scrubs that time from the prose enumeration too.
 *
 * Non-time buttons (Book AI Brand Audit, How it works, …) are always preserved.
 * When `openTimes` is null (check_availability was not called this turn) the
 * text is returned untouched — we never invent availability.
 */
export function stripBookedTimeSlots(raw: string, openTimes: string[] | null): string {
  if (!raw || openTimes === null) return raw;
  const open = new Set(openTimes.map(normTime));
  const bookedOffered: string[] = [];

  let out = raw.replace(/\[BTN:\s*([^\]]+)\]/gi, (marker, label) => {
    const l = String(label).trim();
    if (!TIME_SLOT_LABEL.test(l)) return marker; // keep non-time buttons
    if (open.has(normTime(l))) return marker;     // slot is open — keep
    bookedOffered.push(l);                         // booked — drop the button
    return '';
  });

  // Only touch the prose if we actually removed a booked button — keeps every
  // normal message byte-identical.
  for (const bt of bookedOffered) {
    const esc = bt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\?\s+/g, '\\s*');
    // Remove the time and any adjacent list separator ("3:00 PM, " / ", or 3:00 PM" / " or 3:00 PM").
    out = out.replace(new RegExp(`\\s*,?\\s*(?:or\\s+)?${esc}`, 'gi'), '');
  }
  if (bookedOffered.length > 0) {
    out = out
      .replace(/,\s*,/g, ',')
      .replace(/([.?!])\s*,/g, '$1')        // "works., 4:00" -> "works. 4:00"
      .replace(/,\s*(or\b)?\s*\?/gi, '?')
      .replace(/\bor\s*\?/gi, '?')
      .replace(/,\s*or\b/gi, ' or')
      .replace(/\s+([.?!,])/g, '$1')
      .replace(/([.?!:])\s*([A-Za-z])/g, '$1 $2')  // restore the space the line above may eat
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  return out;
}
