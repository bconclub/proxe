import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'
import { BRAND_ID } from '@/configs'

export const dynamic = 'force-dynamic'

/**
 * GET /api/dashboard/brain/overview
 *
 * The Brain's live vitals. Everything the neural hero + map need in ONE call:
 *  - taken_in:      knowledge, leads, notes, channels (what the brain ingested)
 *  - handling_now:  sequences, approvals, chats, in-flight, bookings, temps
 *  - stages:        pipeline distribution (Map badges)
 *  - activity:      a mixed real-time feed (leads / chats / stage moves / sends /
 *                   notes) that drives the region firing on the brain hero
 * Counts only — no model calls. Brand filter matches the decisions route
 * (brand + 'default') so legacy rows aren't invisible.
 */

const TERMINAL_TASK = new Set(['completed', 'cancelled', 'failed', 'error', 'failed_24h_window'])

function parseBookingIST(date: any, time: any): Date | null {
  if (!date) return null
  let hhmm = '12:00'
  const t = String(time || '').trim()
  const ampm = t.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i)
  if (ampm) {
    let h = parseInt(ampm[1], 10) % 12
    if (/p/i.test(ampm[3])) h += 12
    hhmm = `${String(h).padStart(2, '0')}:${ampm[2] || '00'}`
  } else if (/^\d{1,2}:\d{2}/.test(t)) {
    hhmm = t.slice(0, 5)
  }
  const d = new Date(`${String(date).slice(0, 10)}T${hhmm}:00+05:30`)
  return isNaN(d.getTime()) ? null : d
}

function bookingFromCtx(uc: any): { date: string | null; time: string | null } {
  const c = uc || {}
  for (const ch of ['web', 'whatsapp', 'voice', 'social']) {
    const b = c[ch] || {}
    const date = b.booking_date || b.booking?.date
    if (date) return { date, time: b.booking_time || b.booking?.time || null }
  }
  return { date: null, time: null }
}

type Event = { kind: 'lead' | 'chat_in' | 'chat_out' | 'stage' | 'send' | 'note'; label: string; detail: string; at: string }

