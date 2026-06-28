'use client'

import { useEffect, useState } from 'react'

/**
 * Demo data control (Configure page). Seeds/clears sample leads tagged
 * metadata.is_demo=true so the dashboard feels real before real traffic.
 * Clear these before going live with ads.
 */
export default function DemoDataCard() {
  const [count, setCount] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const refresh = async () => {
    try {
      const r = await fetch('/api/admin/demo-data', { cache: 'no-store' })
      const j = await r.json()
      setCount(typeof j.count === 'number' ? j.count : null)
    } catch { /* ignore */ }
  }

  useEffect(() => { refresh() }, [])

  const run = async (method: 'POST' | 'DELETE') => {
    setBusy(true); setMsg('')
    try {
      const r = await fetch('/api/admin/demo-data', { method })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Failed')
      setMsg(method === 'DELETE' ? `Cleared ${j.deleted} demo leads.` : `Seeded ${j.seeded} demo leads.`)
      await refresh()
    } catch (e: any) {
      setMsg(e.message || 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
        Demo data
      </h2>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
        Sample leads so the dashboard feels real before launch. Clear them before you start running ads.
      </p>
      <div
        className="p-5 rounded-xl border"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
      >
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {count === null ? 'Demo leads' : `${count} demo lead${count === 1 ? '' : 's'} in your dashboard`}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Tagged as demo, safe to remove anytime.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => run('POST')}
              disabled={busy}
              className="px-3 py-2 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50"
              style={{ borderColor: 'var(--border-primary)', color: 'var(--text-primary)', background: 'var(--bg-hover)' }}
            >
              {busy ? '…' : 'Reseed demo'}
            </button>
            <button
              onClick={() => run('DELETE')}
              disabled={busy || count === 0}
              className="px-3 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
              style={{ background: '#E4002B', color: '#fff' }}
            >
              {busy ? '…' : 'Clear demo data'}
            </button>
          </div>
        </div>
        {msg && (
          <p className="text-xs mt-3" style={{ color: 'var(--accent-primary)' }}>{msg}</p>
        )}
      </div>
    </section>
  )
}
