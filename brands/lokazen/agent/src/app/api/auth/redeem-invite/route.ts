/**
 * POST /api/auth/redeem-invite
 *
 * Server-side completion of the dashboard invitation flow. Replaces the
 * previous client-side `supabase.auth.signUp()` call in /auth/accept-invite,
 * which created an unconfirmed user and dumped them on the login page with
 * "Please verify your email" — even though clicking the invite link IS the
 * proof of email ownership.
 *
 * What this does:
 *   1. Validate the invitation token (exists, not accepted, not expired)
 *   2. Create the auth user via the service-role admin API with
 *      email_confirm:true so they can log in immediately
 *      (idempotent — if the auth.users row already exists from a prior
 *       attempt, we just update the password + confirm the email)
 *   3. handle_new_user DB trigger creates the dashboard_users row
 *      (default role='viewer') — we then UPDATE to the invitation's role
 *   4. Mark the invitation accepted
 *
 * Body: { token, password, fullName }
 *
 * Response: { success, userId, email }
 *
 * After this resolves the client should call `supabase.auth.signInWithPassword`
 * with the email + password to establish the cookie session.
 *
 * No auth required on this endpoint — the invitation token IS the auth.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/services'

export const dynamic = 'force-dynamic'

// Same allowlist as the invite-create endpoint. Defence-in-depth — even if
// the user_invitations row has a junk role somehow, we cap what gets applied.
const ALLOWED_ROLES = new Set(['viewer', 'admin'])

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const token = String(body?.token || '').trim()
    const password = String(body?.password || '')
    const fullName = String(body?.fullName || '').trim() || null

    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 })
    }
    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 },
      )
    }

    const supabase = getServiceClient()
    if (!supabase) {
      return NextResponse.json(
        { error: 'Database connection unavailable' },
        { status: 503 },
      )
    }

    // ── 1. Validate the invitation ─────────────────────────────────────────
    const { data: invitation, error: inviteErr } = await supabase
      .from('user_invitations')
      .select('id, email, role, expires_at, accepted_at')
      .eq('token', token)
      .maybeSingle()

    if (inviteErr) {
      console.error('[redeem-invite] Lookup error:', inviteErr.message)
      return NextResponse.json(
        { error: 'Could not verify invitation' },
        { status: 500 },
      )
    }
    if (!invitation) {
      return NextResponse.json(
        { error: 'Invalid invitation' },
        { status: 404 },
      )
    }
    if (invitation.accepted_at) {
      return NextResponse.json(
        { error: 'This invitation has already been accepted' },
        { status: 409 },
      )
    }
    if (new Date(invitation.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'This invitation has expired' },
        { status: 410 },
      )
    }

    const email = String(invitation.email).trim().toLowerCase()
    const role = ALLOWED_ROLES.has(invitation.role) ? invitation.role : 'viewer'

    // ── 2. Create or update the auth user (admin API) ──────────────────────
    // Idempotent: if the auth.users row already exists from a prior attempt
    // (e.g. they tried under the old client-side signUp flow and got stuck
    // on email verification), update password + confirm rather than fail.
    //
    // Safety: the invitation token is single-use (we set accepted_at below),
    // so even though this CAN reset an existing user's password, only the
    // person holding the unredeemed token can trigger it.
    let userId: string
    let action: 'created' | 'updated'

    // Look up by email first — Supabase admin API doesn't have a clean
    // "get by email" helper, so query auth.users directly via SQL.
    const { data: existingRow } = await supabase
      .from('auth_users_by_email')
      .select('id')
      .eq('email', email)
      .maybeSingle()
      .then((r) => r, () => ({ data: null }))

    let existingUserId: string | null = existingRow?.id || null
    if (!existingUserId) {
      // The view above may not exist in every project — fall back to the
      // admin listUsers API filtered by email.
      const { data: listed, error: listErr } = await (supabase.auth as any).admin.listUsers({
        page: 1,
        perPage: 200,
      })
      if (listErr) {
        console.error('[redeem-invite] admin.listUsers failed:', listErr.message)
      } else {
        const hit = listed?.users?.find(
          (u: any) => String(u.email).toLowerCase() === email,
        )
        if (hit) existingUserId = hit.id
      }
    }

    if (existingUserId) {
      const { error: updErr } = await (supabase.auth as any).admin.updateUserById(
        existingUserId,
        {
          password,
          email_confirm: true,
          user_metadata: fullName ? { full_name: fullName } : undefined,
        },
      )
      if (updErr) {
        console.error('[redeem-invite] updateUserById failed:', updErr.message)
        return NextResponse.json(
          { error: 'Could not update account', detail: updErr.message },
          { status: 500 },
        )
      }
      userId = existingUserId
      action = 'updated'
    } else {
      const { data: created, error: createErr } = await (supabase.auth as any).admin.createUser({
        email,
        password,
        email_confirm: true, // ← the whole point: skip the verify-email wall
        user_metadata: fullName ? { full_name: fullName } : undefined,
      })
      if (createErr || !created?.user) {
        console.error('[redeem-invite] createUser failed:', createErr?.message)
        return NextResponse.json(
          { error: 'Could not create account', detail: createErr?.message },
          { status: 500 },
        )
      }
      userId = created.user.id
      action = 'created'
    }

    // ── 3. Apply the role from the invitation ──────────────────────────────
    // handle_new_user trigger creates dashboard_users with default 'viewer'.
    // Upsert here in case the trigger missed (e.g. retry path) or to upgrade
    // from default. Also fill in full_name if we have one.
    const dashboardUserPatch: Record<string, any> = { role }
    if (fullName) dashboardUserPatch.full_name = fullName

    // First try plain UPDATE (the row should exist from the trigger). If it
    // doesn't update any row, fall through to UPSERT.
    const { data: updRows, error: roleErr } = await supabase
      .from('dashboard_users')
      .update(dashboardUserPatch)
      .eq('id', userId)
      .select('id')

    if (roleErr) {
      console.error('[redeem-invite] dashboard_users update failed:', roleErr.message)
    }

    if (!updRows || updRows.length === 0) {
      // Trigger didn't fire or row got removed — upsert to be safe.
      const { error: upsertErr } = await supabase
        .from('dashboard_users')
        .upsert(
          {
            id: userId,
            email,
            full_name: fullName,
            role,
            is_active: true,
          },
          { onConflict: 'id' },
        )
      if (upsertErr) {
        console.error('[redeem-invite] dashboard_users upsert failed:', upsertErr.message)
      }
    }

    // ── 4. Mark invitation accepted ────────────────────────────────────────
    const { error: acceptErr } = await supabase
      .from('user_invitations')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invitation.id)

    if (acceptErr) {
      // Non-fatal — user has been created and can log in. We log so an
      // admin can clean up the orphan invitation row if it keeps mattering.
      console.error('[redeem-invite] Failed to mark accepted:', acceptErr.message)
    }

    console.log(
      `[redeem-invite] ${action} user=${userId} email=${email} role=${role}`,
    )

    return NextResponse.json({
      success: true,
      userId,
      email,
      role,
      action,
    })
  } catch (error: any) {
    console.error('[redeem-invite] Unexpected error:', error?.message || error)
    return NextResponse.json(
      { error: error?.message || 'Failed to redeem invitation' },
      { status: 500 },
    )
  }
}
