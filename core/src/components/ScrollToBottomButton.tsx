'use client'

/**
 * ScrollToBottomButton - the "jump back down" control for every chat surface.
 *
 * Scroll up in a long thread and there was no way back except dragging: the
 * dashboard inbox, the Brain, the log-call chat and the customer widget all
 * shared the same dead end. This is the one control they all mount, so the
 * behaviour and the look stay identical everywhere.
 *
 * Usage - give it the ref of the ELEMENT THAT SCROLLS (the one with
 * overflow-y: auto), and make sure that element's positioned ancestor is the
 * chat pane, since the button is absolutely positioned:
 *
 *   const scrollRef = useRef<HTMLDivElement>(null)
 *   <div style={{ position: 'relative' }}>
 *     <div ref={scrollRef} style={{ overflowY: 'auto' }}>...messages...</div>
 *     <ScrollToBottomButton scrollRef={scrollRef} />
 *   </div>
 *
 * It hides itself when you are already at the bottom, so it costs nothing
 * visually in the common case.
 */

import { useCallback, useEffect, useState } from 'react'
import { MdKeyboardDoubleArrowDown } from 'react-icons/md'

/** How far off the bottom (px) before the button appears. */
const SHOW_AFTER_PX = 160

export interface ScrollToBottomButtonProps {
  scrollRef: React.RefObject<HTMLElement | null>
  /**
   * Re-check visibility when this changes - pass the message count so the
   * button reappears if new content lands while you are scrolled up.
   */
  watch?: unknown
  /** Unread-since-scroll-up count. Renders as a pill instead of a bare arrow. */
  count?: number
  /** bottom-right (default) or bottom-left of the pane. */
  side?: 'right' | 'left'
  /** Distance from the bottom of the pane, e.g. to clear a composer bar. */
  bottom?: number
  /** Extra inline styles (z-index bumps, tighter insets on mobile). */
  style?: React.CSSProperties
  title?: string
}

export default function ScrollToBottomButton({
  scrollRef,
  watch,
  count = 0,
  side = 'right',
  bottom = 16,
  style,
  title = 'Jump to latest',
}: ScrollToBottomButtonProps) {
  const [visible, setVisible] = useState(false)

  // Track distance from the bottom. Passive listener - this fires a lot and
  // must never block the scroll itself.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const check = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight
      setVisible(distance > SHOW_AFTER_PX)
    }
    check()
    el.addEventListener('scroll', check, { passive: true })
    // Content can grow without a scroll event (images loading, a streamed
    // reply). ResizeObserver catches those; older browsers just miss them.
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(check)
      ro.observe(el)
    }
    return () => {
      el.removeEventListener('scroll', check)
      ro?.disconnect()
    }
  }, [scrollRef, watch])

  const jump = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [scrollRef])

  if (!visible) return null

  return (
    <button
      type="button"
      onClick={jump}
      aria-label={title}
      title={title}
      className="proxe-scroll-to-bottom"
      style={{
        position: 'absolute',
        bottom: `${bottom}px`,
        [side]: '16px',
        zIndex: 20,
        display: 'flex',
        alignItems: 'center',
        gap: count > 0 ? '6px' : 0,
        height: '34px',
        minWidth: '34px',
        padding: count > 0 ? '0 12px 0 10px' : '0',
        justifyContent: 'center',
        borderRadius: '9999px',
        border: '1px solid var(--border-primary, rgba(0,0,0,0.1))',
        backgroundColor: 'var(--bg-secondary, #fff)',
        color: 'var(--text-primary, #111)',
        boxShadow: '0 4px 14px rgba(0,0,0,0.22)',
        cursor: 'pointer',
        // Fade in rather than pop - it appears mid-scroll, which is jarring.
        animation: 'proxe-stb-in 160ms ease',
        ...style,
      }}
    >
      <MdKeyboardDoubleArrowDown size={20} />
      {count > 0 && (
        <span style={{ fontSize: '12px', fontWeight: 600, lineHeight: 1 }}>
          {count > 99 ? '99+' : count}
        </span>
      )}
      <style jsx global>{`
        @keyframes proxe-stb-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </button>
  )
}
