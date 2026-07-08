import { NextRequest, NextResponse } from 'next/server';
import { recordV3Call, V3CallRecord } from '@/lib/server/voiceV3Telemetry';

// Ingest endpoint for the V3 pipeline (VPS): one POST per completed call with
// per-turn latency, usage, and cost estimate. Auth is a shared secret header —
// the pipeline is the only caller.

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const expected = process.env.V3_TELEMETRY_KEY;
  if (!expected || req.headers.get('x-v3-key') !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const body = (await req.json()) as V3CallRecord;
    if (!body?.callId) {
      return NextResponse.json({ error: 'callId required' }, { status: 400 });
    }
    // MUST be awaited — Vercel freezes the function right after the response
    // is sent, so a detached write gets silently dropped (same bug class as
    // the custom-llm telemetry fix).
    await recordV3Call(body);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[v3-telemetry] write failed:', err?.message);
    return NextResponse.json({ error: err?.message || 'error' }, { status: 500 });
  }
}
