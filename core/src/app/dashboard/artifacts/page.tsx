'use client'

// ARTIFACTS OVERVIEW — the product surface for the brand's artifact stack.
// One card per artifact: status, link, and the full feature checklist with
// per-feature status pills (live / wip / planned). Config-driven from
// getBrandConfig().artifacts — the feature list IS the roadmap.

import React from 'react'
import { useRouter } from 'next/navigation'
import { getBrandConfig } from '@/configs'
import type { ArtifactDef, ArtifactFeatureStatus } from '@/configs/types'
import { MdMap, MdMonitorHeart, MdDoorFront, MdCampaign, MdSensors, MdApps, MdOpenInNew, MdCheckCircle, MdBuildCircle, MdPending } from 'react-icons/md'

const ICONS: Record<string, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
  map: MdMap, pulse: MdMonitorHeart, door: MdDoorFront, megaphone: MdCampaign, radar: MdSensors,
}

const ARTIFACT_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  live: { label: 'LIVE', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  wip: { label: 'WIP', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  coming_soon: { label: 'SOON', color: 'var(--text-muted, #9ca3af)', bg: 'var(--bg-hover)' },
}

const FEATURE_META: Record<ArtifactFeatureStatus, { icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>; color: string; label: string }> = {
  live: { icon: MdCheckCircle, color: '#22c55e', label: 'Live' },
  wip: { icon: MdBuildCircle, color: '#f59e0b', label: 'WIP' },
  planned: { icon: MdPending, color: 'var(--text-muted, #9ca3af)', label: 'Planned' },
}

export default function ArtifactsPage() {
  const router = useRouter()
  const artifacts: ArtifactDef[] = getBrandConfig().artifacts || []

  const open = (a: ArtifactDef) => {
    if (!a.href) return
    if (a.external) window.open(a.href, '_blank', 'noopener,noreferrer')
    else router.push(a.href)
  }

  return (
    <div className="dashboard-artifacts-page">
      <div style={{ marginBottom: '18px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>Artifacts</h1>
        <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
          Every artifact runs on the same engine and the same people — one person, one intensity ladder (voter → supporter → volunteer → cadre), many lenses.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
        {artifacts.map((a) => {
          const Icon = ICONS[a.icon || ''] || MdApps
          const meta = ARTIFACT_STATUS[a.status] || ARTIFACT_STATUS.coming_soon
          const liveCount = (a.features || []).filter((f) => f.status === 'live').length
          return (
            <div
              key={a.id}
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: '14px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ width: '38px', height: '38px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-hover)', color: 'var(--accent-primary)', flexShrink: 0 }}>
                  <Icon size={20} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <span style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--text-primary)' }}>{a.name}</span>
                    <span style={{ fontSize: '8.5px', fontWeight: 700, letterSpacing: '0.06em', padding: '2px 6px', borderRadius: '4px', color: meta.color, backgroundColor: meta.bg }}>{meta.label}</span>
                  </div>
                  {a.description && <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '1px' }}>{a.description}</div>}
                </div>
                {a.href && (
                  <button
                    onClick={() => open(a)}
                    title={a.external ? 'Open in new tab' : 'Open'}
                    style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg-hover)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: '8px', padding: '5px 10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Open {a.external && <MdOpenInNew size={11} />}
                  </button>
                )}
              </div>

              {(a.features || []).length > 0 && (
                <>
                  <div style={{ height: '6px', background: 'var(--bg-hover)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.round((100 * liveCount) / (a.features!.length || 1))}%`, height: '100%', background: '#22c55e', borderRadius: '3px' }} />
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{liveCount} of {a.features!.length} features live</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {a.features!.map((f) => {
                      const fm = FEATURE_META[f.status] || FEATURE_META.planned
                      const FIcon = fm.icon
                      return (
                        <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '11.5px' }}>
                          <FIcon size={14} style={{ color: fm.color, flexShrink: 0 }} />
                          <span style={{ flex: 1, color: f.status === 'planned' ? 'var(--text-secondary)' : 'var(--text-primary)' }}>{f.name}</span>
                          <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.04em', color: fm.color, textTransform: 'uppercase' }}>{fm.label}</span>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
