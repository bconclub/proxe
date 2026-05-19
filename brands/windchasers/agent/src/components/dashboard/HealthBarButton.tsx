'use client'

import { useEffect, useState } from 'react'
import { MdClose, MdRefresh, MdOpenInNew } from 'react-icons/md'
import Link from 'next/link'

/**
 * HealthBarButton — popover with full per-service health.
 *
 * Two usage modes:
 *   <HealthBarButton />               — uncontrolled, shows its own trigger
 *                                      chip (legacy, kept for back-compat)
 *   <HealthBarButton open onClose />  — controlled, no trigger chip; you
 *                                      open/close it from elsewhere
 *                                      (e.g. the sidebar three-dot menu)
 *
 * Status model is failure-driven (not idle-driven) so we don't false-alarm
 * during quiet hours. See /api/dashboard/health for thresholds.
 */

interface Props {
  /** When provided, component is controlled. Omit for self-managed chip + popover. */
  open?: boolean
  onClose?: () => void
}

type Status = 'ok' | 'degraded' | 'down' | 'unknown'

interface ServiceHealth {
  label: string
  status: Status
  last_at?: string | null
  last_success_at?: string | null
  minutes_since?: number | null
  recent_failures_1h?: number
  recent_failure_samples?: Array<{ at: string; lead_id: string; template: string | null; error: string }>
  hint?: string
  roundtrip_ms?: number
}

interface HealthResponse {
  now: string
  services: Record<string, ServiceHealth>
}

const STATUS_COLOR: Record<Status, string> = {
  ok: '#22c55e',
  degraded: '#f59e0b',
  down: '#ef4444',
  unknown: '#6b7280',
}
const STATUS_LABEL: Record<Status, string> = {
  ok: 'Healthy',
  degraded: 'Degraded',
  down: 'Down',
  unknown: '—',
}

