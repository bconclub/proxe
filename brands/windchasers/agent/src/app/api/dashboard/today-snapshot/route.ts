/**
 * GET /api/dashboard/today-snapshot
 *
 * Returns a quick-glance summary of what happened today (midnight IST → now).
 * Used by the Today Snapshot popup in the dashboard header.
 *
 * Response shape:
 * {
 *   window: { startIso, endIso, label: "Today (IST)" },
 *   leads: { total, bySource: { Direct: 5, Form: 3, ... } },
 *   events: { pat_submitted, demo_booked, calls_logged, agent_replies },
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

/** Compute the start of the window (UTC ISO) for the given range key. */
function getStartIso(range: 'today' | '7d' | '14d' | '28d'): string {
  if (range === 'today') return getISTMidnightISO();
  const days = range === '7d' ? 7 : range === '14d' ? 14 : 28;
  // For multi-day windows, count back N*24h from now (rolling window).
  // Each "day" boundary doesn't matter for these aggregates — what matters
  // is the rolling lookback.
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
    // Auth: require a logged-in dashboard user (Supabase session cookie).
    const userClient = await createClient();
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getServiceClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }

    // Parse the ?range= query param. Defaults to 'today' for back-compat.
    const url = new URL(request.url);
    const rawRange = (url.searchParams.get('range') || 'today').toLowerCase();
    const range: 'today' | '7d' | '14d' | '28d' = (
      ['today', '7d', '14d', '28d'].includes(rawRange) ? rawRange : 'today'
    ) as any;

    const startIso = getStartIso(range);
    const endIso = new Date().toISOString();

    // ── 1) Leads created today + by source ──────────────────────────────────
    const { data: todayLeads } = await supabase
      .from('all_leads')
      .select('id, customer_name, phone, lead_score, first_touchpoint, unified_context, created_at')
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .order('created_at', { ascending: false });

    const leads = todayLeads || [];

    // Resolve a friendly source label, mirroring LeadsTable's logic at a higher
    // level: prefer attribution.source_label; fall back to first_touchpoint.
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

    // ── 2) Score histogram (over leads created today) ───────────────────────
    const scoreHistogram = { hot: 0, warm: 0, cold: 0, unscored: 0 };
    for (const l of leads) {
      const s = typeof l.lead_score === 'number' ? l.lead_score : null;
      if (s == null) scoreHistogram.unscored++;
      else if (s >= 70) scoreHistogram.hot++;
      else if (s >= 40) scoreHistogram.warm++;
      else scoreHistogram.cold++;
    }

    // ── 3) Activity events — derived from the LEADS, not conversation rows.
    // Conversation rows only exist if a template send actually logged. Leads
    // have the canonical signal in unified_context, so use that:
    //
    //   pat_submitted — unified_context.windchasers.pat_completed_at falls in window
    //   demo_booked   — unified_context.web.booking exists AND was created in window
    //                   (or, fallback, lead created in window with form_type=demo_booked)
    //   calls_logged  — conversations.channel=voice in window (correct as before)
    //   agent_replies — conversations.channel=whatsapp + sender=agent + ai_generated in window
    //
    // We use the leads we already loaded for "today's leads", AND additionally
    // pull leads where the PAT or booking timestamp falls inside the window
    // even if the lead itself was created earlier.
    const { data: ctxEventLeads } = await supabase
      .from('all_leads')
      .select('id, unified_context, created_at');

    const inWindow = (iso: string | null | undefined): boolean => {
      if (!iso) return false;
      const t = new Date(iso).getTime();
      if (isNaN(t)) return false;
      return t >= new Date(startIso).getTime() && t <= new Date(endIso).getTime();
    };

    let patSubmitted = 0;
    let demoBooked = 0;
    for (const l of (ctxEventLeads || [])) {
      const wc = l?.unified_context?.windchasers || {};
      const booking = l?.unified_context?.web?.booking;
      const rawFt = String(l?.unified_context?.raw_form_fields?.form_type || '').toLowerCase();
      const eventName = String(l?.unified_context?.raw_form_fields?.event_name || '').toLowerCase();

      if (inWindow(wc.pat_completed_at)) patSubmitted++;
      if (booking && inWindow(booking.created_at)) demoBooked++;
      else if (inWindow(l.created_at) && (rawFt === 'demo_booked' || eventName === 'demo_booked')) {
        // Fallback: lead created today with demo_booked form_type but booking
        // object not (yet) populated.
        demoBooked++;
      }
    }

    // Agent replies + calls — still conversation-based
    const [
      { data: agentMsgsToday },
      { data: voiceCallsToday },
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
    for (const m of (agentMsgsToday || [])) {
      if (m?.metadata?.ai_generated) agentReplies++;
    }

    const events = {
      pat_submitted: patSubmitted,
      demo_booked: demoBooked,
      calls_logged: (voiceCallsToday || []).length,
      agent_replies: agentReplies,
    };

    // ── 4) Top 5 active leads (today's customer messages) ───────────────────
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
