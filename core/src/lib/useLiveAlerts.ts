'use client'

/**
 * useLiveAlerts - the dashboard's "something just happened" poller.
 *
 * Mounted ONCE, in DashboardLayout, so it runs on every dashboard page rather
 * than only on the Overview (the old bell lived inside FounderDashboard, which
 * meant a founder sitting on Chats or Leads all day was never told anything).
 * Its output feeds two places: the sidebar bell's unread badge + drawer, and
 * the Chats nav badge.
 *
 * Behaviour worth knowing:
 *   - The FIRST call has no `since`, so the server just hands back its clock.
 *     That baseline is deliberate: opening a tab must not replay (and ping for)
 *     everything that arrived overnight.
 *   - The cursor lives in a ref, NOT localStorage. Two open tabs each keep
 *     their own cursor, so both get alerted instead of one silently eating the
 *     other's window.
 *   - Polling pauses while the tab is hidden and catches up on the way back.
 *     A backgrounded tab shouldn't burn a Supabase read every 20s.
 *   - One sound per poll, not one per row: a burst of 12 leads pings once.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { playSound } from './sound-prefs'
import type { DashboardAlert } from '@/app/api/dashboard/alerts/route'

const POLL_MS = 20_000
const FEED_CAP = 50
const FEED_KEY = 'proxe-alert-feed'
const SEEN_KEY = 'proxe-alert-seen-at'

export interface LiveAlerts {
  /** newest first, capped at FEED_CAP */
  alerts: DashboardAlert[]
  /** alerts newer than the last time the drawer was opened */
  unread: number
  /** unread subset that are inbound messages - drives the Chats nav badge */
  unreadMessages: number
  /** call when the drawer opens: everything currently listed becomes read */
  markAllSeen: () => void
}

function readFeed(): DashboardAlert[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = JSON.parse(localStorage.getItem(FEED_KEY) || '[]')
    return Array.isArray(raw) ? raw.slice(0, FEED_CAP) : []
  } catch { return [] }
}
function readSeenAt(): string {
  if (typeof window === 'undefined') return ''
  try { return localStorage.getItem(SEEN_KEY) || '' } catch { return '' }
}

export function useLiveAlerts(): LiveAlerts {
  const [alerts, setAlerts] = useState<DashboardAlert[]>([])
  const [seenAt, setSeenAt] = useState<string>('')

  // Server clock of the last successful poll. In a ref so changing it never
  // re-renders and never re-creates the interval.
  const cursorRef = useRef<string | null>(null)
  // Guards against overlapping polls when a request outlives the interval.
  const inFlightRef = useRef(false)

  // Rehydrate the previous feed so a hard refresh doesn't blank the bell.
  useEffect(() => {
    setAlerts(readFeed())
    setSeenAt(readSeenAt())
  }, [])

  const poll = useCallback(async () => {
    if (inFlightRef.current) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    inFlightRef.current = true
    try {
      const since = cursorRef.current
      const url = since ? `/api/dashboard/alerts?since=${encodeURIComponent(since)}` : '/api/dashboard/alerts'
      const res = await fetch(url, { credentials: 'include', cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      const now: string | undefined = data?.now
      const fresh: DashboardAlert[] = Array.isArray(data?.alerts) ? data.alerts : []

      // Advance the cursor even on an empty poll, otherwise the window keeps
      // widening and every poll re-reads the same rows.
      if (now) cursorRef.current = now

      if (fresh.length === 0) return

      setAlerts((prev) => {
        // Dedupe by id: a row can straddle two polls if clocks drift slightly.
        const known = new Set(prev.map((a) => a.id))
        const added = fresh.filter((a) => !known.has(a.id))
        if (added.length === 0) return prev
        // One sound per batch. A lead landing outranks a message.
        playSound(added.some((a) => a.kind === 'lead') ? 'new' : 'message')
        const next = [...added, ...prev].slice(0, FEED_CAP)
        try { localStorage.setItem(FEED_KEY, JSON.stringify(next)) } catch { /* private mode */ }
        return next
      })
    } catch {
      // Soft-fail. A dropped poll just means the next one covers a wider window.
    } finally {
      inFlightRef.current = false
    }
  }, [])

  useEffect(() => {
    void poll() // baseline call - establishes the cursor, returns nothing
    const id = setInterval(() => { void poll() }, POLL_MS)
    const onVis = () => { if (document.visibilityState === 'visible') void poll() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [poll])

  const markAllSeen = useCallback(() => {
    const stamp = new Date().toISOString()
    setSeenAt(stamp)
    try { localStorage.setItem(SEEN_KEY, stamp) } catch { /* private mode */ }
  }, [])

  const seenMs = seenAt ? Date.parse(seenAt) : 0
  const unreadList = alerts.filter((a) => Date.parse(a.timestamp) > seenMs)

  return {
    alerts,
    unread: unreadList.length,
    unreadMessages: unreadList.filter((a) => a.kind === 'message').length,
    markAllSeen,
  }
}
