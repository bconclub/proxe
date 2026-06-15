'use client'

import { useEffect, useState } from 'react'
import { MdRefresh } from 'react-icons/md'

/**
 * EndpointHealthDetail — full /dashboard/status drill-down. Fetches
 * /api/dashboard/health and renders one card per service with last-activity
 * timestamp and a recent-failures tail at the bottom.
 *
 * Designed to live BELOW the at-a-glance HealthStrip on the status page.
 */

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
  thresholds: { failure_rate_red: number; failure_rate_amber: number; db_ok_max_ms: number; db_degraded_max_ms: number }
  services: Record<string, ServiceHealth>
}

const STATUS_COLOR: Record<Status, string> = {
  ok: '#22c55e',
  degraded: '#f59e0b',
  down: '#ef4444',
  unknown: '#6b7280',
}
const STATUS_LABEL: Record<Status, string> = {
  ok: 'OK',
  degraded: 'Degraded',
  down: 'Down',
  unknown: 'Unknown',
}

function formatAbsolute(iso: string | null | undefined): string {
  if (!iso) return 'never'
  try { return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true }) } catch { return iso }
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

export default function EndpointHealthDetail() {
  const [data, setData] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(false)

  async function fetchHealth() {
    setLoading(true)
    try {
      const res = await fetch('/api/dashboard/health', { credentials: 'include' })
      if (res.ok) setData(await res.json())
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  useEffect(() => {
    void fetchHealth()
    const id = setInterval(() => void fetchHealth(), 60_000)
    return () => clearInterval(id)
  }, [])

  if (!data) {
    return (
      <div className="mb-6 p-4 rounded-lg text-[12px]" style={{ color: 'var(--text-muted)' }}>
        {loading ? 'Loading endpoint health…' : '—'}
      </div>
    )
  }

  const order = ['inbound_meta', 'outbound_meta', 'inbound_api', 'web_chat', 'anthropic_ai', 'google_calendar', 'supabase_db']
  const outbound = data.services.outbound_meta

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
          Endpoint Details
        </h2>
        <button
          type="button"
          onClick={() => fetchHealth()}
          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded hover:opacity-80"
          style={{ color: 'var(--text-muted)' }}
          title="Refresh health"
        >
          <MdRefresh size={12} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Refreshing' : 'Refresh'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
        {order.map((key) => {
          const s = data.services[key]
          if (!s) return null
          const color = STATUS_COLOR[s.status]
          return (
            <div
              key={key}
              className="p-3 rounded-lg border"
              style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block rounded-full"
                    style={{ width: 10, height: 10, background: color, boxShadow: `0 0 8px ${color}80` }}
                  />
                  <span className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {s.label}
                  </span>
                </div>
                <span
                  className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style={{ background: `${color}20`, color }}
                >
                  {STATUS_LABEL[s.status]}
                </span>
              </div>
              {s.hint && (
                <div className="text-[10px] mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  {s.hint}
                </div>
              )}
              {s.minutes_since != null && (
                <div className="flex items-center justify-between text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                  <span>Last activity</span>
                  <span title={formatAbsolute(s.last_at || s.last_success_at)} style={{ color: 'var(--text-primary)' }}>
                    {relativeIdle(s.minutes_since)}
                  </span>
                </div>
              )}
              {s.recent_failures_1h != null && s.recent_failures_1h > 0 && (
                <div className="flex items-center justify-between text-[10px] mt-1" style={{ color: '#fca5a5' }}>
                  <span>Failures (last 1h)</span>
                  <span style={{ color: '#fca5a5' }}>{s.recent_failures_1h}</span>
                </div>
              )}
              {s.roundtrip_ms != null && (
                <div className="flex items-center justify-between text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                  <span>Roundtrip</span>
                  <span style={{ color: 'var(--text-primary)' }}>{s.roundtrip_ms}ms</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Recent failed-send samples (outbound_meta only) */}
      {outbound && outbound.recent_failure_samples && outbound.recent_failure_samples.length > 0 && (
        <div
          className="p-3 rounded-lg border"
          style={{ background: 'var(--bg-primary)', borderColor: 'rgba(239,68,68,0.30)' }}
        >
          <h3 className="text-[11px] font-semibold mb-2 uppercase tracking-wider" style={{ color: '#fca5a5' }}>
            Recent send failures (last 1h)
          </h3>
          <ul className="space-y-1.5">
            {outbound.recent_failure_samples.map((f, i) => (
              <li key={i} className="text-[10px] p-2 rounded" style={{ background: 'rgba(239,68,68,0.06)' }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {f.template || '(no template)'}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>{formatAbsolute(f.at)}</span>
                </div>
                <div style={{ color: '#fca5a5' }}>{prettyError(f.error)}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-2 text-[9px]" style={{ color: 'var(--text-muted)' }}>
        Failure-driven: Outbound flags amber on &ge;{data.thresholds.failure_rate_amber} and red on &ge;{data.thresholds.failure_rate_red} send failures/hour · DB degraded over {data.thresholds.db_ok_max_ms}ms, down over {data.thresholds.db_degraded_max_ms}ms · Idle time shown as info only. Refreshes every 60s.
      </div>
    </div>
  )
}
