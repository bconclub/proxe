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
            style={{ background: 'rgba(0,0,0,0.45)' }}
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          {/* Popover */}
          <div
            role="dialog"
            aria-label="Today's snapshot"
            className="fixed z-[71] rounded-xl border shadow-2xl flex flex-col"
            style={{
              top: '60px',
              right: '20px',
              width: 'min(420px, 92vw)',
              maxHeight: '80vh',
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
                  {/* 1. Leads headline + source breakdown */}
                  <section>
                    <div
                      className="text-[10px] font-semibold uppercase tracking-wider mb-1.5"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Leads today
                    </div>
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="text-[28px] font-bold leading-none" style={{ color: '#C9A961' }}>
                        {data.leads.total}
                      </span>
                      <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        new lead{data.leads.total === 1 ? '' : 's'}
                      </span>
                    </div>
                    {Object.keys(data.leads.bySource).length === 0 ? (
                      <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        No leads yet today.
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(data.leads.bySource)
                          .sort(([, a], [, b]) => b - a)
                          .map(([src, n]) => (
                            <span
                              key={src}
                              className="text-[10px] font-medium px-2 py-0.5 rounded-full border"
                              style={{
                                background: 'rgba(99,102,241,0.10)',
                                borderColor: 'rgba(99,102,241,0.35)',
                                color: '#a5b4fc',
                              }}
                            >
                              {src}: {n}
                            </span>
                          ))}
                      </div>
                    )}
                  </section>

                  {/* 2. Activity events */}
                  <section>
                    <div
                      className="text-[10px] font-semibold uppercase tracking-wider mb-1.5"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Activity
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <EventCell label="PAT submitted" value={data.events.pat_submitted} />
                      <EventCell label="Demos booked" value={data.events.demo_booked} />
                      <EventCell label="Agent replies" value={data.events.agent_replies} />
                      <EventCell label="Calls logged" value={data.events.calls_logged} />
                    </div>
                  </section>

                  {/* 3. Score histogram */}
                  <section>
                    <div
                      className="text-[10px] font-semibold uppercase tracking-wider mb-1.5"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Score distribution (today's leads)
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <ScorePill label="Hot 70+" n={data.scoreHistogram.hot} color="#22c55e" />
                      <ScorePill label="Warm 40-69" n={data.scoreHistogram.warm} color="#f59e0b" />
                      <ScorePill label="Cold <40" n={data.scoreHistogram.cold} color="#ef4444" />
                      <ScorePill label="Unscored" n={data.scoreHistogram.unscored} color="#6b7280" />
                    </div>
                  </section>

                  {/* 4. Top active leads */}
                  <section>
                    <div
                      className="text-[10px] font-semibold uppercase tracking-wider mb-1.5"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Most active today
                    </div>
                    {data.topActive.length === 0 ? (
                      <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        No customer messages yet today.
                      </div>
                    ) : (
                      <ul className="space-y-1">
                        {data.topActive.map((l) => (
                          <li key={l.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setOpen(false)
                                router.push(`/dashboard/inbox?lead=${l.id}`)
                              }}
                              className="w-full text-left p-2 rounded-lg border hover:opacity-90 transition flex items-center gap-2"
                              style={{
                                background: 'var(--bg-primary)',
                                borderColor: 'var(--border-primary)',
                              }}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="text-[12px] font-semibold truncate">{l.name}</div>
                                <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                  {l.phone || '—'} · score {l.score == null ? '—' : l.score}
                                </div>
                              </div>
                              <span
                                className="text-[10px] font-medium px-2 py-0.5 rounded"
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
                </>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}

function EventCell({ label, value }: { label: string; value: number }) {
  return (
    <div
      className="px-2.5 py-1.5 rounded-lg border flex items-center justify-between"
      style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
    >
      <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>{value}</span>
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
