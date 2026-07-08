'use client'

// PROXE LISTEN — "Listen first, engage better." The GI/PI + comms team's
// sentiment board: trending issues, crisis alerts, source mix, mood by seat.
// Reads GET /api/dashboard/listen (signals land via POST /api/agent/listen/log
// from WhatsApp-scan / call-centre / volunteer / future scraper bridges).

import React, { useEffect, useState } from 'react'
import { MdSensors, MdWarning, MdTrendingUp, MdTrendingDown, MdRefresh } from 'react-icons/md'

interface Digest {
  totals: { signals: number; crisis: number; opposition: number; positive: number }
  trendingIssues: { category: string; count: number; prev: number; trend: number }[]
  crisisAlerts: { content: string; source: string; url?: string; constituency: string | null; severity: number; created_at: string }[]
  bySource: { source: string; count: number }[]
  moodBySeat: { constituency: string; pos: number; neg: number; neutral: number }[]
  windowDays: number
}

const ago = (iso: string) => {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`
}
const cap = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

export default function ListenPage() {
  const [d, setD] = useState<Digest | null>(null)
  const [days, setDays] = useState(7)
  const [loading, setLoading] = useState(true)

  const load = React.useCallback(() => {
    setLoading(true)
    fetch(`/api/dashboard/listen?days=${days}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j && !j.error) setD(j) })
      .finally(() => setLoading(false))
  }, [days])
  useEffect(() => { load() }, [load])

  const Stat = ({ label, value, color }: { label: string; value: number; color?: string }) => (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: color || 'var(--text-primary)', lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>{label}</div>
    </div>
  )

  return (
    <div className="dashboard-listen-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-hover)', color: 'var(--accent-primary)' }}><MdSensors size={20} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>PROXe Listen</h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Listen first, engage better — signals across social, news, WhatsApp, call centre & the field.</p>
        </div>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 9, padding: '7px 10px', fontSize: 12 }}>
          <option value={7}>7 days</option>
          <option value={14}>14 days</option>
          <option value={30}>30 days</option>
        </select>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--bg-hover)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 9, padding: '7px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}><MdRefresh size={15} /> Refresh</button>
      </div>

      {!d || d.totals.signals === 0 ? (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
          {loading ? 'Loading signals…' : 'No signals in this window yet. Bridges (WhatsApp media scan, call centre, volunteer reports, scrapers) POST to /api/agent/listen/log — once they feed, this board comes alive.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            <Stat label="Signals" value={d.totals.signals} />
            <Stat label="Crisis" value={d.totals.crisis} color={d.totals.crisis ? '#ef4444' : undefined} />
            <Stat label="Opposition" value={d.totals.opposition} color={d.totals.opposition ? '#f59e0b' : undefined} />
            <Stat label="Positive" value={d.totals.positive} color="#22c55e" />
          </div>

          {d.crisisAlerts.length > 0 && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#ef4444', marginBottom: 8 }}><MdWarning size={16} /> CRISIS ALERTS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {d.crisisAlerts.map((a, i) => (
                  <div key={i} style={{ fontSize: 12.5, color: 'var(--text-primary)' }}>
                    {a.content}
                    <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}> — {cap(a.source)}{a.constituency ? ` · ${a.constituency}` : ''} · sev {a.severity} · {ago(a.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: 'var(--text-primary)' }}>Trending Issues</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {d.trendingIssues.slice(0, 8).map((t) => {
                  const max = Math.max(...d.trendingIssues.map((x) => x.count), 1)
                  return (
                    <div key={t.category} style={{ display: 'grid', gridTemplateColumns: '96px 1fr 52px', alignItems: 'center', gap: 8, fontSize: 12 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{cap(t.category)}</span>
                      <div style={{ height: 8, background: 'var(--bg-hover)', borderRadius: 4, overflow: 'hidden' }}><div style={{ width: `${(t.count / max) * 100}%`, height: '100%', background: 'var(--accent-primary)', borderRadius: 4 }} /></div>
                      <span style={{ textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
                        <b>{t.count}</b>
                        {t.trend !== 0 && (t.trend > 0 ? <MdTrendingUp size={13} color="#22c55e" /> : <MdTrendingDown size={13} color="#ef4444" />)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: 'var(--text-primary)' }}>Signal Sources</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {d.bySource.map((s) => (
                  <span key={s.source} style={{ fontSize: 12, padding: '5px 10px', borderRadius: 20, background: 'var(--bg-hover)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)' }}>{cap(s.source)} <b>{s.count}</b></span>
                ))}
              </div>
              {d.moodBySeat.length > 0 && (
                <>
                  <div style={{ fontSize: 13, fontWeight: 700, margin: '16px 0 8px', color: 'var(--text-primary)' }}>Mood by Constituency</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {d.moodBySeat.slice(0, 8).map((m) => {
                      const total = m.pos + m.neg + m.neutral || 1
                      return (
                        <div key={m.constituency} style={{ fontSize: 11 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}><span>{m.constituency}</span><span>{total}</span></div>
                          <div style={{ display: 'flex', height: 7, borderRadius: 4, overflow: 'hidden', background: 'var(--bg-hover)', marginTop: 2 }}>
                            <div style={{ width: `${(m.pos / total) * 100}%`, background: '#22c55e' }} />
                            <div style={{ width: `${(m.neutral / total) * 100}%`, background: '#9ca3af' }} />
                            <div style={{ width: `${(m.neg / total) * 100}%`, background: '#ef4444' }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
