/**
 * services/utils.ts — Shared utility functions for all service modules
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
