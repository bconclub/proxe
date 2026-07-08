'use client'

// Booth Campaigns tab, laid out to the reference design:
// KPI strip (active campaigns / high priority booths / doors remaining /
// photos / members spoken to / support trend) → Priority Campaigns cards →
// Booth Priority Queue table, with a right rail (Priority Breakdown donut,
// Top Issues by Booth, Worker Allocation, Booths Needing Revisit).
// Everything derives from the mock D2D visit data; swap for live d2d_visits
// aggregates when the field app lands.

import React, { useMemo, useState } from 'react'
import {
  MdFlag, MdWarningAmber, MdDoorFront, MdPhotoCamera, MdGroups, MdTrendingUp,
  MdInfoOutline, MdChevronLeft, MdChevronRight, MdPlace, MdMoreVert, MdFileDownload,
} from 'react-icons/md'
import {
  CAMPAIGNS, VISITS, WORKERS, D2D_GRIEVANCE, timeAgo,
  type BoothCampaign, type D2DVisit, type GrievanceKey,
} from '@/data/mock-d2d'

const ORANGE = '#F06C18', GREEN = '#22C55E', RED = '#EF4444', AMBER = '#F59E0B', BLUE = '#3B82F6', PURPLE = '#A78BFA'
const MUT = 'var(--text-muted)', SEC = 'var(--text-secondary)', TXT = 'var(--text-primary)'
const CARD: React.CSSProperties = { backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 14 }

function initials(name: string): string {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
}
function workerPhoto(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997
  return `/unsplash/workers/worker-${(h % 8) + 1}.jpg`
}
function Avatar({ name, size = 24, overlap = false }: { name: string; size?: number; overlap?: boolean }) {
  const [broken, setBroken] = useState(false)
  const ml = overlap ? -8 : 0
  if (broken) return <span title={name} style={{ width: size, height: size, borderRadius: 999, marginLeft: ml, background: 'rgba(240,108,24,0.18)', color: ORANGE, border: '2px solid var(--bg-secondary)', display: 'grid', placeItems: 'center', fontSize: size * 0.38, fontWeight: 700, flexShrink: 0 }}>{initials(name)}</span>
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={workerPhoto(name)} alt={name} title={name} onError={() => setBroken(true)} style={{ width: size, height: size, borderRadius: 999, marginLeft: ml, objectFit: 'cover', border: '2px solid var(--bg-secondary)', flexShrink: 0 }} />
}

// tiny deterministic sparkline from a 7-bucket series
function Spark({ data, color, w = 84, h = 26 }: { data: number[]; color: string; w?: number; h?: number }) {
  const max = Math.max(...data, 1); const min = Math.min(...data, 0); const span = max - min || 1
  const pts = data.map((v, i) => `${(i / Math.max(data.length - 1, 1)) * w},${h - 3 - ((v - min) / span) * (h - 6)}`).join(' ')
  return <svg width={w} height={h} style={{ display: 'block' }}><polyline points={pts} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></svg>
}

// visits bucketed into the last 7 days (oldest → newest)
function series7(visits: D2DVisit[]): number[] {
  const now = Date.now()
  const out = new Array(7).fill(0)
  visits.forEach((v) => {
    const d = Math.floor((now - +new Date(v.visitedAt)) / 86400000)
    if (d >= 0 && d < 7) out[6 - d]++
  })
  return out
}

type Priority = 'HIGH' | 'MEDIUM' | 'LOW'
const PRIO_META: Record<Priority, { color: string }> = { HIGH: { color: RED }, MEDIUM: { color: AMBER }, LOW: { color: '#7a8aa0' } }
const prioPill = (p: Priority) => (
  <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.05em', padding: '2px 8px', borderRadius: 5, color: '#fff', background: PRIO_META[p].color }}>{p}</span>
)

interface BoothRow {
  boothNo: number; boothName: string; constituency: string; campaign: string | null
  priority: Priority; doorsLeft: number; doorsDone: number; doorsTarget: number
  contact: number; support: number; trend: number[]; lastAt: string; worker: string
}

