// LEADER API — MLA/constituency performance, derived from OUR OWN data
// (user decision: no external MLA dataset). Composite per seat:
//   resolution — grievance loop health (resolved / raised)
//   mood       — 7d lean shift vs previous 7d
//   growth     — volunteer (tier-3+) additions in the last 14d
// Score = weighted blend, 0-100. Directional tool, not a judgement — the
// inputs are only what flows through PROXe.
// Auth: x-api-key = LEADER_API_KEY.

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/services';
import { leaderAuthGate } from '@/lib/server/leaderAuth';

export const dynamic = 'force-dynamic';

const LS: Record<string, number> = { supporter: 1, leaning: 0.5, undecided: 0, opposed: -1 };

export async function GET(req: NextRequest) {
  const denied = leaderAuthGate(req);
  if (denied) return denied;
  const sb: any = getServiceClient();
  if (!sb) return NextResponse.json({ error: 'database unavailable' }, { status: 500 });

  try {
    const { data: rows, error } = await sb.from('vw_war_room_base')
      .select('constituency, lean, loop_status, intensity, created_at')
      .not('constituency', 'is', null).limit(10000);
    if (error) throw error;

    const now = Date.now(); const d7 = now - 7 * 86400000; const d14 = now - 14 * 86400000;
    const bySeat = new Map<string, any[]>();
    (rows || []).forEach((r: any) => { (bySeat.get(r.constituency) || bySeat.set(r.constituency, []).get(r.constituency))!.push(r); });

    const avg = (arr: any[]) => (arr.length ? arr.reduce((s, r) => s + (LS[r.lean] ?? 0), 0) / arr.length : 0);

    const seats = Array.from(bySeat.entries()).map(([constituency, items]) => {
      const raised = items.length;
      const resolved = items.filter((r) => r.loop_status === 'resolved').length;
      const resolutionPct = raised ? Math.round((100 * resolved) / raised) : 0;

      const leaned = items.filter((r) => r.lean);
      const last7 = leaned.filter((r) => new Date(r.created_at).getTime() >= d7);
      const prev7 = leaned.filter((r) => { const t = new Date(r.created_at).getTime(); return t >= d14 && t < d7; });
      const moodShiftPp = Math.round((avg(last7) - avg(prev7)) * 100);

      const volGrowth14d = items.filter((r) => (r.intensity ?? 0) >= 3 && new Date(r.created_at).getTime() >= d14).length;

      // 0-100 composite: resolution 50%, mood shift 25% (±50pp band), growth 25% (10 adds = full marks).
      const score = Math.max(0, Math.min(100, Math.round(
        0.5 * resolutionPct +
        0.25 * (50 + moodShiftPp) +
        0.25 * Math.min(100, volGrowth14d * 10),
      )));

      return { constituency, total: raised, resolutionPct, moodShiftPp, volGrowth14d, score };
    }).sort((a, b) => b.score - a.score);

    return NextResponse.json({
      seats,
      method: 'score = 0.5*resolution% + 0.25*(50+moodShiftPp) + 0.25*min(100, volGrowth14d*10) — derived from PROXe data only',
    });
  } catch (e) {
    console.error('[leader/performance]', (e as Error).message);
    return NextResponse.json({ error: 'aggregation failed' }, { status: 500 });
  }
}
