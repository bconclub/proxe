/**
 * Keyword-triggered quick-reply configs. When a customer's WhatsApp message
 * matches one of these triggers, we send a pre-defined interactive message
 * (body + up to 3 buttons) instead of calling the LLM. Faster, deterministic,
 * and matches how customers actually communicate (tap-driven, not type-driven).
 *
 * Trigger rules (deliberately conservative — we only short-circuit on SHORT
 * messages so multi-sentence questions still go through Claude):
 *   - Message is ≤ 4 words AND matches a trigger regex
 *
 * Button labels are capped at 20 chars by sendWhatsAppInteractiveButtons.
 *
 * When a customer TAPS a button, Meta echoes the title back to our webhook
 * as the next inbound message — so a tap on "Timeline" arrives as a text
 * message "Timeline", which Claude then handles normally with the existing
 * conversation history for context.
 */

export interface QuickReplyConfig {
  /** Optional header strip text (≤ 60 chars) */
  header?: string;
  /** Main body text shown above the buttons (≤ 1024 chars) */
  body: string;
  /** 1–3 button labels (each ≤ 20 chars) */
  buttons: string[];
  /** Used for analytics + logging; identifies which trigger fired */
  triggerKey: string;
}

interface QuickReplyTrigger {
  match: RegExp;
  config: QuickReplyConfig;
}

const TRIGGERS: QuickReplyTrigger[] = [
  // ── Programs ────────────────────────────────────────────────────────────
  {
    match: /\b(cpl|commercial pilot)\b/i,
    config: {
      triggerKey: 'cpl',
      body: 'Got it, CPL. What would you like to know?',
      buttons: ['Timeline', "What's covered", 'How to start'],
    },
  },
  {
    match: /\b(ppl|private pilot)\b/i,
    config: {
      triggerKey: 'ppl',
      body: 'PPL it is. What would you like to know?',
      buttons: ['Timeline', 'Cost & duration', 'Where to fly'],
    },
  },
  {
    match: /\b(helicopter|heli|helo)\b/i,
    config: {
      triggerKey: 'helicopter',
      body: 'Helicopter pilot training. What would you like to know?',
      buttons: ['Timeline', 'Career options', 'Cost'],
    },
  },
  {
    match: /\b(cabin crew|air hostess|flight attendant)\b/i,
    config: {
      triggerKey: 'cabin_crew',
      body: 'Cabin Crew training. What would you like to know?',
      buttons: ['Eligibility', 'Duration', 'How to apply'],
    },
  },
  {
    match: /\b(drone|rpas|uav)\b/i,
    config: {
      triggerKey: 'drone',
      body: 'Drone pilot training. What would you like to know?',
      buttons: ['Career', 'Duration', 'Cost'],
    },
  },
  // ── Cost ────────────────────────────────────────────────────────────────
  {
    match: /\b(cost|fees?|price|pricing|how much|charges?)\b/i,
    config: {
      triggerKey: 'cost',
      body: 'Pilot training *investment* goes up to *₹80 lakh*. What would help?',
      buttons: ['Full breakdown', 'Talk to counsellor', 'Financing'],
    },
  },
  // ── Demo / Booking ──────────────────────────────────────────────────────
  {
    match: /\b(demo|book|schedule|consultation)\b/i,
    config: {
      triggerKey: 'demo',
      body: "Happy to set up your demo. When works?",
      buttons: ['Today', 'This week', 'Pick a date'],
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
  // "tell me about CPL, the costs and timeline and how to start please"
  // deserves a real LLM answer, not a button menu.
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
 *   [BTN: Timeline][BTN: What's involved][BTN: How to start]
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
