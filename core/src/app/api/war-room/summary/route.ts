// WAR ROOM AI SUMMARY — one-paragraph command-center readout, on demand.
//
//   GET  → cached { summary, generatedAt } from dashboard_settings
//   POST → regenerate: aggregate the war-room numbers → generateResponse
//          (Brain pattern) → cache → return
//
// Read-only over the same privacy-projected view the War Room uses; the model
// never sees phone/email. Cookie-auth (a director pressing the button).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/services';
import { generateResponse } from '@/lib/agent-core';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CACHE_KEY = 'war_room_summary';
const MODEL = 'claude-sonnet-4-6'; // brain model

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data } = await (supabase as any)
      .from('dashboard_settings')
      .select('value')
      .eq('key', CACHE_KEY)
      .maybeSingle();
    return NextResponse.json((data as any)?.value || { summary: null, generatedAt: null });
  } catch (e) {
    console.error('[war-room/summary] GET error:', e);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}

export async function POST(_req: NextRequest) {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const sb = getServiceClient();
    if (!sb) return NextResponse.json({ error: 'database unavailable' }, { status: 500 });

    // Snapshot: last 7 days from the privacy-projected base view.
    const since7 = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: rows, error } = await sb
      .from('vw_war_room_base')
      .select('constituency, district, lean, magnet, grievance_category, salience, action_intent, loop_status, intensity, created_at')
      .gte('created_at', since7)
      .limit(5000);
    if (error) throw error;
    const R = rows || [];

    const count = (fn: (r: any) => string | null) => {
      const m: Record<string, number> = {};
      R.forEach((r) => { const k = fn(r); if (k) m[k] = (m[k] || 0) + 1; });
      return Object.entries(m).sort((a, b) => b[1] - a[1]);
    };
    const tiers = [0, 0, 0, 0, 0];
    R.forEach((r) => { const t = r.intensity ?? 0; if (t >= 0 && t <= 4) tiers[t]++; });

    // Recent signals + open directives give the summary operational texture.
    const { data: sigs } = await sb.from('listen_signals')
      .select('issue_category, is_crisis, sentiment').gte('created_at', since7).limit(1000);
    const { data: recos } = await sb.from('campaign_recommendations')
      .select('title, status').eq('status', 'new').limit(10);

    const snapshot = {
      last7d: {
        voicesCaptured: R.length,
        topIssues: count((r) => r.grievance_category).slice(0, 5),
        leanSplit: count((r) => r.lean),
        topSeats: count((r) => r.constituency).slice(0, 5),
        channels: count((r) => r.magnet),
        intensityLadder: { contact: tiers[0], voter: tiers[1], supporter: tiers[2], volunteer: tiers[3], cadre: tiers[4] },
        loopResolved: R.filter((r) => r.loop_status === 'resolved').length,
      },
      listenSignals7d: (sigs || []).length,
      crisisSignals: (sigs || []).filter((s) => s.is_crisis).length,
      openDirectives: (recos || []).map((r) => r.title),
    };

    const system = `You are the Pulse of Punjab WAR ROOM analyst. Write a crisp daily command-center summary for campaign directors from the JSON snapshot. 4-6 sentences, plain language, numbers included. Cover: capture volume + momentum, the dominant issues, where support stands (lean + intensity ladder: voter→supporter→volunteer→cadre), anything that needs attention (crisis signals, open directives, weak loop health). No preamble, no markdown headers — just the paragraph.`;

    const summary = await generateResponse(system, JSON.stringify(snapshot), 1200, MODEL, 'brain');
    const value = { summary, generatedAt: new Date().toISOString() };

    await sb.from('dashboard_settings').upsert(
      { key: CACHE_KEY, value, description: 'Cached War Room AI summary', updated_by: user.id },
      { onConflict: 'key' },
    );

    return NextResponse.json(value);
  } catch (e) {
    console.error('[war-room/summary] POST error:', e);
    return NextResponse.json({ error: 'summary generation failed' }, { status: 502 });
  }
}
