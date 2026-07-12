'use client'

// ─────────────────────────────────────────────────────────────────────────────
// VoiceOrb — the Brain tab container: voice engine + overlays + the variant
// picker. The visualization itself is pluggable — three renderers live in
// ./renderers (cortex / pulseOrb / mandala), selected by the dot picker at the
// bottom and persisted in localStorage. Renderers read the live voice state
// (mode, amplitude, waveform, ripples) through a small env object each frame,
// so switching variants mid-speech never touches the playing audio.
//
// Voice: staged for speed. 1) mode:"text" writes the words (Groq-fast),
// 2) the FIRST sentence and the REST are voiced in parallel (mode:"tts",
// brand voice / eleven_v3), 3) the first clip plays the moment it lands and
// the rest chains seamlessly. Latency metadata for every run is logged
// (mode:"log") as the "brain voice" eval data.
//
// Bottom-right: language switcher (only when the brand speaks >1 language).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useCallback } from 'react'
import { getBrainConfig } from '@/lib/brain/brainConfig'
import type { BrainAction } from '@/lib/brain/actions'
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition'
import { resolvePalette } from './renderers/palette'
import { createPulseOrb } from './renderers/pulseOrb'
import { createCortex } from './renderers/cortex'
import { createMandala } from './renderers/mandala'
import type { OrbMode, Ripple, RendererEnv, VariantId } from './renderers/types'

// 'listening' is orb-only (renderers don't know it → mapped to idle visual).
type Mode = OrbMode | 'listening'

// Per-brand content: questions, languages, thinking-step captions, palette.
// Resolved once at module scope — the brand is fixed for the build.
const BRAIN = getBrainConfig()
const QUICK_QUESTIONS = BRAIN.quickQuestions
const LANGS = BRAIN.languages

const VARIANT_KEY = 'proxe-brain-variant'
const VARIANTS: Array<{ id: VariantId; label: string }> = [
  { id: 'cortex', label: 'Cortex' },
  { id: 'pulse', label: 'Pulse Orb' },
  { id: 'mandala', label: 'Mandala' },
]
const DEFAULT_VARIANT: VariantId = 'pulse'

