import React from 'react'

// Shared lead-score ring - a donut whose arc + colour encode the lead's score
// tier (Hot ≥90 green · Warm ≥70 orange · Cold blue) with the score number in
// the centre. Used as the lead "avatar" across dashboards: a score reads at a
// glance far better than a name initial. When a lead has no score yet, the ring
// shows a neutral "-". One source of truth so every surface matches.

export function scoreVisual(score: number | null | undefined): { color: string; label: string } {
  const s = score ?? 0
  if (s >= 90) return { color: '#22C55E', label: 'Hot' }
  if (s >= 70) return { color: '#F97316', label: 'Warm' }
  return { color: '#3B82F6', label: 'Cold' }
}

export default function ScoreRing({
  score,
  size = 32,
}: {
  score: number | null | undefined
  size?: number
}) {
  const hasScore = score != null && score > 0
  const s = hasScore ? Math.max(0, Math.min(100, score as number)) : 0
  const color = hasScore ? scoreVisual(score).color : 'var(--text-muted)'
  const stroke = Math.max(2, Math.round(size * 0.085))
  const r = (size - stroke) / 2 - 1
  const c = 2 * Math.PI * r
  const dash = (s / 100) * c

  return (
    <span
      aria-hidden="true"
      style={{
        position: 'relative',
        width: size,
        height: size,
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-primary)" strokeWidth={stroke} />
        {hasScore && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${c - dash}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 400ms ease' }}
          />
        )}
      </svg>
      <span
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: Math.round(size * 0.36),
          fontWeight: 700,
          color: hasScore ? color : 'var(--text-muted)',
          userSelect: 'none',
        }}
      >
        {hasScore ? s : '-'}
      </span>
    </span>
  )
}
