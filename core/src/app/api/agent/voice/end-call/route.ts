import { NextRequest, NextResponse } from 'next/server';
import { getCurrentBrandId } from '@/configs';

// End a live outbound test call from the dashboard (End Call button). Best-effort
// hangup per engine — the UI clears itself immediately and does NOT depend on
// this succeeding, so we always return 200 with a per-engine note.
//   V3 (sarvam) → the pipeline's own /hangup (cancels the Pipecat task).
//   V1 (vapi)   → the call's live control channel with {type:'end-call'}.
//   V2 (11labs) → no live-hangup API wired; UI clears, call ends on its own.

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { id, engine } = await req.json().catch(() => ({} as any));
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // V3 pipeline
  if (engine === 'sarvam') {
    const base = process.env.V3_PIPELINE_URL || 'http://localhost:8080';
    try {
      const r = await fetch(`${base}/hangup`, { method: 'POST' });
      return NextResponse.json({ ok: r.ok, engine });
    } catch {
      return NextResponse.json({ ok: false, engine, note: 'pipeline unreachable' });
    }
  }

  // V1 Vapi — end via the call's control channel.
  if (engine === 'vapi') {
    const key = process.env.VAPI_PRIVATE_API_KEY;
    if (!key) return NextResponse.json({ ok: false, note: 'VAPI key not set' });
    try {
      const cr = await fetch(`https://api.vapi.ai/call/${id}`, { headers: { Authorization: `Bearer ${key}` } });
      const call: any = cr.ok ? await cr.json() : null;
      const controlUrl = call?.monitor?.controlUrl;
      if (controlUrl) {
        const hr = await fetch(controlUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'end-call' }),
        });
        return NextResponse.json({ ok: hr.ok, engine });
      }
      return NextResponse.json({ ok: false, engine, note: 'no control url (call may have ended)' });
    } catch {
      return NextResponse.json({ ok: false, engine, note: 'vapi end failed' });
    }
  }

  // V2 ElevenLabs — no wired live-hangup; UI clears on its own.
  return NextResponse.json({ ok: true, engine, note: 'ui cleared' });
}
