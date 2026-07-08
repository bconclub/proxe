import { getBrandConfig, getCurrentBrandId, BRAND_ID } from '@/configs';
import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/services';
import { ensureOrUpdateLead } from '@/lib/services/leadManager';
// POP grievance voice prompts per starting language (pa/hi/en). Resolved from the
// ONE core place — the dashboard-editable override in dashboard_settings, falling
// back to the brand file defaults. Overriding the Vapi prompt + opening per call
// (below) carries the edited prompt onto the LIVE assistant without touching the
// API-managed golden config, and lets us dial the same number in any language.
import { VOICE_ASR_LANG, isVoiceLang } from '@brand/prompts/voice-langs';
import { resolveVoicePrompt } from '@/lib/server/voicePromptConfig';

// Two outbound flavors, picked per brand:
//
// VAPI (bcon, pop — the voice-enabled brands): calls are ORIGINATED by Vapi
// (Vapi -> VoBiz BYO trunk -> PSTN), NOT by the VoBiz Call API. This is the only
// path that carries lead context: the old VoBiz->Vapi bridge drops all custom SIP
// headers, so the agent never saw the name. Originating from Vapi lets us pass
// name/business/industry as assistantOverrides variableValues -> the prompt's
// {{vh-contactname}} / {{vh-businessname}} / {{vh-industry}} -> the agent greets
// the lead by name with full context.
// Requires (Vercel env): VAPI_PRIVATE_API_KEY. The phone number + assistant ids
// default to the live BCON outbound number (on the VoBiz "Vapi Outbound" trunk
// credential, outboundLeadingPlusEnabled MUST be false) and the PROXe assistant.
//
// VOBIZ (lokazen, windchasers — voice currently off): legacy direct VoBiz Call API
// with the /answer webhook. Kept as-is for fork parity until those brands move.

const VAPI_BRANDS = ['bcon', 'pop'];

const VAPI_OUTBOUND_PHONE_NUMBER_ID =
  process.env.VAPI_OUTBOUND_PHONE_NUMBER_ID || 'e03b4b96-a3ce-4b4f-91d3-de9ad5c70529';
const VAPI_ASSISTANT_ID =
  process.env.VAPI_ASSISTANT_ID || '999bf28c-6c2e-402d-8b05-a24899749a22';

// ElevenLabs end-to-end telephony (POP A/B). The agent "Grievance PUNJAB" dials
// out over the SAME Vobiz trunk as Vapi (a dedicated `elevenlabs-pop` SIP
// credential), so it's the same number/caller — only the brain differs. Lets us
// compare 11labs' own STT+LLM+TTS+turn-taking against the Vapi pipeline.
const ELEVENLABS_AGENT_ID = process.env.ELEVENLABS_AGENT_ID;
const ELEVENLABS_PHONE_NUMBER_ID = process.env.ELEVENLABS_PHONE_NUMBER_ID;

