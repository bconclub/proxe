import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/services';
import { BRAND_ID } from '@/configs';

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
  if (r.includes('480')) return 'Carrier unavailable - retry';
  if (r.includes('408')) return 'Carrier timeout - retry';
  if (r.includes('wallet') || r.includes('credit')) return 'Out of Vapi credits';
  if (r.includes('error')) return 'Call error';
  return reason;
}

function normalizePhone(raw?: string | null): { full: string | null; norm: string | null } {
  if (!raw) return { full: null, norm: null };
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return { full: null, norm: null };
  const norm = digits.slice(-10);
  return { full: String(raw).startsWith('+') ? String(raw) : `+${digits}`, norm };
}

// The client's `engine` query param is just what the browser remembers picking
// - nothing ties a callId to its engine server-side, so a page refresh (which
// drops that client state) silently falls through to the Vapi status lookup
// below. test-call/route.ts stamps a `call_summary: 'engine:<name>'` marker on
// the voice_sessions row for V2/V3 (there's none for V1/Vapi) - use that as
// the source of truth when a session row exists, falling back to the query
// param only when there's no row yet (e.g. status polled before the insert
// lands, or Supabase is unreachable).
async function resolveEngine(callId: string, clientEngine: string | null): Promise<string | null> {
  const supabase = getServiceClient();
  if (!supabase) return clientEngine;
  try {
    const { data: sess } = await supabase
      .from('voice_sessions')
      .select('call_summary')
      .eq('external_session_id', callId)
      .maybeSingle();
    if (!sess) return clientEngine;
    const marker = String(sess.call_summary || '');
    if (marker === 'engine:sarvam') return 'sarvam';
    if (marker === 'engine:elevenlabs') return 'elevenlabs';
    return 'vapi';
  } catch {
    return clientEngine;
  }
}

