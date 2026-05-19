'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MdToday, MdClose, MdRefresh } from 'react-icons/md'

/**
 * TodaySnapshotButton — top-right floating button that opens a quick-glance
 * popup showing today's activity (midnight IST → now). Designed for the
 * founder to click once and immediately see what happened today.
 */

interface SnapshotData {
  window: { startIso: string; endIso: string; label: string }
  leads: { total: number; bySource: Record<string, number> }
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

export default function TodaySnapshotButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<SnapshotData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function fetchSnapshot() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/dashboard/today-snapshot', { credentials: 'include' })
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

  // Fetch on open
  useEffect(() => {
    if (open) void fetchSnapshot()
  }, [open])

  return (
    <>
      {/* Trigger — fixed top-right, visible from any dashboard page */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed z-[60] flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold shadow-lg hover:opacity-90 transition"
        style={{
          top: '14px',
          right: '20px',
          background: 'rgba(201,169,97,0.18)',
          border: '1px solid rgba(201,169,97,0.55)',
          color: '#C9A961',
          backdropFilter: 'blur(8px)',
        }}
        aria-label="Open today's snapshot"
        title="Today's snapshot"
      >
        <MdToday size={14} />
        Today
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
              <MdToday size={16} style={{ color: '#C9A961' }} />
              <div className="flex-1">
                <div className="text-[13px] font-semibold leading-tight">Today's snapshot</div>
                <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {data?.window?.label || 'Today (IST)'}
                  {data && ` · midnight → ${formatHHMM(data.window.endIso)}`}
                </div>
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

              {!data && loading && (
                <div className="text-[12px] py-6 text-center" style={{ color: 'var(--text-muted)' }}>
                  Loading…
                </div>
              )}

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
                      <SectionLabel>Most active today</SectionLabel>
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
