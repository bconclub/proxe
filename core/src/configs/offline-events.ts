/**
 * Offline-event registry (windchasers).
 *
 * An "offline event" is a MARKETING segment: many leads registering for the
 * SAME in-person session (demo class, open house, Independence Day day-out).
 * Distinct from a lead's own "Key Event" (their individual scheduled call or
 * campus visit on all_leads.booking_date), and distinct from the 1-on-1
 * "book a demo" flow.
 *
 * Everything that used to be hardcoded to the one Demo Class event - session
 * dates, venue, landing URL, Meta-ad detection, the default course - lives
 * here instead, keyed by a stable slug. The key is written onto the lead as
 * unified_context.windchasers.offline_event_key, which is what lets the cron,
 * the dashboard and the ad-intake routes tell two concurrent events apart.
 *
 * Adding an event = one entry here. No other file should learn its name.
 *
 * COUNTERPART: the marketing site keeps its own presentation copy in
 * C:\Users\user\Builds\Windchasers\lib\wings-of-freedom.ts (and
 * lib/offline-events.ts). Separate repo, separate deploy - no shared import is
 * possible. The contract between them is `key` + `slugPath`; everything else
 * there is presentation. The site submits offline_event_key and THIS registry
 * wins on date/venue/landing URL, so drift in the site's display strings can
 * never corrupt cron window math.
 */
import { BRAND_ID } from '@/configs'

export interface OfflineEventSession {
  id: string
  /** Full ISO with +05:30 - the authoritative start instant. */
  startIso: string
  /** Human label as it appears in ads/forms, e.g. "27 July". */
  label: string
}

export interface OfflineEventConfig {
  /** Stable slug - written to unified_context.windchasers.offline_event_key. */
  key: string
  /** Display name, also the {{event_name}} WhatsApp template param. */
  name: string
  /** Legacy/free-text names that should resolve to this key (lowercased). */
  aliases: string[]
  /** Landing-page path, no leading slash - becomes {{1}} in the Meta button URL. */
  slugPath: string
  landingUrl: string
  venue: { address: string; mapsUrl: string }
  sessions: OfflineEventSession[]
  /** Display time, e.g. "11:00 AM IST" - used as a template/email fallback. */
  timeDisplay: string
  /** Meta ad/campaign/form name patterns that identify this event. */
  matchPatterns: RegExp[]
  /** course_interest to stamp when the ad form doesn't carry one. '' = leave blank. */
  defaultCourseInterest: string
  /**
   * Invite link replied when a registrant taps the "Join WhatsApp Group"
   * quick-reply. Per-event: the handler used to send the webinar group to
   * anyone who tapped it, which would put this event's leads in the wrong
   * room. Omit and the tap falls back to the webinar group.
   */
  whatsappGroupUrl?: string
  /**
   * Set when the event carries a scholarship whose application starts on the
   * landing page. Registrants who tick that box get the application-process
   * message instead of the plain "you're confirmed" one - applying opens a
   * process (aptitude test, documents, interview, counselling), it doesn't
   * award anything, and the confirmation must not imply otherwise.
   */
  scholarshipName?: string
  /** false = past/paused. Blocks intake tagging AND all reminder sends. */
  enabled: boolean
}

const KOTHANUR_VENUE = {
  address: 'WindChasers Aviation Academy, Kothanur, Bengaluru, Karnataka 560077',
  mapsUrl: 'https://maps.google.com/maps?q=WindChasers+Aviation+Academy+Kothanur+Bengaluru',
}

