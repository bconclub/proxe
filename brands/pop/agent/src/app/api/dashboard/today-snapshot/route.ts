/**
 * GET /api/dashboard/today-snapshot
 *
 * Quick-glance summary of activity in a time window (default: today, IST).
 * Powers the "Today's Snapshot" popup in the dashboard header.
 *
 * Ported from Windchasers, trimmed to BCON's business context (no aviation
 * PAT / parent-student concepts).
 *
 * Response shape:
 * {
 *   window: { startIso, endIso, label, range },
 *   leads: { total, bySource: { Meta: 5, WhatsApp: 3, ... } },
 *   events: { bookings, calls_logged, agent_replies },
 *   scoreHistogram: { hot, warm, cold, unscored },
 *   topActive: [ { id, name, phone, score, messageCount }, ... ]
 * }
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/services';

export const dynamic = 'force-dynamic';

/** Compute today's IST midnight as a UTC ISO string. */
function getISTMidnightISO(): string {
  const now = new Date();
  const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffsetMs);
  const istMidnightUtcMs = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate(), 0, 0, 0) - istOffsetMs;
  return new Date(istMidnightUtcMs).toISOString();
}

/** Start of the window (UTC ISO) for the given range key. */
function getStartIso(range: 'today' | '7d' | '14d' | '28d'): string {
  if (range === 'today') return getISTMidnightISO();
  const days = range === '7d' ? 7 : range === '14d' ? 14 : 28;
  return new Date(Date.now() - days * 24 * 60 * 60_000).toISOString();
}

const RANGE_LABELS: Record<string, string> = {
  today: 'Today (IST)',
  '7d':  'Last 7 days',
  '14d': 'Last 14 days',
  '28d': 'Last 28 days',
};

