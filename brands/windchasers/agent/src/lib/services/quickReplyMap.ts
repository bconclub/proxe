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
  // ── DGCA ground-classes fee (MUST come before the generic cost trigger so a
  //     "fees structure for DGCA" question gives the COURSE fee, not ₹80 lakh) ─
  {
    match: /\b(dgca|ground class(?:es)?|theory|subjects?)\b.*\b(cost|fees?|price|pricing|how much|charges?|structure)\b|\b(cost|fees?|price|pricing|how much|charges?|structure)\b.*\b(dgca|ground class(?:es)?|theory)\b/i,
    config: {
      triggerKey: 'ground_classes_cost',
      body: 'DGCA Ground Classes fee:\n\n*4 subjects* — ₹2.35 lakh + ₹20,000 registration (3–4 months)\n*6 subjects* — ₹2.75 lakh + ₹20,000 registration (4–5 months)\n\nBoth offline & online. What would help?',
      buttons: ['4 vs 6 subjects', 'Talk to counsellor', 'Full journey cost'],
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
  // NO static booking quick-reply. Booking intent ("book a call", "demo",
  // "schedule") must flow into the LLM booking flow instead — it is time-aware
  // (won't offer "Today" after the window closes), resolves dates correctly,
  // offers the real slot buttons, AND wires the check_availability /
  // book_consultation tools so the call actually gets booked. A hardcoded
  // "Today / This week / Pick a date" menu here bypassed all of that and kept
  // offering "Today" at 9 PM.
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

/** Matches a booking time-slot label like "3:00 PM" / "11:30 AM". */
const TIME_SLOT_LABEL = /^\d{1,2}:\d{2}\s*(AM|PM)$/i;
const normTime = (s: string) => s.toUpperCase().replace(/\s+/g, '');

/**
 * Deterministic guard against offering an already-booked slot.
 *
 * The LLM is told to offer ONLY the open times check_availability returns, but
 * it sometimes parrots the prompt's example menu (3:00/4:00/5:00) and offers a
 * slot that is actually taken. The customer then taps it and gets a "that's
 * booked" bounce — a bad experience. Given the open times from the tool, this
 * strips any time-slot [BTN: …] for a slot that is NOT open, and (only when it
 * actually removed one) scrubs that time from the prose enumeration too.
 *
 * Non-time buttons (How to start, Timeline, …) are always preserved. When
 * `openTimes` is null (check_availability was not called this turn) the text is
 * returned untouched — we never invent availability.
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
