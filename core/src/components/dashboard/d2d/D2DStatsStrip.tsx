'use client'

// KPI strip for the D2D Field Log — six rich cards computed from the visit set,
// matching the campaign mockup: icon tile + label, big value, trend vs last
// week, and a per-card footer (sparkline / progress bar / stacked lean bar /
// review action).

import { useMemo } from 'react'
import {
  MdHome, MdGroups, MdPhotoCamera, MdReportProblem, MdFavorite, MdSchedule,
  MdImage, MdArrowUpward,
} from 'react-icons/md'
import { VISITS, CAMPAIGN_STATS, fmt, D2D_LEAN, type D2DVisit } from '@/data/mock-d2d'

const NOW = Date.now()
// bucket a predicate's matches by day for the last `days` days (oldest→newest)
function dailySeries(visits: D2DVisit[], value: (v: D2DVisit) => number, days = 7): number[] {
  const buckets = new Array(days).fill(0)
  for (const v of visits) {
    const dayIx = Math.floor((NOW - new Date(v.visitedAt).getTime()) / 86_400_000)
    if (dayIx >= 0 && dayIx < days) buckets[days - 1 - dayIx] += value(v)
  }
  return buckets
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const w = 72, h = 30, max = Math.max(1, ...data)
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * w},${h - (d / max) * (h - 4) - 2}`).join(' ')
  const areaPts = `0,${h} ${pts} ${w},${h}`
  const gid = `sg-${color.replace('#', '')}`
  return (
    <svg width={w} height={h} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPts} fill={`url(#${gid})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

interface CardProps {
  icon: React.ComponentType<{ size?: number; color?: string }>
  tint: string
  label: string
  value: string
  trend: string
  footer: React.ReactNode
  spark?: { data: number[]; color: string }
}

function Card({ icon: Icon, tint, label, value, trend, footer, spark }: CardProps) {
  return (
    <div style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
          <span style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: `${tint}1F`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Icon size={18} color={tint} />
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)', lineHeight: 1.2 }}>{label}</span>
        </div>
        {spark && <Sparkline data={spark.data} color={spark.color} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 28, fontWeight: 700, lineHeight: 1, color: 'var(--text-primary)' }}>{value}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#22C55E', fontWeight: 600 }}>
        <MdArrowUpward size={12} /> {trend} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>vs May 5–11</span>
      </div>
      <div style={{ marginTop: 2 }}>{footer}</div>
    </div>
  )
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 6, borderRadius: 999, backgroundColor: 'var(--bg-tertiary, var(--bg-hover))', overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', backgroundColor: color, borderRadius: 999 }} />
    </div>
  )
}

const sub = (t: string) => <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{t}</span>

export default function D2DStatsStrip() {
  const c = CAMPAIGN_STATS
  const spark = useMemo(() => {
    const met = VISITS.filter((v) => v.outcome === 'met')
    return {
      households: dailySeries(VISITS, () => 1),
      members: dailySeries(met, (v) => v.survey?.membersSpokenTo ?? 0),
      photos: dailySeries(VISITS, (v) => v.photos.length),
      griev: dailySeries(met, (v) => (v.survey?.grievanceCategory ? 1 : 0)),
    }
  }, [])
  const membersAvg = (c.members / c.households).toFixed(1)
  const photosAvg = (c.photos / c.households).toFixed(1)
  const grievAvg = (c.grievances / c.households).toFixed(2)
  const plannedPct = Math.round((c.households / c.planned) * 100)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
      <Card icon={MdHome} tint="#22C55E" label="Households Visited" value={fmt(c.households)} trend="18%"
        spark={{ data: spark.households, color: '#22C55E' }}
        footer={<div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>{sub(`${fmt(c.planned)} planned`)}<span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{plannedPct}%</span></div>
          <ProgressBar pct={plannedPct} color="#22C55E" />
        </div>} />

      <Card icon={MdGroups} tint="#3B82F6" label="Members Spoken To" value={fmt(c.members)} trend="22%"
        spark={{ data: spark.members, color: '#3B82F6' }}
        footer={<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{sub(`${membersAvg} per visit (avg)`)}<MdGroups size={13} color="var(--text-muted)" /></div>} />

      <Card icon={MdPhotoCamera} tint="#A855F7" label="Photos Captured" value={fmt(c.photos)} trend="35%"
        spark={{ data: spark.photos, color: '#A855F7' }}
        footer={<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{sub(`${photosAvg} per visit (avg)`)}<MdImage size={13} color="var(--text-muted)" /></div>} />

      <Card icon={MdReportProblem} tint="#F59E0B" label="Grievances Logged" value={fmt(c.grievances)} trend="15%"
        spark={{ data: spark.griev, color: '#F59E0B' }}
        footer={<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{sub(`${grievAvg} per visit (avg)`)}<MdReportProblem size={13} color="var(--text-muted)" /></div>} />

      <Card icon={MdFavorite} tint="#22C55E" label="Support Pulse" value={`${c.supportPct}%`} trend="6pp"
        footer={<div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ display: 'flex', height: 6, borderRadius: 999, overflow: 'hidden', backgroundColor: 'var(--bg-tertiary, var(--bg-hover))' }}>
            {(['supporter', 'leaning', 'undecided', 'opposed'] as const).map((k) => {
              const pct = c.leanTotal ? (c.leanCounts[k] / c.leanTotal) * 100 : 0
              return <span key={k} style={{ width: `${pct}%`, backgroundColor: D2D_LEAN[k].color }} />
            })}
          </div>
          {sub(`${c.supportPct}% Supporter + Leaning`)}
        </div>} />

      <Card icon={MdSchedule} tint="#F59E0B" label="Follow-up Needed" value={fmt(c.followUp)} trend="8%"
        footer={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          {sub('Not home / revisit')}
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent-primary)', border: '1px solid var(--accent-primary)', borderRadius: 6, padding: '2px 9px', cursor: 'pointer' }}>Review</span>
        </div>} />
    </div>
  )
}
