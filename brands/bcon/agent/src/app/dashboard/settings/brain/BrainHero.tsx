'use client'

// ─────────────────────────────────────────────────────────────────────────────
// BrainHero — a digital wireframe brain (dense contour lines + glowing
// synapses), fully interactive: click any part of the brain and it opens that
// region's live readout — what PROXe does there, its numbers right now, and
// the latest events flowing through it. No medical dressing: regions carry
// FUNCTION names (Intake, Conversation, Decisions, Scoring, Memory, Timing,
// Output), shown only on hover/click. Regions flash as real activity lands.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { MdClose } from 'react-icons/md'

type Overview = {
  taken_in: { kb_items: number; leads_total: number; leads_today: number; notes_total: number; notes_today: number; channels: Record<string, number> }
  handling_now: { active_sequences: number; queued_approvals: number; chats_today: number; leads_in_flight: number; bookings_upcoming: number; hot: number; warm: number; cold: number }
  activity: Array<{ kind: string; label: string; detail: string; at: string }>
}

type RegionId = 'decisions' | 'scoring' | 'intake' | 'conversation' | 'memory' | 'timing' | 'output'

const REGIONS: Record<RegionId, { name: string; blurb: string; color: string; cx: number; cy: number; path: string; kinds: string[] }> = {
  decisions: {
    name: 'Decisions', blurb: 'Chooses the next move per lead - which sequence, which step, wait or push.',
    color: '#8B5CF6', cx: 315, cy: 265, kinds: [],
    path: 'M 190 325 C 178 248 240 162 342 130 C 392 116 432 117 458 128 C 468 192 458 262 428 322 C 398 382 342 420 292 418 C 238 404 200 368 190 325 Z',
  },
  scoring: {
    name: 'Scoring', blurb: 'Reads every reply and scores 0-100: AI signals, activity, readiness.',
    color: '#3b82f6', cx: 595, cy: 185, kinds: ['stage'],
    path: 'M 472 124 C 540 102 620 102 682 127 C 728 147 764 180 786 224 C 740 264 662 288 592 278 C 524 268 482 212 472 124 Z',
  },
  intake: {
    name: 'Intake', blurb: 'Where leads land - website, web chat, Meta forms, WhatsApp, calls.',
    color: '#22c55e', cx: 755, cy: 330, kinds: ['lead'],
    path: 'M 790 230 C 826 266 842 318 833 362 C 822 406 782 440 737 450 C 704 456 676 450 656 438 C 664 390 694 332 732 290 C 754 266 772 246 790 230 Z',
  },
  conversation: {
    name: 'Conversation', blurb: 'The live chats - every message in and every reply PROXe writes.',
    color: '#f59e0b', cx: 455, cy: 435, kinds: ['chat_in', 'chat_out'],
    path: 'M 298 428 C 338 398 400 378 462 384 C 532 391 592 418 622 452 C 592 478 540 492 488 486 C 428 478 348 464 298 428 Z',
  },
  memory: {
    name: 'Memory', blurb: 'Everything it knows - knowledge base, team notes, lead history.',
    color: '#ec4899', cx: 520, cy: 325, kinds: ['note'],
    path: 'M 468 310 C 486 292 520 286 550 296 C 576 305 586 326 576 344 C 564 364 528 372 498 362 C 474 353 460 330 468 310 Z',
  },
  timing: {
    name: 'Timing', blurb: 'When things fire - cadences by temperature, quiet hours, reminders.',
    color: '#38bdf8', cx: 705, cy: 512, kinds: [],
    path: 'M 640 470 C 690 458 752 468 782 498 C 798 524 772 556 730 562 C 678 568 638 546 626 514 C 620 494 624 478 640 470 Z',
  },
  output: {
    name: 'Output', blurb: 'What actually goes out - approved sends, templates, follow-ups.',
    color: '#ef4444', cx: 572, cy: 545, kinds: ['send'],
    path: 'M 598 478 C 610 510 606 546 590 582 C 580 606 564 622 548 632 C 543 600 546 560 555 524 C 561 498 574 484 598 478 Z',
  },
}

const KIND_REGION: Record<string, RegionId> = {
  lead: 'intake', chat_in: 'conversation', chat_out: 'conversation',
  stage: 'scoring', send: 'output', note: 'memory',
}
const KIND_ICON: Record<string, string> = {
  lead: '◉', chat_in: '💬', chat_out: '⚡', stage: '↗', send: '📤', note: '✎',
}

