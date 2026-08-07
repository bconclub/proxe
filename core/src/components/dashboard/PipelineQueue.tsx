'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  MdHelpOutline, MdEventAvailable, MdPhoneMissed, MdPhoneCallback,
  MdCheckCircleOutline, MdRefresh, MdInbox,
} from 'react-icons/md'

/**
 * "Needs your attention" - the human pipeline.
 *
 * One list, not a dashboard. A salesperson does not think in buckets, they
 * think "what do I do next", so everything owed lands in a single ordered
 * queue: broken promises first, then unanswered bookings, then today, then the
 * week. The chips filter that list; they do not slice it into separate tabs.
 *
 * Two kinds of row, two kinds of answer:
 *   followup  a call-back that was promised → Done / Tomorrow
 *   ask       a booking that has passed with nobody saying what happened →
 *             Happened / No show / Rebooked
 *
 * Clicking a lead opens it in place. Sending someone to another page to answer
 * a one-word question is how a queue stops being worked.
 */

type Kind = 'followup' | 'ask' | 'booking' | 'rnr'

export interface QueueCard {
  id: string
  name: string
  phone: string | null
  stage: string
  owner_id: string | null
  created_at: string | null
  booking_date: string | null
  booking_time: string | null
  followup_at: string | null
  followup_note: string | null
  followup_activity_id: string | null
  kind: Kind
  bucket: string
  urgency: number
}

interface QueueData {
  counts: Record<string, number>
  total: number
  attention: QueueCard[]
}

// Filters over the one list. `buckets: null` = everything.
const FILTERS: Array<{ key: string; label: string; buckets: string[] | null; color: string }> = [
  { key: 'all', label: 'Everything', buckets: null, color: '#f59e0b' },
  { key: 'overdue', label: 'Overdue', buckets: ['followupsOverdue'], color: '#ef4444' },
  { key: 'ask', label: 'Did it happen?', buckets: ['needsAnswer', 'unassigned'], color: '#f59e0b' },
  { key: 'today', label: 'Today', buckets: ['followupsToday', 'today'], color: '#3B82F6' },
  { key: 'week', label: 'This week', buckets: ['followupsUpcoming', 'upcoming'], color: '#6366f1' },
  { key: 'quiet', label: 'Gone quiet', buckets: ['rnr'], color: '#8b5cf6' },
]

const KIND_ICON: Record<Kind, React.ReactNode> = {
  followup: <MdPhoneCallback size={15} />,
  ask: <MdHelpOutline size={15} />,
  booking: <MdEventAvailable size={15} />,
  rnr: <MdPhoneMissed size={15} />,
}

const KIND_COLOR: Record<Kind, string> = {
  followup: '#f59e0b',
  ask: '#f59e0b',
  booking: '#3B82F6',
  rnr: '#8b5cf6',
}

const OUTCOMES: Array<{ key: 'done' | 'no_show' | 'rebooked'; label: string; color: string }> = [
  { key: 'done', label: 'Happened', color: '#22c55e' },
  { key: 'no_show', label: 'No show', color: '#f59e0b' },
  { key: 'rebooked', label: 'Rebooked', color: '#8a8a8a' },
]

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
const istToday = () => new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10)

/** "was Sat 2 Aug" / "today 6:00 PM" / "Thu 7 Aug" */
function whenLabel(date: string | null, time: string | null): string {
  if (!date) return ''
  const today = istToday()
  let day = date
  try {
    day = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', {
      weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
    })
  } catch { /* fall back to the raw date */ }
  const t = time ? ` ${time}` : ''
  if (date === today) return `today${t}`
  if (date < today) return `was ${day}${t}`
  return `${day}${t}`
}

/** A promised call-back, in words: "was due Mon 11:00 AM" / "today 11:00 AM". */
function dueLabel(iso: string | null): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (!isFinite(t)) return ''
  const d = new Date(t)
  const day = istToday()
  const thatDay = new Date(t + IST_OFFSET_MS).toISOString().slice(0, 10)
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
  const date = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
  if (thatDay === day) return `today ${time}`
  if (t < Date.now()) return `was due ${date} ${time}`
  return `${date} ${time}`
}

