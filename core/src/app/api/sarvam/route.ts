/**
 * Sarvam AI — server-side proxy for Indian-language STT / TTS / translate / chat.
 *
 * One integration point so the SARVAM_API_KEY never reaches the client. Every
 * action returns `latencyMs` so Sarvam can be benchmarked as a "V3" engine
 * against V1 (Vapi) and V2 (ElevenLabs) in the Calls eval.
 *
 * POST /api/sarvam  { action, ...params }
 *   tts       { text, language?='pa-IN', speaker?='mani', model?='bulbul:v3' } -> { audio(base64), latencyMs }
 *   translate { text, from?='en-IN', to?='pa-IN' }                            -> { translated, latencyMs }
 *   stt       { audioBase64, model?='saarika:v2.5', language?='pa-IN' }        -> { transcript, language, latencyMs }
 *   chat      { messages, model?='sarvam-30b', maxTokens?=512 }               -> { reply, latencyMs }
 *
 * GET /api/sarvam -> { configured, base, actions }
 *
 * Base https://api.sarvam.ai · auth header: api-subscription-key
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const BASE = 'https://api.sarvam.ai'
const key = () => process.env.SARVAM_API_KEY || ''
const jsonHeaders = () => ({ 'api-subscription-key': key(), 'Content-Type': 'application/json' })

export async function GET() {
  return NextResponse.json({
    configured: !!key(),
    base: BASE,
    actions: ['tts', 'translate', 'stt', 'chat'],
    notes: 'TTS Punjabi voice = mani (bulbul:v3); STT = saarika:v2.5; chat = sarvam-30b/105b.',
  })
}

export async function POST(req: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!key()) return NextResponse.json({ error: 'SARVAM_API_KEY not set' }, { status: 500 })

  const body = await req.json().catch(() => ({} as any))
  const action = body?.action
  const t0 = Date.now()

  try {
    if (action === 'tts') {
      const r = await fetch(`${BASE}/text-to-speech`, {
        method: 'POST', headers: jsonHeaders(),
        body: JSON.stringify({
          text: String(body.text || '').slice(0, 2500),
          target_language_code: body.language || 'pa-IN',
          speaker: body.speaker || 'mani',
          model: body.model || 'bulbul:v3',
        }),
      })
      const d = await r.json()
      if (!r.ok) return NextResponse.json({ error: d?.error?.message || 'TTS failed', detail: d }, { status: r.status })
      return NextResponse.json({ audio: d.audios?.[0] || null, requestId: d.request_id, latencyMs: Date.now() - t0 })
    }

    if (action === 'translate') {
      const r = await fetch(`${BASE}/translate`, {
        method: 'POST', headers: jsonHeaders(),
        body: JSON.stringify({
          input: String(body.text || ''),
          source_language_code: body.from || 'en-IN',
          target_language_code: body.to || 'pa-IN',
        }),
      })
      const d = await r.json()
      if (!r.ok) return NextResponse.json({ error: d?.error?.message || 'Translate failed', detail: d }, { status: r.status })
      return NextResponse.json({ translated: d.translated_text, sourceLanguage: d.source_language_code, latencyMs: Date.now() - t0 })
    }

    if (action === 'stt') {
      if (!body.audioBase64) return NextResponse.json({ error: 'audioBase64 required' }, { status: 400 })
      const form = new FormData()
      form.append('file', new Blob([Buffer.from(body.audioBase64, 'base64')]), 'audio.wav')
      form.append('model', body.model || 'saarika:v2.5')
      if (body.language) form.append('language_code', body.language)
      const r = await fetch(`${BASE}/speech-to-text`, { method: 'POST', headers: { 'api-subscription-key': key() }, body: form })
      const d = await r.json()
      if (!r.ok) return NextResponse.json({ error: d?.error?.message || 'STT failed', detail: d }, { status: r.status })
      return NextResponse.json({ transcript: d.transcript, language: d.language_code, latencyMs: Date.now() - t0 })
    }

    if (action === 'chat') {
      const r = await fetch(`${BASE}/v1/chat/completions`, {
        method: 'POST', headers: jsonHeaders(),
        body: JSON.stringify({
          model: body.model || 'sarvam-30b',
          messages: Array.isArray(body.messages) ? body.messages : [{ role: 'user', content: String(body.text || '') }],
          max_tokens: body.maxTokens || 512,
        }),
      })
      const d = await r.json()
      if (!r.ok) return NextResponse.json({ error: d?.error?.message || 'Chat failed', detail: d }, { status: r.status })
      const msg = d.choices?.[0]?.message
      return NextResponse.json({ reply: msg?.content ?? msg?.reasoning_content ?? null, latencyMs: Date.now() - t0 })
    }

    return NextResponse.json({ error: `Unknown action '${action}'. Use tts | translate | stt | chat.` }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Sarvam request failed' }, { status: 500 })
  }
}
