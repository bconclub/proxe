// ─────────────────────────────────────────────────────────────────────────────
// Pulse Orb — the classic Brain: a neural particle sphere in brand colors.
//
// Extracted verbatim from VoiceOrb's original draw loop; the only semantic
// deltas are ripple/ring timing converted from frames to wall-clock ms (so all
// renderers share ms-stamped ripples) and the center hairline upgraded to a
// live waveform while speaking (the full-width pulse line of the mockup).
// Touch: ripples stay ON the blob. Speaking: the sphere turns malleable and
// sways to the live waveform.
// ─────────────────────────────────────────────────────────────────────────────

import type { CreateRenderer } from './types'

const N = 900

type P = { theta: number; phi: number; r: number; speed: number; hue: number; size: number; wob: number }

export const createPulseOrb: CreateRenderer = (canvas, env) => {
  const ctx = canvas.getContext('2d')!
  const { rgb, sweepRgb, s: sat, particleHue, isLight, coreRGB, glowMul, pLightBase, pLightSpan } = env.palette
  const [ar, ag, ab] = rgb
  let raf = 0
  let t = 0

  const parts: P[] = Array.from({ length: N }, () => {
    const u = Math.random() * 2 - 1
    return {
      theta: Math.random() * Math.PI * 2,
      phi: Math.acos(u),
      r: 0.72 + Math.random() * 0.28,
      speed: 0.0006 + Math.random() * 0.0016,
      hue: particleHue(),
      size: 0.8 + Math.random() * 1.6,
      wob: Math.random() * Math.PI * 2,
    }
  })

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = canvas.clientWidth * dpr
    canvas.height = canvas.clientHeight * dpr
  }
  resize()
  window.addEventListener('resize', resize)

  // ms-based ripple physics (was 90 frames / 4 px-per-frame at 60fps)
  const RIPPLE_LIFE = 1500
  const RIPPLE_SPEED = 0.24 // px per ms
  const RIPPLE_BAND = 42

  const draw = () => {
    raf = requestAnimationFrame(draw)
    t += 1
    const now = performance.now()
    const w = canvas.width, h = canvas.height
    // Centered horizontally, sitting a little ABOVE the vertical middle, and
    // bigger/fuller than before so the brain fills the space.
    const cx = w / 2, cy = h * 0.43
    const R = Math.min(w, h) * 0.30
    ctx.clearRect(0, 0, w, h)

    const m = env.getMode()
    const amp = env.getAmp()
    const breathe = 1 + 0.022 * Math.sin(t * 0.011)
    const think = m === 'thinking' ? 0.55 + 0.45 * Math.sin(t * 0.028) : 0
    const scale = m === 'speaking' ? 1 + amp * 0.14 : breathe

    const ripples = env.getRipples().filter((rp) => now - rp.born < RIPPLE_LIFE)

    // ── quiet radar chrome / pulse line ─────────────────────────────────────
    const dpr2 = window.devicePixelRatio > 1 ? 1.5 : 1
    const lineA = (0.04 + amp * 0.06 + think * 0.03) * (isLight ? 1.4 : 1)
    const lg = ctx.createLinearGradient(cx - R * 3.2, cy, cx + R * 3.2, cy)
    lg.addColorStop(0, `rgba(${ar},${ag},${ab},0)`)
    lg.addColorStop(0.5, `rgba(${ar},${ag},${ab},${lineA})`)
    lg.addColorStop(1, `rgba(${ar},${ag},${ab},0)`)
    ctx.strokeStyle = lg
    ctx.lineWidth = dpr2
    const wave = env.getWaveform()
    if (wave && m === 'speaking') {
      // live waveform rides the spine while the brain talks — full width,
      // brightest near the orb, fading to the edges via the same gradient
      const lg2 = ctx.createLinearGradient(0, cy, w, cy)
      lg2.addColorStop(0, `rgba(${ar},${ag},${ab},0)`)
      lg2.addColorStop(0.5, `rgba(${ar},${ag},${ab},${0.28 + amp * 0.35})`)
      lg2.addColorStop(1, `rgba(${ar},${ag},${ab},0)`)
      ctx.strokeStyle = lg2
      ctx.lineWidth = dpr2
      ctx.beginPath()
      for (let i = 0; i < wave.length; i++) {
        const x = (i / (wave.length - 1)) * w
        const y = cy + ((wave[i] - 128) / 128) * R * 0.55
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.stroke()
    } else {
      ctx.beginPath(); ctx.moveTo(cx - R * 3.2, cy); ctx.lineTo(cx + R * 3.2, cy); ctx.stroke()
    }
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
    const thinkStart = env.getThinkStart()
    const ringDoneAt = env.getRingDoneAt()
    if (m === 'thinking' && thinkStart != null) {
      const el = now - thinkStart
      ringP = Math.min(0.92, 1 - Math.exp(-el / 4200)) // eases toward full, never stalls
      ringA = 0.55
    } else if (ringDoneAt != null && now - ringDoneAt < 750) {
      ringP = 1
      ringA = 0.55 * (1 - (now - ringDoneAt) / 750) // full circle, then fade out
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
    const [sr, sg2, sb] = sweepRgb
    const sweepA = t * 0.0035
    const sg = ctx.createLinearGradient(cx, cy, cx + Math.cos(sweepA) * R * 1.9, cy + Math.sin(sweepA) * R * 1.9)
    sg.addColorStop(0, `rgba(${sr},${sg2},${sb},0)`)
    sg.addColorStop(1, `rgba(${sr},${sg2},${sb},${0.12 * (isLight ? 1.4 : 1)})`)
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
      for (const rp of ripples) {
        const age = now - rp.born
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
      ctx.fillStyle = `hsla(${p.hue}, ${sat}%, ${pLightBase + depth * pLightSpan + amp * 8}%, ${Math.min(1, alpha)})`
      ctx.beginPath()
      ctx.arc(px, py, sz, 0, Math.PI * 2)
      ctx.fill()
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
