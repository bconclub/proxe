/**
 * Brand-aware lead-type taxonomy for the leadAccess feature.
 *
 * The access engine (leadAccess.ts) and the Humans / user-management UI need to
 * know, per brand: the canonical set of lead types, how to normalize a raw
 * value to it, and which unified_context field the brand stores its segment in.
 *
 * Windchasers/BCON segment by COURSE (course_interest). Lokazen segments by
 * AUDIENCE — owner / brand / scout — stored in unified_context[BRAND_ID].user_type.
 * For every non-Lokazen brand this module returns the exact course values +
 * normalizer, so behaviour there is unchanged.
 */
import { BRAND_ID } from '@/configs'
import { COURSE_OPTIONS, normalizeCourse } from './courses'

const IS_LOKAZEN = BRAND_ID === 'lokazen'

// Lokazen audiences. Title-cased canonical labels (mirrors COURSE_OPTIONS style).
const LOKAZEN_TYPES = ['Owner', 'Brand', 'Scout'] as const

function normalizeLokazenType(raw: string | null | undefined): string {
  const s = String(raw ?? '').toLowerCase().trim()
  if (!s) return ''
  if (/owner|property|landlord/.test(s)) return 'Owner'
  if (/scout|gig/.test(s)) return 'Scout'
  if (/brand|seeker|space|business|tenant/.test(s)) return 'Brand'
  return '' // unknown → untyped (stays visible to restricted users)
}

/** Canonical lead-type options for the active brand (the access chips render these). */
export function getLeadTypeOptions(): readonly string[] {
  return IS_LOKAZEN ? LOKAZEN_TYPES : COURSE_OPTIONS
}

/** Normalize a raw lead-type value to the active brand's canonical set. */
export function normalizeLeadType(raw: string | null | undefined): string {
  return IS_LOKAZEN ? normalizeLokazenType(raw) : normalizeCourse(raw)
}

/** unified_context[BRAND_ID].<field> that holds this brand's lead segment. */
export function leadTypeField(): 'course_interest' | 'user_type' {
  return IS_LOKAZEN ? 'user_type' : 'course_interest'
}
