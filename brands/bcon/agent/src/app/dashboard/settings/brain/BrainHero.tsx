'use client'

// ─────────────────────────────────────────────────────────────────────────────
// BrainHero — the living brain. An anatomical side-profile brain whose lobes
// map to what PROXe actually does, firing in real time from the activity feed:
//   occipital  → intake (new leads, channels)         temporal → conversation
//   frontal    → decisions (sequences, approvals)     parietal → scoring
//   hippocampus→ memory (KB, notes)                   cerebellum → cadence
//   brainstem  → sends going out
// Pseudo-3D via mouse-parallax tilt + layered depth. Ambient synapse particles
// keep it alive; real events queue up and flash their lobe + tick the feed.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from 'react'

type Overview = {
  taken_in: { kb_items: number; leads_total: number; leads_today: number; notes_total: number; notes_today: number; channels: Record<string, number> }
  handling_now: { active_sequences: number; queued_approvals: number; chats_today: number; leads_in_flight: number; bookings_upcoming: number; hot: number; warm: number; cold: number }
  activity: Array<{ kind: string; label: string; detail: string; at: string }>
}

type RegionId = 'frontal' | 'parietal' | 'occipital' | 'temporal' | 'hippocampus' | 'cerebellum' | 'brainstem'

const REGIONS: Record<RegionId, { name: string; role: string; color: string; cx: number; cy: number; path: string }> = {
  frontal: {
    name: 'Frontal', role: 'Decisions · sequences', color: '#8B5CF6', cx: 315, cy: 265,
    path: 'M 190 325 C 178 248 240 162 342 130 C 392 116 432 117 458 128 C 468 192 458 262 428 322 C 398 382 342 420 292 418 C 238 404 200 368 190 325 Z',
  },
  parietal: {
    name: 'Parietal', role: 'Scoring · understanding', color: '#3b82f6', cx: 595, cy: 185,
    path: 'M 472 124 C 540 102 620 102 682 127 C 728 147 764 180 786 224 C 740 264 662 288 592 278 C 524 268 482 212 472 124 Z',
  },
  occipital: {
    name: 'Occipital', role: 'Intake · channels', color: '#22c55e', cx: 755, cy: 330,
    path: 'M 790 230 C 826 266 842 318 833 362 C 822 406 782 440 737 450 C 704 456 676 450 656 438 C 664 390 694 332 732 290 C 754 266 772 246 790 230 Z',
  },
  temporal: {
    name: 'Temporal', role: 'Conversation', color: '#f59e0b', cx: 455, cy: 435,
    path: 'M 298 428 C 338 398 400 378 462 384 C 532 391 592 418 622 452 C 592 478 540 492 488 486 C 428 478 348 464 298 428 Z',
  },
  hippocampus: {
    name: 'Hippocampus', role: 'Memory · knowledge', color: '#ec4899', cx: 520, cy: 325,
    path: 'M 468 310 C 486 292 520 286 550 296 C 576 305 586 326 576 344 C 564 364 528 372 498 362 C 474 353 460 330 468 310 Z',
  },
  cerebellum: {
    name: 'Cerebellum', role: 'Cadence · timing', color: '#38bdf8', cx: 705, cy: 512,
    path: 'M 640 470 C 690 458 752 468 782 498 C 798 524 772 556 730 562 C 678 568 638 546 626 514 C 620 494 624 478 640 470 Z',
  },
  brainstem: {
    name: 'Brainstem', role: 'Sends going out', color: '#ef4444', cx: 572, cy: 545,
    path: 'M 598 478 C 610 510 606 546 590 582 C 580 606 564 622 548 632 C 543 600 546 560 555 524 C 561 498 574 484 598 478 Z',
  },
}

// Which lobe fires for each activity kind.
const KIND_REGION: Record<string, RegionId> = {
  lead: 'occipital', chat_in: 'temporal', chat_out: 'temporal',
  stage: 'parietal', send: 'brainstem', note: 'hippocampus',
}
const KIND_ICON: Record<string, string> = {
  lead: '◉', chat_in: '💬', chat_out: '⚡', stage: '↗', send: '📤', note: '✎',
}

