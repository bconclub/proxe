'use client'

import { useCallback, useEffect, useState } from 'react'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import { MdRefresh, MdScience, MdRestartAlt } from 'react-icons/md'

interface Row {
  category: string
  label: string
  input_tokens: number
  output_tokens: number
  total_tokens: number
  calls: number
  cost_usd: number
}
interface Totals {
  input_tokens: number
  output_tokens: number
  total_tokens: number
  calls: number
  cost_usd: number
}
interface DailyPoint {
  date: string
  input_tokens: number
  output_tokens: number
  total_tokens: number
  calls: number
  cost_usd: number
}

const fmt = (n: number) => n.toLocaleString('en-IN')
const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`
// Short IST day label from a 'YYYY-MM-DD' key, e.g. "18 Jun".
const dayLabel = (d: string) =>
  new Date(d + 'T00:00:00+05:30').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })

type Metric = 'cost' | 'tokens' | 'calls'
const METRICS: { key: Metric; label: string }[] = [
  { key: 'cost', label: 'Cost' },
  { key: 'tokens', label: 'Tokens' },
  { key: 'calls', label: 'Calls' },
]

function DailyChart({ daily }: { daily: DailyPoint[] }) {
  const [metric, setMetric] = useState<Metric>('cost')
  const [hover, setHover] = useState<number | null>(null)

  const valueOf = (p: DailyPoint) =>
    metric === 'cost' ? p.cost_usd : metric === 'tokens' ? p.total_tokens : p.calls
  const fmtVal = (n: number) => (metric === 'cost' ? usd(n) : fmt(n))

  const max = Math.max(...daily.map(valueOf), 0)
  const hasData = daily.some((p) => valueOf(p) > 0)

  return (
    <div className="p-4 rounded-xl border mb-6" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--text-muted)' }}>
          Daily {metric === 'cost' ? 'spend' : metric === 'tokens' ? 'tokens' : 'calls'}
        </div>
        <div className="inline-flex items-center rounded-lg border p-0.5" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}>
          {METRICS.map((m) => (
            <button
              key={m.key} type="button" onClick={() => setMetric(m.key)}
              className="px-2 py-0.5 text-[11px] font-semibold rounded-md transition-colors"
              style={metric === m.key
                ? { backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)' }
                : { backgroundColor: 'transparent', color: 'var(--text-secondary)' }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <div className="h-32 flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>
          No daily data in this window yet.
        </div>
      ) : (
        <div className="flex items-end gap-1 h-32 relative">
          {daily.map((p, i) => {
            const v = valueOf(p)
            const pct = max > 0 ? (v / max) * 100 : 0
            const active = hover === i
            return (
              <div
                key={p.date}
                className="flex-1 flex flex-col justify-end h-full min-w-0 cursor-default"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                {active && (
                  <div
                    className="absolute -top-1 left-1/2 -translate-x-1/2 z-10 px-2 py-1 rounded-md text-[11px] whitespace-nowrap border shadow-lg"
                    style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                  >
                    <span className="font-semibold">{dayLabel(p.date)}</span>
                    {' · '}{usd(p.cost_usd)}{' · '}{fmt(p.total_tokens)} tok{' · '}{fmt(p.calls)} calls
                  </div>
                )}
                <div
                  className="w-full rounded-t transition-all"
                  style={{
                    height: `${Math.max(pct, v > 0 ? 2 : 0)}%`,
                    background: active ? 'var(--accent-primary)' : 'var(--accent-subtle)',
                    minHeight: v > 0 ? 2 : 0,
                  }}
                  title={`${dayLabel(p.date)}: ${fmtVal(v)}`}
                />
              </div>
            )
          })}
        </div>
      )}

      {/* X-axis: first / mid / last day labels (avoids crowding on 30D/All) */}
      {hasData && daily.length > 0 && (
        <div className="flex justify-between mt-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
          <span>{dayLabel(daily[0].date)}</span>
          {daily.length > 2 && <span>{dayLabel(daily[Math.floor(daily.length / 2)].date)}</span>}
          <span>{dayLabel(daily[daily.length - 1].date)}</span>
        </div>
      )}
    </div>
  )
}

export default function TokenUsagePage() {
  const [rows, setRows] = useState<Row[]>([])
  const [daily, setDaily] = useState<DailyPoint[]>([])
  const [totals, setTotals] = useState<Totals | null>(null)
  const [since, setSince] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<'Today' | '7D' | '14D' | '30D' | 'All'>('All')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/dashboard/token-usage?range=${range}`, { credentials: 'include' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `Failed (${res.status})`)
      const d = await res.json()
      setRows(d.rows || [])
      setDaily(d.daily || [])
      setTotals(d.totals || null)
      setSince(d.since || null)
      setUpdatedAt(d.updatedAt || null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => { load() }, [load])

  const reset = async () => {
    if (!confirm('Reset all token-usage counters to zero? (Test data only.)')) return
    await fetch('/api/dashboard/token-usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'reset' }),
    })
    load()
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              Token usage
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                <MdScience size={12} /> Test
              </span>
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              Rough Claude spend by area. Experimental — counts are best-effort and costs are estimates.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} title="Refresh"
              className="p-2 rounded-lg border hover:bg-[var(--bg-hover)]"
              style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}>
              <MdRefresh size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={reset}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm hover:bg-[var(--bg-hover)]"
              style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}>
              <MdRestartAlt size={16} /> Reset
            </button>
          </div>
        </div>

        <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
          {since ? `Since ${new Date(since).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}` : 'No data yet'}
          {updatedAt ? ` · updated ${new Date(updatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}` : ''}
        </p>

        {/* Window toggle — sums per-day buckets (All = cumulative since metering began) */}
        <div className="inline-flex items-center rounded-lg border p-0.5 mb-5" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
          {(['Today', '7D', '14D', '30D', 'All'] as const).map((r) => (
            <button
              key={r} type="button" onClick={() => setRange(r)}
              className="px-2.5 py-1 text-xs font-semibold rounded-md transition-colors"
              style={range === r
                ? { backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)' }
                : { backgroundColor: 'transparent', color: 'var(--text-secondary)' }}
            >
              {r === 'Today' ? '24h' : r}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>{error}</div>
        )}

        {/* Total cost hero */}
        {totals && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="p-4 rounded-xl border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Est. cost</div>
              <div className="text-2xl font-bold" style={{ color: 'var(--accent-primary)' }}>{usd(totals.cost_usd)}</div>
            </div>
            <div className="p-4 rounded-xl border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Total tokens</div>
              <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{fmt(totals.total_tokens)}</div>
            </div>
            <div className="p-4 rounded-xl border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Calls</div>
              <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{fmt(totals.calls)}</div>
            </div>
          </div>
        )}

        {/* Daily trend — see day-by-day spend at a glance */}
        {!loading && daily.length > 0 && <DailyChart daily={daily} />}

        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-primary)' }}>
          <table className="w-full">
            <thead style={{ background: 'var(--bg-secondary)' }}>
              <tr>
                {['Area', 'Calls', 'Input', 'Output', 'Total', 'Est. cost'].map((h, i) => (
                  <th key={h} className={`text-[10px] font-bold uppercase tracking-wider px-4 py-2 ${i === 0 ? 'text-left' : 'text-right'}`}
                    style={{ color: 'var(--text-secondary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                  No usage recorded yet. Counters start filling once the agent runs (chats, scoring, summaries).
                </td></tr>
              ) : rows.map((r) => (
                <tr key={r.category} className="border-t" style={{ borderColor: 'var(--border-primary)' }}>
                  <td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{r.label}</td>
                  <td className="px-4 py-3 text-sm text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>{fmt(r.calls)}</td>
                  <td className="px-4 py-3 text-sm text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>{fmt(r.input_tokens)}</td>
                  <td className="px-4 py-3 text-sm text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>{fmt(r.output_tokens)}</td>
                  <td className="px-4 py-3 text-sm text-right tabular-nums font-semibold" style={{ color: 'var(--text-primary)' }}>{fmt(r.total_tokens)}</td>
                  <td className="px-4 py-3 text-sm text-right tabular-nums font-semibold" style={{ color: 'var(--accent-primary)' }}>{usd(r.cost_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] mt-4" style={{ color: 'var(--text-muted)' }}>
          Web chat streaming isn't metered yet. Costs use public per-model pricing and are indicative, not billed amounts.
        </p>
      </div>
    </DashboardLayout>
  )
}
