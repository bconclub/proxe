'use client'

import React from 'react'

const pulseStyle = `
@keyframes skeleton-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.8; }
}
`

export function SkeletonBlock({
  width = '100%',
  height = '16px',
  rounded = false,
  className = '',
}: {
  width?: string
  height?: string
  rounded?: boolean
  className?: string
}) {
  return (
    <>
      <style>{pulseStyle}</style>
      <div
        className={className}
        style={{
          width,
          height,
          borderRadius: rounded ? 9999 : 8,
          background: 'rgba(255,255,255,0.05)',
          animation: 'skeleton-pulse 1.5s ease-in-out infinite',
        }}
      />
    </>
  )
}

const DEFAULT_WIDTHS = ['100%', '80%', '60%']

export function SkeletonText({
  lines = 3,
  widths,
}: {
  lines?: number
  widths?: string[]
}) {
  const w = widths || DEFAULT_WIDTHS
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBlock key={i} width={w[i % w.length]} height="14px" />
      ))}
    </div>
  )
}

export function SkeletonCard({ children }: { children?: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--bg-secondary, rgba(255,255,255,0.02))',
        borderRadius: 'var(--border-radius-lg, 8px)',
        padding: '1rem',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {children || (
        <>
          <SkeletonBlock width="40%" height="14px" />
          <div style={{ marginTop: 12 }}>
            <SkeletonText lines={2} widths={['100%', '70%']} />
          </div>
        </>
      )}
    </div>
  )
}

export function SkeletonTable({
  rows = 5,
  cols = 5,
}: {
  rows?: number
  cols?: number
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', gap: 16, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonBlock key={i} width={`${60 + Math.round(Math.sin(i + 1) * 20 + 20)}px`} height="12px" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          style={{
            display: 'flex',
            gap: 16,
            padding: '12px 14px',
            borderBottom: '1px solid rgba(255,255,255,0.03)',
            animationDelay: `${r * 0.08}s`,
          }}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <SkeletonBlock
              key={c}
              width={c === 0 ? '120px' : `${50 + ((r + c) % 3) * 20}px`}
              height="14px"
            />
          ))}
        </div>
      ))}
    </div>
  )
}

// --- Page-level skeleton presets ---

export function OverviewSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i}>
            <SkeletonBlock width="50%" height="12px" />
            <div style={{ marginTop: 10 }}>
              <SkeletonBlock width="60%" height="28px" />
            </div>
          </SkeletonCard>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <SkeletonCard>
          <SkeletonBlock width="30%" height="12px" />
          <div style={{ marginTop: 12 }}><SkeletonBlock width="100%" height="160px" /></div>
        </SkeletonCard>
        <SkeletonCard>
          <SkeletonBlock width="30%" height="12px" />
          <div style={{ marginTop: 12 }}><SkeletonBlock width="100%" height="160px" /></div>
        </SkeletonCard>
      </div>
    </div>
  )
}

export function ConversationsSkeleton() {
  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* Left - conversation list */}
      <div style={{ width: 320, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.06)', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SkeletonBlock width="100%" height="32px" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <SkeletonBlock width="40px" height="40px" rounded />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <SkeletonBlock width="70%" height="12px" />
              <SkeletonBlock width="90%" height="10px" />
            </div>
          </div>
        ))}
      </div>
      {/* Middle - messages */}
      <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {[false, true, false, true, false].map((isRight, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: isRight ? 'flex-end' : 'flex-start' }}>
            <SkeletonBlock width={`${30 + (i % 3) * 15}%`} height={`${40 + (i % 2) * 20}px`} />
          </div>
        ))}
      </div>
      {/* Right - lead detail */}
      <div style={{ width: 300, flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.06)', padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <SkeletonBlock width="80px" height="80px" rounded />
        <SkeletonBlock width="60%" height="14px" />
        <SkeletonBlock width="40%" height="12px" />
        <div style={{ width: '100%', marginTop: 8 }}><SkeletonText lines={3} /></div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <SkeletonBlock width="80px" height="32px" />
          <SkeletonBlock width="80px" height="32px" />
        </div>
      </div>
    </div>
  )
}

export function LeadsSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SkeletonBlock width="260px" height="36px" />
      <div style={{ background: 'var(--bg-secondary, rgba(255,255,255,0.02))', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <SkeletonTable rows={8} cols={6} />
      </div>
    </div>
  )
}

export function TasksSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SkeletonBlock width="80px" height="20px" />
      <div style={{ display: 'flex', gap: 12 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i}>
            <SkeletonBlock width="50%" height="12px" />
            <div style={{ marginTop: 10 }}>
              <SkeletonBlock width="60%" height="28px" />
            </div>
          </SkeletonCard>
        ))}
      </div>
      <div style={{ background: 'var(--bg-secondary, rgba(255,255,255,0.02))', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', padding: 16 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'center' }}>
            <SkeletonBlock width="16px" height="16px" rounded />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <SkeletonBlock width={`${60 + (i % 3) * 15}%`} height="13px" />
              <SkeletonBlock width="40%" height="10px" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function BookingsSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <SkeletonBlock width="120px" height="20px" />
        <SkeletonBlock width="80px" height="32px" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {Array.from({ length: 7 }).map((_, i) => (
          <SkeletonBlock key={`h${i}`} width="100%" height="20px" />
        ))}
        {Array.from({ length: 35 }).map((_, i) => (
          <SkeletonBlock key={i} width="100%" height="60px" />
        ))}
      </div>
    </div>
  )
}
