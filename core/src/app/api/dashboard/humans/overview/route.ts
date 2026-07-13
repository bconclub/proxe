/**
 * GET /api/dashboard/humans/overview  (features.leadAccess)
 *
 * Team-activity overview for the Humans page: every active dashboard user
 * with what they're working — allowed lead types, owned-lead count, pipeline
 * stage breakdown — plus the unclaimed open-pool count. lastActive is
 * admin-only (founder: viewers may see WHO is on the team, not activity).
 *
 * One minimal-column all_leads scan + one dashboard_users select, aggregated
 * in JS (PostgREST has no group-by; avoids an RPC).
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'
import { getBrandConfig } from '@/configs'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    if (!getBrandConfig().features?.leadAccess) {
      return NextResponse.json({ error: 'Not available for this brand' }, { status: 404 })
    }

    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServiceClient() || authClient

    const { data: me } = await supabase
      .from('dashboard_users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    const isAdmin = me?.role === 'admin'

    // Owned leads are the minority, so fetch only rows with an owner (paged —
    // PostgREST caps every response at ~1000 rows regardless of .limit()) and
    // head-count the rest. Counting from one capped scan silently undercounts.
    const PAGE = 1000
    const ownedRows: Array<{ owner_id: string; lead_stage: string | null }> = []
    for (let from = 0; from < 20000; from += PAGE) {
      const { data, error } = await supabase
        .from('all_leads')
        .select('owner_id, lead_stage')
        .not('owner_id', 'is', null)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) throw error
      ownedRows.push(...((data || []) as any))
      if (!data || data.length < PAGE) break
    }

    const [usersRes, totalRes] = await Promise.all([
      supabase
        .from('dashboard_users')
        .select('id, full_name, email, role, allowed_lead_types, last_login, is_active')
        .or('is_active.is.null,is_active.eq.true')
        .order('full_name', { ascending: true }),
      supabase
        .from('all_leads')
        .select('id', { count: 'exact', head: true }),
    ])

    if (usersRes.error) throw usersRes.error
    if (totalRes.error) throw totalRes.error

    const totalLeads = totalRes.count || 0
    const openPool = Math.max(0, totalLeads - ownedRows.length)

    // Aggregate owned counts + stage breakdown per owner.
    const byOwner: Record<string, { count: number; stages: Record<string, number> }> = {}
    for (const lead of ownedRows) {
      const bucket = byOwner[lead.owner_id] || (byOwner[lead.owner_id] = { count: 0, stages: {} })
      bucket.count++
      const stage = lead.lead_stage || 'New'
      bucket.stages[stage] = (bucket.stages[stage] || 0) + 1
    }

    const humans = (usersRes.data || []).map((u: any) => ({
      id: u.id,
      name: u.full_name || (u.email ? u.email.split('@')[0] : 'User'),
      email: u.email || null,
      role: u.role,
      allowedTypes: Array.isArray(u.allowed_lead_types) && u.allowed_lead_types.length > 0
        ? u.allowed_lead_types
        : null,
      ownedCount: byOwner[u.id]?.count || 0,
      stageBreakdown: byOwner[u.id]?.stages || {},
      lastActive: isAdmin ? u.last_login || null : null,
    }))

    return NextResponse.json({
      humans,
      openPool,
      totalLeads,
      isAdmin,
    })
  } catch (error: any) {
    console.error('[humans/overview] Error:', error?.message || error)
    return NextResponse.json({ error: 'Failed to load team overview' }, { status: 500 })
  }
}
