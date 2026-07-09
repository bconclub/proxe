'use client'

/**
 * NotificationCenter — "what's new" only.
 *
 * The bell now carries EXACTLY one thing: product updates (curated in
 * @/lib/product-updates) with their version numbers. No lead activity, no
 * toasts, no sounds — founder call 2026-07-10: "notification should be all the
 * new updates with version numbering. That's the only thing it has to do."
 * (The old lead-stage feed lives on in git history if we ever want it back.)
 *
 *   1. Bell (top bar) with an unread count = updates this viewer hasn't seen.
 *   2. Click → slide-out "What's new" drawer listing every update visible to
 *      this brand, newest first, each with a version chip + date.
 *   3. Opening the drawer marks everything seen (localStorage).
 *
 * Footer shows the running app version from /api/build-info.
 */

import { useEffect, useState, useCallback } from 'react'
import { PRODUCT_UPDATES, type ProductUpdate } from '@/lib/product-updates'
import { getCurrentBrandId } from '@/configs'
import {
  MdNotificationsNone,
  MdNotificationsActive,
  MdClose,
  MdRocketLaunch,
} from 'react-icons/md'

const UPDATE_SEEN_KEY = 'wc-notif-update-seen'

function fmtDate(iso: string): string {
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return iso }
}

// Updates visible to THIS brand, newest first (source array is curated newest-first).
function visibleUpdates(): ProductUpdate[] {
  const brandId = getCurrentBrandId()
  return PRODUCT_UPDATES.filter((x) => !x.brands || x.brands.includes('*') || x.brands.includes(brandId))
}

export default function NotificationCenter({ inline = false }: { inline?: boolean }) {
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [updates, setUpdates] = useState<ProductUpdate[]>([])
  const [appVersion, setAppVersion] = useState<string | null>(null)

  // Client-only: resolve the brand's updates + how many are unseen.
  useEffect(() => {
    const ups = visibleUpdates()
    setUpdates(ups)
    let seen: string[] = []
    try { seen = JSON.parse(localStorage.getItem(UPDATE_SEEN_KEY) || '[]') } catch { /* ignore */ }
    setUnread(ups.filter((u) => !seen.includes(u.id)).length)
  }, [])

  // Running version for the drawer footer (same source as the sidebar badge).
  useEffect(() => {
    fetch('/api/build-info')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.version) setAppVersion(d.version) })
      .catch(() => { /* footer just omits it */ })
  }, [])

  const openDrawer = useCallback(() => {
    setOpen(true)
    // Opening = seen. Record every visible update id.
    try {
      const seen: string[] = JSON.parse(localStorage.getItem(UPDATE_SEEN_KEY) || '[]')
      const all = Array.from(new Set([...seen, ...visibleUpdates().map((u) => u.id)]))
      localStorage.setItem(UPDATE_SEEN_KEY, JSON.stringify(all))
    } catch { /* ignore */ }
    setUnread(0)
  }, [])

  return (
    <>
      {/* Bell — inline in the top bar (or fixed for legacy floating layouts). */}
      <button
        onClick={openDrawer}
        className={`${inline ? 'relative' : 'fixed shadow-lg'} z-[60] flex items-center justify-center rounded-full transition hover:opacity-90`}
        style={{
          ...(inline
            ? { backgroundColor: 'var(--accent-subtle)', border: '1px solid var(--accent-primary)', color: 'var(--accent-primary)' }
            : { top: '54px', right: '20px', backgroundColor: 'var(--button-bg)', border: '1px solid var(--border-primary)', color: 'var(--text-button)' }),
          width: '36px',
          height: '36px',
        }}
        aria-label="What's new"
        title="What's new"
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

      {/* Slide-out "What's new" drawer */}
      {open && (
        <div className="fixed inset-0 z-[70]" aria-modal="true" role="dialog">
          {/* Backdrop */}
          <div
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(0,0,0,0.45)', animation: 'wc-fade-in 160ms ease' }}
            onClick={() => setOpen(false)}
          />
          {/* Panel — full-height, right side */}
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
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>What&rsquo;s new</h3>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-md transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                aria-label="Close"
              >
                <MdClose size={18} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              {updates.length === 0 ? (
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
            </div>
          </div>
        </div>
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
