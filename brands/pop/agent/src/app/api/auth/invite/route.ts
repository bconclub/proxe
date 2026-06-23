/**
 * POST /api/auth/invite — create a dashboard invitation (admin only).
 *
 * Legacy endpoint kept for compatibility. The settings UI now uses
 * POST /api/dashboard/users (same behaviour). Both create a user_invitations
 * row and return inviteUrl for copy-paste. Email delivery is wired at item ③.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient, sendInvitationEmail } from '@/lib/services'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Role check via the service-role client (bypasses RLS quirks on
    // dashboard_users); identity still comes from the session cookie above.
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
      return NextResponse.json({ error: 'Forbidden — admins only' }, { status: 403 })
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
    const { data: existing } = await service
      .from('dashboard_users')
      .select('id')
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

    // Generate invitation token
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7) // 7 days expiry

    const { data: invitation, error: inviteError } = await service
      .from('user_invitations')
      .insert({
        email: trimmedEmail,
        token,
        role,
        invited_by: user.id,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single()

    if (inviteError) throw inviteError

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
    const inviteUrl = `${appUrl}/auth/accept-invite?token=${token}`

    // Send the invite email via Resend. Soft-fail: the invitation row is
    // already persisted and inviteUrl is in the response, so a failed send
    // never blocks invitation creation — the admin can share it manually.
    const emailResult = await sendInvitationEmail({
      to: trimmedEmail,
      inviteUrl,
      invitedByEmail: user.email,
      role,
    })
    if (!emailResult.sent) {
      console.warn(
        `[invite] Email send failed for ${trimmedEmail}: ${emailResult.error}. ` +
        `Admin can share inviteUrl manually.`,
      )
    }

    return NextResponse.json({
      invitation,
      inviteUrl,
      email: emailResult,
      message: emailResult.sent
        ? 'Invitation created and email sent'
        : 'Invitation created — share the invite link with the teammate',
    })
  } catch (error) {
    console.error('Error creating invitation:', error)
    return NextResponse.json(
      { error: 'Failed to create invitation' },
      { status: 500 }
    )
  }
}
