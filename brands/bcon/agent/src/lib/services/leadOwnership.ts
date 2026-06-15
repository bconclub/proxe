/**
 * Lead ownership on touch.
 *
 * Whoever takes an action on a lead — replies, sends a template, logs a call,
 * adds a note — becomes its owner. This intentionally REASSIGNS: the owner
 * follows whoever is actively working the lead (founder request: "owner should
 * change based on whoever is touching the lead"), rather than only claiming
 * when unowned.
 *
 * No-ops when:
 *   • there is no authenticated user (system / automated paths must NEVER
 *     claim ownership — they have no user.id), or
 *   • the acting user already owns the lead (avoids a needless write).
 *
 * Always non-fatal: ownership is a convenience, never a reason to fail the
 * action that triggered it.
 */
export async function assignOwnerOnTouch(
  supabase: any,
  leadId: string,
  user: { id?: string | null; email?: string | null } | null | undefined,
): Promise<void> {
  try {
    if (!user?.id) return

    const { data: row } = await supabase
      .from('all_leads')
      .select('unified_context')
      .eq('id', leadId)
      .maybeSingle()

    const ctx = row?.unified_context || {}
    // Same person already owns it — nothing to do.
    if (ctx.owner && ctx.owner.id === user.id) return

    const { data: du } = await supabase
      .from('dashboard_users')
      .select('full_name, email')
      .eq('id', user.id)
      .maybeSingle()

    const owner = {
      id: user.id,
      name: du?.full_name || (user.email || 'User').split('@')[0],
      email: du?.email || user.email || null,
      assigned_at: new Date().toISOString(),
      assigned_by: user.email || user.id,
      auto: true,
    }

    await supabase
      .from('all_leads')
      .update({ unified_context: { ...ctx, owner } })
      .eq('id', leadId)
  } catch (e: any) {
    console.warn('[leadOwnership] assignOwnerOnTouch failed (non-fatal):', e?.message || e)
  }
}
