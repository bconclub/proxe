import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'
import { BRAND_ID } from '@/configs'

export const dynamic = 'force-dynamic'

/**
 * GET /api/dashboard/brain/region?id=<region>
 *
 * The drill-down behind a click on the brain: the ACTUAL contents of that
 * region right now — real leads, real chats, real sequences, real KB items —
 * not counts. Max ~8 items each, newest first.
 *
 * Regions: intake · conversation · decisions · scoring · memory · timing · output
 */

type Item = { title: string; sub: string; at?: string | null }

function parseBookingIST(date: any, time: any): Date | null {
  if (!date) return null
  let hhmm = '12:00'
  const t = String(time || '').trim()
  const ampm = t.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i)
  if (ampm) {
    let h = parseInt(ampm[1], 10) % 12
    if (/p/i.test(ampm[3])) h += 12
    hhmm = `${String(h).padStart(2, '0')}:${ampm[2] || '00'}`
  } else if (/^\d{1,2}:\d{2}/.test(t)) hhmm = t.slice(0, 5)
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

export async function GET(req: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getServiceClient() || authClient
    const brands = [BRAND_ID, 'default']
    const id = req.nextUrl.searchParams.get('id') || ''
    const items: Item[] = []

    if (id === 'intake') {
      const { data } = await supabase
        .from('all_leads')
        .select('customer_name, first_touchpoint, created_at')
        .in('brand', brands)
        .order('created_at', { ascending: false })
        .limit(8)
      for (const l of data || []) items.push({ title: l.customer_name || 'Lead', sub: `via ${l.first_touchpoint || 'web'}`, at: l.created_at })
    } else if (id === 'conversation') {
      const { data } = await supabase
        .from('conversations')
        .select('lead_id, sender, channel, content, created_at')
        .order('created_at', { ascending: false })
        .limit(30)
      const leadIds = Array.from(new Set((data || []).map((c: any) => c.lead_id).filter(Boolean)))
      const { data: leads } = leadIds.length
        ? await supabase.from('all_leads').select('id, customer_name').in('id', leadIds.slice(0, 20))
        : { data: [] as any[] }
      const nameOf = new Map((leads || []).map((l: any) => [l.id, l.customer_name || 'Lead']))
      const seen = new Set<string>()
      for (const c of data || []) {
        if (!c.lead_id || seen.has(c.lead_id)) continue
        seen.add(c.lead_id)
        const who = String(c.sender || '').toLowerCase() === 'customer' ? '' : 'PROXe: '
        items.push({ title: `${nameOf.get(c.lead_id) || 'Visitor'} · ${c.channel || 'web'}`, sub: `${who}${String(c.content || '').replace(/\s+/g, ' ').slice(0, 70)}`, at: c.created_at })
        if (items.length >= 8) break
      }
    } else if (id === 'decisions') {
      const { data } = await supabase
        .from('agent_tasks')
        .select('lead_name, task_type, scheduled_at, status, metadata')
        .in('status', ['pending', 'queued', 'awaiting_approval'])
        .order('scheduled_at', { ascending: true })
        .limit(8)
      for (const t of data || []) {
        const seq = t.metadata?.sequence ? ` · ${t.metadata.sequence} seq` : ''
        items.push({ title: t.lead_name || 'Lead', sub: `${String(t.task_type || '').replace(/_/g, ' ')}${seq} (${t.status})`, at: t.scheduled_at })
      }
    } else if (id === 'scoring') {
      const { data } = await supabase
        .from('all_leads')
        .select('customer_name, lead_score, lead_stage, last_interaction_at')
        .in('brand', brands)
        .not('lead_score', 'is', null)
        .order('lead_score', { ascending: false })
        .limit(8)
      for (const l of data || []) items.push({ title: `${l.customer_name || 'Lead'} · ${l.lead_score}`, sub: l.lead_stage || 'New', at: l.last_interaction_at })
    } else if (id === 'memory') {
      const { data } = await supabase
        .from('knowledge_base')
        .select('title, type, created_at')
        .eq('brand', BRAND_ID)
        .order('created_at', { ascending: false })
        .limit(8)
      for (const k of data || []) items.push({ title: k.title || 'Untitled', sub: k.type || 'knowledge', at: k.created_at })
    } else if (id === 'timing') {
      const { data } = await supabase
        .from('all_leads')
        .select('customer_name, unified_context')
        .in('brand', brands)
        .limit(2000)
      const now = Date.now()
      const upcoming: Array<Item & { ms: number }> = []
      for (const l of data || []) {
        const b = bookingFromCtx((l as any).unified_context)
        const dt = parseBookingIST(b.date, b.time)
        if (dt && dt.getTime() >= now) {
          upcoming.push({
            title: (l as any).customer_name || 'Lead',
            sub: dt.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) + ' IST',
            ms: dt.getTime(),
          })
        }
      }
      upcoming.sort((a, b) => a.ms - b.ms)
      for (const u of upcoming.slice(0, 8)) items.push({ title: u.title, sub: u.sub })
    } else if (id === 'output') {
      const { data } = await supabase
        .from('agent_tasks')
        .select('lead_name, task_type, completed_at')
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(8)
      for (const t of data || []) items.push({ title: t.lead_name || 'Lead', sub: String(t.task_type || 'send').replace(/_/g, ' '), at: t.completed_at })
    } else {
      return NextResponse.json({ error: 'Unknown region' }, { status: 400 })
    }

    return NextResponse.json({ id, items })
  } catch (err) {
    console.error('[brain/region] Error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
