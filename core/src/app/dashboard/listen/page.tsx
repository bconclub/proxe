'use client'

// PROXE LISTEN - "Listen first, engage better." The GI/PI + comms team's
// sentiment command board: heat score, what PROXe thinks, recommended actions,
// signal inbox, source mix, trending keywords, sentiment-over-time, mood by
// region, evidence board. Reads GET /api/dashboard/listen; signals land via
// POST /api/agent/listen/log and the RSS source fetcher.

import React, { useEffect, useState } from 'react'
import {
  MdSensors, MdWarning, MdTrendingUp, MdTrendingDown, MdRefresh, MdBolt,
  MdInsights, MdLightbulb, MdOpenInNew, MdTag, MdThumbUp, MdCameraAlt,
  MdSmartDisplay, MdNewspaper, MdChat, MdReportProblem, MdHeadsetMic,
  MdVolunteerActivism, MdPoll, MdCampaign,
} from 'react-icons/md'

// ── types ──
interface Signal {
  content: string; source: string; url: string | null
  sentiment: string | null; issue_category: string | null; constituency: string | null
  severity: number; is_crisis: boolean; is_opposition: boolean; is_positive: boolean
  created_at: string
}
interface Seat { constituency: string; district: string | null; pos: number; neg: number; neutral: number; total: number; net: number; heat: number }
interface Digest {
  totals: { signals: number; crisis: number; opposition: number; positive: number; negative: number; neutral: number; prevSignals: number; trendSignals: number }
  heatScore: number; heatLabel: string; prevHeat: number
  whatProxeThinks: { heat: number; label: string; delta: number; text: string }
  recommendedActions: { title: string; detail: string; kind: string }[]
  trendingIssues: { category: string; count: number; prev: number; trend: number }[]
  keywords: { word: string; count: number }[]
  crisisAlerts: { content: string; source: string; url?: string; constituency: string | null; severity: number; created_at: string }[]
  recentSignals: Signal[]
  dailySeries: { day: string; pos: number; neg: number; neutral: number; total: number }[]
  bySource: { source: string; count: number }[]
  moodBySeat: Seat[]
  windowDays: number
}
interface Source {
  id: string; name: string; type: string; url: string | null
  constituency: string | null; issue_category: string | null
  active: boolean; last_fetched_at: string | null; last_item_count: number
}