function boothRows(): BoothRow[] {
  const byBooth = new Map<number, D2DVisit[]>()
  VISITS.forEach((v) => { if (!byBooth.has(v.boothNo)) byBooth.set(v.boothNo, []); byBooth.get(v.boothNo)!.push(v) })
  const out: BoothRow[] = []
  byBooth.forEach((vs, boothNo) => {
    const camp = CAMPAIGNS.find((c) => c.booths.includes(boothNo) && c.constituency === vs[0].constituency) || null
    const met = vs.filter((v) => v.outcome === 'met')
    const withLean = met.filter((v) => v.survey?.lean)
    const supportive = withLean.filter((v) => v.survey!.lean === 'supporter' || v.survey!.lean === 'leaning').length
    const contact = vs.length ? Math.round((met.length / vs.length) * 100) : 0
    const support = withLean.length ? Math.round((supportive / withLean.length) * 100) : 0
    // deterministic per-booth hash → varied booth size + realistic progress so
    // doors-left and the priority mix don't all collapse to "sparse = critical"
    const h = (boothNo * 73 + 17) % 100
    const target = camp ? Math.round(camp.targetDoors / camp.booths.length) : 140 + (h % 12) * 15 // ~140-305
    const donePct = camp ? Math.min(100, Math.round((camp.doorsDone / camp.targetDoors) * 100)) : 35 + ((boothNo * 37) % 60) // 35-94%
    const done = Math.min(target, Math.round((donePct / 100) * target))
    const priority: Priority =
      camp?.status === 'completed' || donePct >= 90 ? 'LOW'
      : support < 45 || donePct < 30 ? 'HIGH'
      : h < 30 ? 'LOW' : h < 66 ? 'MEDIUM' : 'HIGH'
    const latest = vs.reduce((a, b) => (+new Date(b.visitedAt) > +new Date(a.visitedAt) ? b : a))
    out.push({
      boothNo, boothName: vs[0].boothName, constituency: vs[0].constituency, campaign: camp?.name || null,
      priority, doorsLeft: Math.max(0, target - done), doorsDone: done, doorsTarget: target,
      contact, support, trend: series7(vs), lastAt: latest.visitedAt, worker: latest.workerName,
    })
  })
  const rank: Record<Priority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }
  return out.sort((a, b) => rank[a.priority] - rank[b.priority] || b.doorsLeft - a.doorsLeft)
}

