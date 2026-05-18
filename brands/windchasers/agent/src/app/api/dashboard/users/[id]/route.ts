/**
 * Per-user mutations:
 *   PATCH  /api/dashboard/users/[id] → update role / is_active
 *   DELETE /api/dashboard/users/[id] → soft-delete (sets is_active = false)
 *
 * Admin-only. An admin cannot demote / deactivate themselves to avoid lockout.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function requireAdmin(supabase: any) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const }
  const { data: dashboardUser } = await supabase
    .from('dashboard_users')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!dashboardUser || dashboardUser.role !== 'admin') {
    return { error: 'Forbidden — admins only', status: 403 as const }
  }
  return { user, role: dashboardUser.role, status: 200 as const }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createClient()
    const auth = await requireAdmin(supabase)
    if (auth.status !== 200) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const targetUserId = params.id
    if ((auth as any).user.id === targetUserId) {
      return NextResponse.json(
        { error: "You cannot modify your own role or status. Ask another admin." },
        { status: 400 },
      )
    }

    const body = await request.json()
    const updates: Record<string, any> = {}
    if (body.role !== undefined) {
      if (!['admin', 'viewer'].includes(body.role)) {
        return NextResponse.json({ error: 'Role must be admin or viewer' }, { status: 400 })
      }
      updates.role = body.role
    }
    if (body.is_active !== undefined) {
      updates.is_active = !!body.is_active
    }
    if (body.full_name !== undefined) {
      updates.full_name = String(body.full_name).trim() || null
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('dashboard_users')
      .update(updates)
      .eq('id', targetUserId)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ success: true, user: data })
  } catch (error) {
    console.error('[users/PATCH] error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update user' },
      { status: 500 },
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createClient()
    const auth = await requireAdmin(supabase)
    if (auth.status !== 200) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const targetUserId = params.id
    if ((auth as any).user.id === targetUserId) {
      return NextResponse.json(
        { error: "You cannot deactivate yourself. Ask another admin." },
        { status: 400 },
      )
    }

    const { error } = await supabase
      .from('dashboard_users')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', targetUserId)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[users/DELETE] error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to deactivate user' },
      { status: 500 },
    )
  }
}
