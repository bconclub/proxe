/**
 * POST /api/auth/touch
 *
 * Lightweight heartbeat - updates dashboard_users.last_login to NOW() for
 * the currently logged-in user. Called by the dashboard layout on mount
 * and at a 60s interval while the tab is active, giving us a "Last Active"
 * timestamp and a "live now" indicator (last_login within ~2 min).
 *
 * Why reuse `last_login` instead of adding a new column? It already exists
 * in dashboard_users, was empty in practice (no code wrote to it), and
 * the only place it surfaces is the team-members table - renaming the
 * header from "Last Login" → "Last Active" captures the new semantics
 * cleanly without a migration.
 *
 * Auth: requires a logged-in Supabase session.
 *
 * Idempotent + side-effect-only. Returns { ok: true } regardless of
 * write result so a transient DB blip doesn't break the dashboard's
 * heartbeat loop.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Service-role write - dashboard_users has RLS that only lets users
    // see/update their own row anyway, but service-role is consistent
    // with the rest of our dashboard write paths.
    const service = getServiceClient() || supabase
    const { error } = await service
      .from('dashboard_users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', user.id)

    if (error) {
      console.warn('[auth/touch] update failed:', error.message)
      // Soft-fail - the heartbeat is best-effort, never break the caller.
    }
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[auth/touch] unexpected:', err?.message || err)
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
