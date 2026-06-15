'use client'

import { useEffect, useState } from 'react'

/**
 * HealthStrip — compact horizontal strip of per-service status dots.
 * Reads /api/dashboard/health and refreshes every 60s while mounted.
 *
 * Usage:
 *   <HealthStrip />              — full layout (dot + label per service)
 *   <HealthStrip compact />      — dots only (no label), for tight headers
 */

type Status = 'ok' | 'degraded' | 'down' | 'unknown'

interface ServiceHealth {
  label: string
  status: Status
  minutes_since?: number | null
  recent_failures_1h?: number
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
  ok: 'OK',
  degraded: 'Degraded',
  down: 'Down',
  unknown: 'Unknown',
}

function relativeIdle(min: number | null | undefined): string {
  if (min == null) return 'never'
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function HealthStrip({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(false)

  async function fetchHealth() {
    setLoading(true)
    try {
      const res = await fetch('/api/dashboard/health', { credentials: 'include' })
      if (res.ok) setData(await res.json())
    } catch {
      /* swallow — strip just stays in last-known state */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchHealth()
    const id = setInterval(() => void fetchHealth(), 60_000)
    return () => clearInterval(id)
  }, [])

  if (!data) {
    return (
      <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
        {loading ? 'Checking endpoints…' : ''}
      </div>
    )
  }

  const order = ['inbound_meta', 'outbound_meta', 'inbound_api', 'web_chat', 'anthropic_ai', 'google_calendar', 'supabase_db']
  // Overall worst-status across all services
  const statuses = order.map((k) => data.services[k]?.status).filter(Boolean) as Status[]
  const overall: Status = statuses.includes('down')
    ? 'down'
    : statuses.includes('degraded')
      ? 'degraded'
      : statuses.includes('unknown')
        ? 'unknown'
        : 'ok'

  return (
    <div
      className={compact ? 'flex flex-wrap items-center gap-1.5' : 'flex flex-wrap items-center gap-2 p-2.5 rounded-lg border'}
      style={compact ? undefined : { background: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
    >
      {!compact && (
        <span
          className="text-[10px] font-semibold uppercase tracking-wider mr-1"
          style={{ color: STATUS_COLOR[overall] }}
          title={`Overall: ${STATUS_LABEL[overall]}`}
        >
          ● {STATUS_LABEL[overall]}
        </span>
      )}
      {order.map((key) => {
        const s = data.services[key]
        if (!s) return null
        const color = STATUS_COLOR[s.status]
        const idle = relativeIdle(s.minutes_since)
        const tooltip = [
          s.label,
          `Status: ${STATUS_LABEL[s.status]}`,
          s.minutes_since != null ? `Last activity: ${idle}` : null,
          s.recent_failures_1h ? `${s.recent_failures_1h} failure${s.recent_failures_1h === 1 ? '' : 's'} in last hour` : null,
          s.roundtrip_ms != null ? `Roundtrip: ${s.roundtrip_ms}ms` : null,
          s.hint,
        ].filter(Boolean).join(' · ')
        return (
          <div
            key={key}
            className={compact
              ? 'flex items-center gap-1 px-1.5 py-0.5 rounded'
              : 'flex items-center gap-1.5 px-2 py-1 rounded border'}
            style={{
              background: `${color}14`,
              borderColor: compact ? undefined : `${color}40`,
            }}
            title={tooltip}
          >
            <span
              className="inline-block rounded-full"
              style={{ width: 8, height: 8, background: color, boxShadow: `0 0 6px ${color}80` }}
              aria-label={`${s.label} ${STATUS_LABEL[s.status]}`}
            />
            <span className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>
              {compact ? STATUS_LABEL[s.status][0] : s.label.replace(/\s*\(.*?\)/, '')}
            </span>
            {!compact && s.minutes_since != null && s.status !== 'ok' && (
              <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{idle}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