/** Whole days late, for the nudge on the row. */
function lateDays(iso: string | null): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!isFinite(t) || t >= Date.now()) return null
  const n = Math.floor((Date.now() - t) / 86_400_000)
  return n > 0 ? n : null
}

function daysAgo(date: string | null): number | null {
  if (!date) return null
  const d = Date.parse(`${date}T00:00:00Z`)
  const t = Date.parse(`${istToday()}T00:00:00Z`)
  if (!isFinite(d) || !isFinite(t) || d >= t) return null
  return Math.round((t - d) / 86_400_000)
}

export default function PipelineQueue({
  owner,
  onOpenLead,
  onResolved,
  reloadKey = 0,
}: {
  /** 'me' | 'all' | a user id. Matches the page's owner tabs. */
  owner: string
  /** Open the lead in place. No navigation - that is the whole point. */
  onOpenLead: (card: QueueCard) => void
  /** Fired after an answer lands, so the tiles beside it can catch up. */
  onResolved?: () => void
  /** Bumped by the page to force a refetch. */
  reloadKey?: number
}) {
  const [data, setData] = useState<QueueData | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const listRef = useRef<HTMLDivElement | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // The route knows me / all / <user id>. 'unassigned' is a page tab, not an
  // owner - unowned work is a bucket of this response either way.
  const ownerParam = owner === 'unassigned' ? 'all' : owner

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/dashboard/pipeline/queue?owner=${encodeURIComponent(ownerParam)}`, { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.error || 'Could not load the queue')
      setData(d)
    } catch (e: any) {
      setError(e?.message || 'Could not load the queue')
    }
    setLoading(false)
  }, [ownerParam])

  useEffect(() => { load() }, [load, reloadKey])

  /** Drop a row and decrement its counter - the queue must visibly shrink. */
  const removeRow = (card: QueueCard) => {
    setData((prev) => {
      if (!prev) return prev
      const counts = { ...prev.counts }
      if (counts[card.bucket] != null) counts[card.bucket] = Math.max(0, counts[card.bucket] - 1)
      const attention = prev.attention.filter(
        (c) => !(c.id === card.id && c.bucket === card.bucket && c.followup_activity_id === card.followup_activity_id),
      )
      return { ...prev, counts, attention, total: Math.max(0, prev.total - 1) }
    })
    onResolved?.()
  }

  const answerBooking = async (card: QueueCard, outcome: 'done' | 'no_show' | 'rebooked') => {
    setBusy(`${card.id}:${outcome}`)
    setError(null)
    try {
      const res = await fetch(`/api/dashboard/leads/${card.id}/booking-outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome, booking_date: card.booking_date }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.error || 'Could not save that')
      removeRow(card)
    } catch (e: any) {
      setError(e?.message || 'Could not save that')
    }
    setBusy(null)
  }

  const resolveFollowup = async (card: QueueCard, action: 'done' | 'snooze') => {
    if (!card.followup_activity_id) return
    setBusy(`${card.id}:${action}`)
    setError(null)
    try {
      const res = await fetch(`/api/dashboard/leads/${card.id}/followup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activity_id: card.followup_activity_id, action, date: 'tomorrow' }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.error || 'Could not save that')
      removeRow(card)
    } catch (e: any) {
      setError(e?.message || 'Could not save that')
    }
    setBusy(null)
  }

  const counts = data?.counts || {}
  const countFor = (buckets: string[] | null) =>
    buckets === null ? (data?.total || 0) : buckets.reduce((n, b) => n + (counts[b] || 0), 0)

  const activeFilter = FILTERS.find((f) => f.key === filter) || FILTERS[0]
  const rows = (data?.attention || []).filter(
    (c) => activeFilter.buckets === null || activeFilter.buckets.includes(c.bucket),
  )
  const total = data?.total || 0

  if (loading && !data) {
    return (
      <div className="rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
        <div style={{ height: 16, width: 180, background: 'var(--bg-hover)', borderRadius: 6 }} />
        <div className="mt-3 flex flex-wrap gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ height: 26, width: 104, background: 'var(--bg-hover)', borderRadius: 8 }} />
          ))}
        </div>
        <div className="mt-3 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ height: 44, background: 'var(--bg-hover)', borderRadius: 8 }} />
          ))}
        </div>
      </div>
    )
  }

  // Nothing owed is a result, not a blank page.
  if (data && total === 0) {
    return (
      <div
        className="rounded-2xl border px-4 py-5 flex flex-col items-center text-center gap-1.5"
        style={{
          borderColor: 'color-mix(in srgb, #22c55e 30%, var(--border-primary))',
          background: 'color-mix(in srgb, #22c55e 6%, var(--bg-secondary))',
        }}
      >
        <MdCheckCircleOutline size={26} style={{ color: '#22c55e' }} />
        <span className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>Nothing waiting on you</span>
        <span className="text-[11.5px] max-w-[380px]" style={{ color: 'var(--text-muted)' }}>
          No call-backs due, no unanswered bookings, nobody gone quiet. New work lands here the moment a call is logged.
        </span>
        <button onClick={load} className="mt-1 flex items-center gap-1 text-[11px] font-semibold" style={{ color: 'var(--accent-primary)' }}>
          <MdRefresh size={13} /> Refresh
        </button>
      </div>
    )
  }

  return (
    <div
      className="rounded-2xl border overflow-hidden flex flex-col"
      style={{ borderColor: 'color-mix(in srgb, #f59e0b 26%, var(--border-primary))', background: 'var(--bg-secondary)' }}
    >
      <div className="px-3.5 pt-2.5 pb-2 flex flex-wrap items-center gap-x-2 gap-y-2" style={{ background: 'color-mix(in srgb, #f59e0b 6%, transparent)' }}>
        <span className="text-[11px] font-bold uppercase tracking-[0.09em]" style={{ color: '#f59e0b' }}>Needs your attention</span>
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {total} {total === 1 ? 'thing' : 'things'} waiting
        </span>
        <button onClick={load} className="ml-auto p-1 rounded-md" style={{ color: 'var(--text-muted)' }} title="Refresh">
          <MdRefresh size={15} />
        </button>
        <div className="w-full flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const n = countFor(f.buckets)
            const on = filter === f.key
            return (
              <button
                key={f.key}
                onClick={() => {
                  setFilter(f.key)
                  // Start the new filter at its own top. Keeping the old
                  // offset lands you mid-list in a set you have not seen.
                  if (listRef.current) listRef.current.scrollTop = 0
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11.5px] font-semibold border transition-colors"
                style={{
                  borderColor: on ? `color-mix(in srgb, ${f.color} 55%, transparent)` : 'var(--border-primary)',
                  background: on ? `color-mix(in srgb, ${f.color} 14%, var(--bg-primary))` : 'var(--bg-primary)',
                  color: on ? f.color : n > 0 ? 'var(--text-secondary)' : 'var(--text-muted)',
                  opacity: n === 0 && !on ? 0.5 : 1,
                }}
              >
                {f.label}
                <span
                  className="px-1.5 rounded-md text-[10.5px] font-bold"
                  style={{
                    background: n > 0 ? `color-mix(in srgb, ${f.color} 20%, transparent)` : 'var(--bg-hover)',
                    color: n > 0 ? f.color : 'var(--text-muted)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {n}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {error && <div className="px-3.5 py-1.5 text-[11.5px]" style={{ color: '#ef4444' }}>{error}</div>}

      {/* Fixed height, not a cap.
          With maxHeight the box shrank to fit whatever the filter returned -
          268 rows down to 3 - and everything below it jumped up the page. A
          filter should change what is IN the list, never where the list is.
          The scroll position resets too, so a new filter starts at its top
          instead of halfway down where the last one was left. */}
      <div ref={listRef} className="overflow-y-auto" style={{ height: 560 }}>
        {rows.length === 0 ? (
          <div className="px-3.5 py-6 flex flex-col items-center gap-1 text-center" style={{ borderTop: '1px solid var(--border-primary)' }}>
            <MdInbox size={20} style={{ color: 'var(--text-muted)' }} />
            <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Nothing here right now.</span>
          </div>
        ) : (
          rows.map((card) => {
            const isFollowup = card.kind === 'followup'
            const isAsk = card.kind === 'ask'
            const late = isFollowup ? lateDays(card.followup_at) : daysAgo(card.booking_date)
            const when = isFollowup ? dueLabel(card.followup_at) : whenLabel(card.booking_date, card.booking_time)
            const color = KIND_COLOR[card.kind]
            return (
              <div
                key={`${card.id}:${card.bucket}:${card.followup_activity_id || 'x'}`}
                className="px-3.5 py-2 flex flex-wrap items-center gap-x-3 gap-y-1.5"
                style={{ borderTop: '1px solid var(--border-primary)' }}
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                  style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
                  title={card.kind}
                >
                  {KIND_ICON[card.kind]}
                </span>

                <button type="button" onClick={() => onOpenLead(card)} className="min-w-0 flex-1 text-left group" title="Open this lead">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[13px] font-semibold truncate group-hover:underline" style={{ color: 'var(--text-primary)' }}>
                      {card.name}
                    </span>
                    {card.bucket === 'unassigned' && (
                      <span className="text-[9.5px] font-bold px-1.5 rounded-md shrink-0" style={{ background: 'color-mix(in srgb, #22c55e 18%, transparent)', color: '#22c55e' }}>
                        UNCLAIMED
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {card.phone && <span>{card.phone}</span>}
                    <span>{card.stage}</span>
                    {when && (
                      <span style={{ color: late ? '#f59e0b' : 'var(--text-muted)' }}>
                        {when}{late ? ` · ${late}d late` : ''}
                      </span>
                    )}
                  </div>
                  {isFollowup && card.followup_note && (
                    <div className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>{card.followup_note}</div>
                  )}
                </button>

                {isFollowup ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => resolveFollowup(card, 'done')}
                      disabled={!!busy}
                      className="px-2.5 py-1 rounded-lg text-[11.5px] font-semibold border disabled:opacity-40"
                      style={{ borderColor: 'color-mix(in srgb, #22c55e 40%, var(--border-primary))', background: 'color-mix(in srgb, #22c55e 10%, var(--bg-primary))', color: '#22c55e' }}
                    >
                      {busy === `${card.id}:done` ? 'Saving…' : 'Done'}
                    </button>
                    <button
                      onClick={() => resolveFollowup(card, 'snooze')}
                      disabled={!!busy}
                      className="px-2.5 py-1 rounded-lg text-[11.5px] font-semibold border disabled:opacity-40"
                      style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
                      title="Move this call-back to tomorrow"
                    >
                      {busy === `${card.id}:snooze` ? 'Saving…' : 'Tomorrow'}
                    </button>
                  </div>
                ) : isAsk ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {OUTCOMES.map((o) => (
                      <button
                        key={o.key}
                        onClick={() => answerBooking(card, o.key)}
                        disabled={!!busy}
                        className="px-2.5 py-1 rounded-lg text-[11.5px] font-semibold border disabled:opacity-40"
                        style={{
                          borderColor: `color-mix(in srgb, ${o.color} 40%, var(--border-primary))`,
                          background: `color-mix(in srgb, ${o.color} 10%, var(--bg-primary))`,
                          color: o.color,
                        }}
                      >
                        {busy === `${card.id}:${o.key}` ? 'Saving…' : o.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <button
                    onClick={() => onOpenLead(card)}
                    className="px-2.5 py-1 rounded-lg text-[11.5px] font-semibold border shrink-0"
                    style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
                  >
                    Open
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
