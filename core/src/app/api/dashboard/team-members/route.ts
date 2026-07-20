import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'
import { getBrandConfig } from '@/configs'

export const dynamic = 'force-dynamic'

/**
 * GET /api/dashboard/team-members
 *
 * Lightweight list of active dashboard users (id, name, email) for populating
 * the lead-owner dropdown. Any logged-in user can read it (unlike the
 * admin-only /api/dashboard/users management endpoint).
 */
export async function GET() {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServiceClient() || authClient

    // Is the caller an admin? Only admins may (re)assign lead owners; everyone
    // can still SEE the list (read-only owner label + owner filters).
    // allowed_lead_types (features.leadAccess) rides along so the client knows
    // the caller's own access profile without a second endpoint.
    // The allowed_lead_types column only exists on brands running the flag
    // (migration 036) - selecting it elsewhere would error and silently drop
    // admin detection into the catch.
    const leadAccessOn = !!getBrandConfig().features?.leadAccess
    let isAdmin = false
    let allowedTypes: string[] | null = null
    try {
      let { data: me, error: meErr } = await supabase
        .from('dashboard_users')
        .select(leadAccessOn ? 'role, allowed_lead_types' : 'role')
        .eq('id', user.id)
        .maybeSingle()
      if (meErr && leadAccessOn) {
        // Migration 036 not run yet (42703 column missing) - fall back to
        // role-only so admin detection keeps working.
        ;({ data: me } = await supabase
          .from('dashboard_users')
          .select('role')
          .eq('id', user.id)
          .maybeSingle())
      }
      isAdmin = (me as any)?.role === 'admin'
      const types = (me as any)?.allowed_lead_types
      allowedTypes = Array.isArray(types) && types.length > 0 ? types : null
    } catch { /* default non-admin */ }

    const { data, error } = await supabase
      .from('dashboard_users')
      .select('id, full_name, email')
      .or('is_active.is.null,is_active.eq.true')
      .order('full_name', { ascending: true })

    if (error) {
      console.error('[team-members] query failed:', error.message)
      return NextResponse.json({ members: [], isAdmin })
    }

    const members = (data || []).map((u: any) => ({
      id: u.id,
      name: u.full_name || (u.email ? u.email.split('@')[0] : 'User'),
      email: u.email || null,
    }))
    return NextResponse.json({ members, isAdmin, me: { id: user.id, allowedTypes } })
  } catch (error: any) {
    console.error('[team-members] Error:', error?.message || error)
    return NextResponse.json({ members: [] })
  }
}
