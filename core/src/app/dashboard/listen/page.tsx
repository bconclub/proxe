'use client'

// PROXE LISTEN - "Listen first, engage better." The GI/PI + comms team's
// sentiment command board, laid out to match the Listen mockup:
// KPI strip (sparklines + heat gauge) → Signal Inbox | What PROXe Thinks +
// Recommended Actions + Source Mix → Trending Keywords | Sentiment Over Time |
// Mood by Region → Evidence Board carousel.
// Reads GET /api/dashboard/listen; signals land via POST /api/agent/listen/log
// and the RSS source fetcher.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { MdSensors, MdRefresh, MdFilterList, MdWarning, MdHeadsetMic, MdPoll, MdVolunteerActivism, MdReportProblem, MdOutlineRssFeed, MdChevronLeft, MdChevronRight, MdInfoOutline, MdCampaign, MdEditNote, MdVisibility, MdNorthEast, MdSouthEast, MdTrendingFlat } from 'react-icons/md'
import { FaTwitter, FaFacebookF, FaInstagram, FaYoutube, FaWhatsapp, FaRegNewspaper } from 'react-icons/fa'

// ── types ──────────────────────────────────────────────────────────────────
interface SignalRow {
  content: string; source: string; url: string | null; sentiment: string | null
  issue_category: string | null; constituency: string | null; severity: number | null
  is_crisis: boolean; is_opposition: boolean; is_positive: boolean; created_at: string
}
interface Digest {
  totals: { signals: number; crisis: number; opposition: number; positive: number; negative: number; neutral: number; prevSignals: number; prevCrisis: number; prevOpposition: number; prevPositive: number }
  heatScore: number; heatLabel: string; prevHeat: number
  whatProxeThinks: { heat: number; label: string; delta: number; text: string }
  recommendedActions: { title: string; detail: string; kind: string }[]
  trendingIssues: { category: string; count: number; prev: number; trend: number }[]
  keywords: { word: string; count: number; pos: number; neg: number; trend: number }[]
  recentSignals: SignalRow[]
  dailySeries: { day: string; pos: number; neg: number; neutral: number; total: number; crisis: number; opposition: number; positive: number }[]
  bySource: { source: string; count: number }[]
  moodBySeat: { constituency: string; district: string | null; pos: number; neg: number; neutral: number; total: number; net: number; heat: number }[]
  windowDays: number
}
interface Source {
  id: string; name: string; type: string; url: string | null
  constituency: string | null; issue_category: string | null
  active: boolean; last_fetched_at: string | null; last_item_count: number
}

