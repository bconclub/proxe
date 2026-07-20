/**
 * services/utils.ts - Shared utility functions for all service modules
 *
 * Extracted from: web-agent/src/lib/chatSessions.ts
 * Used by: all services
 */

/**
 * Get current date/time in UTC+5:30 (IST) format
 * Used for all timestamps in the system
 */
export function getISTTimestamp(): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const year = parts.find(p => p.type === 'year')?.value || '2024';
    const month = parts.find(p => p.type === 'month')?.value || '01';
    const day = parts.find(p => p.type === 'day')?.value || '01';
    const hours = parts.find(p => p.type === 'hour')?.value || '00';
    const minutes = parts.find(p => p.type === 'minute')?.value || '00';
    const seconds = parts.find(p => p.type === 'second')?.value || '00';
    const milliseconds = String(now.getMilliseconds()).padStart(3, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}+05:30`;
  } catch (error) {
    console.error('[getISTTimestamp] Error converting to IST, using UTC:', error);
    return new Date().toISOString();
  }
}

/**
 * Clean metadata strings from conversation summary
 * Removes [User's name is...] and [Booking Status:...] tags
 */
export function cleanSummary(summary: string | null | undefined): string {
  if (!summary) return '';
  return summary
    .replace(/\[User's name is[^\]]+\]/gi, '')
    .replace(/\[Booking Status:[^\]]+\]/gi, '')
    .replace(/\n\n+/g, '\n')
    .trim();
}

/**
 * Strip HTML tags and decode entities from content
 * Used before logging messages to conversations table
 */
export function stripHTML(html: string): string {
  if (!html || typeof html !== 'string') return html;
  let text = html.replace(/<[^>]*>/g, '');
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
  // Preserve newlines so multi-line WhatsApp messages (lead-in + bullets +
  // paragraph breaks) render in the inbox EXACTLY as the customer received them.
  // Previously `\s+ → ' '` collapsed every newline into a space, flattening
  // formatted replies into one wall of text. Collapse only horizontal whitespace,
  // tidy spaces around newlines, and cap blank-line runs at one.
  text = text
    .replace(/[ \t\f\v]+/g, ' ')   // runs of spaces/tabs → single space
    .replace(/ *\n */g, '\n')       // strip spaces hugging a newline
    .replace(/\n{3,}/g, '\n\n')     // at most one blank line between paragraphs
    .trim();
  return text;
}

/**
 * Format time from 24-hour to 12-hour display format
 * "14:00" -> "2:00 PM"
 */
export function formatTimeForDisplay(time24: string): string {
  const [hour, minute] = time24.split(':').map(Number);
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${hour12}:${minute.toString().padStart(2, '0')} ${period}`;
}

/**
 * Format date string for human-readable display
 * "2024-03-15" -> "Friday, March 15, 2024"
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ── Name validation ─────────────────────────────────────────────────────────
// Words that have shown up in customer_name in the wild because the lead-
// capture modal didn't validate input - usually UI labels, page headers, or
// stray tokens that the user typed by accident. When the lead row is created
// the agent then greets them by that "name" ("Interior! Happy to help…") which
// is embarrassing. Both the capture endpoint and the prompt-builder use
// isLikelyRealPersonName to decide whether to trust customer_name.
const JUNK_NAME_DENYLIST = new Set([
  // Brand / project names
  'bcon', 'windchasers', 'wind chasers', 'proxe', 'nidaan', 'alpha', 'arc',
  // Common page/section labels people accidentally typed instead of name
  'interior', 'exterior', 'home', 'about', 'contact', 'pilot training',
  'cpl', 'ppl', 'atpl', 'dgca', 'helicopter', 'cabin crew',
  // Form/button labels
  'name', 'full name', 'phone', 'phone number', 'email', 'message',
  'submit', 'click', 'click here', 'loading', 'open whatsapp', 'whatsapp',
  'send', 'next', 'continue', 'start', 'start a chat',
  // Test / junk / placeholder values
  'test', 'testing', 'demo', 'asdf', 'qwerty', 'na', 'n/a', 'none', 'null',
  'undefined', 'unknown', 'lead', 'visitor', 'user', 'customer',
]);

// WhatsApp profile names are often a business / shop name rather than a real
// person - usually a single all-caps word ("INTERIOR", "SHOP", "OFFICE") or a
// multi-word string with a business suffix ("Sharma Enterprises", "Joshi
// Traders Pvt Ltd"). When the WhatsApp webhook stores those as customer_name,
// the agent later greets the lead as "Interior!" which looks broken. The
// helpers below recognise those patterns without rejecting legitimate
// uncommon names.
const BUSINESS_SUFFIX_TOKENS = new Set([
  'enterprises', 'enterprise', 'traders', 'trader', 'trading',
  'mart', 'store', 'stores', 'shop', 'shops', 'office', 'offices',
  'services', 'service', 'consultants', 'consultant', 'consulting',
  'studios', 'studio', 'agency', 'agencies', 'group', 'company',
  'pvt', 'ltd', 'limited', 'llc', 'inc', 'corp', 'corporation',
  'co', 'co.', 'and', '&',
  'solutions', 'systems', 'industries', 'industry',
]);

const EMOJI_REGEX =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u;

/**
 * Decide whether a string is plausibly a real person's first/full name.
 * Returns false for: empty / brand names / single UI-label words / digits-only
 * values / things that are clearly not a person ("Interior", "Pilot Training",
 * "Submit", etc.), ALL-CAPS single words, multi-word values with business
 * suffixes ("Sharma Enterprises"), or emoji-heavy strings. Multi-word values
 * that pass the basic shape check are trusted - we'd rather accept an unusual
 * real name than reject it.
 */
