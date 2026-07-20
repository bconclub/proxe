/**
 * DELETE /api/dashboard/users/invitations/[id] - revoke pending invitation
 * Admin-only. Uses service-role client for the write.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'

export const dynamic = 'force-dynamic'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const userSupabase = await createClient()
    const {
      data: { user },
    } = await userSupabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const service = getServiceClient()
    if (!service) {
      return NextResponse.json({ error: 'Service client unavailable' }, { status: 500 })
    }

    const { data: dashboardUser } = await service
      .from('dashboard_users')
      .select('role, is_active')
      .eq('id', user.id)
      .maybeSingle()

    if (!dashboardUser || dashboardUser.role !== 'admin' || dashboardUser.is_active === false) {
      return NextResponse.json({ error: 'Forbidden - admins only' }, { status: 403 })
    }

    const { error } = await service
      .from('user_invitations')
      .delete()
      .eq('id', params.id)
      .is('accepted_at', null)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[users/invitations DELETE] error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to revoke invitation' },
      { status: 500 },
    )
  }
}
