'use client'

// Configure → Support - every issue the team has reported via the Report
// Issue button, with its live status (the HQ vault sync writes status + fix
// notes back into each report.json, so what shows here is the working truth).

import { useEffect, useState } from 'react'
import {
  MdArrowBack, MdRefresh, MdSupportAgent, MdCheckCircle, MdOutlineImage,
} from 'react-icons/md'

interface IssueShot { name: string; url: string }
interface Issue {
  id: string
  created_at: string
  reporter: string
  severity: string
  description: string
  context?: { page?: string; version?: string }
  status: string
  fix: string | null
  fixed_at: string | null
  screenshot_urls?: IssueShot[]
}

const SEVERITY_TONES: Record<string, string> = {
  blocker: '#ef4444',
  broken: '#f59e0b',
  annoying: '#3b82f6',
  idea: '#22c55e',
}

function statusTone(s: Issue): { label: string; color: string } {
  const status = (s.status || 'new').toLowerCase()
  if (status === 'fixed' || s.fixed_at) return { label: 'Fixed', color: '#22c55e' }
  if (status === 'in-progress' || status === 'in_progress') return { label: 'In progress', color: '#f59e0b' }
  if (status === 'wont-fix' || status === 'wont_fix' || status === 'closed') return { label: 'Closed', color: '#8a8a8a' }
  return { label: 'Open', color: '#3b82f6' }
}

function when(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function SupportPage() {
  const [issues, setIssues] = useState<Issue[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'all' | 'open' | 'fixed'>('all')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setIssues(null)
    setError(null)
    fetch('/api/dashboard/report-issue')
      .then(async (r) => {
        const d = await r.json()
        if (cancelled) return
        if (!r.ok) throw new Error(d?.error || 'Failed to load')
        setIssues(Array.isArray(d.issues) ? d.issues : [])
      })
      .catch((e) => { if (!cancelled) { setError(e.message); setIssues([]) } })
    return () => { cancelled = true }
  }, [reloadKey])

  const shown = (issues || []).filter((i) => {
    const fixed = statusTone(i).label === 'Fixed'
    if (tab === 'open') return !fixed
    if (tab === 'fixed') return fixed
    return true
  })

  const counts = {
    all: issues?.length || 0,
    open: (issues || []).filter((i) => statusTone(i).label !== 'Fixed').length,
    fixed: (issues || []).filter((i) => statusTone(i).label === 'Fixed').length,
  }

  return (
    <div className="p-6 max-w-[860px]">
      <a href="/dashboard/settings" className="inline-flex items-center gap-1 text-xs mb-4" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>
        <MdArrowBack size={14} /> Configure
      </a>

      <div className="flex items-center gap-3 mb-1">
        <span className="flex items-center justify-center" style={{ width: 38, height: 38, borderRadius: 11, background: '#0ea5e91c', color: '#0ea5e9' }}>
          <MdSupportAgent size={21} />
        </span>
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Support</h1>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Everything the team has reported via Report Issue, with live status and fix notes.
          </p>
        </div>
        <button
          onClick={() => setReloadKey((k) => k + 1)}
          className="ml-auto flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md"
          style={{ color: 'var(--accent-primary)' }}
        >
          <MdRefresh size={14} /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 mt-4 mb-4">
        {(['all', 'open', 'fixed'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-3 py-1.5 rounded-md text-xs font-semibold border"
            style={{
              borderColor: 'var(--border-primary)',
              background: tab === t ? 'var(--bg-hover)' : 'transparent',
              color: tab === t ? 'var(--text-primary)' : 'var(--text-muted)',
            }}
          >
            {t === 'all' ? 'All' : t === 'open' ? 'Open' : 'Fixed'} · {counts[t]}
          </button>
        ))}
      </div>

      {issues === null ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ height: 96, background: 'var(--bg-hover)', borderRadius: 12, animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.12}s` }} />
          ))}
          <style>{`@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
        </div>
      ) : error ? (
        <div className="rounded-xl border p-5 text-sm" style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}>
          Could not load reports: {error}
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border p-8 text-center" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
          <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
            {tab === 'fixed' ? 'Nothing fixed yet' : tab === 'open' ? 'No open reports' : 'No reports yet'}
          </div>
          <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Use the Report Issue button in the sidebar to flag anything broken - it lands here.
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((i) => {
            const st = statusTone(i)
            const sev = SEVERITY_TONES[(i.severity || '').toLowerCase()] || '#8a8a8a'
            return (
              <div key={i.id} className="rounded-xl border p-4" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${st.color}22`, color: st.color }}>{st.label}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full capitalize" style={{ background: `${sev}22`, color: sev }}>{i.severity || 'report'}</span>
                  <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>{i.id}</span>
                  <span className="ml-auto text-[11px]" style={{ color: 'var(--text-muted)' }}>{when(i.created_at)}</span>
                </div>
                {i.description && (
                  <p className="text-[13px] mt-2 leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{i.description}</p>
                )}
                <div className="text-[11px] mt-1.5 flex items-center gap-2 flex-wrap" style={{ color: 'var(--text-muted)' }}>
                  <span>{i.reporter}</span>
                  {i.context?.page && <span>· {i.context.page}</span>}
                  {i.context?.version && <span>· v{i.context.version}</span>}
                </div>
                {(i.screenshot_urls?.length || 0) > 0 && (
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {i.screenshot_urls!.map((s) => (
                      <a key={s.name} href={s.url} target="_blank" rel="noreferrer" title={s.name}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={s.url} alt={s.name} className="h-16 w-24 object-cover rounded-md border" style={{ borderColor: 'var(--border-primary)' }} />
                      </a>
                    ))}
                  </div>
                )}
                {i.fix && (
                  <div className="mt-3 rounded-lg border px-3 py-2 flex gap-2 items-start" style={{ borderColor: '#22c55e44', background: '#22c55e0e' }}>
                    <MdCheckCircle size={15} style={{ color: '#22c55e', marginTop: 1, flexShrink: 0 }} />
                    <div>
                      <div className="text-[11px] font-semibold" style={{ color: '#22c55e' }}>Fix{i.fixed_at ? ` · ${when(i.fixed_at)}` : ''}</div>
                      <div className="text-[12px] whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>{i.fix}</div>
                    </div>
                  </div>
                )}
                {(i.screenshot_urls?.length || 0) === 0 && !i.description && (
                  <div className="text-xs mt-2 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                    <MdOutlineImage size={14} /> Screenshot-only report
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
