'use client'

// ─────────────────────────────────────────────────────────────────────────────
// VoiceOrb — the Brain tab: a neural particle orb in brand colors.
//
// Touch: ripples stay ON the blob — hovering or clicking the sphere itself
// sends a ripple through its particles; the rest of the page holds only the
// quiet radar chrome (hairline + slow dashed rings). Speaking: the sphere
// turns malleable and sways to the live waveform.
//
// Voice: staged for speed. 1) mode:"text" writes the words (Groq-fast),
// 2) the FIRST sentence and the REST are voiced in parallel (mode:"tts",
// Monika Sogam / eleven_v3), 3) the first clip plays the moment it lands and
// the rest chains seamlessly. Latency metadata for every run is logged
// (mode:"log") as the "brain voice" eval data.
//
// Bottom-right: language switcher — English / ਪੰਜਾਬੀ / हिंदी.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useCallback } from 'react'

type Mode = 'idle' | 'thinking' | 'speaking' | 'error'
type Lang = 'en' | 'pa' | 'hi'

const N = 900

type P = { theta: number; phi: number; r: number; speed: number; hue: number; size: number; wob: number }
type Ripple = { x: number; y: number; born: number }

const QUICK_QUESTIONS = [
  'How are the constituencies doing?',
  'What are the latest leader actions?',
  'What news is buzzing right now?',
  'What needs my attention today?',
]

const LANGS: Array<{ id: Lang; label: string }> = [
  { id: 'en', label: 'EN' },
  { id: 'pa', label: 'ਪੰਜਾਬੀ' },
  { id: 'hi', label: 'हिंदी' },
]

function cssLuma(varName: string): number {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
    const m = v.match(/^#?([0-9a-f]{6})$/i)
    if (!m) return 0
    const n = parseInt(m[1], 16)
    return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  } catch { return 0 }
}