async function vapiTestCall(body: any) {
  const { phone, leadName, contactName, businessName, industry } = body;
  if (!phone) return NextResponse.json({ error: 'Phone required' }, { status: 400 });

  // POP grievance: which starting language this call runs in (pa/hi/en). We
  // override the assistant's system prompt + opening with the matching variant
  // so (a) the no-repeat guardrail is always on and (b) the same number can be
  // dialed in any language. Other brands keep their own assistant prompt.
  const isPopGrievance = BRAND_ID === 'pop';
  // Resolve from the dashboard-editable override (falls back to file defaults).
  const voicePrompt = isPopGrievance ? await resolveVoicePrompt(body.language) : null;
  const voiceLang = voicePrompt?.lang ?? null;

  const name = (contactName || leadName || '').trim();
  // POP grievance calls have NO business concept — ignore any businessName the
  // client sends (a stale form defaulted it to the brand name, which then leaked
  // into the greeting and named leads "Pulse of Punjab"). Other brands keep it.
  const business = BRAND_ID === 'pop' ? '' : (businessName || '').trim();
  // Greeting target: confirm the person if we have a name, else the company.
  // ("Hi, is this Thanzeel?" vs "Hi, is this AB Developers?"). When there's no
  // person, vh-contactname stays empty so the agent asks to be put through.
  //
  // POP grievance calls dial constituents whose name is often UNKNOWN — a bare
  // number must still call. Empty vh-greetingname/vh-contactname tell the
  // grievance agent to introduce itself and ask who it's speaking with. The
  // name requirement stays for bcon's B2B flow, where a nameless cold call is
  // always a mistake.
  const greetingName = name || business;
  if (!greetingName && BRAND_ID !== 'pop') {
    return NextResponse.json({ error: 'A contact name or business name is required' }, { status: 400 });
  }
  const vapiKey = process.env.VAPI_PRIVATE_API_KEY;
  if (!vapiKey) {
    return NextResponse.json(
      { success: false, error: 'VAPI_PRIVATE_API_KEY not set in environment' },
      { status: 500 },
    );
  }

  // Normalize the destination to E.164 India. Form may send a bare 10-digit number.
  const digits = String(phone).replace(/\D/g, '');
  const last10 = digits.slice(-10);
  const e164 = digits.length === 12 && digits.startsWith('91') ? `+${digits}` : `+91${last10}`;

  // Current India/IST time so the agent books realistic slots (11 AM–5 PM, not now,
  // after-hours -> next day). Passed as the {{vh-now}} prompt variable.
  const istNow = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(new Date());

  // POP's grievance agent GREETS in Punjabi, but its base transcriber on Vapi is
  // English-only (deepgram flux-general-en) — so constituent replies come back as
  // garbage and the agent loops its opening. Override the transcriber per-call
  // (never touching the shared Vapi assistant) to a Punjabi-capable model. All
  // three knobs are env-tunable so the provider/language can be swapped without a
  // code change if accuracy needs work. POP only; other brands keep their config.
  // Transcriber override is OPT-IN: only when VAPI_POP_TRANSCRIBER_PROVIDER is
  // explicitly set. Default = no override, so the POP Grievance assistant's OWN
  // transcriber (set in the Vapi dashboard) wins — that assistant is POP-dedicated,
  // so tuning it in Vapi is the clean home for this, and an unconditional code
  // override would otherwise silently mask whatever's picked in the dashboard.
  // Transcriber language follows the selected call language (pa-IN/hi-IN/en-IN)
  // so constituent replies aren't fed to an English-only model and returned as
  // garbage (the loop-the-opening bug). Provider/model stay env-tunable; the
  // per-call language wins over the static env language.
  const asrLanguage =
    (voiceLang && VOICE_ASR_LANG[voiceLang]) || process.env.VAPI_POP_TRANSCRIBER_LANGUAGE;
  const popTranscriber =
    BRAND_ID === 'pop' && process.env.VAPI_POP_TRANSCRIBER_PROVIDER
      ? {
          provider: process.env.VAPI_POP_TRANSCRIBER_PROVIDER,
          ...(process.env.VAPI_POP_TRANSCRIBER_MODEL ? { model: process.env.VAPI_POP_TRANSCRIBER_MODEL } : {}),
          ...(asrLanguage ? { language: asrLanguage } : {}),
        }
      : null;

  // A `model` override in Vapi is NOT deep-merged — it's validated standalone and
  // REQUIRES provider (else: "model.provider must be one of …"). So to swap only
  // the system prompt per language we must carry the assistant's real model
  // config (provider/model/temperature/tools) and replace just its messages.
  // Fetch it once; fall back to env/openai defaults if the read fails so a call
  // still goes out. POP-only (other brands don't override the prompt).
  let modelOverride: any = null;
  if (voicePrompt) {
    const sysMsg = { role: 'system', content: voicePrompt.prompt };
    try {
      const aRes = await fetch(`https://api.vapi.ai/assistant/${VAPI_ASSISTANT_ID}`, {
        headers: { Authorization: `Bearer ${vapiKey}` },
      });
      const assistant = aRes.ok ? await aRes.json() : null;
      const baseModel = assistant?.model;
      if (baseModel?.provider && baseModel?.model) {
        // Build a MINIMAL override: provider + model are required; carry
        // temperature/maxTokens only if the assistant actually set them (sending
        // a null field back can itself be rejected). Preserve any non-system
        // messages, then prepend our per-language system prompt.
        const nonSystem = Array.isArray(baseModel.messages)
          ? baseModel.messages.filter((m: any) => m.role !== 'system')
          : [];
        modelOverride = {
          provider: baseModel.provider,
          model: baseModel.model,
          ...(baseModel.temperature != null ? { temperature: baseModel.temperature } : {}),
          ...(baseModel.maxTokens != null ? { maxTokens: baseModel.maxTokens } : {}),
          messages: [sysMsg, ...nonSystem],
        };
      }
    } catch {
      /* fall through to default below */
    }
    if (!modelOverride) {
      modelOverride = {
        provider: process.env.VAPI_POP_LLM_PROVIDER || 'openai',
        model: process.env.VAPI_POP_LLM_MODEL || 'gpt-4o-mini',
        messages: [sysMsg],
      };
    }
  }

  try {
    const res = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${vapiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phoneNumberId: VAPI_OUTBOUND_PHONE_NUMBER_ID,
        assistantId: VAPI_ASSISTANT_ID,
        assistantOverrides: {
          ...(popTranscriber ? { transcriber: popTranscriber } : {}),
          // Per-language prompt + opening. Deep-merged by Vapi, so only the
          // system message + first line change — provider/model/voice stay as
          // configured on the assistant. This is where the no-repeat guardrail
          // lands on every live call.
          ...(voicePrompt
            ? {
                firstMessage: voicePrompt.firstMessage,
                ...(modelOverride ? { model: modelOverride } : {}),
              }
            : {}),
          variableValues: {
            'vh-contactname': name,
            'vh-greetingname': greetingName,
            'vh-businessname': business,
            'vh-industry': industry || '',
            'vh-now': istNow,
          },
        },
        customer: { number: e164 },
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ success: false, error: data?.message || data }, { status: res.status });
    }

    const callId: string | null = data?.id || null;

    // Persist the call NOW, at initiation — so it shows up in the Calls list with
    // the real contact (name + number) instead of "Unknown caller", and carries a
    // lead_id for the transcript/recording join. The Vapi webhook later ENRICHES
    // this same row (keyed on external_session_id) without clobbering these fields.
    // Soft-fail: a DB hiccup must never break the call that's already dialing.
    if (callId) {
      try {
        const supabase = getServiceClient();
        if (supabase) {
          // Create/link the lead with the name the user entered, so leadName
          // resolves (the agent already greets by this name on the call).
          const leadId = await ensureOrUpdateLead(
            name || business || null, null, e164, 'voice', undefined, supabase,
          );

          const sessionFields: Record<string, any> = {
            lead_id: leadId,
            customer_phone: e164,
            customer_phone_normalized: last10,
            call_direction: 'outbound',
            call_status: 'queued',
            brand: BRAND_ID,
            updated_at: new Date().toISOString(),
          };

          const { data: existing } = await supabase
            .from('voice_sessions')
            .select('id')
            .eq('external_session_id', callId)
            .maybeSingle();

          // Supabase does NOT throw on write errors — it returns { error }. These
          // were previously unchecked, so a failing insert vanished silently (no
          // row, no log) and the call never appeared in the dashboard.
          if (existing?.id) {
            const { error: upErr } = await supabase.from('voice_sessions').update(sessionFields).eq('id', existing.id);
            if (upErr) console.error('[test-call] voice_sessions update failed:', upErr.message, upErr.details || '');
          } else {
            const { error: insErr } = await supabase
              .from('voice_sessions')
              .insert({ external_session_id: callId, created_at: new Date().toISOString(), ...sessionFields });
            if (insErr) console.error('[test-call] voice_sessions insert failed:', insErr.message, insErr.details || '');
          }
        } else {
          console.error('[test-call] getServiceClient() returned null — no service key at runtime');
        }
      } catch (e: any) {
        console.error('[test-call] failed to persist lead/session (non-fatal):', e?.message);
      }
    }

    return NextResponse.json({ success: true, callId });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