// V1 (Vapi) gets full post-call enrichment via vapi-webhook's end-of-call-report.
// V2 (ElevenLabs) and V3 (Sarvam) have no equivalent webhook - this status
// poller is the only place that ever learns a call ended, so it runs the same
// enrichment once, when `ended` flips true. Guarded on the session's own
// call_status so repeated polls (this route is hit every couple seconds while
// a call is live) don't re-run it or re-trigger lead scoring per poll.
async function enrichIfNewlyEnded(
  callId: string,
  provider: 'elevenlabs' | 'sarvam',
  opts: { durationSeconds: number | null; endedReason: string | null; summary: string | null; number: string | null },
): Promise<void> {
  const supabase = getServiceClient();
  if (!supabase) return;
  try {
    const { data: sess } = await supabase
      .from('voice_sessions')
      .select('id, call_status, lead_id, customer_phone, customer_phone_normalized, call_direction')
      .eq('external_session_id', callId)
      .maybeSingle();
    if (!sess || sess.call_status === 'completed') return; // already enriched or unknown call

    const fromNumber = opts.number ? normalizePhone(opts.number) : { full: null, norm: null };
    const phone = sess.customer_phone || fromNumber.full;
    const phoneNorm = sess.customer_phone_normalized || fromNumber.norm;
    const direction: 'inbound' | 'outbound' = sess.call_direction === 'inbound' ? 'inbound' : 'outbound';

    // Resolve/create the lead the same way vapi-webhook does, falling back to
    // the lead already linked at call initiation (test-call stamps it) if
    // phone resolution comes up empty.
    let leadId: string | null = sess.lead_id || null;
    if (!leadId && phoneNorm) {
      const { data: leads } = await supabase
        .from('all_leads')
        .select('id, brand')
        .eq('customer_phone_normalized', phoneNorm);
      const existing = leads?.find((l: any) => l.brand === BRAND_ID) || leads?.[0] || null;
      if (existing) {
        leadId = existing.id;
        await supabase.from('all_leads').update({ last_touchpoint: 'voice', last_interaction_at: new Date().toISOString() }).eq('id', leadId);
      } else {
        const { data: created } = await supabase
          .from('all_leads')
          .insert({
            phone, customer_phone_normalized: phoneNorm, brand: BRAND_ID,
            first_touchpoint: 'voice', last_touchpoint: 'voice',
            last_interaction_at: new Date().toISOString(), lead_stage: 'New',
          })
          .select('id').single();
        leadId = created?.id || null;
      }
    }

    await supabase.from('voice_sessions').update({
      lead_id: leadId,
      customer_phone: phone,
      customer_phone_normalized: phoneNorm,
      call_status: 'completed',
      call_duration_seconds: opts.durationSeconds || 0,
      updated_at: new Date().toISOString(),
    }).eq('id', sess.id);

    if (opts.summary) {
      const { error: smErr } = await supabase.from('conversations').insert({
        lead_id: leadId,
        channel: 'voice',
        sender: 'agent',
        content: opts.summary,
        message_type: 'text',
        metadata: { call_id: callId, source: provider, summary: true, ended_reason: opts.endedReason, duration_seconds: opts.durationSeconds },
        created_at: new Date().toISOString(),
      });
      if (smErr) console.error(`[call-status:${provider}] summary insert failed:`, smErr.message);
    }

    if (leadId) {
      try {
        const origin = process.env.NEXT_PUBLIC_APP_URL || new URL('https://pop-proxe.vercel.app').origin;
        await fetch(`${origin}/api/webhooks/message-created`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lead_id: leadId }),
        });
      } catch (e: any) {
        console.error(`[call-status:${provider}] scoring trigger failed:`, e?.message);
      }
    }
  } catch (e: any) {
    console.error(`[call-status:${provider}] enrichment failed (non-fatal):`, e?.message);
  }
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  const engine = await resolveEngine(id || '', req.nextUrl.searchParams.get('engine'));
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // V3 (Sarvam pipeline) tracks its own live state - poll it instead of Vapi.
  if (engine === 'sarvam') {
    const base = process.env.V3_PIPELINE_URL;
    if (!base) return NextResponse.json({ error: 'V3_PIPELINE_URL not configured' }, { status: 500 });
    try {
      const r = await fetch(`${base}/status`, { cache: 'no-store' });
      const d: any = await r.json();
      const ended = !!d.ended;
      if (ended) {
        await enrichIfNewlyEnded(id, 'sarvam', { durationSeconds: null, endedReason: null, summary: null, number: null });
      }
      return NextResponse.json({
        status: d.status || 'ringing', // ringing | in-progress | ended
        ended,
        endedReason: null,
        reasonText: ended ? 'Call ended' : null,
        durationSeconds: null,
        number: null,
        summary: null,
      });
    } catch {
      // Pipeline unreachable - report as still connecting so the UI doesn't error out.
      return NextResponse.json({ status: 'ringing', ended: false });
    }
  }

  if (engine === 'elevenlabs') {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) return NextResponse.json({ error: 'ELEVENLABS_API_KEY not set' }, { status: 500 });

    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(id)}`, {
        headers: { 'xi-api-key': key, Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!res.ok) {
        if (res.status === 404) {
          return NextResponse.json({ status: 'placed', ended: false });
        }
        const body = await res.text();
        return NextResponse.json({ error: body || 'ElevenLabs lookup failed' }, { status: res.status });
      }

      const d: any = await res.json();
      const raw = String(d.status || d.call_status || '').toLowerCase();
      const endedReason = d.termination_reason || d.metadata?.termination_reason || null;
      const ended = !!endedReason || ['done', 'ended', 'completed', 'failed', 'error'].includes(raw);
      const durationSeconds =
        typeof d.metadata?.call_duration_secs === 'number'
          ? d.metadata.call_duration_secs
          : typeof d.call_duration_secs === 'number'
            ? d.call_duration_secs
            : null;
      const status = ended
        ? 'ended'
        : raw.includes('progress') || raw.includes('started')
          ? 'in-progress'
          : raw.includes('ring')
            ? 'ringing'
            : 'placed';

      const number = d.metadata?.phone_call?.external_number || null;
      const summary = d.transcript_summary || d.analysis?.transcript_summary || null;
      if (ended) {
        await enrichIfNewlyEnded(id, 'elevenlabs', { durationSeconds, endedReason, summary, number });
      }
      return NextResponse.json({
        status,
        ended,
        endedReason,
        reasonText: endedReason ? friendlyReason(String(endedReason)) : ended ? 'Call ended' : null,
        durationSeconds,
        number,
        summary,
      });
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

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
