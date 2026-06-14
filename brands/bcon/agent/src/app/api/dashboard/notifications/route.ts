import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'

export const dynamic = 'force-dynamic'

/**
 * GET /api/dashboard/notifications
 *
 * Lightweight feed of lead status-change events for the site-wide notification
 * bell + toasts, sourced from lead_stage_changes:
 *   - new_lead_scored : a lead's first stage assignment (old_stage is null)
 *   - stage_change    : a lead moved between stages (incl. → Booking Made)
 *   - score_change    : a lead's score jumped/dropped by ≥20
 *
 * Auth: logged-in session. Read uses service-role (consistent with other
 * dashboard reads).
 */
export type NotificationEvent = {
  id: string
  leadId: string
  leadName: string
  type: 'stage_change' | 'new_lead_scored' | 'score_change'
  content: string
  channel: string
  timestamp: string
  metadata?: Record<string, any>
}

export async function GET(_request: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServiceClient() || authClient

    // Most recent stage transitions (desc — newest first).
    const { data: changes, error: changesErr } = await supabase
      .from('lead_stage_changes')
      .select('lead_id, old_stage, new_stage, new_score, created_at')
      .order('created_at', { ascending: false })
      .limit(60)

    if (changesErr) {
      console.error('[notifications] stage changes query failed:', changesErr.message)
      return NextResponse.json({ events: [] })
    }

    const rows = changes || []
    if (rows.length === 0) {
      return NextResponse.json({ events: [] })
    }

    // Resolve lead names/channels in one query.
    const leadIds = Array.from(new Set(rows.map((r: any) => r.lead_id).filter(Boolean)))
    const { data: leads } = await supabase
      .from('all_leads')
      .select('id, customer_name, first_touchpoint, last_touchpoint')
      .in('id', leadIds)

    const leadMap = new Map<string, any>()
    for (const l of leads || []) leadMap.set(l.id, l)

    const events: NotificationEvent[] = []

    // Stage changes + new-lead-scored.
    rows.forEach((change: any) => {
      const lead = leadMap.get(change.lead_id)
      if (!lead) return
      if (change.old_stage === change.new_stage) return
      const name = lead.customer_name || 'A lead'
      const channel = lead.first_touchpoint || lead.last_touchpoint || 'web'
      events.push({
        id: `stage-${change.lead_id}-${change.created_at}`,
        leadId: change.lead_id,
        leadName: name,
        type: change.old_stage ? 'stage_change' : 'new_lead_scored',
        content: change.old_stage
          ? `${name} entered ${change.new_stage} stage (from ${change.old_stage})`
          : `${name} scored ${change.new_score || 0} — entered ${change.new_stage} stage`,
        channel,
        timestamp: change.created_at,
        metadata: { oldStage: change.old_stage, newStage: change.new_stage, score: change.new_score },
      })
    })

    // Score jumps — compare consecutive entries for the same lead (rows are
    // newest-first, so the NEXT row is the older score). ≥20 points = notable.
    rows.forEach((change: any, index: number) => {
      if (change.new_score == null || index >= rows.length - 1) return
      const prev = rows[index + 1]
      if (prev.lead_id !== change.lead_id || prev.new_score == null) return
      const diff = change.new_score - prev.new_score
      if (Math.abs(diff) < 20) return
      const lead = leadMap.get(change.lead_id)
      if (!lead) return
      const name = lead.customer_name || 'A lead'
      events.push({
        id: `score-${change.lead_id}-${change.created_at}`,
        leadId: change.lead_id,
        leadName: name,
        type: 'score_change',
        content: `${name}'s score ${diff > 0 ? 'jumped' : 'dropped'} ${prev.new_score} → ${change.new_score}`,
        channel: lead.first_touchpoint || lead.last_touchpoint || 'web',
        timestamp: change.created_at,
        metadata: { oldScore: prev.new_score, newScore: change.new_score, scoreDiff: diff },
      })
    })

    // Newest first, cap the payload.
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    return NextResponse.json({ events: events.slice(0, 30) })
  } catch (error: any) {
    console.error('[notifications] error:', error?.message || error)
    return NextResponse.json({ events: [] })
  }
}