// ── KPI strip ──────────────────────────────────────────────────────────────
function Kpi({ icon, color, label, value, delta, up, spark }: { icon: React.ReactNode; color: string; label: string; value: string; delta: string; up: boolean; spark: number[] }) {
  return (
    <div style={{ ...CARD, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${color}1f`, color, flexShrink: 0 }}>{icon}</span>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: SEC }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1, color: TXT }}>{value}</div>
          <div style={{ fontSize: 9.5, fontWeight: 700, marginTop: 3, color: up ? GREEN : RED }}>{up ? '↗' : '↘'} {delta} <span style={{ color: MUT, fontWeight: 500 }}>vs last 7 days</span></div>
        </div>
        <Spark data={spark} color={color} />
      </div>
    </div>
  )
}

// ── Priority Campaigns card ────────────────────────────────────────────────
function CampaignCard({ c, prio }: { c: BoothCampaign; prio: Priority | 'COMPLETED' }) {
  const visits = useMemo(() => VISITS.filter((v) => v.constituency === c.constituency && c.booths.includes(v.boothNo)), [c])
  const met = visits.filter((v) => v.outcome === 'met')
  const withLean = met.filter((v) => v.survey?.lean)
  const supportive = withLean.filter((v) => v.survey!.lean === 'supporter' || v.survey!.lean === 'leaning').length
  const contact = visits.length ? Math.round((met.length / visits.length) * 100) : 0
  const support = withLean.length ? Math.round((supportive / withLean.length) * 100) : 0
  const flags = met.filter((v) => v.survey?.flagHung).length
  const pct = Math.min(100, Math.round((c.doorsDone / c.targetDoors) * 100))
  const workers = WORKERS.filter((w) => c.workerIds.includes(w.id))
  const active = c.status === 'active'
  const done = prio === 'COMPLETED'
  const prioColor = done ? GREEN : PRIO_META[prio as Priority].color
  return (
    <div style={{ ...CARD, padding: 16, display: 'flex', flexDirection: 'column', gap: 11, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: TXT, minWidth: 0 }}>{c.name}</div>
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', padding: '2px 8px', borderRadius: 5, whiteSpace: 'nowrap', color: active ? ORANGE : GREEN, backgroundColor: active ? 'rgba(240,108,24,0.12)' : 'rgba(34,197,94,0.12)', border: `1px solid ${active ? 'rgba(240,108,24,0.35)' : 'rgba(34,197,94,0.35)'}` }}>
          {active ? 'ACTIVE' : 'COMPLETED'}
        </span>
      </div>
      <div style={{ fontSize: 11.5, color: SEC, lineHeight: 1.45, minHeight: 32 }}>{c.description}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, flexWrap: 'wrap' }}>
        <MdPlace size={13} color={ORANGE} />
        <b style={{ color: TXT }}>{c.constituency}</b>
        <span style={{ color: MUT }}>Booths: {c.booths.map((b) => `#${b}`).join(', ')}</span>
      </div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
          <span style={{ color: SEC }}>{c.doorsDone} / {c.targetDoors} doors</span>
          <b style={{ color: TXT }}>{pct}%</b>
        </div>
        <div style={{ height: 6, borderRadius: 999, backgroundColor: 'var(--bg-tertiary, var(--bg-hover))', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', backgroundColor: active ? ORANGE : GREEN, borderRadius: 999 }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        {[['Contact', `${contact}%`], ['Support', `${support}%`], ['Flags', String(flags)]].map(([k, v]) => (
          <div key={k}>
            <div style={{ fontSize: 15, fontWeight: 800, color: TXT }}>{v}</div>
            <div style={{ fontSize: 9, color: MUT, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--border-primary)', paddingTop: 10 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.05em', color: prioColor }}>
          <span style={{ width: 7, height: 7, borderRadius: 7, background: prioColor }} />
          {done ? 'COMPLETED' : `${prio} PRIORITY`}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
          {workers.slice(0, 3).map((w, i) => <Avatar key={w.id} name={w.name} size={24} overlap={i > 0} />)}
          {workers.length > 3 && <span style={{ marginLeft: -8, width: 24, height: 24, borderRadius: 999, background: 'var(--bg-hover)', color: SEC, border: '2px solid var(--bg-secondary)', display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 700 }}>+{workers.length - 3}</span>}
        </span>
        <button style={{ fontSize: 11, fontWeight: 700, padding: '5px 13px', borderRadius: 8, cursor: 'pointer', border: done ? '1px solid var(--border-primary)' : 'none', background: done ? 'transparent' : prio === 'HIGH' ? ORANGE : 'var(--bg-hover)', color: done ? SEC : prio === 'HIGH' ? '#fff' : TXT }}>
          {done ? 'View' : prio === 'HIGH' ? 'Review' : 'Assign'}
        </button>
      </div>
    </div>
  )
}

// ── Right rail pieces ──────────────────────────────────────────────────────
function RailTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
      <span style={{ fontSize: 12.5, fontWeight: 800, color: TXT }}>{children}</span>
      <MdInfoOutline size={12} color={MUT as string} />
      <span style={{ marginLeft: 'auto' }}>{right}</span>
    </div>
  )
}

function PriorityDonut({ rows }: { rows: BoothRow[] }) {
  const counts: [Priority, number, string][] = [
    ['HIGH', rows.filter((r) => r.priority === 'HIGH').length, RED],
    ['MEDIUM', rows.filter((r) => r.priority === 'MEDIUM').length, AMBER],
    ['LOW', rows.filter((r) => r.priority === 'LOW').length, GREEN],
  ]
  const total = rows.length || 1
  const size = 108; const c = size / 2; const rOut = 50; const rIn = 34
  let angle = -90
  const pt = (r: number, deg: number): [number, number] => [c + r * Math.cos((deg * Math.PI) / 180), c + r * Math.sin((deg * Math.PI) / 180)]
  const segs = counts.filter(([, n]) => n > 0).map(([p, n, col]) => {
    const sweep = (n / total) * 360; const from = angle; const to = angle + sweep; angle = to
    const large = sweep > 180 ? 1 : 0
    const [x1, y1] = pt(rOut, from); const [x2, y2] = pt(rOut, Math.max(to - 1.5, from + 0.5))
    const [x3, y3] = pt(rIn, Math.max(to - 1.5, from + 0.5)); const [x4, y4] = pt(rIn, from)
    return <path key={p} d={`M ${x1} ${y1} A ${rOut} ${rOut} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${rIn} ${rIn} 0 ${large} 0 ${x4} ${y4} Z`} fill={col} />
  })
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <svg width={size} height={size} style={{ flexShrink: 0 }}>
        {segs}
        <text x={c} y={c - 2} fontSize={17} fontWeight={800} fill="var(--text-primary)" textAnchor="middle">{rows.length}</text>
        <text x={c} y={c + 13} fontSize={8.5} fill="var(--text-secondary)" textAnchor="middle">Booths</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: 1 }}>
        {counts.map(([p, n, col]) => (
          <span key={p} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <span style={{ width: 8, height: 8, borderRadius: 8, background: col }} />
            <span style={{ color: SEC, textTransform: 'capitalize' }}>{p.toLowerCase()}</span>
            <b style={{ marginLeft: 'auto', color: TXT }}>{n}</b>
            <span style={{ color: MUT, minWidth: 38, textAlign: 'right' }}>({Math.round((n / total) * 100)}%)</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ── the tab ────────────────────────────────────────────────────────────────
const PER_PAGE = 8

export default function D2DCampaignsTab() {
  const [page, setPage] = useState(1)
  const rows = useMemo(boothRows, [])
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE))
  const shown = rows.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  // KPI derivations
  const activeCampaigns = CAMPAIGNS.filter((c) => c.status === 'active').length
  const highBooths = rows.filter((r) => r.priority === 'HIGH').length
  // doors remaining across the WHOLE booth universe (campaign scale), not just
  // the 5 headline campaigns' booths
  const doorsRemaining = rows.reduce((a, r) => a + r.doorsLeft, 0)
  const photos = VISITS.reduce((a, v) => a + (v.photos?.length || 0), 0)
  const spoken = VISITS.reduce((a, v) => a + (v.survey?.membersSpokenTo || 0), 0)
  const withLean = VISITS.filter((v) => v.survey?.lean)
  const supportTrend = withLean.length ? Math.round((withLean.filter((v) => v.survey!.lean === 'supporter' || v.survey!.lean === 'leaning').length / withLean.length) * 100) : 0
  const allSeries = series7(VISITS)

  // right rail derivations
  const issueCounts = useMemo(() => {
    const m = new Map<GrievanceKey, number>()
    VISITS.forEach((v) => { const g = v.survey?.grievanceCategory; if (g) m.set(g, (m.get(g) || 0) + 1) })
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [])
  const workerAlloc = useMemo(() => {
    const m = new Map<string, Set<number>>()
    VISITS.forEach((v) => { if (!m.has(v.workerName)) m.set(v.workerName, new Set()); m.get(v.workerName)!.add(v.boothNo) })
    const totalBooths = rows.length || 1
    return [...m.entries()].map(([name, booths]) => ({ name, booths: booths.size, pct: Math.round((booths.size / totalBooths) * 100) }))
      .sort((a, b) => b.booths - a.booths).slice(0, 5)
  }, [rows.length])
  const revisits = useMemo(() => {
    const seen = new Set<number>()
    return VISITS.filter((v) => v.outcome === 'revisit' && !seen.has(v.boothNo) && seen.add(v.boothNo)).slice(0, 3)
  }, [])

  const campPrio: (Priority | 'COMPLETED')[] = CAMPAIGNS.map((c, i) => (c.status === 'completed' ? 'COMPLETED' : i === 0 ? 'HIGH' : 'MEDIUM'))
  const issueMax = Math.max(...issueCounts.map(([, n]) => n), 1)

  const TH: React.CSSProperties = { textAlign: 'left', padding: '9px 12px', fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: MUT, borderBottom: '1px solid var(--border-primary)', whiteSpace: 'nowrap' }
  const TD: React.CSSProperties = { padding: '9px 12px', fontSize: 12, color: TXT, borderBottom: '1px solid var(--border-primary)', verticalAlign: 'middle' }

  return (
    <div className="d2d-campaigns-grid" style={{ padding: '18px 22px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 16, alignItems: 'start' }}>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <Kpi icon={<MdFlag size={16} />} color={GREEN} label="Active Campaigns" value={String(activeCampaigns)} delta="2" up spark={allSeries.map((v, i) => v + i)} />
          <Kpi icon={<MdWarningAmber size={16} />} color={RED} label="High Priority Booths" value={String(highBooths)} delta="20%" up spark={allSeries.map((v, i) => v * ((i % 3) + 1))} />
          <Kpi icon={<MdDoorFront size={16} />} color={BLUE} label="Doors Remaining" value={doorsRemaining.toLocaleString('en-IN')} delta="8%" up={false} spark={allSeries.map((v, i) => 20 - v + (i % 4))} />
          <Kpi icon={<MdPhotoCamera size={16} />} color={PURPLE} label="Photos Collected" value={String(photos)} delta="35%" up spark={allSeries.map((v, i) => v + (i % 3))} />
          <Kpi icon={<MdGroups size={16} />} color={'#38bdf8'} label="Members Spoken To" value={String(spoken)} delta="24%" up spark={allSeries.map((v, i) => v * 2 + (i % 2))} />
          <Kpi icon={<MdTrendingUp size={16} />} color={GREEN} label="Support Trend (7d)" value={`${supportTrend}%`} delta="7pp" up spark={allSeries.map((v, i) => 50 + v + i * 2)} />
        </div>

        {/* Priority Campaigns */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: TXT }}>Priority Campaigns</span>
            <MdInfoOutline size={13} color={MUT as string} />
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 5 }}>
              <button style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 8, color: TXT, cursor: 'pointer', display: 'flex', padding: 4 }}><MdChevronLeft size={15} /></button>
              <button style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 8, color: TXT, cursor: 'pointer', display: 'flex', padding: 4 }}><MdChevronRight size={15} /></button>
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12 }}>
            {CAMPAIGNS.map((c, i) => <CampaignCard key={c.id} c={c} prio={campPrio[i]} />)}
          </div>
        </div>

        {/* Booth Priority Queue */}
        <div style={{ ...CARD, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '13px 16px', borderBottom: '1px solid var(--border-primary)' }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: TXT }}>Booth Priority Queue</span>
            <MdInfoOutline size={13} color={MUT as string} />
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 7, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: SEC, background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 8, padding: '5px 10px' }}>Priority: High to Low ▾</span>
              <button style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: TXT, background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 8, padding: '5px 11px', cursor: 'pointer' }}><MdFileDownload size={13} /> Export</button>
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
              <thead>
                <tr>
                  <th style={TH}>Booth</th><th style={TH}>Constituency / Area</th><th style={TH}>Campaign</th><th style={TH}>Priority</th>
                  <th style={TH}>Doors Left</th><th style={TH}>Contact Rate</th><th style={TH}>Support</th><th style={TH}>Issue Trend (7d)</th>
                  <th style={TH}>Last Activity</th><th style={TH}>Assigned Worker</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const donePct = r.doorsTarget ? Math.round((r.doorsDone / r.doorsTarget) * 100) : 0
                  return (
                    <tr key={r.boothNo}>
                      <td style={TD}>
                        <b>#{r.boothNo}</b>
                        <span style={{ display: 'block', fontSize: 10, color: MUT, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.boothName}</span>
                      </td>
                      <td style={{ ...TD, color: SEC }}>{r.constituency}</td>
                      <td style={{ ...TD, color: SEC, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.campaign || '—'}</td>
                      <td style={TD}>{prioPill(r.priority)}</td>
                      <td style={TD}>
                        <b style={{ fontSize: 13 }}>{r.doorsLeft}</b> <span style={{ fontSize: 10, color: MUT }}>({r.doorsDone} / {r.doorsTarget})</span>
                        <div style={{ height: 4, width: 90, borderRadius: 3, background: 'var(--bg-hover)', marginTop: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${donePct}%`, height: '100%', background: ORANGE, borderRadius: 3 }} />
                        </div>
                      </td>
                      <td style={TD}>
                        <b>{r.contact}%</b>
                        <div style={{ height: 4, width: 70, borderRadius: 3, background: 'var(--bg-hover)', marginTop: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${r.contact}%`, height: '100%', background: GREEN, borderRadius: 3 }} />
                        </div>
                      </td>
                      <td style={TD}>
                        <b>{r.support}%</b>
                        <div style={{ height: 4, width: 70, borderRadius: 3, background: 'var(--bg-hover)', marginTop: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${r.support}%`, height: '100%', background: GREEN, borderRadius: 3 }} />
                        </div>
                      </td>
                      <td style={TD}><Spark data={r.trend} color={r.priority === 'HIGH' ? RED : r.priority === 'MEDIUM' ? AMBER : GREEN} w={72} h={22} /></td>
                      <td style={{ ...TD, color: MUT, whiteSpace: 'nowrap' }}>{timeAgo(r.lastAt)}</td>
                      <td style={TD}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <Avatar name={r.worker} size={22} />
                          <span style={{ color: SEC, whiteSpace: 'nowrap' }}>{r.worker}</span>
                          <MdMoreVert size={14} color={MUT as string} style={{ marginLeft: 'auto', cursor: 'pointer' }} />
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px' }}>
            <span style={{ fontSize: 11, color: MUT }}>Showing {(page - 1) * PER_PAGE + 1} to {Math.min(page * PER_PAGE, rows.length)} of {rows.length} booths</span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} style={pgBtn(false)}><MdChevronLeft size={14} /></button>
              {Array.from({ length: pages }, (_, i) => i + 1).slice(0, 6).map((n) => (
                <button key={n} onClick={() => setPage(n)} style={pgBtn(n === page)}>{n}</button>
              ))}
              <button onClick={() => setPage((p) => Math.min(pages, p + 1))} style={pgBtn(false)}><MdChevronRight size={14} /></button>
            </span>
          </div>
        </div>
      </div>

      {/* ── right rail ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ ...CARD, padding: 14 }}>
          <RailTitle>Priority Breakdown</RailTitle>
          <PriorityDonut rows={rows} />
          <div style={{ textAlign: 'right', marginTop: 8 }}><span style={{ fontSize: 10.5, fontWeight: 700, color: ORANGE, cursor: 'pointer' }}>View all booths →</span></div>
        </div>

        <div style={{ ...CARD, padding: 14 }}>
          <RailTitle>Top Issues by Booth (7d)</RailTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {issueCounts.map(([g, n], i) => {
              const meta = D2D_GRIEVANCE[g]
              return (
                <div key={g} style={{ display: 'grid', gridTemplateColumns: '16px 52px 1fr 22px 36px', alignItems: 'center', gap: 6, fontSize: 11 }}>
                  <span style={{ width: 14, height: 14, borderRadius: 14, background: `${meta.color}22`, color: meta.color, display: 'grid', placeItems: 'center', fontSize: 8.5, fontWeight: 800 }}>{i + 1}</span>
                  <span style={{ color: SEC, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.label}</span>
                  <div style={{ height: 5, borderRadius: 3, background: 'var(--bg-hover)', overflow: 'hidden' }}>
                    <div style={{ width: `${(n / issueMax) * 100}%`, height: '100%', background: meta.color, borderRadius: 3 }} />
                  </div>
                  <b style={{ textAlign: 'right', color: TXT }}>{n}</b>
                  <span style={{ fontSize: 9.5, fontWeight: 700, textAlign: 'right', color: i % 2 ? RED : GREEN }}>{i % 2 ? '↘' : '↗'} {8 + i * 6}%</span>
                </div>
              )
            })}
          </div>
          <div style={{ textAlign: 'right', marginTop: 8 }}><span style={{ fontSize: 10.5, fontWeight: 700, color: ORANGE, cursor: 'pointer' }}>View all issues →</span></div>
        </div>

        <div style={{ ...CARD, padding: 14 }}>
          <RailTitle>Worker Allocation</RailTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {workerAlloc.map((w) => (
              <div key={w.name} style={{ display: 'grid', gridTemplateColumns: '26px minmax(0,1fr) 52px 44px 30px', alignItems: 'center', gap: 6, fontSize: 11 }}>
                <Avatar name={w.name} size={22} />
                <span style={{ color: TXT, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
                <span style={{ color: MUT, fontSize: 10 }}>{w.booths} booth{w.booths > 1 ? 's' : ''}</span>
                <div style={{ height: 5, borderRadius: 3, background: 'var(--bg-hover)', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, w.pct * 3)}%`, height: '100%', background: AMBER, borderRadius: 3 }} />
                </div>
                <b style={{ textAlign: 'right', color: TXT }}>{w.pct}%</b>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'right', marginTop: 8 }}><span style={{ fontSize: 10.5, fontWeight: 700, color: ORANGE, cursor: 'pointer' }}>View all workers →</span></div>
        </div>

        <div style={{ ...CARD, padding: 14 }}>
          <RailTitle right={<span style={{ fontSize: 10.5, fontWeight: 700, color: ORANGE, cursor: 'pointer' }}>View all</span>}>Booths Needing Revisit</RailTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {revisits.length === 0 && <span style={{ fontSize: 11, color: MUT }}>No revisits pending.</span>}
            {revisits.map((v, i) => (
              <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11 }}>
                <b style={{ color: TXT }}>#{v.boothNo}</b>
                <span style={{ color: SEC, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.boothName}</span>
                <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 5, color: '#fff', background: i < 2 ? RED : AMBER }}>{i < 2 ? 'High' : 'Medium'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`@media (max-width: 1150px){ .d2d-campaigns-grid{ grid-template-columns: minmax(0,1fr) !important; } }`}</style>
    </div>
  )
}

const pgBtn = (active: boolean): React.CSSProperties => ({
  minWidth: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: 'pointer',
  border: '1px solid var(--border-primary)',
  background: active ? ORANGE : 'transparent', color: active ? '#fff' : 'var(--text-secondary)',
})
