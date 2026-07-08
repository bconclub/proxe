// LEADER API — constituency mood: where support stands, seat by seat.
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
    const constituency = req.nextUrl.searchParams.get('constituency') || '';
    let q = sb.from('vw_war_room_base').select('constituency, lean, created_at').limit(10000);
    if (constituency) q = q.eq('constituency', constituency);
    const { data: rows, error } = await q;
    if (error) throw error;
    const R = (rows || []).filter((r: any) => r.lean);

    const avg = (arr: any[]) => (arr.length ? arr.reduce((s, r) => s + (LS[r.lean] ?? 0), 0) / arr.length : 0);
    const now = Date.now(); const d7 = now - 7 * 86400000; const d14 = now - 14 * 86400000;
    const net = avg(R);
    const last7 = R.filter((r: any) => new Date(r.created_at).getTime() >= d7);
    const prev7 = R.filter((r: any) => { const t = new Date(r.created_at).getTime(); return t >= d14 && t < d7; });

    const bySeat = new Map<string, Record<string, number>>();
    R.forEach((r: any) => {
      if (!r.constituency) return;
      const a = bySeat.get(r.constituency) || { supporter: 0, leaning: 0, undecided: 0, opposed: 0 };
      a[r.lean] = (a[r.lean] || 0) + 1;
      bySeat.set(r.constituency, a);
    });

    return NextResponse.json({
      overall: {
        net: Math.round(net * 100) / 100,
        shiftPp: Math.round((avg(last7) - avg(prev7)) * 100),
        label: net > 0.1 ? 'Positive' : net < -0.1 ? 'Negative' : 'Neutral',
      },
      byConstituency: Array.from(bySeat.entries()).map(([seat, a]) => {
        const total = a.supporter + a.leaning + a.undecided + a.opposed || 1;
        const seatNet = (a.supporter * 1 + a.leaning * 0.5 - a.opposed) / total;
        return { constituency: seat, ...a, net: Math.round(seatNet * 100) / 100 };
      }).sort((a, b) => b.net - a.net),
    });
  } catch (e) {
    console.error('[leader/mood]', (e as Error).message);
    return NextResponse.json({ error: 'aggregation failed' }, { status: 500 });
  }
}