export async function GET() {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getServiceClient() || authClient
    const brand = BRAND_ID
    const brands = [brand, 'default']

    const istDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    const istMidnightIso = new Date(`${istDate}T00:00:00+05:30`).toISOString()
    const now = Date.now()

    // ── Parallel fetches ─────────────────────────────────────────────────────
    const [kbRes, chatsTodayRes, tasksRes, leadsRes, convRes, stageRes, sendsRes] = await Promise.all([
      supabase.from('knowledge_base').select('id', { count: 'exact', head: true }).eq('brand', brand),
      supabase.from('conversations').select('id', { count: 'exact', head: true }).gte('created_at', istMidnightIso),
      supabase.from('agent_tasks').select('status').limit(5000),
      supabase.from('all_leads')
        .select('id, customer_name, lead_score, lead_stage, first_touchpoint, last_touchpoint, created_at, unified_context')
        .in('brand', brands)
        .order('created_at', { ascending: false })
        .limit(2000),
      supabase.from('conversations')
        .select('lead_id, sender, channel, content, created_at')
        .order('created_at', { ascending: false })
        .limit(40),
      supabase.from('lead_stage_changes')
        .select('lead_id, old_stage, new_stage, created_at')
        .gte('created_at', istMidnightIso)
        .order('created_at', { ascending: false })
        .limit(25),
      supabase.from('agent_tasks')
        .select('task_type, lead_name, completed_at, status')
        .in('status', ['completed'])
        .gte('completed_at', istMidnightIso)
        .order('completed_at', { ascending: false })
        .limit(25),
    ])

    const leads = leadsRes.data || []
    const nameOf = new Map(leads.map((l: any) => [l.id, l.customer_name || 'Lead']))

    // ── Task states ──────────────────────────────────────────────────────────
    let activeSequences = 0, queuedApprovals = 0
    for (const t of (tasksRes.data || []) as any[]) {
      const s = String(t.status || '').toLowerCase()
      if (s === 'queued' || s === 'awaiting_approval') queuedApprovals++
      if (!TERMINAL_TASK.has(s) && s !== 'paused') activeSequences++
    }

    // ── Leads: distributions, temps, in-flight, bookings, notes ─────────────
    const channels: Record<string, number> = {}
    const stages: Record<string, number> = {}
    let hot = 0, warm = 0, cold = 0, inFlight = 0, bookingsUpcoming = 0
    let notesTotal = 0, notesToday = 0, leadsToday = 0
    const noteEvents: Event[] = []

    for (const l of leads as any[]) {
      const src = l.first_touchpoint || l.last_touchpoint || 'unknown'
      channels[src] = (channels[src] || 0) + 1
      const stage = String(l.lead_stage || 'New')
      stages[stage] = (stages[stage] || 0) + 1
      const score = l.lead_score ?? null
      if (score != null) { if (score >= 70) hot++; else if (score >= 40) warm++; else cold++ }
      if (!/^(won|lost|closed|dead|unsubscribed)$/i.test(stage)) inFlight++
      if (l.created_at && l.created_at >= istMidnightIso) leadsToday++
      const b = bookingFromCtx(l.unified_context)
      const dt = parseBookingIST(b.date, b.time)
      if (dt && dt.getTime() >= now) bookingsUpcoming++
      const notes = l.unified_context?.admin_notes
      if (Array.isArray(notes)) {
        notesTotal += notes.length
        for (const n of notes) {
          const at = n?.at || n?.created_at || ''
          if (at && at >= istMidnightIso) {
            notesToday++
            if (noteEvents.length < 6) noteEvents.push({
              kind: 'note', label: l.customer_name || 'Lead',
              detail: String(n?.note || n?.text || 'note').slice(0, 60), at,
            })
          }
        }
      }
    }

    // ── Mixed activity feed (drives the region firing) ───────────────────────
    const events: Event[] = []
    for (const l of (leads as any[]).slice(0, 60)) {
      if (l.created_at && l.created_at >= istMidnightIso) {
        events.push({ kind: 'lead', label: l.customer_name || 'New lead', detail: `arrived via ${l.first_touchpoint || 'web'}`, at: l.created_at })
      }
    }
    for (const c of (convRes.data || []) as any[]) {
      const isCustomer = String(c.sender || '').toLowerCase() === 'customer' || String(c.sender || '').toLowerCase() === 'user'
      events.push({
        kind: isCustomer ? 'chat_in' : 'chat_out',
        label: nameOf.get(c.lead_id) || 'Visitor',
        detail: `${isCustomer ? 'said' : 'PROXe'}: ${String(c.content || '').replace(/\s+/g, ' ').slice(0, 60)}`,
        at: c.created_at,
      })
    }
    for (const s of (stageRes.data || []) as any[]) {
      events.push({ kind: 'stage', label: nameOf.get(s.lead_id) || 'Lead', detail: `${s.old_stage || 'New'} → ${s.new_stage}`, at: s.created_at })
    }
    for (const s of (sendsRes.data || []) as any[]) {
      events.push({ kind: 'send', label: s.lead_name || 'Lead', detail: String(s.task_type || 'send').replace(/_/g, ' '), at: s.completed_at })
    }
    events.push(...noteEvents)
    events.sort((a, b) => (b.at || '').localeCompare(a.at || ''))

    return NextResponse.json({
      brand,
      today_ist: istDate,
      generated_at: new Date().toISOString(),
      taken_in: {
        kb_items: kbRes.count ?? 0,
        leads_total: leads.length,
        leads_today: leadsToday,
        notes_total: notesTotal,
        notes_today: notesToday,
        channels,
      },
      handling_now: {
        active_sequences: activeSequences,
        queued_approvals: queuedApprovals,
        chats_today: chatsTodayRes.count ?? 0,
        leads_in_flight: inFlight,
        bookings_upcoming: bookingsUpcoming,
        hot, warm, cold,
      },
      stages,
      activity: events.slice(0, 30),
    })
  } catch (err) {
    console.error('[brain/overview] Error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
