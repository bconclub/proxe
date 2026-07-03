import { NextRequest, NextResponse } from 'next/server';

// Live status for an in-flight outbound call, polled by the dashboard "Call a
// Number" card so you can see ringing -> connected -> ended (or why it failed),
// instead of fire-and-forget. Proxies Vapi GET /call/{id} (private key stays
// server-side) and returns a small, friendly shape.

export const dynamic = 'force-dynamic';

// Map Vapi endedReason codes to short human text for the UI.
function friendlyReason(reason: string | null): string | null {
  if (!reason) return null;
  const r = reason.toLowerCase();
  if (r.includes('customer-ended')) return 'Lead hung up';
  if (r.includes('assistant-ended') || r.includes('assistant-said-end')) return 'Agent wrapped up';
  if (r.includes('customer-busy')) return 'Line was busy';
  if (r.includes('no-answer') || r.includes('customer-did-not-answer')) return 'No answer';
  if (r.includes('480')) return 'Carrier unavailable — retry';
  if (r.includes('408')) return 'Carrier timeout — retry';
  if (r.includes('wallet') || r.includes('credit')) return 'Out of Vapi credits';
  if (r.includes('error')) return 'Call error';
  return reason;
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const key = process.env.VAPI_PRIVATE_API_KEY;
  if (!key) return NextResponse.json({ error: 'VAPI_PRIVATE_API_KEY not set' }, { status: 500 });

  try {
    const res = await fetch(`https://api.vapi.ai/call/${id}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      const body = await res.text();
      return NextResponse.json({ error: body || 'lookup failed' }, { status: res.status });
    }
    const d: any = await res.json();

    let durationSeconds: number | null = null;
    if (d.startedAt && d.endedAt) {
      durationSeconds = Math.max(0, Math.round((new Date(d.endedAt).getTime() - new Date(d.startedAt).getTime()) / 1000));
    }

    return NextResponse.json({
      status: d.status || null,                 // queued | ringing | in-progress | ended
      ended: d.status === 'ended',
      endedReason: d.endedReason || null,
      reasonText: friendlyReason(d.endedReason || null),
      durationSeconds,
      number: d.customer?.number || null,
      summary: d.summary || d.analysis?.summary || null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
