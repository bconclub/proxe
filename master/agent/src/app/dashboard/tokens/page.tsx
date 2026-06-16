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

const fmt = (n: number) => n.toLocaleString('en-IN')
const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`

export default function TokenUsagePage() {
  const [rows, setRows] = useState<Row[]>([])
  const [totals, setTotals] = useState<Totals | null>(null)
  const [since, setSince] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/dashboard/token-usage', { credentials: 'include' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `Failed (${res.status})`)
      const d = await res.json()
      setRows(d.rows || [])
      setTotals(d.totals || null)
      setSince(d.since || null)
      setUpdatedAt(d.updatedAt || null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

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

        <p className="text-xs mb-5" style={{ color: 'var(--text-muted)' }}>
          {since ? `Since ${new Date(since).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}` : 'No data yet'}
          {updatedAt ? ` · updated ${new Date(updatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}` : ''}
        </p>

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
