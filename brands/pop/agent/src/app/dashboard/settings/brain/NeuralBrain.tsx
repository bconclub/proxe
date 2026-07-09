'use client'

// NeuralBrain — clean 2D orbital node graph.
// Central core + 7 region lobes arranged in two rings.
// Animated signal pulses race along bezier paths on fire events.
// Same props interface as the old 3D particle version.

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

// Orbital layout: inner ring (4 nodes) + outer ring (3 nodes)
const INNER_RING: RegionId[] = ['decisions', 'conversation', 'memory', 'timing']
const OUTER_RING: RegionId[] = ['intake', 'scoring', 'output']

type Signal = {
  from: RegionId
  t: number        // 0 → 1 along the path
  speed: number
  life: number
  color: [number, number, number]
  toCore: boolean  // direction: lobe→core or core→lobe
}

function nodePos(id: RegionId, cx: number, cy: number, R: number): [number, number] {
  const innerIdx = INNER_RING.indexOf(id)
  if (innerIdx !== -1) {
    const angle = (innerIdx / INNER_RING.length) * Math.PI * 2 - Math.PI / 2
    return [cx + Math.cos(angle) * R * 0.45, cy + Math.sin(angle) * R * 0.45]
  }
  const outerIdx = OUTER_RING.indexOf(id)
  const angle = (outerIdx / OUTER_RING.length) * Math.PI * 2 - Math.PI / 6
  return [cx + Math.cos(angle) * R * 0.82, cy + Math.sin(angle) * R * 0.82]
}

