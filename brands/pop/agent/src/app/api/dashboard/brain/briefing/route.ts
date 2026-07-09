import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'
import { generateResponse } from '@/lib/agent-core/claudeClient'
import { getJson, setJsonWithTtl } from '@/lib/server/redis'
import { getBrandConfig, BRAND_ID } from '@/configs'
import { getBrainConfig } from '@/lib/brain/brainConfig'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/dashboard/brain/briefing — the Brain's voice, staged for speed.
 *
 * The client orchestrates three modes so the first words play almost
 * instantly instead of waiting for the whole clip:
 *   mode "text"  { question?, language? }  → gather context + write the words
 *                                            (Groq if configured — fast — else
 *                                            Claude). Returns { text, llmMs }.
 *   mode "tts"   { text }                  → ElevenLabs (brand voice) on
 *                                            eleven_v3 (multilingual_v2
 *                                            fallback, SAME voice). The client
 *                                            splits the text and requests the
 *                                            first sentence + the rest in
 *                                            parallel. Returns { audio, ttsMs }.
 *   mode "log"   { meta }                  → append a latency/run record to a
 *                                            rolling Redis list — the "brain
 *                                            voice" eval data (kept for the
 *                                            Eval → Calls surface later).
 * GET → the recent run records.
 */

// Voice + persona + vocabulary + languages come from the brand's brain config
// (brands/<id>/config.ts brain block, generic fallbacks in brainConfig.ts).
// Voice precedence: env ELEVENLABS_VOICE_ID > brand brain.voiceId > default.
const RUNS_KEY = `brain:voice:runs:${BRAND_ID}`
const RUNS_TTL = 60 * 60 * 24 * 14 // keep two weeks
const CTX_KEY = `brain:voice:ctx:${BRAND_ID}`
const CTX_TTL = 90 // seconds — quick-question clicks reuse the gathered context

async function internalJson(origin: string, path: string, cookie: string): Promise<any> {
  try {
    const res = await fetch(`${origin}${path}`, { headers: { cookie }, cache: 'no-store' })
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

// Fast text: Groq first (llama-3.3-70b), Claude as fallback.
async function writeWords(system: string, userPrompt: string): Promise<{ text: string; engine: string }> {
  const groqKey = process.env.GROQ_API_KEY
  if (groqKey) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'system', content: system }, { role: 'user', content: userPrompt }],
          max_tokens: 500,
          temperature: 0.6,
        }),
      })
      if (res.ok) {
        const text = (await res.json())?.choices?.[0]?.message?.content?.trim()
        if (text) return { text, engine: 'groq/llama-3.3-70b' }
      } else {
        console.error('[brain/briefing] groq failed:', res.status, await res.text().catch(() => ''))
      }
    } catch (e: any) {
      console.error('[brain/briefing] groq error:', e?.message)
    }
  }
  return { text: (await generateResponse(system, userPrompt, 400)).trim(), engine: 'claude' }
}

export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const runs = (await getJson<any[]>(RUNS_KEY)) || []
  return NextResponse.json({ runs })
}