export async function GET(request: Request) {
  try {
    // Auth: require a logged-in dashboard user.
    const userClient = await createClient();
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getServiceClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }

    const url = new URL(request.url);
    const rawRange = (url.searchParams.get('range') || 'today').toLowerCase();
    const range: 'today' | '7d' | '14d' | '28d' = (
      ['today', '7d', '14d', '28d'].includes(rawRange) ? rawRange : 'today'
    ) as any;

    const startIso = getStartIso(range);
    const endIso = new Date().toISOString();

    // ── 1) Leads created in window + by source ──────────────────────────────
    const { data: windowLeads } = await supabase
      .from('all_leads')
      .select('id, customer_name, phone, lead_score, first_touchpoint, unified_context, created_at')
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .order('created_at', { ascending: false });

    const leads = windowLeads || [];

    // Friendly source label — prefer attribution.source_label, fall back to
    // first_touchpoint (mirrors the LeadsTable SOURCE column logic).
    const sourceLabelOf = (l: any): string => {
      const sl = l?.unified_context?.attribution?.source_label;
      if (typeof sl === 'string' && sl.trim()) return sl.trim();
      const ft = String(l?.first_touchpoint || '').trim();
      if (!ft) return 'Other';
      if (ft === 'whatsapp') return 'WhatsApp';
      if (ft === 'form' || ft === 'web') return 'Form';
      if (ft === 'facebook' || ft === 'meta_forms') return 'Meta';
      if (ft === 'google') return 'Google';
      if (ft === 'voice') return 'Voice';
      return ft.charAt(0).toUpperCase() + ft.slice(1);
    };

    const bySource: Record<string, number> = {};
    for (const l of leads) {
      const k = sourceLabelOf(l);
      bySource[k] = (bySource[k] || 0) + 1;
    }

    // ── 2) Score histogram (over leads created in window) ────────────────────
    const scoreHistogram = { hot: 0, warm: 0, cold: 0, unscored: 0 };
    for (const l of leads) {
      const s = typeof l.lead_score === 'number' ? l.lead_score : null;
      if (s == null) scoreHistogram.unscored++;
      else if (s >= 70) scoreHistogram.hot++;
      else if (s >= 40) scoreHistogram.warm++;
      else scoreHistogram.cold++;
    }

    // ── 3) Bookings — count leads whose booking timestamp falls in the window.
    // A booking lives in unified_context.<channel>.booking_date (scalar) or
    // unified_context.web.booking.date (object). Check all channels, count once.
    const { data: ctxEventLeads } = await supabase
      .from('all_leads')
      .select('id, unified_context, metadata, created_at');

    const inWindow = (iso: string | null | undefined): boolean => {
      if (!iso) return false;
      const t = new Date(iso).getTime();
      if (isNaN(t)) return false;
      return t >= new Date(startIso).getTime() && t <= new Date(endIso).getTime();
    };

    const BOOKING_CHANNELS = ['web', 'whatsapp', 'voice'] as const;
    let bookings = 0;
    for (const l of (ctxEventLeads || [])) {
      const uc = l?.unified_context || {};
      let hasBooking = false;
      let bookedAt: string | null = null;
      for (const ch of BOOKING_CHANNELS) {
        const c = uc[ch] || {};
        const bd = c.booking_date || c?.booking?.date;
        if (!bd) continue;
        hasBooking = true;
        const ts = c.booking_created_at || c?.booking?.created_at || null;
        if (ts && (!bookedAt || new Date(ts).getTime() > new Date(bookedAt).getTime())) bookedAt = ts;
      }
      if (hasBooking) {
        const stamp = bookedAt || l?.metadata?.booking_confirmed_at || l.created_at;
        if (inWindow(stamp)) bookings++;
      } else {
        const rawFt = String(uc.raw_form_fields?.form_type || '').toLowerCase();
        const eventName = String(uc.raw_form_fields?.event_name || '').toLowerCase();
        if (inWindow(l.created_at) && (rawFt === 'demo_booked' || eventName === 'demo_booked')) {
          bookings++;
        }
      }
    }

    // ── 4) Agent replies + calls (conversation-based) ───────────────────────
    const [
      { data: agentMsgs },
      { data: voiceCalls },
    ] = await Promise.all([
      supabase
        .from('conversations')
        .select('id, channel, metadata, created_at')
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .eq('sender', 'agent')
        .eq('channel', 'whatsapp'),
      supabase
        .from('conversations')
        .select('id, channel, created_at')
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .eq('channel', 'voice'),
    ]);

    let agentReplies = 0;
    for (const m of (agentMsgs || [])) {
      if (m?.metadata?.ai_generated) agentReplies++;
    }

    const events = {
      bookings,
      calls_logged: (voiceCalls || []).length,
      agent_replies: agentReplies,
    };

    // ── 5) Top 5 active leads (customer messages in window) ──────────────────
    const { data: custMsgs } = await supabase
      .from('conversations')
      .select('lead_id, created_at')
      .eq('sender', 'customer')
      .gte('created_at', startIso)
      .lte('created_at', endIso);

    const msgCountByLead = new Map<string, number>();
    for (const m of (custMsgs || [])) {
      if (!m.lead_id) continue;
      msgCountByLead.set(m.lead_id, (msgCountByLead.get(m.lead_id) || 0) + 1);
    }
    const topIds = Array.from(msgCountByLead.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);

    let topActive: Array<{ id: string; name: string; phone: string | null; score: number | null; messageCount: number }> = [];
    if (topIds.length > 0) {
      const { data: leadRows } = await supabase
        .from('all_leads')
        .select('id, customer_name, phone, lead_score')
        .in('id', topIds);
      const byId = new Map((leadRows || []).map((r: any) => [r.id, r]));
      topActive = topIds.map((id) => {
        const r: any = byId.get(id) || {};
        return {
          id,
          name: r.customer_name || 'Unnamed',
          phone: r.phone || null,
          score: typeof r.lead_score === 'number' ? r.lead_score : null,
          messageCount: msgCountByLead.get(id) || 0,
        };
      });
    }

    return NextResponse.json({
      window: { startIso, endIso, label: RANGE_LABELS[range] || 'Today (IST)', range },
      leads: { total: leads.length, bySource },
      events,
      scoreHistogram,
      topActive,
    });
  } catch (err: any) {
    console.error('[today-snapshot] error:', err?.message || err);
    return NextResponse.json({ error: 'Snapshot failed' }, { status: 500 });
  }
}
