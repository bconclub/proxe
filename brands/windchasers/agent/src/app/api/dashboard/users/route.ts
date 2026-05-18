/**
 * Dashboard user management — admin only.
 *
 * GET  /api/dashboard/users           → list dashboard_users + pending invitations
 * POST /api/dashboard/users           → create invite (delegates to /api/auth/invite logic)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'

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

// ── GET — list users + pending invitations ────────────────────────────────────
export async function GET() {
  try {
    const supabase = await createClient()
    const auth = await requireAdmin(supabase)
    if (auth.status !== 200) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const [usersRes, invitesRes] = await Promise.all([
      supabase
        .from('dashboard_users')
        .select('id, email, full_name, role, is_active, created_at, last_login')
        .order('created_at', { ascending: false }),
      supabase
        .from('user_invitations')
        .select('id, email, token, role, invited_by, expires_at, accepted_at, created_at')
        .is('accepted_at', null)
        .order('created_at', { ascending: false }),
    ])

    if (usersRes.error) throw usersRes.error
    if (invitesRes.error) throw invitesRes.error

    const now = new Date()
    const pendingInvites = (invitesRes.data || []).filter(
      (inv: any) => new Date(inv.expires_at) > now,
    )

    return NextResponse.json({
      users: usersRes.data || [],
      pendingInvites,
    })
  } catch (error) {
    console.error('[users] GET error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch users' },
      { status: 500 },
    )
  }
}

// ── POST — create a new invitation ────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const auth = await requireAdmin(supabase)
    if (auth.status !== 200) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await request.json()
    const { email, role = 'viewer' } = body

    if (!email || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }
    if (!['admin', 'viewer'].includes(role)) {
      return NextResponse.json({ error: 'Role must be admin or viewer' }, { status: 400 })
    }

    const trimmedEmail = email.trim().toLowerCase()

    // Already an active user?
    const { data: existing } = await supabase
      .from('dashboard_users')
      .select('id, email')
      .eq('email', trimmedEmail)
      .maybeSingle()
    if (existing) {
      return NextResponse.json(
        { error: 'A user with this email already exists' },
        { status: 409 },
      )
    }

    // Cancel any older still-pending invites for this email
    await supabase
      .from('user_invitations')
      .delete()
      .eq('email', trimmedEmail)
      .is('accepted_at', null)

    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    const { data: invitation, error: inviteError } = await supabase
      .from('user_invitations')
      .insert({
        email: trimmedEmail,
        token,
        role,
        invited_by: (auth as any).user.id,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single()

    if (inviteError) throw inviteError

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://proxe.windchasers.in'
    const inviteUrl = `${appUrl}/auth/accept-invite?token=${token}`

    return NextResponse.json({
      invitation,
      inviteUrl,
      message: 'Invitation created — share the link with the user',
    })
  } catch (error) {
    console.error('[users] POST error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create invitation' },
      { status: 500 },
    )
  }
}