const WINDCHASERS_EVENTS: OfflineEventConfig[] = [
  {
    key: 'demo-class',
    name: 'WindChasers Demo Class',
    aliases: ['windchasers demo class', 'demo class', 'dgca demo class'],
    slugPath: 'dgca-demo-class',
    landingUrl: 'https://windchasers.in/dgca-demo-class',
    venue: KOTHANUR_VENUE,
    sessions: [
      { id: '27jul', startIso: '2026-07-27T11:00:00+05:30', label: '27 July' },
      { id: '28jul', startIso: '2026-07-28T11:00:00+05:30', label: '28 July' },
    ],
    timeDisplay: '11:00 AM IST',
    matchPatterns: [/\bdemo[\s_-]?(class|session)\b/],
    defaultCourseInterest: 'Pilot',
    // PAST (ran 27-28 Jul 2026). Kept so historical leads still resolve to a
    // real event - the cron's per-event cutoff then skips them automatically.
    enabled: false,
  },
  {
    key: 'wings-of-freedom',
    name: 'Wings of Freedom',
    aliases: ['wings of freedom', 'wof'],
    slugPath: 'wings-of-freedom',
    landingUrl: 'https://windchasers.in/wings-of-freedom',
    venue: KOTHANUR_VENUE,
    sessions: [
      { id: '15aug', startIso: '2026-08-15T11:00:00+05:30', label: '15 August' },
    ],
    timeDisplay: '11:00 AM IST',
    // `_` is a \w character, so \bwof\b does NOT match "WOF_lead_form" - the
    // exact shape Pabbly sends. Guard on non-alphanumerics instead so the
    // 3-letter shorthand still can't match inside "woof"/"wolf".
    matchPatterns: [
      /wings[\s_-]?of[\s_-]?freedom/,
      /(^|[^a-z0-9])wof([^a-z0-9]|$)/,
    ],
    // Women-only day with BOTH a pilot and a cabin-crew track - guessing either
    // would mislabel half the room, so leave COURSE blank until they tell us.
    defaultCourseInterest: '',
    // Tracking params from the shared invite stripped - only the invite code
    // matters, and the rest would follow every lead into the group.
    whatsappGroupUrl: 'https://chat.whatsapp.com/BiPGKSg03CzETSljBUO9sa',
    scholarshipName: 'Freedom to Fly',
    enabled: true,
  },
]

/** Registry for the active brand. Non-windchasers brands have no offline events. */
export const OFFLINE_EVENTS: OfflineEventConfig[] =
  BRAND_ID === 'windchasers' ? WINDCHASERS_EVENTS : []

/** Key used for legacy leads that predate offline_event_key. */
export const LEGACY_DEFAULT_EVENT_KEY = 'demo-class'

export function getOfflineEvent(key: string | null | undefined): OfflineEventConfig | null {
  if (!key) return null
  return OFFLINE_EVENTS.find((e) => e.key === key) || null
}