async function vobizTestCall(req: NextRequest) {
  const { phone, leadName, direction = 'outbound' } = await req.json();
  if (!phone) return NextResponse.json({ error: 'Phone required' }, { status: 400 });

  try {
    const authId = process.env.VOBIZ_AUTH_ID;
    const authToken = process.env.VOBIZ_AUTH_TOKEN;
    const fromNumber = process.env.VOBIZ_FROM_NUMBER;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://proxe.bconclub.com';
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    const answerUrl = `${baseUrl}/api/agent/voice/answer?direction=${direction}&lead_name=${encodeURIComponent(leadName || '')}&lead_phone=${cleanPhone}`;

    const res = await fetch(
      `https://api.vobiz.ai/api/v1/Account/${authId}/Call/`,
      {
        method: 'POST',
        headers: {
          'X-Auth-ID': authId || '',
          'X-Auth-Token': authToken || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: fromNumber, to: phone, answer_url: answerUrl, answer_method: 'POST', caller_name: getBrandConfig().name }),
      }
    );

    const data = await res.json();
    if (!res.ok) return NextResponse.json({ success: false, error: data }, { status: res.status });
    return NextResponse.json({ success: true, callId: data?.request_uuid });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POP A/B: dial the SAME Vobiz number/trunk through ElevenLabs' native SIP
// telephony instead of Vapi. Enrichment (transcript/recording) will come from
// ElevenLabs' own conversation API later; for now this places the call so the
// voice/latency/turn-taking can be compared head-to-head.
async function elevenLabsTestCall(body: any) {
  const { phone, contactName, leadName } = body;
  if (!phone) return NextResponse.json({ error: 'Phone required' }, { status: 400 });
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey || !ELEVENLABS_AGENT_ID || !ELEVENLABS_PHONE_NUMBER_ID) {
    return NextResponse.json(
      { success: false, error: 'ElevenLabs not configured (ELEVENLABS_API_KEY / ELEVENLABS_AGENT_ID / ELEVENLABS_PHONE_NUMBER_ID)' },
      { status: 500 },
    );
  }

  const digits = String(phone).replace(/\D/g, '');
  const last10 = digits.slice(-10);
  const e164 = digits.length === 12 && digits.startsWith('91') ? `+${digits}` : `+91${last10}`;
  const name = (contactName || leadName || '').trim();

  try {
    const res = await fetch('https://api.elevenlabs.io/v1/convai/sip-trunk/outbound-call', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: ELEVENLABS_AGENT_ID,
        agent_phone_number_id: ELEVENLABS_PHONE_NUMBER_ID,
        to_number: e164,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ success: false, error: data?.detail || data }, { status: res.status });
    }
    const callId: string | null =
      data?.conversation_id || data?.callSid || data?.call_sid || data?.sip_call_id || null;

    // Best-effort persist so the call surfaces in the Calls list, tagged as the
    // 11labs engine (call_summary marker — no schema change needed for the A/B).
    if (callId) {
      try {
        const supabase = getServiceClient();
        if (supabase) {
          const leadId = await ensureOrUpdateLead(name || null, null, e164, 'voice', undefined, supabase);
          const { error: insErr } = await supabase.from('voice_sessions').insert({
            external_session_id: callId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            lead_id: leadId,
            customer_phone: e164,
            customer_phone_normalized: last10,
            call_direction: 'outbound',
            call_status: 'queued',
            brand: BRAND_ID,
            call_summary: 'engine:elevenlabs',
          });
          if (insErr) console.error('[test-call:11labs] voice_sessions insert failed:', insErr.message);
        }
      } catch (e: any) {
        console.error('[test-call:11labs] persist failed (non-fatal):', e?.message);
      }
    }
    return NextResponse.json({ success: true, callId, engine: 'elevenlabs' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// V3 (POP A/B): dial through the Sarvam pipeline — Vobiz's own <Stream> forwards
// the call audio to our Pipecat+Sarvam server (STT+LLM+TTS), same trunk/number.
// This route just proxies to the pipeline's /start (server-side → no browser CORS).
// V3_PIPELINE_URL points at the running pipeline (localhost:8080 in local dev; the
// VPS/tunnel host in prod).
async function sarvamPipelineCall(body: any) {
  const { phone, contactName, leadName } = body;
  if (!phone) return NextResponse.json({ error: 'Phone required' }, { status: 400 });
  const digits = String(phone).replace(/\D/g, '');
  const last10 = digits.slice(-10);
  const e164 = digits.length === 12 && digits.startsWith('91') ? `+${digits}` : `+91${last10}`;
  const url = process.env.V3_PIPELINE_URL;
  if (!url) {
    return NextResponse.json({ success: false, error: 'V3_PIPELINE_URL not configured' }, { status: 500 });
  }
  try {
    const res = await fetch(`${url}/start`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: e164, language: isVoiceLang(body.language) ? body.language : 'pa' }),
    });
    const data = await res.json().catch(() => ({}));
    // pipeline returns { status: <vobiz http status>, body: <vobiz response text> }
    const vobizOk = typeof data.status === 'number' && data.status >= 200 && data.status < 300;
    if (!res.ok || !vobizOk) {
      return NextResponse.json({ success: false, error: `V3 dial failed: ${data.body || data.error || res.status}` }, { status: 502 });
    }
    let callId = `v3-${Date.now()}`;
    try { const vb = JSON.parse(data.body); callId = vb.request_uuid || vb.api_id || callId; } catch { /* keep synth id */ }

    // Best-effort persist so the call surfaces in the Calls list + the eval's
    // caller-name join works — mirrors the 11labs path, tagged engine:sarvam.
    try {
      const supabase = getServiceClient();
      if (supabase) {
        const name = (contactName || leadName || '').trim();
        const leadId = await ensureOrUpdateLead(name || null, null, e164, 'voice', undefined, supabase);
        const { error: insErr } = await supabase.from('voice_sessions').insert({
          external_session_id: callId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          lead_id: leadId,
          customer_phone: e164,
          customer_phone_normalized: last10,
          call_direction: 'outbound',
          call_status: 'queued',
          brand: BRAND_ID,
          call_summary: 'engine:sarvam',
        });
        if (insErr) console.error('[test-call:sarvam] voice_sessions insert failed:', insErr.message);
      }
    } catch (e: any) {
      console.error('[test-call:sarvam] persist failed (non-fatal):', e?.message);
    }
    return NextResponse.json({ success: true, callId, engine: 'sarvam' });
  } catch {
    return NextResponse.json({ success: false, error: `V3 pipeline unreachable at ${url} — is the pipeline server running?` }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  if (!VAPI_BRANDS.includes(getCurrentBrandId())) return vobizTestCall(req);
  // VAPI brands share one JSON body read here so we can dispatch by engine.
  const body = await req.json().catch(() => ({} as any));
  if (getCurrentBrandId() === 'pop' && body?.engine === 'sarvam') return sarvamPipelineCall(body);
  if (getCurrentBrandId() === 'pop' && body?.engine === 'elevenlabs') return elevenLabsTestCall(body);
  return vapiTestCall(body);
}
