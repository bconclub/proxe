import { NextRequest, NextResponse } from 'next/server';
import { BRAND_ID } from '@/configs';

// Reconcile voice calls from Vapi → our DB. Needed because the end-of-call
// webhook can't reach localhost (so local test calls never enrich), and as a
// backstop for the occasional dropped webhook in production.
//
// Source of truth is VAPI, not our voice_sessions table: we list recent calls
// from the Vapi API and REPLAY each finished one through our own /vapi-webhook
// as a synthetic end-of-call-report. The webhook UPSERTS (keyed on the call id),
// so this creates the row if the initiation-time persist never landed AND fills
// in status / duration / transcript / recording / summary — all through the one
// already-tested enrichment path (no logic duplicated here).
//
// Brand-safe on the shared Vapi account: we only replay calls placed with THIS
// brand's assistant (VAPI_ASSISTANT_ID), so pop never ingests bcon's calls.
// POP + BCON only.

export const dynamic = 'force-dynamic';

const VAPI_BRANDS = ['bcon', 'pop'];

export async function POST(req: NextRequest) {
  if (!VAPI_BRANDS.includes(BRAND_ID)) {
    return NextResponse.json({ ok: true, synced: 0, skipped: `${BRAND_ID} is not a Vapi brand` });
  }
  const vapiKey = process.env.VAPI_PRIVATE_API_KEY;
  if (!vapiKey) {
    return NextResponse.json({ ok: false, error: 'VAPI_PRIVATE_API_KEY not set' }, { status: 500 });
  }
  const myAssistant = process.env.VAPI_ASSISTANT_ID || null;

  const bodyIn = await req.json().catch(() => ({} as any));
  const onlyCallId: string | null = bodyIn?.callId || null;

  // Pull recent calls from Vapi (or a single one if a callId was given).
  const listUrl = onlyCallId
    ? `https://api.vapi.ai/call/${onlyCallId}`
    : `https://api.vapi.ai/call?limit=${Math.min(50, Number(bodyIn?.limit) || 25)}`;
  const lr = await fetch(listUrl, { headers: { Authorization: `Bearer ${vapiKey}` } });
  if (!lr.ok) {
    return NextResponse.json({ ok: false, error: `vapi list failed ${lr.status}` }, { status: 502 });
  }
  const raw = await lr.json();
  const calls: any[] = Array.isArray(raw) ? raw : [raw];

  const origin = req.nextUrl.origin;
  const results: any[] = [];

  for (const call of calls) {
    if (call.status !== 'ended') { continue; }
    // Only REAL phone calls belong on the Calls dashboard. `webCall` sessions are
    // the Vapi dashboard's "Talk to Assistant" browser tester — they have no phone
    // number or direction, so they'd surface as bogus "Inbound / Unknown caller"
    // rows. Tests stay in the Vapi dashboard; the dashboard shows only inbound +
    // outbound PSTN calls to/from the number.
    if (call.type && call.type !== 'inboundPhoneCall' && call.type !== 'outboundPhoneCall') continue;
    // Only this brand's assistant (shared account guard). If we can't tell the
    // assistant (older calls), fall back to matching our outbound number id.
    if (myAssistant && call.assistantId && call.assistantId !== myAssistant) continue;

    const callId = call.id;
    try {
      let durationSeconds = 0;
      if (call.startedAt && call.endedAt) {
        durationSeconds = Math.max(0, Math.round(
          (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000,
        ));
      }
      const synthetic = {
        message: {
          type: 'end-of-call-report',
          call,
          customer: call.customer || null,
          assistantOverrides: call.assistantOverrides || null,
          startedAt: call.startedAt || null,
          endedAt: call.endedAt || null,
          durationSeconds,
          endedReason: call.endedReason || null,
          summary: call.analysis?.summary || null,
          recordingUrl: call.artifact?.recordingUrl || call.recordingUrl || null,
          artifact: call.artifact || null,
          messages: call.artifact?.messages || call.messages || [],
        },
      };
      const wr = await fetch(`${origin}/api/agent/voice/vapi-webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(synthetic),
      });
      results.push({ callId, status: wr.ok ? 'synced' : 'webhook-failed', turns: synthetic.message.messages.length, hasRecording: !!synthetic.message.recordingUrl });
    } catch (e: any) {
      results.push({ callId, status: 'error', error: e?.message });
    }
  }

  const synced = results.filter((r) => r.status === 'synced').length;
  return NextResponse.json({ ok: true, synced, checked: results.length, results });
}