/** Slugify a free-text event name into a key-shaped string. */
export function slugifyEventKey(raw: string | null | undefined): string {
  return String(raw ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Resolve a free-text event name to a registry entry via name or alias. */
export function matchOfflineEventByName(name: string | null | undefined): OfflineEventConfig | null {
  const s = String(name ?? '').toLowerCase().trim()
  if (!s) return null
  return (
    OFFLINE_EVENTS.find((e) => e.name.toLowerCase() === s || e.aliases.includes(s)) ||
    OFFLINE_EVENTS.find((e) => e.key === slugifyEventKey(s)) ||
    null
  )
}

/**
 * Identify the event behind a Meta lead-ad submission from its campaign / ad /
 * adset / form / UTM names. Returns the ENTRY (not a boolean) so the caller can
 * read its name, venue and landing URL instead of hardcoding them.
 */
export function matchOfflineEvent(
  ...signals: Array<string | null | undefined>
): OfflineEventConfig | null {
  const hay = signals.filter(Boolean).join(' ').toLowerCase()
  if (!hay) return null
  const matches = OFFLINE_EVENTS.filter((e) => e.matchPatterns.some((re) => re.test(hay)))
  if (!matches.length) return null
  // An ENABLED match always wins over a disabled one, regardless of list order.
  //
  // The signals are joined into ONE haystack, so reusing a past event's assets
  // makes two events match at once: a Wings of Freedom campaign running on the
  // old "Demo Class" instant form matches both, and plain list order handed it
  // to demo-class - which is disabled, so the caller treated the lead as NOT an
  // offline-event lead at all. Silent, total loss of the funnel: no event tag,
  // no nudge, no group. Reused forms are normal practice, so the matcher has to
  // survive them.
  return matches.find((e) => e.enabled) || matches[0]
}

/** Newest event first (by latest session). Drives the dashboard's group order. */
export function listOfflineEvents(): OfflineEventConfig[] {
  return [...OFFLINE_EVENTS].sort((a, b) => eventLastSessionMs(b) - eventLastSessionMs(a))
}

/** Epoch ms of the event's LAST session - the "is it over" reference. */
export function eventLastSessionMs(event: OfflineEventConfig): number {
  return event.sessions.reduce((max, s) => Math.max(max, new Date(s.startIso).getTime()), 0)
}

/** Epoch ms of the event's FIRST session. */
export function eventFirstSessionMs(event: OfflineEventConfig): number {
  return event.sessions.reduce(
    (min, s) => Math.min(min, new Date(s.startIso).getTime()),
    Number.POSITIVE_INFINITY,
  )
}

/**
 * Resolve which session a lead's stored date string refers to, as epoch ms.
 *
 * A stored date can be any of: the landing page's full label ("15 August 2026
 * at 11:00 AM IST"), a Meta ad form's bare day preference ("15 August"), or a
 * session id. The final fallback is what matters most: a SINGLE-session event
 * can never fail to resolve, which is what stopped "15 August" (no year, no
 * time - unparseable by Date) from silently skipping every reminder.
 */
export function resolveSessionStartMs(
  event: OfflineEventConfig,
  rawDate: string | null | undefined,
): number {
  const cleaned = String(rawDate ?? '').toLowerCase().trim()

  if (cleaned) {
    const bySession = event.sessions.find(
      (s) =>
        cleaned.startsWith(s.label.toLowerCase()) ||
        cleaned === s.id.toLowerCase() ||
        cleaned.startsWith(s.startIso.slice(0, 10)),
    )
    if (bySession) return new Date(bySession.startIso).getTime()

    const direct = new Date(rawDate as string).getTime()
    if (!isNaN(direct)) return direct

    const m = cleaned.match(
      /(\d{1,2})\s+([a-z]+)\s+(\d{4}).*?(\d{1,2}):(\d{2})\s*([ap]m)/i,
    )
    if (m) {
      const months: Record<string, number> = {
        january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
        july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
      }
      const mo = months[m[2]]
      if (mo !== undefined) {
        let hh = parseInt(m[4], 10) % 12
        if (/pm/i.test(m[6])) hh += 12
        return Date.UTC(parseInt(m[3], 10), mo, parseInt(m[1], 10), hh, parseInt(m[5], 10))
          - 5.5 * 3_600_000
      }
    }
  }

  // Unparseable (or absent) - a single-session event has only one answer.
  if (event.sessions.length === 1) return new Date(event.sessions[0].startIso).getTime()
  return NaN
}

/**
 * Whether reminder sends may go out for this event. Three gates:
 *   1. WINDCHASERS_OFFLINE_EVENT_SENDS_ENABLED - the existing global master
 *      switch (unchanged, so the current production setting carries over).
 *   2. the registry entry's own `enabled` flag (code-level, per event).
 *   3. WINDCHASERS_OFFLINE_EVENT_DISABLED_KEYS - csv emergency kill for one
 *      event without a redeploy.
 */
export function offlineEventSendsEnabled(key: string | null | undefined): boolean {
  if (process.env.WINDCHASERS_OFFLINE_EVENT_SENDS_ENABLED !== 'true') return false
  const event = getOfflineEvent(key)
  if (!event?.enabled) return false
  const disabled = String(process.env.WINDCHASERS_OFFLINE_EVENT_DISABLED_KEYS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return !disabled.includes(event.key)
}
