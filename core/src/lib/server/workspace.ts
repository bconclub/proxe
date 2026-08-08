import { cookies } from 'next/headers'
import { getBrandConfig } from '@/configs'

/**
 * Which brands the current request is allowed to read.
 *
 * Beacon's Supabase holds PROXe product leads alongside BCON service leads, so
 * one login covers both. Two separate things decide what you see:
 *
 *  - `config.leadBrands` is the DEPLOYMENT's allow-list. It is the outer bound
 *    and it comes from code, never from the request.
 *  - the `workspace` cookie is the USER's current selection inside that bound,
 *    set by the workspace switcher.
 *
 * The cookie can only ever narrow, never widen: a value outside the allow-list
 * is ignored rather than honoured, so forging it gains nothing. That check is
 * the whole security property of this file — keep it.
 *
 * Returns `null` for brands that declare no `leadBrands` (pop, lokazen,
 * windchasers). Callers must treat null as "apply no filter at all", which is
 * what makes this change a no-op for every single-brand deployment.
 */
export { WORKSPACE_COOKIE } from '@/lib/workspaceCookie'
import { WORKSPACE_COOKIE } from '@/lib/workspaceCookie'

export async function resolveWorkspaceBrands(): Promise<string[] | null> {
  const leadBrands = getBrandConfig().leadBrands
  if (!leadBrands?.length) return null

  const allowed = leadBrands.map((b) => b.id)

  let selected: string | undefined
  try {
    selected = (await cookies()).get(WORKSPACE_COOKIE)?.value
  } catch {
    // cookies() throws outside a request scope (e.g. during static generation).
    // Falling through to the full allow-list is the safe default: it shows the
    // deployment's own data, never another deployment's.
    selected = undefined
  }

  return selected && allowed.includes(selected) ? [selected] : allowed
}

/**
 * Applies the workspace scope to a Supabase query.
 *
 * Generic over the builder type so it can be dropped into an existing chain
 * without unpicking it: `query = scopeToWorkspace(query, brands)`.
 *
 * A single-brand scope uses `.eq` rather than `.in` so Postgres can still use a
 * plain equality index on `brand`; `.in` with one element does not always plan
 * the same way.
 */
/**
 * scopeToWorkspace with the brand lookup folded in, so a query can be scoped by
 * wrapping it and nothing else — no extra local, no reordering around the auth
 * gate. That matters at the scale this is applied: ~50 routes, several query
 * sites each, and every hand-placed `const ws = await …` is somewhere the
 * declaration can end up in the wrong function (which is exactly the mistake
 * that already happened once here).
 *
 * cookies() is a request-scoped read, so calling this per query is cheap.
 */
export async function scopedQuery<T>(query: T, column = 'brand'): Promise<T> {
  return scopeToWorkspace(query, await resolveWorkspaceBrands(), column)
}

export function scopeToWorkspace<T>(query: T, brands: string[] | null, column = 'brand'): T {
  if (!brands?.length) return query
  // Unconstrained T plus an internal cast, deliberately. Constraining T to
  // something with .eq/.in erases PostgREST's row-type parameter, and every
  // `data` downstream of a scoped query then infers as `never` — which showed
  // up as ~14 phantom "Property does not exist on type 'never'" errors the
  // moment this was applied to a real route. Filters do not change the row
  // type, so returning T is accurate.
  const q = query as any
  return (brands.length === 1 ? q.eq(column, brands[0]) : q.in(column, brands)) as T
}
