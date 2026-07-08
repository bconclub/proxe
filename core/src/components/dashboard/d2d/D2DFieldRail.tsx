'use client'

// Right analytics rail for the D2D Field Log: Top Issues Today, Photo Evidence
// Collected, and Visit Outcome Split (donut) — all derived from the visit set.

import { useMemo } from 'react'
import {
  MdWaterDrop, MdBolt, MdWork, MdAddRoad, MdLocalHospital, MdSchool,
  MdAgriculture, MdWarning, MdMoreHoriz, MdArrowUpward,
} from 'react-icons/md'
import {
  VISITS, CAMPAIGN_STATS, fmt, D2D_GRIEVANCE, D2D_OUTCOME, type GrievanceKey,
} from '@/data/mock-d2d'

const GRV_ICON: Record<GrievanceKey, React.ComponentType<{ size?: number; color?: string }>> = {
  water: MdWaterDrop, power: MdBolt, jobs: MdWork, roads: MdAddRoad, health: MdLocalHospital,
  education: MdSchool, farm_debt: MdAgriculture, drugs: MdWarning, other: MdMoreHoriz,
}

function Panel({ title, action, children }: { title: string; action?: string; children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 14, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</span>
        {action && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent-primary)', cursor: 'pointer' }}>{action}</span>}
      </div>
      {children}
    </div>
  )
}

// deterministic small "trend" for each issue (illustrative), keyed by category
const ISSUE_TREND: Partial<Record<GrievanceKey, number>> = { water: 20, power: 8, roads: 10, jobs: 33, health: 50, farm_debt: 12, drugs: 6, education: 15, other: 4 }

function TopIssues() {
  const issues = CAMPAIGN_STATS.topIssues
  const max = Math.max(1, ...issues.map((i) => i.count))
  return (
    <Panel title="Top Issues This Week" action="View all">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {issues.map(({ cat, count }) => {
          const g = D2D_GRIEVANCE[cat]; const Icon = GRV_ICON[cat]
          return (
            <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon size={16} color={g.color} />
              <span style={{ fontSize: 12.5, color: 'var(--text-primary)', width: 62, flexShrink: 0 }}>{g.label}</span>
              <div style={{ flex: 1, height: 5, borderRadius: 999, backgroundColor: 'var(--bg-tertiary, var(--bg-hover))', overflow: 'hidden' }}>
                <div style={{ width: `${(count / max) * 100}%`, height: '100%', backgroundColor: g.color, borderRadius: 999 }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', width: 44, textAlign: 'right' }}>{fmt(count)}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1, fontSize: 10.5, fontWeight: 600, color: '#22C55E', width: 40, justifyContent: 'flex-end' }}>
                <MdArrowUpward size={11} />{ISSUE_TREND[cat] ?? 5}%
              </span>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

function PhotoEvidence() {
  const thumbs = useMemo(() => VISITS.flatMap((v) => v.photos).slice(0, 4), [])
  const more = CAMPAIGN_STATS.photos - thumbs.length
  return (
    <Panel title="Photo Evidence Collected" action="View all">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
        {thumbs.map((p) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={p.id} src={p.url} alt={p.label} title={p.label}
            style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border-primary)' }} />
        ))}
        <div style={{ display: 'grid', placeItems: 'center', aspectRatio: '1', borderRadius: 8, backgroundColor: 'var(--bg-tertiary, var(--bg-hover))', border: '1px solid var(--border-primary)' }}>
          <div style={{ textAlign: 'center', lineHeight: 1.1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>+{fmt(more)}</div>
            <div style={{ fontSize: 8, color: 'var(--text-muted)' }}>total</div>
          </div>
        </div>
      </div>
    </Panel>
  )
}

function OutcomeDonut() {
  const segs = CAMPAIGN_STATS.outcomeSplit
  const total = CAMPAIGN_STATS.households
  let acc = 0
  const stops = segs.map((s) => {
    const start = acc; acc += (s.count / (total || 1)) * 100
    return `${D2D_OUTCOME[s.outcome].color} ${start}% ${acc}%`
  }).join(', ')

  return (
    <Panel title="Visit Outcome Split">
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{ position: 'relative', width: 120, height: 120, flexShrink: 0 }}>
          <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: `conic-gradient(${stops})` }} />
          <div style={{ position: 'absolute', inset: 16, borderRadius: '50%', backgroundColor: 'var(--bg-secondary)', display: 'grid', placeItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{fmt(total)}</div>
              <div style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>Visits</div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
          {segs.map((s) => (
            <div key={s.outcome} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12 }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: D2D_OUTCOME[s.outcome].color, flexShrink: 0 }} />
              <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{D2D_OUTCOME[s.outcome].label}</span>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(s.count)}</span>
              <span style={{ color: 'var(--text-muted)', width: 36, textAlign: 'right' }}>({s.pct}%)</span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  )
}

export default function D2DFieldRail() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <TopIssues />
      <PhotoEvidence />
      <OutcomeDonut />
    </div>
  )
}
