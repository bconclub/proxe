/**
 * Calls eval — per-call telemetry for the voice agent, straight from Vapi.
 *
 * Latency is NOT reconstructed — Vapi hands us the real per-turn split in
 * artifact.performanceMetrics: transcriber (STT) · model (LLM) · voice (TTS) ·
 * endpointing (OUR turn-taking config) · transport (network/telephony). That
 * lets the UI answer "who is doing the latency": the providers (outside) vs our
 * own endpointing setting (inside) vs the India round-trip (network).
 *
 * The Vapi list endpoint already carries performanceMetrics for most calls; for
 * the few phone calls where it's trimmed, we fetch the full call (parallel,
 * capped). Web-call rows (dashboard "Talk to Assistant" browser tests) have no
 * number and no latency — tagged source:'web' so the UI can label/hide them.
 *
 * Scoped to the brand's own assistant (VAPI_ASSISTANT_ID). Degrades to an empty
 * list (200) when Vapi isn't configured.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'
import { BRAND_ID } from '@/configs'

export const dynamic = 'force-dynamic'

const VAPI_BASE = 'https://api.vapi.ai'
const ENRICH_CAP = 20 // max per-call fetches to fill missing perfMetrics

function ms(x?: string | null): number | null {
  if (!x) return null
  const t = Date.parse(x)
  return Number.isFinite(t) ? t : null
}
const round = (n: any): number => Math.round(Number(n) || 0)

// Normalize a language code to our small set. Latency differs by language (STT/TTS
// models perform differently), so this is a first-class filter dimension.
function normLang(x?: string | null): string | null {
  const s = (x || '').toLowerCase().trim()
  if (!s || s === 'undefined' || s === 'null') return null
  if (s.startsWith('pa')) return 'pa'
  if (s.startsWith('hi')) return 'hi'
  if (s.startsWith('en')) return 'en'
  return 'other'
}

// stt / model / tts providers, from Vapi's per-component costs[] array.
function connectorOf(c: any) {
  const costs = Array.isArray(c.costs) ? c.costs : []
  const find = (type: string) => costs.find((x: any) => x.type === type)
  return {
    stt: find('transcriber')?.transcriber?.provider || null,
    model: find('model')?.model?.model || null,
    tts: (find('voice') || find('tts'))?.voice?.provider || null,
  }
}

// The real latency breakdown, from Vapi's own metrics. Everything in ms.
// A real conversational turn tops out a few seconds. When the caller goes quiet
// (or trailing silence after the close), Vapi still logs a "turn" with a 10-20s
// latency — that's not a response time, it's a person not talking. Exclude those
// so avg/worst reflect real turns, and recompute from the kept turns (Vapi's own
// averages include the outliers).
const REAL_TURN_MAX = 8000

function perfOf(c: any) {
  const pm = c.artifact?.performanceMetrics
  if (!pm) return null
  const all: any[] = Array.isArray(pm.turnLatencies) ? pm.turnLatencies : []
  const turns = all.filter((t) => { const v = round(t.turnLatency); return v > 0 && v <= REAL_TURN_MAX })
  if (!turns.length) return null
  const mean = (f: (t: any) => any) => Math.round(turns.reduce((a, t) => a + round(f(t)), 0) / turns.length)
  return {
    turnAvg: mean((t) => t.turnLatency),
    worst: Math.max(...turns.map((t) => round(t.turnLatency))),
    best: Math.min(...turns.map((t) => round(t.turnLatency))),
    // per-stage averages (ms) over real turns. transcriber/model/voice = OUTSIDE
    // (providers); endpointing = INSIDE (our startSpeakingPlan); transport = network.
    stages: {
      transcriber: mean((t) => t.transcriberLatency),
      model: mean((t) => t.modelLatency),
      voice: mean((t) => t.voiceLatency),
      endpointing: mean((t) => t.endpointingLatency),
      transport: round(pm.fromTransportLatencyAverage) + round(pm.toTransportLatencyAverage),
    },
    turnsDetail: turns.map((t) => ({
      total: round(t.turnLatency),
      transcriber: round(t.transcriberLatency),
      model: round(t.modelLatency),
      voice: round(t.voiceLatency),
      endpointing: round(t.endpointingLatency),
    })),
  }
}

function computeCall(c: any) {
  const started = ms(c.startedAt)
  const ended = ms(c.endedAt)
  const created = ms(c.createdAt)
  const durationSec = started != null && ended != null ? Math.round((ended - started) / 1000) : null
  const waitSec = created != null && started != null ? Math.max(0, Math.round((started - created) / 1000)) : null

  const isWeb = c.type === 'webCall'
  const perf = perfOf(c)
  const msgs: any[] = Array.isArray(c.messages) ? c.messages : (c.artifact?.messages || [])
  const turns = perf?.turnsDetail.length || msgs.filter((m) => m.role === 'user').length

  const cb = c.costBreakdown || {}
  return {
    id: c.id,
    source: isWeb ? 'web' : 'phone',
    engine: 'vapi' as 'vapi' | 'elevenlabs', // Vapi-API calls are the Vapi pipeline
    language: normLang(c.analysis?.structuredData?.language), // from post-call extraction
    callerName: null as string | null,        // filled from voice_sessions -> all_leads
    callee: c.customer?.number || (isWeb ? 'Web test' : 'unknown'),
    createdAt: c.createdAt || null,
    startedAt: c.startedAt || null,
    durationSec,
    waitSec,
    cost: typeof c.cost === 'number' ? c.cost : null,
    costBreakdown: c.costBreakdown
      ? { stt: cb.stt ?? null, llm: cb.llm ?? null, tts: cb.tts ?? null, vapi: cb.vapi ?? null, total: cb.total ?? null }
      : null,
    status: c.status || null,
    endedReason: c.endedReason || null,
    turns,
    perf, // null for web tests / calls with no metrics
    connector: connectorOf(c),
    summary: c.summary || null,
    recordingUrl: c.recordingUrl || c.stereoRecordingUrl || null,
  }
}

// ── ElevenLabs A/B engine — pulled straight from ElevenLabs' own API so its
// calls show up no matter where they were placed (app OR the 11labs dashboard).
// Its conversation transcript carries per-turn latency (ASR / LLM ttfb / TTS
// ttfb) — the same STT/LLM/Voice split as Vapi, in seconds → we convert to ms.
const ELEVEN_BASE = 'https://api.elevenlabs.io/v1/convai'
const ELEVEN_DETAIL_CAP = 15

function perfFromEleven(detail: any) {
  const turns: any[] = Array.isArray(detail?.transcript) ? detail.transcript : []
  const asr: number[] = [], llm: number[] = [], tts: number[] = [], ep: number[] = [], sil: number[] = []
  const detailRows: any[] = []
  for (const t of turns) {
    const m = t?.conversation_turn_metrics?.metrics || {}
    const a = m.convai_asr_trailing_service_latency ? Math.round(m.convai_asr_trailing_service_latency.elapsed_time * 1000) : 0
    const l = m.convai_llm_service_ttfb ? Math.round(m.convai_llm_service_ttfb.elapsed_time * 1000) : 0
    const v = m.convai_tts_service_ttfb ? Math.round(m.convai_tts_service_ttfb.elapsed_time * 1000) : 0
    // The felt turn latency: caller goes silent → agent audio starts. This IS the
    // comparable-to-Vapi number; the service ttfbs above are just sub-components.
    const s = m.convai_ttf_audio_since_silence ? Math.round(m.convai_ttf_audio_since_silence.elapsed_time * 1000) : 0
    // Component latencies are per-service and live on different turns (ASR on the
    // caller's turn, LLM/TTS on the agent's) — capture each whenever present, else
    // STT reads 0. Only the turn TOTAL (silence→audio) gets the trailing-silence cap.
    if (a) asr.push(a)
    if (l) llm.push(l)
    if (v) tts.push(v)
    if (s > 0 && s <= REAL_TURN_MAX) {
      // Endpointing = the turn-taking wait ElevenLabs adds internally (silence →
      // audio, minus the STT/LLM/TTS pipeline). Its equivalent of Vapi endpointing.
      const e = Math.max(0, s - a - l - v)
      sil.push(s); ep.push(e)
      detailRows.push({ total: s, transcriber: a, model: l, voice: v, endpointing: e })
    }
  }
  const avg = (arr: number[]) => (arr.length ? Math.round(arr.reduce((x, y) => x + y, 0) / arr.length) : 0)
  // transport (network) is NOT exposed by ElevenLabs — it's folded into the
  // silence→audio measurement, so we report it as null (shown as "—"), not zero.
  const stages = { transcriber: avg(asr), model: avg(llm), voice: avg(tts), endpointing: avg(ep), transport: null as number | null }
  const totals = detailRows.map((r) => r.total)
  const turnAvg = avg(sil)
  if (!totals.length && !turnAvg) return null
  return {
    turnAvg: turnAvg || null,
    worst: totals.length ? Math.max(...totals) : null,
    best: totals.length ? Math.min(...totals) : null,
    stages,
    turnsDetail: detailRows,
  }
}

async function fetchElevenCalls(): Promise<any[]> {
  const key = process.env.ELEVENLABS_API_KEY
  const agent = process.env.ELEVENLABS_AGENT_ID
  if (!key || !agent) return []
  const headers = { 'xi-api-key': key }
  try {
    const lr = await fetch(`${ELEVEN_BASE}/conversations?agent_id=${agent}&page_size=30`, { headers, cache: 'no-store' })
    if (!lr.ok) return []
    const ld = await lr.json()
    const convs: any[] = ld?.conversations || ld?.history || []
    // Detail fetch (phone number + cost + latency) for the most recent, capped.
    const top = convs.slice(0, ELEVEN_DETAIL_CAP)
    const details = await Promise.all(
      top.map(async (c) => {
        const id = c.conversation_id || c.id
        try {
          const dr = await fetch(`${ELEVEN_BASE}/conversations/${id}`, { headers, cache: 'no-store' })
          return dr.ok ? await dr.json() : null
        } catch { return null }
      }),
    )
    return top.map((c, i) => {
      const d = details[i] || {}
      const meta = d.metadata || {}
      const started = c.start_time_unix_secs ? new Date(c.start_time_unix_secs * 1000).toISOString() : null
      const phone = meta.phone_call?.external_number || null
      return {
        id: c.conversation_id || c.id,
        source: meta.phone_call ? 'phone' : 'web',
        engine: 'elevenlabs',
        language: normLang(c.main_language),
        callerName: null,
        callee: phone || (meta.phone_call ? 'unknown' : 'Web test'),
        createdAt: started,
        startedAt: started,
        durationSec: c.call_duration_secs ?? meta.call_duration_secs ?? null,
        waitSec: null,
        cost: typeof meta.cost_fiat === 'number' ? Number(meta.cost_fiat.toFixed(4)) : null,
        costBreakdown: null,
        status: c.status || d.status || null,
        endedReason: c.termination_reason || null,
        turns: c.message_count ?? 0,
        perf: perfFromEleven(d),
        connector: { stt: '11labs', model: '11labs', tts: '11labs' },
        summary: c.transcript_summary || meta.transcript_summary || null,
        recordingUrl: null,
      }
    })
  } catch {
    return []
  }
}

export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const key = process.env.VAPI_PRIVATE_API_KEY
  const assistantId = process.env.VAPI_ASSISTANT_ID
  if (!key || !assistantId) {
    return NextResponse.json({ calls: [], agg: null, brand: BRAND_ID, configured: false })
  }
  const headers = { Authorization: `Bearer ${key}` }

  try {
    const r = await fetch(`${VAPI_BASE}/call?assistantId=${assistantId}&limit=100`, { headers, cache: 'no-store' })
    const raw = await r.json()
    if (!r.ok) {
      return NextResponse.json({ calls: [], agg: null, brand: BRAND_ID, configured: true, error: raw?.message || 'Vapi error' })
    }
    const list: any[] = Array.isArray(raw) ? raw : []

    // Fill perfMetrics for phone calls that came back trimmed (parallel, capped).
    const needing = list.filter((c) => c.type !== 'webCall' && !c.artifact?.performanceMetrics).slice(0, ENRICH_CAP)
    await Promise.all(
      needing.map(async (c) => {
        try {
          const fr = await fetch(`${VAPI_BASE}/call/${c.id}`, { headers, cache: 'no-store' })
          if (fr.ok) {
            const full = await fr.json()
            if (full?.artifact) c.artifact = full.artifact
          }
        } catch { /* leave perf null */ }
      }),
    )

    const calls: any[] = list.map(computeCall)

    // ElevenLabs A/B calls — pulled from ElevenLabs' own API (they never touch the
    // Vapi API), so they show up wherever they were placed. Merged in with their
    // own per-turn latency.
    const eleven = await fetchElevenCalls()
    calls.push(...eleven)

    // Enrich Vapi calls with the caller NAME captured at dial time (voice_sessions
    // → all_leads). Brand-scoped, soft-fail — names just won't show if it errors.
    try {
      const supabase = getServiceClient()
      if (supabase) {
        const { data: sessions } = await supabase
          .from('voice_sessions')
          .select('external_session_id, lead_id, customer_phone')
          .eq('brand', BRAND_ID)
          .order('created_at', { ascending: false })
          .limit(300)
        const sess = sessions || []
        const byCallId = new Map(sess.filter((s: any) => s.external_session_id).map((s: any) => [s.external_session_id, s]))
        const byPhone = new Map(sess.filter((s: any) => s.customer_phone).map((s: any) => [s.customer_phone, s]))

        const leadIds = Array.from(new Set(sess.map((s: any) => s.lead_id).filter(Boolean)))
        const nameOf = new Map<string, string>()
        if (leadIds.length) {
          const { data: leads } = await supabase.from('all_leads').select('id, customer_name').in('id', leadIds)
          ;(leads || []).forEach((l: any) => { if (l.customer_name) nameOf.set(l.id, l.customer_name) })
        }
        for (const c of calls) {
          // match by call id (Vapi) or, for ElevenLabs, by the phone number
          const s = byCallId.get(c.id) || (c.callee ? byPhone.get(c.callee) : null)
          if (s && s.lead_id) c.callerName = nameOf.get(s.lead_id) || c.callerName
        }
      }
    } catch { /* soft-fail: names just won't show */ }

    // newest first, both engines interleaved by time
    calls.sort((a, b) => (Date.parse(b.startedAt || b.createdAt || '') || 0) - (Date.parse(a.startedAt || a.createdAt || '') || 0))

    // Aggregate. Totals span both engines; the latency SPLIT is computed PER ENGINE
    // (endpointing/transport are Vapi-only concepts) so Vapi vs 11Labs is comparable.
    // No-answer / zeroed calls are excluded via the turnAvg guard.
    // null-safe mean — ignores nulls (e.g. ElevenLabs transport) so a not-exposed
    // stage stays null ("—") instead of poisoning the average with NaN/0.
    const mean = (arr: Array<number | null | undefined>) => {
      const xs = arr.filter((x): x is number => typeof x === 'number')
      return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null
    }
    const splitFor = (engine: string) => {
      const wp = calls.filter((c) => c.engine === engine && c.perf && c.perf.turnAvg)
      if (!wp.length) return null
      return {
        calls: wp.length,
        turnAvg: mean(wp.map((c) => c.perf!.turnAvg)),
        transcriber: mean(wp.map((c) => c.perf!.stages.transcriber)),
        model: mean(wp.map((c) => c.perf!.stages.model)),
        voice: mean(wp.map((c) => c.perf!.stages.voice)),
        endpointing: mean(wp.map((c) => c.perf!.stages.endpointing)),
        transport: mean(wp.map((c) => c.perf!.stages.transport)),
      }
    }
    const agg = {
      total: calls.length,
      phone: calls.filter((c) => c.source === 'phone').length,
      web: calls.filter((c) => c.source === 'web').length,
      totalSpend: Number(calls.reduce((a, c) => a + (c.cost || 0), 0).toFixed(4)),
      totalMinutes: Number((calls.reduce((a, c) => a + (c.durationSec || 0), 0) / 60).toFixed(1)),
      vapi: splitFor('vapi'),
      elevenlabs: splitFor('elevenlabs'),
    }
    return NextResponse.json({ calls, agg, brand: BRAND_ID, configured: true })
  } catch (e: any) {
    return NextResponse.json({ calls: [], agg: null, brand: BRAND_ID, configured: true, error: e?.message || 'fetch failed' })
  }
}
