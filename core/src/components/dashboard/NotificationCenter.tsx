'use client'

/**
 * NotificationCenter - the bell, and the only place notifications live.
 *
 * It carries two feeds, split into tabs:
 *
 *   1. Activity - live leads + inbound messages, polled by useLiveAlerts and
 *      passed in from DashboardLayout. This is new: until now nothing in the
 *      product told a human "a lead just came in" while they sat on another
 *      page, and the bell itself only existed on the Overview.
 *   2. What's new - curated product updates with version numbers
 *      (@/lib/product-updates), unchanged from the 2026-07-10 founder call.
 *
 * The trigger renders two ways:
 *   - variant="sidebar" (default) - a nav row in the left rail, so the bell is
 *     reachable from EVERY dashboard page, not just the home page.
 *   - variant="topbar" - the old 36px circular button, kept for any header
 *     that still wants it inline.
 *
 * Opening the drawer marks the active tab's items seen (localStorage for
 * updates, the useLiveAlerts cursor for activity).
 */

import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { PRODUCT_UPDATES, type ProductUpdate } from '@/lib/product-updates'
import { getCurrentBrandId } from '@/configs'
import type { DashboardAlert } from '@/app/api/dashboard/alerts/route'
import {
  MdNotificationsNone,
  MdNotificationsActive,
  MdClose,
  MdRocketLaunch,
  MdLanguage,
  MdWhatsapp,
  MdCall,
  MdChatBubble,
} from 'react-icons/md'
import { FaFacebookF, FaInstagram } from 'react-icons/fa'

const UPDATE_SEEN_KEY = 'wc-notif-update-seen'

function fmtDate(iso: string): string {
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return iso }
}

/** "just now" / "12m" / "3h" / "Tue" - compact enough for a 380px drawer. */
function fmtAgo(iso: string): string {
  const ms = Date.now() - Date.parse(iso)
  if (!Number.isFinite(ms)) return ''
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  } catch { return '' }
}

/**
 * Channel glyph + brand colour for an alert row. The channel icon IS the label -
 * a generic bubble next to a "MESSAGE" chip next to the word "WhatsApp" was
 * three things saying one thing. Keys match the labels the alerts route emits
 * (labelChannel), matched loosely so an unmapped raw channel still lands
 * somewhere sensible.
 */
const CHANNEL_ICONS: { match: string[]; Icon: React.ComponentType<{ size?: number }>; color: string }[] = [
  { match: ['whatsapp'], Icon: MdWhatsapp, color: '#25D366' },
  { match: ['instagram'], Icon: FaInstagram, color: '#E4405F' },
  { match: ['meta', 'facebook'], Icon: FaFacebookF, color: '#1877F2' },
  { match: ['call', 'voice', 'phone'], Icon: MdCall, color: '#A855F7' },
  { match: ['web', 'site', 'chat'], Icon: MdLanguage, color: '#3B82F6' },
]

function channelGlyph(channel: string) {
  const c = (channel || '').toLowerCase()
  const hit = CHANNEL_ICONS.find((x) => x.match.some((m) => c.includes(m)))
  return hit || { Icon: MdChatBubble, color: '#7a8aa0' }
}

// Updates visible to THIS brand, newest first (source array is curated newest-first).
function visibleUpdates(): ProductUpdate[] {
  const brandId = getCurrentBrandId()
  return PRODUCT_UPDATES.filter((x) => !x.brands || x.brands.includes('*') || x.brands.includes(brandId))
}

/** One person's run of activity, collapsed into a single row. */
type AlertGroup = {
  key: string
  /** most recent event in the group - drives the row's time, preview and click */
  latest: DashboardAlert
  count: number
  /** the group contains a "new lead" event, not just messages */
  hasLead: boolean
}

