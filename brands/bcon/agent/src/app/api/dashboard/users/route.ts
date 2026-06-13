/**
 * Dashboard user management — admin only.
 *
 * GET  /api/dashboard/users           → list dashboard_users + pending invitations
 * POST /api/dashboard/users           → create invite (returns inviteUrl for copy-paste)
 *
 * NOTE: Email delivery of the invite link is deferred to item ③ (Resend).
 * Until then, POST returns `inviteUrl` and the admin shares it manually from
 * the settings UI (copy-link). This mirrors WC's soft-fail path exactly —
 * the invitation row is always created regardless of email.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient, sendInvitationEmail } from '@/lib/services'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

/**
 * Get the logged-in user from the cookie client, then read their role with
 * the SERVICE-ROLE client. The service-role lookup bypasses any RLS quirks
 * on dashboard_users — we still trust the auth.getUser() identity from the
 * user's own session cookie.
 */
async function requireAdmin(userSupabase: any) {
  const {
    data: { user },
  } = await userSupabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const }

  const service = getServiceClient()
  if (!service) {
    return { error: 'Service client unavailable', status: 500 as const }
  }

  const { data: dashboardUser } = await service
    .from('dashboard_users')
    .select('role, is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (!dashboardUser) {
    return { error: 'Your account is not provisioned in dashboard_users. Ask another admin to add you.', status: 403 as const }
  }
  if (dashboardUser.is_active === false) {
    return { error: 'Your account is deactivated', status: 403 as const }
  }
  if (dashboardUser.role !== 'admin') {
    return { error: 'Forbidden — admins only', status: 403 as const }
  }
  return { user, role: dashboardUser.role, status: 200 as const, service }
}

// ── GET — list users + pending invitations ────────────────────────────────────
export async function GET() {
  try {
    const supabase = await createClient()
    const auth = await requireAdmin(supabase)
    if (auth.status !== 200) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const service = (auth as any).service

    const [usersRes, invitesRes] = await Promise.all([
      service
        .from('dashboard_users')
        .select('id, email, full_name, role, is_active, created_at, last_login')
        .order('created_at', { ascending: false }),
      service
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
    const service = (auth as any).service

    // Already an active user?
    const { data: existing } = await service
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
    await service
      .from('user_invitations')
      .delete()
      .eq('email', trimmedEmail)
      .is('accepted_at', null)

    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    const { data: invitation, error: inviteError } = await service
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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://proxe.bconclub.com'
    const inviteUrl = `${appUrl}/auth/accept-invite?token=${token}`

    // Send the invite email via Resend. Soft-fail: if the send errors
    // (missing env var, unverified domain, Resend down), the invitation
    // row is already in the DB and inviteUrl is in the response — the
    // admin can copy-paste it manually. Never block invitation creation
    // on email delivery.
    const emailResult = await sendInvitationEmail({
      to: trimmedEmail,
      inviteUrl,
      invitedByEmail: (auth as any).user.email,
      role,
    })
    if (!emailResult.sent) {
      console.warn(
        `[users] Email send failed for ${trimmedEmail}: ${emailResult.error}. ` +
        `Admin can share inviteUrl manually.`,
      )
    } else {
      console.log(`[users] Invite sent to ${trimmedEmail} (resend id=${emailResult.id})`)
    }

    return NextResponse.json({
      invitation,
      inviteUrl,
      email: emailResult,
      message: emailResult.sent
        ? 'Invitation created and email sent'
        : 'Invitation created (email send failed — share inviteUrl manually)',
    })
  } catch (error) {
    console.error('[users] POST error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create invitation' },
      { status: 500 },
    )
  }
}