export default function NeuralBrain({ firing, hovered, intensity, onPick, onHover }: {
  firing: RegionId | null
  hovered: RegionId | null
  intensity: Record<RegionId, number>
  onPick: (r: RegionId | null) => void
  onHover: (r: RegionId | null) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef({ firing, hovered, intensity })
  stateRef.current = { firing, hovered, intensity }
  const signalsRef = useRef<Signal[]>([])
  const lastFire = useRef<RegionId | null>(null)
  const pulseRef = useRef(0) // global time for core pulse

  // Spawn signals when firing changes
  useEffect(() => {
    if (firing && firing !== lastFire.current) {
      const col = REGION_META[firing].color
      for (let i = 0; i < 3; i++) {
        signalsRef.current.push({
          from: firing, t: 0, speed: 0.6 + Math.random() * 0.5,
          life: 1, color: col, toCore: true,
        })
      }
      // bounce back from core
      setTimeout(() => {
        for (let i = 0; i < 2; i++) {
          signalsRef.current.push({
            from: firing!, t: 0, speed: 0.5 + Math.random() * 0.4,
            life: 1, color: col, toCore: false,
          })
        }
      }, 300)
    }
    lastFire.current = firing
  }, [firing])

  // Hit test
  const posCache = useRef<Map<RegionId, [number, number]>>(new Map())
  const pick = useCallback((mx: number, my: number, doSelect: boolean) => {
    let best: RegionId | null = null, bd = 38 * 38
    for (const id of REGION_IDS) {
      const p = posCache.current.get(id)
      if (!p) continue
      const d = (mx - p[0]) ** 2 + (my - p[1]) ** 2
      if (d < bd) { bd = d; best = id }
    }
    if (doSelect) onPick(best); else onHover(best)
  }, [onPick, onHover])

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    let raf = 0, running = true
    const dpr = Math.min(2, window.devicePixelRatio || 1)

    const resize = () => {
      const r = canvas.getBoundingClientRect()
      canvas.width = Math.max(1, Math.floor(r.width * dpr))
      canvas.height = Math.max(1, Math.floor(r.height * dpr))
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const frame = (ts: number) => {
      if (!running) return
      pulseRef.current = ts
      const W = canvas.width, H = canvas.height
      const cx = W / 2, cy = H / 2
      const R = Math.min(W, H) * 0.46
      const st = stateRef.current

      ctx.clearRect(0, 0, W, H)

      // precompute node positions
      const positions = new Map<RegionId, [number, number]>()
      for (const id of REGION_IDS) {
        positions.set(id, nodePos(id, cx, cy, R))
      }
      // expose for hit testing (in canvas coords)
      for (const [id, p] of positions) posCache.current.set(id, p)

      // ── connection lines (lobe → core) ──────────────────────────────────────
      for (const id of REGION_IDS) {
        const [nx, ny] = positions.get(id)!
        const hot = st.firing === id || st.hovered === id
        const intens = st.intensity[id] || 0
        const col = REGION_META[id].color
        const alpha = hot ? 0.35 : 0.06 + intens * 0.15

        // control point bows slightly outward
        const bx = (cx + nx) / 2 + (ny - cy) * 0.18
        const by = (cy + ny) / 2 - (nx - cx) * 0.18

        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.quadraticCurveTo(bx, by, nx, ny)
        ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${alpha})`
        ctx.lineWidth = hot ? 1.5 * dpr : 1 * dpr
        ctx.stroke()
      }

      // ── cross-connections (inner ring adjacents) ─────────────────────────────
      for (let i = 0; i < INNER_RING.length; i++) {
        const a = INNER_RING[i], b = INNER_RING[(i + 1) % INNER_RING.length]
        const [ax, ay] = positions.get(a)!
        const [bx, by] = positions.get(b)!
        const col = [80, 80, 100] as [number, number, number]
        ctx.beginPath()
        ctx.moveTo(ax, ay)
        ctx.lineTo(bx, by)
        ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},0.07)`
        ctx.lineWidth = 0.8 * dpr
        ctx.stroke()
      }

      // ── signal pulses racing along bezier paths ──────────────────────────────
      const sigs = signalsRef.current
      for (let s = sigs.length - 1; s >= 0; s--) {
        const sig = sigs[s]
        sig.t += 0.016 * sig.speed
        sig.life -= 0.018
        if (sig.t >= 1 || sig.life <= 0) { sigs.splice(s, 1); continue }

        const [nx, ny] = positions.get(sig.from)!
        const bx = (cx + nx) / 2 + (ny - cy) * 0.18
        const by = (cy + ny) / 2 - (nx - cx) * 0.18
        const t = sig.toCore ? sig.t : 1 - sig.t

        // quadratic bezier point
        const mt = 1 - t
        const px = mt * mt * nx + 2 * mt * t * bx + t * t * cx
        const py = mt * mt * ny + 2 * mt * t * by + t * t * cy

        const c = sig.color
        const grd = ctx.createRadialGradient(px, py, 0, px, py, 5 * dpr)
        grd.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${sig.life})`)
        grd.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`)
        ctx.fillStyle = grd
        ctx.beginPath(); ctx.arc(px, py, 5 * dpr, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = `rgba(255,255,255,${sig.life * 0.9})`
        ctx.beginPath(); ctx.arc(px, py, 1.4 * dpr, 0, Math.PI * 2); ctx.fill()
      }
      if (sigs.length > 60) sigs.splice(0, sigs.length - 60)

      // ── region nodes ─────────────────────────────────────────────────────────
      for (const id of REGION_IDS) {
        const [nx, ny] = positions.get(id)!
        const col = REGION_META[id].color
        const hot = st.firing === id
        const hov = st.hovered === id
        const intens = st.intensity[id] || 0
        const r = (INNER_RING.includes(id) ? 18 : 14) * dpr
        const pulse = hot ? 1 + 0.18 * Math.sin(ts * 0.006) : 1

        // outer glow
        if (hot || hov || intens > 0.3) {
          const glowR = r * 2.8 * pulse
          const grd = ctx.createRadialGradient(nx, ny, 0, nx, ny, glowR)
          grd.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${hot ? 0.22 : hov ? 0.14 : intens * 0.1})`)
          grd.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`)
          ctx.fillStyle = grd
          ctx.beginPath(); ctx.arc(nx, ny, glowR, 0, Math.PI * 2); ctx.fill()
        }

        // node ring
        ctx.beginPath(); ctx.arc(nx, ny, r * pulse, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${hot ? 0.9 : hov ? 0.7 : 0.35 + intens * 0.3})`
        ctx.lineWidth = (hot ? 2 : 1.2) * dpr
        ctx.stroke()

        // node fill (subtle)
        ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${hot ? 0.18 : hov ? 0.1 : 0.04 + intens * 0.06})`
        ctx.beginPath(); ctx.arc(nx, ny, r * pulse, 0, Math.PI * 2); ctx.fill()

        // inner dot
        ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${hot ? 0.9 : hov ? 0.6 : 0.3 + intens * 0.3})`
        ctx.beginPath(); ctx.arc(nx, ny, 3 * dpr * pulse, 0, Math.PI * 2); ctx.fill()

        // label
        ctx.font = `${hov || hot ? 600 : 400} ${11 * dpr}px ui-sans-serif,system-ui`
        ctx.textAlign = 'center'
        ctx.fillStyle = `rgba(255,255,255,${hot ? 0.95 : hov ? 0.85 : 0.45 + intens * 0.3})`
        const labelY = ny + r * pulse + 14 * dpr
        ctx.fillText(REGION_META[id].name, nx, labelY)
      }

      // ── core node ────────────────────────────────────────────────────────────
      const coreR = 22 * dpr
      const corePulse = 1 + 0.06 * Math.sin(ts * 0.003)
      const activeColor = st.firing ? REGION_META[st.firing].color : [99, 102, 241] as [number, number, number]

      // core glow
      const coreGrd = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 3 * corePulse)
      coreGrd.addColorStop(0, `rgba(${activeColor[0]},${activeColor[1]},${activeColor[2]},0.2)`)
      coreGrd.addColorStop(1, `rgba(${activeColor[0]},${activeColor[1]},${activeColor[2]},0)`)
      ctx.fillStyle = coreGrd
      ctx.beginPath(); ctx.arc(cx, cy, coreR * 3 * corePulse, 0, Math.PI * 2); ctx.fill()

      // core ring
      ctx.beginPath(); ctx.arc(cx, cy, coreR * corePulse, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(${activeColor[0]},${activeColor[1]},${activeColor[2]},0.7)`
      ctx.lineWidth = 1.5 * dpr
      ctx.stroke()

      // core fill
      ctx.fillStyle = `rgba(${activeColor[0]},${activeColor[1]},${activeColor[2]},0.12)`
      ctx.beginPath(); ctx.arc(cx, cy, coreR * corePulse, 0, Math.PI * 2); ctx.fill()

      // core label
      ctx.font = `500 ${10 * dpr}px ui-sans-serif,system-ui`
      ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.fillText('CORE', cx, cy + 4 * dpr)

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => { running = false; cancelAnimationFrame(raf); ro.disconnect() }
  }, [])

  const onMove = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const mx = (e.clientX - rect.left) * dpr
    const my = (e.clientY - rect.top) * dpr
    pick(mx, my, false)
  }, [pick])

  const onClick = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const mx = (e.clientX - rect.left) * dpr
    const my = (e.clientY - rect.top) * dpr
    pick(mx, my, true)
  }, [pick])

  return (
    <canvas
      ref={canvasRef}
      onPointerMove={onMove}
      onPointerLeave={() => onHover(null)}
      onClick={onClick}
      style={{ width: '100%', height: '100%', display: 'block', cursor: 'default', touchAction: 'none' }}
    />
  )
}
