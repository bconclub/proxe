import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'
import { getBrandConfig } from '@/configs'

export const dynamic = 'force-dynamic'

/**
 * POST /api/dashboard/leads/[id]/owner
 *
 * Set (or clear) the owner of a lead. Owner lives in
 * unified_context.owner = { id, name, email, assigned_at, assigned_by },
 * dual-written to the all_leads.owner_id column on brands running
 * features.leadAccess (migration 036).
 *
 * Body: { owner: { id, name, email } } to assign, or { owner: null } to clear.
 * Assignment is admin-only. Clearing is admin - or, under features.leadAccess,
 * the current owner releasing their own lead back to the open pool.
 * Auth: logged-in session. Write via service role.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const owner = body?.owner

    const supabase = getServiceClient() || authClient

    const leadAccessOn = !!getBrandConfig().features?.leadAccess

    const { data: me } = await supabase
      .from('dashboard_users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    const isAdmin = me?.role === 'admin'

    const { data: lead, error: readErr } = await supabase
      .from('all_leads')
      .select('unified_context')
      .eq('id', params.id)
      .maybeSingle()
    if (readErr || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    const ctx = lead.unified_context || {}

    // Owner ASSIGNMENT is admin-only - the dropdown is hidden for non-admins,
    // but enforce it here too so the API can't be called directly to bypass it.
    // CLEARING ({owner:null}) is admin - or, under features.leadAccess, the
    // current owner releasing their own lead back to the open pool.
    const isSelfRelease = leadAccessOn && !owner && ctx.owner?.id === user.id
    if (!isAdmin && !isSelfRelease) {
      return NextResponse.json({ error: 'Forbidden - owner assignment is admin-only' }, { status: 403 })
    }
    let nextOwner: any = null
    if (owner && owner.id) {
      nextOwner = {
        id: String(owner.id),
        name: String(owner.name || owner.email || 'User'),
        email: owner.email ? String(owner.email) : null,
        assigned_at: new Date().toISOString(),
        assigned_by: user.email || user.id,
      }
    }

    const newCtx = { ...ctx, owner: nextOwner }
    // Dual-write owner_id only on flagged brands - the column doesn't exist
    // elsewhere and would error the whole update.
    const update: Record<string, any> = { unified_context: newCtx }
    if (leadAccessOn) update.owner_id = nextOwner ? nextOwner.id : null
    const { error: updErr } = await supabase
      .from('all_leads')
      .update(update)
      .eq('id', params.id)
    if (updErr) {
      console.error('[leads/owner] update failed:', updErr.message)
      return NextResponse.json({ error: 'Failed to set owner' }, { status: 500 })
    }

    return NextResponse.json({ success: true, owner: nextOwner })
  } catch (error: any) {
    console.error('[leads/owner] Error:', error?.message || error)
    return NextResponse.json({ error: 'Failed to set owner' }, { status: 500 })
  }
}
