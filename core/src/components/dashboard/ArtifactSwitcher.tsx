'use client'

// Artifact switcher - dropdown on the sidebar brand header for brands that
// define `artifacts` in their config (POP: War Room, Pulse Punjab, D2D, Lead
// Now, Listener). Each artifact is a surface built on the same engine + person
// variables; this is the one place to jump between them.
//
// Rendered inside the sidebar header (position: relative container). The
// parent owns the open state; this component owns outside-click/Escape close.

import React, { useEffect, useRef, useState } from 'react'
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
  MdSpaceDashboard,
  MdPushPin,
  MdOutlinePushPin,
} from 'react-icons/md'

// Pinned artifacts float to the top - always in CONFIG order (Overview → War
// Room → Door to Door → Listen → Pulse of Punjab), never in pin-click order.
const PINS_KEY = 'artifact-pins'

// Config keeps icons as string keys (stays serializable); the mapping to real
// icon components lives here.
const ICONS: Record<string, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
  grid: MdSpaceDashboard,
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
  activeId?: string      // artifact matching the current route - highlighted + checked
  open: boolean
  onClose: () => void
}

export default function ArtifactSwitcher({ artifacts, activeId, open, onClose }: ArtifactSwitcherProps) {
  const router = useRouter()
  const panelRef = useRef<HTMLDivElement>(null)
  const [pins, setPins] = useState<string[]>([])
  useEffect(() => {
    try { setPins(JSON.parse(localStorage.getItem(PINS_KEY) || '[]')) } catch {}
  }, [])
  const togglePin = (id: string) => {
    setPins((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      try { localStorage.setItem(PINS_KEY, JSON.stringify(next)) } catch {}
      // Broadcast so the sidebar nav can surface pinned artifacts live (same tab —
      // the native 'storage' event only fires in OTHER tabs).
      try { window.dispatchEvent(new CustomEvent('artifact-pins-changed', { detail: next })) } catch {}
      return next
    })
  }
  // pinned first, both groups keep the canonical config order
  const ordered = [...artifacts.filter((a) => pins.includes(a.id)), ...artifacts.filter((a) => !pins.includes(a.id))]

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
      {ordered.map((a) => {
        const Icon = ICONS[a.icon || ''] || MdApps
        const meta = STATUS_META[a.status] || STATUS_META.coming_soon
        const clickable = Boolean(a.href)
        const isActive = a.id === activeId
        const pinned = pins.includes(a.id)
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
                // bg-primary/text-primary invert correctly in every theme —
                // the bw themes set --accent-primary to pure white/black, which
                // made the active icon white-on-white.
                backgroundColor: isActive ? 'var(--accent-primary)' : 'var(--bg-hover)',
                color: isActive ? 'var(--bg-primary)' : 'var(--text-primary)',
              }}
            >
              <Icon size={16} />
            </span>
            {/* Clean rows: name only - no descriptions, no status badges */}
            <span className="flex-1 min-w-0 flex items-center" style={{ gap: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                {a.name}
              </span>
              {a.external && <MdOpenInNew size={12} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />}
            </span>
            {isActive && <MdCheck size={15} style={{ flexShrink: 0, color: 'var(--accent-primary)' }} />}
            <span
              role="button"
              aria-label={pinned ? `Unpin ${a.name}` : `Pin ${a.name}`}
              title={pinned ? 'Unpin' : 'Pin to top'}
              onClick={(e) => { e.stopPropagation(); togglePin(a.id) }}
              style={{ flexShrink: 0, display: 'flex', padding: 3, borderRadius: 6, cursor: 'pointer', color: pinned ? 'var(--accent-primary)' : 'var(--text-muted)', opacity: pinned ? 1 : 0.6 }}
            >
              {pinned ? <MdPushPin size={14} /> : <MdOutlinePushPin size={14} />}
            </span>
          </button>
        )
      })}
    </div>
  )
}