// Brain silhouette pieces (cerebrum + lower masses) — used as outline + clip.
const SILHOUETTE = [
  'M 180 330 C 160 240 230 150 340 120 C 430 95 560 90 660 120 C 760 150 830 220 840 300 C 848 370 800 430 730 455 C 690 470 640 472 600 465 C 560 490 500 495 460 480 C 420 500 350 500 310 470 C 250 450 195 400 180 330 Z',
  'M 640 470 C 690 458 752 468 782 498 C 798 524 772 556 730 562 C 678 568 638 546 626 514 C 620 494 624 478 640 470 Z',
  'M 598 478 C 610 510 606 546 590 582 C 580 606 564 622 548 632 C 543 600 546 560 555 524 C 561 498 574 484 598 478 Z',
]

// Deterministic PRNG so contours are identical on server + client renders.
function lcg(seed: number) {
  let s = seed
  return () => { s = (s * 48271) % 2147483647; return s / 2147483647 }
}

function buildContours(): Array<{ d: string; o: number; w: number }> {
  const rnd = lcg(7)
  const lines: Array<{ d: string; o: number; w: number }> = []
  // Flowing horizontal folds across the head, clipped to the silhouette.
  for (let i = 0; i < 34; i++) {
    const y0 = 92 + i * 16 + (rnd() - 0.5) * 8
    let x = 140 + (rnd() - 0.5) * 30
    let y = y0
    let d = `M ${x.toFixed(1)} ${y.toFixed(1)}`
    for (let seg = 0; seg < 7; seg++) {
      const dx = 105 + rnd() * 25
      const c1x = x + dx * 0.35, c1y = y + (rnd() - 0.5) * 46
      const c2x = x + dx * 0.7, c2y = y + (rnd() - 0.5) * 46
      x += dx
      y = y0 + (rnd() - 0.5) * 26
      d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${x.toFixed(1)} ${y.toFixed(1)}`
    }
    lines.push({ d, o: 0.16 + rnd() * 0.3, w: 0.8 + rnd() * 0.9 })
  }
  // A few looping swirls for the fold look.
  for (let i = 0; i < 12; i++) {
    const cx = 240 + rnd() * 520
    const cy = 150 + rnd() * 320
    const r = 18 + rnd() * 34
    const d = `M ${cx - r} ${cy} C ${cx - r} ${cy - r * 1.3}, ${cx + r} ${cy - r * 1.3}, ${cx + r} ${cy} C ${cx + r} ${cy + r * 1.1}, ${cx - r * 0.4} ${cy + r * 1.2}, ${cx - r * 0.6} ${cy + r * 0.4}`
    lines.push({ d, o: 0.14 + rnd() * 0.22, w: 0.8 + rnd() * 0.7 })
  }
  return lines
}

function buildSynapses(): Array<{ x: number; y: number; r: number; delay: number; dur: number }> {
  const rnd = lcg(23)
  const pts: Array<{ x: number; y: number; r: number; delay: number; dur: number }> = []
  for (let i = 0; i < 16; i++) {
    pts.push({
      x: 220 + rnd() * 560,
      y: 130 + rnd() * 380,
      r: 2 + rnd() * 2.6,
      delay: rnd() * 4,
      dur: 2 + rnd() * 3,
    })
  }
  return pts
}

function relTime(at: string): string {
  const ms = Date.now() - new Date(at).getTime()
  if (isNaN(ms) || ms < 0) return ''
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export default function BrainHero() {
  const [ov, setOv] = useState<Overview | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [firing, setFiring] = useState<RegionId | null>(null)
  const [hovered, setHovered] = useState<RegionId | null>(null)
  const [selected, setSelected] = useState<RegionId | null>(null)
  const [ticker, setTicker] = useState<Array<{ kind: string; label: string; detail: string; at: string; key: number }>>([])
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const [regionItems, setRegionItems] = useState<Array<{ title: string; sub: string; at?: string | null }> | null>(null)
  const [regionLoading, setRegionLoading] = useState(false)
  const queueRef = useRef<Array<{ kind: string; label: string; detail: string; at: string }>>([])
  const seenRef = useRef<Set<string>>(new Set())
  const keyRef = useRef(0)

  const contours = useMemo(buildContours, [])
  const synapses = useMemo(buildSynapses, [])

  const load = useCallback(() => {
    fetch('/api/dashboard/brain/overview')
      .then((r) => r.json())
      .then((d) => {
        if (d?.error) { setErr(String(d.error)); return }
        setErr(null); setOv(d)
        for (const e of (d.activity || []).slice().reverse()) {
          const sig = `${e.kind}|${e.label}|${e.at}`
          if (!seenRef.current.has(sig)) { seenRef.current.add(sig); queueRef.current.push(e) }
        }
        if (queueRef.current.length > 40) queueRef.current = queueRef.current.slice(-40)
      })
      .catch((e) => setErr(e?.message || 'Could not reach the brain'))
  }, [])

  useEffect(() => { load(); const t = setInterval(load, 25000); return () => clearInterval(t) }, [load])

  // Fire queued events one at a time; idle micro-fires keep it alive.
  useEffect(() => {
    const t = setInterval(() => {
      const ev = queueRef.current.shift()
      if (ev) {
        setFiring(KIND_REGION[ev.kind] || 'memory')
        setTicker((prev) => [{ ...ev, key: ++keyRef.current }, ...prev].slice(0, 9))
      } else {
        const ids = Object.keys(REGIONS) as RegionId[]
        setFiring(ids[Math.floor(Math.random() * ids.length)])
      }
      setTimeout(() => setFiring(null), 950)
    }, 1700)
    return () => clearInterval(t)
  }, [])

  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const nx = (e.clientX - r.left) / r.width - 0.5
    const ny = (e.clientY - r.top) / r.height - 0.5
    setTilt({ x: ny * -8, y: nx * 12 })
  }, [])

  const ti = ov?.taken_in, hn = ov?.handling_now
  const sendsToday = (ov?.activity || []).filter((e) => e.kind === 'send').length

  // Live metrics per region for the click panel.
  const metricsFor = (id: RegionId): Array<[string, string | number]> => {
    switch (id) {
      case 'intake': return [['Leads today', ti?.leads_today ?? '—'], ['All time', ti?.leads_total ?? '—'], ['Channels', ti ? Object.keys(ti.channels || {}).length : '—']]
      case 'conversation': return [['Chats today', hn?.chats_today ?? '—'], ['Leads in flight', hn?.leads_in_flight ?? '—']]
      case 'decisions': return [['Active sequences', hn?.active_sequences ?? '—'], ['Awaiting approval', hn?.queued_approvals ?? '—']]
      case 'scoring': return [['Hot 70+', hn?.hot ?? '—'], ['Warm 40-69', hn?.warm ?? '—'], ['Cold', hn?.cold ?? '—']]
      case 'memory': return [['Knowledge items', ti?.kb_items ?? '—'], ['Team notes', ti?.notes_total ?? '—'], ['Notes today', ti?.notes_today ?? '—']]
      case 'timing': return [['Bookings upcoming', hn?.bookings_upcoming ?? '—'], ['Quiet hours', '9pm-9am']]
      case 'output': return [['Sent today (feed)', sendsToday], ['Awaiting approval', hn?.queued_approvals ?? '—']]
    }
  }
  const eventsFor = (id: RegionId) => ticker.filter((e) => REGIONS[id].kinds.includes(e.kind)).slice(0, 3)

  // Fetch the region's actual contents when a part is clicked.
  useEffect(() => {
    if (!selected) { setRegionItems(null); return }
    let alive = true
    setRegionLoading(true); setRegionItems(null)
    fetch(`/api/dashboard/brain/region?id=${selected}`)
      .then((r) => r.json())
      .then((d) => { if (alive) setRegionItems(Array.isArray(d?.items) ? d.items : []) })
      .catch(() => { if (alive) setRegionItems([]) })
      .finally(() => { if (alive) setRegionLoading(false) })
    return () => { alive = false }
  }, [selected])

  const OPEN_LINK: Record<RegionId, { href: string; label: string }> = {
    intake: { href: '/dashboard/leads', label: 'Open Leads' },
    scoring: { href: '/dashboard/leads', label: 'Open Leads' },
    conversation: { href: '/dashboard/inbox', label: 'Open Inbox' },
    decisions: { href: '/dashboard/tasks', label: 'Open Tasks' },
    output: { href: '/dashboard/tasks', label: 'Open Tasks' },
    timing: { href: '/dashboard/bookings', label: 'Open Bookings' },
    memory: { href: '/dashboard/settings', label: 'Open Knowledge' },
  }

  const active = selected || hovered
  const sel = selected ? REGIONS[selected] : null

  return (
    <div
      onMouseMove={onMove}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
      style={{ height: '100%', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <style>{`
        @keyframes bhDrift { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-7px); } }
        @keyframes bhTick { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes bhPanel { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 52% at 50% 45%, rgba(139,92,246,0.09), transparent 70%)' }} />

      {/* ── left vitals ── */}
      <div style={{ position: 'absolute', left: 22, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 10, width: 168 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, color: 'var(--text-muted)' }}>TAKEN IN</div>
        {([['Knowledge items', ti?.kb_items ?? '—'], ['Leads (all time)', ti?.leads_total ?? '—'], ['Leads today', ti?.leads_today ?? '—'], ['Team notes', ti?.notes_total ?? '—'], ['Channels', ti ? Object.keys(ti.channels || {}).length : '—']] as Array<[string, number | string]>).map(([label, v]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid var(--border-primary)', paddingBottom: 5 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
          </div>
        ))}
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
          Click any part of the brain to see what it's doing.
        </div>
      </div>

      {/* ── right: vitals + feed ── */}
      <div style={{ position: 'absolute', right: 22, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 10, width: 220 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, color: 'var(--text-muted)' }}>HANDLING NOW</div>
        {([['Chats today', hn?.chats_today ?? '—'], ['Active sequences', hn?.active_sequences ?? '—'], ['Awaiting approval', hn?.queued_approvals ?? '—'], ['Leads in flight', hn?.leads_in_flight ?? '—'], ['Bookings upcoming', hn?.bookings_upcoming ?? '—']] as Array<[string, number | string]>).map(([label, v]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid var(--border-primary)', paddingBottom: 5 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
          </div>
        ))}
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, color: 'var(--text-muted)', marginTop: 8 }}>LIVE FEED</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflow: 'hidden' }}>
          {ticker.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>quiet right now</div>}
          {ticker.map((e) => {
            const region = KIND_REGION[e.kind] || 'memory'
            return (
              <div key={e.key} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', animation: 'bhTick .4s ease', fontSize: 11, lineHeight: 1.35 }}>
                <span style={{ color: REGIONS[region].color, flexShrink: 0 }}>{KIND_ICON[e.kind] || '·'}</span>
                <span style={{ color: 'var(--text-secondary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>{e.label}</strong> {e.detail}
                </span>
                <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: 10 }}>{relTime(e.at)}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── the wireframe brain ── */}
      <div style={{ perspective: 1200, animation: 'bhDrift 7s ease-in-out infinite' }}>
        <div style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`, transition: 'transform .35s ease-out', transformStyle: 'preserve-3d' }}>
          <svg viewBox="120 60 780 610" style={{ width: 'min(54vw, 720px)', height: 'auto', maxHeight: '68vh', overflow: 'visible' }}>
            <defs>
              <clipPath id="bhClip">
                {SILHOUETTE.map((d, i) => <path key={i} d={d} />)}
              </clipPath>
              <filter id="bhGlow" x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur stdDeviation="8" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              {(Object.keys(REGIONS) as RegionId[]).map((id) => (
                <radialGradient key={id} id={`bhg-${id}`} cx="50%" cy="45%" r="72%">
                  <stop offset="0%" stopColor={REGIONS[id].color} stopOpacity="0.5" />
                  <stop offset="60%" stopColor={REGIONS[id].color} stopOpacity="0.16" />
                  <stop offset="100%" stopColor={REGIONS[id].color} stopOpacity="0" />
                </radialGradient>
              ))}
            </defs>

            {/* silhouette outline */}
            {SILHOUETTE.map((d, i) => (
              <path key={i} d={d} fill="rgba(139,92,246,0.03)" stroke="var(--accent-primary)" strokeWidth="1.6" strokeOpacity="0.5" />
            ))}

            {/* contour folds (the wireframe) */}
            <g clipPath="url(#bhClip)">
              {contours.map((c, i) => (
                <path key={i} d={c.d} fill="none" stroke="var(--accent-primary)" strokeOpacity={c.o} strokeWidth={c.w} strokeLinecap="round" />
              ))}
            </g>

            {/* region energy: visible when hovered / selected / firing */}
            {(Object.keys(REGIONS) as RegionId[]).map((id) => {
              const r = REGIONS[id]
              const on = firing === id || active === id
              return (
                <g key={`en-${id}`} clipPath="url(#bhClip)" style={{ pointerEvents: 'none' }}>
                  <path d={r.path} fill={`url(#bhg-${id})`} opacity={on ? 1 : 0} style={{ transition: 'opacity .45s ease' }} />
                  {firing === id && (
                    <circle cx={r.cx} cy={r.cy} r="24" fill="none" stroke={r.color} strokeWidth="2" opacity="0.9">
                      <animate attributeName="r" from="8" to="52" dur="0.9s" fill="freeze" />
                      <animate attributeName="opacity" from="0.9" to="0" dur="0.9s" fill="freeze" />
                    </circle>
                  )}
                </g>
              )
            })}

            {/* glowing synapse points */}
            <g clipPath="url(#bhClip)">
              {synapses.map((p, i) => (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r={p.r * 2.6} fill="#67e8f9" opacity="0.14">
                    <animate attributeName="opacity" values="0.05;0.3;0.05" dur={`${p.dur}s`} begin={`${p.delay}s`} repeatCount="indefinite" />
                  </circle>
                  <circle cx={p.x} cy={p.y} r={p.r} fill="#a5f3fc" filter="url(#bhGlow)">
                    <animate attributeName="opacity" values="0.25;1;0.25" dur={`${p.dur}s`} begin={`${p.delay}s`} repeatCount="indefinite" />
                  </circle>
                </g>
              ))}
            </g>

            {/* clickable hit areas (invisible, cursor pointer) */}
            {(Object.keys(REGIONS) as RegionId[]).map((id) => (
              <path
                key={`hit-${id}`}
                d={REGIONS[id].path}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHovered(id)}
                onMouseLeave={() => setHovered((h) => (h === id ? null : h))}
                onClick={() => setSelected((s) => (s === id ? null : id))}
              />
            ))}

            {/* hover name chip (function name only — nothing medical) */}
            {active && (
              <g style={{ pointerEvents: 'none' }}>
                <text x={REGIONS[active].cx} y={REGIONS[active].cy - 10} textAnchor="middle" fontSize="14" fontWeight="800" fill="var(--text-primary)" style={{ textShadow: '0 2px 8px rgba(0,0,0,.6)' }}>
                  {REGIONS[active].name}
                </text>
              </g>
            )}
          </svg>
        </div>
      </div>

      {/* ── click panel: what this part is doing right now ── */}
      {sel && selected && (
        <div style={{
          position: 'absolute', left: '50%', bottom: 18, transform: 'translateX(-50%)',
          width: 'min(520px, 92%)', padding: '14px 16px', borderRadius: 14,
          background: 'var(--bg-secondary)', border: `1.5px solid ${sel.color}66`,
          boxShadow: `0 12px 40px rgba(0,0,0,.45), 0 0 24px ${sel.color}22`,
          animation: 'bhPanel .25s ease', zIndex: 5,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: sel.color }}>{sel.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.45 }}>{sel.blurb}</div>
            </div>
            <button onClick={() => setSelected(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
              <MdClose size={16} />
            </button>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
            {metricsFor(selected).map(([label, v]) => (
              <div key={String(label)} style={{ padding: '7px 12px', borderRadius: 9, background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', minWidth: 86 }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{label}</div>
              </div>
            ))}
          </div>
          {/* what's actually inside this part right now */}
          <div style={{ marginTop: 10, maxHeight: 190, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {regionLoading && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Looking inside…</div>}
            {!regionLoading && regionItems && regionItems.length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>Nothing in here yet.</div>
            )}
            {!regionLoading && (regionItems || []).map((it, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11.5, padding: '5px 8px', borderRadius: 7, background: 'var(--bg-primary)', border: '1px solid var(--border-primary)' }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>{it.title}</strong>{' '}
                  <span style={{ color: 'var(--text-secondary)' }}>{it.sub}</span>
                </span>
                {it.at && <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: 10 }}>{relTime(it.at)}</span>}
              </div>
            ))}
          </div>
          {eventsFor(selected).length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {eventsFor(selected).map((e) => (
                <div key={e.key} style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  <span style={{ color: sel.color }}>{KIND_ICON[e.kind] || '·'}</span>{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>{e.label}</strong> {e.detail} <span style={{ color: 'var(--text-muted)' }}>· {relTime(e.at)}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 10, textAlign: 'right' }}>
            <a href={OPEN_LINK[selected].href} style={{ fontSize: 11.5, fontWeight: 700, color: sel.color, textDecoration: 'none' }}>
              {OPEN_LINK[selected].label} →
            </a>
          </div>
        </div>
      )}

      {err && (
        <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', fontSize: 11.5, color: '#ef4444', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.35)', borderRadius: 8, padding: '5px 12px' }}>
          Live data unreachable: {err}
        </div>
      )}
      {!ov && !err && (
        <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', fontSize: 11.5, color: 'var(--text-secondary)' }}>
          Waking the brain…
        </div>
      )}
    </div>
  )
}
