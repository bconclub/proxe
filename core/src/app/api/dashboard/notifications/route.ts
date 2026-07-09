import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'
import { BRAND_ID } from '@/configs'

export const dynamic = 'force-dynamic'

/**
 * GET /api/dashboard/notifications
 *
 * Lightweight feed of lead status-change events for the site-wide notification
 * bell + toasts. This is the same set of events the dashboard's old "Recent
 * Activity" card showed, sourced from lead_stage_changes:
 *   - new_lead_scored : a lead's first stage assignment (old_stage is null)
 *   - stage_change    : a lead moved between stages (incl. → Booking Made)
 *   - score_change    : a lead's score jumped/dropped by ≥20
 *
 * Bookings surface as the "Booking Made" stage transition; the Upcoming Events
 * card still lists the bookings themselves.
 *
 * Auth: logged-in session. Read uses service-role (consistent with other
 * dashboard reads that join across tables).
 */
export type NotificationEvent = {
  id: string
  leadId: string
  leadName: string
  type: 'stage_change' | 'new_lead_scored' | 'score_change' | 'directive' | 'signal' | 'event'
  content: string
  channel: string
  timestamp: string
  metadata?: Record<string, any>
}

/**
 * POP feed — campaign-level SIGNALS, not per-lead stage churn. At thousands of
 * leads/day the "X entered Qualified" stream is noise; a war room wants the
 * relevant stuff coming in: new directives, external Listen signals (crisis /
 * opposition / positive), and upcoming events. Only POP takes this branch.
 */
async function popSignalEvents(supabase: any): Promise<NotificationEvent[]> {
  const events: NotificationEvent[] = []
  const since = new Date(Date.now() - 3 * 86400000).toISOString()

  // Directives from the leader app / AI — the "what to do now" feed.
  try {
    const { data: recos } = await supabase
      .from('campaign_recommendations')
      .select('id, title, source, constituency, status, created_at')
      .order('created_at', { ascending: false })
      .limit(12)
    for (const r of recos || []) {
      const ai = r.source === 'ai'
      events.push({
        id: `dir-${r.id}`, leadId: '', leadName: '',
        type: 'directive',
        content: `${ai ? 'AI suggests' : 'Leader directive'}: ${r.title}${r.constituency ? ` · ${r.constituency}` : ''}`,
        channel: 'directive', timestamp: r.created_at,
        metadata: { kind: ai ? 'ai' : 'leader', status: r.status },
      })
    }
  } catch (e) { console.error('[notifications:pop] directives:', (e as Error).message) }

  // External signals (Listen): crises, opposition attacks, positive coverage.
  try {
    const { data: sigs } = await supabase
      .from('listen_signals')
      .select('id, content, source, issue_category, constituency, is_crisis, is_opposition, is_positive, created_at')
      .gte('created_at', since)
      .or('is_crisis.eq.true,is_opposition.eq.true,is_positive.eq.true')
      .order('created_at', { ascending: false })
      .limit(20)
    for (const s of sigs || []) {
      const kind = s.is_crisis ? 'crisis' : s.is_opposition ? 'opposition' : 'positive'
      const lead = kind === 'crisis' ? 'Crisis' : kind === 'opposition' ? 'Opposition' : 'Positive'
      events.push({
        id: `sig-${s.id}`, leadId: '', leadName: '',
        type: 'signal',
        content: `${lead}: ${(s.content || '').slice(0, 90)}${s.constituency ? ` · ${s.constituency}` : ''}`,
        channel: s.source || 'listen', timestamp: s.created_at,
        metadata: { kind, category: s.issue_category, source: s.source },
      })
    }
  } catch (e) { console.error('[notifications:pop] signals:', (e as Error).message) }

  // Upcoming / live campaign events.
  try {
    const { data: evs } = await supabase
      .from('campaign_events')
      .select('id, title, constituency, event_date, status')
      .in('status', ['planned', 'live'])
      .order('event_date', { ascending: false })
      .limit(6)
    for (const e of evs || []) {
      events.push({
        id: `evt-${e.id}`, leadId: '', leadName: '',
        type: 'event',
        content: `Event: ${e.title}${e.constituency ? ` · ${e.constituency}` : ''}`,
        channel: 'event', timestamp: e.event_date || new Date().toISOString(),
        metadata: { kind: 'event', status: e.status },
      })
    }
  } catch (e) { console.error('[notifications:pop] events:', (e as Error).message) }

  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  return events.slice(0, 30)
}

export async function GET(_request: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServiceClient() || authClient

    // POP: campaign signals, not lead-stage churn.
    if (BRAND_ID === 'pop') {
      return NextResponse.json({ events: await popSignalEvents(supabase) })
    }

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

    // Stage changes + new-lead-scored (mirror founder-metrics wording).
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
    console.error('[notifications] Error:', error?.message || error)
    return NextResponse.json({ events: [] })
  }
}
