'use client'

/**
 * DashboardBrain — ask-anything panel over the live dashboard data.
 *
 * Floating button (home page, stacked under the eye + bell) opens a right
 * slide-out chat. Questions go to /api/dashboard/brain, which gathers
 * aggregates (leads today, pipeline, today's changes, upcoming bookings) and
 * answers with Sonnet 4.6.
 */

import { useState, useRef, useEffect, useCallback, Fragment } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { MdClose, MdSend, MdArrowForward, MdCall, MdOpenInNew } from 'react-icons/md'
import ProxeMark from '@/components/ProxeMark'
import { BRAND_ID } from '@/configs'
import { PAGE_ROUTES, type BrainAction } from '@/lib/brain/actions'

// The full brain the dock expands into — the talking spiral orb. Loaded lazily
// (canvas/window heavy) and only when the dock is clicked.
const VoiceOrb = dynamic(() => import('@/app/dashboard/settings/brain/VoiceOrb'), { ssr: false })

// Quick actions revealed when the dock wakes on hover.
const DOCK_QUICK: { label: string; q?: string; auto: boolean; listen?: boolean }[] = [
  // Catch me up = just the latest/most-recent activity, not the full briefing.
  { label: 'Catch me up', q: "Catch me up — what's happened most recently? Just the latest updates, kept short.", auto: true },
  { label: 'Anything urgent?', q: 'What most needs my attention right now?', auto: true },
  { label: 'Ask something…', auto: false, listen: true },          // opens the orb, mic first
]

const IS_POP = BRAND_ID === 'pop'

type Msg = { role: 'user' | 'assistant'; content: string; actions?: BrainAction[] }

// Inline bold: split on **...** and wrap the captured parts in <strong>.
function renderInline(text: string, keyPrefix: string) {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return parts.map((p, i) =>
    i % 2 === 1
      ? <strong key={`${keyPrefix}-b-${i}`}>{p}</strong>
      : <Fragment key={`${keyPrefix}-t-${i}`}>{p}</Fragment>,
  )
}

// Minimal markdown: bold, "- " bullets, blank-line spacing. The brain replies
// in markdown; without this the bubble showed literal ** and - .
const isPipeRow = (s: string) => s.includes('|')
const isSepRow = (s: string) => /^[\s|:_-]+$/.test(s) && s.includes('|')
const splitCells = (s: string) => s.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim())

