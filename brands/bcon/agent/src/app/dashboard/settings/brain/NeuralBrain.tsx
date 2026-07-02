'use client'

// ─────────────────────────────────────────────────────────────────────────────
// NeuralBrain — a real 3D neural particle-cloud brain on a raw <canvas>.
// No three.js, no deps: hand-rolled 3D → perspective projection, depth sorting,
// drag-to-rotate + auto-spin, a precomputed connectome edge set, and signal
// packets that race the edges when real events land. Each particle belongs to
// a functional lobe (Intake / Conversation / Decisions / Scoring / Memory /
// Timing / Output); clicking a lobe is hit-tested against its projected core.
// The component is presentational — data + the info panel live in BrainHero.
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useEffect, useMemo, useCallback } from 'react'

export type RegionId = 'decisions' | 'scoring' | 'intake' | 'conversation' | 'memory' | 'timing' | 'output'

export const REGION_META: Record<RegionId, { name: string; blurb: string; color: [number, number, number]; center: [number, number, number]; kinds: string[] }> = {
  decisions:    { name: 'Decisions',    blurb: 'Chooses the next move per lead - which sequence, which step, wait or push.', color: [139, 92, 246],  center: [0.28, 0.42, 0.62],  kinds: [] },
  scoring:      { name: 'Scoring',      blurb: 'Reads every reply and scores 0-100: AI signals, activity, readiness.',       color: [59, 130, 246],  center: [-0.34, 0.66, -0.05], kinds: ['stage'] },
  intake:       { name: 'Intake',       blurb: 'Where leads land - website, web chat, Meta forms, WhatsApp, calls.',          color: [34, 197, 94],   center: [0.1, 0.2, -0.85],   kinds: ['lead'] },
  conversation: { name: 'Conversation', blurb: 'The live chats - every message in and every reply PROXe writes.',             color: [245, 158, 11],  center: [0.4, -0.42, 0.5],   kinds: ['chat_in', 'chat_out'] },
  memory:       { name: 'Memory',       blurb: 'Everything it knows - knowledge base, team notes, lead history.',             color: [236, 72, 153],  center: [0.0, 0.02, 0.06],   kinds: ['note'] },
  timing:       { name: 'Timing',       blurb: 'When things fire - cadences by temperature, quiet hours, reminders.',         color: [56, 189, 248],  center: [-0.36, -0.5, -0.55], kinds: [] },
  output:       { name: 'Output',       blurb: 'What actually goes out - approved sends, templates, follow-ups.',             color: [239, 68, 68],   center: [0.05, -0.78, 0.0],  kinds: ['send'] },
}
const REGION_IDS = Object.keys(REGION_META) as RegionId[]

type Vec3 = [number, number, number]
type Particle = { p: Vec3; region: RegionId; shell: number }
type Edge = { a: number; b: number }
type Signal = { edge: number[]; t: number; speed: number; color: [number, number, number]; life: number }

// Deterministic PRNG so SSR and CSR agree (and rebuilds are stable).
function lcg(seed: number) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = (s * 48271) % 2147483647) / 2147483647 }

// Brain-ish implicit shape: two ellipsoid hemispheres, flattened base, front
// bulge, back bulge. Returns true if the point is inside the brain volume.
function inBrain(x: number, y: number, z: number): boolean {
  const ax = 0.72, ay = 0.86, az = 1.04
  let e = (x * x) / (ax * ax) + (y * y) / (ay * ay) + (z * z) / (az * az)
  if (e > 1) return false
  if (y < -0.45 && z < -0.2) return false        // scoop the lower-back (cerebellum gap)
  if (y < -0.62 && Math.abs(z) > 0.35) return false // flatten the base
  return true
}

function nearestRegion(x: number, y: number, z: number): RegionId {
  let best: RegionId = 'memory', bd = Infinity
  for (const id of REGION_IDS) {
    const c = REGION_META[id].center
    const d = (x - c[0]) ** 2 + (y - c[1]) ** 2 + (z - c[2]) ** 2
    if (d < bd) { bd = d; best = id }
  }
  return best
}

function buildParticles(n: number): Particle[] {
  const rnd = lcg(101)
  const out: Particle[] = []
  let guard = 0
  while (out.length < n && guard < n * 40) {
    guard++
    const x = (rnd() * 2 - 1) * 0.74
    const y = (rnd() * 2 - 1) * 0.88
    const z = (rnd() * 2 - 1) * 1.06
    if (!inBrain(x, y, z)) continue
    // Bias toward the shell for the wireframe-brain look.
    const r = Math.sqrt((x / 0.72) ** 2 + (y / 0.86) ** 2 + (z / 1.04) ** 2)
    if (rnd() > 0.25 + r * r * 0.9) continue
    out.push({ p: [x, y, z], region: nearestRegion(x, y, z), shell: r })
  }
  return out
}

