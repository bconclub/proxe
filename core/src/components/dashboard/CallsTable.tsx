'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import ScoreRing from './ScoreRing'
import InitialsAvatar from './InitialsAvatar'
import {
  MdCallReceived,
  MdCallMade,
  MdPhone,
  MdSearch,
  MdClose,
  MdPlayArrow,
  MdAccessTime,
  MdRefresh,
  MdGraphicEq,
  MdPersonOutline,
  MdSmartToy,
  MdLanguage,
  MdTranslate,
  MdPsychology,
} from 'react-icons/md'
import { getCurrentBrandId } from '@/configs'
import { useFeatureFlags } from '@/lib/useFeatureFlags'

// bcon tags anonymous web-widget calls (no phone, no lead name) with a
// "Website" source badge so operators can tell them from phone calls.
const SHOW_WEBSITE_BADGE = getCurrentBrandId() === 'bcon'

// ── Types (mirror /api/dashboard/calls) ─────────────────────────────────────
interface CallRow {
  id: string
  sessionId: string
  callId: string | null
  leadId: string | null
  leadName: string | null
  leadScore: number | null
  leadStage: string | null
  phone: string | null
  direction: string
  status: string | null
  durationSeconds: number
  recordingUrl: string | null
  summary: string | null
  endedReason: string | null
  sentiment: string | null
  engine: 'vapi' | 'elevenlabs' | 'sarvam'
  language: string | null
  turnCount: number
  createdAt: string
}

// Dialed language shown as its own column (pa/hi/en → readable label).
const CALL_LANG_LABEL: Record<string, string> = { pa: 'Punjabi', hi: 'Hindi', en: 'English' }

// Which engine placed the call — a small V1/V2/V3 badge on each row so it's
// obvious at a glance what stack was used (Vapi vs ElevenLabs vs our Sarvam
// pipeline). Colours match the eval bench.
const ENGINE_BADGE: Record<'vapi' | 'elevenlabs' | 'sarvam', { label: string; tone: string; title: string }> = {
  vapi: { label: 'V1', tone: '#14b8a6', title: 'V1 · Vapi (Azure · GPT · 11Labs voice)' },
  elevenlabs: { label: 'V2', tone: '#f59e0b', title: 'V2 · ElevenLabs end-to-end' },
  sarvam: { label: 'V3', tone: '#8b5cf6', title: 'V3 · Sarvam STT · Groq LLM · 11Labs voice' },
}
function EngineTag({ engine }: { engine: 'vapi' | 'elevenlabs' | 'sarvam' }) {
  const m = ENGINE_BADGE[engine] || ENGINE_BADGE.vapi
  return (
    <span title={m.title} style={{
      fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, padding: '1px 6px', borderRadius: 999, flexShrink: 0,
      color: m.tone, background: `${m.tone}1f`, border: `1px solid ${m.tone}55`,
    }}>{m.label}</span>
  )
}

interface CallTurn {
  sender: string
  content: string
  createdAt: string
}

interface CallDetail extends Omit<CallRow, 'turnCount'> {
  turns: CallTurn[]
}

type DirectionFilter = 'all' | 'inbound' | 'outbound'

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtDuration(secs: number): string {
  const total = Math.round(secs || 0) // round — duration can arrive as a float (e.g. 95.362)
  if (total <= 0) return '0s'
  const m = Math.floor(total / 60)
  const s = total % 60
  if (m <= 0) return `${s}s`
  return `${m}m ${String(s).padStart(2, '0')}s`
}

function fmtWhen(iso: string): string {
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    const date = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
    const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
    return `${date} · ${time}`
  } catch {
    return ''
  }
}

function initials(name?: string | null): string {
  if (!name) return '#'
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '#'
}