/**
 * One row per PERSON, not per event.
 *
 * Six messages from two people used to render as six rows, each repeating the
 * name, so the drawer read as a wall rather than a list of who needs you. Now
 * a run from the same lead collapses to one row: their name, the latest thing
 * they said, and how many there were. Opening it goes to the lead, which is
 * where the rest of the thread lives anyway.
 *
 * Anonymous web chats (no leadId) are deliberately NOT grouped - they all share
 * the name "Website visitor", so keying on it would pile unrelated strangers
 * into one row.
 */
function groupAlerts(alerts: DashboardAlert[]): AlertGroup[] {
  const byKey = new Map<string, AlertGroup>()
  for (const a of alerts) {
    const key = a.leadId ? `lead:${a.leadId}` : `solo:${a.id}`
    const g = byKey.get(key)
    if (!g) {
      byKey.set(key, { key, latest: a, count: 1, hasLead: a.kind === 'lead' })
      continue
    }
    g.count += 1
    if (a.kind === 'lead') g.hasLead = true
    if (Date.parse(a.timestamp) > Date.parse(g.latest.timestamp)) g.latest = a
  }
  return [...byKey.values()].sort(
    (x, y) => Date.parse(y.latest.timestamp) - Date.parse(x.latest.timestamp)
  )
}

/**
 * Row body. The name is the row's heading, so strip the "Name: " the alerts
 * route prefixes onto message content rather than saying it twice.
 */
function previewOf(a: DashboardAlert): string {
  if (a.kind === 'lead') return 'came in'
  const prefix = `${a.leadName}: `
  return a.content.startsWith(prefix) ? a.content.slice(prefix.length) : a.content
}

export interface NotificationCenterProps {
  /** legacy alias for variant="topbar" */
  inline?: boolean
  variant?: 'sidebar' | 'topbar'
  /** sidebar only: show the label next to the icon (rail expanded) */
  expanded?: boolean
  /** live feed from useLiveAlerts (DashboardLayout owns the poller) */
  alerts?: DashboardAlert[]
  unreadAlerts?: number
  onAlertsSeen?: () => void
}

