import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient, getClient } from '@/lib/services';
import { BRAND_ID } from '@/configs';
import Anthropic from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';

// The dashboard reads English. Grievance text extracted from a Punjabi/Hindi call
// may come back in Gurmukhi/Devanagari — translate it to English before storing so
// the People table is always legible. English/Latin text passes straight through;
// on any failure we keep the original rather than lose the grievance.
async function toEnglish(text: string): Promise<string> {
  if (!text) return text;
  if (!/[ऀ-ॿ਀-੿]/.test(text)) return text; // already Latin
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) return text;
  try {
    const anthropic = new Anthropic({ apiKey });
    const model = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
    const resp = await (anthropic.messages.create as any)({
      model, max_tokens: 200,
      system: 'Translate the grievance to concise natural English. Reply with ONLY the English, no quotes or commentary.',
      messages: [{ role: 'user', content: text }],
    });
    const en = (resp.content || []).map((b: any) => b.text || '').join('').trim();
    return en || text;
  } catch { return text; }
}

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

    const { data: sess, error: selErr } = await supabase
      .from('voice_sessions')
      .select('id')
      .eq('external_session_id', callId)
      .maybeSingle();
    if (selErr) console.error('[vapi-webhook] session SELECT failed:', selErr.message);

    if (sess?.id) {
      const { error } = await supabase.from('voice_sessions').update(row).eq('id', sess.id);
      if (error) console.error('[vapi-webhook] session UPDATE failed:', error.message, error.details, error.hint);
    } else {
      const insertRow: Record<string, any> = { external_session_id: callId, brand: BRAND_ID, ...row };
      insertRow.created_at = createdAtIfNew || new Date().toISOString();
      const { error } = await supabase.from('voice_sessions').insert(insertRow);
      if (error) console.error('[vapi-webhook] session INSERT failed:', error.message, error.details, error.hint);
    }
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
    const summary = msg.summary || msg.analysis?.summary || null;
    const recordingUrl = msg.recordingUrl || msg.artifact?.recordingUrl || call.recordingUrl || null;
    const messages: any[] = msg.artifact?.messages || msg.messages || [];

    // The contact name the call was placed with (passed as assistantOverrides at
    // dial time) — so a lead created/updated from a voice call carries a name
    // instead of showing "Unknown caller".
    const vv = call?.assistantOverrides?.variableValues || msg?.assistantOverrides?.variableValues || {};
    // POP grievance calls have no business — never let a business name become the
    // caller's name (it produced leads named "Pulse of Punjab"). Only the typed
    // contact name counts here; the real name is captured in-call via analysis.
    const vapiName = BRAND_ID === 'pop'
      ? (String(vv['vh-contactname'] || '').trim() || null)
      : (String(vv['vh-contactname'] || vv['vh-greetingname'] || vv['vh-businessname'] || '').trim() || null);

    console.log('[vapi-webhook] end-of-call', { callId, phone: norm, direction, durationSecs, endedReason, turns: messages.length, name: vapiName });

    // 1) Find or create the lead (prefer a match in this brand)
    let leadId: string | null = null;
    if (norm) {
      const { data: leads } = await supabase
        .from('all_leads')
        .select('id, brand, customer_name')
        .eq('customer_phone_normalized', norm);
      const existing = leads?.find((l: any) => l.brand === BRAND_ID) || leads?.[0] || null;
      if (existing) {
        leadId = existing.id;
        const updates: any = { last_touchpoint: 'voice', last_interaction_at: new Date().toISOString() };
        if (existing.brand === 'default') updates.brand = BRAND_ID;
        if (vapiName && !existing.customer_name) updates.customer_name = vapiName;
        await supabase.from('all_leads').update(updates).eq('id', leadId);
      } else {
        const { data: created, error: cErr } = await supabase
          .from('all_leads')
          .insert({
            customer_name: vapiName,
            phone,
            customer_phone_normalized: norm,
            brand: BRAND_ID,
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

    // 1b) If phone-based resolution failed (e.g. outbound bridge couldn't recover
    //     the number), fall back to the lead linked at call INITIATION — the
    //     test-call route stamps lead_id onto the session up front.
    if (!leadId && callId) {
      const { data: s } = await supabase
        .from('voice_sessions')
        .select('lead_id')
        .eq('external_session_id', callId)
        .maybeSingle();
      if (s?.lead_id) leadId = s.lead_id;
    }

    // 2) Enrich the session row now that lead + final direction + phone are known.
    if (callId) {
      await upsertSession(supabase, callId, {
        lead_id: leadId,
        customer_phone: phone,
        customer_phone_normalized: norm,
        call_status: 'completed',
        call_direction: direction,
        call_duration_seconds: durationSecs,
      });
    }

    // 2b) POP grievance calls: the assistant's analysisPlan extracts the grievance
    //     fields from the transcript AFTER the call (silently — never spoken). Land
    //     them on the lead's constituent columns so the People table shows
    //     constituency / grievance / lean / intent / loop for this caller.
    //     POP-only + only fields we actually got (never null-overwrite).
    if (BRAND_ID === 'pop' && leadId) {
      const structured: any =
        msg.analysis?.structuredData || call.analysis?.structuredData ||
        msg.analysis?.structuredOutputs || call.analysis?.structuredOutputs || null;
      if (structured && typeof structured === 'object') {
        // The pop all_leads columns carry CHECK constraints (pop_lean_chk etc.).
        // Supabase updates are atomic, so a single off-schema value (e.g. the LLM
        // returning lean="negative") rejects the WHOLE row — losing the grievance
        // text too. So validate every constrained field and drop/map strays.
        const LEAN = ['supporter', 'leaning', 'undecided', 'opposed'];
        const CAT = ['jobs', 'water', 'power', 'roads', 'drugs', 'farm_debt', 'health', 'education', 'other'];
        const INTENT = ['vote', 'volunteer', 'rally', 'share', 'none'];
        // NOTE: no 'negative'→'opposed' — a stray sentiment word is not political
        // opposition. Only genuine anti-party words map to opposed.
        const LEAN_MAP: Record<string, string> = { against: 'opposed', anti: 'opposed', positive: 'supporter', support: 'supporter', supportive: 'supporter', neutral: 'undecided', unsure: 'undecided' };
        const norm = (v: any) => String(v ?? '').toLowerCase().trim();
        const oneOf = (v: any, set: string[]) => (set.includes(norm(v)) ? norm(v) : null);

        const cols: Record<string, any> = {};
        const put = (k: string, v: any) => { if (v !== null && v !== undefined && v !== '') cols[k] = v; };
        put('constituency', typeof structured.constituency === 'string' ? structured.constituency.trim() : null);
        put('district', typeof structured.district === 'string' ? structured.district.trim() : null);
        put('language', oneOf(structured.language, ['pa', 'hi', 'en']));
        put('grievance_category', oneOf(structured.grievance_category, CAT));
        // Always store the grievance in English for the dashboard.
        const gtRaw = typeof structured.grievance_text === 'string' ? structured.grievance_text.trim() : '';
        put('grievance_text', gtRaw ? await toEnglish(gtRaw) : null);
        const sal = Number(structured.salience);
        if (Number.isFinite(sal) && sal >= 1 && sal <= 3) cols.salience = Math.round(sal);
        const intentVal = oneOf(structured.action_intent, INTENT);
        put('action_intent', intentVal);
        // Resolve lean: valid enum → map known synonyms → else infer from intent
        // (a citizen who agrees to vote/volunteer/rally/share leans IN, not opposed).
        let leanVal = oneOf(structured.lean, LEAN) || LEAN_MAP[norm(structured.lean)] || null;
        if (!leanVal && intentVal && ['vote', 'volunteer', 'rally', 'share'].includes(intentVal)) {
          leanVal = 'leaning';
        }
        put('lean', leanVal);
        // The name the caller gave in-call. The extractor may key it as `name` or
        // `caller_name` — accept either.
        const capturedName = String(structured.name || structured.caller_name || '').trim();
        // A logged grievance enters the follow-up loop as "raised".
        if (structured.captured !== false && (cols.grievance_text || cols.grievance_category)) {
          cols.loop_status = 'raised';
        }
        if (capturedName) {
          // A name already on the row — whether set by a prior call or a manual
          // dashboard edit — is authoritative and must never be overwritten by a
          // later call's captured name. Only fill it in when it's genuinely blank.
          const { data: cur } = await supabase.from('all_leads').select('customer_name').eq('id', leadId).maybeSingle();
          if (cur && !cur.customer_name) cols.customer_name = capturedName;
        }
        if (Object.keys(cols).length) {
          const { error: gErr } = await supabase.from('all_leads').update(cols).eq('id', leadId);
          if (gErr) {
            console.error('[vapi-webhook] grievance update failed:', gErr.message);
            // Last resort: write ONLY the free-text grievance so it's never lost.
            if (cols.grievance_text) {
              await supabase.from('all_leads').update({ grievance_text: cols.grievance_text, loop_status: 'raised' }).eq('id', leadId);
            }
          } else {
            console.log('[vapi-webhook] grievance captured →', Object.keys(cols).join(', '));
          }
        }
      }
    }

    // 3) Log transcript turns into conversations (idempotent per call_id).
    //    lead_id may be null (column is nullable); the Calls view joins by call_id,
    //    so the transcript still surfaces even when no lead could be resolved.
    if (messages.length) {
      const { data: already } = await supabase
        .from('conversations')
        .select('id')
        .eq('channel', 'voice')
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

    // 4) Store the call summary + recording link as a summary row (idempotent per
    //    call_id; lead_id may be null — the Calls view joins by call_id).
    if (summary || recordingUrl) {
      const { data: existingSummary } = await supabase
        .from('conversations')
        .select('id')
        .eq('channel', 'voice')
        .filter('metadata->>call_id', 'eq', callId)
        .filter('metadata->>summary', 'eq', 'true')
        .limit(1);
      if (existingSummary && existingSummary.length) {
        // already stored — skip to avoid duplicate recording rows on webhook retry
      } else {
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
    }

    // 5) Trigger lead scoring. Awaited (a fire-and-forget fetch is dropped when the
    //    Vercel lambda freezes) but it runs LAST — all call persistence above is
    //    already committed, so even if scoring is slow/times out the call is saved.
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
  return NextResponse.json({ ok: true, route: 'vapi-webhook', expects: 'POST status-update | end-of-call-report' });
}