function relativeIdle(min: number | null | undefined): string {
  if (min == null) return 'never'
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
function prettyError(raw: any): string {
  if (!raw) return ''
  const s = typeof raw === 'string' ? raw : JSON.stringify(raw)
  try {
    const parsed = JSON.parse(s)
    const msg = parsed?.error?.message
    if (typeof msg === 'string') return /^\(#\d+\)/.test(msg) ? msg : `(#${parsed.error.code || '?'}) ${msg}`
  } catch { /* fall through */ }
  return s
}

export default function HealthBarButton({ open: openProp, onClose }: Props = {}) {
  const isControlled = openProp !== undefined
  const [internalOpen, setInternalOpen] = useState(false)
  const open = isControlled ? !!openProp : internalOpen
  const setOpen = (next: boolean) => {
    if (isControlled) {
      if (!next) onClose?.()
    } else {
      setInternalOpen(next)
    }
  }
  const [data, setData] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(false)

  async function fetchHealth() {
    setLoading(true)
    try {
      const res = await fetch('/api/dashboard/health', { credentials: 'include' })
      if (res.ok) setData(await res.json())
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  // Always-on poller — the chip color reflects current overall status even
  // before the popover is opened.
  useEffect(() => {
    void fetchHealth()
    const id = setInterval(() => void fetchHealth(), 90_000)
    return () => clearInterval(id)
  }, [])

  const order = ['outbound_meta', 'inbound_meta', 'inbound_api', 'web_chat', 'anthropic_ai', 'google_calendar', 'supabase_db']
  const statuses = data ? order.map((k) => data.services[k]?.status).filter(Boolean) as Status[] : []
  const overall: Status = statuses.length === 0
    ? 'unknown'
    : statuses.includes('down')
      ? 'down'
      : statuses.includes('degraded')
        ? 'degraded'
        : 'ok'
  const overallColor = STATUS_COLOR[overall]

  return (
    <>
      {/* Trigger chip — only when uncontrolled. Sidebar menu provides its own. */}
      {!isControlled && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="fixed z-[60] flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold shadow hover:opacity-90 transition"
          style={{
            top: '14px',
            right: '20px',
            background: `${overallColor}1c`,
            border: `1px solid ${overallColor}55`,
            color: overallColor,
            backdropFilter: 'blur(8px)',
          }}
          aria-label="System health"
          title={`System health: ${STATUS_LABEL[overall]} — click for detail`}
        >
          <span className="inline-block rounded-full" style={{ width: 7, height: 7, background: overallColor, boxShadow: `0 0 6px ${overallColor}` }} />
          Health
        </button>
      )}

      {open && (
        <>
          {/* Backdrop — clicking closes */}
          <div
            className="fixed inset-0 z-[70]"
            style={{ background: 'rgba(0,0,0,0.35)' }}
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-label="Endpoint health"
            className="fixed z-[71] rounded-xl border shadow-2xl flex flex-col"
            style={{
              top: '56px',
              right: '20px',
              width: 'min(440px, 92vw)',
              maxHeight: '78vh',
              background: 'var(--bg-secondary)',
              borderColor: 'var(--border-primary)',
              color: 'var(--text-primary)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-b" style={{ borderColor: 'var(--border-primary)' }}>
              <span className="inline-block rounded-full" style={{ width: 10, height: 10, background: overallColor, boxShadow: `0 0 8px ${overallColor}` }} />
              <div className="flex-1">
                <div className="text-[13px] font-semibold leading-tight">Endpoint Health</div>
                <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  Overall: {STATUS_LABEL[overall]} · refreshes every 90s
                </div>
              </div>
              <button type="button" onClick={() => fetchHealth()} className="p-1 rounded hover:opacity-80" title="Refresh" disabled={loading}>
                <MdRefresh size={14} className={loading ? 'animate-spin' : ''} />
              </button>
              <Link
                href="/dashboard/status"
                className="p-1 rounded hover:opacity-80"
                title="Open full status page"
                onClick={() => setOpen(false)}
              >
                <MdOpenInNew size={14} />
              </Link>
              <button type="button" onClick={() => setOpen(false)} className="p-1 rounded hover:opacity-80" title="Close">
                <MdClose size={14} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {!data && (
                <div className="text-[12px] py-6 text-center" style={{ color: 'var(--text-muted)' }}>
                  {loading ? 'Checking endpoints…' : '—'}
                </div>
              )}

              {data && order.map((key) => {
                const s = data.services[key]
                if (!s) return null
                const color = STATUS_COLOR[s.status]
                const idle = relativeIdle(s.minutes_since)
                return (
                  <div
                    key={key}
                    className="p-2.5 rounded-lg border flex items-start gap-2"
                    style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
                  >
                    <span className="inline-block rounded-full mt-1 shrink-0" style={{ width: 8, height: 8, background: color, boxShadow: `0 0 6px ${color}80` }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[12px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{s.label}</span>
                        <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color }}>
                          {STATUS_LABEL[s.status]}
                        </span>
                      </div>
                      {s.hint && (
                        <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          {s.hint}
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-1">
                        {s.minutes_since != null && (
                          <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                            Last activity: <span style={{ color: 'var(--text-primary)' }}>{idle}</span>
                          </span>
                        )}
                        {s.roundtrip_ms != null && (
                          <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                            <span style={{ color: 'var(--text-primary)' }}>{s.roundtrip_ms}ms</span>
                          </span>
                        )}
                        {s.recent_failures_1h != null && s.recent_failures_1h > 0 && (
                          <span className="text-[10px]" style={{ color: '#fca5a5' }}>
                            {s.recent_failures_1h} failure{s.recent_failures_1h === 1 ? '' : 's'}/hr
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Recent failure samples — only render if outbound has failures */}
              {data?.services?.outbound_meta?.recent_failure_samples && data.services.outbound_meta.recent_failure_samples.length > 0 && (
                <div className="p-2.5 rounded-lg border mt-2" style={{ background: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.30)' }}>
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#fca5a5' }}>
                    Recent send failures
                  </div>
                  <ul className="space-y-1.5">
                    {data.services.outbound_meta.recent_failure_samples.slice(0, 3).map((f, i) => (
                      <li key={i} className="text-[10px]">
                        <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
                          {f.template || '(no template)'}
                        </div>
                        <div style={{ color: '#fca5a5' }}>{prettyError(f.error)}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}
