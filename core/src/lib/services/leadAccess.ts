/**
 * Per-user lead-type access control (features.leadAccess — windchasers).
 *
 * A dashboard user can be restricted to a set of lead types (canonical course
 * names from configs/courses.ts) via dashboard_users.allowed_lead_types.
 * NULL = unrestricted. Admins are always unrestricted. When the brand flag is
 * off this whole module is a no-op — every check returns "visible".
 *
 * Filtering is JS post-fetch (same pattern as the NULL-safe newsletter filter
 * in the leads route): course_interest values in unified_context are raw/messy
 * and only normalizeCourse canonicalizes them, so a PostgREST equality filter
 * can't express the match.
 */
import { BRAND_ID, getBrandConfig } from '@/configs'
import { COURSE_OPTIONS, normalizeCourse } from '@/configs/courses'

// Leads with no course_interest yet (fresh, uncaptured) stay visible to
// restricted users so new leads never silently vanish from every pipeline.
// Flip to false to hide untyped leads from restricted users.
const UNTYPED_LEADS_VISIBLE = true

export interface LeadAccess {
  /** true only when the brand flag is on AND this user is actually restricted */
  restricted: boolean
  isAdmin: boolean
  /** canonical course names the user may see; null = all */
  allowedTypes: string[] | null
  userId: string
}

const UNRESTRICTED = (userId: string, isAdmin = false): LeadAccess => ({
  restricted: false,
  isAdmin,
  allowedTypes: null,
  userId,
})

export async function getLeadAccess(supabase: any, userId: string): Promise<LeadAccess> {
  if (!getBrandConfig().features?.leadAccess) return UNRESTRICTED(userId)
  try {
    let { data: me, error: meErr } = await supabase
      .from('dashboard_users')
      .select('role, allowed_lead_types')
      .eq('id', userId)
      .maybeSingle()
    if (meErr) {
      // Migration 036 not run yet (column missing) — keep admin detection
      // alive with a role-only read; access stays unrestricted.
      ;({ data: me } = await supabase
        .from('dashboard_users')
        .select('role')
        .eq('id', userId)
        .maybeSingle())
    }
    const isAdmin = me?.role === 'admin'
    const types: string[] | null = Array.isArray(me?.allowed_lead_types) && me.allowed_lead_types.length > 0
      ? me.allowed_lead_types.map((t: string) => normalizeCourse(t)).filter(Boolean)
      : null
    if (isAdmin || !types) return UNRESTRICTED(userId, isAdmin)
    return { restricted: true, isAdmin, allowedTypes: types, userId }
  } catch (e: any) {
    // Never lock a user out because the access lookup failed — fail open.
    console.warn('[leadAccess] getLeadAccess failed (fail-open):', e?.message || e)
    return UNRESTRICTED(userId)
  }
}

/** Canonical lead type of a lead row, '' when untyped. */
export function leadTypeOf(lead: any): string {
  const raw = lead?.unified_context?.[BRAND_ID]?.course_interest
  return normalizeCourse(raw)
}

export function canSeeLead(access: LeadAccess, lead: any): boolean {
  if (!access.restricted || !access.allowedTypes) return true
  const type = leadTypeOf(lead)
  if (!type) return UNTYPED_LEADS_VISIBLE
  return access.allowedTypes.includes(type)
}

export function filterLeads<T = any>(access: LeadAccess, leads: T[]): T[] {
  if (!access.restricted) return leads
  return (leads || []).filter((lead) => canSeeLead(access, lead))
}

/**
 * Normalize an allowed-lead-types payload to canonical COURSE_OPTIONS values.
 * Returns null for "all types" (empty/absent selection). undefined = invalid
 * payload shape (caller should 400).
 */
export function sanitizeAllowedLeadTypes(raw: any): string[] | null | undefined {
  if (raw === null || raw === undefined) return null
  if (!Array.isArray(raw)) return undefined
  const canonical = raw
    .map((t: any) => normalizeCourse(String(t)))
    .filter((t: string) => (COURSE_OPTIONS as readonly string[]).includes(t))
  return canonical.length > 0 ? Array.from(new Set(canonical)) : null
}

/**
 * Write-site guard: may this user act on this lead? Fetches the lead's
 * unified_context only when the user is actually restricted. A missing lead
 * returns true — the route's own 404 handles that case.
 */
export async function canAccessLeadId(supabase: any, userId: string, leadId: string): Promise<boolean> {
  const access = await getLeadAccess(supabase, userId)
  if (!access.restricted) return true
  try {
    const { data } = await supabase
      .from('all_leads')
      .select('unified_context')
      .eq('id', leadId)
      .maybeSingle()
    if (!data) return true
    return canSeeLead(access, data)
  } catch (e: any) {
    console.warn('[leadAccess] canAccessLeadId failed (fail-open):', e?.message || e)
    return true
  }
}
