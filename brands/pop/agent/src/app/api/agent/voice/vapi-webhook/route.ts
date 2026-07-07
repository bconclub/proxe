import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient, getClient } from '@/lib/services';
import { BRAND_ID } from '@/configs';
import { extractVapiPerformance, writeVoiceTelemetry } from '@/lib/server/voiceTelemetry';
import { enrichCompletedCall } from '@/lib/server/callEnrichment';

export const dynamic = 'force-dynamic';

// Vapi voice webhook. Handles two event types:
//   • status-update     → write/refresh a voice_sessions row WHILE the call is
//                         live (queued/ringing/in-progress) so the dashboard can
//                         show a call as it happens, not only after it ends.
//                         (Requires the Vapi assistant's serverMessages to include
//                         "status-update"; harmless if it doesn't.)
//   • end-of-call-report→ persist the finished call (voice_sessions + conversations
//                         transcript + summary/recording) + score the lead.
//
// HARDENING: the voice_sessions row is written FIRST — before lead resolution, the
// VoBiz CDR recovery fetch, and lead scoring — each of which can be slow or fail.
// Previously those ran before the session insert, so a downstream timeout/error
// dropped the call from the dashboard even though its transcript was logged. The
// session write now runs up front, in its own try/catch with loud error logging,
// and is enriched (lead/phone/direction) once those are resolved.
// Join key: conversations.metadata.call_id === voice_sessions.external_session_id.

function normalizePhone(raw?: string | null): { full: string | null; norm: string | null } {
  if (!raw) return { full: null, norm: null };
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return { full: null, norm: null };
  let norm = digits;
  if (norm.length === 12 && norm.startsWith('91')) norm = norm.slice(2);
  norm = norm.slice(-10);
  return { full: String(raw).startsWith('+') ? String(raw) : `+${digits}`, norm };
}

// Idempotent voice_sessions upsert keyed on external_session_id (the Vapi call id).
// Null/undefined fields are dropped so an early/sparse write is never clobbered by
// a later enrich pass (and vice-versa). Errors are logged loudly with the full
// Postgres message/details/hint so any constraint/RLS issue is visible immediately.
async function upsertSession(
  supabase: any,
  callId: string,
  fields: Record<string, any> & { createdAtIfNew?: string },
): Promise<void> {
  try {
    const { createdAtIfNew, ...rest } = fields;
    const row: Record<string, any> = { ...rest, updated_at: new Date().toISOString() };
    Object.keys(row).forEach((k) => (row[k] == null) && delete row[k]);

    // external_session_id now has a UNIQUE constraint (added after a webhook-
    // retry race produced 71 duplicate rows for one call — see 2026-07-07
    // incident). A real DB upsert on that constraint closes the race instead
    // of the old select-then-insert-or-update, which let concurrent retries
    // both miss the SELECT and both INSERT. created_at is only included when
    // explicitly given (createdAtIfNew) — an upsert's ON CONFLICT DO UPDATE
    // sets every column in the payload, so including it unconditionally would
    // reset created_at to "now" on every retry instead of the DB default only
    // applying on genuine first insert.
    const payload: Record<string, any> = { external_session_id: callId, brand: BRAND_ID, ...row };
    if (createdAtIfNew) payload.created_at = createdAtIfNew;
    const { error } = await supabase.from('voice_sessions').upsert(payload, { onConflict: 'external_session_id' });
    if (error) console.error('[vapi-webhook] session UPSERT failed:', error.message, error.details, error.hint);
  } catch (e: any) {
    console.error('[vapi-webhook] upsertSession threw:', e?.message);
  }
}

// On an OUTBOUND bridge (VoBiz -> Vapi) both SIP ends are the BCON number, so Vapi's
// customer.number is OUR number, not the lead's — and the two VoBiz legs are NOT
// parent-linked, so we recover the real destination from the VoBiz CDR by matching
// the human leg whose time is closest to the Vapi leg's start.
async function recoverOutboundDestination(startedAtIso: string | null): Promise<{ full: string | null; norm: string | null }> {
  const AID = process.env.VOBIZ_AUTH_ID, TOK = process.env.VOBIZ_AUTH_TOKEN;
  if (!AID || !TOK) return { full: null, norm: null };
  try {
    const res = await fetch(`https://api.vobiz.ai/api/v1/Account/${AID}/Call/?limit=20`, {
      headers: { 'X-Auth-ID': AID, 'X-Auth-Token': TOK },
    });
    if (!res.ok) return { full: null, norm: null };
    const data: any = await res.json();
    const legs = (data?.objects || []).filter((o: any) => {
      const to = String(o.to_number || '');
      return o.call_direction === 'outbound' && !to.includes('sip:') && /^\+?\d{10,15}$/.test(to.replace(/\s/g, ''));
    });
    if (!legs.length) return { full: null, norm: null };
    const target = startedAtIso ? new Date(startedAtIso).getTime() : Date.now();
    let best: any = null, bestDelta = Infinity;
    for (const o of legs) {
      const t = new Date(o.answer_time || o.initiation_time || o.created_at).getTime();
      if (!Number.isFinite(t)) continue;
      const delta = Math.abs(t - target);
      if (delta < bestDelta) { bestDelta = delta; best = o; }
    }
    if (best && bestDelta <= 120000) return normalizePhone(String(best.to_number));
    return { full: null, norm: null };
  } catch (e: any) {
    console.error('[vapi-webhook] recoverOutboundDestination failed:', e?.message);
    return { full: null, norm: null };
  }
}

