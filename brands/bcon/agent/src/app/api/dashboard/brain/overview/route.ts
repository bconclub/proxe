import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'
import { BRAND_ID } from '@/configs'

export const dynamic = 'force-dynamic'

/**
 * GET /api/dashboard/brain/overview
 *
 * Live snapshot for the Brain landing (the neural map): what the brain has
 * TAKEN IN (knowledge, leads, channels) and what it is HANDLING NOW (active
 * sequences, chats today, leads in flight, bookings upcoming). Pure counts,
 * no model call — the map lights its nodes from these numbers.
 */

// Terminal task states — everything else counts as an active sequence.
const TERMINAL_TASK = new Set(['completed', 'cancelled', 'failed', 'paused', 'error'])

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

export async function GET() {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getServiceClient() || authClient
    const brand = BRAND_ID

    const istDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    const istMidnight = new Date(`${istDate}T00:00:00+05:30`).getTime()
    const now = Date.now()

    // ── Knowledge taken in ──────────────────────────────────────────────────
    const { count: kbItems } = await supabase
      .from('knowledge_base')
      .select('id', { count: 'exact', head: true })
      .eq('brand', brand)

    // ── Chats today ─────────────────────────────────────────────────────────
    const { count: chatsToday } = await supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', new Date(istMidnight).toISOString())

    // ── Active sequences (non-terminal agent_tasks) ─────────────────────────
    let activeSequences = 0
    try {
      const { data: tasks } = await supabase
        .from('agent_tasks')
        .select('status')
        .limit(5000)
      activeSequences = (tasks || []).filter((t: any) => !TERMINAL_TASK.has(String(t.status || '').toLowerCase())).length
    } catch { /* table shape differs — leave 0 */ }

    // ── Leads: totals, temperature, channels, in-flight, upcoming bookings ──
    const { data: leads } = await supabase
      .from('all_leads')
      .select('lead_score, lead_stage, first_touchpoint, last_touchpoint, unified_context')
      .eq('brand', brand)
      .limit(4000)

    const safe = leads || []
    const channels: Record<string, number> = {}
    let hot = 0, warm = 0, cold = 0, inFlight = 0, bookingsUpcoming = 0
    for (const l of safe) {
      const src = l.first_touchpoint || l.last_touchpoint || 'unknown'
      channels[src] = (channels[src] || 0) + 1
      const score = l.lead_score ?? null
      if (score != null) { if (score >= 70) hot++; else if (score >= 40) warm++; else cold++ }
      const stage = String(l.lead_stage || 'New')
      if (!/^(won|lost|closed|dead|unsubscribed)$/i.test(stage)) inFlight++
      const b = bookingFromCtx(l.unified_context)
      const dt = parseBookingIST(b.date, b.time)
      if (dt && dt.getTime() >= now) bookingsUpcoming++
    }

    return NextResponse.json({
      brand,
      today_ist: istDate,
      taken_in: {
        kb_items: kbItems ?? 0,
        leads_total: safe.length,
        channels,
      },
      handling_now: {
        active_sequences: activeSequences,
        chats_today: chatsToday ?? 0,
        leads_in_flight: inFlight,
        bookings_upcoming: bookingsUpcoming,
        hot, warm, cold,
      },
    })
  } catch (err) {
    console.error('[brain/overview] Error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
