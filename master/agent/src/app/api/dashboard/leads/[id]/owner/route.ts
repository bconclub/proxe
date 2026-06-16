import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'

export const dynamic = 'force-dynamic'

/**
 * POST /api/dashboard/leads/[id]/owner
 *
 * Set (or clear) the owner of a lead. Owner lives in
 * unified_context.owner = { id, name, email, assigned_at, assigned_by }.
 *
 * Body: { owner: { id, name, email } } to assign, or { owner: null } to clear.
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
    const { data: lead, error: readErr } = await supabase
      .from('all_leads')
      .select('unified_context')
      .eq('id', params.id)
      .maybeSingle()
    if (readErr || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    const ctx = lead.unified_context || {}
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
    const { error: updErr } = await supabase
      .from('all_leads')
      .update({ unified_context: newCtx })
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
