import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, getClient } from '@/lib/services'

export const dynamic = 'force-dynamic'

// ── Flow definitions ──────────────────────────────────────────────

interface StepDef { name: string; taskTypes: string[] }
interface FlowDef {
  id: string
  name: string
  steps: StepDef[]
}

const FLOW_CONFIG: FlowDef[] = [
  {
    id: 'new_lead_outreach',
    name: 'New Lead Outreach',
    steps: [
      { name: 'First Outreach', taskTypes: ['first_outreach'] },
      { name: 'Nudge / Push to Book', taskTypes: ['nudge_waiting', 'push_to_book'] },
    ],
  },
  {
    id: 'active_conversation',
    name: 'Active Conversation',
    steps: [{ name: 'Active Chat', taskTypes: [] }],
  },
  {
    id: 'booking_made',
    name: 'Booking Made',
    steps: [
      { name: '24h Reminder', taskTypes: ['booking_reminder_24h'] },
      { name: '30m Reminder', taskTypes: ['booking_reminder_30m'] },
      { name: 'Post-Booking Confirmation', taskTypes: ['post_booking_confirmation'] },
    ],
  },
  {
    id: 'post_call',
    name: 'Post Call',
    steps: [{ name: 'Post-Call Follow-up', taskTypes: ['post_call_followup'] }],
  },
  {
    id: 'rnr',
    name: 'RNR (Rang No Response)',
    steps: [
      { name: 'Missed Call Message', taskTypes: ['missed_call_followup'] },
      { name: 'Day 1 Follow-up', taskTypes: ['follow_up_day1'] },
      { name: 'Day 3 Follow-up', taskTypes: ['follow_up_day3'] },
      { name: 'Day 5 (Goes Cold)', taskTypes: ['follow_up_day5'] },
      { name: 'Day 7 Final', taskTypes: ['re_engage'] },
    ],
  },
  {
    id: 'follow_up_sequence',
    name: 'Follow-Up Sequence',
    steps: [
      { name: 'Day 1 Follow-up', taskTypes: ['follow_up_day1'] },
      { name: 'Day 3 Follow-up', taskTypes: ['follow_up_day3'] },
      { name: 'Day 5 Follow-up', taskTypes: ['follow_up_day5'] },
      { name: 'Re-engage', taskTypes: ['re_engage'] },
    ],
  },
  {
    id: 're_engagement',
    name: 'Re-Engagement',
    steps: [{ name: 'Re-engagement Message', taskTypes: ['re_engage'] }],
  },
  {
    id: 'morning_briefing',
    name: 'Morning Briefing',
    steps: [{ name: 'Daily Briefing', taskTypes: ['morning_briefing'] }],
  },
]

function determineFlow(task: any): string | null {
  const seq = task.metadata?.sequence
  const type = task.task_type

  if (seq === 'first_outreach' || type === 'first_outreach') return 'new_lead_outreach'
  if (seq === 'no_show') return 'rnr'
  if (seq === 'no_response') return 'follow_up_sequence'
  if (seq === 'post_call' || type === 'post_call_followup') return 'post_call'
  if (['booking_reminder_24h', 'booking_reminder_30m', 'post_booking_confirmation'].includes(type)) return 'booking_made'
  if (type === 'nudge_waiting' || type === 'push_to_book') return 'new_lead_outreach'
  if (type === 're_engage' && !seq) return 're_engagement'
  if (type === 'morning_briefing') return 'morning_briefing'
  return null
}

