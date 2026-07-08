// PROXE LISTEN — digest for the dashboard / comms team (GI/PI, ads, agency).
// Heat score, trending issues, crisis alerts, signal inbox, sentiment-over-time,
// trending keywords, mood-by-region, and a derived "What PROXe thinks" read.
// Cookie auth.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/services';

export const dynamic = 'force-dynamic';

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const cap = (s: string) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// Stopwords stripped before keyword extraction (English + a few transliterated).
const STOP = new Set(('a an the and or but in on at to of for from with without is are was were be been being ' +
  'this that these those it its as by we our us you your they them their he she his her not no nor so if then ' +
  'than too very can cap will just about over under out up down near more most some any all one two three ' +
  'has have had do does did done get got need needs needed still yet even also new news punjab seat area village ' +
  'people youth family families need has says said report reported another week weeks day days month months ' +
  'urgent crisis flop show laare empty viral going fast spreading').split(/\s+/));

export async function GET(req: NextRequest) {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const sb: any = getServiceClient() || authClient;
    const days = parseInt(req.nextUrl.searchParams.get('days') || '7', 10);
    const now = Date.now();
    const since = new Date(now - 2 * days * 86400000).toISOString();
    const cut = now - days * 86400000;

    const { data: sigs, error } = await sb.from('listen_signals')
      .select('source, content, url, author, sentiment, issue_category, constituency, district, severity, is_crisis, is_opposition, is_positive, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(8000);
    if (error) throw error;
    const S = sigs || [];
    const cur = S.filter((s: any) => new Date(s.created_at).getTime() >= cut);
    const prev = S.filter((s: any) => new Date(s.created_at).getTime() < cut);

    const catCount = (arr: any[]) => {
      const m: Record<string, number> = {};
      arr.forEach((s) => { if (s.issue_category) m[s.issue_category] = (m[s.issue_category] || 0) + 1; });
      return m;
    };
    const c = catCount(cur); const p = catCount(prev);

    const srcCount: Record<string, number> = {};
    cur.forEach((s: any) => { srcCount[s.source] = (srcCount[s.source] || 0) + 1; });

    // sentiment tallies
    const pos = cur.filter((s: any) => s.sentiment === 'positive').length;
    const neg = cur.filter((s: any) => s.sentiment === 'negative').length;
    const neu = cur.filter((s: any) => s.sentiment === 'neutral').length;
    const crisis = cur.filter((s: any) => s.is_crisis).length;
    const opp = cur.filter((s: any) => s.is_opposition).length;
    const posN = cur.filter((s: any) => s.is_positive).length;
    const tot = cur.length || 1;

    // ── Heat score (0-100): negativity + crisis density + opposition pressure ──
    const negShare = neg / tot;
    const crisisRate = crisis / tot;
    const oppRate = opp / tot;
    const heatScore = Math.round(100 * clamp(0.40 * negShare + 0.40 * clamp(crisisRate * 8) + 0.20 * clamp(oppRate * 5)));
    const heatLabel = heatScore >= 75 ? 'Critical' : heatScore >= 55 ? 'Elevated' : heatScore >= 30 ? 'Watch' : 'Calm';
    const prevHeatBase = prev.length || 1;
    const prevHeat = Math.round(100 * clamp(
      0.40 * (prev.filter((s: any) => s.sentiment === 'negative').length / prevHeatBase) +
      0.40 * clamp((prev.filter((s: any) => s.is_crisis).length / prevHeatBase) * 8) +
      0.20 * clamp((prev.filter((s: any) => s.is_opposition).length / prevHeatBase) * 5)));

    // ── Mood by seat (+ heat + net) ──
    const moodBySeatMap = new Map<string, { pos: number; neg: number; neutral: number; crisis: number; district: string | null }>();
    cur.forEach((s: any) => {
      if (!s.constituency) return;
      const a = moodBySeatMap.get(s.constituency) || { pos: 0, neg: 0, neutral: 0, crisis: 0, district: s.district || null };
      if (s.sentiment === 'positive') a.pos++; else if (s.sentiment === 'negative') a.neg++; else a.neutral++;
      if (s.is_crisis) a.crisis++;
      moodBySeatMap.set(s.constituency, a);
    });
    const moodBySeat = Array.from(moodBySeatMap.entries()).map(([constituency, a]) => {
      const total = a.pos + a.neg + a.neutral || 1;
      const net = Math.round(((a.pos - a.neg) / total) * 100); // -100..100
      const heat = Math.round(100 * clamp(0.5 * (a.neg / total) + 0.5 * clamp((a.crisis / total) * 6)));
      // pressure damps single-signal seats so they don't top the board on noise
      const pressure = heat * Math.min(1, total / 5);
      return { constituency, district: a.district, pos: a.pos, neg: a.neg, neutral: a.neutral, total, net, heat, pressure };
    }).sort((x, y) => y.pressure - x.pressure || y.total - x.total);

    // ── Daily sentiment series (oldest → newest) ──
    const dayKey = (t: number) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()}`; };
    const series: { day: string; pos: number; neg: number; neutral: number; total: number; crisis: number; opposition: number; positive: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const dayStart = now - (i + 1) * 86400000;
      const dayEnd = now - i * 86400000;
      const inDay = cur.filter((s: any) => { const t = new Date(s.created_at).getTime(); return t >= dayStart && t < dayEnd; });
      series.push({
        day: dayKey(dayStart),
        pos: inDay.filter((s: any) => s.sentiment === 'positive').length,
        neg: inDay.filter((s: any) => s.sentiment === 'negative').length,
        neutral: inDay.filter((s: any) => s.sentiment !== 'positive' && s.sentiment !== 'negative').length,
        total: inDay.length,
        crisis: inDay.filter((s: any) => s.is_crisis).length,
        opposition: inDay.filter((s: any) => s.is_opposition).length,
        positive: inDay.filter((s: any) => s.is_positive).length,
      });
    }

    // ── Trending keywords (freq from content, stopword-filtered) ──
    const wordStats: Record<string, { count: number; pos: number; neg: number }> = {};
    cur.forEach((s: any) => {
      const seen = new Set<string>();
      (s.content || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).forEach((w: string) => {
        if (w.length < 4 || STOP.has(w) || seen.has(w)) return;
        seen.add(w);
        const st = wordStats[w] || (wordStats[w] = { count: 0, pos: 0, neg: 0 });
        st.count++;
        if (s.sentiment === 'positive') st.pos++; else if (s.sentiment === 'negative') st.neg++;
      });
    });
    const prevWordCount: Record<string, number> = {};
    prev.forEach((s: any) => {
      const seen = new Set<string>();
      (s.content || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).forEach((w: string) => {
        if (w.length < 4 || STOP.has(w) || seen.has(w)) return;
        seen.add(w);
        prevWordCount[w] = (prevWordCount[w] || 0) + 1;
      });
    });
    const keywords = Object.entries(wordStats).map(([word, st]) => ({
      word, count: st.count, pos: st.pos, neg: st.neg, trend: st.count - (prevWordCount[word] || 0),
    })).sort((a, b) => b.count - a.count).slice(0, 16);

    // ── Signal inbox (recent, richest first) ──
    const recentSignals = cur.slice(0, 60).map((s: any) => ({
      content: (s.content || '').slice(0, 240), source: s.source, url: s.url || null,
      sentiment: s.sentiment, issue_category: s.issue_category, constituency: s.constituency,
      severity: s.severity, is_crisis: !!s.is_crisis, is_opposition: !!s.is_opposition, is_positive: !!s.is_positive,
      created_at: s.created_at,
    }));

    const trendingIssues = Object.entries(c)
      .map(([category, count]) => ({ category, count: count as number, prev: p[category] || 0, trend: (count as number) - (p[category] || 0) }))
      .sort((a, b) => b.count - a.count);

    // ── "What PROXe thinks" — deterministic read of the window ──
    const topIssue = trendingIssues[0];
    const hottestSeat = moodBySeat[0];
    const tilt = pos > neg ? 'net positive' : neg > pos * 1.3 ? 'clearly negative' : 'mixed';
    const thinkParts: string[] = [];
    if (topIssue) thinkParts.push(`${cap(topIssue.category)} is the loudest issue (${topIssue.count} signals${topIssue.trend > 0 ? `, up ${topIssue.trend} vs the prior window` : topIssue.trend < 0 ? `, easing ${Math.abs(topIssue.trend)}` : ''}).`);
    thinkParts.push(`Overall mood is ${tilt} — ${pos} positive vs ${neg} negative across ${tot} signals.`);
    if (crisis > 0) thinkParts.push(`${crisis} crisis-grade signal${crisis > 1 ? 's need' : ' needs'} rapid response now.`);
    if (hottestSeat && hottestSeat.heat >= 40) thinkParts.push(`${hottestSeat.constituency} is running hottest (heat ${hottestSeat.heat}); watch it closely.`);
    const whatProxeThinks = { heat: heatScore, label: heatLabel, delta: heatScore - prevHeat, text: thinkParts.join(' ') };

    // ── Recommended actions (derived) ──
    const actions: { title: string; detail: string; kind: 'crisis' | 'issue' | 'opposition' | 'positive' | 'seat' }[] = [];
    if (crisis > 0) {
      const cs = cur.find((s: any) => s.is_crisis);
      actions.push({ kind: 'crisis', title: `Deploy rapid response on ${crisis} crisis signal${crisis > 1 ? 's' : ''}`, detail: cs ? `${cs.constituency || 'multiple seats'} — ${(cs.content || '').slice(0, 90)}` : 'Assign a war-room owner and push a holding statement.' });
    }
    if (topIssue && topIssue.trend > 0) {
      actions.push({ kind: 'issue', title: `Get ahead of ${cap(topIssue.category)} — rising ${topIssue.trend}`, detail: `${topIssue.count} signals this window. Brief field teams and prep a ground response.` });
    }
    if (opp > 0) {
      const os = cur.find((s: any) => s.is_opposition);
      actions.push({ kind: 'opposition', title: `Counter opposition narrative (${opp} mentions)`, detail: os ? `${os.constituency || 'state-wide'} — draft a rebuttal and seed it via WhatsApp.` : 'Draft a rebuttal and seed it via WhatsApp.' });
    }
    if (hottestSeat && hottestSeat.heat >= 40) {
      actions.push({ kind: 'seat', title: `Prioritise ${hottestSeat.constituency}`, detail: `Highest heat (${hottestSeat.heat}) — ${hottestSeat.neg} negative signals. Send a senior contact.` });
    }
    const topPos = moodBySeat.filter((m) => m.pos > 0).sort((a, b) => b.pos - a.pos)[0];
    if (topPos && posN > 0) {
      actions.push({ kind: 'positive', title: `Amplify the win in ${topPos.constituency}`, detail: `${topPos.pos} positive signals — turn it into content and share it wider.` });
    }

    return NextResponse.json({
      totals: { signals: cur.length, crisis, opposition: opp, positive: posN, negative: neg, neutral: neu,
        prevSignals: prev.length, trendSignals: cur.length - prev.length,
        prevCrisis: prev.filter((s: any) => s.is_crisis).length,
        prevOpposition: prev.filter((s: any) => s.is_opposition).length,
        prevPositive: prev.filter((s: any) => s.is_positive).length },
      heatScore, heatLabel, prevHeat,
      whatProxeThinks,
      recommendedActions: actions.slice(0, 5),
      trendingIssues,
      keywords,
      crisisAlerts: S.filter((s: any) => s.is_crisis).slice(0, 10)
        .map((s: any) => ({ content: (s.content || '').slice(0, 200), source: s.source, url: s.url, constituency: s.constituency, severity: s.severity, created_at: s.created_at })),
      recentSignals,
      dailySeries: series,
      bySource: Object.entries(srcCount).map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
      moodBySeat,
      windowDays: days,
    });
  } catch (e) {
    console.error('[dashboard/listen]', (e as Error).message);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
