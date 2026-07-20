'use client'

/**
 * KnowledgeGraph — an Obsidian-style force-directed map of everything the agent
 * "knows": the uploaded knowledge base + every prompt across the system, in one
 * highlight view. Self-contained canvas (no graph library), theme-aware via CSS
 * variables, with drag / zoom / pan, hover-to-highlight neighbours, and
 * click-to-select (surfaces the node in a side panel via onSelect).
 *
 * The render loop is DEMAND-DRIVEN: it runs while the layout is hot or the user
 * is interacting, then stops (a settled canvas uses no CPU and lets screenshot /
 * paint-idle tooling capture the frame). Any interaction wakes it again.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import type { PointerEvent as RPointerEvent, WheelEvent as RWheelEvent, MouseEvent as RMouseEvent } from 'react'

export type GraphKind = 'root' | 'hub' | 'leaf'
export type GraphGroup =
  | 'root' | 'knowledge' | 'prompts' | 'voice' | 'brain' | 'channels' | 'templates'

export interface GraphNode {
  id: string
  label: string
  kind: GraphKind
  group: GraphGroup
  meta?: string
  content?: string
  chars?: number
  editHref?: string
  overridden?: boolean
  status?: string
}
export interface GraphLink { source: string; target: string }

interface SimNode extends GraphNode {
  x: number; y: number; vx: number; vy: number; r: number; fixed?: boolean
}

// Categorical palette (works on dark + light). Root uses the brand accent.
const GROUP_COLORS: Record<GraphGroup, string> = {
  root: '#A3E635',
  knowledge: '#A3E635',
  prompts: '#60A5FA',
  voice: '#F472B6',
  brain: '#C084FC',
  channels: '#FBBF24',
  templates: '#34D399',
}

function radiusFor(n: GraphNode): number {
  if (n.kind === 'root') return 14
  if (n.kind === 'hub') return 8
  return 4.5
}

export default function KnowledgeGraph({
  nodes,
  links,
  onSelect,
  selectedId,
  height = 520,
}: {
  nodes: GraphNode[]
  links: GraphLink[]
  onSelect: (n: GraphNode | null) => void
  selectedId?: string | null
  height?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const simRef = useRef<{
    nodes: SimNode[]
    links: { s: SimNode; t: SimNode }[]
    adj: Map<string, Set<string>>
  }>({ nodes: [], links: [], adj: new Map() })
  const viewRef = useRef({ scale: 1, tx: 0, ty: 0 })
  const dragRef = useRef<{ node?: SimNode; panning?: boolean; lastX: number; lastY: number; moved: boolean; wasPinned?: boolean }>(
    { lastX: 0, lastY: 0, moved: false },
  )
  const hoverRef = useRef<string | null>(null)
  const selectedRef = useRef<string | null>(selectedId ?? null)
  const rafRef = useRef<number | null>(null)
  const runningRef = useRef(false)
  const alphaRef = useRef(1)
  const wakeRef = useRef<(kick?: boolean) => void>(() => {})
  const themeRef = useRef({ bg: '#0b0f14', label: '#e5e7eb', line: 'rgba(148,163,184,0.22)' })
  const [hoverLabel, setHoverLabel] = useState<{ x: number; y: number; text: string } | null>(null)

  // Resolve theme colors from the dashboard CSS variables.
  const readTheme = useCallback(() => {
    if (!wrapRef.current) return
    const cs = getComputedStyle(wrapRef.current)
    const bg = cs.getPropertyValue('--bg-secondary').trim() || '#0b0f14'
    const label = cs.getPropertyValue('--text-primary').trim() || '#e5e7eb'
    themeRef.current = { bg, label, line: 'rgba(148,163,184,0.22)' }
  }, [])

  // Build the simulation graph whenever data changes.
  useEffect(() => {
    const w = wrapRef.current?.clientWidth || 800
    const h = height
    const byId = new Map<string, SimNode>()
    const sim: SimNode[] = nodes.map((n, i) => {
      // Seed positions on a spiral around center for a stable, non-random start.
      const ang = i * 2.399963 // golden angle
      const rad = 20 + Math.sqrt(i) * 26
      const s: SimNode = {
        ...n,
        x: w / 2 + Math.cos(ang) * rad,
        y: h / 2 + Math.sin(ang) * rad,
        vx: 0, vy: 0,
        r: radiusFor(n),
        fixed: n.kind === 'root',
      }
      if (n.kind === 'root') { s.x = w / 2; s.y = h / 2 }
      byId.set(n.id, s)
      return s
    })
    const simLinks = links
      .map((l) => ({ s: byId.get(l.source)!, t: byId.get(l.target)! }))
      .filter((l) => l.s && l.t)
    const adj = new Map<string, Set<string>>()
    for (const n of nodes) adj.set(n.id, new Set())
    for (const l of links) {
      adj.get(l.source)?.add(l.target)
      adj.get(l.target)?.add(l.source)
    }
    simRef.current = { nodes: sim, links: simLinks, adj }
    viewRef.current = { scale: 1, tx: 0, ty: 0 }
    alphaRef.current = 1
    readTheme()
    wakeRef.current(true)
  }, [nodes, links, height, readTheme])

  // Keep the selection in a ref so selecting a node re-highlights without
  // restarting the whole layout.
  useEffect(() => {
    selectedRef.current = selectedId ?? null
    wakeRef.current(false)
  }, [selectedId])

  // Physics + render loop (demand-driven — see file header).
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const resize = () => {
      const w = wrapRef.current?.clientWidth || 800
      canvas.width = w * dpr
      canvas.height = height * dpr
      canvas.style.width = w + 'px'
      canvas.style.height = height + 'px'
      wakeRef.current(false)
    }
    resize()
    window.addEventListener('resize', resize)

    const physics = () => {
      const { nodes: N, links: L } = simRef.current
      const w = canvas.width / dpr
      const h = canvas.height / dpr
      const alpha = alphaRef.current
      const hot = alpha > 0.005

      if (hot) {
        // Repulsion (naive O(n^2); node counts here are modest).
        for (let i = 0; i < N.length; i++) {
          const a = N[i]
          for (let j = i + 1; j < N.length; j++) {
            const b = N[j]
            let dx = a.x - b.x, dy = a.y - b.y
            let d2 = dx * dx + dy * dy
            if (d2 < 0.01) { d2 = 0.01; dx = 0.05; dy = 0.05 }
            const dist = Math.sqrt(d2)
            const force = (1500 * alpha) / d2
            const fx = (dx / dist) * force
            const fy = (dy / dist) * force
            a.vx += fx; a.vy += fy
            b.vx -= fx; b.vy -= fy
          }
        }
        // Springs.
        for (const l of L) {
          const desired = l.s.kind === 'root' || l.t.kind === 'root' ? 120 : 74
          const dx = l.t.x - l.s.x, dy = l.t.y - l.s.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.01
          const k = 0.055 * alpha
          const disp = (dist - desired) * k
          const fx = (dx / dist) * disp
          const fy = (dy / dist) * disp
          l.s.vx += fx; l.s.vy += fy
          l.t.vx -= fx; l.t.vy -= fy
        }
        // Gravity to center + integrate. Pinned nodes (fixed) stay put — the
        // user placed them there deliberately, so we never move them again.
        for (const n of N) {
          if (n.fixed || dragRef.current.node === n) { n.vx = 0; n.vy = 0; continue }
          n.vx += (w / 2 - n.x) * 0.003 * alpha
          n.vy += (h / 2 - n.y) * 0.003 * alpha
          n.vx *= 0.86; n.vy *= 0.86
          n.x += n.vx; n.y += n.vy
        }
        alphaRef.current = Math.max(0, alpha * 0.985)
      }

      // Collision resolution (position-based, every frame the loop runs). Keeps
      // labels legible by never letting node discs overlap. A fixed/pinned or
      // dragged node acts as immovable — the other node yields the full push, so
      // dragging a node into a cluster shoves the free ones aside instead of
      // stacking on top of them.
      const SEP = 26
      for (let iter = 0; iter < 2; iter++) {
        for (let i = 0; i < N.length; i++) {
          const a = N[i]
          for (let j = i + 1; j < N.length; j++) {
            const b = N[j]
            const dx = b.x - a.x, dy = b.y - a.y
            const min = a.r + b.r + SEP
            let dist = Math.sqrt(dx * dx + dy * dy)
            if (dist === 0) dist = 0.01
            if (dist >= min) continue
            const overlap = (min - dist)
            const nx = dx / dist, ny = dy / dist
            const aPinned = a.fixed || dragRef.current.node === a
            const bPinned = b.fixed || dragRef.current.node === b
            if (aPinned && bPinned) continue
            if (aPinned) { b.x += nx * overlap; b.y += ny * overlap }
            else if (bPinned) { a.x -= nx * overlap; a.y -= ny * overlap }
            else {
              a.x -= nx * overlap * 0.5; a.y -= ny * overlap * 0.5
              b.x += nx * overlap * 0.5; b.y += ny * overlap * 0.5
            }
          }
        }
      }
    }

    const draw = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const { nodes: N, links: L, adj } = simRef.current
      const { scale, tx, ty } = viewRef.current
      const theme = themeRef.current
      const active = hoverRef.current || selectedRef.current || null
      const neighbours = active ? adj.get(active) : null

      ctx.save()
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.translate(tx, ty)
      ctx.scale(scale, scale)

      // Links.
      ctx.lineWidth = 1 / scale
      for (const l of L) {
        const lit = active && (l.s.id === active || l.t.id === active)
        ctx.strokeStyle = lit ? 'rgba(163,230,53,0.55)' : theme.line
        ctx.globalAlpha = active && !lit ? 0.25 : 1
        ctx.beginPath()
        ctx.moveTo(l.s.x, l.s.y)
        ctx.lineTo(l.t.x, l.t.y)
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      // Nodes.
      for (const n of N) {
        const isActive = n.id === active
        const isNeighbour = neighbours?.has(n.id)
        const dim = active && !isActive && !isNeighbour
        ctx.globalAlpha = dim ? 0.3 : 1
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
        ctx.fillStyle = GROUP_COLORS[n.group] || '#A3E635'
        ctx.fill()
        // Pin ring — shows a node the user has parked (drag pins; dbl-click frees).
        if (n.fixed && n.kind !== 'root') {
          ctx.globalAlpha = dim ? 0.3 : 0.9
          ctx.lineWidth = 1.5 / scale
          ctx.strokeStyle = '#A3E635'
          ctx.beginPath()
          ctx.arc(n.x, n.y, n.r + 3 / scale + 1, 0, Math.PI * 2)
          ctx.setLineDash([3 / scale, 3 / scale])
          ctx.stroke()
          ctx.setLineDash([])
          ctx.globalAlpha = dim ? 0.3 : 1
        }
        if (isActive || n.id === selectedRef.current) {
          ctx.lineWidth = 2 / scale
          ctx.strokeStyle = theme.label
          ctx.stroke()
        }
        // Labels: always for root/hub, on hover/zoom for leaves.
        const showLabel = n.kind !== 'leaf' || scale > 1.4 || isActive || isNeighbour
        if (showLabel) {
          ctx.globalAlpha = dim ? 0.35 : 1
          ctx.fillStyle = theme.label
          ctx.font = `${n.kind === 'root' ? 13 : n.kind === 'hub' ? 11 : 9}px system-ui, sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'
          const label = n.label.length > 34 ? n.label.slice(0, 32) + '…' : n.label
          ctx.fillText(label, n.x, n.y + n.r + 2)
        }
      }
      ctx.restore()
    }

    const isBusy = () =>
      alphaRef.current > 0.005 || !!dragRef.current.node || !!dragRef.current.panning

    const step = () => {
      physics()
      draw()
      if (isBusy()) {
        rafRef.current = requestAnimationFrame(step)
      } else {
        runningRef.current = false
        draw() // settle on a clean final frame
      }
    }

    const wake = (kick?: boolean) => {
      if (kick) alphaRef.current = Math.max(alphaRef.current, 0.35)
      if (runningRef.current) return
      runningRef.current = true
      rafRef.current = requestAnimationFrame(step)
    }
    wakeRef.current = wake
    wake(true)

    return () => {
      window.removeEventListener('resize', resize)
      runningRef.current = false
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [height])

  // ── Pointer interaction ──────────────────────────────────────────────────
  const toWorld = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const { scale, tx, ty } = viewRef.current
    return {
      x: (clientX - rect.left - tx) / scale,
      y: (clientY - rect.top - ty) / scale,
    }
  }
  const pick = (clientX: number, clientY: number): SimNode | undefined => {
    const p = toWorld(clientX, clientY)
    const { nodes: N } = simRef.current
    let best: SimNode | undefined
    let bestD = Infinity
    for (const n of N) {
      const dx = n.x - p.x, dy = n.y - p.y
      const d = dx * dx + dy * dy
      const hit = (n.r + 6) * (n.r + 6)
      if (d < hit && d < bestD) { best = n; bestD = d }
    }
    return best
  }

  const onPointerDown = (e: RPointerEvent) => {
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    const node = pick(e.clientX, e.clientY)
    // Remember whether it was already pinned so a plain click (no drag) leaves
    // its pinned state unchanged, while a real drag always pins it.
    dragRef.current = { node, panning: !node, lastX: e.clientX, lastY: e.clientY, moved: false, wasPinned: !!node?.fixed }
    if (node) { node.fixed = true; if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing' }
    wakeRef.current(true)
  }
  const onPointerMove = (e: RPointerEvent) => {
    const d = dragRef.current
    if (d.node) {
      const p = toWorld(e.clientX, e.clientY)
      d.node.x = p.x; d.node.y = p.y; d.node.vx = 0; d.node.vy = 0
      d.moved = true
      wakeRef.current(true)
      return
    }
    if (d.panning && (e.buttons & 1)) {
      viewRef.current.tx += e.clientX - d.lastX
      viewRef.current.ty += e.clientY - d.lastY
      d.lastX = e.clientX; d.lastY = e.clientY; d.moved = true
      wakeRef.current(false)
      return
    }
    // Hover.
    const hit = pick(e.clientX, e.clientY)
    const changed = (hit?.id || null) !== hoverRef.current
    hoverRef.current = hit?.id || null
    if (hit) {
      const rect = canvasRef.current!.getBoundingClientRect()
      setHoverLabel({ x: e.clientX - rect.left, y: e.clientY - rect.top, text: hit.label })
      canvasRef.current!.style.cursor = 'pointer'
    } else {
      setHoverLabel(null)
      canvasRef.current!.style.cursor = 'grab'
    }
    if (changed) wakeRef.current(false)
  }
  const onPointerUp = (e: RPointerEvent) => {
    const d = dragRef.current
    if (d.node) {
      if (d.moved) {
        // Dragged → park it here. It stays put until double-clicked to release.
        d.node.fixed = true
      } else {
        // Plain click → don't change pinned state; just open the node.
        if (d.node.kind !== 'root') d.node.fixed = d.wasPinned ?? false
        onSelect(d.node)
      }
    } else if (!d.moved) {
      onSelect(null)
    }
    if (canvasRef.current) canvasRef.current.style.cursor = 'grab'
    dragRef.current = { lastX: e.clientX, lastY: e.clientY, moved: false }
    wakeRef.current(true)
  }
  const onDoubleClick = (e: RMouseEvent) => {
    const n = pick(e.clientX, e.clientY)
    if (n && n.kind !== 'root' && n.fixed) { n.fixed = false; wakeRef.current(true) }
  }
  const unpinAll = () => {
    for (const n of simRef.current.nodes) if (n.kind !== 'root') n.fixed = false
    wakeRef.current(true)
  }
  const onPointerLeave = () => {
    if (hoverRef.current) { hoverRef.current = null; setHoverLabel(null); wakeRef.current(false) }
  }
  const onWheel = (e: RWheelEvent) => {
    e.preventDefault()
    const rect = canvasRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    const v = viewRef.current
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
    const newScale = Math.max(0.35, Math.min(4, v.scale * factor))
    v.tx = mx - (mx - v.tx) * (newScale / v.scale)
    v.ty = my - (my - v.ty) * (newScale / v.scale)
    v.scale = newScale
    wakeRef.current(false)
  }

  const resetView = () => {
    viewRef.current = { scale: 1, tx: 0, ty: 0 }
    wakeRef.current(true)
  }

  return (
    <div ref={wrapRef} className="relative w-full rounded-xl overflow-hidden"
      style={{ height, background: 'var(--bg-secondary)', border: '1px solid var(--border-color, rgba(148,163,184,0.15))' }}>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
        style={{ touchAction: 'none', display: 'block', cursor: 'grab' }}
      />
      {/* Controls hint */}
      <div className="absolute top-3 left-3 px-2.5 py-1.5 rounded-lg text-[11px] leading-tight pointer-events-none"
        style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', maxWidth: 210 }}>
        Drag a node to pin it in place · double-click to release
      </div>
      {hoverLabel && (
        <div
          className="absolute pointer-events-none px-2 py-1 rounded text-xs whitespace-nowrap"
          style={{
            left: hoverLabel.x + 10, top: hoverLabel.y + 10,
            background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
            border: '1px solid var(--border-color, rgba(148,163,184,0.2))', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {hoverLabel.text}
        </div>
      )}
      <div className="absolute bottom-3 right-3 flex gap-2">
        <button
          onClick={unpinAll}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium"
          style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
        >
          Unpin all
        </button>
        <button
          onClick={resetView}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium"
          style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
        >
          Reset view
        </button>
      </div>
    </div>
  )
}
