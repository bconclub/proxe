// LEADER API — per-seat pulse. The Pulse Punjab app's real numbers (replaces
// its seeded mock via src/lib/api.ts GET /pulse).
// Auth: x-api-key = LEADER_API_KEY. Read-only over the privacy-projected view.

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/services';
import { leaderAuthGate } from '@/lib/server/leaderAuth';

export const dynamic = 'force-dynamic';

const LEAN_SCORE: Record<string, number> = { supporter: 1, leaning: 0.4, undecided: 0, opposed: -1 };

export async function GET(req: NextRequest) {
  const denied = leaderAuthGate(req);
  if (denied) return denied;
  const sb: any = getServiceClient();
  if (!sb) return NextResponse.json({ error: 'database unavailable' }, { status: 500 });

  try {
    const q = req.nextUrl.searchParams;
    const constituency = q.get('constituency') || '';
    const days = parseInt(q.get('days') || '30', 10);
    const since = new Date(Date.now() - days * 86400000).toISOString();

    let query = sb.from('vw_war_room_base')
      .select('constituency, district, lean, grievance_category, action_intent, intensity, created_at')
      .gte('created_at', since).limit(10000);
    if (constituency) query = query.eq('constituency', constituency);
    const { data: rows, error } = await query;
    if (error) throw error;

    const d7 = Date.now() - 7 * 86400000;
    const { data: knocks } = await sb.from('d2d_visits')
      .select('constituency, created_at')
      .gte('created_at', new Date(d7).toISOString()).limit(10000);
    const knocksBySeat = new Map<string, number>();
    (knocks || []).forEach((k: any) => { if (k.constituency) knocksBySeat.set(k.constituency, (knocksBySeat.get(k.constituency) || 0) + 1); });

    const bySeat = new Map<string, any[]>();
    (rows || []).forEach((r: any) => { if (r.constituency) { (bySeat.get(r.constituency) || bySeat.set(r.constituency, []).get(r.constituency))!.push(r); } });

    const seats = Array.from(bySeat.entries()).map(([seat, items]) => {
      const tiers = { t0: 0, t1: 0, t2: 0, t3: 0, t4: 0 } as Record<string, number>;
      const catCount: Record<string, number> = {};
      let leanSum = 0, votes = 0;
      items.forEach((r) => {
        tiers[`t${Math.max(0, Math.min(4, r.intensity ?? 0))}`]++;
        const c = r.grievance_category; if (c) catCount[c] = (catCount[c] || 0) + 1;
        leanSum += LEAN_SCORE[r.lean] ?? 0;
        if (r.action_intent === 'vote') votes++;
      });
      return {
        constituency: seat,
        district: items.find((r) => r.district)?.district || null,
        total: items.length,
        intensity: tiers,
        leanScore: Math.round((leanSum / items.length) * 100) / 100,
        topCategory: Object.entries(catCount).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
        voteShare: Math.round((100 * votes) / items.length),
        knocks7d: knocksBySeat.get(seat) || 0,
      };
    }).sort((a, b) => b.total - a.total);

    return NextResponse.json({ seats, updatedAt: new Date().toISOString() });
  } catch (e) {
    console.error('[leader/pulse]', (e as Error).message);
    return NextResponse.json({ error: 'aggregation failed' }, { status: 500 });
  }
}
