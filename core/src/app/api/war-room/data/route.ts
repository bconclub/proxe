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

    // ── per-constituency detail (drawer): lean split, top issues, mobilization,
    //    channels, loop health, recent grievances. Computed from the same rows. ──
    const seatDetails: Record<string, any> = {};
    bySeat.forEach((items, constituency) => {
      const leanSplit: Record<string, number> = { supporter: 0, leaning: 0, undecided: 0, opposed: 0 };
      const catCount: Record<string, number> = {};
      const mob: Record<string, number> = { vote: 0, volunteer: 0, rally: 0, share: 0 };
      const chan: Record<string, number> = {};
      let resolved = 0;
      items.forEach((r) => {
        if (r.lean && leanSplit[r.lean] !== undefined) leanSplit[r.lean]++;
        const c = r.grievance_category || 'other'; catCount[c] = (catCount[c] || 0) + 1;
        if (r.action_intent && mob[r.action_intent] !== undefined) mob[r.action_intent]++;
        const m = r.magnet || 'other'; chan[m] = (chan[m] || 0) + 1;
        if (r.loop_status === 'resolved') resolved++;
      });
      const district = items.find((r) => r.district)?.district || null;
      seatDetails[constituency] = {
        total: items.length,
        district,
        leanSplit,
        topIssues: Object.entries(catCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([category, count]) => ({ category, count })),
        mobilization: mob,
        channels: Object.entries(chan).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([magnet, count]) => ({ magnet, count })),
        resolved,
        loopHealthPct: items.length ? Math.round((100 * resolved) / items.length) : 0,
        voteShare: items.length ? Math.round((100 * mob.vote) / items.length) : 0,
        avgSalience: items.length ? Math.round((items.reduce((s, r) => s + (r.salience || 1), 0) / items.length) * 10) / 10 : 0,
        recent: items.slice(0, 6).map((r) => ({ category: r.grievance_category, text: r.grievance_text || null, created_at: r.created_at, name: r.name, lean: r.lean })),
      };
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

    // ── daily time-series (last 14d) for sparklines / line / area charts ──
    const DAYS = 14;
    const dayKeys = Array.from({ length: DAYS }, (_, i) => new Date(now - (DAYS - 1 - i) * 86400000).toISOString().slice(0, 10));
    const dayIdx: Record<string, number> = Object.fromEntries(dayKeys.map((k, i) => [k, i]));
    const totalSeries = new Array(DAYS).fill(0);
    const resolvedSeries = new Array(DAYS).fill(0);
    const topCats = byCategory.slice(0, 5).map((c) => c.category);
    const catSeries: Record<string, number[]> = Object.fromEntries(topCats.map((c) => [c, new Array(DAYS).fill(0)]));
    const topSeats = [...byConstituency].sort((a, b) => b.count - a.count).slice(0, 6).map((s) => s.constituency);
    const seatSeries: Record<string, number[]> = Object.fromEntries(topSeats.map((s) => [s, new Array(DAYS).fill(0)]));
    const mobSeries: Record<string, number[]> = { vote: new Array(DAYS).fill(0), volunteer: new Array(DAYS).fill(0), rally: new Array(DAYS).fill(0), share: new Array(DAYS).fill(0) };
    R.forEach((r) => {
      const i = dayIdx[new Date(r.created_at).toISOString().slice(0, 10)];
      if (i === undefined) return;
      totalSeries[i]++;
      if (r.loop_status === 'resolved') resolvedSeries[i]++;
      const c = r.grievance_category || 'other'; if (catSeries[c]) catSeries[c][i]++;
      if (r.constituency && seatSeries[r.constituency]) seatSeries[r.constituency][i]++;
      const a = r.action_intent; if (a && mobSeries[a]) mobSeries[a][i]++;
    });
    const series = { days: dayKeys, total: totalSeries, resolved: resolvedSeries, categories: topCats, byCategory: catSeries, seats: topSeats, bySeat: seatSeries, mobilization: mobSeries };

    // ── sentiment (net lean score + 7d shift) ──
    const LS: Record<string, number> = { supporter: 1, leaning: 0.5, undecided: 0, opposed: -1 };
    const leaned = R.filter((r) => r.lean);
    const net = leaned.length ? leaned.reduce((s, r) => s + (LS[r.lean] ?? 0), 0) / leaned.length : 0;
    const avg = (arr: any[]) => (arr.length ? arr.reduce((s, r) => s + (LS[r.lean] ?? 0), 0) / arr.length : 0);
    const last7 = R.filter((r) => new Date(r.created_at).getTime() >= d7);
    const prev7 = R.filter((r) => { const t = new Date(r.created_at).getTime(); return t >= d14 && t < d7; });
    const sentiment = { net: Math.round(net * 100) / 100, shiftPp: Math.round((avg(last7) - avg(prev7)) * 100), label: net > 0.1 ? 'Positive' : net < -0.1 ? 'Negative' : 'Neutral' };

    // ── D2D coverage (d2d_visits — the field tool's knocks) ──
    // Separate table, separate try/catch: a d2d failure must never take the
    // War Room down, so this degrades to d2d: null. Worker phone stays server-side.
    let d2d: any = null;
    try {
      let dq = sb.from('d2d_visits').select('constituency, district, worker_name, outcome, created_at');
      if (f.constituency) dq = dq.eq('constituency', f.constituency);
      if (f.district) dq = dq.eq('district', f.district);
      if (f.days !== 'all') {
        const d = parseInt(f.days, 10);
        const since = f.days === '1'
          ? new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
          : new Date(Date.now() - d * 86400000).toISOString();
        dq = dq.gte('created_at', since);
      }
      const { data: visits, error: dErr } = await dq.order('created_at', { ascending: false }).limit(5000);
      if (dErr) throw dErr;
      const V = visits || [];
      if (V.length) {
        const totals = { visits: V.length, met: 0, not_home: 0, refused: 0, revisit: 0, today: 0, workers: 0 };
        const workerAgg = new Map<string, { visits: number; met: number }>();
        const seatAgg = new Map<string, { visits: number; met: number }>();
        const d2dSeries = new Array(DAYS).fill(0);
        V.forEach((v) => {
          const o = v.outcome as keyof typeof totals;
          if (o && totals[o] !== undefined) (totals as any)[o]++;
          const t = new Date(v.created_at).getTime();
          if (t >= todayStart) totals.today++;
          if (v.worker_name) {
            const w = workerAgg.get(v.worker_name) || { visits: 0, met: 0 };
            w.visits++; if (v.outcome === 'met') w.met++;
            workerAgg.set(v.worker_name, w);
          }
          if (v.constituency) {
            const s = seatAgg.get(v.constituency) || { visits: 0, met: 0 };
            s.visits++; if (v.outcome === 'met') s.met++;
            seatAgg.set(v.constituency, s);
          }
          const i = dayIdx[new Date(v.created_at).toISOString().slice(0, 10)];
          if (i !== undefined) d2dSeries[i]++;
        });
        totals.workers = workerAgg.size;
        d2d = {
          totals,
          byConstituency: Array.from(seatAgg.entries())
            .map(([constituency, s]) => ({ constituency, visits: s.visits, met: s.met, metRate: s.visits ? Math.round((100 * s.met) / s.visits) : 0 }))
            .sort((a, b) => b.visits - a.visits),
          topWorkers: Array.from(workerAgg.entries())
            .map(([name, w]) => ({ name, visits: w.visits, met: w.met }))
            .sort((a, b) => b.visits - a.visits)
            .slice(0, 5),
          series: d2dSeries, // knocks/day, aligned to series.days
        };
      }
    } catch (e) {
      console.error('[war-room/data] d2d aggregation failed:', (e as Error).message);
      d2d = null;
    }

    return NextResponse.json({ kpis, byCategory, leanOverall, swing, byConstituency, seatDetails, matrix, mobilization, channelMix, liveFeed, series, sentiment, d2d });
  } catch (e) {
    console.error('[war-room/data]', (e as Error).message);
    return NextResponse.json({ error: 'aggregation failed', message: (e as Error).message }, { status: 500 });
  }
}
