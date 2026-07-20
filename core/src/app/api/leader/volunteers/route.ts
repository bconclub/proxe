// LEADER API - volunteer energy: how alive is the cadre machine.
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
    const DAYS = 14;
    const now = Date.now();
    const dayKeys = Array.from({ length: DAYS }, (_, i) => new Date(now - (DAYS - 1 - i) * 86400000).toISOString().slice(0, 10));
    const dayIdx: Record<string, number> = Object.fromEntries(dayKeys.map((k, i) => [k, i]));
    const since = new Date(now - DAYS * 86400000).toISOString();

    // Tier-3+ people (volunteers + cadre) from the privacy-projected view.
    const { data: vols, error } = await sb.from('vw_war_room_base')
      .select('constituency, intensity, created_at')
      .gte('intensity', 3).limit(10000);
    if (error) throw error;
    const V = vols || [];

    // Active registered cadre.
    const { count: cadreCount } = await sb.from('d2d_workers')
      .select('id', { count: 'exact', head: true }).eq('status', 'active');

    // Knock energy - d2d visits over the window.
    const { data: knocks } = await sb.from('d2d_visits')
      .select('constituency, created_at').gte('created_at', since).limit(10000);

    const signups14d = new Array(DAYS).fill(0);
    V.forEach((v: any) => { const i = dayIdx[new Date(v.created_at).toISOString().slice(0, 10)]; if (i !== undefined) signups14d[i]++; });
    const knocks14d = new Array(DAYS).fill(0);
    const knocksBySeat = new Map<string, number>();
    (knocks || []).forEach((k: any) => {
      const i = dayIdx[new Date(k.created_at).toISOString().slice(0, 10)]; if (i !== undefined) knocks14d[i]++;
      if (k.constituency) knocksBySeat.set(k.constituency, (knocksBySeat.get(k.constituency) || 0) + 1);
    });

    const bySeat = new Map<string, { volunteers: number; cadre: number }>();
    V.forEach((v: any) => {
      if (!v.constituency) return;
      const a = bySeat.get(v.constituency) || { volunteers: 0, cadre: 0 };
      if ((v.intensity ?? 0) >= 4) a.cadre++; else a.volunteers++;
      bySeat.set(v.constituency, a);
    });

    return corsJson({
      totals: {
        volunteers: V.filter((v: any) => (v.intensity ?? 0) === 3).length,
        cadre: V.filter((v: any) => (v.intensity ?? 0) >= 4).length,
        activeWorkers: cadreCount || 0,
      },
      energy: { days: dayKeys, signups14d, knocks14d },
      byConstituency: Array.from(bySeat.entries())
        .map(([constituency, a]) => ({ constituency, ...a, knocks: knocksBySeat.get(constituency) || 0 }))
        .sort((a, b) => (b.volunteers + b.cadre) - (a.volunteers + a.cadre)),
    });
  } catch (e) {
    console.error('[leader/volunteers]', (e as Error).message);
    return corsJson({ error: 'aggregation failed' }, { status: 500 });
  }
}