// ── helpers ────────────────────────────────────────────────────────────────
const ago = (iso: string) => {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`
}
const cap = (s: string) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
const pct = (curV: number, prevV: number) => { if (!prevV) return curV > 0 ? 100 : 0; return Math.round(((curV - prevV) / prevV) * 100) }

const CATEGORIES = ['jobs', 'water', 'power', 'roads', 'drugs', 'farm_debt', 'health', 'education', 'other']

const SRC_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  twitter: { label: 'Twitter / X', icon: <FaTwitter size={13} />, color: '#1d9bf0' },
  facebook: { label: 'Facebook', icon: <FaFacebookF size={13} />, color: '#1877f2' },
  instagram: { label: 'Instagram', icon: <FaInstagram size={14} />, color: '#e4405f' },
  youtube: { label: 'YouTube', icon: <FaYoutube size={14} />, color: '#ff4444' },
  news: { label: 'News', icon: <FaRegNewspaper size={13} />, color: '#60a5fa' },
  whatsapp_trend: { label: 'WhatsApp', icon: <FaWhatsapp size={14} />, color: '#25d366' },
  complaint: { label: 'Complaint', icon: <MdReportProblem size={15} />, color: '#f59e0b' },
  call_centre: { label: 'Call Centre', icon: <MdHeadsetMic size={15} />, color: '#38bdf8' },
  volunteer_report: { label: 'Volunteer Report', icon: <MdVolunteerActivism size={15} />, color: '#a78bfa' },
  survey: { label: 'Survey', icon: <MdPoll size={15} />, color: '#34d399' },
}
const srcMeta = (s: string) => SRC_META[s] || { label: cap(s), icon: <MdOutlineRssFeed size={14} />, color: 'var(--text-secondary)' }

const sentBadge = (s: SignalRow) => {
  const sent = s.sentiment === 'positive' ? 'Positive' : s.sentiment === 'negative' ? 'Negative' : 'Neutral'
  const c = sent === 'Positive' ? '#22c55e' : sent === 'Negative' ? '#ef4444' : '#9ca3af'
  return { text: sent, color: c }
}
const sevBadge = (s: SignalRow) => {
  const sev = s.severity || 0
  if (s.is_crisis || sev >= 4) return { text: 'High', color: '#ef4444' }
  if (sev === 3) return { text: 'Medium', color: '#f59e0b' }
  return { text: 'Low', color: '#9ca3af' }
}

// ── tiny SVG pieces ────────────────────────────────────────────────────────
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const W = 110; const H = 40
  if (!data.length) return null
  const max = Math.max(...data, 1); const min = Math.min(...data, 0)
  const span = max - min || 1
  const pts = data.map((v, i) => `${(i / Math.max(data.length - 1, 1)) * W},${H - 4 - ((v - min) / span) * (H - 8)}`).join(' ')
  return (
    <svg width={W} height={H} style={{ display: 'block', flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function HeatGauge({ score }: { score: number }) {
  const r = 34; const cx = 44; const cy = 44
  const start = 135; const sweep = 270
  const polar = (deg: number) => { const rad = (deg * Math.PI) / 180; return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)] }
  const arc = (from: number, to: number) => {
    const [x1, y1] = polar(from); const [x2, y2] = polar(to)
    const large = to - from > 180 ? 1 : 0
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`
  }
  const val = start + (Math.max(0, Math.min(100, score)) / 100) * sweep
  return (
    <svg width={88} height={88} style={{ display: 'block', flexShrink: 0 }}>
      <defs>
        <linearGradient id="heatGrad" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#f59e0b" /><stop offset="100%" stopColor="#f97316" />
        </linearGradient>
      </defs>
      <path d={arc(start, start + sweep)} fill="none" stroke="var(--bg-hover)" strokeWidth={9} strokeLinecap="round" />
      {score > 0 && <path d={arc(start, val)} fill="none" stroke="url(#heatGrad)" strokeWidth={9} strokeLinecap="round" />}
    </svg>
  )
}

function SentimentChart({ series }: { series: Digest['dailySeries'] }) {
  const W = 620; const H = 210; const padL = 30; const padB = 24; const padT = 12
  const max = Math.max(...series.map((d) => Math.max(d.pos, d.neg, d.neutral)), 4)
  const x = (i: number) => padL + (i / Math.max(series.length - 1, 1)) * (W - padL - 8)
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB)
  const line = (key: 'pos' | 'neg' | 'neutral') => series.map((d, i) => `${x(i)},${y(d[key])}`).join(' ')
  const ticks = [0, Math.round(max / 3), Math.round((2 * max) / 3), max]
  const labelEvery = Math.ceil(series.length / 8)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - 8} y1={y(t)} y2={y(t)} stroke="var(--border-primary)" strokeDasharray="3 4" strokeWidth={0.6} />
          <text x={padL - 6} y={y(t) + 3} fontSize={9} fill="var(--text-muted)" textAnchor="end">{t}</text>
        </g>
      ))}
      <polygon points={`${x(0)},${y(0)} ${line('pos')} ${x(series.length - 1)},${y(0)}`} fill="rgba(34,197,94,0.10)" />
      <polyline points={line('pos')} fill="none" stroke="#22c55e" strokeWidth={2} strokeLinejoin="round" />
      <polyline points={line('neutral')} fill="none" stroke="#9ca3af" strokeWidth={1.6} strokeLinejoin="round" />
      <polyline points={line('neg')} fill="none" stroke="#ef4444" strokeWidth={2} strokeLinejoin="round" />
      {series.map((d, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(d.pos)} r={2.4} fill="#22c55e" />
          <circle cx={x(i)} cy={y(d.neg)} r={2.4} fill="#ef4444" />
          {i % labelEvery === 0 && <text x={x(i)} y={H - 6} fontSize={9} fill="var(--text-muted)" textAnchor="middle">{d.day}</text>}
        </g>
      ))}
    </svg>
  )
}

