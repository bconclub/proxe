/**
 * Per-user mutations (admin only):
 *   PATCH  /api/dashboard/users/[id] → update role / is_active / full_name
 *   DELETE /api/dashboard/users/[id] → soft-deactivate
 *
 * An admin cannot demote / deactivate themselves to avoid lockout.
 * Service-role client used for DB writes (bypasses RLS); identity comes
 * from the user's own session cookie.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'
import { getBrandConfig } from '@/configs'
import { sanitizeAllowedLeadTypes } from '@/lib/services/leadAccess'

export const dynamic = 'force-dynamic'

async function requireAdmin(userSupabase: any) {
  const {
    data: { user },
  } = await userSupabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const }

  const service = getServiceClient()
  if (!service) return { error: 'Service client unavailable', status: 500 as const }

  const { data: dashboardUser } = await service
    .from('dashboard_users')
    .select('role, is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (!dashboardUser) return { error: 'Not provisioned', status: 403 as const }
  if (dashboardUser.is_active === false) return { error: 'Account deactivated', status: 403 as const }
  if (dashboardUser.role !== 'admin') return { error: 'Forbidden — admins only', status: 403 as const }
  return { user, role: dashboardUser.role, service, status: 200 as const }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const userSupabase = await createClient()
    const auth = await requireAdmin(userSupabase)
    if (auth.status !== 200) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const service = (auth as any).service

    const targetUserId = params.id
    const isSelf = (auth as any).user.id === targetUserId
    const body = await request.json()

    // Self-editing your own display name is safe (cosmetic, can't lock you
    // out); only role/is_active on your own account are blocked, since
    // demoting or deactivating yourself could strand the team with no admin.
    if (isSelf && (body.role !== undefined || body.is_active !== undefined)) {
      return NextResponse.json(
        { error: "You cannot change your own role or status. Ask another admin." },
        { status: 400 },
      )
    }
    const updates: Record<string, any> = {}
    if (body.role !== undefined) {
      if (!['admin', 'viewer'].includes(body.role)) {
        return NextResponse.json({ error: 'Role must be admin or viewer' }, { status: 400 })
      }
      updates.role = body.role
    }
    if (body.is_active !== undefined) updates.is_active = !!body.is_active
    if (body.full_name !== undefined) updates.full_name = String(body.full_name).trim() || null
    // features.leadAccess only — the column doesn't exist on other brands.
    if (getBrandConfig().features?.leadAccess && body.allowed_lead_types !== undefined) {
      const sanitized = sanitizeAllowedLeadTypes(body.allowed_lead_types)
      if (sanitized === undefined) {
        return NextResponse.json({ error: 'allowed_lead_types must be an array of course names or null' }, { status: 400 })
      }
      updates.allowed_lead_types = sanitized
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    updates.updated_at = new Date().toISOString()

    const { data, error } = await service
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
    const userSupabase = await createClient()
    const auth = await requireAdmin(userSupabase)
    if (auth.status !== 200) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const service = (auth as any).service

    const targetUserId = params.id
    if ((auth as any).user.id === targetUserId) {
      return NextResponse.json(
        { error: "You cannot deactivate yourself. Ask another admin." },
        { status: 400 },
      )
    }

    const { error } = await service
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
