import { cookies } from 'next/headers'

/**
 * "View as" - an admin looking at the dashboard through another user's eyes.
 *
 * Restricted users (features.leadAccess) see a genuinely different dashboard:
 * fewer leads, a smaller pipeline, different tiles. The only way to know what
 * Richard actually sees is to look as Richard, so this resolves the ACTING
 * user for read paths while keeping the REAL user for everything else.
 *
 * Three rules, all load-bearing:
 *
 *  1. Only role='admin' may do it. A viewer sending the cookie by hand gets
 *     their own id back - the check is server-side, never trusted from the
 *     client.
 *  2. READ ONLY. `isViewingAs` is true whenever impersonation is active, and
 *     write routes refuse. Nothing an admin does may be recorded as though
 *     another person did it: the moment the activity feed can lie about who
 *     called a lead, "who owns this" stops being answerable.
 *  3. The real user is always returned alongside, so audit and attribution
 *     have something honest to write down.
 */

const COOKIE = 'proxe_view_as'

export interface ActingUser {
  /** Whose dashboard is being rendered - the one to filter data by. */
  actingUserId: string
  /** Who is actually logged in - the one to attribute any write to. */
  realUserId: string
  /** True when the two differ, i.e. impersonation is on. */
  isViewingAs: boolean
  /** Display name of the impersonated user, for the banner. */
  actingUserName: string | null
}

/**
 * Resolve who this request should be treated as.
 *
 * Callers pass the authenticated user; this returns the acting identity after
 * verifying the caller is an admin and the target exists and is active.
 */
export async function resolveActingUser(
  supabase: any,
  realUserId: string,
): Promise<ActingUser> {
  const none: ActingUser = {
    actingUserId: realUserId,
    realUserId,
    isViewingAs: false,
    actingUserName: null,
  }

  let target: string | null = null
  try {
    target = cookies().get(COOKIE)?.value || null
  } catch {
    // Called outside a request scope (a cron, a script) - no impersonation.
    return none
  }
  if (!target || target === realUserId) return none

  try {
    // Is the REAL user an admin? Asked of the database, never inferred from
    // anything the client sent.
    const { data: me } = await supabase
      .from('dashboard_users')
      .select('role')
      .eq('id', realUserId)
      .maybeSingle()
    if ((me as any)?.role !== 'admin') return none

    // Does the target exist and is it active? A stale cookie pointing at a
    // removed user must not silently widen or narrow what is shown.
    const { data: them } = await supabase
      .from('dashboard_users')
      .select('id, full_name, email, is_active')
      .eq('id', target)
      .maybeSingle()
    if (!them || (them as any).is_active === false) return none

    return {
      actingUserId: (them as any).id,
      realUserId,
      isViewingAs: true,
      actingUserName: (them as any).full_name || (them as any).email || null,
    }
  } catch {
    return none
  }
}

/**
 * Guard for write routes. Returns an error payload when the request is being
 * made while impersonating, so the caller can refuse with one line:
 *
 *   const blocked = await blockIfViewingAs(supabase, user.id)
 *   if (blocked) return NextResponse.json(blocked, { status: 403 })
 */
export async function blockIfViewingAs(
  supabase: any,
  realUserId: string,
): Promise<{ error: string; viewingAs: string | null } | null> {
  const acting = await resolveActingUser(supabase, realUserId)
  if (!acting.isViewingAs) return null
  return {
    error: `Read-only while viewing as ${acting.actingUserName || 'another user'}. Exit view-as to make changes.`,
    viewingAs: acting.actingUserName,
  }
}

export const VIEW_AS_COOKIE = COOKIE
