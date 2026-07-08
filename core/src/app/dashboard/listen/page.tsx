'use client'

// PROXE LISTEN - "Listen first, engage better." The GI/PI + comms team's
// sentiment command board, laid out to match the Listen mockup:
// KPI strip (sparklines + heat gauge) → Signal Inbox | What PROXe Thinks +
// Recommended Actions + Source Mix → Trending Keywords | Sentiment Over Time |
// Mood by Region → Evidence Board carousel.
// Reads GET /api/dashboard/listen; signals land via POST /api/agent/listen/log
// and the RSS source fetcher.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { MdSensors, MdRefresh, MdFilterList, MdWarning, MdHeadsetMic, MdPoll, MdVolunteerActivism, MdReportProblem, MdOutlineRssFeed, MdChevronLeft, MdChevronRight, MdInfoOutline, MdCampaign, MdEditNote, MdVisibility, MdNorthEast, MdSouthEast, MdTrendingFlat, MdWaterDrop, MdCurrencyRupee, MdWorkOutline, MdBolt, MdAddRoad, MdMedication, MdLocalHospital, MdSchool, MdErrorOutline, MdMood, MdSentimentNeutral, MdMoodBad, MdStackedLineChart } from 'react-icons/md'
import { FaTwitter, FaFacebookF, FaInstagram, FaYoutube, FaWhatsapp, FaRegNewspaper, FaRedditAlien } from 'react-icons/fa'
import punjabGeo from '@/data/punjab-ac.json'
import { normName } from '@/lib/war-room/constituencies'

// ── types ──────────────────────────────────────────────────────────────────
interface SignalRow {
  content: string; source: string; url: string | null; author: string | null; image_url: string | null
  sentiment: string | null; issue_category: string | null; constituency: string | null; severity: number | null
  is_crisis: boolean; is_opposition: boolean; is_positive: boolean; created_at: string
}
interface Digest {
  totals: { signals: number; crisis: number; opposition: number; positive: number; negative: number; neutral: number; sentPositive: number; prevSignals: number; prevCrisis: number; prevOpposition: number; prevPositive: number; prevSentPositive: number; prevNegative: number; prevNeutral: number }
  keywordsTracked: number
  updatedAt: string | null
  heatScore: number; heatLabel: string; prevHeat: number
  whatProxeThinks: { heat: number; label: string; delta: number; text: string }
  recommendedActions: { title: string; detail: string; kind: string }[]
  trendingIssues: { category: string; count: number; prev: number; trend: number }[]
  keywords: { word: string; count: number; pos: number; neg: number; trend: number; category: string | null }[]
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
  reddit: { label: 'Reddit', icon: <FaRedditAlien size={14} />, color: '#ff4500' },
  blog: { label: 'Blog', icon: <MdOutlineRssFeed size={15} />, color: '#f59e0b' },
}

// issue category → icon + label for the keyword tiles
const CAT_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  water: { label: 'Water', icon: <MdWaterDrop size={14} />, color: '#38bdf8' },
  farm_debt: { label: 'Farm Debt', icon: <MdCurrencyRupee size={14} />, color: '#a78bfa' },
  jobs: { label: 'Jobs', icon: <MdWorkOutline size={14} />, color: '#f97316' },
  power: { label: 'Power', icon: <MdBolt size={14} />, color: '#f59e0b' },
  roads: { label: 'Roads', icon: <MdAddRoad size={14} />, color: '#8b7bff' },
  drugs: { label: 'Drugs', icon: <MdMedication size={14} />, color: '#f43f5e' },
  health: { label: 'Health', icon: <MdLocalHospital size={14} />, color: '#22c55e' },
  education: { label: 'Education', icon: <MdSchool size={14} />, color: '#c084fc' },
  other: { label: 'General', icon: <MdErrorOutline size={14} />, color: '#94a3b8' },
}
const catMeta = (c: string | null) => CAT_META[c || 'other'] || { label: 'Grievance', icon: <MdErrorOutline size={14} />, color: '#f59e0b' }
const RANK_COLORS = ['#22c55e', '#3b82f6', '#a78bfa', '#f97316', '#ec4899', '#f59e0b', '#fb7185', '#8b5cf6']
const srcMeta = (s: string) => SRC_META[s] || { label: cap(s), icon: <MdOutlineRssFeed size={14} />, color: 'var(--text-secondary)' }

