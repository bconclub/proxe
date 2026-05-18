/**
 * DELETE /api/dashboard/users/invitations/[id]  — revoke pending invitation
 * Admin-only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: dashboardUser } = await supabase
      .from('dashboard_users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!dashboardUser || dashboardUser.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { error } = await supabase
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
