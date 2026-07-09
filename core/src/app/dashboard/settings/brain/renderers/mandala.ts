// ─────────────────────────────────────────────────────────────────────────────
// Mandala — a HUD of concentric orbital rings around a dense particle core.
//
// Four slow counter-rotating rings carry node dots, dashes and tick marks; a
// full-width horizontal energy beam runs through the center and renders the
// live waveform while the brain speaks. The outermost ring doubles as the
// thinking progress arc. Rigid chrome — no ripples; taps still engage().
// ─────────────────────────────────────────────────────────────────────────────

import type { CreateRenderer } from './types'

const CORE_N = 500

type P = { theta: number; phi: number; r: number; speed: number; hue: number; size: number; wob: number }

export const createMandala: CreateRenderer = (canvas, env) => {
  const ctx = canvas.getContext('2d')!
  const { rgb, sweepRgb, s: sat, particleHue, isLight, coreRGB, glowMul, pLightBase, pLightSpan } = env.palette
  const [ar, ag, ab] = rgb
  const [sr, sg, sb] = sweepRgb
  let raf = 0
  let t = 0

  const core: P[] = Array.from({ length: CORE_N }, () => {
    const u = Math.random() * 2 - 1
    return {
      theta: Math.random() * Math.PI * 2,
      phi: Math.acos(u),
      r: 0.55 + Math.random() * 0.45,
      speed: 0.0008 + Math.random() * 0.002,
      hue: particleHue(),
      size: 0.9 + Math.random() * 1.7,
      wob: Math.random() * Math.PI * 2,
    }
  })

  // ring plan: radius (×R), rotation speed, node count, style
  const RINGS: Array<{ r: number; speed: number; nodes: number; dash?: number[]; ticks?: number }> = [
    { r: 1.15, speed: 0.004, nodes: 5 },
    { r: 1.45, speed: -0.0025, nodes: 3, dash: [3, 9] },
    { r: 1.75, speed: 0.0012, nodes: 6, ticks: 48 },
    { r: 2.05, speed: -0.0008, nodes: 0, dash: [14, 22] },
  ]

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = canvas.clientWidth * dpr
    canvas.height = canvas.clientHeight * dpr
  }
  resize()
  window.addEventListener('resize', resize)

  const draw = () => {
    raf = requestAnimationFrame(draw)
    t += 1
    const now = performance.now()
    const w = canvas.width, h = canvas.height
    const cx = w / 2, cy = h / 2
    const R = Math.min(w, h) * 0.19
    ctx.clearRect(0, 0, w, h)

    const m = env.getMode()
    const amp = env.getAmp()
    const think = m === 'thinking' ? 0.55 + 0.45 * Math.sin(t * 0.028) : 0
    const dpr2 = window.devicePixelRatio > 1 ? 1.5 : 1
    const spin = m === 'thinking' ? 3 : 1

    // ── horizontal energy beam through the center ───────────────────────────
    const beamA = (0.1 + amp * 0.45 + think * 0.12) * (isLight ? 1.5 : 1)
    const bg = ctx.createLinearGradient(0, cy, w, cy)
    bg.addColorStop(0, `rgba(${sr},${sg},${sb},0)`)
    bg.addColorStop(0.5, `rgba(${sr},${sg},${sb},${beamA})`)
    bg.addColorStop(1, `rgba(${sr},${sg},${sb},0)`)
    ctx.strokeStyle = bg
    ctx.lineWidth = dpr2 * (1 + amp * 2)
    const wave = env.getWaveform()
    ctx.beginPath()
    if (wave && m === 'speaking') {
      for (let i = 0; i < wave.length; i++) {
        const x = (i / (wave.length - 1)) * w
        const y = cy + ((wave[i] - 128) / 128) * R * 0.9
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
    } else {
      // idle shimmer: a barely-breathing flat line (90 fixed segments — a
      // computed step of w/90 would spin forever on a 0-width canvas)
      for (let i = 0; i <= 90; i++) {
        const x = (i / 90) * w
        const y = cy + Math.sin(x * 0.012 + t * 0.03) * dpr2 * 1.2
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
    }
    ctx.stroke()

    // ── orbital rings + nodes ────────────────────────────────────────────────
    for (let ri = 0; ri < RINGS.length; ri++) {
      const ring = RINGS[ri]
      const rr = ring.r * R * (1 + amp * 0.04 * ((ri % 2) ? -1 : 1)) // breathe with the voice
      const rot = t * ring.speed * spin
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(rot)
      ctx.strokeStyle = `rgba(${ar},${ag},${ab},${(0.1 + amp * 0.1 + think * 0.06) * (isLight ? 1.5 : 1)})`
      ctx.lineWidth = dpr2 * 0.8
      if (ring.dash) ctx.setLineDash(ring.dash.map((d) => d * dpr2))
      ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.stroke()
      ctx.setLineDash([])
      // tick marks (instrument chrome)
      if (ring.ticks) {
        for (let k = 0; k < ring.ticks; k++) {
          const a = (k / ring.ticks) * Math.PI * 2
          const t1 = rr - 3 * dpr2, t2 = rr + (k % 4 === 0 ? 5 : 2.5) * dpr2
          ctx.strokeStyle = `rgba(${ar},${ag},${ab},${0.14 + amp * 0.1})`
          ctx.beginPath()
          ctx.moveTo(Math.cos(a) * t1, Math.sin(a) * t1)
          ctx.lineTo(Math.cos(a) * t2, Math.sin(a) * t2)
          ctx.stroke()
        }
      }
      // node dots riding the ring
      for (let k = 0; k < ring.nodes; k++) {
        const a = (k / ring.nodes) * Math.PI * 2 + ri
        const nx = Math.cos(a) * rr, ny = Math.sin(a) * rr
        const pulse = 0.5 + 0.5 * Math.sin(t * 0.03 + k * 1.7 + ri)
        const nr = (2 + pulse * 1.5 + amp * 2) * dpr2
        const grd = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr * 2.6)
        grd.addColorStop(0, `rgba(${ar},${ag},${ab},${0.55 + amp * 0.3})`)
        grd.addColorStop(1, `rgba(${ar},${ag},${ab},0)`)
        ctx.fillStyle = grd
        ctx.beginPath(); ctx.arc(nx, ny, nr * 2.6, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = `rgba(${coreRGB},${0.6 + pulse * 0.3})`
        ctx.beginPath(); ctx.arc(nx, ny, nr * 0.5, 0, Math.PI * 2); ctx.fill()
      }
      ctx.restore()
    }

    // crosshair spokes — vertical axis line, quieter than the beam
    const vg = ctx.createLinearGradient(cx, cy - R * 2.2, cx, cy + R * 2.2)
    vg.addColorStop(0, `rgba(${ar},${ag},${ab},0)`)
    vg.addColorStop(0.5, `rgba(${ar},${ag},${ab},${0.06 + think * 0.05})`)
    vg.addColorStop(1, `rgba(${ar},${ag},${ab},0)`)
    ctx.strokeStyle = vg
    ctx.lineWidth = dpr2 * 0.7
    ctx.beginPath(); ctx.moveTo(cx, cy - R * 2.2); ctx.lineTo(cx, cy + R * 2.2); ctx.stroke()

    // ── core glow + nucleus ──────────────────────────────────────────────────
    const glowR = R * (1.5 + amp * 0.8 + think * 0.3)
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR)
    const glowA = (m === 'speaking' ? 0.16 + amp * 0.18 : m === 'thinking' ? 0.13 + think * 0.06 : 0.1) * glowMul
    g.addColorStop(0, `rgba(${ar},${ag},${ab},${glowA})`)
    g.addColorStop(1, `rgba(${ar},${ag},${ab},0)`)
    ctx.fillStyle = g
    ctx.fillRect(cx - glowR, cy - glowR, glowR * 2, glowR * 2)
    const nucR = R * (0.16 + amp * 0.08 + 0.01 * Math.sin(t * 0.02))
    const ng = ctx.createRadialGradient(cx, cy, 0, cx, cy, nucR)
    ng.addColorStop(0, `rgba(${coreRGB},${(isLight ? 0.55 : 0.85) + amp * 0.12})`)
    ng.addColorStop(0.4, `rgba(${ar},${ag},${ab},${(isLight ? 0.25 : 0.45) + amp * 0.2})`)
    ng.addColorStop(1, `rgba(${ar},${ag},${ab},0)`)
    ctx.fillStyle = ng
    ctx.beginPath(); ctx.arc(cx, cy, nucR, 0, Math.PI * 2); ctx.fill()

    // ── dense particle core sphere ───────────────────────────────────────────
    const rotY = t * (m === 'thinking' ? 0.007 : 0.0025)
    const scale = m === 'speaking' ? 1 + amp * 0.18 : 1 + 0.025 * Math.sin(t * 0.011)
    const pts: Array<{ x: number; y: number; z: number; p: P }> = []
    for (const p of core) {
      p.theta += p.speed * (m === 'thinking' ? 3 : 1)
      let r = p.r
      if (m === 'thinking') r = p.r * (0.7 + 0.3 * Math.abs(Math.sin(t * 0.012 + p.wob)))
      if (m === 'speaking') {
        const blob =
          0.12 * (0.35 + amp) * Math.sin(2.3 * p.phi + t * 0.018 + p.wob) +
          0.07 * (0.35 + amp) * Math.sin(3.1 * p.theta - t * 0.013 + p.wob * 0.7)
        r = p.r * (1 + blob)
      }
      const sx = Math.sin(p.phi) * Math.cos(p.theta + rotY)
      const sy = Math.cos(p.phi) + 0.04 * Math.sin(t * 0.016 + p.wob)
      const sz = Math.sin(p.phi) * Math.sin(p.theta + rotY)
      pts.push({ x: sx * r, y: sy * r, z: sz * r, p })
    }
    pts.sort((a, b) => a.z - b.z)
    for (const { x, y, z, p } of pts) {
      const depth = (z + 1) / 2
      const px = cx + x * R * scale
      const py = cy + y * R * scale
      const alpha = (isLight ? 0.4 : 0.2) + depth * 0.65 + amp * 0.15
      const sz2 = p.size * (0.6 + depth * 0.9) * (1 + amp * 0.35) * (window.devicePixelRatio > 1 ? 1.4 : 1)
      ctx.fillStyle = `hsla(${p.hue}, ${sat}%, ${pLightBase + depth * pLightSpan + amp * 8}%, ${Math.min(1, alpha)})`
      ctx.beginPath()
      ctx.arc(px, py, sz2, 0, Math.PI * 2)
      ctx.fill()
    }

    // ── loading: outermost ring doubles as the progress arc ─────────────────
    let ringP = -1, ringA = 0
    const thinkStart = env.getThinkStart()
    const ringDoneAt = env.getRingDoneAt()
    if (m === 'thinking' && thinkStart != null) {
      ringP = Math.min(0.92, 1 - Math.exp(-(now - thinkStart) / 4200))
      ringA = 0.6
    } else if (ringDoneAt != null && now - ringDoneAt < 750) {
      ringP = 1
      ringA = 0.6 * (1 - (now - ringDoneAt) / 750)
    }
    if (ringP >= 0 && ringA > 0.01) {
      ctx.strokeStyle = `rgba(${ar},${ag},${ab},${ringA})`
      ctx.lineWidth = dpr2 * 2
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.arc(cx, cy, RINGS[3].r * R, -Math.PI / 2, -Math.PI / 2 + ringP * Math.PI * 2)
      ctx.stroke()
      ctx.lineCap = 'butt'
    }
  }
  draw()

  return {
    destroy() {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    },
  }
}