// Real outlet logo for news items: the article domain's favicon. Social
// signals keep their brand glyph.
const hostOf = (url: string | null) => { try { return url ? new URL(url).hostname.replace(/^www\./, '') : null } catch { return null } }
const faviconOf = (url: string | null) => { const h = hostOf(url); return h ? `https://www.google.com/s2/favicons?sz=64&domain=${h}` : null }
const ytThumb = (url: string | null) => {
  const m = url?.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/)
  return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : null
}
const mediaOf = (s: SignalRow) => s.image_url || ytThumb(s.url)

function SourceGlyph({ s, size = 30 }: { s: SignalRow; size?: number }) {
  const m = srcMeta(s.source)
  const fav = s.source === 'news' ? faviconOf(s.url) : null
  return (
    <span style={{ width: size, height: size, borderRadius: size * 0.28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${m.color}1f`, color: m.color, flexShrink: 0, overflow: 'hidden' }}>
      {fav
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={fav} alt="" width={size - 10} height={size - 10} style={{ borderRadius: 4 }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
        : m.icon}
    </span>
  )
}

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
  const W = 96; const H = 30
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
  const r = 27; const cx = 35; const cy = 35
  const start = 135; const sweep = 270
  const polar = (deg: number) => { const rad = (deg * Math.PI) / 180; return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)] }
  const arc = (from: number, to: number) => {
    const [x1, y1] = polar(from); const [x2, y2] = polar(to)
    const large = to - from > 180 ? 1 : 0
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`
  }
  const val = start + (Math.max(0, Math.min(100, score)) / 100) * sweep
  return (
    <svg width={70} height={70} style={{ display: 'block', flexShrink: 0 }}>
      <defs>
        <linearGradient id="heatGrad" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#f59e0b" /><stop offset="100%" stopColor="#f97316" />
        </linearGradient>
      </defs>
      <path d={arc(start, start + sweep)} fill="none" stroke="var(--bg-hover)" strokeWidth={7} strokeLinecap="round" />
      {score > 0 && <path d={arc(start, val)} fill="none" stroke="url(#heatGrad)" strokeWidth={7} strokeLinecap="round" />}
    </svg>
  )
}

// Catmull-Rom → cubic bezier for smooth reference-style curves
const smoothPath = (pts: [number, number][]) => {
  if (pts.length < 2) return ''
  let dPath = `M ${pts[0][0]} ${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)]
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6
    dPath += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`
  }
  return dPath
}

// Stacked smooth sentiment areas (red base, gray, green on top) with
// tap-to-hide legend, per the reference design.
function StackedSentiment({ series, hidden }: { series: Digest['dailySeries']; hidden: Set<string> }) {
  const W = 620; const H = 190; const padL = 30; const padR = 6; const padB = 20; const padT = 8
  const on = (k: string) => !hidden.has(k)
  const stackOf = (dd: Digest['dailySeries'][number]) => {
    const neg = on('neg') ? dd.neg : 0
    const neu = on('neutral') ? dd.neutral : 0
    const pos = on('pos') ? dd.pos : 0
    return { negTop: neg, neuTop: neg + neu, posTop: neg + neu + pos }
  }
  const max = Math.max(...series.map((dd) => stackOf(dd).posTop), 4)
  const x = (i: number) => padL + (i / Math.max(series.length - 1, 1)) * (W - padL - padR)
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB)
  const layerPts = (key: 'negTop' | 'neuTop' | 'posTop'): [number, number][] => series.map((dd, i) => [x(i), y(stackOf(dd)[key])])
  const areaBetween = (topPts: [number, number][], bottomPts: [number, number][]) => {
    const bottomRev = [...bottomPts].reverse()
    return `${smoothPath(topPts)} L ${bottomRev[0][0]} ${bottomRev[0][1]} ${smoothPath(bottomRev).slice(1)} Z`
  }
  const zero: [number, number][] = series.map((_, i) => [x(i), y(0)])
  const negPts = layerPts('negTop'); const neuPts = layerPts('neuTop'); const posPts = layerPts('posTop')
  const ticks = [0, Math.round(max / 3), Math.round((2 * max) / 3), max]
  const labelEvery = Math.ceil(series.length / 7)
  const monthDay = (d: string) => { const [m, dd] = d.split('/'); return `${dd} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1]}` }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--border-primary)" strokeDasharray="3 4" strokeWidth={0.6} />
          <text x={padL - 5} y={y(t) + 3} fontSize={8.5} fill="var(--text-muted)" textAnchor="end">{t}</text>
        </g>
      ))}
      {on('neg') && <path d={areaBetween(negPts, zero)} fill="rgba(220,38,38,0.55)" stroke="none" />}
      {on('neutral') && <path d={areaBetween(neuPts, negPts)} fill="rgba(107,114,128,0.45)" stroke="none" />}
      {on('pos') && <path d={areaBetween(posPts, neuPts)} fill="rgba(34,197,94,0.5)" stroke="none" />}
      {on('neg') && <path d={smoothPath(negPts)} fill="none" stroke="#ef4444" strokeWidth={1.6} />}
      {on('neutral') && <path d={smoothPath(neuPts)} fill="none" stroke="#9ca3af" strokeWidth={1.4} />}
      {on('pos') && <path d={smoothPath(posPts)} fill="none" stroke="#22c55e" strokeWidth={1.6} />}
      {series.map((dd, i) => (
        i % labelEvery === 0 ? <text key={i} x={x(i)} y={H - 4} fontSize={8.5} fill="var(--text-muted)" textAnchor="middle">{monthDay(dd.day)}</text> : null
      ))}
    </svg>
  )
}

