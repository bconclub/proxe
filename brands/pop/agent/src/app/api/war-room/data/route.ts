import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/services/supabase';

// READ-ONLY war-room aggregation. Reads vw_war_room_base (privacy-projected:
// no phone/email) with optional filters, aggregates server-side, returns the
// WarRoomData contract. No writes. Isolated from PROXe core.
export const dynamic = 'force-dynamic';

const CATEGORIES = ['jobs', 'water', 'power', 'roads', 'drugs', 'farm_debt', 'health', 'education', 'other'];
const LEAN_SCORE: Record<string, number> = { supporter: 1, leaning: 0.4, undecided: 0, opposed: -1 };

export async function GET(req: NextRequest) {
  try {
    const sb = getServiceClient();
    if (!sb) return NextResponse.json({ error: 'no db' }, { status: 500 });

    const q = req.nextUrl.searchParams;
    const f = {
      constituency: q.get('constituency') || '',
      district: q.get('district') || '',
      channel: q.get('channel') || '',
      language: q.get('language') || '',
      days: q.get('days') || 'all',
    };

    // Build a filtered query against the read-only base view.
    let query = sb.from('vw_war_room_base').select('*');
    if (f.constituency) query = query.eq('constituency', f.constituency);
    if (f.district) query = query.eq('district', f.district);
    if (f.channel) query = query.eq('magnet', f.channel);
    if (f.language) query = query.eq('language', f.language);
    if (f.days !== 'all') {
      const d = parseInt(f.days, 10);
      const since = f.days === '1'
        ? new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
        : new Date(Date.now() - d * 86400000).toISOString();
      query = query.gte('created_at', since);
    }
    // Cap to keep the payload bounded; aggregation is on these rows.
    const { data: rows, error } = await query.order('created_at', { ascending: false }).limit(5000);
    if (error) throw error;
    const R = rows || [];

    const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
    const now = Date.now();
    const d7 = now - 7 * 86400000;
    const d14 = now - 14 * 86400000;

    // ── KPIs ──
    const seatsActive = new Set(R.filter((r) => r.constituency && r.grievance_category).map((r) => r.constituency));
    const raised = R.length;
    const resolved = R.filter((r) => r.loop_status === 'resolved').length;
    const kpis = {
      total: R.length,
      today: R.filter((r) => new Date(r.created_at).getTime() >= todayStart).length,
      activeConstituencies: seatsActive.size,
      raised,
      resolved,
      loopHealthPct: raised ? Math.round((100 * resolved) / raised) : 0,
    };

    // ── byCategory (+ salience-weighted + 7d trend) ──
    const byCategory = CATEGORIES.map((cat) => {
      const items = R.filter((r) => (r.grievance_category || 'other') === cat);
      const last7 = items.filter((r) => new Date(r.created_at).getTime() >= d7).length;
      const prev7 = items.filter((r) => { const t = new Date(r.created_at).getTime(); return t >= d14 && t < d7; }).length;
      const avgSal = items.length ? items.reduce((s, r) => s + (r.salience || 1), 0) / items.length : 0;
      return { category: cat, count: items.length, salienceWeighted: Math.round(items.length * avgSal * 10) / 10, trend7d: last7 - prev7 };
    }).filter((c) => c.count > 0).sort((a, b) => b.count - a.count);

    // ── lean overall + swing ──
    const leanOverall: Record<string, number> = { supporter: 0, leaning: 0, undecided: 0, opposed: 0 };
    R.forEach((r) => { if (r.lean && leanOverall[r.lean] !== undefined) leanOverall[r.lean]++; });

    const bySeat = new Map<string, any[]>();
    R.forEach((r) => { if (r.constituency) { (bySeat.get(r.constituency) || bySeat.set(r.constituency, []).get(r.constituency))!.push(r); } });

    const swing = Array.from(bySeat.entries()).map(([constituency, items]) => {
      const total = items.length;
      const undecided = items.filter((r) => r.lean === 'undecided').length;
      return { constituency, total, undecided, undecidedPct: total ? Math.round((100 * undecided) / total) : 0 };
    }).filter((s) => s.total >= 2).sort((a, b) => b.undecidedPct - a.undecidedPct || b.total - a.total);

    // ── byConstituency (map) ──
    const byConstituency = Array.from(bySeat.entries()).map(([constituency, items]) => {
      const catCount: Record<string, number> = {};
      items.forEach((r) => { const c = r.grievance_category || 'other'; catCount[c] = (catCount[c] || 0) + 1; });
      const topCategory = Object.entries(catCount).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      const leanScore = items.reduce((s, r) => s + (LEAN_SCORE[r.lean] ?? 0), 0) / items.length;
      const voteShare = (100 * items.filter((r) => r.action_intent === 'vote').length) / items.length;
      return { constituency, count: items.length, topCategory, leanScore: Math.round(leanScore * 100) / 100, voteShare: Math.round(voteShare) };
    });

    // ── district × category matrix ──
    const districts = Array.from(new Set(R.map((r) => r.district).filter(Boolean))).sort() as string[];
    const cells: Record<string, Record<string, number>> = {};
    districts.forEach((d) => { cells[d] = {}; CATEGORIES.forEach((c) => (cells[d][c] = 0)); });
    R.forEach((r) => { if (r.district && cells[r.district]) cells[r.district][r.grievance_category || 'other']++; });
    const matrix = { districts, categories: CATEGORIES, cells };

    // ── mobilization ──
    const mobilization: Record<string, number> = { vote: 0, volunteer: 0, rally: 0, share: 0, none: 0 };
    R.forEach((r) => { const k = r.action_intent || 'none'; if (mobilization[k] !== undefined) mobilization[k]++; });

    // ── channel mix ──
    const magTotals: Record<string, number> = {};
    R.forEach((r) => { const m = r.magnet || 'other'; magTotals[m] = (magTotals[m] || 0) + 1; });
    const totalMag = R.length || 1;
    const channelMix = Object.entries(magTotals).map(([magnet, count]) => ({ magnet, count, share: Math.round((100 * count) / totalMag) })).sort((a, b) => b.count - a.count);

    // ── live feed (latest 40, display-safe) ──
    const liveFeed = R.slice(0, 40).map((r) => ({ id: r.id, name: r.name, constituency: r.constituency, category: r.grievance_category, created_at: r.created_at }));

    return NextResponse.json({ kpis, byCategory, leanOverall, swing, byConstituency, matrix, mobilization, channelMix, liveFeed });
  } catch (e) {
    console.error('[war-room/data]', (e as Error).message);
    return NextResponse.json({ error: 'aggregation failed', message: (e as Error).message }, { status: 500 });
  }
}