// Friendly status pill colours — mirrors the dashboard's intent/status chips.
function statusTint(status?: string | null): { bg: string; color: string; label: string } {
  const s = (status || '').toLowerCase()
  if (s === 'completed') return { bg: 'rgba(34,197,94,0.12)', color: '#22c55e', label: 'Completed' }
  if (s.includes('progress') || s === 'in-progress') return { bg: 'rgba(59,130,246,0.12)', color: '#3B82F6', label: 'In progress' }
  if (s.includes('fail') || s.includes('busy') || s.includes('no-answer')) return { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', label: status || 'Failed' }
  return { bg: 'var(--bg-tertiary)', color: 'var(--text-muted)', label: status || 'Unknown' }
}

function DirectionBadge({ direction }: { direction: string }) {
  const out = (direction || '').toLowerCase() === 'outbound'
  const color = out ? '#a855f7' : '#22c55e'
  return (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
      style={{ backgroundColor: `${color}1f`, color }}
      title={out ? 'Outbound call' : 'Inbound call'}
    >
      {out ? <MdCallMade size={15} /> : <MdCallReceived size={15} />}
    </span>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function CallsTable() {
  const { brain } = useFeatureFlags()
  const [calls, setCalls] = useState<CallRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [direction, setDirection] = useState<DirectionFilter>('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selected, setSelected] = useState<CallDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Debounce the search box so we don't refetch on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350)
    return () => clearTimeout(t)
  }, [search])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: '100' })
      if (direction !== 'all') params.set('direction', direction)
      if (debouncedSearch.length >= 2) params.set('search', debouncedSearch)
      const res = await fetch(`/api/dashboard/calls?${params.toString()}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setCalls(data.calls || [])
    } catch (e) {
      console.error('Failed to load calls:', e)
      setError('Could not load calls.')
      setCalls([])
    } finally {
      setLoading(false)
    }
  }, [direction, debouncedSearch])

  useEffect(() => {
    load()
  }, [load])

  // Pull final status/transcript/recording for any calls whose end-of-call
  // webhook never landed (always the case on localhost; a rare miss in prod),
  // then reload. Best-effort — never blocks showing what we already have.
  const [syncing, setSyncing] = useState(false)
  const syncThenLoad = useCallback(async () => {
    setSyncing(true)
    try {
      await fetch('/api/agent/voice/vapi-sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      })
    } catch { /* ignore — show existing rows regardless */ }
    finally { setSyncing(false) }
    await load()
  }, [load])

  // Reconcile once on mount so freshly-placed calls fill in without a click.
  useEffect(() => { syncThenLoad() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // No auto-refresh — the page loads on mount and when filters/search change.
  // (Founder feedback: the constant 15s reload was distracting and unnecessary.)
  // Use the manual refresh control to pull new calls.

  const openDetail = useCallback(async (row: CallRow) => {
    // Seed the drawer with the row we already have, then hydrate with turns.
    setSelected({ ...row, turns: [] })
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/dashboard/calls/${encodeURIComponent(row.id)}`)
      if (res.ok) {
        const data = await res.json()
        if (data.call) setSelected(data.call)
      }
    } catch (e) {
      console.error('Failed to load call detail:', e)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  // ── Header counts ──
  const inboundCount = calls.filter((c) => (c.direction || '').toLowerCase() !== 'outbound').length
  const outboundCount = calls.filter((c) => (c.direction || '').toLowerCase() === 'outbound').length

  const tabs: Array<{ key: DirectionFilter; label: string; count?: number }> = [
    { key: 'all', label: 'All' },
    { key: 'inbound', label: 'Inbound', count: direction === 'all' ? inboundCount : undefined },
    { key: 'outbound', label: 'Outbound', count: direction === 'all' ? outboundCount : undefined },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>Calls</h1>
        </div>
        <button
          onClick={syncThenLoad}
          disabled={syncing || loading}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors disabled:opacity-60"
          style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-primary)' }}
        >
          <MdRefresh size={15} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Syncing…' : 'Refresh'}
        </button>
      </div>

      {/* Controls: direction tabs + search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg p-1 border" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-tertiary)' }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setDirection(t.key)}
              className="text-xs font-semibold rounded-md px-3 py-1.5 transition-colors"
              style={{
                color: direction === t.key ? 'var(--accent-primary)' : 'var(--text-muted)',
                backgroundColor: direction === t.key ? 'var(--accent-subtle)' : 'transparent',
              }}
            >
              {t.label}{t.count != null ? ` · ${t.count}` : ''}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-1 justify-end min-w-[180px]">
          <div className="relative flex-1 max-w-xs">
            <MdSearch size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or phone…"
              className="w-full rounded-lg pl-8 pr-3 py-2 text-sm border outline-none"
              style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
            />
          </div>
          {/* Quick jump straight to the Eval bench (the Brain's Eval tab) so you
              don't have to go Configure → Brain → Eval to test a call. */}
          {brain && (
            <Link
              href="/dashboard/settings/brain?tab=eval"
              title="Open the Brain — Eval bench"
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold border whitespace-nowrap transition-colors"
              style={{ borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)', backgroundColor: 'var(--accent-subtle)' }}
            >
              <MdPsychology size={17} /> Brain
            </Link>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}>
        {loading ? (
          <div className="px-4 py-12 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>Loading calls…</div>
        ) : error ? (
          <div className="px-4 py-12 text-center text-sm" style={{ color: '#ef4444' }}>{error}</div>
        ) : calls.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
              <MdPhone size={22} />
            </span>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>No calls yet</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Inbound and outbound calls will appear here once they complete.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* min-width so columns keep readable widths and the wrapper scrolls
                on small screens instead of wrapping/squishing every cell. */}
            <table className="min-w-full text-left" style={{ minWidth: 720 }}>
              <thead>
                <tr className="text-[11px] uppercase tracking-wide border-b" style={{ color: 'var(--text-muted)', borderColor: 'var(--border-primary)' }}>
                  <th className="px-4 py-2.5 font-medium">Contact</th>
                  <th className="px-3 py-2.5 font-medium">Direction</th>
                  <th className="px-3 py-2.5 font-medium">Language</th>
                  <th className="px-3 py-2.5 font-medium hidden sm:table-cell">When</th>
                  <th className="px-3 py-2.5 font-medium">Duration</th>
                  <th className="px-3 py-2.5 font-medium hidden md:table-cell">Status</th>
                  <th className="px-3 py-2.5 font-medium hidden lg:table-cell">Transcript</th>
                  <th className="px-3 py-2.5 font-medium">Recording</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((c) => {
                  const tint = statusTint(c.status)
                  const out = (c.direction || '').toLowerCase() === 'outbound'
                  return (
                    <tr
                      key={c.sessionId}
                      onClick={() => openDetail(c)}
                      className="group cursor-pointer border-t transition-colors"
                      style={{ borderColor: 'var(--border-primary)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 min-w-[150px]">
                          <ScoreRing score={c.leadScore} size={32} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <EngineTag engine={c.engine} />
                              <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{c.leadName || 'Unknown caller'}</p>
                              {SHOW_WEBSITE_BADGE && !c.phone && !c.leadName && (
                                <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium shrink-0" style={{ backgroundColor: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>
                                  <MdLanguage size={10} /> Website
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>{c.phone || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: out ? '#a855f7' : '#22c55e' }}>
                          {out ? <MdCallMade size={14} /> : <MdCallReceived size={14} />}
                          <span className="hidden sm:inline">{out ? 'Outbound' : 'Inbound'}</span>
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {c.language ? (
                          <span className="text-xs font-semibold rounded px-2 py-0.5" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                            {CALL_LANG_LABEL[c.language] || c.language}
                          </span>
                        ) : (
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 hidden sm:table-cell">
                        <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{fmtWhen(c.createdAt)}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center gap-1 text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                          <MdAccessTime size={13} style={{ color: 'var(--text-muted)' }} />{fmtDuration(c.durationSeconds)}
                        </span>
                      </td>
                      <td className="px-3 py-3 hidden md:table-cell">
                        <span className="inline-flex items-center rounded px-2 py-1 text-[11px] font-medium whitespace-nowrap" style={{ backgroundColor: tint.bg, color: tint.color }}>{tint.label}</span>
                      </td>
                      <td className="px-3 py-3 hidden lg:table-cell">
                        <span className="text-xs" style={{ color: c.turnCount > 0 ? 'var(--text-secondary)' : 'var(--text-muted)' }}>{c.turnCount > 0 ? `${c.turnCount} turns` : '—'}</span>
                      </td>
                      <td className="px-3 py-3">
                        {c.recordingUrl ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--accent-primary)' }}>
                            <MdPlayArrow size={16} /> Play
                          </span>
                        ) : (
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {selected && (
        <CallDetailDrawer call={selected} loading={detailLoading} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}

// ── Detail drawer ─────────────────────────────────────────────────────────────
function CallDetailDrawer({ call, loading, onClose }: { call: CallDetail; loading: boolean; onClose: () => void }) {
  const out = (call.direction || '').toLowerCase() === 'outbound'
  const tint = statusTint(call.status)

  // English transcript toggle. The audio is Punjabi/Hindi; staff read English.
  // Translation is fetched once on demand, then cached in state (and server-side).
  const [showEn, setShowEn] = useState(false)
  const [enTurns, setEnTurns] = useState<string[] | null>(null)
  const [translating, setTranslating] = useState(false)
  const toggleEnglish = useCallback(async () => {
    if (showEn) { setShowEn(false); return }
    if (enTurns) { setShowEn(true); return }
    setTranslating(true)
    try {
      const res = await fetch(`/api/dashboard/calls/${encodeURIComponent(call.id)}/translate`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setEnTurns((data.turns || []).map((t: any) => t.content_en || ''))
        setShowEn(true)
      }
    } catch { /* leave original on failure */ }
    finally { setTranslating(false) }
  }, [showEn, enTurns, call.id])

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[70] flex justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div
        className="h-full w-full max-w-md flex flex-col shadow-2xl"
        style={{ backgroundColor: 'var(--bg-primary)', borderLeft: '1px solid var(--border-primary)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--border-primary)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <DirectionBadge direction={call.direction} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{call.leadName || 'Unknown caller'}</p>
                {SHOW_WEBSITE_BADGE && !call.phone && !call.leadName && (
                  <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium shrink-0" style={{ backgroundColor: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>
                    <MdLanguage size={10} /> Website
                  </span>
                )}
              </div>
              <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{call.phone || '—'} · {out ? 'Outbound' : 'Inbound'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-md transition-colors" style={{ color: 'var(--text-secondary)' }} aria-label="Close">
            <MdClose size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Meta row */}
          <div className="grid grid-cols-3 gap-2 p-3 rounded-lg border" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-tertiary)' }}>
            <div>
              <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{fmtDuration(call.durationSeconds)}</div>
              <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Duration</div>
            </div>
            <div>
              <div className="text-sm font-bold capitalize" style={{ color: tint.color }}>{tint.label}</div>
              <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Status</div>
            </div>
            <div>
              <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{fmtWhen(call.createdAt).split('·')[0]?.trim() || '—'}</div>
              <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Date</div>
            </div>
          </div>

          {call.endedReason && (
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Ended: <span style={{ color: 'var(--text-primary)' }}>{call.endedReason}</span></p>
          )}

          {/* Recording */}
          <div>
            <h4 className="text-[11px] uppercase tracking-wide font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
              <MdGraphicEq size={14} /> Recording
            </h4>
            {call.recordingUrl ? (
              <audio controls preload="none" src={call.recordingUrl} className="w-full" style={{ height: 40 }}>
                Your browser does not support audio playback.
              </audio>
            ) : (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No recording available for this call.</p>
            )}
          </div>

          {/* Summary */}
          {call.summary && (
            <div>
              <h4 className="text-[11px] uppercase tracking-wide font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Summary</h4>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{call.summary}</p>
            </div>
          )}

          {/* Transcript */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--text-muted)' }}>Transcript</h4>
              {call.turns && call.turns.length > 0 && (
                <button
                  onClick={toggleEnglish}
                  disabled={translating}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold border transition-colors disabled:opacity-60"
                  style={{ borderColor: 'var(--border-primary)', color: showEn ? 'var(--accent-primary)' : 'var(--text-secondary)', backgroundColor: 'var(--bg-tertiary)' }}
                  title="Toggle English translation (audio stays original)"
                >
                  <MdTranslate size={12} /> {translating ? 'Translating…' : showEn ? 'Original' : 'English'}
                </button>
              )}
            </div>
            {loading ? (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading transcript…</p>
            ) : call.turns && call.turns.length > 0 ? (
              <div className="space-y-2.5">
                {call.turns.map((t, i) => {
                  const isAgent = t.sender === 'agent'
                  const text = showEn && enTurns && enTurns[i] ? enTurns[i] : t.content
                  return (
                    <div key={i} className="flex gap-2.5">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full mt-0.5" style={{ backgroundColor: isAgent ? 'var(--accent-subtle)' : 'var(--bg-tertiary)', color: isAgent ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
                        {isAgent ? <MdSmartToy size={13} /> : <MdPersonOutline size={13} />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{isAgent ? 'Agent' : 'Caller'}</p>
                        <p className="text-sm leading-snug" style={{ color: 'var(--text-primary)' }}>{text}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No transcript captured for this call.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