// Sparse connectome: connect each particle to a couple of nearby ones.
function buildEdges(parts: Particle[]): Edge[] {
  const rnd = lcg(202)
  const edges: Edge[] = []
  const N = parts.length
  for (let i = 0; i < N; i++) {
    // sample a handful of candidates, keep the 2 closest within a radius
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

export default function NeuralBrain({ firing, hovered, intensity, onPick, onHover }: {
  firing: RegionId | null
  hovered: RegionId | null
  intensity: Record<RegionId, number>
  onPick: (r: RegionId | null) => void
  onHover: (r: RegionId | null) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const parts = useMemo(() => buildParticles(1500), [])
  const edges = useMemo(() => buildEdges(parts), [parts])
  // Edge index per region (for firing signals along a lobe's own wiring).
  const edgesByRegion = useMemo(() => {
    const map: Record<RegionId, number[]> = { decisions: [], scoring: [], intake: [], conversation: [], memory: [], timing: [], output: [] }
    edges.forEach((e, i) => { const r = parts[e.a].region; map[r].push(i) })
    return map
  }, [edges, parts])

  // Mutable state read by the animation loop (avoids re-subscribing rAF).
  const stateRef = useRef({ firing, hovered, intensity })
  stateRef.current = { firing, hovered, intensity }
  const rot = useRef({ yaw: 0.5, pitch: -0.12, vyaw: 0.0025, drag: false, px: 0, py: 0, idleYaw: 0.0025 })
  const signalsRef = useRef<Signal[]>([])
  const projRef = useRef<Record<RegionId, { x: number; y: number; z: number }>>({} as any)
  const lastFire = useRef<RegionId | null>(null)

  // Spawn signal packets when `firing` flips to a new region.
  useEffect(() => {
    if (firing && firing !== lastFire.current) {
      const pool = edgesByRegion[firing]
      const col = REGION_META[firing].color
      for (let k = 0; k < 7 && pool.length; k++) {
        const eIdx = pool[Math.floor(Math.random() * pool.length)]
        signalsRef.current.push({ edge: [edges[eIdx].a, edges[eIdx].b], t: 0, speed: 0.5 + Math.random() * 0.7, color: col, life: 1 })
      }
    }
    lastFire.current = firing
  }, [firing, edgesByRegion, edges])

  const pick = useCallback((mx: number, my: number, doSelect: boolean) => {
    const proj = projRef.current
    let best: RegionId | null = null, bd = 52 * 52
    for (const id of REGION_IDS) {
      const q = proj[id]; if (!q) continue
      const d = (mx - q.x) ** 2 + (my - q.y) ** 2
      if (d < bd) { bd = d; best = id }
    }
    if (doSelect) onPick(best); else onHover(best)
  }, [onPick, onHover])

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    let raf = 0, running = true
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1)

    const resize = () => {
      const r = canvas.getBoundingClientRect()
      canvas.width = Math.max(1, Math.floor(r.width * dpr))
      canvas.height = Math.max(1, Math.floor(r.height * dpr))
    }
    resize()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    ro?.observe(canvas)

    const proj = new Float32Array(parts.length * 4) // x,y,depth,scale

    const frame = () => {
      if (!running) return
      const W = canvas.width, H = canvas.height
      const cx = W / 2, cy = H * 0.47
      const R = Math.min(W, H) * 0.42
      const st = stateRef.current

      if (!rot.current.drag) rot.current.yaw += rot.current.idleYaw
      const yaw = rot.current.yaw, pitch = rot.current.pitch
      const cyaw = Math.cos(yaw), syaw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch)
      const FOV = 3.2

      ctx.clearRect(0, 0, W, H)
      ctx.globalCompositeOperation = 'lighter'

      // project all particles
      for (let i = 0; i < parts.length; i++) {
        const [x, y, z] = parts[i].p
        // yaw around Y, then pitch around X
        const x1 = x * cyaw + z * syaw
        const z1 = -x * syaw + z * cyaw
        const y2 = y * cp - z1 * sp
        const z2 = y * sp + z1 * cp
        const scale = FOV / (FOV - z2)
        proj[i * 4] = cx + x1 * scale * R
        proj[i * 4 + 1] = cy - y2 * scale * R
        proj[i * 4 + 2] = z2
        proj[i * 4 + 3] = scale
      }

      // project region cores (for hit-testing + labels)
      const pr: Record<RegionId, { x: number; y: number; z: number }> = {} as any
      for (const id of REGION_IDS) {
        const [x, y, z] = REGION_META[id].center
        const x1 = x * cyaw + z * syaw, z1 = -x * syaw + z * cyaw
        const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp
        const scale = FOV / (FOV - z2)
        pr[id] = { x: cx + x1 * scale * R, y: cy - y2 * scale * R, z: z2 }
      }
      projRef.current = pr

      // edges (faint, depth-faded)
      ctx.lineWidth = 1 * dpr
      for (let e = 0; e < edges.length; e++) {
        const a = edges[e].a, b = edges[e].b
        const az = proj[a * 4 + 2], bz = proj[b * 4 + 2]
        const region = parts[a].region
        const hot = st.firing === region || st.hovered === region
        const depth = (az + bz) / 2
        const alpha = (0.05 + Math.max(0, depth) * 0.1) * (hot ? 3 : 1)
        if (alpha < 0.02) continue
        const c = REGION_META[region].color
        ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${Math.min(0.5, alpha)})`
        ctx.beginPath()
        ctx.moveTo(proj[a * 4], proj[a * 4 + 1])
        ctx.lineTo(proj[b * 4], proj[b * 4 + 1])
        ctx.stroke()
      }

      // particles (depth → size + brightness)
      for (let i = 0; i < parts.length; i++) {
        const depth = proj[i * 4 + 2], scale = proj[i * 4 + 3]
        const region = parts[i].region
        const c = REGION_META[region].color
        const lit = st.firing === region ? 1 : st.hovered === region ? 0.75 : 0.12 + (st.intensity[region] || 0) * 0.5
        const dfac = 0.35 + Math.max(0, depth + 1) * 0.4
        const a = Math.min(1, (0.18 + lit * 0.7) * dfac)
        const size = (0.7 + scale * 1.1) * dpr * (st.firing === region ? 1.6 : 1)
        ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a})`
        ctx.beginPath()
        ctx.arc(proj[i * 4], proj[i * 4 + 1], size, 0, 6.283)
        ctx.fill()
      }

      // signal packets racing edges
      const sigs = signalsRef.current
      for (let s = sigs.length - 1; s >= 0; s--) {
        const sig = sigs[s]
        sig.t += 0.02 * sig.speed
        sig.life -= 0.012
        if (sig.t >= 1 || sig.life <= 0) { sigs.splice(s, 1); continue }
        const a = sig.edge[0], b = sig.edge[1]
        const x = proj[a * 4] + (proj[b * 4] - proj[a * 4]) * sig.t
        const y = proj[a * 4 + 1] + (proj[b * 4 + 1] - proj[a * 4 + 1]) * sig.t
        const c = sig.color
        const grd = ctx.createRadialGradient(x, y, 0, x, y, 7 * dpr)
        grd.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${0.9 * sig.life})`)
        grd.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`)
        ctx.fillStyle = grd
        ctx.beginPath(); ctx.arc(x, y, 7 * dpr, 0, 6.283); ctx.fill()
        ctx.fillStyle = `rgba(255,255,255,${0.9 * sig.life})`
        ctx.beginPath(); ctx.arc(x, y, 1.6 * dpr, 0, 6.283); ctx.fill()
      }
      if (sigs.length > 220) sigs.splice(0, sigs.length - 220)

      // firing halo at the lobe core
      if (st.firing && pr[st.firing]) {
        const q = pr[st.firing], c = REGION_META[st.firing].color
        const grd = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, 60 * dpr)
        grd.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},0.22)`)
        grd.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`)
        ctx.fillStyle = grd
        ctx.beginPath(); ctx.arc(q.x, q.y, 60 * dpr, 0, 6.283); ctx.fill()
      }

      ctx.globalCompositeOperation = 'source-over'
      // hovered / selected label
      const label = st.hovered || st.firing
      if (st.hovered && pr[st.hovered]) {
        const q = pr[st.hovered]
        ctx.font = `800 ${13 * dpr}px ui-sans-serif, system-ui`
        ctx.textAlign = 'center'
        ctx.fillStyle = 'rgba(255,255,255,0.92)'
        ctx.fillText(REGION_META[st.hovered].name, q.x, q.y - 16 * dpr)
      }
      void label

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => { running = false; cancelAnimationFrame(raf); ro?.disconnect() }
  }, [parts, edges])

  // pointer handlers
  const onDown = (e: React.PointerEvent) => { rot.current.drag = true; rot.current.px = e.clientX; rot.current.py = e.clientY; (e.target as Element).setPointerCapture?.(e.pointerId) }
  const onUp = () => { rot.current.drag = false }
  const onMove = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const mx = (e.clientX - rect.left) * (canvasRef.current!.width / rect.width)
    const my = (e.clientY - rect.top) * (canvasRef.current!.height / rect.height)
    if (rot.current.drag) {
      rot.current.yaw += (e.clientX - rot.current.px) * 0.008
      rot.current.pitch = Math.max(-1.1, Math.min(1.1, rot.current.pitch + (e.clientY - rot.current.py) * 0.006))
      rot.current.px = e.clientX; rot.current.py = e.clientY
    } else {
      pick(mx, my, false)
    }
  }
  const onClick = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const mx = (e.clientX - rect.left) * (canvasRef.current!.width / rect.width)
    const my = (e.clientY - rect.top) * (canvasRef.current!.height / rect.height)
    pick(mx, my, true)
  }

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerLeave={() => { onUp(); onHover(null) }}
      onPointerMove={onMove}
      onClick={onClick}
      style={{ width: '100%', height: '100%', display: 'block', cursor: rot.current.drag ? 'grabbing' : 'grab', touchAction: 'none' }}
    />
  )
}