function accentColor(): { h: number; s: number; rgb: [number, number, number] } {
  const fallback = { h: 262, s: 83, rgb: [139, 92, 246] as [number, number, number] }
  try {
    const hex = getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim()
    const m = hex.match(/^#?([0-9a-f]{6})$/i)
    if (!m) return fallback
    const n = parseInt(m[1], 16)
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
    const r1 = r / 255, g1 = g / 255, b1 = b / 255
    const max = Math.max(r1, g1, b1), min = Math.min(r1, g1, b1), d = max - min
    let h = 0
    if (d) {
      if (max === r1) h = ((g1 - b1) / d) % 6
      else if (max === g1) h = (b1 - r1) / d + 2
      else h = (r1 - g1) / d + 4
      h = (h * 60 + 360) % 360
    }
    const l = (max + min) / 2
    const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0
    return { h, s: Math.max(45, Math.round(s * 100)), rgb: [r, g, b] }
  } catch { return fallback }
}

function splitSentences(text: string): string[] {
  return (text.match(/[^.!?।]+[.!?।]+["']?|\S[^.!?।]*$/g) || [text]).map((s) => s.trim()).filter(Boolean)
}

export default function VoiceOrb() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [mode, setMode] = useState<Mode>('idle')
  const [caption, setCaption] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [askOpen, setAskOpen] = useState(false)
  const [lang, setLang] = useState<Lang>('en')
  const langRef = useRef<Lang>('en')
  const modeRef = useRef<Mode>('idle')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const queueRef = useRef<HTMLAudioElement[]>([])
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const ripplesRef = useRef<Ripple[]>([])
  const frameRef = useRef(0)
  const lastHoverRippleRef = useRef(0)
  // loading ring: fills while the brain connects, completes when audio starts
  const thinkStartRef = useRef<number | null>(null)
  const ringDoneFrameRef = useRef<number | null>(null)

  const setModeBoth = (m: Mode) => { modeRef.current = m; setMode(m) }

  // Ripple only when the pointer is ON the blob itself.
  const addRipple = useCallback((clientX: number, clientY: number): boolean => {
    const canvas = canvasRef.current
    if (!canvas) return false
    const rect = canvas.getBoundingClientRect()
    const cxCss = rect.left + rect.width / 2
    const cyCss = rect.top + rect.height / 2
    const Rcss = Math.min(rect.width, rect.height) * 0.24
    const dx = clientX - cxCss, dy = clientY - cyCss
    if (dx * dx + dy * dy > Rcss * Rcss * 1.35) return false // outside the sphere
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    ripplesRef.current.push({ x: (clientX - rect.left) * dpr, y: (clientY - rect.top) * dpr, born: frameRef.current })
    if (ripplesRef.current.length > 6) ripplesRef.current.shift()
    return true
  }, [])

  // ── render loop ────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let raf = 0
    let t = 0

    const ac = accentColor()
    const [ar, ag, ab] = ac.rgb
    const isLight = cssLuma('--bg-primary') > 0.5
    // On white, glowing whites read as a smudge — swap to accent-weighted inks.
    const pLightBase = isLight ? 34 : 56          // particle lightness base
    const pLightSpan = isLight ? 12 : 14
    const glowMul = isLight ? 0.45 : 1            // soften all glows on light
    const coreRGB = isLight ? `${ar},${ag},${ab}` : '255,255,255'

    const parts: P[] = Array.from({ length: N }, () => {
      const u = Math.random() * 2 - 1
      return {
        theta: Math.random() * Math.PI * 2,
        phi: Math.acos(u),
        r: 0.72 + Math.random() * 0.28,
        speed: 0.0006 + Math.random() * 0.0016,
        hue: ac.h + (Math.random() * 36 - 18) - (Math.random() < 0.2 ? 40 : 0),
        size: 0.8 + Math.random() * 1.6,
        wob: Math.random() * Math.PI * 2,
      }
    })
    const freq = new Uint8Array(64)

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = canvas.clientWidth * dpr
      canvas.height = canvas.clientHeight * dpr
    }
    resize()
    window.addEventListener('resize', resize)

    const RIPPLE_SPEED = 4
    const RIPPLE_LIFE = 90
    const RIPPLE_BAND = 42

    const draw = () => {
      raf = requestAnimationFrame(draw)
      t += 1
      frameRef.current = t
      const w = canvas.width, h = canvas.height
      const cx = w / 2, cy = h / 2
      const R = Math.min(w, h) * 0.24
      ctx.clearRect(0, 0, w, h)

      let amp = 0
      if (modeRef.current === 'speaking' && analyserRef.current) {
        analyserRef.current.getByteFrequencyData(freq)
        let s = 0
        for (let i = 2; i < 40; i++) s += freq[i]
        amp = Math.min(1, s / (38 * 160))
      } else if (modeRef.current === 'speaking') {
        amp = 0.3 + 0.2 * Math.abs(Math.sin(t * 0.07))
      }

      const m = modeRef.current
      const breathe = 1 + 0.022 * Math.sin(t * 0.011)
      const think = m === 'thinking' ? 0.55 + 0.45 * Math.sin(t * 0.028) : 0
      const scale = m === 'speaking' ? 1 + amp * 0.14 : breathe

      ripplesRef.current = ripplesRef.current.filter((rp) => t - rp.born < RIPPLE_LIFE)

      // ── quiet radar chrome (page-level, static, no rippling) ────────────────
      const dpr2 = window.devicePixelRatio > 1 ? 1.5 : 1
      const lineA = (0.04 + amp * 0.06 + think * 0.03) * (isLight ? 1.4 : 1)
      const lg = ctx.createLinearGradient(cx - R * 3.2, cy, cx + R * 3.2, cy)
      lg.addColorStop(0, `rgba(${ar},${ag},${ab},0)`)
      lg.addColorStop(0.5, `rgba(${ar},${ag},${ab},${lineA})`)
      lg.addColorStop(1, `rgba(${ar},${ag},${ab},0)`)
      ctx.strokeStyle = lg
      ctx.lineWidth = dpr2
      ctx.beginPath(); ctx.moveTo(cx - R * 3.2, cy); ctx.lineTo(cx + R * 3.2, cy); ctx.stroke()
      const rings: Array<[number, number, number, number[]]> = [
        [R * 1.38, t * 0.002, 0.09, [4 * dpr2, 10 * dpr2]],
        [R * 1.62, -t * 0.0012, 0.06, [1.5 * dpr2, 14 * dpr2]],
        [R * 1.9, t * 0.0006, 0.04, [22 * dpr2, 30 * dpr2]],
      ]
      for (const [rr, rot, a, dash] of rings) {
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(rot)
        ctx.strokeStyle = `rgba(${ar},${ag},${ab},${(a + amp * 0.08 + think * 0.04) * (isLight ? 1.5 : 1)})`
        ctx.lineWidth = dpr2 * 0.8
        ctx.setLineDash(dash)
        ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.stroke()
        ctx.restore()
      }
      ctx.setLineDash([])

      // ── loading ring: fills while connecting, snaps closed when voice starts
      let ringP = -1, ringA = 0
      if (m === 'thinking' && thinkStartRef.current != null) {
        const el = performance.now() - thinkStartRef.current
        ringP = Math.min(0.92, 1 - Math.exp(-el / 4200)) // eases toward full, never stalls at same spot
        ringA = 0.55
      } else if (ringDoneFrameRef.current != null && t - ringDoneFrameRef.current < 45) {
        ringP = 1
        ringA = 0.55 * (1 - (t - ringDoneFrameRef.current) / 45) // full circle, then fade out
      }
      if (ringP >= 0 && ringA > 0.01) {
        ctx.strokeStyle = `rgba(${ar},${ag},${ab},${ringA})`
        ctx.lineWidth = dpr2 * 2
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.arc(cx, cy, R * 1.22, -Math.PI / 2, -Math.PI / 2 + ringP * Math.PI * 2)
        ctx.stroke()
        ctx.lineCap = 'butt'
      }

      // radar sweep along the spine — one slow arm
      const sweepA = t * 0.0035
      const sg = ctx.createLinearGradient(cx, cy, cx + Math.cos(sweepA) * R * 1.9, cy + Math.sin(sweepA) * R * 1.9)
      sg.addColorStop(0, `rgba(${ar},${ag},${ab},0)`)
      sg.addColorStop(1, `rgba(${ar},${ag},${ab},${0.10 * (isLight ? 1.4 : 1)})`)
      ctx.strokeStyle = sg
      ctx.lineWidth = dpr2
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(sweepA) * R * 1.9, cy + Math.sin(sweepA) * R * 1.9); ctx.stroke()
      for (let i = 0; i < 4; i++) {
        const a = t * 0.003 + (i * Math.PI) / 2
        const ox = cx + Math.cos(a) * R * 1.38
        const oy = cy + Math.sin(a) * R * 1.38 * 0.98
        ctx.fillStyle = `rgba(${ar},${ag},${ab},${0.5 + amp * 0.2})`
        ctx.beginPath(); ctx.arc(ox, oy, 1.3 * dpr2, 0, Math.PI * 2); ctx.fill()
      }

      // core glow + nucleus — accent-inked on light so it never smudges white
      const glowR = R * (1.7 + amp * 0.7 + think * 0.3)
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR)
      const glowA = (m === 'speaking' ? 0.14 + amp * 0.16 : m === 'thinking' ? 0.12 + think * 0.06 : 0.09) * glowMul
      g.addColorStop(0, `rgba(${ar},${ag},${ab},${glowA})`)
      g.addColorStop(1, `rgba(${ar},${ag},${ab},0)`)
      ctx.fillStyle = g
      ctx.fillRect(cx - glowR, cy - glowR, glowR * 2, glowR * 2)
      const nucR = R * (0.085 + amp * 0.05 + 0.008 * Math.sin(t * 0.02))
      const ng = ctx.createRadialGradient(cx, cy, 0, cx, cy, nucR)
      ng.addColorStop(0, `rgba(${coreRGB},${(isLight ? 0.55 : 0.8) + amp * 0.15})`)
      ng.addColorStop(0.4, `rgba(${ar},${ag},${ab},${(isLight ? 0.25 : 0.4) + amp * 0.2})`)
      ng.addColorStop(1, `rgba(${ar},${ag},${ab},0)`)
      ctx.fillStyle = ng
      ctx.beginPath(); ctx.arc(cx, cy, nucR, 0, Math.PI * 2); ctx.fill()

      // ── particle cloud ──────────────────────────────────────────────────────
      const rotY = t * (m === 'thinking' ? 0.006 : 0.002)
      const pts: Array<{ x: number; y: number; z: number; p: P }> = []
      for (const p of parts) {
        if (m === 'thinking') p.theta += p.speed * 3
        else p.theta += p.speed
        let r = p.r
        if (m === 'thinking') r = p.r * (0.7 + 0.3 * Math.abs(Math.sin(t * 0.012 + p.wob)))
        if (m === 'speaking') {
          const blob =
            0.10 * (0.35 + amp) * Math.sin(2.3 * p.phi + t * 0.018 + p.wob) +
            0.06 * (0.35 + amp) * Math.sin(3.1 * p.theta - t * 0.013 + p.wob * 0.7)
          r = p.r * (1 + blob)
        }
        const sx = Math.sin(p.phi) * Math.cos(p.theta + rotY)
        const sy = Math.cos(p.phi) + 0.05 * Math.sin(t * 0.016 + p.wob)
        const sz = Math.sin(p.phi) * Math.sin(p.theta + rotY)
        pts.push({ x: sx * r, y: sy * r, z: sz * r, p })
      }
      pts.sort((a, b) => a.z - b.z)

      ctx.lineWidth = 0.5
      for (let i = 0; i < pts.length; i += 23) {
        const a = pts[i], b = pts[(i + 61) % pts.length]
        const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z
        if (dx * dx + dy * dy + dz * dz < 0.16) {
          const depth = (a.z + 1) / 2
          ctx.strokeStyle = `rgba(${ar},${ag},${ab},${(0.05 + depth * 0.08 + amp * 0.1) * (isLight ? 1.6 : 1)})`
          ctx.beginPath()
          ctx.moveTo(cx + a.x * R * scale, cy + a.y * R * scale)
          ctx.lineTo(cx + b.x * R * scale, cy + b.y * R * scale)
          ctx.stroke()
        }
      }

      for (const { x, y, z, p } of pts) {
        const depth = (z + 1) / 2
        let px = cx + x * R * scale
        let py = cy + y * R * scale
        for (const rp of ripplesRef.current) {
          const age = t - rp.born
          const rw = age * RIPPLE_SPEED
          const dx = px - rp.x, dy = py - rp.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const off = dist - rw
          if (Math.abs(off) < RIPPLE_BAND) {
            const strength = (1 - Math.abs(off) / RIPPLE_BAND) * (1 - age / RIPPLE_LIFE) * 10
            px += (dx / dist) * strength
            py += (dy / dist) * strength
          }
        }
        const alpha = (isLight ? 0.35 : 0.15) + depth * 0.6 + amp * 0.15
        const sz = p.size * (0.6 + depth * 0.9) * (1 + amp * 0.35) * (window.devicePixelRatio > 1 ? 1.4 : 1)
        ctx.fillStyle = `hsla(${p.hue}, ${ac.s}%, ${pLightBase + depth * pLightSpan + amp * 8}%, ${Math.min(1, alpha)})`
        ctx.beginPath()
        ctx.arc(px, py, sz, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    draw()
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [])

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
    ringDoneFrameRef.current = null
    setCaption('')
    setSubtitle('')
    setModeBoth('idle')
  }, [])
  useEffect(() => () => { stop(); audioCtxRef.current?.close().catch(() => {}) }, [stop])

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
    thinkStartRef.current = performance.now()
    ringDoneFrameRef.current = null
    setModeBoth('thinking')
    const steps = question ? [
      'listening…', 'checking the war room…', 'reading the latest signals…', 'putting it into words…',
    ] : [
      'reading today…', 'checking the war room…', 'checking recent pushes from leaders…',
      'reading new voices by constituency…', 'checking what people are responding to…', 'putting it into words…',
    ]
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
    try {
      // 1. the words (fast — Groq when configured)
      const tr = await fetch('/api/dashboard/brain/briefing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'text', language: langRef.current, ...(question ? { question } : {}) }),
        signal: ac.signal,
      }).then((r) => r.json())
      if (tr?.error) throw new Error(tr.error)
      const text: string = tr.text || 'Nothing to report yet.'

      // 2. split: first sentence plays the moment it's voiced; rest in parallel
      const sentences = splitSentences(text)
      let firstChunk = sentences[0] || text
      let restStart = 1
      if (firstChunk.length < 45 && sentences[1]) { firstChunk = `${firstChunk} ${sentences[1]}`; restStart = 2 }
      const restChunk = sentences.slice(restStart).join(' ')

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
      clearInterval(stepTimer)
      if (first?.error || !first?.audio) throw new Error(first?.error || 'voice unavailable right now — try again in a moment')
      const ttfaMs = Math.round(performance.now() - t0)

      // subtitles per chunk
      const firstSents = splitSentences(firstChunk)
      const restSents = restChunk ? splitSentences(restChunk) : []
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
      ringDoneFrameRef.current = frameRef.current // ring completes + fades
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
      clearInterval(stepTimer)
      thinkStartRef.current = null
      if (e?.name === 'AbortError') return
      setCaption(e?.message || 'could not reach the brain')
      setSubtitle('')
      setModeBoth('error')
      setTimeout(() => { if (modeRef.current === 'error') { setCaption(''); setModeBoth('idle') } }, 4000)
    }
  }, [stop, wireAnalyser])

  const hint =
    mode === 'idle' ? 'tap to hear today' :
    mode === 'thinking' ? 'thinking' :
    mode === 'speaking' ? 'tap to stop' : ''

  const line = mode === 'speaking' ? subtitle : (mode === 'error' ? caption : (caption || hint))

  return (
    <div
      onClick={(e) => { addRipple(e.clientX, e.clientY); engage() }}
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

      {/* ONE line under the orb — subtitle while speaking, hint/steps otherwise */}
      <div style={{
        position: 'absolute', left: '50%', bottom: '8%', transform: 'translateX(-50%)',
        width: 'min(720px, 90%)', textAlign: 'center', pointerEvents: 'none',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        fontSize: mode === 'speaking' ? 14 : 11.5,
        letterSpacing: mode === 'speaking' ? 0.3 : 2.5,
        textTransform: mode === 'speaking' ? 'none' : 'uppercase',
        color: mode === 'error' ? '#ef4444' : mode === 'speaking' ? 'var(--text-secondary)' : 'var(--text-muted)',
        transition: 'opacity .4s ease', opacity: line ? 0.9 : 0,
      }}>
        {line}
        {mode === 'thinking' && <span style={{ display: 'inline-block', marginLeft: 6, animation: 'voPulse 1.1s ease infinite' }}>●</span>}
      </div>

      {/* quick-ask fan (right middle) */}
      <div
        onClick={(e) => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
        style={{ position: 'absolute', right: 26, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, zIndex: 3 }}
      >
        {askOpen && QUICK_QUESTIONS.map((q, i) => (
          <button
            key={q}
            onClick={() => { setAskOpen(false); if (modeRef.current === 'thinking' || modeRef.current === 'speaking') stop(); engage(q) }}
            style={{
              fontSize: 12, fontWeight: 600, padding: '8px 14px', borderRadius: 999, cursor: 'pointer',
              background: 'var(--bg-secondary)', color: 'var(--text-primary)',
              border: '1px solid var(--border-primary)',
              animation: `voFan .22s ease ${i * 0.045}s both`,
              boxShadow: '0 4px 16px rgba(0,0,0,.3)',
            }}
          >
            {q}
          </button>
        ))}
        <button
          onClick={() => setAskOpen((o) => !o)}
          aria-label="Quick questions"
          style={{
            width: 42, height: 42, borderRadius: 999, cursor: 'pointer', fontSize: 17, fontWeight: 700,
            background: askOpen ? 'var(--accent-primary)' : 'var(--bg-secondary)',
            color: askOpen ? '#fff' : 'var(--accent-primary)',
            border: '1px solid var(--border-primary)', boxShadow: '0 4px 16px rgba(0,0,0,.3)',
            transition: 'all .18s ease',
          }}
        >
          {askOpen ? '×' : '?'}
        </button>
      </div>

      {/* language switcher (bottom right) — the voice speaks this language */}
      <div
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
      </div>

      <style>{`
        @keyframes voPulse { 0%,100% { opacity: .25 } 50% { opacity: 1 } }
        @keyframes voFan { from { opacity: 0; transform: translateX(10px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>
    </div>
  )
}
