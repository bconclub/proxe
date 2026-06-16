'use client'

/**
 * NotificationCenter — site-wide status-change notifications.
 *
 *   1. A bell (fixed, top-right) with an unread count → slide-out activity
 *      drawer listing recent status changes.
 *   2. Toasts that pop bottom-right when NEW status changes arrive.
 *   3. A sound on each new change (distinct tones for NEW LEADS vs UPDATES),
 *      with a persisted mute toggle.
 *
 * Data: polls /api/dashboard/notifications (lead_stage_changes-backed). The
 * first poll sets a baseline so a backlog doesn't blast you on load.
 *
 * Sounds + mute/enable prefs are owned by @/lib/sound-prefs (shared with the
 * Settings "Notifications & Sounds" panel and the page-ready cue). Sound files
 * live in public/sounds/ (new-lead.mp3, update.mp3, page-load.mp3).
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
const SEEN_AT_KEY = 'bcon-notif-seen-at'
const MUTED_KEY = 'bcon-notif-muted'

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

export default function NotificationCenter({ inline = false }: { inline?: boolean }) {
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
  // sound-prefs helper, which also honours the per-event Settings toggles.
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
        incoming.forEach((e) => knownIdsRef.current.add(e.id))
        baselineSetRef.current = true
        setEvents(incoming)
        recomputeUnread(incoming)
        return
      }

      const fresh = incoming.filter((e) => !knownIdsRef.current.has(e.id))
      if (fresh.length > 0) {
        fresh.forEach((e) => knownIdsRef.current.add(e.id))
        setToasts((prev) => [...fresh.slice(0, 3), ...prev].slice(0, 4))
        playSound(fresh.some((e) => e.type === 'new_lead_scored') ? 'new' : 'update')
      }
      setEvents(incoming)
      recomputeUnread(incoming)
    } catch { /* network blip — retry next tick */ }
  }, [playSound, recomputeUnread])

  useEffect(() => {
    poll()
    const id = setInterval(() => { if (document.visibilityState === 'visible') poll() }, POLL_MS)
    const onVis = () => { if (document.visibilityState === 'visible') poll() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [poll])

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
      {/* Bell — fixed top-right, sits beneath the snapshot button. */}
      <button
        onClick={openDrawer}
        className={`${inline ? 'relative' : 'fixed shadow-lg'} z-[60] flex items-center justify-center rounded-full transition hover:opacity-90`}
        style={{
          ...(inline
            ? { backgroundColor: 'var(--accent-subtle)', border: '1px solid var(--accent-primary)', color: 'var(--accent-primary)' }
            : { top: '54px', right: '20px', backgroundColor: '#3B82F6', border: '1px solid rgba(255,255,255,0.6)', color: '#ffffff' }),
          width: '36px',
          height: '36px',
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
          <div
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(0,0,0,0.45)', animation: 'bcon-fade-in 160ms ease' }}
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute top-0 right-0 h-full flex flex-col shadow-2xl"
            style={{
              width: '380px',
              maxWidth: '92vw',
              backgroundColor: 'var(--bg-secondary)',
              borderLeft: '1px solid var(--border-primary)',
              animation: 'bcon-slide-in 220ms cubic-bezier(0.2,0,0,1)',
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

      {/* Toast stack — bottom-right. */}
      <div className="fixed z-[80] flex flex-col gap-2" style={{ bottom: '20px', right: '20px', maxWidth: 'calc(100vw - 40px)' }}>
        {toasts.map((t) => {
          const v = eventVisual(t)
          return (
            <div
              key={t.id}
              onClick={goToLead}
              className="flex items-start gap-3 px-4 py-3 rounded-xl shadow-2xl cursor-pointer"
              style={{
                width: '320px',
                maxWidth: 'calc(100vw - 40px)',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderLeft: `3px solid ${v.color}`,
                animation: 'bcon-notif-in 220ms cubic-bezier(0.2,0,0,1)',
              }}
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
                <span className="block text-sm" style={{ color: 'var(--text-primary)' }}>{t.content}</span>
                <span className="block text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>just now</span>
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); setToasts((prev) => prev.filter((x) => x.id !== t.id)) }}
                className="p-0.5 rounded flex-shrink-0"
                style={{ color: 'var(--text-secondary)' }}
                aria-label="Dismiss"
              >
                <MdClose size={16} />
              </button>
            </div>
          )
        })}
      </div>

      <style jsx global>{`
        @keyframes bcon-notif-in {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes bcon-slide-in {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
        @keyframes bcon-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </>
  )
}
