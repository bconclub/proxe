'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MdVisibility, MdClose, MdRefresh } from 'react-icons/md'

/**
 * TodaySnapshotButton — top-right floating button that opens a quick-glance
 * popup showing today's activity (midnight IST → now). Designed for the
 * founder to click once and immediately see what happened today.
 */

interface SnapshotData {
  window: { startIso: string; endIso: string; label: string; range?: string }
  leads: { total: number; bySource: Record<string, number>; byType?: Record<string, number> }
  events: {
    pat_submitted: number
    demo_booked: number
    calls_logged: number
    agent_replies: number
  }
  scoreHistogram: { hot: number; warm: number; cold: number; unscored: number }
  topActive: Array<{ id: string; name: string; phone: string | null; score: number | null; messageCount: number }>
}

function formatHHMM(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
  } catch {
    return ''
  }
}

type RangeKey = 'today' | '7d' | '14d' | '28d'
const RANGE_OPTIONS: Array<{ key: RangeKey; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: '7d',    label: '7d' },
  { key: '14d',   label: '14d' },
  { key: '28d',   label: '28d' },
]

export default function TodaySnapshotButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<SnapshotData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<RangeKey>('today')

  async function fetchSnapshot(rangeArg: RangeKey = range) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/dashboard/today-snapshot?range=${rangeArg}`, { credentials: 'include' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || `Snapshot failed (${res.status})`)
      }
      setData(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load snapshot')
    } finally {
      setLoading(false)
    }
  }

  // Fetch on open + whenever range changes
  useEffect(() => {
    if (open) void fetchSnapshot(range)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, range])

  return (
    <>
      {/* Trigger — small icon-only button, top-right. No text label.
          User feedback: 'A button is too far away from the actual design.
          We can just have an eye button.' */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed z-[60] flex items-center justify-center rounded-full shadow-lg hover:opacity-90 transition"
        style={{
          top: '14px',
          right: '20px',
          width: '36px',
          height: '36px',
          background: '#C9A961',
          border: '1px solid rgba(255,255,255,0.6)',
          color: '#ffffff',
        }}
        aria-label="Open today's snapshot"
        title="Today's snapshot"
      >
        <MdVisibility size={18} />
      </button>

      {!open ? null : (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[70]"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          {/* Modal — centered on desktop */}
          <div
            role="dialog"
            aria-label="Today's snapshot"
            className="fixed z-[71] rounded-2xl border shadow-2xl flex flex-col"
            style={{
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 'min(720px, 94vw)',
              maxHeight: '88vh',
              background: 'var(--bg-secondary)',
              borderColor: 'var(--border-primary)',
              color: 'var(--text-primary)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className="flex items-center gap-2 px-3 py-2.5 border-b"
              style={{ borderColor: 'var(--border-primary)' }}
            >
              <MdVisibility size={16} style={{ color: '#C9A961' }} />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold leading-tight truncate">
                  {range === 'today' ? "Today's snapshot" : `Snapshot — ${data?.window?.label || 'Loading…'}`}
                </div>
                <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {range === 'today'
                    ? new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' })
                    : data?.window?.startIso
                      ? `Since ${new Date(data.window.startIso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}`
                      : '—'}
                </div>
              </div>

              {/* Range pills — segmented control */}
              <div
                role="tablist"
                aria-label="Time range"
                className="flex items-center rounded-full border overflow-hidden shrink-0"
                style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
              >
                {RANGE_OPTIONS.map((opt) => {
                  const active = range === opt.key
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setRange(opt.key)}
                      className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors"
                      style={{
                        color: active ? '#1a1a1a' : 'var(--text-secondary)',
                        background: active ? '#C9A961' : 'transparent',
                      }}
                      disabled={loading && active}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>

              <button
                type="button"
                onClick={() => fetchSnapshot()}
                className="p-1 rounded hover:opacity-80"
                title="Refresh"
                disabled={loading}
              >
                <MdRefresh size={14} className={loading ? 'animate-spin' : ''} />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:opacity-80"
                title="Close"
                aria-label="Close"
              >
                <MdClose size={14} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {error && (
                <div
                  className="px-2.5 py-1.5 rounded text-[11px]"
                  style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}
                >
                  {error}
                </div>
              )}

              {!data && loading && <SnapshotSkeleton range={range} />}

              {data && (
                <>
                  {/* Top KPI strip — 4 hero numbers across */}
                  <div className="grid grid-cols-4 gap-2 mb-1">
                    <KpiCell label="New leads" value={data.leads.total} accent="#C9A961" />
                    <KpiCell label="PAT done" value={data.events.pat_submitted} accent="#a5b4fc" />
                    <KpiCell label="Demos booked" value={data.events.demo_booked} accent="#22c55e" />
                    <KpiCell label="Agent replies" value={data.events.agent_replies} accent="#06b6d4" />
                  </div>

                  {/* 2-column grid: source + score / events + top active */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Source breakdown */}
                    <section
                      className="p-3 rounded-lg border"
                      style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
                    >
                      <SectionLabel>By source</SectionLabel>
                      {Object.keys(data.leads.bySource).length === 0 ? (
                        <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          No leads yet today.
                        </div>
                      ) : (
                        <ul className="space-y-1.5">
                          {Object.entries(data.leads.bySource)
                            .sort(([, a], [, b]) => b - a)
                            .map(([src, n]) => {
                              const pct = data.leads.total > 0 ? Math.round((n / data.leads.total) * 100) : 0
                              return (
                                <li key={src} className="flex items-center gap-2">
                                  <span className="text-[11px] font-medium flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{src}</span>
                                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: '#a5b4fc' }} />
                                  </div>
                                  <span className="text-[11px] font-semibold tabular-nums" style={{ color: 'var(--text-secondary)' }}>{n}</span>
                                </li>
                              )
                            })}
                        </ul>
                      )}

                      {/* Lead type — Parent vs Student */}
                      {data.leads.byType && (
                        <div className="mt-3 pt-2.5 border-t space-y-1" style={{ borderColor: 'var(--border-primary)' }}>
                          <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Lead type</p>
                          <div className="flex items-center justify-between">
                            <span className="text-[11px]" style={{ color: 'var(--text-primary)' }}>Parent</span>
                            <span className="text-[11px] font-semibold tabular-nums" style={{ color: '#a5b4fc' }}>{data.leads.byType.Parent || 0}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[11px]" style={{ color: 'var(--text-primary)' }}>Student</span>
                            <span className="text-[11px] font-semibold tabular-nums" style={{ color: '#22c55e' }}>{data.leads.byType.Student || 0}</span>
                          </div>
                        </div>
                      )}
                    </section>

                    {/* Score histogram */}
                    <section
                      className="p-3 rounded-lg border"
                      style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
                    >
                      <SectionLabel>Score distribution</SectionLabel>
                      <div className="space-y-1.5">
                        <ScoreRow label="Hot 70+" n={data.scoreHistogram.hot} color="#22c55e" total={data.leads.total} />
                        <ScoreRow label="Warm 40-69" n={data.scoreHistogram.warm} color="#f59e0b" total={data.leads.total} />
                        <ScoreRow label="Cold <40" n={data.scoreHistogram.cold} color="#ef4444" total={data.leads.total} />
                        <ScoreRow label="Unscored" n={data.scoreHistogram.unscored} color="#6b7280" total={data.leads.total} />
                      </div>
                    </section>

                    {/* Activity events detail */}
                    <section
                      className="p-3 rounded-lg border"
                      style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
                    >
                      <SectionLabel>Activity</SectionLabel>
                      <div className="grid grid-cols-2 gap-1.5">
                        <EventCell label="PAT submitted" value={data.events.pat_submitted} />
                        <EventCell label="Demos booked" value={data.events.demo_booked} />
                        <EventCell label="Agent replies" value={data.events.agent_replies} />
                        <EventCell label="Calls logged" value={data.events.calls_logged} />
                      </div>
                    </section>

                    {/* Top active leads */}
                    <section
                      className="p-3 rounded-lg border"
                      style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
                    >
                      <SectionLabel>{range === 'today' ? 'Most active today' : 'Most active'}</SectionLabel>
                      {data.topActive.length === 0 ? (
                        <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          No customer messages yet today.
                        </div>
                      ) : (
                        <ul className="space-y-1">
                          {data.topActive.slice(0, 4).map((l) => (
                            <li key={l.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  setOpen(false)
                                  router.push(`/dashboard/inbox?lead=${l.id}`)
                                }}
                                className="w-full text-left p-1.5 rounded-md hover:opacity-90 transition flex items-center gap-2"
                                style={{ background: 'rgba(255,255,255,0.03)' }}
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="text-[11px] font-semibold truncate">{l.name}</div>
                                  <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                                    {l.phone || '—'} · score {l.score == null ? '—' : l.score}
                                  </div>
                                </div>
                                <span
                                  className="text-[9px] font-medium px-1.5 py-0.5 rounded shrink-0"
                                  style={{ background: 'rgba(201,169,97,0.18)', color: '#C9A961' }}
                                >
                                  {l.messageCount} msg
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}

function KpiCell({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div
      className="px-2.5 py-2 rounded-lg border flex flex-col items-start"
      style={{
        background: `${accent}10`,
        borderColor: `${accent}40`,
      }}
    >
      <span className="text-[22px] font-bold leading-none tabular-nums" style={{ color: accent }}>{value}</span>
      <span className="text-[9px] mt-1 uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>{label}</span>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[10px] font-semibold uppercase tracking-wider mb-2"
      style={{ color: 'var(--text-muted)' }}
    >
      {children}
    </div>
  )
}

function ScoreRow({ label, n, color, total }: { label: string; n: number; color: string; total: number }) {
  const pct = total > 0 ? Math.round((n / total) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-medium w-[80px] shrink-0" style={{ color }}>{label}</span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[11px] font-semibold tabular-nums" style={{ color: 'var(--text-secondary)' }}>{n}</span>
    </div>
  )
}

function EventCell({ label, value }: { label: string; value: number }) {
  return (
    <div
      className="px-2.5 py-1.5 rounded-md flex items-center justify-between"
      style={{ background: 'rgba(255,255,255,0.03)' }}
    >
      <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span className="text-[13px] font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}

function ScorePill({ label, n, color }: { label: string; n: number; color: string }) {
  return (
    <span
      className="text-[10px] font-medium px-2 py-0.5 rounded-full border"
      style={{ background: `${color}1f`, borderColor: `${color}66`, color }}
    >
      {label}: {n}
    </span>
  )
}

/**
 * Full-layout skeleton for the snapshot modal — mirrors the final shape
 * (4-KPI strip + 2×2 section grid) so the modal "expands into" the real
 * data instead of jumping from a tiny "Loading…" box. A rotating status
 * line at the bottom tells the user what's being fetched so the wait
 * feels intentional rather than stalled.
 */
function SnapshotSkeleton({ range }: { range: RangeKey }) {
  // Status messages cycle every 700ms while loading. Picked to match what
  // the snapshot endpoint actually does in order — see /api/dashboard/
  // today-snapshot/route.ts (leads → events → score histogram → top active).
  const MESSAGES: Record<RangeKey, string[]> = {
    today: [
      "Pulling today's leads…",
      'Counting PAT submissions & demos booked…',
      'Sorting by lead score…',
      'Ranking most active conversations…',
    ],
    '7d': [
      'Pulling leads from the last 7 days…',
      'Counting PAT submissions & demos booked…',
      'Sorting by lead score…',
      'Ranking most active conversations…',
    ],
    '14d': [
      'Pulling leads from the last 14 days…',
      'Counting PAT submissions & demos booked…',
      'Sorting by lead score…',
      'Ranking most active conversations…',
    ],
    '28d': [
      'Pulling leads from the last 28 days…',
      'Counting PAT submissions & demos booked…',
      'Sorting by lead score…',
      'Ranking most active conversations…',
    ],
  }
  const messages = MESSAGES[range] || MESSAGES.today
  const [msgIdx, setMsgIdx] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setMsgIdx((i) => (i + 1) % messages.length), 700)
    return () => clearInterval(id)
  }, [messages.length])

  // Shared pulse box — uses bg-tokens so it works in both themes.
  const SkelBox = ({ className = '', style = {} }: { className?: string; style?: React.CSSProperties }) => (
    <div
      className={`animate-pulse rounded ${className}`}
      style={{ background: 'rgba(255,255,255,0.06)', ...style }}
    />
  )

  return (
    <>
      {/* KPI strip — 4 cells matching real layout */}
      <div className="grid grid-cols-4 gap-2 mb-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="px-2.5 py-2 rounded-lg border flex flex-col items-start"
            style={{
              background: 'rgba(255,255,255,0.02)',
              borderColor: 'var(--border-primary)',
            }}
          >
            <SkelBox className="h-6 w-10 mb-2" />
            <SkelBox className="h-2 w-16" />
          </div>
        ))}
      </div>

      {/* 2×2 section grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((sec) => (
          <section
            key={sec}
            className="p-3 rounded-lg border"
            style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
          >
            <SkelBox className="h-2.5 w-20 mb-3" />
            <div className="space-y-2">
              {[0, 1, 2, 3].map((row) => (
                <div key={row} className="flex items-center gap-2">
                  <SkelBox className="h-2.5 flex-1" />
                  <SkelBox className="h-2.5 w-6" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Rotating status line — the "what's happening" hint */}
      <div className="flex items-center justify-center gap-2 pt-3 pb-1" aria-live="polite">
        <span
          className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
          style={{ background: '#C9A961' }}
          aria-hidden="true"
        />
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {messages[msgIdx]}
        </span>
      </div>
    </>
  )
}
