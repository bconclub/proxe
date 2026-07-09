// ─────────────────────────────────────────────────────────────────────────────
// Cortex — a wide side-profile neural brain with input fibers from the left.
//
// Shape/connectome math copied from NeuralBrain.tsx (lcg / inBrain /
// buildParticles / buildEdges / perspective projection) and simplified: fixed
// side-profile view (no drag, no functional regions), one brand palette.
// Fibers stream into the brain's left pole carrying signal packets; packets
// accelerate while thinking and speaking. Speaking also makes the whole cloud
// malleable — the same blob deformation the orb uses, driven by live amp.
// ─────────────────────────────────────────────────────────────────────────────

import type { CreateRenderer } from './types'

type Vec3 = [number, number, number]
type Particle = { p: Vec3; shell: number; hue: number; wob: number }
type Edge = { a: number; b: number }
type Packet = { fiber: number; t: number; speed: number }

// Deterministic PRNG so rebuilds are stable.
function lcg(seed: number) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = (s * 48271) % 2147483647) / 2147483647 }

// Brain-ish implicit shape: ellipsoid hemispheres, flattened base, bulges.
function inBrain(x: number, y: number, z: number): boolean {
  const ax = 0.72, ay = 0.86, az = 1.04
  const e = (x * x) / (ax * ax) + (y * y) / (ay * ay) + (z * z) / (az * az)
  if (e > 1) return false
  if (y < -0.45 && z < -0.2) return false           // scoop the lower-back
  if (y < -0.62 && Math.abs(z) > 0.35) return false // flatten the base
  return true
}

function buildParticles(n: number, hue: () => number): Particle[] {
  const rnd = lcg(101)
  const out: Particle[] = []
  let guard = 0
  while (out.length < n && guard < n * 40) {
    guard++
    const x = (rnd() * 2 - 1) * 0.74
    const y = (rnd() * 2 - 1) * 0.88
    const z = (rnd() * 2 - 1) * 1.06
    if (!inBrain(x, y, z)) continue
    const r = Math.sqrt((x / 0.72) ** 2 + (y / 0.86) ** 2 + (z / 1.04) ** 2)
    if (rnd() > 0.25 + r * r * 0.9) continue // bias toward the shell
    out.push({ p: [x, y, z], shell: r, hue: hue(), wob: rnd() * Math.PI * 2 })
  }
  return out
}

function buildEdges(parts: Particle[]): Edge[] {
  const rnd = lcg(202)
  const edges: Edge[] = []
  const N = parts.length
  for (let i = 0; i < N; i++) {
    let b1 = -1, d1 = Infinity, b2 = -1, d2 = Infinity
    for (let s = 0; s < 10; s++) {
      const j = (i + 1 + Math.floor(rnd() * (N - 1))) % N
      const a = parts[i].p, b = parts[j].p
      const d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
      if (d < d1) { d2 = d1; b2 = b1; d1 = d; b1 = j } else if (d < d2) { d2 = d; b2 = j }
    }
    if (b1 >= 0 && d1 < 0.055) edges.push({ a: i, b: b1 })
    if (b2 >= 0 && d2 < 0.045 && rnd() > 0.4) edges.push({ a: i, b: b2 })
  }
  return edges
}

const FIBERS = 12

