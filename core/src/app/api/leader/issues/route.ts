// LEADER API - emerging issues: which grievances are trending, where.
// Auth: x-api-key = LEADER_API_KEY.

import { NextRequest } from 'next/server';
import { getServiceClient } from '@/lib/services';
import { leaderAuthGate, corsJson, leaderOptions } from '@/lib/server/leaderAuth';

export const dynamic = 'force-dynamic';
export const OPTIONS = leaderOptions;

export async function GET(req: NextRequest) {
  const denied = leaderAuthGate(req);
  if (denied) return denied;
  const sb: any = getServiceClient();
  if (!sb) return corsJson({ error: 'database unavailable' }, { status: 500 });

  try {
    const days = parseInt(req.nextUrl.searchParams.get('days') || '7', 10);
    const now = Date.now();
    const since = new Date(now - 2 * days * 86400000).toISOString(); // current + previous window
    const cut = now - days * 86400000;

    const { data: rows, error } = await sb.from('vw_war_room_base')
      .select('grievance_category, salience, constituency, created_at')
      .gte('created_at', since)
      .not('grievance_category', 'is', null)
      .limit(10000);
    if (error) throw error;

    const agg = new Map<string, { cur: number; prev: number; salSum: number; seats: Map<string, number> }>();
    (rows || []).forEach((r: any) => {
      const a = agg.get(r.grievance_category) || { cur: 0, prev: 0, salSum: 0, seats: new Map() };
      const isCur = new Date(r.created_at).getTime() >= cut;
      if (isCur) {
        a.cur++;
        a.salSum += r.salience || 1;
        if (r.constituency) a.seats.set(r.constituency, (a.seats.get(r.constituency) || 0) + 1);
      } else a.prev++;
      agg.set(r.grievance_category, a);
    });

    const issues = Array.from(agg.entries()).map(([category, a]) => ({
      category,
      count7d: a.cur,
      prev7d: a.prev,
      trend: a.cur - a.prev,
      avgSalience: a.cur ? Math.round((a.salSum / a.cur) * 10) / 10 : 0,
      topConstituencies: Array.from(a.seats.entries()).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([s]) => s),
    })).sort((a, b) => b.count7d - a.count7d);

    // Emerging = growing off a small base (new narratives, not the perennials).
    const emerging = issues.filter((i) => i.trend > 0 && i.prev7d <= 2 && i.count7d >= 2).map((i) => i.category);

    return corsJson({ issues, emerging, windowDays: days });
  } catch (e) {
    console.error('[leader/issues]', (e as Error).message);
    return corsJson({ error: 'aggregation failed' }, { status: 500 });
  }
}
