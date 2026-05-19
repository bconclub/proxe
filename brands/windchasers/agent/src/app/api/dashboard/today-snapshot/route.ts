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
  // Current UTC time
  const now = new Date();
  // IST = UTC + 5:30
  const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffsetMs);
  // Strip to date in IST (YYYY-MM-DD)
  const yyyy = istNow.getUTCFullYear();
  const mm = String(istNow.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(istNow.getUTCDate()).padStart(2, '0');
  // IST midnight as UTC = that date at 00:00 IST = UTC 18:30 of previous day
  // Build the IST-midnight Date by treating "YYYY-MM-DDT00:00+05:30" as UTC.
  const istMidnightUtcMs = Date.UTC(yyyy, istNow.getUTCMonth(), istNow.getUTCDate(), 0, 0, 0) - istOffsetMs;
  return new Date(istMidnightUtcMs).toISOString();
  void mm; void dd; // keep markers; we use components above
}

export async function GET() {
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

    const startIso = getISTMidnightISO();
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

    // ── 3) Activity events: count today's conversation rows by kind ─────────
    // We bucket by metadata tags:
    //   pat_submitted   — message_type=template AND template_name LIKE %pat_result%
    //   demo_booked     — message_type=template AND template_name LIKE %demo_%
    //   calls_logged    — channel=voice AND sender=agent
    //   agent_replies   — channel=whatsapp AND sender=agent AND ai_generated=true
    const [
      { data: agentMsgsToday },
      { data: voiceCallsToday },
    ] = await Promise.all([
      supabase
        .from('conversations')
        .select('id, channel, sender, message_type, metadata, created_at')
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .eq('sender', 'agent'),
      supabase
        .from('conversations')
        .select('id, channel, created_at')
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .eq('channel', 'voice'),
    ]);

    const events = { pat_submitted: 0, demo_booked: 0, calls_logged: 0, agent_replies: 0 };
    for (const m of (agentMsgsToday || [])) {
      const tn = String(m?.metadata?.template_name || '').toLowerCase();
      if (m.message_type === 'template' && /pat_result/.test(tn)) events.pat_submitted++;
      else if (m.message_type === 'template' && /demo_/.test(tn)) events.demo_booked++;
      else if (m.channel === 'whatsapp' && m?.metadata?.ai_generated) events.agent_replies++;
    }
    events.calls_logged = (voiceCallsToday || []).length;

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
      window: { startIso, endIso, label: 'Today (IST)' },
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