// Vapi sometimes fires end-of-call-report before its own artifact (transcript,
// recording) has finished processing — the "Vikram" call that showed a
// duration and "completed" status but no transcript/recording was this: the
// webhook payload's messages/recordingUrl were genuinely empty at delivery
// time, even though Vapi had them moments later. One short delayed re-fetch
// of the call object covers that window without adding a retry queue.
async function fetchVapiArtifactFallback(callId: string): Promise<{ messages: any[]; recordingUrl: string | null; summary: string | null }> {
  const key = process.env.VAPI_PRIVATE_API_KEY;
  if (!key) return { messages: [], recordingUrl: null, summary: null };
  await new Promise((r) => setTimeout(r, 4000));
  try {
    const res = await fetch(`https://api.vapi.ai/call/${callId}`, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) return { messages: [], recordingUrl: null, summary: null };
    const d: any = await res.json();
    return {
      messages: d.artifact?.messages || d.messages || [],
      recordingUrl: d.recordingUrl || d.artifact?.recordingUrl || null,
      summary: d.summary || d.analysis?.summary || null,
    };
  } catch (e: any) {
    console.error('[vapi-webhook] artifact fallback fetch failed:', e?.message);
    return { messages: [], recordingUrl: null, summary: null };
  }
}

export async function POST(req: NextRequest) {
  try {
    // Optional shared-secret auth. Set VAPI_WEBHOOK_SECRET (Vercel) + the same
    // value as the assistant's server.secret to enable; skipped if unset.
    const secret = process.env.VAPI_WEBHOOK_SECRET;
    if (secret && req.headers.get('x-vapi-secret') !== secret) {
      console.warn('[vapi-webhook] rejected: bad/missing secret');
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({} as any));
    const msg = body?.message || body || {};
    const type = msg?.type;

    const supabase = getServiceClient() || getClient();
    if (!supabase) {
      console.error('[vapi-webhook] no supabase client');
      return NextResponse.json({ ok: false, error: 'no-db' }); // 200: don't trigger Vapi retries
    }

    const call = msg.call || {};
    const callId = call.id || msg.callId || null;
    const callType = String(call.type || '');
    const provisionalDir: 'inbound' | 'outbound' = /outbound/i.test(callType) ? 'outbound' : 'inbound';

    // ── Live, in-progress call → show it on the dashboard before it ends ──────────
    if (type === 'status-update') {
      const status = String(msg.status || '').toLowerCase();
      // Vapi statuses: queued | ringing | in-progress | forwarding | ended.
      // 'ended' is handled by end-of-call-report; everything else is "live".
      if (callId && status && status !== 'ended') {
        await upsertSession(supabase, callId, {
          call_status: status === 'in-progress' ? 'in-progress' : status,
          call_direction: provisionalDir,
          createdAtIfNew: call.createdAt || new Date().toISOString(),
        });
        await writeVoiceTelemetry({
          callId,
          status,
          direction: provisionalDir,
          provider: 'vapi',
          startedAt: call.startedAt || call.createdAt || null,
          updatedAt: new Date().toISOString(),
          performance: extractVapiPerformance(msg.artifact?.performanceMetrics || call.artifact?.performanceMetrics),
        });
      }
      return NextResponse.json({ ok: true, status: msg.status || null });
    }

    if (type !== 'end-of-call-report') {
      return NextResponse.json({ ok: true, ignored: type || 'unknown' });
    }

    const startedAt = msg.startedAt || call.startedAt || null;
    const endedAt = msg.endedAt || call.endedAt || null;
    let durationSecs = Number(msg.durationSeconds);
    if (!durationSecs && startedAt && endedAt) {
      durationSecs = Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000));
    }
    durationSecs = Number.isFinite(durationSecs) ? durationSecs : 0;

    // ── GUARANTEE the session row up front ───────────────────────────────────────
    // Runs before lead lookup / VoBiz recovery / scoring so none of those can drop
    // the call from the dashboard. Enriched with lead+phone+final direction below.
    if (callId) {
      await upsertSession(supabase, callId, {
        call_status: 'completed',
        call_direction: provisionalDir,
        call_duration_seconds: durationSecs,
        createdAtIfNew: startedAt || new Date().toISOString(),
      });
    }

    // Resolve the real party. customer.number is reliable for INBOUND. For OUTBOUND
    // it is OUR own VoBiz number (bridge artifact) — detect that and recover the
    // actual destination from the VoBiz CDR so the call files under the lead, not us.
    const rawCustomer = msg.customer?.number || call.customer?.number || null;
    let { full: phone, norm } = normalizePhone(rawCustomer);
    // Our own VoBiz sender number, env-driven (per brand). No hardcoded fallback so
    // this file is brand-neutral shared core; if unset the bridge-detection simply
    // doesn't trigger and the inbound path is used.
    const ownNorm = normalizePhone(process.env.VOBIZ_FROM_NUMBER || null).norm;
    let direction: 'inbound' | 'outbound';
    if (norm && ownNorm && norm === ownNorm) {
      direction = 'outbound';
      const rec = await recoverOutboundDestination(startedAt);
      if (rec.norm) {
        phone = rec.full; norm = rec.norm;
      } else {
        console.warn('[vapi-webhook] outbound bridge but could not recover lead number; not filing under our own number');
        phone = null; norm = null;
      }
    } else if (/outbound/i.test(callType)) {
      direction = 'outbound';
    } else {
      direction = 'inbound';
    }

    const endedReason = msg.endedReason || null;
    let summary = msg.summary || msg.analysis?.summary || null;
    let recordingUrl = msg.recordingUrl || msg.artifact?.recordingUrl || call.recordingUrl || null;
    let messages: any[] = msg.artifact?.messages || msg.messages || [];

    if (callId && !messages.length && !recordingUrl && !summary) {
      const fallback = await fetchVapiArtifactFallback(callId);
      if (fallback.messages.length || fallback.recordingUrl || fallback.summary) {
        console.log('[vapi-webhook] artifact fallback recovered data', { callId, turns: fallback.messages.length, hasRecording: !!fallback.recordingUrl });
        messages = fallback.messages;
        recordingUrl = fallback.recordingUrl;
        summary = fallback.summary;
      }
    }

    // The contact name the call was placed with (passed as assistantOverrides at
    // dial time) — so a lead created/updated from a voice call carries a name
    // instead of showing "Unknown caller".
    const vv = call?.assistantOverrides?.variableValues || msg?.assistantOverrides?.variableValues || {};
    const vapiName = String(vv['vh-contactname'] || vv['vh-greetingname'] || vv['vh-businessname'] || '').trim() || null;

    console.log('[vapi-webhook] end-of-call', { callId, phone: norm, direction, durationSecs, endedReason, turns: messages.length, name: vapiName });

    // 1b) If phone-based resolution failed (e.g. outbound bridge couldn't recover
    //     the number), the shared helper falls back to the lead linked at call
    //     INITIATION — the test-call route stamps lead_id onto the session up front.
    const normalizedMessages = messages
      .filter((m: any) => ['user', 'bot', 'assistant'].includes(m.role) && (m.message || m.content))
      .map((m: any) => ({
        role: (m.role === 'user' ? 'user' : 'agent') as 'user' | 'agent',
        content: String(m.message || m.content || ''),
        at: m.time ? new Date(m.time).toISOString() : null,
      }));

    const { leadId } = callId
      ? await enrichCompletedCall({
          supabase,
          callId,
          provider: 'vapi',
          phone,
          phoneNorm: norm,
          direction,
          durationSeconds: durationSecs,
          endedReason,
          startedAt,
          endedAt,
          summary,
          recordingUrl,
          contactName: vapiName,
          messages: normalizedMessages,
        })
      : { leadId: null };

    // Vapi-specific performance metrics aren't covered by the shared helper's
    // generic telemetry write — overwrite with the richer per-turn breakdown.
    if (callId) {
      await writeVoiceTelemetry({
        callId,
        status: 'completed',
        direction,
        leadId,
        durationSeconds: durationSecs,
        endedReason,
        startedAt,
        endedAt,
        provider: 'vapi',
        updatedAt: new Date().toISOString(),
        performance: extractVapiPerformance(msg.artifact?.performanceMetrics || call.artifact?.performanceMetrics),
      });
    }

    return NextResponse.json({ ok: true, leadId, callId, durationSecs });
  } catch (err: any) {
    console.error('[vapi-webhook] error:', err?.message);
    // Always 200 — never make Vapi retry-storm on our own bug.
    return NextResponse.json({ ok: false, error: err?.message || 'error' });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, route: 'vapi-webhook', expects: 'POST status-update | end-of-call-report' });
}
