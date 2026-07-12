import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'
import { generateResponse } from '@/lib/agent-core/claudeClient'
import { recordTokenUsage, recordVoiceUsage } from '@/lib/token-usage'
import { getJson, setJsonWithTtl } from '@/lib/server/redis'
import { getBrandConfig, BRAND_ID } from '@/configs'
import { getBrainConfig } from '@/lib/brain/brainConfig'
import { buildLeadIndex, id8, parseActionsTrailer, validateActions, actionsPromptSpec } from '@/lib/brain/actions'

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
        const json = await res.json()
        const text = json?.choices?.[0]?.message?.content?.trim()
        if (text) {
          // meter Groq's briefing tokens under the Brain TEXT bucket
          const u = json?.usage || {}
          void recordTokenUsage('brain', 'groq/llama-3.3-70b', u.prompt_tokens || 0, u.completion_tokens || 0)
          return { text, engine: 'groq/llama-3.3-70b' }
        }
      } else {
        console.error('[brain/briefing] groq failed:', res.status, await res.text().catch(() => ''))
      }
    } catch (e: any) {
      console.error('[brain/briefing] groq error:', e?.message)
    }
  }
  // Claude fallback — bucket under the Brain TEXT category (was defaulting to 'chat')
  return { text: (await generateResponse(system, userPrompt, 400, undefined, 'brain')).trim(), engine: 'claude' }
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

    // ── mode: greet — an INSTANT personalized opener (no LLM) so the orb speaks
    // within ~1.5s (just a TTS round-trip) instead of waiting the full
    // text-gen + TTS (~5s) in silence. Client fires this in parallel with
    // mode:text, plays the greeting first, then the real briefing. ───────────
    if (mode === 'greet') {
      const { data: profile } = await authClient
        .from('dashboard_users').select('full_name').eq('id', user.id).maybeSingle()
      const fullName = (profile?.full_name || user.email?.split('@')[0] || '').trim()
      const firstName = fullName.split(/\s+/)[0] || 'there'
      const q = typeof body?.question === 'string' ? body.question.trim() : ''
      // Input-aware acknowledgment — echo WHAT they asked about, by name, and
      // vary the phrasing so it never reads as the same canned line every time.
      const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)]
      const ql = q.toLowerCase()
      const ack = !q
        ? pick([
            `Hi ${firstName}, let me pull together everything from today.`,
            `Okay ${firstName}, catching you up on today now.`,
            `${firstName}, give me a moment — gathering today's picture.`,
          ])
        : /catch (me )?up|what happened|what's new|brief me|today so far/.test(ql)
          ? pick([`Okay ${firstName}, catching you up now.`, `${firstName}, pulling together everything from today.`, `On it ${firstName} — here's today coming up.`])
        : /\blead|pipeline|prospect|hot\b/.test(ql)
          ? pick([`Okay ${firstName}, let me check on those leads for you.`, `Pulling up the leads now, ${firstName}.`, `Let me see how the leads are doing, ${firstName}.`])
        : /\bbook|demo|meeting|calendar|schedul/.test(ql)
          ? pick([`Let me pull up the bookings, ${firstName}.`, `Checking the calendar now, ${firstName}.`])
        : /\btoken|usage|cost|spend|bill/.test(ql)
          ? pick([`Let me pull the usage numbers, ${firstName}.`, `Checking the spend now, ${firstName}.`])
        : /\bconversation|chat|inbox|whatsapp|message|repl/.test(ql)
          ? pick([`Let me scan the conversations, ${firstName}.`, `Checking the inbox now, ${firstName}.`])
        : /\bfollow|task|pending|due|remind/.test(ql)
          ? pick([`Let me check what's pending, ${firstName}.`, `Pulling up the follow-ups, ${firstName}.`])
          : pick([`Okay ${firstName}, let me look into that for you.`, `On it, ${firstName} — one moment.`, `Let me dig that up, ${firstName}.`])
      const text = ack
      // Voice the greeting with the FASTEST model (flash) — it's a fixed canned
      // line, so speed matters far more than expressiveness, and it must land in
      // well under a second to feel instant. The real briefing still uses v3.
      const key = process.env.ELEVENLABS_API_KEY
      if (!key) return NextResponse.json({ text, firstName })
      const voiceId = process.env.ELEVENLABS_VOICE_ID || getBrainConfig().voiceId
      const t0 = Date.now()
      const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5' }),
      }).catch(() => null)
      if (!ttsRes || !ttsRes.ok) return NextResponse.json({ text, firstName })
      const audio = Buffer.from(await ttsRes.arrayBuffer()).toString('base64')
      console.log(`[brain/briefing] greet TTS (flash) ${Date.now() - t0}ms`)
      void recordVoiceUsage('brain_voice', 'eleven_flash_v2_5', text.length)
      return NextResponse.json({ text, firstName, audio, mime: 'audio/mpeg' })
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
      // Which model actually produced the audio — returned + logged so we can
      // confirm V3 is really playing (and see when it silently falls back to
      // multilingual_v2), instead of guessing from how it sounds.
      let usedModel = 'eleven_v3'
      let ttsRes = await speak('eleven_v3')
      if (!ttsRes.ok) {
        console.error('[brain/briefing] eleven_v3 failed:', ttsRes.status, await ttsRes.text().catch(() => ''))
        usedModel = 'eleven_multilingual_v2'
        ttsRes = await speak('eleven_multilingual_v2')
      }
      if (!ttsRes.ok) {
        console.error('[brain/briefing] TTS failed:', ttsRes.status, await ttsRes.text().catch(() => ''))
        return NextResponse.json({ error: 'voice unavailable' }, { status: 502 })
      }
      const audio = Buffer.from(await ttsRes.arrayBuffer()).toString('base64')
      console.log(`[brain/briefing] TTS ok via ${usedModel} (${Date.now() - t0}ms, voice=${voiceId})`)
      void recordVoiceUsage('brain_voice', usedModel, text.length)
      return NextResponse.json({ audio, mime: 'audio/mpeg', ttsMs: Date.now() - t0, model: usedModel })
    }

    // ── mode: text — gather today's context and write the words ──────────────
    const brain = getBrainConfig()
    const question: string | null = typeof body?.question === 'string' && body.question.trim() ? body.question.trim().slice(0, 300) : null
    const lang = brain.languages.find((l) => l.id === body?.language) || brain.languages[0]
    // Conversation so far (voice loop) — lets the model resolve "yes" / "show
    // me that one" against what it just said. Sent by the orb client.
    const history: Array<{ role: string; content: string }> = Array.isArray(body?.history)
      ? body.history.slice(-6).filter((h: any) => h && typeof h.content === 'string')
      : []

    const cookie = req.headers.get('cookie') || ''
    const origin = req.nextUrl.origin
    const brand = getBrandConfig()
    // Campaign-shaped data sources ride on the warRoom feature, not the brand id.
    const hasWarRoom = !!brand.features?.warRoom
    // Brain-drives-UI: ids ride to the model so it can emit an ACTIONS trailer.
    const actionsOn = !!brand.features?.brainActions
    const svc = getServiceClient()
    const t0 = Date.now()

    // People the voice brain can point at: recently active + top scored, with
    // ids. Phones stay in this server-side slice (Redis) — never sent to the
    // model; validateActions attaches them if a dial ever ships for voice.
    const fetchPeople = async (): Promise<any[]> => {
      if (!actionsOn || !svc) return []
      try {
        const sel = 'id, customer_name, phone, lead_score, last_touchpoint, last_interaction_at, unified_context'
        const [recent, top] = await Promise.all([
          svc.from('all_leads').select(sel).eq('brand', BRAND_ID)
            .order('last_interaction_at', { ascending: false, nullsFirst: false }).limit(25).then((r: any) => r.data || []),
          svc.from('all_leads').select(sel).eq('brand', BRAND_ID)
            .order('lead_score', { ascending: false, nullsFirst: false }).limit(15).then((r: any) => r.data || []),
        ])
        const seen = new Set<string>()
        return [...top, ...recent].filter((l: any) => l?.id && !seen.has(l.id) && seen.add(l.id))
      } catch { return [] }
    }

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
      ctx = { overview, pulse, leader_pushes: leaderPushes, news_buzz: news, people: await fetchPeople() }
      await setJsonWithTtl(CTX_KEY, ctx, CTX_TTL).catch(() => {})
    }
    // A ctx cached before actions shipped (or while the flag was off) has no
    // people slice — backfill without invalidating the rest of the cache.
    if (actionsOn && !Array.isArray(ctx.people)) ctx.people = await fetchPeople()

    const profile = await profileP
    const fullName = (profile?.full_name || user.email?.split('@')[0] || '').trim()
    const firstName = fullName.split(/\s+/)[0] || 'there'

    const system = [
      `You are the living Brain of ${brand.name}${brain.persona}. You are about to SPEAK out loud to ${firstName}, the person running this.`,
      lang.promptRule,
      question
        ? `${firstName} asked: "${question}". Answer THAT question directly from the live data — no daily-briefing preamble. Open with the answer, not a greeting.`
        // A short spoken greeting ("Hi <name>, let me pull together today…") is
        // ALWAYS played first, so the briefing must NOT greet or repeat the name.
        : `A greeting to ${firstName} was ALREADY spoken aloud just before this, so DO NOT greet and DO NOT say their name again. Open DIRECTLY with today's state — e.g. "Here's how today looks." — in the speaking language.`,
      `Style: spoken word, warm, confident, first person. No markdown, no bullets, no emojis — natural sentences read aloud. The FIRST sentence must be short (under 12 words) — it plays first.`,
      question ? `Length: 3 to 6 sentences, under 100 words total.` : `Length: 5 to 8 sentences, under 130 words total.`,
      `You ARE PROXe — the system itself. NEVER say "AI", "the AI", "artificial intelligence" or "AI suggests". When a suggestion came from the system, say "PROXe suggests" or simply "I suggest" (you are PROXe speaking).`,
      brain.vocabularyRule,
      question
        ? `If the data genuinely doesn't cover the question, say so in one sentence and give the nearest useful signal instead.`
        : `Cover: what came in today and from where, what people are raising and responding to, what you're handling right now, and end with the single thing that most needs ${firstName}'s attention — or a calm all-quiet close. Skip zeros and missing data gracefully; never apologize for quiet days.`,
      `If highlights.most_active_lead is present, name them and mention how engaged they've been (e.g. "X has been messaging a lot today"). If highlights.top_area is present, mention it as where most listings/activity are concentrated right now. Only mention a highlight if it's actually present in the data — never invent one.`,
      // Scouts/gigs are a completely different population from sales leads — keep
      // them distinct in the spoken briefing so the count and the story are right.
      `LEADS vs GIGS: taken_in.leads_total counts real leads only — property owners and brands (the people who lease or list space). taken_in.gigs_total counts GIGS: scouts (gig workers who spot vacant shops and get paid) and connectors. These are NOT leads and must NEVER be lumped into a lead count. If gigs_total is present and non-zero, mention scouts as their own thing (e.g. "on the gig side, X scouts came in"), separate from leads. Never say "we got N leads" using a number that includes scouts.`,
      ...(actionsOn ? [actionsPromptSpec(true)] : []),
    ].join('\n')

    // Trim what goes to the model — Groq's on-demand tier caps tokens/minute,
    // and the raw overview carries far more than a spoken briefing can use.
    const ov = ctx.overview || {}
    // The id index the model's actions are validated against — built from the
    // same people slice the model sees, so ids can't point outside it.
    const peopleIdx = actionsOn ? buildLeadIndex(ctx.people || []) : null
    const slim = {
      taken_in: ov.taken_in || null,
      handling_now: ov.handling_now || null,
      recent_activity: (ov.activity || []).slice(0, 8).map((e: any) => ({ kind: e.kind, label: e.label, detail: String(e.detail || '').slice(0, 60) })),
      highlights: ov.highlights || null,
      pulse: ctx.pulse || null,
      leader_pushes: (ctx.leader_pushes || []).slice(0, 8),
      news_buzz: ctx.news_buzz || null,
      // ids only (no phones) — what the ACTIONS trailer may point at
      ...(actionsOn && (ctx.people || []).length ? {
        people: (ctx.people as any[]).slice(0, 30).map((p: any) => ({
          id: id8(p.id),
          name: p.customer_name || 'Unknown',
          score: p.lead_score ?? null,
          channel: peopleIdx!.get(id8(p.id))?.channel || 'web',
        })),
      } : {}),
    }
    let context = JSON.stringify(slim)
    if (context.length > 9000) context = context.slice(0, 9000)
    const transcript = history
      .map((h) => `${h.role === 'assistant' ? 'Brain' : 'Operator'}: ${String(h.content).slice(0, 300)}`)
      .join('\n')
    const userPrompt = transcript
      ? `Today's live data:\n${context}\n\nConversation so far (spoken aloud):\n${transcript}`
      : `Today's live data:\n${context}`
    const { text: rawText, engine } = await writeWords(system, userPrompt)
    // Strip + validate the ACTIONS trailer server-side, so TTS can never voice
    // it and a hallucinated id never reaches the client.
    let text = rawText
    let actions: ReturnType<typeof validateActions> = []
    if (actionsOn && peopleIdx) {
      const parsed = parseActionsTrailer(rawText)
      text = parsed.text
      // voice v1: navigation only — dial never ships from the voice path; nav
      // is always auto (the voice says what it's doing, there's no button).
      actions = validateActions(parsed.actions, peopleIdx)
        .flatMap((a) => (a.type === 'dial' ? [] : [{ ...a, auto: true }]))
    }
    return NextResponse.json({ text, actions, llmMs: Date.now() - t0, engine, language: lang.id })
  } catch (e: any) {
    console.error('[brain/briefing] error:', e?.message)
    return NextResponse.json({ error: e?.message || 'briefing failed' }, { status: 500 })
  }
}
