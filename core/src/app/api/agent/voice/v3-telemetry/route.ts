import { NextRequest, NextResponse } from 'next/server';
import { recordV3Call, V3CallRecord } from '@/lib/server/voiceV3Telemetry';
import { getServiceClient } from '@/lib/services';

// Ingest endpoint for the V3 pipeline (VPS): one POST per completed call with
// per-turn latency, usage, and cost estimate. Auth is a shared secret header -
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
    // MUST be awaited - Vercel freezes the function right after the response
    // is sent, so a detached write gets silently dropped (same bug class as
    // the custom-llm telemetry fix).
    await recordV3Call(body);

    // Flip the voice_sessions row from "queued" → "completed" with the real
    // duration, so V3 calls stop showing as queued·0s in the Calls list (V1 gets
    // this from the Vapi webhook; V3/V2 had no equivalent). Soft-fail.
    try {
      const supabase = getServiceClient();
      if (supabase) {
        const { error } = await supabase
          .from('voice_sessions')
          .update({
            call_status: 'completed',
            call_duration_seconds: Math.round(body.durationSec || 0),
            updated_at: new Date().toISOString(),
          })
          .eq('external_session_id', body.callId);
        if (error) console.error('[v3-telemetry] voice_sessions update failed:', error.message);

        // Transcript → conversations rows (idempotent: only if none exist yet),
        // so V3 calls show a transcript like V1/V2.
        const transcript = Array.isArray(body.transcript) ? body.transcript : [];
        if (transcript.length) {
          const { count } = await supabase
            .from('conversations')
            .select('id', { count: 'exact', head: true })
            .eq('channel', 'voice')
            .filter('metadata->>call_id', 'eq', body.callId);
          if (!count) {
            const base = new Date(body.startedAt || Date.now()).getTime();
            const { data: sess } = await supabase
              .from('voice_sessions').select('lead_id').eq('external_session_id', body.callId).maybeSingle();
            const rows = transcript
              .filter((t: any) => (t?.content || '').trim())
              .map((t: any, i: number) => ({
                lead_id: sess?.lead_id ?? null,
                channel: 'voice',
                message_type: 'text',
                sender: t.role === 'assistant' ? 'agent' : 'customer',
                content: String(t.content),
                metadata: { call_id: body.callId, engine: 'sarvam', turn: i },
                created_at: new Date(base + i * 1000).toISOString(),
              }));
            if (rows.length) await supabase.from('conversations').insert(rows);
          }
        }
      }
    } catch (e: any) {
      console.error('[v3-telemetry] status update failed (non-fatal):', e?.message);
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[v3-telemetry] write failed:', err?.message);
    return NextResponse.json({ error: err?.message || 'error' }, { status: 500 });
  }
}