/**
 * Best-effort cleanup of "fancy" Unicode-spoofed display names sourced from
 * social profiles (Instagram, WhatsApp). Strips combining marks, maps
 * common letterlike substitutions to ASCII, removes decorative bullets,
 * collapses whitespace, and title-cases the result.
 *
 * Examples:
 *   "M•#Đ MÀŦĒËÑ ÀÁMÎŘĨ"  → "M D Mateen Aamiri"
 *   "Ƒ𝒂𝒏𝒄𝒚 𝓝𝓪𝓶𝒆"        → "Fancy Name"
 *   "  john   doe   "    → "John Doe"
 *
 * Never destructive - surfaces the result for the operator to confirm in an
 * editable field, doesn't auto-save.
 */
export function cleanDisplayName(raw: string): string {
  if (!raw || typeof raw !== 'string') return ''
  // 1. NFKD normalises stylised letters (mathematical bold, italic, fraktur,
  //    superscript ligatures, etc.) into their base ASCII + combining marks.
  let s = raw.normalize('NFKD')
  // 2. Strip combining diacritical marks (À → A, Ñ → N, Ī → I, …).
  s = s.replace(/[̀-ͯ]/g, '')
  // 3. Map letterlike chars that NFKD doesn't decompose to ASCII manually.
  const replacements: Record<string, string> = {
    'Đ': 'D', 'đ': 'd', 'Ð': 'D',
    'Ŧ': 'T', 'ŧ': 't',
    'Ø': 'O', 'ø': 'o',
    'Æ': 'AE', 'æ': 'ae',
    'Œ': 'OE', 'œ': 'oe',
    'Ł': 'L', 'ł': 'l',
    'Þ': 'Th', 'þ': 'th',
    'ß': 'ss',
  }
  s = s.replace(/[ĐđÐŦŧØøÆæŒœŁłÞþß]/g, (ch) => replacements[ch] ?? ch)
  // 4. Strip decorative bullets, hashes, asterisks, common emoji.
  s = s.replace(/[•·●◦▪▫▶▷►▻♦♥★☆#*~_=+|\\\/]/g, ' ')
  // 5. Drop anything still non-ASCII (emoji, Devanagari noise, etc.).
  s = s.replace(/[^\x20-\x7E]/g, ' ')
  // 6. Collapse whitespace + trim.
  s = s.replace(/\s+/g, ' ').trim()
  // 7. Title-case each token. Preserve apostrophe/hyphen segments.
  s = s.split(' ').map((token) => {
    if (!token) return token
    return token
      .split(/(['-])/)
      .map((seg, i) =>
        i % 2 === 1
          ? seg // separator
          : seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase(),
      )
      .join('')
  }).join(' ')
  return s
}

export function isLikelyRealPersonName(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 60) return false;

  // Real names don't contain digits.
  if (/\d/.test(trimmed)) return false;

  // Must contain at least one letter.
  if (!/[a-zA-ZÀ-ɏ]/.test(trimmed)) return false;

  // Strip emoji and re-check - a string that is mostly emoji shouldn't count
  // as a name even if it has a stray letter.
  const noEmoji = trimmed.replace(EMOJI_REGEX, '').trim();
  if (noEmoji.length < 2) return false;

  // Denylist match (case-insensitive, whitespace-normalized).
  const normalized = trimmed.toLowerCase().replace(/\s+/g, ' ');
  if (JUNK_NAME_DENYLIST.has(normalized)) return false;

  // ALL-CAPS single word (>2 letters) → almost always a shop/category label
  // typed into a profile field (INTERIOR, OFFICE, SHOP).
  const tokens = trimmed.split(/\s+/);
  if (tokens.length === 1 && /^[A-Z]{3,}$/.test(trimmed)) return false;

  // Business-suffix heuristic: if any token (lowercased, stripped of
  // punctuation) matches a known business word, treat the whole value as a
  // business name, not a person.
  for (const tok of tokens) {
    const clean = tok.toLowerCase().replace(/[^a-z&.]/g, '');
    if (BUSINESS_SUFFIX_TOKENS.has(clean)) return false;
  }

  return true;
}