// ── GET handler ───────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const supabase = getServiceClient() || getClient()
    if (!supabase) {
      return NextResponse.json({ error: 'No database connection' }, { status: 500 })
    }

    const flowId = request.nextUrl.searchParams.get('flow')
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    // 1. Fetch active + recent tasks
    const [pendingRes, historyRes] = await Promise.all([
      supabase.from('agent_tasks').select('*')
        .in('status', ['pending', 'queued', 'in_queue'])
        .order('scheduled_at', { ascending: true })
        .limit(500),
      supabase.from('agent_tasks').select('*')
        .in('status', ['completed', 'failed', 'failed_24h_window', 'cancelled'])
        .gte('completed_at', thirtyDaysAgo)
        .order('completed_at', { ascending: false })
        .limit(500),
    ])

    const allTasks = [...(pendingRes.data || []), ...(historyRes.data || [])]

    // 2. Group tasks → flow → lead
    const flowLeads = new Map<string, Map<string, any[]>>()

    for (const task of allTasks) {
      if (!task.lead_id) continue
      const fid = determineFlow(task)
      if (!fid) continue
      if (!flowLeads.has(fid)) flowLeads.set(fid, new Map())
      const leadMap = flowLeads.get(fid)!
      if (!leadMap.has(task.lead_id)) leadMap.set(task.lead_id, [])
      leadMap.get(task.lead_id)!.push(task)
    }

    // 3. Active conversation leads (recent activity, not in a sequence)
    const leadsWithPendingTasks = new Set<string>()
    for (const task of allTasks) {
      if (task.lead_id && ['pending', 'queued', 'in_queue'].includes(task.status)) {
        leadsWithPendingTasks.add(task.lead_id)
      }
    }

    const { data: recentLeads } = await supabase
      .from('all_leads')
      .select('id, customer_name, customer_phone_normalized, phone, last_interaction_at')
      .gt('last_interaction_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
      .limit(200)

    const activeConvoLeads = (recentLeads || []).filter((l: any) => !leadsWithPendingTasks.has(l.id))

    // 4. Detect responses (customer message after flow entry)
    const allLeadIds = new Set<string>()
    for (const [, lm] of flowLeads) for (const lid of lm.keys()) allLeadIds.add(lid)

    const respondedLeads = new Set<string>()
    if (allLeadIds.size > 0) {
      const { data: responses } = await supabase
        .from('conversations')
        .select('lead_id, created_at')
        .in('lead_id', Array.from(allLeadIds).slice(0, 200))
        .eq('sender', 'customer')
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false })

      if (responses) {
        const latestResponse = new Map<string, string>()
        for (const r of responses) {
          if (!latestResponse.has(r.lead_id)) latestResponse.set(r.lead_id, r.created_at)
        }
        for (const [, lm] of flowLeads) {
          for (const [lid, tasks] of lm) {
            const earliest = tasks.reduce((m: any, t: any) =>
              !m || new Date(t.created_at) < new Date(m.created_at) ? t : m, null as any)
            const resp = latestResponse.get(lid)
            if (resp && earliest && new Date(resp) > new Date(earliest.created_at)) {
              respondedLeads.add(lid)
            }
          }
        }
      }
    }

    // 5. Build flow overview
    const flows = FLOW_CONFIG.map(fc => {
      const leadMap = flowLeads.get(fc.id)
      const isActive = fc.id === 'active_conversation'
      const leadCount = isActive ? activeConvoLeads.length : (leadMap?.size || 0)

      let lastActivity: string | null = null
      let respondedCount = 0
      if (leadMap) {
        for (const [lid, tasks] of leadMap) {
          if (respondedLeads.has(lid)) respondedCount++
          for (const t of tasks) {
            const time = t.completed_at || t.scheduled_at || t.created_at
            if (time && (!lastActivity || new Date(time) > new Date(lastActivity))) lastActivity = time
          }
        }
      }
      if (isActive && activeConvoLeads.length > 0) {
        respondedCount = activeConvoLeads.length
        const latest = activeConvoLeads.reduce((m: any, l: any) =>
          !m || new Date(l.last_interaction_at) > new Date(m.last_interaction_at) ? l : m, null as any)
        lastActivity = latest?.last_interaction_at || null
      }

      const total = leadMap?.size || (isActive ? activeConvoLeads.length : 0)
      return {
        id: fc.id,
        name: fc.name,
        leadCount,
        lastActivity,
        successRate: total > 0 ? Math.round((respondedCount / total) * 100) : 0,
        respondedCount,
        steps: fc.steps.map((s, i) => ({ name: s.name, order: i })),
      }
    })

    // 6. Board data for a specific flow
    let board = null
    if (flowId) {
      const fc = FLOW_CONFIG.find(f => f.id === flowId)
      if (fc) {
        if (flowId === 'active_conversation') {
          board = {
            flowId,
            steps: [{
              name: 'Active Chat',
              order: 0,
              leads: activeConvoLeads.map((l: any) => ({
                lead_id: l.id,
                lead_name: l.customer_name || 'Unknown',
                lead_phone: l.customer_phone_normalized || l.phone || '',
                task_id: null,
                status: 'active',
                scheduled_at: null,
                completed_at: l.last_interaction_at,
                responded: true,
                all_task_ids: [],
              })),
            }],
          }
        } else {
          const leadMap = flowLeads.get(flowId) || new Map()
          board = {
            flowId,
            steps: fc.steps.map((step, si) => {
              const leadsInStep: any[] = []
              for (const [lid, tasks] of leadMap) {
                // Determine current step for this lead
                const pending = tasks.filter((t: any) => ['pending', 'queued'].includes(t.status))
                  .sort((a: any, b: any) => new Date(a.scheduled_at || a.created_at).getTime() - new Date(b.scheduled_at || b.created_at).getTime())
                const completed = tasks.filter((t: any) => t.status === 'completed')
                  .sort((a: any, b: any) => new Date(b.completed_at || b.created_at).getTime() - new Date(a.completed_at || a.created_at).getTime())

                let currentIdx = -1
                if (pending.length > 0) {
                  currentIdx = fc.steps.findIndex(s => s.taskTypes.includes(pending[0].task_type))
                } else if (completed.length > 0) {
                  currentIdx = fc.steps.findIndex(s => s.taskTypes.includes(completed[0].task_type))
                }
                if (currentIdx !== si) continue

                const stepTask = tasks.find((t: any) => step.taskTypes.includes(t.task_type)) || pending[0] || completed[0]
                if (!stepTask) continue

                leadsInStep.push({
                  lead_id: lid,
                  lead_name: stepTask.lead_name || 'Unknown',
                  lead_phone: stepTask.lead_phone || '',
                  task_id: stepTask.id,
                  status: respondedLeads.has(lid) ? 'responded' : stepTask.status,
                  scheduled_at: stepTask.scheduled_at,
                  completed_at: stepTask.completed_at,
                  responded: respondedLeads.has(lid),
                  all_task_ids: tasks.map((t: any) => t.id),
                })
              }
              return { name: step.name, order: si, leads: leadsInStep }
            }),
          }
        }
      }
    }

    return NextResponse.json({ flows, board })
  } catch (error) {
    console.error('[flows/route] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch flows', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
