/**
 * Learning readout — rolls up the decision_log records the log-call hub writes
 * into unified_context.decision_log on each lead. This is where we watch the
 * brain learn: how often its proposal matched the human, what humans actually
 * chose, and the patterns by lead context ("this kind of lead → humans did X").
 *
 * GET → { total, matchRate, byAction, byStageAction, recent }
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'
import { BRAND_ID } from '@/configs'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getServiceClient() || authClient
    const { data: leads, error } = await supabase
      .from('all_leads')
      .select('id, customer_name, unified_context')
      .in('brand', [BRAND_ID, 'default'])
      .limit(2000)
    if (error) throw error

    type Entry = {
      lead_id: string; lead_name: string; at: string
      ai_action: string; human_action: string; matched: boolean
      reason: string | null; stage: string | null; intent: string | null
    }
    const entries: Entry[] = []
    for (const l of leads || []) {
      const log = l.unified_context?.decision_log
      if (!Array.isArray(log)) continue
      for (const d of log) {
        entries.push({
          lead_id: l.id,
          lead_name: l.customer_name || 'Lead',
          at: d.at || '',
          ai_action: d.ai_proposed_plan?.action || 'none',
          human_action: d.human_decision?.action || 'none',
          matched: !!d.agreement?.matched,
          reason: d.human_decision?.reason || null,
          stage: d.context_snapshot?.stage || null,
          intent: d.context_snapshot?.service_interest || null,
        })
      }
    }

    entries.sort((a, b) => (b.at || '').localeCompare(a.at || ''))

    const total = entries.length
    const matched = entries.filter((e) => e.matched).length
    const matchRate = total ? Math.round((matched / total) * 100) : 0

    const byAction: Record<string, number> = {}
    for (const e of entries) byAction[e.human_action] = (byAction[e.human_action] || 0) + 1

    // Pattern: for each lead stage, what did humans most often choose?
    const stageMap: Record<string, Record<string, number>> = {}
    for (const e of entries) {
      const s = e.stage || 'unknown'
      stageMap[s] = stageMap[s] || {}
      stageMap[s][e.human_action] = (stageMap[s][e.human_action] || 0) + 1
    }
    const byStageAction = Object.entries(stageMap).map(([stage, actions]) => {
      const top = Object.entries(actions).sort((a, b) => b[1] - a[1])[0]
      const count = Object.values(actions).reduce((x, y) => x + y, 0)
      return { stage, count, top_action: top?.[0] || 'none', top_count: top?.[1] || 0 }
    }).sort((a, b) => b.count - a.count)

    return NextResponse.json({ total, matchRate, byAction, byStageAction, recent: entries.slice(0, 25) })
  } catch (err) {
    console.error('[brain/decisions] Error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
