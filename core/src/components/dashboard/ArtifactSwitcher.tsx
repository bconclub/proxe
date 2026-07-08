'use client'

// Artifact switcher — dropdown on the sidebar brand header for brands that
// define `artifacts` in their config (POP: War Room, Pulse Punjab, D2D, Lead
// Now, Listener). Each artifact is a surface built on the same engine + person
// variables; this is the one place to jump between them.
//
// Rendered inside the sidebar header (position: relative container). The
// parent owns the open state; this component owns outside-click/Escape close.

import React, { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { ArtifactDef, ArtifactStatus } from '@/configs/types'
import {
  MdMap,
  MdMonitorHeart,
  MdDoorFront,
  MdCampaign,
  MdSensors,
  MdApps,
  MdOpenInNew,
  MdCheck,
} from 'react-icons/md'

// Config keeps icons as string keys (stays serializable); the mapping to real
// icon components lives here.
const ICONS: Record<string, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
  map: MdMap,
  pulse: MdMonitorHeart,
  door: MdDoorFront,
  megaphone: MdCampaign,
  radar: MdSensors,
}

const STATUS_META: Record<ArtifactStatus, { label: string; color: string; bg: string }> = {
  live: { label: 'LIVE', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.12)' },
  wip: { label: 'WIP', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' },
  coming_soon: { label: 'SOON', color: 'var(--text-muted, #9ca3af)', bg: 'var(--bg-hover)' },
}

interface ArtifactSwitcherProps {
  artifacts: ArtifactDef[]
  activeId?: string      // artifact matching the current route — highlighted + checked
  open: boolean
  onClose: () => void
}

export default function ArtifactSwitcher({ artifacts, activeId, open, onClose }: ArtifactSwitcherProps) {
  const router = useRouter()
  const panelRef = useRef<HTMLDivElement>(null)

  // Outside click + Escape close
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    // Defer registration so the click that opened the panel doesn't close it
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onPointerDown)
      document.addEventListener('keydown', onKeyDown)
    }, 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  const activate = (a: ArtifactDef) => {
    if (!a.href) return
    onClose()
    if (a.external) window.open(a.href, '_blank', 'noopener,noreferrer')
    else router.push(a.href)
  }

  return (
    <div
      ref={panelRef}
      className="artifact-switcher absolute rounded-lg shadow-xl"
      role="menu"
      aria-label="Artifacts"
      style={{
        top: '42px',
        left: '8px',
        width: '264px',
        zIndex: 70,
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border-primary)',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.35)',
        padding: '6px',
      }}
    >
      <div
        className="artifact-switcher-title flex items-center gap-1.5"
        style={{ padding: '4px 8px 6px', color: 'var(--text-secondary)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em' }}
      >
        <MdApps size={12} />
        ARTIFACTS
      </div>
      {artifacts.map((a) => {
        const Icon = ICONS[a.icon || ''] || MdApps
        const meta = STATUS_META[a.status] || STATUS_META.coming_soon
        const clickable = Boolean(a.href)
        const isActive = a.id === activeId
        return (
          <button
            key={a.id}
            role="menuitem"
            aria-current={isActive ? 'true' : undefined}
            disabled={!clickable}
            onClick={() => activate(a)}
            className="artifact-switcher-item flex items-center w-full text-left rounded-md"
            style={{
              gap: '10px',
              padding: '8px',
              backgroundColor: isActive ? 'var(--bg-hover)' : 'transparent',
              border: 'none',
              cursor: clickable ? 'pointer' : 'default',
              opacity: clickable ? 1 : 0.55,
            }}
            onMouseEnter={(e) => { if (clickable && !isActive) e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
            onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            <span
              className="flex items-center justify-center flex-shrink-0 rounded-md"
              style={{
                width: '30px',
                height: '30px',
                backgroundColor: isActive ? 'var(--accent-primary)' : 'var(--bg-hover)',
                color: isActive ? 'var(--white, #fff)' : 'var(--accent-primary)',
              }}
            >
              <Icon size={16} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="flex items-center" style={{ gap: '6px' }}>
                <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                  {a.name}
                </span>
                {a.external && <MdOpenInNew size={11} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />}
                <span
                  className="flex-shrink-0 rounded"
                  style={{
                    marginLeft: 'auto',
                    fontSize: '8.5px',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    padding: '1.5px 5px',
                    color: meta.color,
                    backgroundColor: meta.bg,
                  }}
                >
                  {meta.label}
                </span>
              </span>
              {a.description && (
                <span
                  className="block"
                  style={{ fontSize: '10.5px', color: 'var(--text-secondary)', lineHeight: 1.35, marginTop: '2px' }}
                >
                  {a.description}
                </span>
              )}
            </span>
            {isActive && <MdCheck size={15} style={{ flexShrink: 0, color: 'var(--accent-primary)' }} />}
          </button>
        )
      })}
    </div>
  )
}
