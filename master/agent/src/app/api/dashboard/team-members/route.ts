import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'

export const dynamic = 'force-dynamic'

/**
 * GET /api/dashboard/team-members
 *
 * Lightweight list of active dashboard users (id, name, email) for populating
 * the lead-owner dropdown. Any logged-in user can read it (unlike the
 * admin-only /api/dashboard/users management endpoint).
 */
export async function GET() {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServiceClient() || authClient
    const { data, error } = await supabase
      .from('dashboard_users')
      .select('id, full_name, email')
      .or('is_active.is.null,is_active.eq.true')
      .order('full_name', { ascending: true })

    if (error) {
      console.error('[team-members] query failed:', error.message)
      return NextResponse.json({ members: [] })
    }

    const members = (data || []).map((u: any) => ({
      id: u.id,
      name: u.full_name || (u.email ? u.email.split('@')[0] : 'User'),
      email: u.email || null,
    }))
    return NextResponse.json({ members })
  } catch (error: any) {
    console.error('[team-members] Error:', error?.message || error)
    return NextResponse.json({ members: [] })
  }
}
