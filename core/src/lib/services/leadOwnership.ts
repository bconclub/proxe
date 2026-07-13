/**
 * Lead ownership on touch.
 *
 * Default (flag off): whoever takes an action on a lead — replies, sends a
 * template, logs a call, adds a note — becomes its owner. This intentionally
 * REASSIGNS: the owner follows whoever is actively working the lead (founder
 * request: "owner should change based on whoever is touching the lead").
 *
 * features.leadAccess (windchasers): STICKY FIRST TOUCH — the first user to
 * touch an unowned lead claims it permanently; a later touch by someone else
 * only refreshes last_actor, never steals ownership. Release/reassign go
 * through the /owner route (self-release or admin). Ownership is dual-written:
 * unified_context.owner (display: name/email) + the all_leads.owner_id column
 * (SQL filtering — the column only exists on flagged brands, migration 036).
 *
 * No-ops when:
 *   • there is no authenticated user (system / automated paths must NEVER
 *     claim ownership — they have no user.id), or
 *   • the acting user already owns the lead (avoids a needless write).
 *
 * Always non-fatal: ownership is a convenience, never a reason to fail the
 * action that triggered it.
 */
import { getBrandConfig } from '@/configs'
/**
 * Stamp PROXe (the AI) as the last actor on a lead. Call this right after the
 * agent auto-sends a WhatsApp/web reply, so the leads-table "Last Touch" badge
 * shows @proxe. A later human touch (assignOwnerOnTouch) overwrites it, and a
 * later AI touch overwrites that — whoever acted last wins. Non-fatal.
 */
export async function stampProxeActor(supabase: any, leadId: string): Promise<void> {
  try {
    if (!leadId) return
    const { data: row } = await supabase
      .from('all_leads')
      .select('unified_context')
      .eq('id', leadId)
      .maybeSingle()
    const ctx = row?.unified_context || {}
    await supabase
      .from('all_leads')
      .update({ unified_context: { ...ctx, last_actor: { type: 'proxe', at: new Date().toISOString() } } })
      .eq('id', leadId)
  } catch (e: any) {
    console.warn('[leadOwnership] stampProxeActor failed (non-fatal):', e?.message || e)
  }
}

export async function assignOwnerOnTouch(
  supabase: any,
  leadId: string,
  user: { id?: string | null; email?: string | null } | null | undefined,
): Promise<void> {
  try {
    if (!user?.id) return

    const sticky = !!getBrandConfig().features?.leadAccess

    const { data: row } = await supabase
      .from('all_leads')
      .select('unified_context')
      .eq('id', leadId)
      .maybeSingle()

    const ctx = row?.unified_context || {}

    const { data: du } = await supabase
      .from('dashboard_users')
      .select('full_name, email')
      .eq('id', user.id)
      .maybeSingle()

    const now = new Date().toISOString()
    const actorName = du?.full_name || (user.email || 'User').split('@')[0]
    // last_actor drives the "who last touched" badge in the leads table. Always
    // refresh it on a human touch, even if ownership is unchanged, so the badge
    // reflects the most recent toucher (a human action supersedes PROXe).
    const last_actor = { type: 'user', name: actorName, email: du?.email || user.email || null, at: now }

    // Same person already owns it — only refresh last_actor, skip rewriting owner.
    if (ctx.owner && ctx.owner.id === user.id) {
      await supabase
        .from('all_leads')
        .update({ unified_context: { ...ctx, last_actor } })
        .eq('id', leadId)
      return
    }

    // Sticky mode: someone else already owns this lead — first touch locked
    // it. Refresh last_actor only; ownership never moves on touch.
    if (sticky && ctx.owner?.id) {
      await supabase
        .from('all_leads')
        .update({ unified_context: { ...ctx, last_actor } })
        .eq('id', leadId)
      return
    }

    const owner = {
      id: user.id,
      name: actorName,
      email: du?.email || user.email || null,
      assigned_at: now,
      assigned_by: user.email || user.id,
      auto: true,
    }

    // owner_id column exists only on flagged brands (migration 036) — writing
    // it elsewhere would error the whole update.
    const update: Record<string, any> = { unified_context: { ...ctx, owner, last_actor } }
    if (sticky) update.owner_id = user.id

    await supabase
      .from('all_leads')
      .update(update)
      .eq('id', leadId)
  } catch (e: any) {
    console.warn('[leadOwnership] assignOwnerOnTouch failed (non-fatal):', e?.message || e)
  }
}