export default function NotificationCenter({
  inline = false,
  variant,
  expanded = true,
  alerts = [],
  unreadAlerts = 0,
  onAlertsSeen,
}: NotificationCenterProps) {
  const router = useRouter()
  const mode = variant || (inline ? 'topbar' : 'sidebar')
  const [open, setOpen] = useState(false)
  // The drawer is portalled to <body>. It has to be: the sidebar rail carries a
  // transform (md:translate-x-0), and a transformed ancestor becomes the
  // containing block for position:fixed descendants - so rendering the drawer
  // in place trapped it inside the 184px rail instead of the viewport.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const [tab, setTab] = useState<'activity' | 'updates'>('activity')
  const [unreadUpdates, setUnreadUpdates] = useState(0)
  const [updates, setUpdates] = useState<ProductUpdate[]>([])
  const [appVersion, setAppVersion] = useState<string | null>(null)

  // Client-only: resolve the brand's updates + how many are unseen.
  useEffect(() => {
    const ups = visibleUpdates()
    setUpdates(ups)
    let seen: string[] = []
    try { seen = JSON.parse(localStorage.getItem(UPDATE_SEEN_KEY) || '[]') } catch { /* ignore */ }
    setUnreadUpdates(ups.filter((u) => !seen.includes(u.id)).length)
  }, [])

  // Running version for the drawer footer (same source as the sidebar badge).
  useEffect(() => {
    fetch('/api/build-info')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.version) setAppVersion(d.version) })
      .catch(() => { /* footer just omits it */ })
  }, [])

  const markUpdatesSeen = useCallback(() => {
    try {
      const seen: string[] = JSON.parse(localStorage.getItem(UPDATE_SEEN_KEY) || '[]')
      const all = Array.from(new Set([...seen, ...visibleUpdates().map((u) => u.id)]))
      localStorage.setItem(UPDATE_SEEN_KEY, JSON.stringify(all))
    } catch { /* ignore */ }
    setUnreadUpdates(0)
  }, [])

  const openDrawer = useCallback(() => {
    setOpen(true)
    // Land on whichever feed actually has something waiting.
    const startTab = unreadAlerts > 0 || unreadUpdates === 0 ? 'activity' : 'updates'
    setTab(startTab)
    if (startTab === 'activity') onAlertsSeen?.()
    else markUpdatesSeen()
  }, [unreadAlerts, unreadUpdates, onAlertsSeen, markUpdatesSeen])

  const selectTab = useCallback((next: 'activity' | 'updates') => {
    setTab(next)
    if (next === 'activity') onAlertsSeen?.()
    else markUpdatesSeen()
  }, [onAlertsSeen, markUpdatesSeen])

  // A message has a thread to open. A brand-new lead often has none yet, so it
  // goes to the Leads table rather than a conversation that may not exist.
  const openAlert = useCallback((a: DashboardAlert) => {
    setOpen(false)
    if (a.kind === 'message' && a.leadId) router.push(`/dashboard/inbox?lead=${a.leadId}`)
    else router.push('/dashboard/leads')
  }, [router])

  const totalUnread = unreadAlerts + unreadUpdates
  const BellIcon = totalUnread > 0 ? MdNotificationsActive : MdNotificationsNone

  const badge = (extraStyle?: React.CSSProperties) => (
    totalUnread > 0 ? (
      <span
        className="flex items-center justify-center text-[10px] font-bold text-white rounded-full"
        style={{ minWidth: '18px', height: '18px', padding: '0 4px', backgroundColor: '#EF4444', ...extraStyle }}
      >
        {totalUnread > 99 ? '99+' : totalUnread}
      </span>
    ) : null
  )

  return (
    <>
      {mode === 'topbar' ? (
        <button
          onClick={openDrawer}
          className="relative z-[60] flex items-center justify-center rounded-full transition hover:opacity-90"
          style={{
            backgroundColor: 'var(--accent-subtle)',
            border: '1px solid var(--accent-primary)',
            color: 'var(--accent-primary)',
            width: '36px',
            height: '36px',
          }}
          aria-label="Notifications"
          title="Notifications"
        >
          <BellIcon size={20} />
          {badge({ position: 'absolute', top: '-4px', right: '-4px' })}
        </button>
      ) : (
        /* Sidebar rail row - mirrors the nav item geometry (40px icon box, 20px
           line-height) so it sits flush with Overview/Leads/Chats above it. */
        <button
          onClick={openDrawer}
          className="dashboard-layout-nav-item flex items-center w-full"
          style={{
            fontSize: '13px',
            fontWeight: 500,
            color: 'var(--text-secondary)',
            backgroundColor: 'transparent',
            margin: '2px 0',
            borderRadius: '8px',
            padding: '7px 10px 7px 0',
            width: !expanded ? '40px' : 'auto',
            position: 'relative',
            transition: 'background-color 180ms ease, color 180ms ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
          aria-label="Notifications"
          title="Notifications"
        >
          <span
            style={{ width: '40px', minWidth: '40px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'inherit', position: 'relative' }}
          >
            <BellIcon size={16} />
            {/* Collapsed rail has no room for a number - show a dot on the icon. */}
            {!expanded && totalUnread > 0 && (
              <span style={{ position: 'absolute', top: '-2px', right: '6px', width: '7px', height: '7px', borderRadius: '9999px', backgroundColor: '#EF4444' }} />
            )}
          </span>
          {expanded && (
            <>
              <span className="flex-1 truncate text-left" style={{ lineHeight: '20px' }}>Notifications</span>
              {badge()}
            </>
          )}
        </button>
      )}

      {/* Slide-out drawer - portalled to <body>, see the `mounted` note above. */}
      {open && mounted && createPortal(
        <div className="fixed inset-0 z-[70]" aria-modal="true" role="dialog">
          <div
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(0,0,0,0.45)', animation: 'wc-fade-in 160ms ease' }}
            onClick={() => setOpen(false)}
          />
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
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Notifications</h3>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-md transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                aria-label="Close"
              >
                <MdClose size={18} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex flex-shrink-0 border-b" style={{ borderColor: 'var(--border-primary)' }}>
              {([
                { key: 'activity' as const, label: 'Activity', count: unreadAlerts },
                { key: 'updates' as const, label: "What's new", count: unreadUpdates },
              ]).map(({ key, label, count }) => (
                <button
                  key={key}
                  onClick={() => selectTab(key)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors"
                  style={{
                    color: tab === key ? 'var(--accent-primary)' : 'var(--text-secondary)',
                    borderBottom: `2px solid ${tab === key ? 'var(--accent-primary)' : 'transparent'}`,
                  }}
                >
                  {label}
                  {count > 0 && (
                    <span className="text-[10px] font-bold text-white rounded-full px-1.5" style={{ backgroundColor: '#EF4444' }}>{count}</span>
                  )}
                </button>
              ))}
            </div>

            <div className="overflow-y-auto flex-1">
              {tab === 'activity' ? (
                alerts.length === 0 ? (
                  <p className="text-sm text-center py-12 px-6" style={{ color: 'var(--text-secondary)' }}>
                    Nothing yet. New leads and incoming messages land here while this tab is open.
                  </p>
                ) : (
                  groupAlerts(alerts).map((g) => {
                    const a = g.latest
                    const { Icon, color: tint } = channelGlyph(a.channel)
                    return (
                      <button
                        key={g.key}
                        onClick={() => openAlert(a)}
                        className="flex items-start gap-3 px-4 py-3 border-b w-full text-left transition-colors"
                        style={{ borderColor: 'var(--border-primary)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                      >
                        <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${tint}22`, color: tint }}>
                          <Icon size={16} />
                        </span>
                        <span className="flex-1 min-w-0">
                          {/* The person is the heading. Only the event TYPE needs
                              words - the channel is the icon on the left. */}
                          <span className="flex items-center gap-1.5 mb-1">
                            <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                              {a.leadName}
                            </span>
                            {g.hasLead && (
                              <span className="text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded uppercase flex-shrink-0" style={{ backgroundColor: '#10B98122', color: '#10B981' }}>
                                New lead
                              </span>
                            )}
                            <span className="text-[11px] ml-auto flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{fmtAgo(a.timestamp)}</span>
                          </span>
                          <span className="block text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{previewOf(a)}</span>
                          {g.count > 1 && (
                            <span className="block text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                              {g.hasLead ? `${g.count} updates` : `${g.count} messages`}
                            </span>
                          )}
                        </span>
                      </button>
                    )
                  })
                )
              ) : updates.length === 0 ? (
                <p className="text-sm text-center py-12" style={{ color: 'var(--text-secondary)' }}>No updates yet</p>
              ) : (
                updates.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-start gap-3 px-4 py-3 border-b"
                    style={{ borderColor: 'var(--border-primary)' }}
                  >
                    <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#6366F122', color: '#6366F1' }}>
                      <MdRocketLaunch size={16} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-1.5 mb-1">
                        {u.version && (
                          <span className="inline-block text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded" style={{ backgroundColor: '#6366F122', color: '#6366F1' }}>
                            v{u.version}
                          </span>
                        )}
                        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{fmtDate(u.date)}</span>
                      </span>
                      <span className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{u.title}</span>
                      {u.detail && <span className="block text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{u.detail}</span>}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="px-4 py-2.5 border-t flex-shrink-0 flex items-center justify-between" style={{ borderColor: 'var(--border-primary)' }}>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>PROXe{appVersion ? ` · v${appVersion}` : ''}</span>
              <a href="/dashboard/settings/notifications" className="text-xs" style={{ color: 'var(--text-secondary)' }}>Sound settings</a>
            </div>
          </div>
        </div>,
        document.body
      )}

      <style jsx global>{`
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
