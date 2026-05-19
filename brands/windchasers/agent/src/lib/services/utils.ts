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
  text = text.replace(/\s+/g, ' ').trim();
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
// capture modal didn't validate input — usually UI labels, page headers, or
// stray tokens that the user typed by accident. When the lead row is created
// the agent then greets them by that "name" ("Interior! Happy to help…") which
// is embarrassing. Both the capture endpoint and the prompt-builder use
// isLikelyRealPersonName to decide whether to trust customer_name.
const JUNK_NAME_DENYLIST = new Set([
  // Brand / project names
  'bcon', 'windchasers', 'wind chasers', 'proxe', 'nidaan', 'alpha', 'arc',
  // Common page/section labels people accidentally typed instead of name
  'interior', 'exterior', 'home', 'about', 'contact', 'pilot training',
  'cpl', 'ppl', 'atpl', 'dgca', 'helicopter', 'drone', 'cabin crew',
  // Form/button labels
  'name', 'full name', 'phone', 'phone number', 'email', 'message',
  'submit', 'click', 'click here', 'loading', 'open whatsapp', 'whatsapp',
  'send', 'next', 'continue', 'start', 'start a chat',
  // Test / junk / placeholder values
  'test', 'testing', 'demo', 'asdf', 'qwerty', 'na', 'n/a', 'none', 'null',
  'undefined', 'unknown', 'lead', 'visitor', 'user', 'customer',
]);

// WhatsApp profile names are often a business / shop name rather than a real
// person — usually a single all-caps word ("INTERIOR", "SHOP", "OFFICE") or a
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
 * that pass the basic shape check are trusted — we'd rather accept an unusual
 * real name than reject it.
 */
export function isLikelyRealPersonName(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 60) return false;

  // Real names don't contain digits.
  if (/\d/.test(trimmed)) return false;

  // Must contain at least one letter.
  if (!/[a-zA-ZÀ-ɏ]/.test(trimmed)) return false;

  // Strip emoji and re-check — a string that is mostly emoji shouldn't count
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