function splitSentences(text: string): string[] {
  return (text.match(/[^.!?।]+[.!?।]+["']?|\S[^.!?।]*$/g) || [text]).map((s) => s.trim()).filter(Boolean)
}

// Karaoke chunks — 1–3 words that swap as the audio plays, so the caption
// stays as narrow as the orb instead of a long sentence. Punctuation-ending
// words get their own short chunk so the line breathes at natural pauses.
function chunkWords(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const out: string[] = []
  let buf: string[] = []
  for (const w of words) {
    buf.push(w)
    const endsClause = /[,;:.!?।—]$/.test(w)
    if (buf.length >= 3 || endsClause) { out.push(buf.join(' ')); buf = [] }
  }
  if (buf.length) out.push(buf.join(' '))
  return out
}

// Props let the orb be embedded as a full-screen overlay (dock → brain wakes):
//   autoStart       — run on mount (the dock click IS the gesture)
//   initialQuestion — if set, autoStart asks THIS instead of the daily briefing
//   conversational  — after it finishes speaking, open the mic and listen for a
//                     spoken reply, then answer it — a back-and-forth voice loop
//   listenFirst     — skip the opening briefing; go straight to listening
//   onClose         — show a close button; the overlay unmounts the orb
//   compact         — tiny embed (dock-sized): just the glowing orb, no caption,
//                     no close button, no language switcher — it IS the light
export type VoiceOrbProps = {
  autoStart?: boolean
  initialQuestion?: string
  conversational?: boolean
  listenFirst?: boolean
  onClose?: () => void
  compact?: boolean
  // Brain-drives-UI: validated nav actions from the briefing route land here
  // (open lead / open page). The host (DashboardBrain) executes them — the page
  // loads behind the orb while it keeps speaking. Dial never comes via voice.
  onAction?: (a: BrainAction) => void
  // Voice-OFF text answer emitted up to the host so it can render a readable
  // panel (the docked orb is a tiny clipped circle — text won't fit inside it).
  // '' means clear. onVoiceChange lets the host reflect the on/off state.
  onAnswer?: (text: string) => void
  onVoiceChange?: (on: boolean) => void
}

export default function VoiceOrb({ autoStart = false, initialQuestion, conversational = false, listenFirst = false, onClose, compact = false, onAction, onAnswer, onVoiceChange }: VoiceOrbProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [mode, setMode] = useState<Mode>('idle')
  const [caption, setCaption] = useState('')
  const [subtitle, setSubtitle] = useState('')
  // Voice toggle: OFF (default) = the brain READS its answer as text (no TTS,
  // no mic — works without an ElevenLabs key); ON = it speaks + the mic listens
  // so you can just talk. Persisted per browser.
  const [voiceOn, setVoiceOn] = useState(false)
  const voiceOnRef = useRef(false)
  const [answer, setAnswer] = useState('') // the readable text answer (voice-off)
  const [lang, setLang] = useState<string>(LANGS[0]?.id || 'en')
  // null until mount → hydration-safe localStorage read, renderer mounts once
  const [variant, setVariant] = useState<VariantId | null>(null)
  const langRef = useRef<string>(LANGS[0]?.id || 'en')
  const modeRef = useRef<Mode>('idle')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const queueRef = useRef<HTMLAudioElement[]>([])
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const ripplesRef = useRef<Ripple[]>([])
  const lastHoverRippleRef = useRef(0)
  // loading ring: fills while the brain connects, completes when audio starts
  const thinkStartRef = useRef<number | null>(null)
  const ringDoneAtRef = useRef<number | null>(null)
  // shared per-frame buffers for the analyser reads (one alloc, all renderers)
  const ampBufRef = useRef(new Uint8Array(64))
  const waveBufRef = useRef(new Uint8Array(128))

  const setModeBoth = (m: Mode) => { modeRef.current = m; setMode(m) }

  // Restore the voice-on/off preference once mounted (hydration-safe).
  useEffect(() => {
    try { const v = localStorage.getItem('proxe-brain-voice') === '1'; setVoiceOn(v); voiceOnRef.current = v } catch { /* storage */ }
  }, [])
  const setVoice = useCallback((on: boolean) => {
    voiceOnRef.current = on
    setVoiceOn(on)
    try { localStorage.setItem('proxe-brain-voice', on ? '1' : '0') } catch { /* storage */ }
  }, [])
  // Bubble the readable answer + voice state up to the host (it renders the
  // panel). Props ride in refs so the setters below fire the LATEST callback
  // with no effect-timing games.
  const onAnswerRef = useRef(onAnswer); onAnswerRef.current = onAnswer
  const onVoiceRef = useRef(onVoiceChange); onVoiceRef.current = onVoiceChange
  const emitAnswer = useCallback((t: string) => { setAnswer(t); onAnswerRef.current?.(t) }, [])
  useEffect(() => { onVoiceRef.current?.(voiceOn) }, [voiceOn])

  // Conversation turns (voice loop) — sent with each mode:'text' request so the
  // brain can resolve "yes" / "that one" against what it just said. onAction
  // rides in a ref so engage() never re-creates over a new callback identity.
  const historyRef = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const onActionRef = useRef<typeof onAction>(onAction)
  onActionRef.current = onAction

  // ── mic (talk back) ────────────────────────────────────────────────────────
  // Browser Web Speech API via the shared hook — no key, no server. Used only
  // in conversational overlay mode; the brain-page orb never listens.
  const { isSupported: micSupported, transcript: heard, startListening, stopListening, resetTranscript } = useSpeechRecognition()
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevModeRef = useRef<Mode>('idle')

  // Load the saved variant once on mount.
  useEffect(() => {
    let v: VariantId = DEFAULT_VARIANT
    try {
      const saved = localStorage.getItem(VARIANT_KEY)
      if (VARIANTS.some((x) => x.id === saved)) v = saved as VariantId
    } catch { /* storage unavailable */ }
    setVariant(v)
  }, [])

  // Ripple only when the pointer is near the visualization center.
  const addRipple = useCallback((clientX: number, clientY: number): boolean => {
    const canvas = canvasRef.current
    if (!canvas) return false
    const rect = canvas.getBoundingClientRect()
    const cxCss = rect.left + rect.width / 2
    const cyCss = rect.top + rect.height * 0.43
    const Rcss = Math.min(rect.width, rect.height) * 0.30
    const dx = clientX - cxCss, dy = clientY - cyCss
    if (dx * dx + dy * dy > Rcss * Rcss * 1.35) return false // outside the sphere
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    ripplesRef.current.push({ x: (clientX - rect.left) * dpr, y: (clientY - rect.top) * dpr, born: performance.now() })
    if (ripplesRef.current.length > 6) ripplesRef.current.shift()
    return true
  }, [])

  // ── renderer mount: one env closure, re-created only when the variant flips.
  // The voice engine has ZERO dependency on the variant — audio keeps playing
  // across switches and the new renderer picks up live amp on its first frame.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !variant) return
    const env: RendererEnv = {
      getMode: () => (modeRef.current === 'listening' ? 'idle' : modeRef.current),
      getAmp: () => {
        if (modeRef.current !== 'speaking') return 0
        const an = analyserRef.current
        if (!an) return 0.3 + 0.2 * Math.abs(Math.sin(performance.now() * 0.0042))
        an.getByteFrequencyData(ampBufRef.current)
        let s = 0
        for (let i = 2; i < 40; i++) s += ampBufRef.current[i]
        return Math.min(1, s / (38 * 160))
      },
      getWaveform: () => {
        const an = analyserRef.current
        if (!an || modeRef.current !== 'speaking') return null
        an.getByteTimeDomainData(waveBufRef.current)
        return waveBufRef.current
      },
      getRipples: () => ripplesRef.current,
      getThinkStart: () => thinkStartRef.current,
      getRingDoneAt: () => ringDoneAtRef.current,
      palette: resolvePalette(BRAIN.orbPalette),
    }
    // One brain for now — the pulse orb (cortex/mandala parked; they read rough).
    const r = createPulseOrb(canvas, env)
    return () => r.destroy()
  }, [variant])

  // ── stop everything — ONE voice, always ────────────────────────────────────
  const stop = useCallback(() => {
    abortRef.current?.abort()
    for (const a of [audioRef.current, ...queueRef.current]) {
      if (a) { a.ontimeupdate = null; a.onended = null; a.pause(); a.src = '' }
    }
    audioRef.current = null
    queueRef.current = []
    analyserRef.current = null
    thinkStartRef.current = null
    ringDoneAtRef.current = null
    setCaption('')
    setSubtitle('')
    setModeBoth('idle')
  }, [])
  useEffect(() => () => { stop(); stopListening(); audioCtxRef.current?.close().catch(() => {}) }, [stop, stopListening])

  const wireAnalyser = useCallback(async (audio: HTMLAudioElement) => {
    try {
      const actx = audioCtxRef.current || new AudioContext()
      audioCtxRef.current = actx
      if (actx.state === 'suspended') await actx.resume()
      const src = actx.createMediaElementSource(audio)
      const analyser = actx.createAnalyser()
      analyser.fftSize = 128
      src.connect(analyser)
      analyser.connect(actx.destination)
      analyserRef.current = analyser
    } catch { /* analyser optional */ }
  }, [])

  // ── gather → write → voice first sentence instantly → chain the rest ───────
  const engage = useCallback(async (question?: string) => {
    if (modeRef.current === 'thinking' || modeRef.current === 'speaking') { stop(); return }
    stop()
    emitAnswer('')
    thinkStartRef.current = performance.now()
    ringDoneAtRef.current = null
    setModeBoth('thinking')
    const steps = question ? BRAIN.thinkingSteps.question : BRAIN.thinkingSteps.briefing
    let stepIdx = 0
    setCaption(steps[0])
    const stepTimer = setInterval(() => {
      stepIdx = Math.min(stepIdx + 1, steps.length - 1)
      if (modeRef.current === 'thinking') setCaption(steps[stepIdx])
      else clearInterval(stepTimer)
    }, 1600)
    const ac = new AbortController()
    abortRef.current = ac
    const t0 = performance.now()
    // Live elapsed-seconds counter while the brain gathers + writes — so the
    // wait reads as real progress, not a ring that seems to hang.
    const secTimer = setInterval(() => {
      if (modeRef.current === 'thinking') setSubtitle(`${((performance.now() - t0) / 1000).toFixed(1)}s`)
      else clearInterval(secTimer)
    }, 100)
    // Shared TTS helpers — defined up-front so the instant greeting can use them.
    const tts = (chunk: string) => fetch('/api/dashboard/brain/briefing', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'tts', text: chunk }), signal: ac.signal,
    }).then((r) => r.json())
    // retry once — a failed rest-chunk must NOT stop the briefing mid-thought
    const ttsRetry = async (chunk: string) => {
      const a = await tts(chunk).catch(() => null)
      if (a?.audio) return a
      return tts(chunk).catch(() => null)
    }
    try {
      // 0. INSTANT greeting — a canned personalized opener ("Hi <name>, let me
      // pull together everything from today…") voiced in ~1.5s (one TTS hop, no
      // LLM), so the orb starts talking almost immediately instead of sitting
      // silent behind a spinning ring. It plays FIRST; the real briefing follows
      // seamlessly once it's ready. greetDone resolves when the greeting audio
      // ends, so the briefing never overlaps it.
      let greetDone: Promise<void> = Promise.resolve()
      // Voice-off → no spoken greeting at all (we only fetch + show the words).
      const greetP = !voiceOnRef.current ? Promise.resolve() : fetch('/api/dashboard/brain/briefing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'greet', ...(question ? { question } : {}) }), signal: ac.signal,
      }).then((r) => r.json())
        // mode:greet returns the audio itself (flash model); fall back to a tts
        // call only if the server couldn't voice it.
        .then((g) => (g?.audio ? g : (g?.text ? tts(g.text) : null)))
        .then((a) => {
          if (!a?.audio || modeRef.current !== 'thinking') return
          const ga = new Audio(`data:${a.mime};base64,${a.audio}`)
          audioRef.current = ga
          clearInterval(stepTimer); clearInterval(secTimer)
          setCaption(''); setSubtitle('')
          thinkStartRef.current = null
          ringDoneAtRef.current = performance.now() // ring completes the moment we speak
          setModeBoth('speaking')
          wireAnalyser(ga).catch(() => {})
          greetDone = new Promise<void>((res) => { ga.onended = () => res(); ga.onerror = () => res(); ga.onpause = () => res() })
          ga.play().catch(() => {})
        }).catch(() => {})

      // 1. the words (fast — Groq when configured)
      const tr = await fetch('/api/dashboard/brain/briefing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'text', language: langRef.current,
          ...(question ? { question } : {}),
          ...(historyRef.current.length ? { history: historyRef.current.slice(-6) } : {}),
        }),
        signal: ac.signal,
      }).then((r) => r.json())
      if (tr?.error) throw new Error(tr.error)
      const text: string = tr.text || 'Nothing to report yet.'

      // Keep the exchange as history for the next turn (capped).
      if (question) historyRef.current.push({ role: 'user', content: question })
      historyRef.current.push({ role: 'assistant', content: text })
      if (historyRef.current.length > 12) historyRef.current = historyRef.current.slice(-12)

      // ── VOICE OFF: just READ the answer (no TTS, no mic). Works with no key. ──
      if (!voiceOnRef.current) {
        clearInterval(stepTimer); clearInterval(secTimer)
        thinkStartRef.current = null
        ringDoneAtRef.current = performance.now()
        setCaption(''); setSubtitle('')
        emitAnswer(text)
        setModeBoth('idle')
        return
      }

      // Brain-drives-UI: execute the first validated nav action now — the page
      // opens BEHIND the orb while the voice keeps talking (the orb lives in
      // the layout and survives in-dashboard navigation). Dial is filtered
      // server-side for voice; skip it here too, belt and suspenders.
      if (onActionRef.current && Array.isArray(tr.actions)) {
        const nav = tr.actions.find((a: BrainAction) => a?.type === 'open_lead' || a?.type === 'open_page')
        if (nav) try { onActionRef.current(nav) } catch { /* nav must never kill the voice */ }
      }

      // 2. split: first sentence plays the moment it's voiced; rest in parallel
      const sentences = splitSentences(text)
      let firstChunk = sentences[0] || text
      let restStart = 1
      if (firstChunk.length < 45 && sentences[1]) { firstChunk = `${firstChunk} ${sentences[1]}`; restStart = 2 }
      const restChunk = sentences.slice(restStart).join(' ')

      const firstP = tts(firstChunk)
      // preload the rest: the Audio element is built the moment its bytes land,
      // so the handoff after the first sentence is gapless
      let restAudio: HTMLAudioElement | null = null
      const restP = restChunk
        ? ttsRetry(restChunk).then((rest) => {
            if (rest?.audio) {
              restAudio = new Audio(`data:${rest.mime};base64,${rest.audio}`)
              restAudio.load()
            }
            return rest
          })
        : Promise.resolve(null)

      const first = await firstP
      clearInterval(stepTimer); clearInterval(secTimer)
      if (first?.error || !first?.audio) throw new Error(first?.error || 'voice unavailable right now — try again in a moment')
      const ttfaMs = Math.round(performance.now() - t0)
      // Wait for the instant greeting to finish so the briefing never talks over
      // it. If the greeting never played (failed), greetDone is already resolved.
      // If the user tapped stop during the greeting, mode is idle → bail.
      await greetP.catch(() => {}); await greetDone
      if (modeRef.current === 'idle' || modeRef.current === 'error') return

      // subtitles per short chunk (1–3 words), driven by audio progress so the
      // words swap in time with the voice — narrow, never a long line
      const firstSents = chunkWords(firstChunk)
      const restSents = restChunk ? chunkWords(restChunk) : []
      const subs = (audio: HTMLAudioElement, sents: string[]) => {
        const total = sents.reduce((s, x) => s + x.length, 0) || 1
        const cum: number[] = []; let acc = 0
        for (const s of sents) { acc += s.length / total; cum.push(acc) }
        audio.ontimeupdate = () => {
          if (!audio.duration) return
          const frac = audio.currentTime / audio.duration
          const i = cum.findIndex((c) => frac <= c)
          setSubtitle(sents[i === -1 ? sents.length - 1 : i])
        }
      }

      const a1 = new Audio(`data:${first.mime};base64,${first.audio}`)
      audioRef.current = a1
      await wireAnalyser(a1)
      subs(a1, firstSents)
      setCaption('')
      setSubtitle(firstSents[0] || '')
      thinkStartRef.current = null
      ringDoneAtRef.current = performance.now() // ring completes + fades
      setModeBoth('speaking')

      // 3. log the run's latency metadata — the "brain voice" eval record
      fetch('/api/dashboard/brain/briefing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'log', meta: {
          llmMs: tr.llmMs ?? null, engine: tr.engine || null, ttsFirstMs: first.ttsMs ?? null,
          ttfaMs, chars: text.length, language: langRef.current, question: question || null,
        } }),
      }).catch(() => {})

      const playRest = async () => {
        await restP.catch(() => null)
        const a2 = restAudio
        if (!a2 || modeRef.current !== 'speaking') { if (modeRef.current === 'speaking') { setSubtitle(''); setModeBoth('idle') } ; return }
        queueRef.current = [a2]
        audioRef.current = a2
        await wireAnalyser(a2)
        subs(a2, restSents)
        a2.onended = () => { if (modeRef.current === 'speaking') { setSubtitle(''); setModeBoth('idle') } }
        a2.play().catch(() => { setSubtitle(''); setModeBoth('idle') })
      }
      a1.onended = () => { playRest() }

      try {
        await a1.play()
      } catch {
        setSubtitle('tap once to play')
        const el = canvasRef.current?.parentElement
        const resume = (ev: Event) => {
          ev.stopPropagation()
          setSubtitle(firstSents[0] || '')
          a1.play().catch(() => stop())
        }
        el?.addEventListener('click', resume, { once: true, capture: true })
        setTimeout(() => el?.removeEventListener('click', resume, { capture: true } as any), 20000)
      }
    } catch (e: any) {
      clearInterval(stepTimer); clearInterval(secTimer)
      thinkStartRef.current = null
      if (e?.name === 'AbortError') return
      setCaption(e?.message || 'could not reach the brain')
      setSubtitle('')
      setModeBoth('error')
      setTimeout(() => { if (modeRef.current === 'error') { setCaption(''); setModeBoth('idle') } }, 4000)
    }
  }, [stop, wireAnalyser])

  // ── listen: open the mic, capture a spoken reply, feed it back to the brain ──
  const beginListening = useCallback(() => {
    if (!micSupported) {
      setCaption('voice input isn’t supported in this browser')
      setModeBoth('idle')
      return
    }
    stop()                    // silence any TTS first
    resetTranscript()
    setSubtitle('')
    setCaption('')
    emitAnswer('')
    setModeBoth('listening')
    startListening()
  }, [micSupported, stop, resetTranscript, startListening])

  const submitSpoken = useCallback(() => {
    if (silenceTimer.current) { clearTimeout(silenceTimer.current); silenceTimer.current = null }
    const q = (heard || '').trim()
    stopListening()
    if (q) engage(q)          // brain answers out loud; the loop re-listens after
    else setModeBoth('idle')
  }, [heard, stopListening, engage])

  // While listening: show what's heard as the live subtitle, and treat ~1.4s of
  // silence after speech as the end of the user's turn → submit it.
  useEffect(() => {
    if (modeRef.current !== 'listening') return
    if (heard) setSubtitle(heard)
    if (silenceTimer.current) clearTimeout(silenceTimer.current)
    if (heard.trim()) {
      silenceTimer.current = setTimeout(() => { if (modeRef.current === 'listening') submitSpoken() }, 1400)
    }
    return () => { if (silenceTimer.current) { clearTimeout(silenceTimer.current); silenceTimer.current = null } }
  }, [heard, submitSpoken])

  // Conversational loop: only while VOICE IS ON — after it finishes speaking,
  // reopen the mic for the next turn. Voice off never listens.
  useEffect(() => {
    const prev = prevModeRef.current
    prevModeRef.current = mode
    if (conversational && voiceOnRef.current && prev === 'speaking' && mode === 'idle') beginListening()
  }, [mode, conversational, beginListening])

  // Overlay embed: on mount either start talking (briefing / a question) or, for
  // "Ask something", turn voice ON and go straight to listening.
  const didAutoStart = useRef(false)
  useEffect(() => {
    if (didAutoStart.current) return
    // Deferred one tick: React StrictMode (dev) mounts -> cleans up -> mounts
    // again, and the unmount cleanup calls stop() which ABORTS a briefing that
    // started on the first pass — while didAutoStart (a ref) survives, so the
    // second pass never retried. The timer makes the first pass cancellable
    // BEFORE any fetch starts: cleanup clears it, the second pass runs once.
    const t = setTimeout(() => {
      didAutoStart.current = true
      if (listenFirst) { setVoice(true); beginListening() }
      else if (autoStart) engage(initialQuestion)
    }, 0)
    return () => clearTimeout(t)
  }, [autoStart, listenFirst, initialQuestion, engage, beginListening, setVoice])

  const hint =
    mode === 'idle' ? 'tap to hear today' :
    mode === 'thinking' ? 'thinking' :
    mode === 'listening' ? (subtitle ? 'tap when done' : 'listening…') :
    mode === 'speaking' ? 'tap to stop' : ''

  // While listening, the subtitle IS the live transcript (styled like speaking).
  const bigLine = mode === 'speaking' || (mode === 'listening' && !!subtitle)
  const line = bigLine ? subtitle : (mode === 'error' ? caption : (caption || hint))

  return (
    <div
      onClick={(e) => { addRipple(e.clientX, e.clientY); if (modeRef.current === 'listening') submitSpoken(); else engage() }}
      onPointerMove={(e) => {
        const now = performance.now()
        if (now - lastHoverRippleRef.current > 340) {
          if (addRipple(e.clientX, e.clientY)) lastHoverRippleRef.current = now
        }
      }}
      style={{ position: 'absolute', inset: 0, cursor: 'pointer', userSelect: 'none', overflow: 'hidden' }}
      title={hint}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />

      {/* Close (overlay embed only) — collapse the brain back to the dock */}
      {onClose && !compact && (
        <button
          onClick={(e) => { e.stopPropagation(); stop(); stopListening(); onClose() }}
          onPointerMove={(e) => e.stopPropagation()}
          aria-label="Close"
          style={{
            position: 'absolute', top: 18, left: 18, zIndex: 5,
            width: 38, height: 38, borderRadius: 999, cursor: 'pointer',
            fontSize: 20, lineHeight: 1, fontWeight: 400,
            background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
            border: '1px solid var(--border-primary)',
          }}
        >
          ×
        </button>
      )}

      {/* VOICE TOGGLE — the one control on the docked orb. Just below the light.
          OFF: the brain reads its answer as text, you click to get things (works
          with no ElevenLabs key). ON: it speaks and the mic listens so you can
          just talk. Accent + pulse while listening. */}
      {compact && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (voiceOnRef.current) { setVoice(false); stop(); stopListening(); setModeBoth('idle') }
            else { setVoice(true); beginListening() }
          }}
          onPointerMove={(e) => e.stopPropagation()}
          aria-label={voiceOn ? 'Voice on — tap to turn off' : 'Voice off — tap to talk'}
          title={voiceOn ? (mode === 'listening' ? 'Listening… tap to turn voice off' : 'Voice on — tap to turn off') : 'Tap to talk (voice off — answers show as text)'}
          style={{
            position: 'absolute', left: '50%', bottom: 8, transform: 'translateX(-50%)', zIndex: 5,
            width: 34, height: 34, borderRadius: 999, cursor: 'pointer', padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: voiceOn ? 'var(--accent-primary)' : 'var(--bg-secondary)',
            color: voiceOn ? '#fff' : 'var(--text-secondary)',
            border: '1px solid var(--border-primary)',
            boxShadow: mode === 'listening' ? '0 0 0 4px color-mix(in srgb, var(--accent-primary) 30%, transparent)' : '0 2px 8px rgba(0,0,0,0.3)',
            animation: mode === 'listening' ? 'voMicPulse 1.2s ease infinite' : 'none',
            transition: 'background .15s ease, color .15s ease, box-shadow .15s ease',
          }}
        >
          {voiceOn ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="2" width="6" height="12" rx="3" />
              <path d="M5 10a7 7 0 0 0 14 0" />
              <line x1="12" y1="19" x2="12" y2="22" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="2" y1="2" x2="22" y2="22" />
              <path d="M9 4.5a3 3 0 0 1 6 0V9m0 3a3 3 0 0 1-4.5 2.6" />
              <path d="M5 10a7 7 0 0 0 10.7 6" />
              <line x1="12" y1="19" x2="12" y2="22" />
            </svg>
          )}
        </button>
      )}

      {/* ONE line under the orb — short karaoke words while speaking (blob-wide),
          hint/steps otherwise (wider). Hidden in compact (the light says it all). */}
      {!compact && <div style={{
        position: 'absolute', left: '50%', bottom: '8%', transform: 'translateX(-50%)',
        width: bigLine ? 'min(340px, 66%)' : 'min(720px, 90%)',
        textAlign: 'center', pointerEvents: 'none',
        whiteSpace: bigLine ? 'normal' : 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        fontSize: bigLine ? 17 : 11.5,
        fontWeight: bigLine ? 600 : 400,
        letterSpacing: bigLine ? 0.2 : 2.5,
        textTransform: bigLine ? 'none' : 'uppercase',
        color: mode === 'error' ? '#ef4444' : bigLine ? 'var(--text-primary)' : 'var(--text-muted)',
        transition: 'opacity .25s ease', opacity: line ? 0.92 : 0,
      }}>
        {line}
        {mode === 'thinking' && <span style={{ display: 'inline-block', marginLeft: 6, animation: 'voPulse 1.1s ease infinite' }}>●</span>}
      </div>}

      {/* language switcher (bottom right) — only when the brand speaks >1 language */}
      {LANGS.length > 1 && !compact && <div
        onClick={(e) => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
        style={{ position: 'absolute', right: 26, bottom: 22, display: 'flex', gap: 4, padding: 4, borderRadius: 999, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', zIndex: 3 }}
      >
        {LANGS.map((l) => (
          <button
            key={l.id}
            onClick={() => { setLang(l.id); langRef.current = l.id }}
            style={{
              fontSize: 11.5, fontWeight: 700, padding: '5px 11px', borderRadius: 999, border: 'none', cursor: 'pointer',
              background: lang === l.id ? 'var(--accent-primary)' : 'transparent',
              color: lang === l.id ? '#fff' : 'var(--text-secondary)',
              transition: 'all .15s ease',
            }}
          >
            {l.label}
          </button>
        ))}
      </div>}

      <style>{`
        @keyframes voPulse { 0%,100% { opacity: .25 } 50% { opacity: 1 } }
        @keyframes voFan { from { opacity: 0; transform: translateX(10px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes voMicPulse { 0%,100% { box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-primary) 30%, transparent) } 50% { box-shadow: 0 0 0 7px color-mix(in srgb, var(--accent-primary) 12%, transparent) } }
      `}</style>
    </div>
  )
}