export async function POST(req: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const mode: string = body?.mode || 'text'

    // ── mode: log — keep the run's latency metadata (brain-voice eval) ───────
    if (mode === 'log') {
      const meta = body?.meta && typeof body.meta === 'object' ? body.meta : {}
      const runs = (await getJson<any[]>(RUNS_KEY)) || []
      runs.unshift({ ...meta, kind: 'brain_voice', user: user.email || user.id, at: new Date().toISOString() })
      await setJsonWithTtl(RUNS_KEY, runs.slice(0, 100), RUNS_TTL)
      return NextResponse.json({ ok: true })
    }

    // ── mode: tts — voice a chunk of text (brand voice, ONE voice per brand) ──
    if (mode === 'tts') {
      const text = String(body?.text || '').slice(0, 2000)
      if (!text) return NextResponse.json({ error: 'no text' }, { status: 400 })
      const key = process.env.ELEVENLABS_API_KEY
      if (!key) return NextResponse.json({ error: 'voice is not configured for this brand yet' }, { status: 500 })
      const voiceId = process.env.ELEVENLABS_VOICE_ID || getBrainConfig().voiceId
      const t0 = Date.now()
      const speak = (model: string) =>
        fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
          method: 'POST',
          headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, model_id: model }),
        })
      let ttsRes = await speak('eleven_v3')
      if (!ttsRes.ok) {
        console.error('[brain/briefing] eleven_v3 failed:', ttsRes.status, await ttsRes.text().catch(() => ''))
        ttsRes = await speak('eleven_multilingual_v2')
      }
      if (!ttsRes.ok) {
        console.error('[brain/briefing] TTS failed:', ttsRes.status, await ttsRes.text().catch(() => ''))
        return NextResponse.json({ error: 'voice unavailable' }, { status: 502 })
      }
      const audio = Buffer.from(await ttsRes.arrayBuffer()).toString('base64')
      return NextResponse.json({ audio, mime: 'audio/mpeg', ttsMs: Date.now() - t0 })
    }

    // ── mode: text — gather today's context and write the words ──────────────
    const brain = getBrainConfig()
    const question: string | null = typeof body?.question === 'string' && body.question.trim() ? body.question.trim().slice(0, 300) : null
    const lang = brain.languages.find((l) => l.id === body?.language) || brain.languages[0]

    const cookie = req.headers.get('cookie') || ''
    const origin = req.nextUrl.origin
    const brand = getBrandConfig()
    // Campaign-shaped data sources ride on the warRoom feature, not the brand id.
    const hasWarRoom = !!brand.features?.warRoom
    const svc = getServiceClient()
    const t0 = Date.now()

    // Profile is cheap; the heavy context is CACHED for 90s so quick-question
    // clicks answer fast instead of re-gathering everything.
    const profileP = authClient.from('dashboard_users').select('full_name').eq('id', user.id).maybeSingle().then((r) => r.data)

    let ctx = await getJson<any>(CTX_KEY)
    if (!ctx) {
      const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString()
      const [overview, warRoom, leaderPushes, news] = await Promise.all([
        internalJson(origin, '/api/dashboard/brain/overview', cookie),
        hasWarRoom ? internalJson(origin, '/api/war-room/data?days=1', cookie) : Promise.resolve(null),
        svc
          ? svc.from('campaign_recommendations')
              .select('title, body, source, constituency, status, created_at')
              .eq('brand', BRAND_ID)
              .order('created_at', { ascending: false })
              .limit(12)
              .then((r: any) => (r.data || []).map((x: any) => ({ ...x, body: String(x.body || '').slice(0, 160) })))
          : Promise.resolve([]),
        // news / social buzz — what people are seeing and reacting to
        svc && hasWarRoom
          ? svc.from('listen_signals')
              .select('source, content, sentiment, issue_category, constituency, is_crisis, is_opposition, created_at')
              .gte('created_at', dayAgo)
              .order('created_at', { ascending: false })
              .limit(400)
              .then((r: any) => {
                const rows: any[] = r.data || []
                const byCat: Record<string, number> = {}
                let neg = 0, crisis = 0, opp = 0
                for (const s of rows) {
                  if (s.issue_category) byCat[s.issue_category] = (byCat[s.issue_category] || 0) + 1
                  if (s.sentiment === 'negative') neg++
                  if (s.is_crisis) crisis++
                  if (s.is_opposition) opp++
                }
                const topTopics = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([topic, count]) => ({ topic, count }))
                const notable = rows
                  .filter((s) => s.is_crisis || s.is_opposition || s.sentiment === 'negative')
                  .slice(0, 8)
                  .map((s) => ({ source: s.source, content: String(s.content || '').slice(0, 130), constituency: s.constituency, category: s.issue_category }))
                return { last24h: rows.length, negative: neg, crisis, opposition: opp, topTopics, notable }
              })
          : Promise.resolve(null),
      ])
      const pulse = warRoom ? {
        topConstituencies: (warRoom.byConstituency || []).slice(0, 8),
        swing: (warRoom.swing || []).slice(0, 4),
        mobilization: warRoom.mobilization || null,
        recentVoices: (warRoom.liveFeed || []).slice(0, 12),
        seatDetails: warRoom.seatDetails
          ? Object.fromEntries(Object.entries(warRoom.seatDetails).slice(0, 6))
          : null,
      } : null
      ctx = { overview, pulse, leader_pushes: leaderPushes, news_buzz: news }
      await setJsonWithTtl(CTX_KEY, ctx, CTX_TTL).catch(() => {})
    }

    const profile = await profileP
    const fullName = (profile?.full_name || user.email?.split('@')[0] || '').trim()
    const firstName = fullName.split(/\s+/)[0] || 'there'

    const system = [
      `You are the living Brain of ${brand.name}${brain.persona}. You are about to SPEAK out loud to ${firstName}, the person running this.`,
      lang.promptRule,
      question
        ? `${firstName} asked: "${question}". Answer THAT question directly from the live data — no daily-briefing preamble. Open with the answer, not a greeting.`
        : `START with a greeting equivalent to: "Hi ${firstName}, this is how today looks." (in the speaking language).`,
      `Style: spoken word, warm, confident, first person. No markdown, no bullets, no emojis — natural sentences read aloud. The FIRST sentence must be short (under 12 words) — it plays first.`,
      question ? `Length: 3 to 6 sentences, under 100 words total.` : `Length: 5 to 8 sentences, under 130 words total.`,
      `You ARE PROXe — the system itself. NEVER say "AI", "the AI", "artificial intelligence" or "AI suggests". When a suggestion came from the system, say "PROXe suggests" or simply "I suggest" (you are PROXe speaking).`,
      brain.vocabularyRule,
      question
        ? `If the data genuinely doesn't cover the question, say so in one sentence and give the nearest useful signal instead.`
        : `Cover: what came in today and from where, what people are raising and responding to, what you're handling right now, and end with the single thing that most needs ${firstName}'s attention — or a calm all-quiet close. Skip zeros and missing data gracefully; never apologize for quiet days.`,
    ].join('\n')

    // Trim what goes to the model — Groq's on-demand tier caps tokens/minute,
    // and the raw overview carries far more than a spoken briefing can use.
    const ov = ctx.overview || {}
    const slim = {
      taken_in: ov.taken_in || null,
      handling_now: ov.handling_now || null,
      recent_activity: (ov.activity || []).slice(0, 8).map((e: any) => ({ kind: e.kind, label: e.label, detail: String(e.detail || '').slice(0, 60) })),
      pulse: ctx.pulse || null,
      leader_pushes: (ctx.leader_pushes || []).slice(0, 8),
      news_buzz: ctx.news_buzz || null,
    }
    let context = JSON.stringify(slim)
    if (context.length > 9000) context = context.slice(0, 9000)
    const { text, engine } = await writeWords(system, `Today's live data:\n${context}`)
    return NextResponse.json({ text, llmMs: Date.now() - t0, engine, language: lang.id })
  } catch (e: any) {
    console.error('[brain/briefing] error:', e?.message)
    return NextResponse.json({ error: e?.message || 'briefing failed' }, { status: 500 })
  }
}
