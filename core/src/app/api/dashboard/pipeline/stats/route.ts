import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'

export const dynamic = 'force-dynamic'

/**
 * GET /api/dashboard/pipeline/stats?owner=me|all|<userId>&days=7|14
 *
 * Calling activity for the pipeline page's left column. The human pipeline is
 * measured in calls made, not leads sitting in a stage, so this counts the one
 * thing a salesperson actually does.
 *
 * Cheap on purpose: one read of `activities` filtered to calls inside the
 * window. That table is small and the filter is indexed - nothing here scans
 * all_leads. The stage tiles beside it are counted by the page with
 * head-only exact counts.
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000

/** IST midnight for an instant, as a UTC ISO string. */
function istMidnightISO(d: Date): string {
  const ist = new Date(d.getTime() + IST_OFFSET_MS)
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS).toISOString()
}

/** IST calendar day for an instant, as YYYY-MM-DD. */
function istDay(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)
}

export async function GET(request: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const sp = request.nextUrl.searchParams
    const ownerParam = sp.get('owner') || 'me'
    const ownerId = ownerParam === 'me' ? user.id : ownerParam === 'all' ? null : ownerParam
    const days = Math.min(31, Math.max(1, parseInt(sp.get('days') || '7', 10) || 7))

    const supabase: any = getServiceClient() || authClient

    const now = new Date()
    const todayStart = istMidnightISO(now)
    // Start of the IST day `days-1` back, so a 7-day window is 7 whole days
    // including today rather than 6 and a fraction.
    const windowStart = istMidnightISO(new Date(now.getTime() - (days - 1) * 86_400_000))

    // activities.created_by holds the user's UUID on this schema (bcon's fork
    // stores an email - its own dashboard reads its own shape).
    let q = supabase
      .from('activities')
      .select('created_by, created_at')
      .eq('activity_type', 'call')
      .gte('created_at', windowStart)
    if (ownerId) q = q.eq('created_by', ownerId)
    const { data: calls, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const rows: any[] = calls || []

    // One bucket per IST day, zeros included - a day with no calls is a fact
    // worth drawing, and a graph that silently skips it lies about the trend.
    const byDay = new Map<string, number>()
    for (let i = days - 1; i >= 0; i--) {
      byDay.set(istDay(new Date(now.getTime() - i * 86_400_000)), 0)
    }
    let callsToday = 0
    const byUser = new Map<string, number>()

    for (const r of rows) {
      const t = Date.parse(r.created_at)
      if (!isFinite(t)) continue
      const day = istDay(new Date(t))
      if (byDay.has(day)) byDay.set(day, (byDay.get(day) || 0) + 1)
      if (r.created_at >= todayStart) {
        callsToday++
        const key = r.created_by || 'unknown'
        byUser.set(key, (byUser.get(key) || 0) + 1)
      }
    }

    // Names only when looking at more than one person - a single user's own
    // count needs no legend.
    let callsByUser: Array<{ name: string; count: number }> = []
    if (!ownerId) {
      const ids = Array.from(byUser.keys()).filter((k) => k !== 'unknown')
      const nameById = new Map<string, string>()
      if (ids.length) {
        const { data: users } = await supabase
          .from('dashboard_users')
          .select('id, full_name, email')
          .in('id', ids)
        for (const u of users || []) {
          nameById.set(u.id, u.full_name || (u.email || '').split('@')[0] || 'User')
        }
      }
      callsByUser = Array.from(byUser.entries())
        .map(([id, count]) => ({ name: id === 'unknown' ? 'Unknown' : (nameById.get(id) || 'User'), count }))
        .sort((a, b) => b.count - a.count)
    }

    return NextResponse.json({
      owner: ownerParam,
      days,
      callsToday,
      callsInWindow: rows.length,
      callsByDay: Array.from(byDay.entries()).map(([day, count]) => ({ day, count })),
      callsByUser,
    })
  } catch (err: any) {
    console.error('[pipeline/stats] failed:', err?.message || err)
    return NextResponse.json({ error: err?.message || 'unknown' }, { status: 500 })
  }
}
