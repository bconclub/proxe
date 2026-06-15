'use client'

/**
 * NotificationCenter — site-wide status-change notifications.
 *
 * Lives once in DashboardLayout, so it's on every page. Three parts:
 *   1. A bell (fixed, top-right) with an unread count. Click → slide-out
 *      activity drawer listing ALL recent status changes.
 *   2. Toasts that pop bottom-right when NEW status changes arrive.
 *   3. A sound on each new change — distinct tones for NEW LEADS vs UPDATES,
 *      with a mute toggle (persisted).
 *
 * Data: polls /api/dashboard/notifications (lead_stage_changes-backed). The
 * first poll sets a baseline so a backlog doesn't blast you on load — only
 * events arriving AFTER the page is open pop + play a sound.
 *
 * Sounds + mute/enable prefs are owned by @/lib/sound-prefs (shared with the
 * home-page "ready" cue and the Settings panel). Regenerate the WAVs via
 * scripts/gen_notification_sounds.py.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { playSound as playEventSound } from '@/lib/sound-prefs'
import {
  MdNotificationsNone,
  MdNotificationsActive,
  MdClose,
  MdVolumeUp,
  MdVolumeOff,
  MdTrendingUp,
  MdTrendingDown,
  MdArrowUpward,
  MdEvent,
  MdLocalFireDepartment,
  MdPersonAdd,
} from 'react-icons/md'

const POLL_MS = 30_000
const SEEN_AT_KEY = 'wc-notif-seen-at'
const MUTED_KEY = 'wc-notif-muted'

type NotificationEvent = {
  id: string
  leadId: string
  leadName: string
  type: 'stage_change' | 'new_lead_scored' | 'score_change'
  content: string
  channel: string
  timestamp: string
  metadata?: Record<string, any>
}

type Visual = { Icon: any; color: string; kind: 'new' | 'update'; label: string }
type Toast = NotificationEvent

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// Humanise the channel for the neutral chip (skip generic/system values).
function channelLabel(ch?: string): string | null {
  const c = (ch || '').trim().toLowerCase()
  if (!c || c === 'system' || c === 'internal' || c === 'unknown') return null
  const map: Record<string, string> = {
    web: 'Web Form', webform: 'Web Form', web_form: 'Web Form',
    whatsapp: 'WhatsApp', wa: 'WhatsApp', email: 'Email',
    call: 'Call', phone: 'Call', score: 'Score Update', score_update: 'Score Update',
  }
  if (map[c]) return map[c]
  return c.replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
}

// New leads read green with a NEW LEAD tag; updates keep stage/score colours.
function eventVisual(ev: { type: string; content: string; metadata?: any }): Visual {
  if (ev.type === 'new_lead_scored') {
    return { Icon: MdPersonAdd, color: '#22C55E', kind: 'new', label: 'NEW LEAD' }
  }
  const text = (ev.content || '').toLowerCase()
  const newStage = String(ev.metadata?.newStage || '').toLowerCase()
  if (ev.type === 'score_change') {
    const up = (ev.metadata?.scoreDiff ?? 0) >= 0
    return { Icon: up ? MdTrendingUp : MdTrendingDown, color: up ? '#10B981' : '#EF4444', kind: 'update', label: 'UPDATE' }
  }
  if (newStage.includes('booking') || text.includes('booking made') || text.includes('booked')) {
    return { Icon: MdEvent, color: '#10B981', kind: 'update', label: 'BOOKING' }
  }
  if (newStage.includes('high intent') || text.includes('hot')) {
    return { Icon: MdLocalFireDepartment, color: '#EF4444', kind: 'update', label: 'HOT' }
  }
  if (newStage.includes('converted')) return { Icon: MdTrendingUp, color: '#10B981', kind: 'update', label: 'UPDATE' }
  if (newStage.includes('qualified')) return { Icon: MdArrowUpward, color: '#F97316', kind: 'update', label: 'UPDATE' }
  if (newStage.includes('lost') || newStage.includes('cold')) return { Icon: MdTrendingDown, color: '#6B7280', kind: 'update', label: 'UPDATE' }
  return { Icon: MdArrowUpward, color: '#8B5CF6', kind: 'update', label: 'UPDATE' }
}

export default function NotificationCenter() {
  const router = useRouter()
  const [events, setEvents] = useState<NotificationEvent[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const [open, setOpen] = useState(false)
  const [muted, setMuted] = useState(false)
  const [unread, setUnread] = useState(0)

  const knownIdsRef = useRef<Set<string>>(new Set())
  const baselineSetRef = useRef(false)
  const seenAtRef = useRef<string>('1970-01-01T00:00:00.000Z')
  const mutedRef = useRef(false)

  // Load persisted prefs (mute + last-seen). Sounds are owned by the shared
  // sound-prefs helper, which also honours the per-event Configure toggles.
  useEffect(() => {
    try {
      const m = localStorage.getItem(MUTED_KEY) === '1'
      setMuted(m); mutedRef.current = m
      const s = localStorage.getItem(SEEN_AT_KEY)
      if (s) seenAtRef.current = s
    } catch { /* ignore */ }
  }, [])

  const playSound = useCallback((kind: 'new' | 'update') => {
    // Master-mute + per-event gating both live in playEventSound.
    playEventSound(kind)
  }, [])

  const recomputeUnread = useCallback((evs: NotificationEvent[]) => {
    const seenAt = new Date(seenAtRef.current).getTime()
    setUnread(evs.filter((e) => new Date(e.timestamp).getTime() > seenAt).length)
  }, [])

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/notifications', { credentials: 'include' })
      if (!res.ok) return
      const data = await res.json()
      const incoming: NotificationEvent[] = Array.isArray(data.events) ? data.events : []

      if (!baselineSetRef.current) {
        // First poll after a (re)load. Don't blast the whole backlog, but DO
        // surface what you missed while away: toast the latest UNSEEN events
        // (newer than the persisted last-seen), capped at 2. Everything older
        // stays in the bell drawer with the unread badge. Founder: "whatever
        // notification I miss should come in — latest two, older in the list."
        incoming.forEach((e) => knownIdsRef.current.add(e.id))
        baselineSetRef.current = true
        setEvents(incoming)
        recomputeUnread(incoming)
        const seenAt = new Date(seenAtRef.current).getTime()
        const missed = incoming.filter((e) => new Date(e.timestamp).getTime() > seenAt)
        if (missed.length > 0) {
          setToasts(missed.slice(0, 2))
          playSound(missed.some((e) => e.type === 'new_lead_scored') ? 'new' : 'update')
        }
        return
      }

      const fresh = incoming.filter((e) => !knownIdsRef.current.has(e.id))
      if (fresh.length > 0) {
        fresh.forEach((e) => knownIdsRef.current.add(e.id))
        // Only ever surface the latest TWO as toasts — newest on top. Anything
        // beyond that lives behind the "View all notifications" button. Keeps
        // the corner stack from blasting 3-4 cards at once.
        setToasts((prev) => [...fresh.slice(0, 2), ...prev].slice(0, 2))
        // New leads take sound priority over plain updates.
        playSound(fresh.some((e) => e.type === 'new_lead_scored') ? 'new' : 'update')
      }
      setEvents(incoming)
      recomputeUnread(incoming)
    } catch { /* network blip — retry next tick */ }
  }, [playSound, recomputeUnread])

  // Poll on mount + interval (visible only) + on tab focus.
  useEffect(() => {
    poll()
    const id = setInterval(() => { if (document.visibilityState === 'visible') poll() }, POLL_MS)
    const onVis = () => { if (document.visibilityState === 'visible') poll() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [poll])

  // Auto-dismiss toasts after 6s.
  useEffect(() => {
    if (toasts.length === 0) return
    const timers = toasts.map((t) =>
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 6000),
    )
    return () => timers.forEach(clearTimeout)
  }, [toasts])

  const markAllSeen = useCallback(() => {
    const newest = events[0]?.timestamp || new Date().toISOString()
    seenAtRef.current = newest
    try { localStorage.setItem(SEEN_AT_KEY, newest) } catch { /* ignore */ }
    setUnread(0)
  }, [events])

  const openDrawer = useCallback(() => { setOpen(true); markAllSeen() }, [markAllSeen])

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m
      mutedRef.current = next
      try { localStorage.setItem(MUTED_KEY, next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }, [])

  const goToLead = useCallback(() => { setOpen(false); router.push('/dashboard/leads') }, [router])

  return (
    <>
      {/* Bell — fixed top-right, sits left of the home page's snapshot button. */}
      <button
        onClick={openDrawer}
        className="fixed z-[60] flex items-center justify-center rounded-full shadow-lg transition hover:opacity-90"
        style={{
          // Stacked beneath the snapshot "eye" button. Filled blue so it reads
          // clearly on a light dashboard (the outline version was near-invisible).
          top: '54px',
          right: '20px',
          width: '36px',
          height: '36px',
          backgroundColor: 'var(--button-bg)',
          border: '1px solid var(--border-primary)',
          color: 'var(--text-button)',
        }}
        aria-label="Notifications"
        title="Notifications"
      >
        {unread > 0 ? <MdNotificationsActive size={20} /> : <MdNotificationsNone size={20} />}
        {unread > 0 && (
          <span
            className="absolute flex items-center justify-center text-[10px] font-bold text-white rounded-full"
            style={{ top: '-4px', right: '-4px', minWidth: '18px', height: '18px', padding: '0 4px', backgroundColor: '#EF4444' }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Slide-out activity drawer */}
      {open && (
        <div className="fixed inset-0 z-[70]" aria-modal="true" role="dialog">
          {/* Backdrop */}
          <div
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(0,0,0,0.45)', animation: 'wc-fade-in 160ms ease' }}
            onClick={() => setOpen(false)}
          />
          {/* Panel — full-height, right side (the nav rail owns the left edge) */}
          <div
            className="absolute top-0 right-0 h-full flex flex-col shadow-2xl"
            style={{
              width: '380px',
              maxWidth: '92vw',
              backgroundColor: 'var(--bg-secondary)',
              borderLeft: '1px solid var(--border-primary)',
              animation: 'wc-slide-in 220ms cubic-bezier(0.2,0,0,1)',
            }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border-primary)' }}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Recent Activity</h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={toggleMute}
                  className="p-1.5 rounded-md transition-colors"
                  style={{ color: muted ? 'var(--text-muted)' : 'var(--accent-primary)' }}
                  title={muted ? 'Sound off — click to unmute' : 'Sound on — click to mute'}
                  aria-label={muted ? 'Unmute notifications' : 'Mute notifications'}
                >
                  {muted ? <MdVolumeOff size={18} /> : <MdVolumeUp size={18} />}
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded-md transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                  aria-label="Close"
                >
                  <MdClose size={18} />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1">
              {events.length === 0 ? (
                <p className="text-sm text-center py-12" style={{ color: 'var(--text-secondary)' }}>No status changes yet</p>
              ) : (
                events.map((ev) => {
                  const v = eventVisual(ev)
                  return (
                    <button
                      key={ev.id}
                      onClick={goToLead}
                      className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors border-b"
                      style={{ borderColor: 'var(--border-primary)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                    >
                      <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${v.color}22`, color: v.color }}>
                        <v.Icon size={16} />
                      </span>
                      <span className="flex-1 min-w-0">
                        {v.kind === 'new' && (
                          <span className="inline-block text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded mb-1" style={{ backgroundColor: `${v.color}22`, color: v.color }}>
                            {v.label}
                          </span>
                        )}
                        <span className="block text-sm" style={{ color: 'var(--text-primary)' }}>{ev.content}</span>
                        <span className="block text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{timeAgo(ev.timestamp)}</span>
                      </span>
                    </button>
                  )
                })
              )}
            </div>

            <div className="px-4 py-2.5 border-t flex-shrink-0" style={{ borderColor: 'var(--border-primary)' }}>
              <button onClick={goToLead} className="text-xs font-medium hover:underline" style={{ color: 'var(--accent-primary)' }}>
                View all leads →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast stack — bottom-right. At most the latest TWO cards, then a
          frosted "View all notifications" button that opens the full drawer.
          Narrow + clean (reference panel was too wide). */}
      {toasts.length > 0 && (
        <div className="fixed z-[80] flex flex-col gap-2" style={{ bottom: '20px', right: '20px', width: '340px', maxWidth: 'calc(100vw - 32px)' }}>
          {toasts.slice(0, 2).map((t) => {
            const v = eventVisual(t)
            const chan = channelLabel(t.channel)
            return (
              <div
                key={t.id}
                onClick={goToLead}
                className="flex items-start gap-3 px-3.5 py-3 rounded-xl shadow-2xl cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                  borderLeft: `3px solid ${v.color}`,
                  animation: 'wc-notif-in 220ms cubic-bezier(0.2,0,0,1)',
                }}
              >
                <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${v.color}22`, color: v.color }}>
                  <v.Icon size={16} />
                </span>
                <span className="flex-1 min-w-0">
                  {/* top row: time + dismiss */}
                  <span className="flex items-start justify-between gap-2">
                    <span className="block text-sm font-medium leading-snug" style={{ color: 'var(--text-primary)' }}>{t.content}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setToasts((prev) => prev.filter((x) => x.id !== t.id)) }}
                      className="p-0.5 -mt-0.5 -mr-0.5 rounded flex-shrink-0"
                      style={{ color: 'var(--text-secondary)' }}
                      aria-label="Dismiss"
                    >
                      <MdClose size={15} />
                    </button>
                  </span>
                  {/* chips */}
                  <span className="flex items-center gap-1.5 mt-1.5">
                    <span className="inline-block text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded" style={{ backgroundColor: `${v.color}22`, color: v.color }}>
                      {v.label}
                    </span>
                    {chan && (
                      <span className="inline-block text-[9px] font-semibold tracking-wide px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                        {chan}
                      </span>
                    )}
                    <span className="ml-auto text-[11px]" style={{ color: 'var(--text-secondary)' }}>{timeAgo(t.timestamp)}</span>
                  </span>
                  {/* action */}
                  <span className="block text-[11px] font-medium mt-1.5 hover:underline" style={{ color: v.color }}>View lead →</span>
                </span>
              </div>
            )
          })}
          <button
            onClick={openDrawer}
            className="flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-xl text-xs font-medium transition hover:opacity-90"
            style={{
              background: 'color-mix(in srgb, var(--bg-secondary) 65%, transparent)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              border: '1px solid var(--border-primary)',
              color: 'var(--text-primary)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            }}
          >
            View all notifications{unread > 0 ? ` (${unread})` : ''} →
          </button>
        </div>
      )}

      <style jsx global>{`
        @keyframes wc-notif-in {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes wc-slide-in {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
        @keyframes wc-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </>
  )
}
