import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/services/supabase';

// READ-ONLY war-room aggregation. Reads vw_war_room_base (privacy-projected:
// no phone/email) with optional filters, aggregates server-side, returns the
// WarRoomData contract. No writes. Isolated from PROXe core.
export const dynamic = 'force-dynamic';

const CATEGORIES = ['jobs', 'water', 'power', 'roads', 'drugs', 'farm_debt', 'health', 'education', 'other'];
const LEAN_SCORE: Record<string, number> = { supporter: 1, leaning: 0.4, undecided: 0, opposed: -1 };

// PostgREST caps a single response at ~1000 rows regardless of .limit(); page
// through with .range() so the War Room aggregates the FULL dataset at campaign
// volume (tens of thousands of rows) instead of silently the first 1000.
// Bounded scan: OFFSET pagination is O(N²), so an unbounded pull at campaign
// volume (27k+) hangs the route for minutes. The War Room aggregates the most
// recent `cap` rows; the exact ladder + total come from indexed counts below.
async function fetchAllRows(build: () => any, cap = 8000): Promise<any[]> {
  const PAGE = 1000;
  const out: any[] = [];
  for (let from = 0; from < cap; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = data || [];
    out.push(...batch);
    if (batch.length < PAGE) break;
  }
  return out;
}

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

    // Build a filtered query against the read-only base view. Rebuildable so
    // pagination can re-issue it per page.
    const buildBase = () => {
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
      return query.order('created_at', { ascending: false });
    };
    const R = await fetchAllRows(buildBase);

    // Exact total + ladder via indexed counts (the capped R scan would undercount
    // at campaign volume). The common unfiltered War Room view is exact; a
    // filtered view falls back to the recent-rows sample.
    const noFilter = !f.constituency && !f.district && !f.channel && !f.language && f.days === 'all';
    let baseTotal = R.length;
    let tierCounts: number[] | null = null;
    if (noFilter) {
      try {
        const [tot, t0, t1, t2, t3, t4] = await Promise.all([
          sb.from('vw_war_room_base').select('*', { count: 'exact', head: true }),
          ...[0, 1, 2, 3, 4].map((t) => sb.from('vw_war_room_base').select('*', { count: 'exact', head: true }).eq('intensity', t)),
        ]);
        if (typeof tot.count === 'number') baseTotal = tot.count;
        tierCounts = [t0, t1, t2, t3, t4].map((r) => (typeof r.count === 'number' ? r.count : 0));
      } catch (e) { console.error('[war-room/data] count fallback:', (e as Error).message); }
    }

    const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
    const now = Date.now();
    const d7 = now - 7 * 86400000;
    const d14 = now - 14 * 86400000;

    // ── KPIs ──
    const seatsActive = new Set(R.filter((r) => r.constituency && r.grievance_category).map((r) => r.constituency));
    const raised = R.length;
    const resolved = R.filter((r) => r.loop_status === 'resolved').length;
    const kpis = {
      total: baseTotal,
      today: R.filter((r) => new Date(r.created_at).getTime() >= todayStart).length,
      activeConstituencies: seatsActive.size,
      raised,
      resolved,
      loopHealthPct: raised ? Math.round((100 * resolved) / raised) : 0,
    };

    // ── MOMENTUM (7d & 14d change in reach) ──────────────────────────────────
    // The KPI strip's deltas used to be hardcoded fake strings. Compute the real
    // change: last-7d vs prior-7d, and last-14d vs prior-14d touchpoint volume.
    // Exact via indexed counts on the unfiltered view (the capped R scan can only
    // cover the recent window, so a 14d/28d comparison needs true counts);
    // filtered views fall back to the recent-rows sample.
    const d28 = now - 28 * 86400000;
    const pctChg = (cur: number, prev: number) => (prev > 0 ? Math.round((100 * (cur - prev)) / prev) : cur > 0 ? 100 : 0);
    const momentum = { reach7dPct: 0, reach14dPct: 0 };
    if (noFilter) {
      try {
        const cSince = async (ms: number) => {
          const { count } = await sb.from('vw_war_room_base').select('*', { count: 'exact', head: true }).gte('created_at', new Date(ms).toISOString());
          return count || 0;
        };
        const [c7, c14, c28, cToday, resCount] = await Promise.all([
          cSince(d7), cSince(d14), cSince(d28), cSince(todayStart),
          sb.from('vw_war_room_base').select('*', { count: 'exact', head: true }).eq('loop_status', 'resolved').then((r) => r.count || 0),
        ]);
        momentum.reach7dPct = pctChg(c7, c14 - c7);
        momentum.reach14dPct = pctChg(c14, c28 - c14);
        kpis.today = cToday; // exact today across the full view, not the sample
        // Exact loop health over the whole dataset (the sample denominator read
        // as a misleading "/8000"; the real base is baseTotal).
        kpis.resolved = resCount;
        kpis.raised = baseTotal;
        kpis.loopHealthPct = baseTotal ? Math.round((100 * resCount) / baseTotal) : 0;
      } catch (e) { console.error('[war-room/data] momentum:', (e as Error).message); }
    } else {
      const inWin = (a: number, b: number) => R.filter((r) => { const t = new Date(r.created_at).getTime(); return t >= a && t < b; }).length;
      momentum.reach7dPct = pctChg(inWin(d7, now + 1), inWin(d14, d7));
      momentum.reach14dPct = pctChg(inWin(d14, now + 1), inWin(d28, d14));
    }

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
    // The lean donut summed the capped R sample, so it always read a flat "8000
    // voices" (the scan cap) instead of the real electorate. Scale the sample's
    // proportions up to the true total so the donut shows organic, campaign-scale
    // numbers. Unfiltered only; filtered views keep the exact sample counts.
    if (noFilter && baseTotal > R.length) {
      const leanSampleTotal = Object.values(leanOverall).reduce((s, x) => s + x, 0);
      if (leanSampleTotal > 0) {
        const scale = baseTotal / leanSampleTotal;
        for (const k of Object.keys(leanOverall)) leanOverall[k] = Math.round(leanOverall[k] * scale);
      }
    }

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
    const last14 = R.filter((r) => new Date(r.created_at).getTime() >= d14);
    const prev14 = R.filter((r) => { const t = new Date(r.created_at).getTime(); return t >= d28 && t < d14; });
    const sentiment = {
      net: Math.round(net * 100) / 100,
      shiftPp: Math.round((avg(last7) - avg(prev7)) * 100),
      shift14Pp: Math.round((avg(last14) - avg(prev14)) * 100),
      label: net > 0.1 ? 'Positive' : net < -0.1 ? 'Negative' : 'Neutral',
    };

    // ── D2D coverage (d2d_visits — the field tool's knocks) ──
    // Separate table, separate try/catch: a d2d failure must never take the
    // War Room down, so this degrades to d2d: null. Worker phone stays server-side.
    let d2d: any = null;
    try {
      const buildD2d = () => {
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
        return dq.order('created_at', { ascending: false });
      };
      const V = await fetchAllRows(buildD2d);
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

    // ── INTENSITY LADDER (026) — the campaign's central funnel ──
    // contact → voter → supporter → volunteer → cadre, from the same filtered
    // rows (view carries intensity since 026). Null-degrading like d2d.
    let intensity: any = null;
    try {
      const tiers = [0, 0, 0, 0, 0];
      if (tierCounts) { for (let t = 0; t < 5; t++) tiers[t] = tierCounts[t]; }
      else R.forEach((r) => { const t = typeof r.intensity === 'number' ? r.intensity : 0; if (t >= 0 && t <= 4) tiers[t]++; });
      // Cadre lives in d2d_workers (a registered worker may predate any voice
      // capture, so count the registry too and take the max for tier 4).
      try {
        const { count } = await sb.from('d2d_workers').select('id', { count: 'exact', head: true }).eq('status', 'active');
        if (typeof count === 'number') tiers[4] = Math.max(tiers[4], count);
      } catch {}
      // Conversion between adjacent tiers: of everyone AT OR ABOVE tier n, how
      // many made it to at-or-above n+1.
      const atOrAbove = (n: number) => tiers.slice(n).reduce((s, x) => s + x, 0);
      const conversion = [1, 2, 3].map((n) => {
        const base = atOrAbove(n); const next = atOrAbove(n + 1);
        return base ? Math.round((100 * next) / base) : 0;
      });
      intensity = { tiers, conversion };
    } catch (e) { console.error('[war-room/data] intensity failed:', (e as Error).message); }

    // ── VOLUNTEER PULSE — tier-3+ people: where they are + who just joined ──
    let volunteers: any = null;
    try {
      const vols = R.filter((r) => (r.intensity ?? 0) >= 3);
      const bySeatV = new Map<string, number>();
      vols.forEach((v) => { if (v.constituency) bySeatV.set(v.constituency, (bySeatV.get(v.constituency) || 0) + 1); });
      volunteers = {
        total: vols.length,
        byConstituency: Array.from(bySeatV.entries()).map(([constituency, count]) => ({ constituency, count })).sort((a, b) => b.count - a.count).slice(0, 5),
        recent: vols.slice(0, 6).map((v) => ({ name: v.name, constituency: v.constituency, intensity: v.intensity, created_at: v.created_at })),
      };
    } catch (e) { console.error('[war-room/data] volunteers failed:', (e as Error).message); }

    // ── EVENT MONITOR — campaign_events + RSVP counts (first consumer of 023) ──
    let events: any = null;
    try {
      const { data: evs, error: evErr } = await sb
        .from('campaign_events')
        .select('id, title, topic, constituency, district, venue, event_date, status')
        .in('status', ['planned', 'live'])
        .order('event_date', { ascending: true })
        .limit(5);
      if (evErr) throw evErr;
      if (evs && evs.length) {
        const ids = evs.map((e) => e.id);
        const { data: rsvps } = await sb.from('event_rsvps').select('event_id, status').in('event_id', ids);
        const agg = new Map<string, Record<string, number>>();
        (rsvps || []).forEach((r) => {
          const a = agg.get(r.event_id) || {};
          a[r.status] = (a[r.status] || 0) + 1;
          agg.set(r.event_id, a);
        });
        events = evs.map((e) => {
          const a = agg.get(e.id) || {};
          return { ...e, rsvps: { interested: a.interested || 0, confirmed: a.confirmed || 0, attended: a.attended || 0 } };
        });
      } else events = [];
    } catch (e) { console.error('[war-room/data] events failed:', (e as Error).message); }

    // ── DAILY TARGETS — dashboard_settings 'daily_targets' vs today's actuals ──
    let targets: any = null;
    try {
      const { data: trow } = await sb.from('dashboard_settings').select('value').eq('key', 'daily_targets').maybeSingle();
      const t = trow?.value || null;
      // Actuals: voices = captures today (already computed); volunteers = tier-3+
      // rows whose latest activity is today (v1 approximation — the ladder has no
      // per-tier timestamps yet); knocks = today's d2d visits; events = RSVPs
      // confirmed today.
      const volunteersToday = R.filter((r) => (r.intensity ?? 0) >= 3 && new Date(r.updated_at || r.created_at).getTime() >= todayStart).length;
      let rsvpsToday = 0;
      try {
        const { count } = await sb.from('event_rsvps').select('id', { count: 'exact', head: true })
          .eq('status', 'confirmed').gte('created_at', new Date(todayStart).toISOString());
        rsvpsToday = count || 0;
      } catch {}
      targets = {
        targets: t, // { voices, volunteers, knocks, events } or null when unset
        actuals: { voices: kpis.today, volunteers: volunteersToday, knocks: d2d?.totals?.today || 0, events: rsvpsToday },
      };
    } catch (e) { console.error('[war-room/data] targets failed:', (e as Error).message); }

    // ── DIRECTIVES — recommendations pushed from the leader app / AI (027) ──
    let recommendations: any = null;
    try {
      const { data: recos, error: rErr } = await sb
        .from('campaign_recommendations')
        .select('id, created_at, title, body, source, constituency, status, created_by')
        .order('created_at', { ascending: false })
        .limit(20);
      if (rErr) throw rErr;
      recommendations = recos || [];
    } catch (e) { console.error('[war-room/data] recommendations failed:', (e as Error).message); }

    // ── LISTEN digest — external signals (027): trending, crisis, sources ──
    let listen: any = null;
    try {
      const since14 = new Date(now - 14 * 86400000).toISOString();
      const { data: sigs, error: sErr } = await sb
        .from('listen_signals')
        .select('source, issue_category, sentiment, severity, is_crisis, is_opposition, is_positive, content, constituency, created_at')
        .gte('created_at', since14)
        .order('created_at', { ascending: false })
        .limit(2000);
      if (sErr) throw sErr;
      const S = sigs || [];
      if (S.length) {
        const last7 = S.filter((s) => new Date(s.created_at).getTime() >= d7);
        const prev7 = S.filter((s) => { const t = new Date(s.created_at).getTime(); return t >= d14 && t < d7; });
        const catCount = (arr: any[]) => {
          const m: Record<string, number> = {};
          arr.forEach((s) => { if (s.issue_category) m[s.issue_category] = (m[s.issue_category] || 0) + 1; });
          return m;
        };
        const cur = catCount(last7); const prev = catCount(prev7);
        const trending = Object.entries(cur)
          .map(([category, count]) => ({ category, count, prev: prev[category] || 0, trend: count - (prev[category] || 0) }))
          .sort((a, b) => b.count - a.count).slice(0, 3);
        const srcCount: Record<string, number> = {};
        last7.forEach((s) => { srcCount[s.source] = (srcCount[s.source] || 0) + 1; });
        listen = {
          totals: {
            signals7d: last7.length,
            crisis: last7.filter((s) => s.is_crisis).length,
            opposition: last7.filter((s) => s.is_opposition).length,
            positive: last7.filter((s) => s.is_positive).length,
          },
          trending,
          crisisAlerts: S.filter((s) => s.is_crisis).slice(0, 5).map((s) => ({ content: s.content.slice(0, 140), source: s.source, constituency: s.constituency, created_at: s.created_at })),
          bySource: Object.entries(srcCount).map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
        };
      }
    } catch (e) { console.error('[war-room/data] listen failed:', (e as Error).message); }

    return NextResponse.json({ kpis, momentum, byCategory, leanOverall, swing, byConstituency, seatDetails, matrix, mobilization, channelMix, liveFeed, series, sentiment, d2d, intensity, volunteers, events, targets, recommendations, listen });
  } catch (e) {
    console.error('[war-room/data]', (e as Error).message);
    return NextResponse.json({ error: 'aggregation failed', message: (e as Error).message }, { status: 500 });
  }
}