// Mini Punjab silhouette with numbered mood-score badges for the top regions.
const GEO_FEATURES: any[] = (punjabGeo as any).features || []
function MoodMiniMap({ seats }: { seats: Array<{ constituency: string; score: number }> }) {
  const { paths, badges } = useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    const rings: number[][][] = []
    const centByName: Record<string, [number, number]> = {}
    GEO_FEATURES.forEach((f) => {
      const geoms = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
      let cx = 0, cy = 0, cn = 0
      geoms.forEach((poly: number[][][]) => {
        const ring = poly[0]
        rings.push(ring)
        ring.forEach(([lon, lat]) => {
          minX = Math.min(minX, lon); maxX = Math.max(maxX, lon)
          minY = Math.min(minY, lat); maxY = Math.max(maxY, lat)
          cx += lon; cy += lat; cn++
        })
      })
      if (cn) centByName[normName(f.properties.name)] = [cx / cn, cy / cn]
    })
    const W = 240; const H = 260; const pad = 10
    const sx = (W - 2 * pad) / (maxX - minX); const sy = (H - 2 * pad) / (maxY - minY)
    const s = Math.min(sx, sy)
    const px = (lon: number) => pad + (lon - minX) * s
    const py = (lat: number) => H - pad - (lat - minY) * s
    const pathStrs = rings.map((ring) => 'M ' + ring.map(([lon, lat]) => `${px(lon).toFixed(1)} ${py(lat).toFixed(1)}`).join(' L ') + ' Z')
    const badgeList = seats.map((st) => {
      const c = centByName[normName(st.constituency)]
      return c ? { ...st, x: px(c[0]), y: py(c[1]) } : null
    }).filter(Boolean) as Array<{ constituency: string; score: number; x: number; y: number }>
    return { paths: pathStrs, badges: badgeList }
  }, [seats])
  const scoreColor = (v: number) => (v >= 70 ? '#22c55e' : v >= 45 ? '#f59e0b' : '#ef4444')
  return (
    <svg viewBox="0 0 240 260" style={{ width: '100%', height: 'auto', display: 'block' }}>
      {paths.map((p, i) => <path key={i} d={p} fill="rgba(122,138,160,0.06)" stroke="rgba(122,138,160,0.22)" strokeWidth={0.5} />)}
      {badges.map((b) => (
        <g key={b.constituency}>
          <circle cx={b.x} cy={b.y} r={12} fill="var(--bg-primary)" stroke={scoreColor(b.score)} strokeWidth={2} />
          <text x={b.x} y={b.y + 3.5} fontSize={9.5} fontWeight={800} fill={scoreColor(b.score)} textAnchor="middle">{b.score}</text>
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
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set())
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

  // Evidence = the receipts. Media-rich signals first (real images / video
  // thumbnails), then crisis/high-severity linked items.
  const evidence = useMemo(() => {
    if (!d) return []
    const withMedia = d.recentSignals.filter((s) => mediaOf(s))
    const rest = d.recentSignals.filter((s) => !mediaOf(s) && (s.is_crisis || (s.severity || 0) >= 3) && s.url)
    return [...withMedia, ...rest].slice(0, 16)
  }, [d])

  const card: React.CSSProperties = { background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 14, padding: 13 }
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
        <div style={{ fontSize: 27, fontWeight: 800, lineHeight: 1, color: 'var(--text-primary)' }}>{value}</div>
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
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Listen first, engage better. Signals across social, news, WhatsApp, call centre and the field.</p>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* ── KPI strip ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
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
                  <div style={{ fontSize: 27, fontWeight: 800, lineHeight: 1, color: 'var(--text-primary)' }}>{d.heatScore}<span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)' }}> /100</span></div>
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
          <div className="listen-main-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(300px, 2fr)', gap: 12, alignItems: 'start' }}>
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
                  // strip the trailing "- Outlet" news feeds append, and any stray hyphens
                  const body = s.source === 'news' ? s.content.replace(/\s[-–|]\s[^-–|]{2,60}$/, '') : s.content
                  const firstBreak = body.search(/[.!?]\s|[.!?]$/)
                  const title = firstBreak > 15 && firstBreak < 120 ? body.slice(0, firstBreak + 1) : body.slice(0, 90)
                  const rest = body.slice(title.length).trim()
                  const media = mediaOf(s)
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 14px', borderBottom: i < Math.min(inbox.length, inboxLimit) - 1 ? '1px solid var(--border-primary)' : 'none' }}>
                      <span style={{ width: 7, height: 7, borderRadius: 7, flexShrink: 0, background: s.is_crisis ? '#ef4444' : sb.color === '#22c55e' ? '#22c55e' : '#3b82f6' }} />
                      <SourceGlyph s={s} size={30} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>
                          {s.url ? <a href={s.url} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>{title}</a> : title}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>
                          {s.source === 'news' && s.author ? `${s.author}${rest ? ' · ' : ''}` : ''}{rest}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, justifyContent: 'flex-end' }}>
                        {chip(s.source === 'news' ? (hostOf(s.url) || m.label) : m.label)}
                        {s.constituency && chip(s.constituency)}
                        {badge(sb.color, sb.text)}
                        {badge(sv.color, sv.text)}
                        <span style={{ fontSize: 10.5, color: 'var(--text-muted)', minWidth: 22, textAlign: 'right' }}>{ago(s.created_at)}</span>
                      </div>
                      {media && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={media} alt="" style={{ width: 70, height: 40, objectFit: 'cover', borderRadius: 7, flexShrink: 0, background: 'var(--bg-hover)' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      )}
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

          {/* ── analytics row: keyword tiles | stacked sentiment | mood by region (reference design) ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12, alignItems: 'stretch' }}>
            {/* Top Trending Keywords - tile grid */}
            <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-primary)' }}>Top Trending Keywords</span>
                <MdInfoOutline size={13} color="var(--text-muted)" />
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>View all keywords</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, flex: 1 }}>
                {d.keywords.slice(0, 8).map((k, i) => {
                  const prevN = Math.max(0, k.count - k.trend)
                  const pctT = prevN > 0 ? Math.round((k.trend / prevN) * 100) : (k.trend > 0 ? 100 : 0)
                  const cm = catMeta(k.category)
                  const rc = RANK_COLORS[i % RANK_COLORS.length]
                  return (
                    <div key={k.word} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 11, padding: '9px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 800, color: rc }}>{i + 1}</span>
                        <span style={{ width: 20, height: 20, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${cm.color}1f`, color: cm.color }}>{cm.icon}</span>
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.word}</div>
                        <div style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>{cm.label}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 4 }}>
                        <span>
                          <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{k.count}</span>
                          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}> signals</span>
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 9.5, fontWeight: 700, color: pctT >= 0 ? '#22c55e' : '#ef4444', whiteSpace: 'nowrap' }}>
                          {pctT >= 0 ? '▲' : '▼'} {pctT >= 0 ? '+' : ''}{pctT}%<span style={{ color: 'var(--text-muted)', fontWeight: 500 }}> vs last 7d</span>
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border-primary)' }}>
                <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Total unique keywords tracked <b style={{ color: 'var(--text-secondary)' }}>{d.keywordsTracked}</b></span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: 'var(--text-muted)' }}>Updated {d.updatedAt ? `${ago(d.updatedAt)} ago` : 'now'} <MdRefresh size={11} /></span>
              </div>
            </div>

            {/* Sentiment Over Time - KPI chips + stacked areas + tap-to-hide legend */}
            <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-primary)' }}>Sentiment Over Time</span>
                <MdInfoOutline size={13} color="var(--text-muted)" />
                <div style={{ flex: 1 }} />
                <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 8, padding: '4px 8px', fontSize: 11, fontWeight: 600 }}>
                  <option value={7}>7 Days</option><option value={14}>14 Days</option><option value={30}>30 Days</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 6, marginBottom: 10 }}>
                {([
                  ['Positive', d.totals.sentPositive, d.totals.prevSentPositive, '#22c55e', <MdMood key="p" size={15} />],
                  ['Neutral', d.totals.neutral, d.totals.prevNeutral, '#9ca3af', <MdSentimentNeutral key="n" size={15} />],
                  ['Negative', d.totals.negative, d.totals.prevNegative, '#ef4444', <MdMoodBad key="g" size={15} />],
                  ['Total Signals', d.totals.signals, d.totals.prevSignals, '#3b82f6', <MdStackedLineChart key="t" size={15} />],
                ] as const).map(([label, val, prevV, color, icon]) => {
                  const dl = pct(val as number, prevV as number)
                  return (
                    <div key={label as string} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: '7px 9px' }}>
                      <span style={{ width: 24, height: 24, borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${color}1f`, color: color as string, flexShrink: 0 }}>{icon}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>{(val as number).toLocaleString('en-IN')}</span>
                          <span style={{ fontSize: 9, fontWeight: 700, color: dl >= 0 ? '#22c55e' : '#ef4444' }}>{dl >= 0 ? '▲' : '▼'} {Math.abs(dl)}%</span>
                        </div>
                        <div style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>{label}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div style={{ position: 'relative', flex: 1 }}>
                <StackedSentiment series={d.dailySeries} hidden={hiddenSeries} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', flex: 1 }}>Tap on legend to show / hide</span>
                {([['pos', 'Positive', '#22c55e'], ['neutral', 'Neutral', '#9ca3af'], ['neg', 'Negative', '#ef4444']] as const).map(([key, label, color]) => {
                  const off = hiddenSeries.has(key)
                  return (
                    <button key={key} onClick={() => setHiddenSeries((prev) => { const nx = new Set(prev); if (nx.has(key)) nx.delete(key); else nx.add(key); return nx })}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 16, padding: '4px 11px', fontSize: 10.5, fontWeight: 600, cursor: 'pointer', color: off ? 'var(--text-muted)' : 'var(--text-primary)', opacity: off ? 0.55 : 1 }}>
                      <span style={{ width: 7, height: 7, borderRadius: 7, background: color }} />{label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Mood by Region - mini map + score list */}
            <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-primary)' }}>Mood by Region</span>
                <MdInfoOutline size={13} color="var(--text-muted)" />
                <div style={{ flex: 1 }} />
                <a href="/war-room" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', textDecoration: 'none' }}>View on map →</a>
              </div>
              {(() => {
                const rows = d.moodBySeat.filter((m) => m.total >= 5).map((m) => {
                  const t = m.total || 1
                  return { ...m, score: Math.round(((m.pos * 1 + m.neutral * 0.5) / t) * 100) }
                }).sort((a, b) => b.score - a.score).slice(0, 8)
                const scoreColor = (v: number) => (v >= 70 ? '#22c55e' : v >= 45 ? '#f59e0b' : '#ef4444')
                return (
                  <>
                    <div style={{ display: 'flex', gap: 10, flex: 1, minHeight: 0 }}>
                      <div style={{ flex: '0 0 42%', minWidth: 0 }}>
                        <MoodMiniMap seats={rows.map((r) => ({ constituency: r.constituency, score: r.score }))} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(60px, 1fr) 44px minmax(60px, 1fr)', gap: 6, fontSize: 9.5, color: 'var(--text-muted)', fontWeight: 600, paddingBottom: 5, borderBottom: '1px solid var(--border-primary)' }}>
                          <span>Region</span><span>Mood Score</span><span>Sentiment Mix</span>
                        </div>
                        {rows.map((m, i) => {
                          const t = m.total || 1
                          const negP = Math.round((m.neg / t) * 100); const posP = Math.round((m.pos / t) * 100); const neuP = Math.max(0, 100 - negP - posP)
                          return (
                            <div key={m.constituency} style={{ display: 'grid', gridTemplateColumns: 'minmax(60px, 1fr) 44px minmax(60px, 1fr)', gap: 6, alignItems: 'center', padding: '6px 0', borderBottom: i < rows.length - 1 ? '1px solid var(--border-primary)' : 'none' }}>
                              <span title={`${m.total} signals`} style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.constituency}</span>
                              <span style={{ fontSize: 10, fontWeight: 800, textAlign: 'center', color: '#0b0d12', background: scoreColor(m.score), borderRadius: 5, padding: '2px 0' }}>{m.score}</span>
                              <div style={{ display: 'flex', height: 6, borderRadius: 4, overflow: 'hidden', background: 'var(--bg-hover)', gap: 1 }}>
                                {posP > 0 && <div style={{ width: `${posP}%`, background: '#16a34a', borderRadius: 3 }} />}
                                {neuP > 0 && <div style={{ width: `${neuP}%`, background: '#4b5563', borderRadius: 3 }} />}
                                {negP > 0 && <div style={{ width: `${negP}%`, background: '#dc2626', borderRadius: 3 }} />}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, paddingTop: 7, borderTop: '1px solid var(--border-primary)', flexWrap: 'wrap' }}>
                      {([['Positive', '#22c55e'], ['Neutral', '#9ca3af'], ['Negative', '#ef4444']] as const).map(([l, c]) => (
                        <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-secondary)' }}>
                          <span style={{ width: 7, height: 7, borderRadius: 7, background: c }} />{l}
                        </span>
                      ))}
                      <span style={{ flex: 1 }} />
                      <span style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>Mood Score = (Positive x 1) + (Neutral x 0.5) + (Negative x 0)</span>
                    </div>
                  </>
                )
              })()}
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
                  const media = mediaOf(s)
                  const isVideo = !!ytThumb(s.url) || s.source === 'youtube'
                  const outlet = s.source === 'news' ? (s.author || hostOf(s.url) || m.label) : m.label
                  const card = (
                    <div style={{ flex: '0 0 240px', width: 240, background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                      {media && (
                        <div style={{ position: 'relative', height: 100, background: 'var(--bg-hover)' }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={media} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none' }} />
                          {isVideo && (
                            <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ width: 34, height: 34, borderRadius: 34, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, paddingLeft: 3 }}>▶</span>
                            </span>
                          )}
                          <span style={{ position: 'absolute', top: 8, right: 8 }}>{s.is_crisis && badge('#ef4444', 'Crisis')}</span>
                        </div>
                      )}
                      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <SourceGlyph s={s} size={22} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{outlet}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{ago(s.created_at)}</span>
                        </div>
                        <p style={{ fontSize: 11.5, lineHeight: 1.4, color: media ? 'var(--text-secondary)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: media ? 2 : 5, WebkitBoxOrient: 'vertical', flex: 1 }}>{s.source === 'news' ? s.content.replace(/\s[-–|]\s[^-–|]{2,60}$/, '') : s.content}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          {!media && s.is_crisis && badge('#ef4444', 'Crisis')}
                          {s.constituency && chip(s.constituency)}
                          {s.issue_category && chip(cap(s.issue_category))}
                        </div>
                      </div>
                    </div>
                  )
                  return s.url
                    ? <a key={i} href={s.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', display: 'flex' }}>{card}</a>
                    : <React.Fragment key={i}>{card}</React.Fragment>
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
