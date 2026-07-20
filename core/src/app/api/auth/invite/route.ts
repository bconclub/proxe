/**
 * POST /api/auth/invite
 *
 * Admin-only. Creates a `user_invitations` row + sends the invite email
 * via Resend. The accept-invite page reads the token, calls auth.signUp,
 * and the `handle_new_user` DB trigger inserts the corresponding
 * dashboard_users row (default role='viewer' which is then upgraded to
 * whatever this invitation specified).
 *
 * Body: { email: string, role?: 'viewer' | 'admin' }
 *   role defaults to 'viewer' and is validated against an allowlist -
 *   never trust whatever the caller sent.
 *
 * Response: { invitation, inviteUrl, email: { sent, id?, error? } }
 *   inviteUrl is always returned so an admin can copy-paste it manually
 *   even when Resend isn't configured / the send failed.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendInvitationEmail } from '@/lib/services'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

// Allowlist - never trust caller-supplied role values.
const ALLOWED_ROLES = new Set(['viewer', 'admin'])

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    const { data: dashboardUser } = await supabase
      .from('dashboard_users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!dashboardUser || dashboardUser.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { email } = body
    const requestedRole = String(body.role || 'viewer').toLowerCase().trim()
    const role = ALLOWED_ROLES.has(requestedRole) ? requestedRole : 'viewer'

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    const normalizedEmail = String(email).trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      )
    }

    // Generate invitation token
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7) // 7 days expiry

    // Create invitation
    const { data: invitation, error: inviteError } = await supabase
      .from('user_invitations')
      .insert({
        email: normalizedEmail,
        token,
        role,
        invited_by: user.id,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single()

    if (inviteError) throw inviteError

    // Build the accept URL. NEXT_PUBLIC_APP_URL is set per environment
    // (e.g. https://proxe.windchasers.in in production).
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
    const inviteUrl = `${appUrl}/auth/accept-invite?token=${token}`

    // Fire the email. Soft-fail: if Resend isn't configured or the send
    // errors, we still return the inviteUrl so the admin can share it
    // manually. Never block invitation creation on email delivery.
    const emailResult = await sendInvitationEmail({
      to: normalizedEmail,
      inviteUrl,
      invitedByEmail: user.email,
      role,
    })

    if (!emailResult.sent) {
      console.warn(
        `[invite] Email send failed for ${normalizedEmail}: ${emailResult.error}. ` +
        `Admin can share inviteUrl manually.`
      )
    } else {
      console.log(`[invite] Sent to ${normalizedEmail} (resend id=${emailResult.id})`)
    }

    return NextResponse.json({
      invitation,
      inviteUrl,
      email: emailResult,
      message: emailResult.sent
        ? 'Invitation created and email sent'
        : 'Invitation created (email send failed - share inviteUrl manually)',
    })
  } catch (error) {
    console.error('Error creating invitation:', error)
    return NextResponse.json(
      { error: 'Failed to create invitation' },
      { status: 500 }
    )
  }
}