// Ambient synapse routes (bezier between lobes through the deep brain).
const SYNAPSES: Array<{ d: string; color: string; dur: number }> = [
  { d: 'M 315 265 C 400 290, 460 300, 520 325', color: '#8B5CF6', dur: 3.2 },
  { d: 'M 595 185 C 560 240, 540 280, 520 325', color: '#3b82f6', dur: 2.7 },
  { d: 'M 755 330 C 680 330, 600 328, 520 325', color: '#22c55e', dur: 3.8 },
  { d: 'M 455 435 C 480 400, 500 360, 520 325', color: '#f59e0b', dur: 2.4 },
  { d: 'M 705 512 C 650 470, 580 380, 520 325', color: '#38bdf8', dur: 4.2 },
  { d: 'M 520 325 C 545 400, 560 470, 572 545', color: '#ef4444', dur: 3.0 },
  { d: 'M 315 265 C 420 190, 520 160, 595 185', color: '#8B5CF6', dur: 4.6 },
  { d: 'M 595 185 C 680 220, 730 270, 755 330', color: '#3b82f6', dur: 3.5 },
]

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
  const [ticker, setTicker] = useState<Array<{ kind: string; label: string; detail: string; at: string; key: number }>>([])
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const queueRef = useRef<Array<{ kind: string; label: string; detail: string; at: string }>>([])
  const seenRef = useRef<Set<string>>(new Set())
  const keyRef = useRef(0)

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
        const region = KIND_REGION[ev.kind] || 'hippocampus'
        setFiring(region)
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
    setTilt({ x: ny * -10, y: nx * 14 })
  }, [])

  const ti = ov?.taken_in, hn = ov?.handling_now
  // Live intensity per lobe (0..1, log-scaled) — drives the resting glow.
  const lv = (n: number, cap: number) => Math.min(1, Math.log2((n || 0) + 1) / Math.log2(cap + 1))
  const intensity: Record<RegionId, number> = {
    frontal: lv(hn?.active_sequences ?? 0, 50),
    parietal: lv((hn?.hot ?? 0) + (hn?.warm ?? 0), 60),
    occipital: lv(ti?.leads_today ?? 0, 20),
    temporal: lv(hn?.chats_today ?? 0, 80),
    hippocampus: lv((ti?.kb_items ?? 0) + (ti?.notes_total ?? 0), 120),
    cerebellum: lv(hn?.bookings_upcoming ?? 0, 12),
    brainstem: lv(hn?.queued_approvals ?? 0, 25),
  }
  const totalPulse = Object.values(intensity).reduce((a, b) => a + b, 0) / 7

  const vitalsLeft: Array<[string, number | string]> = [
    ['Knowledge items', ti?.kb_items ?? '—'],
    ['Leads (all time)', ti?.leads_total ?? '—'],
    ['Leads today', ti?.leads_today ?? '—'],
    ['Team notes', ti?.notes_total ?? '—'],
    ['Channels', ti ? Object.keys(ti.channels || {}).length : '—'],
  ]
  const vitalsRight: Array<[string, number | string]> = [
    ['Chats today', hn?.chats_today ?? '—'],
    ['Active sequences', hn?.active_sequences ?? '—'],
    ['Awaiting approval', hn?.queued_approvals ?? '—'],
    ['Leads in flight', hn?.leads_in_flight ?? '—'],
    ['Bookings upcoming', hn?.bookings_upcoming ?? '—'],
  ]

  return (
    <div
      onMouseMove={onMove}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
      style={{ height: '100%', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <style>{`
        @keyframes bhBreathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.012); } }
        @keyframes bhFire { 0% { opacity: .25; } 18% { opacity: 1; } 100% { opacity: .25; } }
        @keyframes bhEeg { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes bhTick { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes bhDrift { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-7px); } }
      `}</style>

      {/* ambient radial backdrop */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 50% at 50% 45%, rgba(139,92,246,0.07), transparent 70%)' }} />

      {/* ── left vitals ── */}
      <div style={{ position: 'absolute', left: 22, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 10, width: 168 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, color: 'var(--text-muted)' }}>TAKEN IN</div>
        {vitalsLeft.map(([label, v]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid var(--border-primary)', paddingBottom: 5 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
          </div>
        ))}
      </div>

      {/* ── right: vitals + live ticker ── */}
      <div style={{ position: 'absolute', right: 22, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 10, width: 220 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, color: 'var(--text-muted)' }}>HANDLING NOW</div>
        {vitalsRight.map(([label, v]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid var(--border-primary)', paddingBottom: 5 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
          </div>
        ))}
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, color: 'var(--text-muted)', marginTop: 8 }}>SYNAPSE FEED</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflow: 'hidden' }}>
          {ticker.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>quiet right now — idle firing only</div>}
          {ticker.map((e) => {
            const region = KIND_REGION[e.kind] || 'hippocampus'
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

      {/* ── the brain ── */}
      <div style={{ perspective: 1200, animation: 'bhDrift 7s ease-in-out infinite' }}>
        <div style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`, transition: 'transform .35s ease-out', transformStyle: 'preserve-3d' }}>
          <svg viewBox="80 60 840 620" style={{ width: 'min(56vw, 760px)', height: 'auto', maxHeight: '66vh', animation: `bhBreathe ${Math.max(2.4, 4.2 - totalPulse * 2)}s ease-in-out infinite`, overflow: 'visible' }}>
            <defs>
              <filter id="bhGlow" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="10" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="bhSoft" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="4" />
              </filter>
              {(Object.keys(REGIONS) as RegionId[]).map((id) => (
                <radialGradient key={id} id={`bhg-${id}`} cx="50%" cy="42%" r="75%">
                  <stop offset="0%" stopColor={REGIONS[id].color} stopOpacity="0.55" />
                  <stop offset="62%" stopColor={REGIONS[id].color} stopOpacity="0.18" />
                  <stop offset="100%" stopColor={REGIONS[id].color} stopOpacity="0.04" />
                </radialGradient>
              ))}
            </defs>

            {/* depth shadow (fake 3D underlayer) */}
            <g transform="translate(10 16)" opacity="0.5">
              {(Object.keys(REGIONS) as RegionId[]).map((id) => (
                <path key={id} d={REGIONS[id].path} fill="#000" filter="url(#bhSoft)" />
              ))}
            </g>

            {/* lobes */}
            {(Object.keys(REGIONS) as RegionId[]).map((id) => {
              const r = REGIONS[id]
              const isFiring = firing === id
              const base = 0.28 + intensity[id] * 0.5
              return (
                <g key={id}>
                  <path
                    d={r.path}
                    fill={`url(#bhg-${id})`}
                    stroke={r.color}
                    strokeWidth={isFiring ? 2.4 : 1.3}
                    strokeOpacity={isFiring ? 1 : 0.55}
                    opacity={isFiring ? 1 : base}
                    filter={isFiring ? 'url(#bhGlow)' : undefined}
                    style={{ transition: 'opacity .5s ease, stroke-width .3s ease' }}
                  />
                  {isFiring && (
                    <circle cx={r.cx} cy={r.cy} r="26" fill="none" stroke={r.color} strokeWidth="2" opacity="0.9">
                      <animate attributeName="r" from="8" to="46" dur="0.9s" fill="freeze" />
                      <animate attributeName="opacity" from="0.9" to="0" dur="0.9s" fill="freeze" />
                    </circle>
                  )}
                </g>
              )
            })}

            {/* gyri — decorative folds */}
            <g fill="none" stroke="var(--text-primary)" strokeOpacity="0.09" strokeWidth="2.2" strokeLinecap="round">
              <path d="M 250 250 C 300 215, 340 235, 380 205 C 420 178, 465 195, 500 172" />
              <path d="M 285 335 C 340 305, 395 320, 445 292 C 495 268, 545 280, 590 255" />
              <path d="M 520 140 C 570 165, 620 150, 665 180 C 705 205, 730 240, 748 280" />
              <path d="M 340 395 C 405 372, 470 380, 530 402 C 575 418, 615 430, 648 428" />
              <path d="M 660 350 C 700 335, 740 340, 775 360" />
            </g>

            {/* ambient synapse particles */}
            {SYNAPSES.map((s, i) => (
              <g key={i}>
                <path d={s.d} fill="none" stroke={s.color} strokeOpacity="0.14" strokeWidth="1" strokeDasharray="2 6" />
                <circle r="2.6" fill={s.color} opacity="0.9" filter="url(#bhGlow)">
                  <animateMotion dur={`${s.dur}s`} repeatCount="indefinite" path={s.d} />
                </circle>
                <circle r="1.6" fill="#fff" opacity="0.65">
                  <animateMotion dur={`${s.dur}s`} begin={`${s.dur / 2}s`} repeatCount="indefinite" path={s.d} />
                </circle>
              </g>
            ))}

            {/* labels */}
            {(Object.keys(REGIONS) as RegionId[]).map((id) => {
              const r = REGIONS[id]
              return (
                <g key={`lb-${id}`} opacity={firing === id ? 1 : 0.75} style={{ transition: 'opacity .4s' }}>
                  <text x={r.cx} y={r.cy - 4} textAnchor="middle" fontSize="12.5" fontWeight="800" fill="var(--text-primary)">{r.name}</text>
                  <text x={r.cx} y={r.cy + 11} textAnchor="middle" fontSize="9.5" fontWeight="600" fill={r.color}>{r.role}</text>
                </g>
              )
            })}
          </svg>
        </div>
      </div>

      {/* ── EEG strip ── */}
      <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', width: 'min(60%, 680px)', overflow: 'hidden', opacity: 0.85 }}>
        <div style={{ fontSize: 9, letterSpacing: 2, fontWeight: 800, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 3 }}>
          PROXe · LIVE · thinks every 5 minutes · approval-gated
        </div>
        <svg viewBox="0 0 800 40" style={{ width: '200%', display: 'block', animation: `bhEeg ${Math.max(3, 8 - totalPulse * 5)}s linear infinite` }}>
          <path
            d="M0 20 L30 20 38 8 46 32 54 20 120 20 128 14 136 26 144 20 210 20 218 4 226 36 234 20 300 20 308 12 316 28 324 20 400 20 L430 20 438 8 446 32 454 20 520 20 528 14 536 26 544 20 610 20 618 4 626 36 634 20 700 20 708 12 716 28 724 20 800 20"
            fill="none" stroke="var(--accent-primary)" strokeWidth="1.6" strokeOpacity="0.8"
          />
        </svg>
      </div>

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
