import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'
import { getLeadAccess, canSeeLead } from '@/lib/services/leadAccess'

export const dynamic = 'force-dynamic'

/**
 * GET /api/dashboard/alerts?since=<iso>
 *
 * The LIVE feed behind the sidebar bell: things that just happened and that a
 * human should hear about while the tab is open.
 *
 *   - lead    : a row landed in all_leads
 *   - message : an inbound (sender='customer') row landed in conversations
 *
 * Deliberately NOT the same thing as /api/dashboard/notifications, which
 * replays lead_stage_changes for the activity feed. This route answers one
 * question only - "what is new since <since>" - so the client can ping a sound
 * and bump an unread badge without re-diffing a 30-item history every poll.
 *
 * `since` is required-ish: with no `since` the route returns an empty list plus
 * the server clock, so a fresh tab establishes its baseline without a burst of
 * alerts for everything that happened while nobody was looking.
 *
 * Auth: logged-in session. Reads use service-role (consistent with the other
 * dashboard reads that join across tables), then results are filtered through
 * features.leadAccess so a restricted user is never pinged about a lead type
 * they cannot open.
 */

export type DashboardAlert = {
  id: string
  kind: 'lead' | 'message'
  leadId: string | null
  leadName: string
  /** one-line body for the drawer row */
  content: string
  channel: string
  timestamp: string
}

// Hard cap per poll. A quiet tab sees 0-2; a burst (bulk import, ad spike) is
// truncated rather than firing dozens of sounds and a giant payload.
const MAX_PER_KIND = 15

function labelChannel(raw: string | null | undefined): string {
  const c = (raw || '').toLowerCase()
  if (c.includes('whatsapp')) return 'WhatsApp'
  if (c.includes('web')) return 'Web'
  if (c.includes('voice') || c.includes('call')) return 'Call'
  if (c.includes('facebook') || c.includes('instagram') || c.includes('meta')) return 'Meta'
  return raw || 'Web'
}

export async function GET(request: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const now = new Date().toISOString()
    const sinceRaw = request.nextUrl.searchParams.get('since')
    const since = sinceRaw && !Number.isNaN(Date.parse(sinceRaw)) ? new Date(sinceRaw).toISOString() : null

    // First poll of a tab: hand back the clock, no backlog.
    if (!since) return NextResponse.json({ alerts: [], now })

    // `any` on purpose: the generated Database types make the service client a
    // union whose .from() overloads don't unify (same reason founder-metrics and
    // the other cross-table dashboard reads do this).
    const supabase: any = getServiceClient() || authClient
    const access = await getLeadAccess(supabase, user.id)
    const alerts: DashboardAlert[] = []

    // New leads. unified_context comes along because leadAccess needs it to
    // decide whether a restricted user may see this lead at all.
    try {
      const { data: leads } = await supabase
        .from('all_leads')
        .select('id, customer_name, first_touchpoint, last_touchpoint, created_at, unified_context')
        .gt('created_at', since)
        .order('created_at', { ascending: false })
        .limit(MAX_PER_KIND)

      for (const l of leads || []) {
        if (!canSeeLead(access, l)) continue
        const name = l.customer_name || 'New lead'
        alerts.push({
          id: `lead-${l.id}`,
          kind: 'lead',
          leadId: l.id,
          leadName: name,
          content: `${name} came in`,
          channel: labelChannel(l.first_touchpoint || l.last_touchpoint),
          timestamp: l.created_at,
        })
      }
    } catch (e) {
      console.error('[alerts] leads:', (e as Error).message)
    }

    // Inbound messages. sender='customer' is the inbound marker across every
    // channel (see the inbox thread renderer, which splits on the same value).
    try {
      const { data: msgs } = await supabase
        .from('conversations')
        .select('id, lead_id, channel, content, created_at')
        .eq('sender', 'customer')
        .gt('created_at', since)
        .order('created_at', { ascending: false })
        .limit(MAX_PER_KIND)

      const rows = msgs || []
      // Resolve sender names in one query; anonymous web chats have no lead yet.
      const leadIds = Array.from(new Set(rows.map((m: any) => m.lead_id).filter(Boolean)))
      const nameMap = new Map<string, any>()
      if (leadIds.length > 0) {
        const { data: leads } = await supabase
          .from('all_leads')
          .select('id, customer_name, unified_context')
          .in('id', leadIds)
        for (const l of leads || []) nameMap.set(l.id, l)
      }

      for (const m of rows) {
        const lead = m.lead_id ? nameMap.get(m.lead_id) : null
        // A message on a lead this user cannot see must not ping them either.
        if (lead && !canSeeLead(access, lead)) continue
        const name = lead?.customer_name || 'Website visitor'
        const body = String(m.content || '').replace(/\s+/g, ' ').trim()
        alerts.push({
          id: `msg-${m.id}`,
          kind: 'message',
          leadId: m.lead_id || null,
          leadName: name,
          content: body ? `${name}: ${body.slice(0, 90)}${body.length > 90 ? '...' : ''}` : `${name} sent a message`,
          channel: labelChannel(m.channel),
          timestamp: m.created_at,
        })
      }
    } catch (e) {
      console.error('[alerts] messages:', (e as Error).message)
    }

    alerts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    return NextResponse.json({ alerts, now })
  } catch (error: any) {
    console.error('[alerts] Error:', error?.message || error)
    // Soft-fail: a broken poll must never break the dashboard shell.
    return NextResponse.json({ alerts: [], now: new Date().toISOString() })
  }
}