function renderRich(content: string) {
  const lines = content.replace(/\r/g, '').split('\n')
  const out: React.ReactNode[] = []
  let bullets: string[] = []
  const flush = (key: string) => {
    if (bullets.length === 0) return
    out.push(
      <ul key={`ul-${key}`} className="list-disc pl-4 space-y-0.5 my-1">
        {bullets.map((b, i) => <li key={`li-${key}-${i}`}>{renderInline(b, `li-${key}-${i}`)}</li>)}
      </ul>,
    )
    bullets = []
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i].trimEnd()

    // ── Table block: 2+ consecutive pipe rows → real <table> ────────────────
    if (isPipeRow(line) && i + 1 < lines.length && isPipeRow(lines[i + 1].trimEnd())) {
      flush(String(i))
      const block: string[] = []
      let j = i
      while (j < lines.length && isPipeRow(lines[j].trimEnd())) { block.push(lines[j].trimEnd()); j++ }
      const rows = block.filter((r) => !isSepRow(r)).map(splitCells)
      if (rows.length >= 1) {
        const header = rows[0]
        const body = rows.slice(1)
        out.push(
          <table key={`tb-${i}`} className="w-full text-xs my-1.5" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {header.map((c, ci) => (
                  <th key={ci} className="text-left font-semibold py-1 pr-3"
                    style={{ borderBottom: '1px solid var(--border-primary)', color: 'var(--text-secondary)' }}>
                    {renderInline(c, `th-${i}-${ci}`)}
                  </th>
                ))}
              </tr>
            </thead>
            {body.length > 0 && (
              <tbody>
                {body.map((r, ri) => (
                  <tr key={ri}>
                    {r.map((c, ci) => (
                      <td key={ci} className="py-1 pr-3 align-top" style={{ borderBottom: '1px solid var(--border-primary)' }}>
                        {renderInline(c, `td-${i}-${ri}-${ci}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            )}
          </table>,
        )
      }
      i = j
      continue
    }

    // Lone pipe row (rare) → join cells so no raw pipes show.
    let text = line
    if (isPipeRow(text) && !isSepRow(text)) text = splitCells(text).filter(Boolean).join('  ·  ')
    else if (isSepRow(text)) { i++; continue }

    // Horizontal rule.
    if (/^\s*-{3,}\s*$/.test(text)) { i++; continue }

    // Heading "### Foo" → bold line.
    const h = text.match(/^\s*#{1,6}\s+(.*)$/)
    if (h) { flush(String(i)); out.push(<p key={`h-${i}`} className="font-semibold mt-1">{renderInline(h[1], `h-${i}`)}</p>); i++; continue }

    // Bullet.
    const m = text.match(/^\s*[-*•]\s+(.*)$/)
    if (m) { bullets.push(m[1]); i++; continue }

    flush(String(i))
    if (text.trim() === '') { out.push(<div key={`sp-${i}`} className="h-1.5" />); i++; continue }
    out.push(<p key={`p-${i}`} className="leading-snug">{renderInline(text, `p-${i}`)}</p>)
    i++
  }
  flush('end')
  return out
}

const SUGGESTIONS = IS_POP
  ? [
      'What happened today?',
      'How many people reached today?',
      'How is the frontline looking?',
      'Any upcoming events?',
    ]
  : [
      'What happened today?',
      'How many leads today?',
      "What's my pipeline?",
      'Any upcoming bookings?',
    ]

const LOADING_MSGS = IS_POP
  ? [
      'Pulling the numbers…',
      'Reading the ground…',
      "Checking today's events…",
      'Crunching the data…',
    ]
  : [
      'Pulling lead numbers…',
      'Reading your pipeline…',
      "Checking today's bookings…",
      'Crunching the data…',
    ]

export default function DashboardBrain({ inline = false, label, dock = false }: { inline?: boolean; label?: string; dock?: boolean }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [followups, setFollowups] = useState<string[]>([])
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MSGS[0])
  const endRef = useRef<HTMLDivElement | null>(null)

  // ── Draggable dock bubble ────────────────────────────────────────────────
  // The persistent bottom-right bubble can be picked up and dropped anywhere;
  // its position is remembered across page changes and reloads. Only active in
  // `dock` mode — the inline "Ask PROXe" button is unaffected.
  const DOCK_SIZE = 52
  const DOCK_MARGIN = 16
  const MINI = 144 // docked orb — roughly 2× the dock bubble; expressive but compact
  const dockRef = useRef<HTMLButtonElement | null>(null)
  const [dockPos, setDockPos] = useState<{ x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const drag = useRef({ active: false, moved: false, startX: 0, startY: 0, offX: 0, offY: 0 })

  // Singleton guard — only ONE dock may render. Several dashboard pages wrap
  // themselves in <DashboardLayout> while the segment layout (dashboard/
  // layout.tsx) already does, nesting two layouts → two identical draggable
  // bubbles stacked at the same spot. The first mounted dock claims a global
  // flag; any extra instance renders nothing.
  const [isPrimaryDock, setIsPrimaryDock] = useState(false)
  const dockClaimed = useRef(false)

  // Hover-wake fan + the full-screen orb the dock expands into.
  const [waking, setWaking] = useState(false)
  // The dock expands into the brain orb: 'docked' = a small panel in the corner
  // that animates + talks in place; 'full' = full-screen. Single click → docked,
  // double click → full.
  const [orb, setOrb] = useState<null | { q?: string; auto: boolean; listen?: boolean; view: 'docked' | 'full' }>(null)
  const [orbHover, setOrbHover] = useState(false)
  const wakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wake = useCallback((on: boolean) => {
    if (wakeTimer.current) { clearTimeout(wakeTimer.current); wakeTimer.current = null }
    if (on) setWaking(true)
    else wakeTimer.current = setTimeout(() => setWaking(false), 180) // small grace so moving to a pill doesn't close it
  }, [])
  const openOrb = useCallback((pill: { q?: string; auto: boolean; listen?: boolean }, view: 'docked' | 'full' = 'docked') => {
    if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null }
    setWaking(false)
    setOrb({ q: pill.q, auto: pill.auto, listen: pill.listen, view })
  }, [])
  // The orb renderers size their canvas from clientWidth on WINDOW resize only —
  // toggling docked ⇄ full changes the CONTAINER, not the window, so without
  // this kick the canvas stays at the old resolution (fullscreen = giant blur).
  useEffect(() => {
    if (!orb) return
    const raf = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
    return () => cancelAnimationFrame(raf)
  }, [orb?.view, orb])

  // Single click → brain in place (docked). Double click → full screen. The
  // short timer disambiguates: a second click inside the window means double.
  const onDockClick = useCallback(() => {
    if (drag.current.moved) return
    // Click runs the first quick action (Catch me up). Double → full screen.
    if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null; openOrb(DOCK_QUICK[0], 'full'); return }
    clickTimer.current = setTimeout(() => { clickTimer.current = null; openOrb(DOCK_QUICK[0], 'docked') }, 240)
  }, [openOrb])
  useEffect(() => {
    if (!dock) return
    const w = window as any
    if (w.__proxeDockClaimed) return
    w.__proxeDockClaimed = true
    dockClaimed.current = true
    setIsPrimaryDock(true)
    return () => { if (dockClaimed.current) { w.__proxeDockClaimed = false; dockClaimed.current = false } }
  }, [dock])

  const clampToViewport = useCallback((x: number, y: number) => ({
    x: Math.min(Math.max(x, DOCK_MARGIN), window.innerWidth - DOCK_SIZE - DOCK_MARGIN),
    y: Math.min(Math.max(y, DOCK_MARGIN), window.innerHeight - DOCK_SIZE - DOCK_MARGIN),
  }), [])

  // Restore saved position (or default to bottom-right) once mounted, and keep
  // it on-screen when the window resizes.
  useEffect(() => {
    if (!dock) return
    let initial = { x: window.innerWidth - DOCK_SIZE - 24, y: window.innerHeight - DOCK_SIZE - 24 }
    try {
      const saved = localStorage.getItem('proxe-brain-dock-pos')
      if (saved) {
        const p = JSON.parse(saved)
        if (typeof p?.x === 'number' && typeof p?.y === 'number') initial = p
      }
    } catch { /* ignore bad JSON */ }
    setDockPos(clampToViewport(initial.x, initial.y))
    const onResize = () => setDockPos((cur) => (cur ? clampToViewport(cur.x, cur.y) : cur))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [dock, clampToViewport])

  const onDockPointerDown = useCallback((e: React.PointerEvent) => {
    const rect = dockRef.current?.getBoundingClientRect()
    if (!rect) return
    drag.current = { active: true, moved: false, startX: e.clientX, startY: e.clientY, offX: e.clientX - rect.left, offY: e.clientY - rect.top }
    dockRef.current?.setPointerCapture(e.pointerId)
    setDragging(true)
  }, [])

  const onDockPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current
    if (!d.active) return
    if (Math.abs(e.clientX - d.startX) > 4 || Math.abs(e.clientY - d.startY) > 4) d.moved = true
    setDockPos(clampToViewport(e.clientX - d.offX, e.clientY - d.offY))
  }, [clampToViewport])

  const onDockPointerUp = useCallback((e: React.PointerEvent) => {
    const d = drag.current
    if (!d.active) return
    d.active = false
    setDragging(false)
    dockRef.current?.releasePointerCapture(e.pointerId)
    setDockPos((cur) => {
      if (!cur) return cur
      // On release after an actual drag, snap the dock home to the RIGHT edge
      // (keep the vertical position); the left/top CSS transition animates the
      // slide. A plain click (no move) leaves it where it is — that opens the panel.
      const rightX = window.innerWidth - DOCK_SIZE - DOCK_MARGIN
      const next = d.moved ? { x: rightX, y: cur.y } : cur
      try { localStorage.setItem('proxe-brain-dock-pos', JSON.stringify(next)) } catch { /* quota */ }
      return next
    })
  }, [])

  // Rotate the loading status so it reads as real work, not a stuck "Thinking…".
  useEffect(() => {
    if (!loading) return
    let i = 0
    setLoadingMsg(LOADING_MSGS[0])
    const id = setInterval(() => { i = (i + 1) % LOADING_MSGS.length; setLoadingMsg(LOADING_MSGS[i]) }, 1200)
    return () => clearInterval(id)
  }, [loading])

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, open])

  // ── Brain actions — the brain drives the dashboard ───────────────────────
  // Validated actions come back with the answer (features.brainActions brands).
  // Navigation keeps the dock alive (it's mounted in DashboardLayout); the
  // full-screen orb collapses to the corner so the opened page is visible.
  const router = useRouter()
  const [dialing, setDialing] = useState<string | null>(null)
  const executeAction = useCallback(async (a: BrainAction) => {
    if (a.type === 'open_lead' || a.type === 'open_page') {
      const href = a.type === 'open_lead'
        ? `/dashboard/inbox?lead=${encodeURIComponent(a.leadId)}&channel=${a.channel}`
        : (PAGE_ROUTES[a.page] || '/dashboard')
      setOpen(false)
      setOrb((o) => (o && o.view === 'full' ? { ...o, view: 'docked' } : o))
      router.push(href)
      return
    }
    if (a.type === 'dial') {
      // Consent = this click. Voice never reaches here (dial is chat-only v1).
      if (dialing) return
      setDialing(a.phone)
      setError(null)
      try {
        const res = await fetch('/api/agent/voice/test-call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: a.phone, leadName: a.leadName }),
        })
        const d = await res.json().catch(() => ({}))
        if (!res.ok || d?.error) throw new Error(d?.error || 'Could not place the call')
        setMessages((m) => [...m, { role: 'assistant', content: `Call placed to **${a.leadName}**. It should ring in a few seconds.` }])
      } catch (err: any) {
        setError(err?.message || 'Could not place the call')
      } finally {
        setDialing(null)
      }
    }
  }, [router, dialing])

  const ask = useCallback(async (question: string) => {
    const q = question.trim()
    if (!q || loading) return
    setError(null)
    const history = messages.slice(-6).map(({ role, content }) => ({ role, content }))
    setMessages((m) => [...m, { role: 'user', content: q }])
    setInput('')
    setFollowups([])
    setLoading(true)
    try {
      const res = await fetch('/api/dashboard/brain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, history }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to answer')
      const actions: BrainAction[] = Array.isArray(data.actions) ? data.actions : []
      setMessages((m) => [...m, { role: 'assistant', content: data.answer || '(no answer)', actions }])
      setFollowups(Array.isArray(data.followups) ? data.followups : [])
      // Explicit "show me X" → the server marked the action auto → open it now.
      // A beat of delay lets the answer land before the page changes underneath.
      const autoNav = actions.find((a) => a.type !== 'dial' && a.auto)
      if (autoNav) setTimeout(() => executeAction(autoNav), 700)
    } catch (err: any) {
      setError(err?.message || 'Failed to answer')
    } finally {
      setLoading(false)
    }
  }, [loading, messages, executeAction])

  // A non-primary dock instance (nested layout) renders nothing at all.
  if (dock && !isPrimaryDock) return null

  return (
    <>
      {/* Brain button — stacked under the eye (14) + bell (54). Hidden while the
          orb is open (the widget has "become" the brain). */}
      {!(dock && orb) && <button
        ref={dockRef}
        onClick={() => {
          if (dock) { onDockClick(); return } // 1 click → brain in place · 2 → full screen
          setOpen(true)
        }}
        onMouseEnter={dock ? () => wake(true) : undefined}
        onMouseLeave={dock ? () => wake(false) : undefined}
        onPointerDown={dock ? onDockPointerDown : undefined}
        onPointerMove={dock ? onDockPointerMove : undefined}
        onPointerUp={dock ? onDockPointerUp : undefined}
        className={`${inline ? 'relative' : 'fixed'} ${dock ? '' : 'shadow-lg transition hover:opacity-90'} z-[60] flex items-center justify-center gap-1.5 rounded-full`}
        style={{
          ...(inline
            ? { backgroundColor: 'var(--accent-subtle)', border: '1px solid var(--accent-primary)', color: 'var(--accent-primary)' }
            : dock
              // Persistent, draggable frosted-glass "drop" — icon only, blurred
              // translucent bubble. Position remembered across pages/reloads;
              // mounted in the dashboard layout so it survives navigation.
              ? {
                  left: dockPos ? `${dockPos.x}px` : undefined,
                  top: dockPos ? `${dockPos.y}px` : undefined,
                  right: dockPos ? undefined : '24px',
                  bottom: dockPos ? undefined : '24px',
                  width: `${DOCK_SIZE}px`,
                  height: `${DOCK_SIZE}px`,
                  color: 'var(--accent-primary)',
                  background: 'color-mix(in srgb, var(--bg-secondary) 40%, transparent)',
                  backdropFilter: 'blur(16px) saturate(160%)',
                  WebkitBackdropFilter: 'blur(16px) saturate(160%)',
                  // Hover: just a clean accent ring around the circle — subtle,
                  // no glow halo. Idle is a hairline.
                  border: waking
                    ? '1.5px solid color-mix(in srgb, var(--accent-primary) 70%, transparent)'
                    : '1px solid color-mix(in srgb, var(--text-primary) 14%, transparent)',
                  boxShadow: dragging
                    ? '0 14px 40px rgba(0,0,0,0.4)'
                    : waking
                      ? '0 0 0 1px color-mix(in srgb, var(--accent-primary) 40%, transparent), 0 6px 18px rgba(0,0,0,0.22)'
                      : '0 8px 30px rgba(0,0,0,0.28)',
                  cursor: dragging ? 'grabbing' : 'grab',
                  touchAction: 'none',
                  transform: dragging ? 'scale(1.06)' : waking ? 'scale(1.03)' : 'scale(1)',
                  // While dragging, position tracks the pointer 1:1 (no left/top
                  // easing). On release, ease left/top so the snap-home-to-left
                  // slides smoothly.
                  transition: dragging
                    ? 'transform 140ms ease, box-shadow 140ms ease'
                    : 'transform 160ms ease, box-shadow 220ms ease, border-color 220ms ease, left 260ms cubic-bezier(0.2,0,0,1), top 260ms cubic-bezier(0.2,0,0,1)',
                }
              : { top: '94px', right: '20px', backgroundColor: 'var(--button-bg)', border: '1px solid var(--border-primary)', color: 'var(--text-button)' }),
          ...(dock ? {} : { height: '36px' }),
          ...(inline && label ? { padding: '0 12px' } : (dock ? {} : { width: '36px' })),
        }}
        aria-label={dock ? 'Ask PROXe — drag to move' : 'Ask PROXe'}
        title={dock ? 'Ask PROXe (drag to move)' : 'Ask PROXe'}
      >
        <ProxeMark size={dock ? 40 : 18} />
        {inline && label && <span className="text-xs font-semibold whitespace-nowrap">{label}</span>}
      </button>}

      {/* Hover-wake fan — quick actions that slide up-left from the dock. Anchored
          to the dock's top-right corner; a plain click on the bubble runs the
          first action (the update) without needing the fan. */}
      {dock && isPrimaryDock && waking && !dragging && !orb && dockPos && (
        <div
          onMouseEnter={() => wake(true)}
          onMouseLeave={() => wake(false)}
          style={{
            position: 'fixed',
            left: dockPos.x + DOCK_SIZE,
            top: dockPos.y,
            transform: 'translate(-100%, -100%)',
            paddingBottom: 10,
            display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8,
            zIndex: 61,
          }}
        >
          {DOCK_QUICK.map((pill, i) => (
            <button
              key={pill.label}
              onClick={() => openOrb(pill)}
              style={{
                fontSize: 12.5, fontWeight: 600, padding: '8px 14px', borderRadius: 999, cursor: 'pointer',
                whiteSpace: 'nowrap',
                background: 'color-mix(in srgb, var(--bg-secondary) 92%, transparent)',
                color: 'var(--text-primary)',
                border: '1px solid color-mix(in srgb, var(--accent-primary) 20%, transparent)',
                boxShadow: '0 6px 20px rgba(0,0,0,0.28)',
                backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
                animation: `wc-fan-in .2s ease ${i * 0.04}s both`,
              }}
            >
              {pill.label}
            </button>
          ))}
        </div>
      )}

      {/* Voice aura — while the brain is interacting (docked), the WHOLE
          dashboard lights up with a Google-Lens-style ambient glow hugging the
          viewport edges: a blurred multi-color rim whose hues drift and
          breathe. Pure decoration: pointer-events-none, sits under the orb. */}
      {orb && orb.view === 'docked' && (
        <div className="proxe-voice-aura fixed inset-0 z-[79]" aria-hidden="true" style={{ pointerEvents: 'none' }} />
      )}

      {/* The dock, become the brain. ONE VoiceOrb instance whose container
          resizes between a tiny corner light and full screen, so toggling view
          never remounts it (the voice keeps talking across the resize).
          Docked = roughly the dock-bubble size: just the glowing orb, chrome
          only on hover. */}
      {orb && (
        <div
          className="fixed z-[80]"
          onMouseEnter={() => setOrbHover(true)}
          onMouseLeave={() => setOrbHover(false)}
          style={orb.view === 'full'
            ? { inset: 0, background: 'var(--bg-primary)', animation: 'wc-fade-in 200ms ease' }
            : {
                // small floating orb, centered on the dock but clamped on-screen
                left: dockPos ? Math.min(Math.max(8, dockPos.x + DOCK_SIZE / 2 - MINI / 2), (typeof window !== 'undefined' ? window.innerWidth : 9999) - MINI - 8) : undefined,
                top: dockPos ? Math.min(Math.max(8, dockPos.y + DOCK_SIZE / 2 - MINI / 2), (typeof window !== 'undefined' ? window.innerHeight : 9999) - MINI - 8) : undefined,
                right: dockPos ? undefined : 10, bottom: dockPos ? undefined : 10,
                width: MINI, height: MINI, background: 'transparent', overflow: 'visible',
                animation: 'wc-orb-pop 220ms cubic-bezier(0.2,0,0,1)',
              }}
          aria-modal={orb.view === 'full' ? true : undefined} role="dialog"
        >
          <VoiceOrb autoStart={orb.auto} initialQuestion={orb.q} listenFirst={orb.listen} conversational compact={orb.view === 'docked'} onClose={() => setOrb(null)} onAction={executeAction} />
          {/* controls: full → big collapse arrow; docked → tiny × + ⤢, only on hover */}
          {orb.view === 'full' ? (
            <button
              onClick={() => setOrb((o) => (o ? { ...o, view: 'docked' } : o))}
              aria-label="Collapse" title="Collapse to corner"
              style={{ position: 'absolute', top: 14, right: 14, zIndex: 6, width: 32, height: 32, borderRadius: 999, cursor: 'pointer', fontSize: 15, lineHeight: 1, background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-primary)' }}
            >⤡</button>
          ) : (
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: orbHover ? 1 : 0, transition: 'opacity .15s ease' }}>
              <button
                onClick={(e) => { e.stopPropagation(); setOrb(null) }}
                aria-label="Close" title="Close"
                style={{ position: 'absolute', top: -4, left: -4, pointerEvents: 'auto', width: 18, height: 18, borderRadius: 999, cursor: 'pointer', fontSize: 11, lineHeight: 1, background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-primary)' }}
              >×</button>
              <button
                onClick={(e) => { e.stopPropagation(); setOrb((o) => (o ? { ...o, view: 'full' } : o)) }}
                aria-label="Full screen" title="Full screen"
                style={{ position: 'absolute', top: -4, right: -4, pointerEvents: 'auto', width: 18, height: 18, borderRadius: 999, cursor: 'pointer', fontSize: 10, lineHeight: 1, background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-primary)' }}
              >⤢</button>
            </div>
          )}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-[70]" aria-modal="true" role="dialog">
          {/* Glass-blur the whole dashboard behind so focus lands on the panel */}
          <div
            className="absolute inset-0"
            style={{
              backgroundColor: 'rgba(8,10,14,0.55)',
              backdropFilter: 'blur(14px) saturate(115%)',
              WebkitBackdropFilter: 'blur(14px) saturate(115%)',
              animation: 'wc-fade-in 220ms ease',
            }}
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute top-0 right-0 h-full flex flex-col overflow-hidden"
            style={{
              width: '440px',
              maxWidth: '94vw',
              background: 'linear-gradient(180deg, color-mix(in srgb, var(--bg-secondary) 80%, transparent) 0%, color-mix(in srgb, var(--bg-primary) 90%, transparent) 100%)',
              backdropFilter: 'blur(26px) saturate(150%)',
              WebkitBackdropFilter: 'blur(26px) saturate(150%)',
              borderLeft: '1px solid color-mix(in srgb, var(--accent-primary) 22%, transparent)',
              boxShadow: '-28px 0 70px rgba(0,0,0,0.5)',
              animation: 'wc-brain-in 280ms cubic-bezier(0.2,0,0,1)',
            }}
          >
            {/* Top accent glow line + soft radial glow behind the header */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, var(--accent-primary), transparent)', opacity: 0.75 }} />
            <div style={{ position: 'absolute', top: -80, right: -40, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent-primary) 26%, transparent), transparent 70%)', filter: 'blur(18px)', pointerEvents: 'none' }} />

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0 relative" style={{ borderColor: 'color-mix(in srgb, var(--accent-primary) 14%, transparent)' }}>
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: 'color-mix(in srgb, var(--accent-primary) 16%, transparent)' }}>
                  <ProxeMark size={16} color="var(--accent-primary)" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold leading-none" style={{ color: 'var(--text-primary)' }}>Ask PROXe</h3>
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Live dashboard intelligence</span>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-md" style={{ color: 'var(--text-secondary)' }} aria-label="Close">
                <MdClose size={18} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.length === 0 && (
                <div className="text-center py-6">
                  {/* Glowing brand mark */}
                  <div className="relative mx-auto flex items-center justify-center" style={{ width: 64, height: 64 }}>
                    <div className="absolute inset-0 rounded-full animate-pulse" style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--accent-primary) 40%, transparent), transparent 65%)' }} />
                    <ProxeMark size={34} color="var(--accent-primary)" className="relative" />
                  </div>
                  <p className="text-sm mt-3 font-semibold" style={{ color: 'var(--text-primary)' }}>Ask anything about your dashboard.</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{IS_POP ? 'Voters, grievances, today’s activity, events.' : 'Leads, pipeline, today’s activity, bookings.'}</p>
                  <div className="flex flex-col gap-2 mt-5">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => ask(s)}
                        className="group flex items-center justify-between text-left text-xs px-3.5 py-2.5 rounded-xl border transition-all"
                        style={{
                          borderColor: 'color-mix(in srgb, var(--accent-primary) 18%, transparent)',
                          background: 'color-mix(in srgb, var(--bg-tertiary) 60%, transparent)',
                          color: 'var(--text-primary)',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'color-mix(in srgb, var(--accent-primary) 14%, transparent)'
                          e.currentTarget.style.borderColor = 'var(--accent-primary)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'color-mix(in srgb, var(--bg-tertiary) 60%, transparent)'
                          e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent-primary) 18%, transparent)'
                        }}
                      >
                        <span>{s}</span>
                        <MdArrowForward size={13} className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--accent-primary)' }} />
                      </button>
                    ))}
                  </div>
                  {/* POP shortcuts: /command for an artifact, @name for a worker/person. */}
                  {IS_POP && (
                    <div className="mt-4">
                      <p className="text-[10px] uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Shortcuts</p>
                      <div className="flex flex-wrap gap-1.5 justify-center">
                        {['/warroom', '/d2d', '/listener', '/directives'].map((c) => (
                          <button
                            key={c}
                            onClick={() => ask(c)}
                            className="text-[11px] px-2.5 py-1 rounded-full border transition-colors"
                            style={{ borderColor: 'color-mix(in srgb, var(--accent-primary) 22%, transparent)', color: 'var(--accent-primary)', background: 'color-mix(in srgb, var(--bg-tertiary) 55%, transparent)' }}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>Type <b>/</b> for an artifact summary or <b>@name</b> to see what a worker has done.</p>
                    </div>
                  )}
                </div>
              )}

              {messages.map((m, i) => (
                <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div
                    className="max-w-[85%] px-3 py-2 rounded-2xl text-sm"
                    style={
                      m.role === 'user'
                        ? { backgroundColor: 'var(--button-bg)', color: 'var(--text-button)', borderBottomRightRadius: 4, whiteSpace: 'pre-wrap' }
                        : { backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', borderBottomLeftRadius: 4 }
                    }
                  >
                    {m.role === 'assistant' ? renderRich(m.content) : m.content}
                  </div>
                  {/* Brain actions — filled accent buttons (vs outline followup
                      chips): tap to open the lead/page or place the call. */}
                  {m.role === 'assistant' && (m.actions?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-2 mt-1.5 max-w-[85%]">
                      {m.actions!.map((a, ai) => {
                        const isDialing = a.type === 'dial' && dialing === a.phone
                        return (
                          <button
                            key={`${i}-act-${ai}`}
                            onClick={() => executeAction(a)}
                            disabled={!!dialing && a.type === 'dial'}
                            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition disabled:opacity-60"
                            style={{ backgroundColor: 'var(--button-bg)', color: 'var(--text-button)' }}
                          >
                            {a.type === 'dial' ? <MdCall size={13} /> : <MdOpenInNew size={13} />}
                            <span>{isDialing ? 'Calling…' : a.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-2xl text-sm" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                    <ProxeMark size={14} color="var(--accent-primary)" className="animate-pulse" />
                    <span>{loadingMsg}</span>
                  </div>
                </div>
              )}
              {/* Tap-through follow-ups after the latest answer */}
              {!loading && followups.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {followups.map((f) => (
                    <button
                      key={f}
                      onClick={() => ask(f)}
                      className="text-xs px-3 py-1.5 rounded-full border transition-colors"
                      style={{ borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--accent-subtle)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              )}
              {error && <p className="text-xs text-red-500">{error}</p>}
              <div ref={endRef} />
            </div>

            {/* Input */}
            <div className="px-3 py-3 border-t flex items-center gap-2 flex-shrink-0" style={{ borderColor: 'color-mix(in srgb, var(--accent-primary) 14%, transparent)' }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input) } }}
                placeholder={IS_POP ? 'Ask, or /warroom · /d2d · @name…' : 'Ask about your dashboard…'}
                disabled={loading}
                className="flex-1 px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] disabled:opacity-50"
                style={{ borderColor: 'color-mix(in srgb, var(--accent-primary) 20%, transparent)', background: 'color-mix(in srgb, var(--bg-tertiary) 55%, transparent)', color: 'var(--text-primary)' }}
              />
              <button
                onClick={() => ask(input)}
                disabled={loading || !input.trim()}
                className="p-2 rounded-lg disabled:opacity-50"
                style={{ backgroundColor: 'var(--button-bg)', color: 'var(--text-button)' }}
                aria-label="Send"
              >
                <MdSend size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes wc-brain-in {
          from { transform: translateX(100%); opacity: 0.6; }
          to   { transform: translateX(0); opacity: 1; }
        }
        @keyframes wc-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes wc-fan-in {
          from { opacity: 0; transform: translateY(8px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes wc-orb-pop {
          from { opacity: 0; transform: translateY(12px) scale(0.9); transform-origin: bottom right; }
          to   { opacity: 1; transform: translateY(0) scale(1); transform-origin: bottom right; }
        }
        /* Voice aura: a LIGHT full-page gradient wash — the whole background
           takes a gentle Lens-style tint while the brain is interacting. No
           rims, no hard overlay: screen-blended, heavily blurred, low opacity,
           colors drifting slowly. */
        .proxe-voice-aura {
          background:
            radial-gradient(120% 90% at 15% 0%, rgba(66,133,244,0.22), transparent 55%),
            radial-gradient(120% 90% at 85% 10%, rgba(155,114,203,0.20), transparent 55%),
            radial-gradient(130% 100% at 80% 100%, rgba(217,101,112,0.20), transparent 55%),
            radial-gradient(130% 100% at 10% 95%, rgba(242,166,12,0.18), transparent 55%);
          mix-blend-mode: screen;
          animation: proxe-aura-wash 9s linear infinite, proxe-aura-breathe 3.2s ease-in-out infinite;
        }
        @keyframes proxe-aura-wash {
          from { filter: blur(48px) saturate(130%) hue-rotate(0deg); }
          to   { filter: blur(48px) saturate(130%) hue-rotate(360deg); }
        }
        @keyframes proxe-aura-breathe {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 0.9; }
        }
      `}</style>
    </>
  )
}
