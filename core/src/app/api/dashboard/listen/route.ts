// PROXE LISTEN — digest for the dashboard / comms team (GI/PI, ads, agency).
// Trending issues, crisis alerts, opposition vs positive, mood by seat.
// Cookie auth.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/services';

export const dynamic = 'force-dynamic';

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
      .select('source, content, url, sentiment, issue_category, constituency, severity, is_crisis, is_opposition, is_positive, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5000);
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

    const moodBySeat = new Map<string, { pos: number; neg: number; neutral: number }>();
    cur.forEach((s: any) => {
      if (!s.constituency || !s.sentiment) return;
      const a = moodBySeat.get(s.constituency) || { pos: 0, neg: 0, neutral: 0 };
      if (s.sentiment === 'positive') a.pos++; else if (s.sentiment === 'negative') a.neg++; else a.neutral++;
      moodBySeat.set(s.constituency, a);
    });

    return NextResponse.json({
      totals: {
        signals: cur.length,
        crisis: cur.filter((s: any) => s.is_crisis).length,
        opposition: cur.filter((s: any) => s.is_opposition).length,
        positive: cur.filter((s: any) => s.is_positive).length,
      },
      trendingIssues: Object.entries(c)
        .map(([category, count]) => ({ category, count, prev: p[category] || 0, trend: count - (p[category] || 0) }))
        .sort((a, b) => b.count - a.count),
      crisisAlerts: S.filter((s: any) => s.is_crisis).slice(0, 10)
        .map((s: any) => ({ content: s.content.slice(0, 200), source: s.source, url: s.url, constituency: s.constituency, severity: s.severity, created_at: s.created_at })),
      bySource: Object.entries(srcCount).map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
      moodBySeat: Array.from(moodBySeat.entries()).map(([constituency, a]) => ({ constituency, ...a })),
      windowDays: days,
    });
  } catch (e) {
    console.error('[dashboard/listen]', (e as Error).message);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