// ── page ───────────────────────────────────────────────────────────────────
export default function ListenPage() {
  const [d, setD] = useState<Digest | null>(null)
  const [days, setDays] = useState(7)
  const [loading, setLoading] = useState(true)
  const [inboxLimit, setInboxLimit] = useState(9)
  const [showFilters, setShowFilters] = useState(false)
  const [filter, setFilter] = useState<'all' | 'crisis' | 'negative' | 'positive'>('all')
  // Sources
  const [sources, setSources] = useState<Source[]>([])
  const [showSources, setShowSources] = useState(false)
  const [adding, setAdding] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [form, setForm] = useState({ name: '', url: '', issue_category: '' })
  const evidenceRef = useRef<HTMLDivElement>(null)

  const load = React.useCallback(() => {
    setLoading(true)
    fetch(`/api/dashboard/listen?days=${days}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j && !j.error) setD(j) })
      .finally(() => setLoading(false))
  }, [days])
  useEffect(() => { load() }, [load])

  const loadSources = React.useCallback(() => {
    fetch('/api/dashboard/listen/sources', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.sources) setSources(j.sources) })
      .catch(() => {})
  }, [])
  useEffect(() => { loadSources() }, [loadSources])

  const addSource = async () => {
    if (!form.name.trim() || !form.url.trim()) return
    await fetch('/api/dashboard/listen/sources', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.name.trim(), type: 'rss', url: form.url.trim(), issue_category: form.issue_category || undefined }),
    }).catch(() => {})
    setForm({ name: '', url: '', issue_category: '' }); setAdding(false); loadSources()
  }
  const toggleSource = async (s: Source) => {
    await fetch('/api/dashboard/listen/sources', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id, active: !s.active }) }).catch(() => {})
    loadSources()
  }
  const deleteSource = async (s: Source) => {
    await fetch(`/api/dashboard/listen/sources?id=${s.id}`, { method: 'DELETE' }).catch(() => {})
    loadSources()
  }
  const fetchNow = async () => {
    setFetching(true)
    try { await fetch('/api/dashboard/listen/sources/fetch', { method: 'POST' }) } catch {}
    setFetching(false); loadSources(); load()
  }

  const inbox = useMemo(() => {
    if (!d) return []
    let rows = d.recentSignals
    if (filter === 'crisis') rows = rows.filter((s) => s.is_crisis)
    else if (filter === 'negative') rows = rows.filter((s) => s.sentiment === 'negative')
    else if (filter === 'positive') rows = rows.filter((s) => s.sentiment === 'positive')
    return rows
  }, [d, filter])

  const evidence = useMemo(() => (d ? d.recentSignals.filter((s) => s.url || s.is_crisis || (s.severity || 0) >= 3).slice(0, 16) : []), [d])

  const card: React.CSSProperties = { background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 14, padding: 16 }
  const badge = (color: string, text: string) => (
    <span style={{ fontSize: 10.5, fontWeight: 700, color, background: `${color}1a`, border: `1px solid ${color}40`, borderRadius: 6, padding: '2px 8px', whiteSpace: 'nowrap' }}>{text}</span>
  )
  const chip = (text: string) => (
    <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-hover)', border: '1px solid var(--border-primary)', borderRadius: 6, padding: '2px 8px', whiteSpace: 'nowrap' }}>{text}</span>
  )
  const delta = (v: number, suffix = '% vs last period') => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11, fontWeight: 700, color: v > 0 ? '#22c55e' : v < 0 ? '#ef4444' : 'var(--text-muted)' }}>
      {v > 0 ? <MdNorthEast size={12} /> : v < 0 ? <MdSouthEast size={12} /> : <MdTrendingFlat size={12} />}
      {Math.abs(v)}{suffix}
    </span>
  )

  const kpi = (label: string, value: number, color: string, icon: React.ReactNode, deltaPct: number, spark: number[]) => (
    <div key={label} style={{ ...card, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)' }}>
        <span style={{ color, display: 'flex' }}>{icon}</span>{label}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1, color: 'var(--text-primary)' }}>{value}</div>
        <Sparkline data={spark} color={color} />
      </div>
      {delta(deltaPct)}
    </div>
  )

  const actionStyle = (kind: string) => kind === 'crisis'
    ? { color: '#ef4444', icon: <MdCampaign size={18} />, label: 'Escalate' }
    : kind === 'opposition' || kind === 'issue'
      ? { color: '#3b82f6', icon: <MdEditNote size={18} />, label: 'Prepare Response' }
      : { color: '#f59e0b', icon: <MdVisibility size={18} />, label: 'Monitor' }

  return (
    <div className="dashboard-listen-page">
      {/* ── header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ width: 38, height: 38, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-hover)', color: '#f97316' }}><MdSensors size={21} /></span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>PROXe <span style={{ color: '#f97316' }}>Listen</span></h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Listen first, engage better - signals across social, news, WhatsApp, call centre and the field.</p>
        </div>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 9, padding: '8px 10px', fontSize: 12, fontWeight: 600 }}>
          <option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option>
        </select>
        <button onClick={() => setShowFilters((v) => !v)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: showFilters ? 'var(--bg-hover)' : 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 9, padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}><MdFilterList size={15} /> Filters</button>
        <button onClick={() => setShowSources((v) => !v)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: showSources ? 'var(--bg-hover)' : 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 9, padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}><MdOutlineRssFeed size={15} /> Sources <span style={{ color: 'var(--text-muted)' }}>({sources.filter((s) => s.active).length})</span></button>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#f97316', color: '#fff', border: 'none', borderRadius: 9, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}><MdRefresh size={15} /> Refresh</button>
      </div>

      {/* ── filters row ── */}
      {showFilters && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {(['all', 'crisis', 'negative', 'positive'] as const).map((f) => (
            <button key={f} onClick={() => { setFilter(f); setInboxLimit(9) }} style={{ background: filter === f ? '#f97316' : 'var(--bg-secondary)', color: filter === f ? '#fff' : 'var(--text-secondary)', border: '1px solid var(--border-primary)', borderRadius: 20, padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{cap(f)}</button>
          ))}
        </div>
      )}

      {/* ── sources manager (collapsed by default) ── */}
      {showSources && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Sources <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)' }}>({sources.length}) · {sources.filter((s) => s.active).length} active</span></span>
            <div style={{ flex: 1 }} />
            <button onClick={() => setAdding((v) => !v)} style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 8, padding: '6px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>+ Add source</button>
            <button onClick={fetchNow} disabled={fetching} style={{ background: fetching ? 'var(--bg-hover)' : '#f97316', color: fetching ? 'var(--text-muted)' : '#fff', border: 'none', borderRadius: 8, padding: '6px 11px', fontSize: 12, fontWeight: 700, cursor: fetching ? 'default' : 'pointer' }}>{fetching ? 'Fetching…' : 'Fetch now'}</button>
          </div>
          {adding && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12, padding: 10, background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 8 }}>
              <input placeholder="Source name (e.g. Tribune Punjab)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ flex: '1 1 160px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 7, padding: '7px 9px', fontSize: 12 }} />
              <input placeholder="RSS feed URL" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} style={{ flex: '2 1 260px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 7, padding: '7px 9px', fontSize: 12 }} />
              <select value={form.issue_category} onChange={(e) => setForm({ ...form, issue_category: e.target.value })} style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 7, padding: '7px 9px', fontSize: 12 }}>
                <option value="">Auto-tag issue</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{cap(c)}</option>)}
              </select>
              <button onClick={addSource} style={{ background: '#f97316', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 13px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Add</button>
            </div>
          )}
          {sources.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No sources yet. Add an RSS feed to start pulling signals.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
              {sources.map((s) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 8, padding: '8px 10px', opacity: s.active ? 1 : 0.55 }}>
                  <span onClick={() => toggleSource(s)} title={s.active ? 'Active — click to pause' : 'Paused — click to activate'} style={{ width: 9, height: 9, borderRadius: 9, background: s.active ? '#22c55e' : 'var(--text-muted)', flexShrink: 0, cursor: 'pointer' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {s.type.toUpperCase()}{s.issue_category ? ` · ${cap(s.issue_category)}` : ''}{s.last_fetched_at ? ` · ${s.last_item_count} items · ${ago(s.last_fetched_at)} ago` : ' · never fetched'}
                    </div>
                  </div>
                  <button onClick={() => deleteSource(s)} title="Remove source" style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 15, lineHeight: 1, flexShrink: 0 }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!d || d.totals.signals === 0 ? (
        <div style={{ ...card, padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
          {loading ? 'Loading signals…' : 'No signals in this window yet. Add sources and Fetch now, or let the bridges (WhatsApp scan, call centre, volunteer reports) feed /api/agent/listen/log.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── KPI strip ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
            {kpi('Signals', d.totals.signals, '#3b82f6', <MdSensors size={16} />, pct(d.totals.signals, d.totals.prevSignals), d.dailySeries.map((x) => x.total))}
            {kpi('Crisis', d.totals.crisis, '#ef4444', <MdWarning size={16} />, pct(d.totals.crisis, d.totals.prevCrisis), d.dailySeries.map((x) => x.crisis))}
            {kpi('Positive', d.totals.positive, '#22c55e', <MdNorthEast size={16} />, pct(d.totals.positive, d.totals.prevPositive), d.dailySeries.map((x) => x.positive))}
            {kpi('Opposition', d.totals.opposition, '#f59e0b', <MdCampaign size={16} />, pct(d.totals.opposition, d.totals.prevOpposition), d.dailySeries.map((x) => x.opposition))}
            <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)' }}>
                <span style={{ color: '#f97316', display: 'flex' }}><MdWarning size={16} /></span>Heat Score
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1, color: 'var(--text-primary)' }}>{d.heatScore}<span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)' }}> /100</span></div>
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#f97316' }}>{d.heatLabel}</span>
                    {delta(d.heatScore - d.prevHeat, ' pts vs last period')}
                  </div>
                </div>
                <HeatGauge score={d.heatScore} />
              </div>
            </div>
          </div>

          {/* ── inbox + right rail ── */}
          <div className="listen-main-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(300px, 2fr)', gap: 16, alignItems: 'start' }}>
            {/* Signal Inbox */}
            <div style={{ ...card, padding: 0, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: '1px solid var(--border-primary)' }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>Signal Inbox</span>
                {badge('#3b82f6', `${d.totals.signals} New`)}
                <div style={{ flex: 1 }} />
                <button onClick={() => setInboxLimit(9999)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>View all signals →</button>
              </div>
              <div>
                {inbox.slice(0, inboxLimit).map((s, i) => {
                  const m = srcMeta(s.source); const sb = sentBadge(s); const sv = sevBadge(s)
                  const firstBreak = s.content.search(/[.!?]\s|[.!?]$/)
                  const title = firstBreak > 15 && firstBreak < 120 ? s.content.slice(0, firstBreak + 1) : s.content.slice(0, 90)
                  const rest = s.content.slice(title.length).trim()
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '12px 16px', borderBottom: i < Math.min(inbox.length, inboxLimit) - 1 ? '1px solid var(--border-primary)' : 'none' }}>
                      <span style={{ width: 8, height: 8, borderRadius: 8, marginTop: 12, flexShrink: 0, background: s.is_crisis ? '#ef4444' : sb.color === '#22c55e' ? '#22c55e' : '#3b82f6' }} />
                      <span style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${m.color}1f`, color: m.color, flexShrink: 0 }}>{m.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>
                          {s.url ? <a href={s.url} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>{title}</a> : title}
                        </div>
                        {rest && <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>{rest}</div>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '46%' }}>
                        {chip(m.label)}
                        {s.constituency && chip(s.constituency)}
                        {badge(sb.color, sb.text)}
                        {badge(sv.color, sv.text)}
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 20, textAlign: 'right' }}>{ago(s.created_at)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid var(--border-primary)' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Showing latest {Math.min(inboxLimit, inbox.length)} of {inbox.length} signals</span>
                {inbox.length > inboxLimit && (
                  <button onClick={() => setInboxLimit((v) => v + 9)} style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 16, padding: '5px 14px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>+ Load more</button>
                )}
              </div>
            </div>

            {/* Right rail: What PROXe Thinks + Actions + Source Mix */}
            <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>✦ What PROXe Thinks</span>
                {badge('#f97316', 'AI')}
              </div>
              <div style={{ display: 'flex', gap: 12, background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: 14 }}>
                <span style={{ width: 42, height: 42, borderRadius: 42, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle at 35% 35%, #f97316, #b91c1c)', color: '#fff' }}><MdSensors size={20} /></span>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text-primary)' }}>{d.whatProxeThinks.text}</p>
                  <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 6 }}>
                    Heat is <b style={{ color: '#f97316' }}>{d.whatProxeThinks.label.toLowerCase()}</b>{d.whatProxeThinks.delta !== 0 ? ` and ${d.whatProxeThinks.delta > 0 ? 'rising' : 'easing'} (${d.whatProxeThinks.delta > 0 ? '+' : ''}${d.whatProxeThinks.delta} pts).` : '.'}
                  </p>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Recommended Actions</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                  {d.recommendedActions.slice(0, 3).map((a, i) => {
                    const st = actionStyle(a.kind)
                    return (
                      <div key={i} title={a.detail} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: `${st.color}14`, border: `1px solid ${st.color}40`, borderRadius: 10, padding: '10px 12px', cursor: 'default' }}>
                        <span style={{ color: st.color, flexShrink: 0, marginTop: 1 }}>{st.icon}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: st.color }}>{st.label}</div>
                          <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{a.title}</div>
                        </div>
                      </div>
                    )
                  })}
                  {d.recommendedActions.length === 0 && <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Nothing urgent this window.</span>}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Source Mix</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(108px, 1fr))', gap: 8 }}>
                  {d.bySource.map((s) => {
                    const m = srcMeta(s.source)
                    return (
                      <div key={s.source} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 9, padding: '8px 10px' }}>
                        <span style={{ color: m.color, display: 'flex', flexShrink: 0 }}>{m.icon}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.label}</div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{s.count}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* ── analytics row: keywords | sentiment chart | mood by region ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'stretch' }}>
            {/* Trending Keywords */}
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-primary)' }}>Trending Keywords</span>
                <MdInfoOutline size={13} color="var(--text-muted)" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '20px 1fr 52px 34px 70px', gap: 6, fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 600, padding: '0 2px 6px', borderBottom: '1px solid var(--border-primary)' }}>
                <span>#</span><span>Keyword</span><span style={{ textAlign: 'right' }}>Signals</span><span style={{ textAlign: 'center' }}>Trend</span><span>Sentiment</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {d.keywords.slice(0, 8).map((k, i) => {
                  const dashColor = k.neg > k.pos ? '#ef4444' : k.pos > k.neg ? '#22c55e' : '#f59e0b'
                  const dashes = Math.max(1, Math.min(5, Math.round((Math.max(k.pos, k.neg) / Math.max(k.count, 1)) * 5)))
                  return (
                    <div key={k.word} style={{ display: 'grid', gridTemplateColumns: '20px 1fr 52px 34px 70px', gap: 6, alignItems: 'center', padding: '7px 2px', borderBottom: i < 7 ? '1px solid var(--border-primary)' : 'none', fontSize: 12.5 }}>
                      <span style={{ color: '#f97316', fontWeight: 700, fontSize: 11 }}>{i + 1}</span>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cap(k.word)}</span>
                      <span style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>{k.count}</span>
                      <span style={{ display: 'flex', justifyContent: 'center' }}>{k.trend > 0 ? <MdNorthEast size={13} color="#22c55e" /> : k.trend < 0 ? <MdSouthEast size={13} color="#ef4444" /> : <MdTrendingFlat size={13} color="var(--text-muted)" />}</span>
                      <span style={{ display: 'flex', gap: 3 }}>
                        {Array.from({ length: dashes }).map((_, j) => <span key={j} style={{ width: 9, height: 3, borderRadius: 2, background: dashColor }} />)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Sentiment Over Time */}
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-primary)' }}>Sentiment Over Time</span>
                <div style={{ flex: 1 }} />
                {([['Positive', '#22c55e'], ['Neutral', '#9ca3af'], ['Negative', '#ef4444']] as const).map(([l, c]) => (
                  <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-secondary)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 8, background: c }} />{l}
                  </span>
                ))}
              </div>
              <SentimentChart series={d.dailySeries} />
            </div>

            {/* Mood by Region */}
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-primary)' }}>Mood by Region</span>
                <MdInfoOutline size={13} color="var(--text-muted)" />
                <div style={{ flex: 1 }} />
                <a href="/dashboard/map" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', textDecoration: 'none' }}>View map →</a>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(70px, 1fr) minmax(80px, 1.4fr) 38px 38px 38px 30px', gap: 6, fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, paddingBottom: 6, borderBottom: '1px solid var(--border-primary)' }}>
                <span>Region</span><span>Mood</span><span style={{ textAlign: 'right' }}>Neg</span><span style={{ textAlign: 'right' }}>Neu</span><span style={{ textAlign: 'right' }}>Pos</span><span style={{ textAlign: 'right' }}>Heat</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {d.moodBySeat.slice(0, 8).map((m, i) => {
                  const t = m.total || 1
                  const negP = Math.round((m.neg / t) * 100); const neuP = Math.round((m.neutral / t) * 100); const posP = Math.round((m.pos / t) * 100)
                  const heatBg = m.heat >= 70 ? '#ef4444' : m.heat >= 55 ? '#f97316' : m.heat >= 40 ? '#f59e0b' : '#22c55e'
                  return (
                    <div key={m.constituency} style={{ display: 'grid', gridTemplateColumns: 'minmax(70px, 1fr) minmax(80px, 1.4fr) 38px 38px 38px 30px', gap: 6, alignItems: 'center', padding: '7px 0', borderBottom: i < 7 ? '1px solid var(--border-primary)' : 'none' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.constituency}</span>
                      <div style={{ display: 'flex', height: 7, borderRadius: 4, overflow: 'hidden', background: 'var(--bg-hover)' }}>
                        <div style={{ width: `${negP}%`, background: '#ef4444' }} />
                        <div style={{ width: `${neuP}%`, background: '#6b7280' }} />
                        <div style={{ width: `${posP}%`, background: '#22c55e' }} />
                      </div>
                      <span style={{ fontSize: 11, textAlign: 'right', color: 'var(--text-secondary)' }}>{negP}%</span>
                      <span style={{ fontSize: 11, textAlign: 'right', color: 'var(--text-secondary)' }}>{neuP}%</span>
                      <span style={{ fontSize: 11, textAlign: 'right', color: 'var(--text-secondary)' }}>{posP}%</span>
                      <span style={{ fontSize: 10.5, fontWeight: 800, textAlign: 'center', color: '#fff', background: heatBg, borderRadius: 5, padding: '2px 0' }}>{m.heat}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ── Evidence Board ── */}
          {evidence.length > 0 && (
            <div style={{ ...card, padding: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px 10px' }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>Evidence Board</span>
                <div style={{ flex: 1 }} />
                <button onClick={() => evidenceRef.current?.scrollBy({ left: -560, behavior: 'smooth' })} style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-primary)', borderRadius: 8, color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', padding: 4 }}><MdChevronLeft size={16} /></button>
                <button onClick={() => evidenceRef.current?.scrollBy({ left: 560, behavior: 'smooth' })} style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-primary)', borderRadius: 8, color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', padding: 4 }}><MdChevronRight size={16} /></button>
              </div>
              <div ref={evidenceRef} style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '4px 16px 16px', scrollbarWidth: 'thin' }}>
                {evidence.map((s, i) => {
                  const m = srcMeta(s.source)
                  return (
                    <div key={i} style={{ flex: '0 0 250px', background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 26, height: 26, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${m.color}1f`, color: m.color, flexShrink: 0 }}>{m.icon}</span>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.label}{s.constituency ? ` · ${s.constituency}` : ''}</span>
                        <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{ago(s.created_at)}</span>
                      </div>
                      <p style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', minHeight: 52 }}>{s.content}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {s.is_crisis && badge('#ef4444', 'Crisis')}
                        {s.issue_category && chip(cap(s.issue_category))}
                        <div style={{ flex: 1 }} />
                        {s.url && <a href={s.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, fontWeight: 600, color: '#f97316', textDecoration: 'none' }}>Open →</a>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`@media (max-width: 900px){ .listen-main-grid{ grid-template-columns: minmax(0,1fr) !important; } }`}</style>
    </div>
  )
}
