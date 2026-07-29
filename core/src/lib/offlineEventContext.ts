/**
 * Per-event offline-event context on a lead.
 *
 * BACKGROUND. The original single-event design stored registration as FLAT
 * fields on unified_context.windchasers:
 *   offline_event_name / _date / _location / _coming_with / _registered_at
 *   offline_event_register_reminder_sent / _directions_reminder_sent
 * With two concurrent events that breaks twice over: a shallow merge on the
 * second registration overwrites the first event's record, and the reminder
 * markers are per-LEAD, so anyone touched for event A can never be messaged
 * for event B.
 *
 * SHAPE NOW. An append-only map keyed by the registry slug:
 *   offline_event_key: 'wings-of-freedom'      // the MOST RECENT event
 *   offline_events: {
 *     'demo-class':       { name, date, location, coming_with, intent,
 *                           registered_at, register_reminder_sent,
 *                           directions_reminder_sent, interest_source },
 *     'wings-of-freedom': { ... },
 *   }
 *
 * The flat fields REMAIN, mirroring whichever event is most recent, so every
 * existing reader (the dashboard's Event cell + RSVP chip, CSV export,
 * LeadDetailsModal) keeps working with no edits.
 *
 * NO BACKFILL. readOfflineEvents() synthesizes an entry from the flat fields
 * when the map is absent, seeding the reminder markers from the flat ones - so
 * the ~28 live Demo Class leads read as already-reminded and are skipped by the
 * cron, without writing to a single row. A backfill is optional cleanup, never
 * a prerequisite.
 */
import {
  LEGACY_DEFAULT_EVENT_KEY,
  matchOfflineEventByName,
  slugifyEventKey,
} from '@/configs/offline-events'

export interface OfflineEventEntry {
  name?: string
  date?: string
  location?: string
  coming_with?: string
  /** 'register' (booked a seat) | 'scholarship' (also applying). */
  intent?: string
  interest_source?: string
  /** Set only when they completed the landing-page form - NOT on ad interest. */
  registered_at?: string
  register_reminder_sent?: string
  directions_reminder_sent?: string
  [key: string]: unknown
}

export type OfflineEventMap = Record<string, OfflineEventEntry>

type BrandCtx = Record<string, any>

/**
 * Which event does this lead's context refer to?
 * Explicit key wins, then the registry (name or alias), then a slug of the raw
 * name, and finally the legacy default so pre-key leads resolve to Demo Class.
 */
export function resolveOfflineEventKey(wc: BrandCtx | null | undefined): string {
  const ctx = wc || {}
  const explicit = String(ctx.offline_event_key || '').trim()
  if (explicit) return explicit

  const name = String(ctx.offline_event_name || '').trim()
  if (name) {
    const matched = matchOfflineEventByName(name)
    if (matched) return matched.key
    const slug = slugifyEventKey(name)
    if (slug) return slug
  }
  return LEGACY_DEFAULT_EVENT_KEY
}

/**
 * Read every event this lead has touched.
 *
 * When offline_events is absent, synthesize ONE entry from the flat fields.
 * Seeding register_reminder_sent / directions_reminder_sent from the flat
 * markers is the load-bearing part: it is what stops a legacy lead being
 * re-messaged about an event they were already contacted for.
 */
export function readOfflineEvents(wc: BrandCtx | null | undefined): OfflineEventMap {
  const ctx = wc || {}
  const stored = ctx.offline_events
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    return stored as OfflineEventMap
  }

  const hasLegacyData =
    ctx.offline_event_name ||
    ctx.offline_event_date ||
    ctx.offline_event_registered_at ||
    ctx.offline_event_register_reminder_sent ||
    ctx.offline_event_directions_reminder_sent
  if (!hasLegacyData) return {}

  const key = resolveOfflineEventKey(ctx)
  const entry: OfflineEventEntry = {}
  if (ctx.offline_event_name) entry.name = String(ctx.offline_event_name)
  if (ctx.offline_event_date) entry.date = String(ctx.offline_event_date)
  if (ctx.offline_event_location) entry.location = String(ctx.offline_event_location)
  if (ctx.offline_event_coming_with) entry.coming_with = String(ctx.offline_event_coming_with)
  if (ctx.offline_event_intent) entry.intent = String(ctx.offline_event_intent)
  if (ctx.offline_event_interest_source) entry.interest_source = String(ctx.offline_event_interest_source)
  if (ctx.offline_event_registered_at) entry.registered_at = String(ctx.offline_event_registered_at)
  if (ctx.offline_event_register_reminder_sent) {
    entry.register_reminder_sent = String(ctx.offline_event_register_reminder_sent)
  }
  if (ctx.offline_event_directions_reminder_sent) {
    entry.directions_reminder_sent = String(ctx.offline_event_directions_reminder_sent)
  }
  return { [key]: entry }
}

/** One event's entry, with legacy synthesis applied. */
export function readOfflineEventEntry(
  wc: BrandCtx | null | undefined,
  key: string,
): OfflineEventEntry {
  return readOfflineEvents(wc)[key] || {}
}

/**
 * Merge a patch for ONE event into a lead's context.
 *
 * Returns the fields to write onto unified_context[brand]: the updated
 * offline_events map, plus a refreshed flat mirror so legacy readers stay
 * correct. Pass mirrorFlat: false to update a marker without repointing the
 * flat mirror at that event (the cron does this - a reminder for an older
 * event must not overwrite the flat fields of a newer registration).
 */
export function writeOfflineEvent(
  wc: BrandCtx | null | undefined,
  key: string,
  patch: OfflineEventEntry,
  opts: { mirrorFlat?: boolean } = {},
): Record<string, any> {
  const { mirrorFlat = true } = opts
  const existing = readOfflineEvents(wc)
  const merged: OfflineEventMap = {
    ...existing,
    [key]: { ...(existing[key] || {}), ...patch },
  }

  const out: Record<string, any> = { offline_events: merged }
  if (!mirrorFlat) return out

  const entry = merged[key]
  out.offline_event_key = key
  if (entry.name) out.offline_event_name = entry.name
  if (entry.date) out.offline_event_date = entry.date
  if (entry.location) out.offline_event_location = entry.location
  if (entry.coming_with) out.offline_event_coming_with = entry.coming_with
  if (entry.intent) out.offline_event_intent = entry.intent
  if (entry.interest_source) out.offline_event_interest_source = entry.interest_source
  if (entry.registered_at) out.offline_event_registered_at = entry.registered_at
  return out
}

/**
 * Deep-merge the offline_events maps of an existing and an incoming context.
 *
 * MUST be called at every site that shallow-spreads the brand context
 * (leads/inbound and facebook-lead both do). Without it the incoming map
 * REPLACES the stored one and the lead's earlier event registrations are
 * silently destroyed.
 */
export function mergeOfflineEventMaps(
  existingWc: BrandCtx | null | undefined,
  incomingWc: BrandCtx | null | undefined,
): OfflineEventMap | null {
  const existing = readOfflineEvents(existingWc)
  const incoming = readOfflineEvents(incomingWc)
  const keys = new Set([...Object.keys(existing), ...Object.keys(incoming)])
  if (keys.size === 0) return null

  const merged: OfflineEventMap = {}
  for (const key of keys) {
    merged[key] = { ...(existing[key] || {}), ...(incoming[key] || {}) }
  }
  return merged
}
