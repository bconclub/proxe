import React from 'react'

// Shared person/lead avatar - a soft brand-tint circle with a thin ring and the
// initials in the brand colour. One source of truth so every dashboard surface
// (inbox, priority queue, calls, bookings…) renders the exact same avatar, and
// it stays on-brand automatically (--accent-* is each brand's own colour).
// No loud solid block; the brand colour ACCENTS, it doesn't shout.

export function initialsOf(name?: string | null): string {
  const n = (name || '').trim()
  if (!n) return 'U'
  const parts = n.split(/\s+/).filter(Boolean)
  const s = parts.length >= 2 ? parts[0][0] + parts[1][0] : n.slice(0, 2)
  return s.toUpperCase()
}

export default function InitialsAvatar({
  name,
  size = 32,
  square = false,
  className,
}: {
  name?: string | null
  size?: number
  /** rounded-square instead of a circle (matches surfaces that want a squircle) */
  square?: boolean
  className?: string
}) {
  return (
    <span
      className={className}
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: square ? Math.round(size * 0.3) : '50%',
        background: 'var(--accent-subtle)',
        color: 'var(--accent-primary)',
        border: '1px solid color-mix(in srgb, var(--accent-primary) 30%, transparent)',
        fontSize: Math.round(size * 0.4),
        fontWeight: 700,
        lineHeight: 1,
        letterSpacing: '0.01em',
        userSelect: 'none',
      }}
    >
      {initialsOf(name)}
    </span>
  )
}
