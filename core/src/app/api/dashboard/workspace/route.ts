import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getBrandConfig } from '@/configs'
import { WORKSPACE_COOKIE } from '@/lib/server/workspace'

/**
 * Sets the active workspace.
 *
 * Switching PROXe <-> BCON used to mean jumping to another deployment, which
 * cost a second login because sessions are per-domain. It is a data scope, not
 * a deployment, so it lives in a cookie and the domain never changes.
 *
 * The value is validated against this deployment's own leadBrands before it is
 * written. That is not belt-and-braces: resolveWorkspaceBrands re-checks on
 * read precisely because a cookie is client-controlled, and rejecting here just
 * means a bad value never gets stored in the first place.
 */
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { brand } = await request.json().catch(() => ({ brand: null }))
  const allowed = (getBrandConfig().leadBrands ?? []).map((b) => b.id)

  if (!brand || !allowed.includes(brand)) {
    return NextResponse.json({ error: 'Unknown workspace' }, { status: 400 })
  }

  const res = NextResponse.json({ ok: true, workspace: brand })
  res.cookies.set(WORKSPACE_COOKIE, brand, {
    httpOnly: false, // the switcher reads it to show which one is active
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
  return res
}
