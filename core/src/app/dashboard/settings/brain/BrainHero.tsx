'use client'

// ─────────────────────────────────────────────────────────────────────────────
// BrainHero — orchestrates the living brain: pulls live vitals + the activity
// feed, drives NeuralBrain (the 3D particle-cloud canvas) by flipping which
// lobe is "firing" as real events land, and — on click — fetches and shows the
// ACTUAL contents of that lobe (real leads / chats / sequences / KB items).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from 'react'
import { MdClose } from 'react-icons/md'
import NeuralBrain, { REGION_META, type RegionId } from './NeuralBrain'

type Overview = {
  taken_in: { kb_items: number; leads_total: number; leads_today: number; notes_total: number; notes_today: number; channels: Record<string, number> }
  handling_now: { active_sequences: number; queued_approvals: number; chats_today: number; leads_in_flight: number; bookings_upcoming: number; hot: number; warm: number; cold: number }
  activity: Array<{ kind: string; label: string; detail: string; at: string }>
}

const KIND_REGION: Record<string, RegionId> = {
  lead: 'intake', chat_in: 'conversation', chat_out: 'conversation',
  stage: 'scoring', send: 'output', note: 'memory',
}
const KIND_ICON: Record<string, string> = { lead: '◉', chat_in: '💬', chat_out: '⚡', stage: '↗', send: '📤', note: '✎' }
const rgb = (c: [number, number, number]) => `rgb(${c[0]},${c[1]},${c[2]})`

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
  const [regionItems, setRegionItems] = useState<Array<{ title: string; sub: string; at?: string | null }> | null>(null)
  const [regionLoading, setRegionLoading] = useState(false)
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

  // Fire ONLY on a real event from the live feed — no random idle flashing.
  // When nothing's happening the brain stays calm (lobes hold a steady glow by
  // their live load); hovering a lobe is the other way to light one up.
  useEffect(() => {
    const t = setInterval(() => {
      const ev = queueRef.current.shift()
      if (!ev) return
      setFiring(KIND_REGION[ev.kind] || 'memory')
      setTicker((prev) => [{ ...ev, key: ++keyRef.current }, ...prev].slice(0, 9))
      setTimeout(() => setFiring(null), 900)
    }, 1500)
    return () => clearInterval(t)
  }, [])

  // Fetch the region's actual contents when a lobe is clicked.
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

  const ti = ov?.taken_in, hn = ov?.handling_now
  const sendsToday = (ov?.activity || []).filter((e) => e.kind === 'send').length

  const lv = (n: number, cap: number) => Math.min(1, Math.log2((n || 0) + 1) / Math.log2(cap + 1))
  const intensity: Record<RegionId, number> = {
    decisions: lv(hn?.active_sequences ?? 0, 50),
    scoring: lv((hn?.hot ?? 0) + (hn?.warm ?? 0), 60),
    intake: lv(ti?.leads_today ?? 0, 20),
    conversation: lv(hn?.chats_today ?? 0, 80),
    memory: lv((ti?.kb_items ?? 0) + (ti?.notes_total ?? 0), 120),
    timing: lv(hn?.bookings_upcoming ?? 0, 12),
    output: lv(hn?.queued_approvals ?? 0, 25),
  }

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
  const OPEN_LINK: Record<RegionId, { href: string; label: string }> = {
    intake: { href: '/dashboard/leads', label: 'Open Leads' },
    scoring: { href: '/dashboard/leads', label: 'Open Leads' },
    conversation: { href: '/dashboard/inbox', label: 'Open Inbox' },
    decisions: { href: '/dashboard/tasks', label: 'Open Tasks' },
    output: { href: '/dashboard/tasks', label: 'Open Tasks' },
    timing: { href: '/dashboard/bookings', label: 'Open Bookings' },
    memory: { href: '/dashboard/settings', label: 'Open Knowledge' },
  }

  const sel = selected ? REGION_META[selected] : null

  return (
    <div style={{ height: '100%', position: 'relative', overflow: 'hidden' }}>
      <style>{`@keyframes bhTick { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } } @keyframes bhPanel { from { opacity: 0; transform: translateX(-50%) translateY(10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }`}</style>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 62% 55% at 50% 46%, rgba(139,92,246,0.10), transparent 72%)' }} />

      {/* the 3D brain fills the whole surface; panels float over it */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <NeuralBrain firing={firing} hovered={hovered} intensity={intensity} onPick={setSelected} onHover={setHovered} />
      </div>

      {/* left vitals — hidden on phones: the two side panels would blanket the
          brain canvas at 375px. Stats stay reachable via the click panel. */}
      <div className="hidden md:flex" style={{ position: 'absolute', left: 22, top: '50%', transform: 'translateY(-50%)', flexDirection: 'column', gap: 10, width: 168, pointerEvents: 'none' }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, color: 'var(--text-muted)' }}>TAKEN IN</div>
        {([['Knowledge items', ti?.kb_items ?? '—'], ['Leads (all time)', ti?.leads_total ?? '—'], ['Leads today', ti?.leads_today ?? '—'], ['Team notes', ti?.notes_total ?? '—'], ['Channels', ti ? Object.keys(ti.channels || {}).length : '—']] as Array<[string, number | string]>).map(([label, v]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid var(--border-primary)', paddingBottom: 5 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
          </div>
        ))}
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>Drag to rotate. Click a glowing region to see inside it.</div>
      </div>

      {/* right vitals + feed — hidden on phones (see left vitals note) */}
      <div className="hidden md:flex" style={{ position: 'absolute', right: 22, top: '50%', transform: 'translateY(-50%)', flexDirection: 'column', gap: 10, width: 220, pointerEvents: 'none' }}>
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
                <span style={{ color: rgb(REGION_META[region].color), flexShrink: 0 }}>{KIND_ICON[e.kind] || '·'}</span>
                <span style={{ color: 'var(--text-secondary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>{e.label}</strong> {e.detail}
                </span>
                <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: 10 }}>{relTime(e.at)}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* click panel: what's inside this lobe right now */}
      {sel && selected && (
        <div style={{
          position: 'absolute', left: '50%', bottom: 18, transform: 'translateX(-50%)',
          width: 'min(540px, 92%)', padding: '14px 16px', borderRadius: 14,
          background: 'var(--bg-secondary)', border: `1.5px solid ${rgb(sel.color)}66`,
          boxShadow: `0 12px 40px rgba(0,0,0,.5), 0 0 24px ${rgb(sel.color)}22`, animation: 'bhPanel .25s ease', zIndex: 5,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: rgb(sel.color) }}>{sel.name}</div>
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
          <div style={{ marginTop: 10, maxHeight: 190, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {regionLoading && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Looking inside…</div>}
            {!regionLoading && regionItems && regionItems.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>Nothing in here yet.</div>}
            {!regionLoading && (regionItems || []).map((it, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11.5, padding: '5px 8px', borderRadius: 7, background: 'var(--bg-primary)', border: '1px solid var(--border-primary)' }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>{it.title}</strong> <span style={{ color: 'var(--text-secondary)' }}>{it.sub}</span>
                </span>
                {it.at && <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: 10 }}>{relTime(it.at)}</span>}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, textAlign: 'right' }}>
            <a href={OPEN_LINK[selected].href} style={{ fontSize: 11.5, fontWeight: 700, color: rgb(sel.color), textDecoration: 'none' }}>{OPEN_LINK[selected].label} →</a>
          </div>
        </div>
      )}

      {err && (
        <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', fontSize: 11.5, color: '#ef4444', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.35)', borderRadius: 8, padding: '5px 12px' }}>
          Live data unreachable: {err}
        </div>
      )}
      {!ov && !err && (
        <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', fontSize: 11.5, color: 'var(--text-secondary)' }}>Waking the brain…</div>
      )}
    </div>
  )
}
