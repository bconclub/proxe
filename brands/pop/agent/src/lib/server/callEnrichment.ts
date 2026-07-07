import { createHash } from 'crypto';
import { BRAND_ID } from '@/configs';
import { writeVoiceTelemetry } from './voiceTelemetry';

// Vapi (and, going forward, other engines) can retry the end-of-call webhook,
// so this function runs concurrently for the same call more than once. A
// select-then-insert idempotency check has a race — both deliveries can pass
// the SELECT before either INSERT lands, doubling every transcript row (seen
// in prod: every line for a real call stored twice). Deterministic ids +
// upsert/ignoreDuplicates closes the race at the DB level instead of relying
// on an app-side check-then-act.
function deterministicId(seed: string): string {
  const hash = createHash('sha256').update(seed).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

// Shared post-call enrichment for ALL voice engines (V1 Vapi, V2 ElevenLabs,
// V3 Sarvam). Previously only vapi-webhook ran this (lead resolve/create,
// session upsert, transcript log, summary, lead scoring) — V2/V3 calls never
// got transcripts or triggered scoring. Every step here is idempotent so it's
// safe to call repeatedly (e.g. from status polling) without duplicating rows.

export interface EnrichCompletedCallInput {
  supabase: any;
  callId: string;
  provider: 'vapi' | 'elevenlabs' | 'sarvam';
  phone: string | null; // full E.164, if known
  phoneNorm: string | null; // last-10-digit normalized, if known
  direction: 'inbound' | 'outbound';
  durationSeconds: number;
  endedReason?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  summary?: string | null;
  recordingUrl?: string | null;
  contactName?: string | null;
  // Normalized transcript turns, if the provider exposes them (Vapi does; V2/V3
  // may not — pass [] and only the summary/recording row is stored).
  messages?: Array<{ role: 'user' | 'agent'; content: string; at?: string | null }>;
}

async function upsertSession(supabase: any, callId: string, fields: Record<string, any>): Promise<void> {
  try {
    const row: Record<string, any> = { ...fields, updated_at: new Date().toISOString() };
    Object.keys(row).forEach((k) => row[k] == null && delete row[k]);

    // external_session_id has a UNIQUE constraint (added 2026-07-07 after a
    // webhook-retry race produced 71 duplicate rows for one call) — a real
    // upsert closes the race a select-then-insert-or-update couldn't.
    const { error } = await supabase
      .from('voice_sessions')
      .upsert({ external_session_id: callId, brand: BRAND_ID, ...row }, { onConflict: 'external_session_id' });
    if (error) console.error('[callEnrichment] session UPSERT failed:', error.message);
  } catch (e: any) {
    console.error('[callEnrichment] upsertSession threw:', e?.message);
  }
}

export async function enrichCompletedCall(input: EnrichCompletedCallInput): Promise<{ leadId: string | null }> {
  const {
    supabase, callId, provider, phone, phoneNorm, direction, durationSeconds,
    endedReason = null, startedAt = null, endedAt = null, summary = null,
    recordingUrl = null, contactName = null, messages = [],
  } = input;

  // 1) Find or create the lead.
  let leadId: string | null = null;
  if (phoneNorm) {
    const { data: leads } = await supabase
      .from('all_leads')
      .select('id, brand, customer_name')
      .eq('customer_phone_normalized', phoneNorm);
    const existing = leads?.find((l: any) => l.brand === BRAND_ID) || leads?.[0] || null;
    if (existing) {
      leadId = existing.id;
      const updates: any = { last_touchpoint: 'voice', last_interaction_at: new Date().toISOString() };
      if (existing.brand === 'default') updates.brand = BRAND_ID;
      if (contactName && !existing.customer_name) updates.customer_name = contactName;
      await supabase.from('all_leads').update(updates).eq('id', leadId);
    } else {
      const { data: created, error: cErr } = await supabase
        .from('all_leads')
        .insert({
          customer_name: contactName,
          phone,
          customer_phone_normalized: phoneNorm,
          brand: BRAND_ID,
          first_touchpoint: 'voice',
          last_touchpoint: 'voice',
          last_interaction_at: new Date().toISOString(),
          lead_stage: 'New',
        })
        .select('id')
        .single();
      if (cErr) console.error('[callEnrichment] lead insert error:', cErr.message);
      leadId = created?.id || null;
    }
  }

  // 1b) Fall back to the lead linked at call initiation if phone resolution failed.
  if (!leadId && callId) {
    const { data: s } = await supabase
      .from('voice_sessions')
      .select('lead_id')
      .eq('external_session_id', callId)
      .maybeSingle();
    if (s?.lead_id) leadId = s.lead_id;
  }

  // 2) Enrich the session row.
  await upsertSession(supabase, callId, {
    lead_id: leadId,
    customer_phone: phone,
    customer_phone_normalized: phoneNorm,
    call_status: 'completed',
    call_direction: direction,
    call_duration_seconds: durationSeconds,
  });
  await writeVoiceTelemetry({
    callId,
    status: 'completed',
    direction,
    leadId,
    durationSeconds,
    endedReason,
    startedAt,
    endedAt,
    provider,
    updatedAt: new Date().toISOString(),
    performance: null,
  });

  // 3) Log transcript turns. Deterministic per-message id (call_id + index) +
  //    upsert/ignoreDuplicates means a retried webhook delivery hits the same
  //    ids and is silently dropped by the DB, instead of a select-then-insert
  //    race letting both deliveries through.
  if (messages.length) {
    const rows = messages.map((m, i) => ({
      id: deterministicId(`${callId}:msg:${i}`),
      lead_id: leadId,
      channel: 'voice',
      sender: m.role === 'user' ? 'customer' : 'agent',
      content: m.content.slice(0, 4000),
      message_type: 'text',
      metadata: { call_id: callId, source: provider, direction },
      created_at: m.at ? new Date(m.at).toISOString() : new Date().toISOString(),
    }));
    const { error: cErr } = await supabase.from('conversations').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
    if (cErr) console.error('[callEnrichment] conversations upsert error:', cErr.message);
  }

  // 4) Store the summary/recording — same deterministic-id + upsert pattern.
  if (summary || recordingUrl) {
    const { error: smErr } = await supabase.from('conversations').upsert(
      {
        id: deterministicId(`${callId}:summary`),
        lead_id: leadId,
        channel: 'voice',
        sender: 'agent',
        content: summary || '(call recording)',
        message_type: 'text',
        metadata: { call_id: callId, summary: true, recording_url: recordingUrl, ended_reason: endedReason, duration_seconds: durationSeconds },
        created_at: endedAt || new Date().toISOString(),
      },
      { onConflict: 'id', ignoreDuplicates: true },
    );
    if (smErr) console.error('[callEnrichment] summary upsert error:', smErr.message);
  }

  // 5) Trigger lead scoring (awaited, runs last so persistence is already committed).
  if (leadId) {
    try {
      const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4002';
      await fetch(`${origin}/api/webhooks/message-created`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: leadId }),
      });
    } catch (e: any) {
      console.error('[callEnrichment] scoring trigger failed:', e?.message);
    }
  }

  return { leadId };
}