export const createCortex: CreateRenderer = (canvas, env) => {
  const ctx = canvas.getContext('2d')!
  const { rgb, s: sat, particleHue, isLight, glowMul, pLightBase, pLightSpan } = env.palette
  const [ar, ag, ab] = rgb
  let raf = 0
  let t = 0

  const parts = buildParticles(950, particleHue)
  const edges = buildEdges(parts)
  // fiber vertical offsets at the screen's left edge + entry heights on the pole
  const frnd = lcg(303)
  const fibers = Array.from({ length: FIBERS }, (_, i) => ({
    yEdge: (i / (FIBERS - 1)) * 2 - 1 + (frnd() - 0.5) * 0.12, // -1..1 of half-height
    yPole: (frnd() * 2 - 1) * 0.5,                             // entry height on the brain pole
    bend: 0.35 + frnd() * 0.4,
  }))
  const packets: Packet[] = Array.from({ length: FIBERS * 2 }, (_, i) => ({
    fiber: i % FIBERS, t: frnd(), speed: 0.0015 + frnd() * 0.0035,
  }))

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = canvas.clientWidth * dpr
    canvas.height = canvas.clientHeight * dpr
  }
  resize()
  window.addEventListener('resize', resize)

  const RIPPLE_LIFE = 1500
  const RIPPLE_SPEED = 0.24
  const RIPPLE_BAND = 42
  const FOV = 3.2

  const proj = new Float32Array(parts.length * 4) // x,y,depth,scale

  const draw = () => {
    raf = requestAnimationFrame(draw)
    t += 1
    const now = performance.now()
    const w = canvas.width, h = canvas.height
    // brain sits right of center so the fibers have runway on the left
    const cx = w * 0.56, cy = h * 0.5
    const R = Math.min(w, h) * 0.34
    ctx.clearRect(0, 0, w, h)

    const m = env.getMode()
    const amp = env.getAmp()
    const think = m === 'thinking' ? 0.55 + 0.45 * Math.sin(t * 0.028) : 0
    const dpr2 = window.devicePixelRatio > 1 ? 1.5 : 1

    // fixed side profile (z-axis → horizontal) + a whisper of idle parallax
    const yaw = Math.PI / 2 + 0.04 * Math.sin(t * 0.004)
    const pitch = -0.08 + 0.02 * Math.sin(t * 0.0027)
    const cyaw = Math.cos(yaw), syaw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch)

    const ripples = env.getRipples().filter((rp) => now - rp.born < RIPPLE_LIFE)
    const rippleShift = (px: number, py: number): [number, number] => {
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
      return [px, py]
    }

    // breathing / speaking blob deformation of the whole cloud
    const breathe = 1 + 0.02 * Math.sin(t * 0.011)

    // project all particles
    for (let i = 0; i < parts.length; i++) {
      const pt = parts[i]
      const [x, y, z] = pt.p
      let rMul = breathe
      if (m === 'thinking') rMul = 0.9 + 0.1 * Math.abs(Math.sin(t * 0.012 + pt.wob))
      if (m === 'speaking') {
        const blob =
          0.09 * (0.35 + amp) * Math.sin(2.3 * pt.shell * 3 + t * 0.018 + pt.wob) +
          0.05 * (0.35 + amp) * Math.sin(3.1 * pt.wob - t * 0.013)
        rMul = 1 + blob
      }
      const x1 = (x * cyaw + z * syaw) * rMul
      const z1 = (-x * syaw + z * cyaw) * rMul
      const yb = y * rMul
      const y2 = yb * cp - z1 * sp
      const z2 = yb * sp + z1 * cp
      const scale = FOV / (FOV - z2)
      proj[i * 4] = cx + x1 * scale * R
      proj[i * 4 + 1] = cy - y2 * scale * R
      proj[i * 4 + 2] = z2
      proj[i * 4 + 3] = scale
    }

    // the brain's left pole in screen space (where fibers converge) — project
    // the point (0, yPole, -1.0) per fiber for spread-out entry points
    const polePoint = (yPole: number): [number, number] => {
      const x = 0, y = yPole * 0.5, z = -1.0
      const x1 = x * cyaw + z * syaw, z1 = -x * syaw + z * cyaw
      const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp
      const scale = FOV / (FOV - z2)
      return [cx + x1 * scale * R, cy - y2 * scale * R]
    }

    // ── input fibers: bundles sweeping in from the left edge ────────────────
    const fiberPath = (f: typeof fibers[number]): [number, number, number, number, number, number, number, number] => {
      const [px, py] = polePoint(f.yPole)
      const y0 = cy + f.yEdge * h * 0.42
      // cubic: edge → gentle gather → pole
      return [0, y0, w * 0.12, y0, px - R * f.bend, py + (y0 - py) * 0.15, px, py]
    }
    const fiberPaths = fibers.map(fiberPath) // computed once per frame; packets reuse
    ctx.lineWidth = dpr2 * 0.7
    for (const [x0, y0, c1x, c1y, c2x, c2y, x1, y1] of fiberPaths) {
      const fg = ctx.createLinearGradient(x0, y0, x1, y1)
      fg.addColorStop(0, `rgba(${ar},${ag},${ab},0)`)
      fg.addColorStop(0.55, `rgba(${ar},${ag},${ab},${(0.06 + amp * 0.08 + think * 0.05) * (isLight ? 1.6 : 1)})`)
      fg.addColorStop(1, `rgba(${ar},${ag},${ab},${(0.12 + amp * 0.12 + think * 0.08) * (isLight ? 1.6 : 1)})`)
      ctx.strokeStyle = fg
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, x1, y1)
      ctx.stroke()
    }

    // packets racing the fibers — faster while thinking/speaking
    const bez = (p0: number, p1: number, p2: number, p3: number, tt: number) => {
      const u = 1 - tt
      return u * u * u * p0 + 3 * u * u * tt * p1 + 3 * u * tt * tt * p2 + tt * tt * tt * p3
    }
    // flat two-circle packets — per-packet radial gradients are murder on
    // software-rendered canvases
    for (const pk of packets) {
      pk.t += pk.speed * (1 + amp * 2.5 + think * 2)
      if (pk.t >= 1) pk.t = 0
      const [x0, y0, c1x, c1y, c2x, c2y, x1, y1] = fiberPaths[pk.fiber]
      const x = bez(x0, c1x, c2x, x1, pk.t)
      const y = bez(y0, c1y, c2y, y1, pk.t)
      const a = (0.25 + pk.t * 0.6) * (0.6 + amp * 0.4)
      const pr = (1.2 + pk.t * 1.4) * dpr2
      ctx.fillStyle = `rgba(${ar},${ag},${ab},${a * 0.25})`
      ctx.beginPath(); ctx.arc(x, y, pr * 2.4, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = `rgba(${ar},${ag},${ab},${a})`
      ctx.beginPath(); ctx.arc(x, y, pr, 0, Math.PI * 2); ctx.fill()
    }

    // warm core glow behind the brain
    const glowR = R * (1.15 + amp * 0.45 + think * 0.2)
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR)
    const glowA = (m === 'speaking' ? 0.12 + amp * 0.14 : m === 'thinking' ? 0.1 + think * 0.05 : 0.07) * glowMul
    g.addColorStop(0, `rgba(${ar},${ag},${ab},${glowA})`)
    g.addColorStop(1, `rgba(${ar},${ag},${ab},0)`)
    ctx.fillStyle = g
    ctx.fillRect(cx - glowR, cy - glowR, glowR * 2, glowR * 2)

    // edges (faint, depth-faded; wake up with amp) — bucketed into 4 alpha
    // bins so the whole connectome is 4 stroke calls, not one per edge
    ctx.lineWidth = dpr2 * 0.7
    const edgeGain = (1 + amp * 1.6 + think * 0.8) * (isLight ? 1.6 : 1)
    const BINS = 4
    for (let bin = 0; bin < BINS; bin++) {
      const alpha = Math.min(0.5, (0.05 + ((bin + 0.5) / BINS) * 0.1) * edgeGain)
      ctx.strokeStyle = `rgba(${ar},${ag},${ab},${alpha})`
      ctx.beginPath()
      for (let e = 0; e < edges.length; e++) {
        const a = edges[e].a, b = edges[e].b
        const depth = Math.max(0, (proj[a * 4 + 2] + proj[b * 4 + 2]) / 2)
        if (Math.min(BINS - 1, Math.floor(depth * BINS)) !== bin) continue
        ctx.moveTo(proj[a * 4], proj[a * 4 + 1])
        ctx.lineTo(proj[b * 4], proj[b * 4 + 1])
      }
      ctx.stroke()
    }

    // particles (depth → size + brightness), ripple-displaced, hue-mixed
    for (let i = 0; i < parts.length; i++) {
      const depth = proj[i * 4 + 2], scale = proj[i * 4 + 3]
      let px = proj[i * 4], py = proj[i * 4 + 1]
      if (ripples.length) { const s2 = rippleShift(px, py); px = s2[0]; py = s2[1] }
      const dfac = 0.35 + Math.max(0, depth + 1) * 0.4
      const a = Math.min(1, (0.2 + amp * 0.3 + think * 0.15) * dfac + depth * 0.18)
      const size = (0.7 + scale * 1.0) * dpr2 * (1 + amp * 0.3)
      ctx.fillStyle = `hsla(${parts[i].hue}, ${sat}%, ${pLightBase + Math.max(0, depth) * pLightSpan + amp * 8}%, ${Math.max(0.04, a)})`
      ctx.beginPath()
      ctx.arc(px, py, size, 0, Math.PI * 2)
      ctx.fill()
    }

    // loading ring while thinking + completion flash when the voice lands
    let ringP = -1, ringA = 0
    const thinkStart = env.getThinkStart()
    const ringDoneAt = env.getRingDoneAt()
    if (m === 'thinking' && thinkStart != null) {
      ringP = Math.min(0.92, 1 - Math.exp(-(now - thinkStart) / 4200))
      ringA = 0.55
    } else if (ringDoneAt != null && now - ringDoneAt < 750) {
      ringP = 1
      ringA = 0.55 * (1 - (now - ringDoneAt) / 750)
    }
    if (ringP >= 0 && ringA > 0.01) {
      ctx.strokeStyle = `rgba(${ar},${ag},${ab},${ringA})`
      ctx.lineWidth = dpr2 * 2
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.arc(cx, cy, R * 1.18, -Math.PI / 2, -Math.PI / 2 + ringP * Math.PI * 2)
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
