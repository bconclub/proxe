import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient, getClient } from '@/lib/services';

export const dynamic = 'force-dynamic';

// Vapi end-of-call webhook. Vapi POSTs an `end-of-call-report` here when a call
// finishes; we persist it into PROXe (all_leads + voice_sessions + conversations)
// so calls show up in the dashboard. Column shapes mirror the retired voice
// server (server.js) — the generated DB types are stale and under-report them.
// IMPORTANT: every DB write is awaited before responding — on Vercel a fire-and-
// forget write after the response is dropped when the lambda freezes.

function normalizePhone(raw?: string | null): { full: string | null; norm: string | null } {
  if (!raw) return { full: null, norm: null };
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return { full: null, norm: null };
  let norm = digits;
  if (norm.length === 12 && norm.startsWith('91')) norm = norm.slice(2);
  norm = norm.slice(-10);
  return { full: String(raw).startsWith('+') ? String(raw) : `+${digits}`, norm };
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

    if (type !== 'end-of-call-report') {
      return NextResponse.json({ ok: true, ignored: type || 'unknown' });
    }

    const supabase = getServiceClient() || getClient();
    if (!supabase) {
      console.error('[vapi-webhook] no supabase client');
      return NextResponse.json({ ok: false, error: 'no-db' }); // 200: don't trigger Vapi retries
    }

    const call = msg.call || {};
    const callId = call.id || msg.callId || null;
    const customerNumber = msg.customer?.number || call.customer?.number || null;
    const { full: phone, norm } = normalizePhone(customerNumber);

    const callType = String(call.type || '');
    const direction = /inbound/i.test(callType) ? 'inbound' : 'outbound';

    const startedAt = msg.startedAt || call.startedAt || null;
    const endedAt = msg.endedAt || call.endedAt || null;
    let durationSecs = Number(msg.durationSeconds);
    if (!durationSecs && startedAt && endedAt) {
      durationSecs = Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000));
    }
    durationSecs = Number.isFinite(durationSecs) ? durationSecs : 0;

    const endedReason = msg.endedReason || null;
    const summary = msg.summary || msg.analysis?.summary || null;
    const recordingUrl = msg.recordingUrl || msg.artifact?.recordingUrl || call.recordingUrl || null;
    const messages: any[] = msg.artifact?.messages || msg.messages || [];

    console.log('[vapi-webhook] end-of-call', { callId, phone: norm, direction, durationSecs, endedReason, turns: messages.length });

    // 1) Find or create the lead (prefer a bcon-branded match)
    let leadId: string | null = null;
    if (norm) {
      const { data: leads } = await supabase
        .from('all_leads')
        .select('id, brand')
        .eq('customer_phone_normalized', norm);
      const existing = leads?.find((l: any) => l.brand === 'bcon') || leads?.[0] || null;
      if (existing) {
        leadId = existing.id;
        const updates: any = { last_touchpoint: 'voice', last_interaction_at: new Date().toISOString() };
        if (existing.brand === 'default') updates.brand = 'bcon';
        await supabase.from('all_leads').update(updates).eq('id', leadId);
      } else {
        const { data: created, error: cErr } = await supabase
          .from('all_leads')
          .insert({
            phone,
            customer_phone_normalized: norm,
            brand: 'bcon',
            first_touchpoint: 'voice',
            last_touchpoint: 'voice',
            last_interaction_at: new Date().toISOString(),
            lead_stage: 'New',
          })
          .select('id')
          .single();
        if (cErr) console.error('[vapi-webhook] lead insert error:', cErr.message);
        leadId = created?.id || null;
      }
    }

    // 2) Upsert the voice session (only columns proven to exist)
    if (callId) {
      const { data: sess } = await supabase
        .from('voice_sessions')
        .select('id')
        .eq('external_session_id', callId)
        .maybeSingle();
      const sessRow: any = {
        lead_id: leadId,
        external_session_id: callId,
        customer_phone: phone,
        customer_phone_normalized: norm,
        call_status: 'completed',
        call_direction: direction,
        brand: 'bcon',
        call_duration_seconds: durationSecs,
        updated_at: new Date().toISOString(),
      };
      if (sess?.id) {
        await supabase.from('voice_sessions').update(sessRow).eq('id', sess.id);
      } else {
        sessRow.created_at = startedAt || new Date().toISOString();
        const { error: sErr } = await supabase.from('voice_sessions').insert(sessRow);
        if (sErr) console.error('[vapi-webhook] voice_session insert error:', sErr.message);
      }
    }

    // 3) Log transcript turns into conversations (idempotent per call_id)
    if (leadId && messages.length) {
      const { data: already } = await supabase
        .from('conversations')
        .select('id')
        .eq('lead_id', leadId)
        .filter('metadata->>call_id', 'eq', callId)
        .limit(1);
      if (!already || already.length === 0) {
        const rows = messages
          .filter((m: any) => ['user', 'bot', 'assistant'].includes(m.role) && (m.message || m.content))
          .map((m: any) => ({
            lead_id: leadId,
            channel: 'voice',
            sender: m.role === 'user' ? 'customer' : 'agent',
            content: String(m.message || m.content || '').slice(0, 4000),
            message_type: 'text',
            metadata: { call_id: callId, source: 'vapi', direction },
            created_at: m.time ? new Date(m.time).toISOString() : new Date().toISOString(),
          }));
        if (rows.length) {
          const { error: cErr } = await supabase.from('conversations').insert(rows);
          if (cErr) console.error('[vapi-webhook] conversations insert error:', cErr.message);
        }
      }
    }

    // 4) Store the call summary + recording link as a summary row
    if (leadId && (summary || recordingUrl)) {
      const { error: smErr } = await supabase.from('conversations').insert({
        lead_id: leadId,
        channel: 'voice',
        sender: 'agent',
        content: summary || '(call recording)',
        message_type: 'text',
        metadata: {
          call_id: callId,
          summary: true,
          recording_url: recordingUrl,
          ended_reason: endedReason,
          duration_seconds: durationSecs,
        },
        created_at: endedAt || new Date().toISOString(),
      });
      if (smErr) console.error('[vapi-webhook] summary insert error:', smErr.message);
    }

    // 5) Trigger lead scoring (awaited so it survives the serverless freeze)
    if (leadId) {
      try {
        const origin = new URL(req.url).origin;
        await fetch(`${origin}/api/webhooks/message-created`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lead_id: leadId }),
        });
      } catch (e: any) {
        console.error('[vapi-webhook] scoring trigger failed:', e?.message);
      }
    }

    return NextResponse.json({ ok: true, leadId, callId, durationSecs });
  } catch (err: any) {
    console.error('[vapi-webhook] error:', err?.message);
    // Always 200 — never make Vapi retry-storm on our own bug.
    return NextResponse.json({ ok: false, error: err?.message || 'error' });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, route: 'vapi-webhook', expects: 'POST end-of-call-report' });
}