// ── helpers ──
const ago = (iso: string) => {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`
}
const cap = (s: string) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
const CATEGORIES = ['jobs', 'water', 'power', 'roads', 'drugs', 'farm_debt', 'health', 'education', 'other']

const SENT = { positive: '#22c55e', negative: '#ef4444', neutral: '#9ca3af' } as Record<string, string>
const heatColor = (h: number) => (h >= 75 ? '#ef4444' : h >= 55 ? '#f97316' : h >= 30 ? '#f59e0b' : '#22c55e')

// source → icon + tint + label
const SRC: Record<string, { Icon: any; c: string; label: string }> = {
  twitter: { Icon: MdTag, c: '#1d9bf0', label: 'X / Twitter' },
  facebook: { Icon: MdThumbUp, c: '#1877f2', label: 'Facebook' },
  instagram: { Icon: MdCameraAlt, c: '#e1306c', label: 'Instagram' },
  youtube: { Icon: MdSmartDisplay, c: '#ff0000', label: 'YouTube' },
  news: { Icon: MdNewspaper, c: '#f59e0b', label: 'News' },
  whatsapp_trend: { Icon: MdChat, c: '#25d366', label: 'WhatsApp' },
  complaint: { Icon: MdReportProblem, c: '#ef4444', label: 'Complaint' },
  call_centre: { Icon: MdHeadsetMic, c: '#8b5cf6', label: 'Call Centre' },
  volunteer_report: { Icon: MdVolunteerActivism, c: '#06b6d4', label: 'Volunteer' },
  survey: { Icon: MdPoll, c: '#a3a3a3', label: 'Survey' },
}
const srcMeta = (s: string) => SRC[s] || { Icon: MdSensors, c: 'var(--accent-primary)', label: cap(s) }

// ── small UI atoms ──
const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties; pad?: number }> = ({ children, style, pad = 16 }) => (
  <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 14, padding: pad, ...style }}>{children}</div>
)
const CardTitle: React.FC<{ icon?: any; children: React.ReactNode; right?: React.ReactNode }> = ({ icon: Icon, children, right }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
    {Icon && <Icon size={16} color="var(--text-secondary)" />}
    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{children}</span>
    <div style={{ flex: 1 }} />
    {right}
  </div>
)

// Heat gauge ring (SVG)
const HeatGauge: React.FC<{ score: number; label: string; delta: number }> = ({ score, label, delta }) => {
  const r = 56, circ = 2 * Math.PI * r, fill = (score / 100) * circ, col = heatColor(score)
  return (
    <div style={{ position: 'relative', width: 148, height: 148, flexShrink: 0 }}>
      <svg width={148} height={148} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={74} cy={74} r={r} fill="none" stroke="var(--bg-hover)" strokeWidth={12} />
        <circle cx={74} cy={74} r={r} fill="none" stroke={col} strokeWidth={12} strokeLinecap="round"
          strokeDasharray={`${fill} ${circ}`} style={{ filter: `drop-shadow(0 0 6px ${col}66)`, transition: 'stroke-dasharray .6s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 40, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{score}</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: col, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 3 }}>{label}</div>
        {delta !== 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10.5, color: delta > 0 ? '#ef4444' : '#22c55e', marginTop: 2 }}>
            {delta > 0 ? <MdTrendingUp size={12} /> : <MdTrendingDown size={12} />}{Math.abs(delta)} vs prev
          </div>
        )}
      </div>
    </div>
  )
}

export default function ListenPage() {
  const [d, setD] = useState<Digest | null>(null)
  const [days, setDays] = useState(7)
  const [loading, setLoading] = useState(true)
  const [inboxFilter, setInboxFilter] = useState<'all' | 'crisis' | 'opposition' | 'positive'>('all')
  // Sources
  const [sources, setSources] = useState<Source[]>([])
  const [showSources, setShowSources] = useState(false)
  const [adding, setAdding] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [form, setForm] = useState({ name: '', url: '', issue_category: '' })

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

  const t = d?.totals
  const inbox = (d?.recentSignals || []).filter((s) =>
    inboxFilter === 'all' ? true : inboxFilter === 'crisis' ? s.is_crisis : inboxFilter === 'opposition' ? s.is_opposition : s.is_positive)
  const maxDay = Math.max(1, ...(d?.dailySeries || []).map((x) => x.total))
  const maxKw = Math.max(1, ...(d?.keywords || []).map((k) => k.count))

  return (
    <div className="dashboard-listen-page" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ width: 38, height: 38, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#6d28d9,#db2777)', color: '#fff' }}><MdSensors size={21} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>PROXe Listen</h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Listen first, engage better. Signals across social, news, WhatsApp, call centre and the field.</p>
        </div>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 9, padding: '7px 10px', fontSize: 12 }}>
          <option value={7}>7 days</option>
          <option value={14}>14 days</option>
          <option value={30}>30 days</option>
        </select>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--bg-hover)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 9, padding: '7px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}><MdRefresh size={15} /> Refresh</button>
        <button onClick={() => setShowSources((v) => !v)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--bg-hover)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 9, padding: '7px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Sources ({sources.length})</button>
      </div>

      {/* ── SOURCES (collapsible) ── */}
      {showSources && (
        <Card pad={14}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Sources <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)' }}>({sources.length}) · {sources.filter((s) => s.active).length} active</span></span>
            <div style={{ flex: 1 }} />
            <button onClick={() => setAdding((v) => !v)} style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 8, padding: '6px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>+ Add source</button>
            <button onClick={fetchNow} disabled={fetching} style={{ background: fetching ? 'var(--bg-hover)' : 'var(--accent-primary)', color: fetching ? 'var(--text-muted)' : '#fff', border: 'none', borderRadius: 8, padding: '6px 11px', fontSize: 12, fontWeight: 700, cursor: fetching ? 'default' : 'pointer' }}>{fetching ? 'Fetching…' : 'Fetch now'}</button>
          </div>
          {adding && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12, padding: 10, background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 8 }}>
              <input placeholder="Source name (e.g. Tribune Punjab)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ flex: '1 1 160px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 7, padding: '7px 9px', fontSize: 12 }} />
              <input placeholder="RSS feed URL" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} style={{ flex: '2 1 260px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 7, padding: '7px 9px', fontSize: 12 }} />
              <select value={form.issue_category} onChange={(e) => setForm({ ...form, issue_category: e.target.value })} style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 7, padding: '7px 9px', fontSize: 12 }}>
                <option value="">Auto-tag issue</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{cap(c)}</option>)}
              </select>
              <button onClick={addSource} style={{ background: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 13px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Add</button>
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
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{s.type.toUpperCase()}{s.issue_category ? ` · ${cap(s.issue_category)}` : ''}{s.last_fetched_at ? ` · ${s.last_item_count} items · ${ago(s.last_fetched_at)} ago` : ' · never fetched'}</div>
                  </div>
                  <button onClick={() => deleteSource(s)} title="Remove source" style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 15, lineHeight: 1, flexShrink: 0 }}>×</button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {!d || !t || t.signals === 0 ? (
        <Card pad={40} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          {loading ? 'Loading signals…' : 'No signals in this window yet. Add sources and Fetch now, or let the bridges (WhatsApp scan, call centre, volunteer reports) feed /api/agent/listen/log.'}
        </Card>
      ) : (
        <>
          {/* ── HERO: heat gauge + What PROXe thinks ── */}
          <Card pad={0} style={{ overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 0 }}>
              <div style={{ display: 'flex', gap: 20, padding: 18, flexWrap: 'wrap', alignItems: 'center', background: `radial-gradient(1200px 200px at 0% 0%, ${heatColor(d.heatScore)}14, transparent)` }}>
                <HeatGauge score={d.heatScore} label={d.heatLabel} delta={d.whatProxeThinks.delta} />
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <MdInsights size={15} color="var(--accent-primary)" />
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>What PROXe thinks</span>
                  </div>
                  <p style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--text-primary)', margin: 0 }}>{d.whatProxeThinks.text}</p>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    <Pill c="#ef4444" label="Crisis" v={t.crisis} />
                    <Pill c="#f59e0b" label="Opposition" v={t.opposition} />
                    <Pill c="#22c55e" label="Positive" v={t.positive} />
                    <Pill c="#9ca3af" label="Negative" v={t.negative} />
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* ── STAT CARDS ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <Stat label="Signals" value={t.signals} sub={`${t.trendSignals >= 0 ? '+' : ''}${t.trendSignals} vs prev`} subColor={t.trendSignals >= 0 ? '#22c55e' : '#ef4444'} accent="#8b5cf6" />
            <Stat label="Crisis" value={t.crisis} sub="need response" subColor="#ef4444" accent="#ef4444" />
            <Stat label="Opposition" value={t.opposition} sub="rebuttal watch" subColor="#f59e0b" accent="#f59e0b" />
            <Stat label="Positive" value={t.positive} sub="amplify" subColor="#22c55e" accent="#22c55e" />
            <Stat label="Sources" value={d.bySource.length} sub={`${sources.filter((s) => s.active).length} feeds live`} subColor="var(--text-secondary)" accent="#06b6d4" />
          </div>

          {/* ── crisis banner ── */}
          {d.crisisAlerts.length > 0 && (
            <Card pad={14} style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#ef4444', marginBottom: 8 }}><MdWarning size={16} /> CRISIS ALERTS · {d.crisisAlerts.length}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {d.crisisAlerts.slice(0, 4).map((a, i) => (
                  <div key={i} style={{ fontSize: 12.5, color: 'var(--text-primary)' }}>
                    {a.content}
                    <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}> · {srcMeta(a.source).label}{a.constituency ? ` · ${a.constituency}` : ''} · sev {a.severity} · {ago(a.created_at)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* ── MAIN GRID: inbox (2fr) | right rail (1fr) ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }} className="listen-main-grid">
            {/* Signal inbox */}
            <Card>
              <CardTitle icon={MdSensors} right={
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['all', 'crisis', 'opposition', 'positive'] as const).map((f) => (
                    <button key={f} onClick={() => setInboxFilter(f)} style={{ fontSize: 11, fontWeight: 600, padding: '4px 9px', borderRadius: 7, cursor: 'pointer', border: '1px solid var(--border-primary)', background: inboxFilter === f ? 'var(--accent-primary)' : 'transparent', color: inboxFilter === f ? '#fff' : 'var(--text-secondary)' }}>{cap(f)}</button>
                  ))}
                </div>
              }>Signal Inbox</CardTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 560, overflowY: 'auto' }}>
                {inbox.length === 0 ? <p style={{ fontSize: 12, color: 'var(--text-secondary)', padding: 8 }}>No signals match this filter.</p> :
                  inbox.map((s, i) => {
                    const m = srcMeta(s.source)
                    const sc = s.sentiment ? SENT[s.sentiment] : 'var(--text-muted)'
                    return (
                      <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 8px', borderBottom: '1px solid var(--border-primary)' }}>
                        <span style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${m.c}1f`, color: m.c }}><m.Icon size={16} /></span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, color: 'var(--text-primary)', lineHeight: 1.4 }}>{s.content}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap', fontSize: 10.5, color: 'var(--text-muted)' }}>
                            <span style={{ color: m.c, fontWeight: 600 }}>{m.label}</span>
                            {s.constituency && <span>· {s.constituency}</span>}
                            {s.issue_category && <span style={{ padding: '1px 6px', borderRadius: 5, background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>{cap(s.issue_category)}</span>}
                            {s.sentiment && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><span style={{ width: 6, height: 6, borderRadius: 6, background: sc }} />{cap(s.sentiment)}</span>}
                            {s.is_crisis && <span style={{ color: '#ef4444', fontWeight: 700 }}>CRISIS</span>}
                            {s.is_opposition && <span style={{ color: '#f59e0b', fontWeight: 700 }}>OPP</span>}
                            <span>· {ago(s.created_at)}</span>
                            {s.url && <a href={s.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-primary)', display: 'inline-flex', alignItems: 'center' }}><MdOpenInNew size={12} /></a>}
                          </div>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </Card>

            {/* Right rail */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Recommended actions */}
              <Card>
                <CardTitle icon={MdLightbulb}>Recommended Actions</CardTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {d.recommendedActions.length === 0 ? <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>All quiet. No urgent actions.</p> :
                    d.recommendedActions.map((a, i) => {
                      const kc = a.kind === 'crisis' ? '#ef4444' : a.kind === 'opposition' ? '#f59e0b' : a.kind === 'positive' ? '#22c55e' : a.kind === 'seat' ? '#f97316' : '#8b5cf6'
                      return (
                        <div key={i} style={{ display: 'flex', gap: 9, padding: '9px 10px', borderRadius: 10, background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderLeft: `3px solid ${kc}` }}>
                          <MdBolt size={15} color={kc} style={{ flexShrink: 0, marginTop: 1 }} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{a.title}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>{a.detail}</div>
                          </div>
                        </div>
                      )
                    })}
                </div>
              </Card>

              {/* Source mix */}
              <Card>
                <CardTitle icon={MdCampaign}>Source Mix</CardTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {d.bySource.map((s) => {
                    const m = srcMeta(s.source); const max = Math.max(...d.bySource.map((x) => x.count), 1)
                    return (
                      <div key={s.source} style={{ display: 'grid', gridTemplateColumns: '20px 92px 1fr 34px', alignItems: 'center', gap: 8 }}>
                        <m.Icon size={15} color={m.c} />
                        <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.label}</span>
                        <div style={{ height: 7, background: 'var(--bg-hover)', borderRadius: 4, overflow: 'hidden' }}><div style={{ width: `${(s.count / max) * 100}%`, height: '100%', background: m.c, borderRadius: 4 }} /></div>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'right' }}>{s.count}</span>
                      </div>
                    )
                  })}
                </div>
              </Card>

              {/* Trending keywords */}
              <Card>
                <CardTitle icon={MdTag}>Trending Keywords</CardTitle>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {d.keywords.map((k) => {
                    const f = k.count / maxKw
                    return (
                      <span key={k.word} style={{ fontSize: 11 + Math.round(f * 6), fontWeight: 500 + Math.round(f * 3) * 100, padding: '4px 10px', borderRadius: 20, background: `rgba(139,92,246,${0.08 + f * 0.22})`, border: '1px solid rgba(139,92,246,0.25)', color: 'var(--text-primary)' }}>
                        {k.word} <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{k.count}</span>
                      </span>
                    )
                  })}
                </div>
              </Card>
            </div>
          </div>

          {/* ── SENTIMENT OVER TIME + MOOD BY REGION ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }} className="listen-main-grid">
            {/* Sentiment over time */}
            <Card>
              <CardTitle icon={MdTrendingUp} right={
                <div style={{ display: 'flex', gap: 10, fontSize: 10.5, color: 'var(--text-secondary)' }}>
                  <Legend c={SENT.positive} label="Positive" /><Legend c={SENT.neutral} label="Neutral" /><Legend c={SENT.negative} label="Negative" />
                </div>
              }>Sentiment Over Time</CardTitle>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: d.dailySeries.length > 16 ? 2 : 6, height: 180, paddingTop: 8 }}>
                {d.dailySeries.map((day, i) => {
                  const h = (day.total / maxDay) * 150
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }} title={`${day.day}: ${day.total} signals (${day.pos}+ / ${day.neg}-)`}>
                      <div style={{ width: '100%', maxWidth: 34, height: 150, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', borderRadius: 5, overflow: 'hidden', background: 'var(--bg-hover)' }}>
                        {day.total > 0 && <>
                          <div style={{ height: `${(day.pos / day.total) * h}px`, background: SENT.positive }} />
                          <div style={{ height: `${(day.neutral / day.total) * h}px`, background: SENT.neutral }} />
                          <div style={{ height: `${(day.neg / day.total) * h}px`, background: SENT.negative }} />
                        </>}
                      </div>
                      {(d.dailySeries.length <= 16 || i % 2 === 0) && <span style={{ fontSize: 9, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{day.day}</span>}
                    </div>
                  )
                })}
              </div>
            </Card>

            {/* Mood by region (heat table) */}
            <Card>
              <CardTitle icon={MdWarning}>Mood by Region <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: 11 }}>hottest first</span></CardTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                {d.moodBySeat.slice(0, 12).map((m) => (
                  <div key={m.constituency} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 44px', alignItems: 'center', gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.constituency}</div>
                      {m.district && <div style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>{m.district}</div>}
                    </div>
                    <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: 'var(--bg-hover)' }}>
                      <div style={{ width: `${(m.pos / m.total) * 100}%`, background: SENT.positive }} />
                      <div style={{ width: `${(m.neutral / m.total) * 100}%`, background: SENT.neutral }} />
                      <div style={{ width: `${(m.neg / m.total) * 100}%`, background: SENT.negative }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 800, textAlign: 'right', color: heatColor(m.heat) }}>{m.heat}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* ── TRENDING ISSUES + EVIDENCE BOARD ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr)', gap: 16, alignItems: 'start' }} className="listen-main-grid">
            <Card>
              <CardTitle icon={MdTrendingUp}>Trending Issues</CardTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {d.trendingIssues.slice(0, 9).map((it) => {
                  const max = Math.max(...d.trendingIssues.map((x) => x.count), 1)
                  return (
                    <div key={it.category} style={{ display: 'grid', gridTemplateColumns: '86px 1fr 58px', alignItems: 'center', gap: 8, fontSize: 12 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{cap(it.category)}</span>
                      <div style={{ height: 8, background: 'var(--bg-hover)', borderRadius: 4, overflow: 'hidden' }}><div style={{ width: `${(it.count / max) * 100}%`, height: '100%', background: 'linear-gradient(90deg,#6d28d9,#db2777)', borderRadius: 4 }} /></div>
                      <span style={{ textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
                        <b style={{ color: 'var(--text-primary)' }}>{it.count}</b>
                        {it.trend !== 0 && (it.trend > 0 ? <MdTrendingUp size={13} color="#ef4444" /> : <MdTrendingDown size={13} color="#22c55e" />)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </Card>

            <Card>
              <CardTitle icon={MdNewspaper} right={<span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>latest evidence</span>}>Evidence Board</CardTitle>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                {d.recentSignals.slice(0, 8).map((s, i) => {
                  const m = srcMeta(s.source); const sc = s.sentiment ? SENT[s.sentiment] : 'var(--text-muted)'
                  return (
                    <div key={i} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderTop: `3px solid ${sc}`, borderRadius: 10, padding: 11 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <m.Icon size={14} color={m.c} />
                        <span style={{ fontSize: 10.5, fontWeight: 600, color: m.c }}>{m.label}</span>
                        <div style={{ flex: 1 }} />
                        <span style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>{ago(s.created_at)}</span>
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-primary)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{s.content}</div>
                      {s.constituency && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>{s.constituency}{s.issue_category ? ` · ${cap(s.issue_category)}` : ''}</div>}
                    </div>
                  )
                })}
              </div>
            </Card>
          </div>
        </>
      )}

      <style>{`@media (max-width: 900px){ .listen-main-grid{ grid-template-columns: minmax(0,1fr) !important; } }`}</style>
    </div>
  )
}

// ── extra atoms (defined after to keep the component readable) ──
const Pill: React.FC<{ c: string; label: string; v: number }> = ({ c, label, v }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, padding: '4px 9px', borderRadius: 8, background: `${c}14`, border: `1px solid ${c}33`, color: 'var(--text-primary)' }}>
    <span style={{ width: 7, height: 7, borderRadius: 7, background: c }} />{label} <b>{v}</b>
  </span>
)
const Stat: React.FC<{ label: string; value: number; sub?: string; subColor?: string; accent?: string }> = ({ label, value, sub, subColor, accent }) => (
  <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 14, padding: '14px 16px', position: 'relative', overflow: 'hidden' }}>
    <div style={{ position: 'absolute', top: 0, left: 0, width: 3, height: '100%', background: accent || 'var(--accent-primary)' }} />
    <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.05 }}>{value.toLocaleString()}</div>
    <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 3 }}>{label}</div>
    {sub && <div style={{ fontSize: 10.5, color: subColor || 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
  </div>
)
const Legend: React.FC<{ c: string; label: string }> = ({ c, label }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: c }} />{label}</span>
)
