'use client'

// Booth Campaigns tab: the campaigns running at booth level (progress, workers,
// live contact/support rates derived from visits) + a booth leaderboard.

import { useMemo } from 'react'
import {
  CAMPAIGNS, VISITS, WORKERS, districtColor, timeAgo,
  type BoothCampaign, type D2DVisit,
} from '@/data/mock-d2d'

function initials(name: string): string {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
}

function rates(visits: D2DVisit[]) {
  const total = visits.length
  const met = visits.filter((v) => v.outcome === 'met')
  const withLean = met.filter((v) => v.survey?.lean)
  const supportive = withLean.filter((v) => v.survey!.lean === 'supporter' || v.survey!.lean === 'leaning').length
  const flags = met.filter((v) => v.survey?.flagHung).length
  return {
    contact: total ? Math.round((met.length / total) * 100) : 0,
    support: withLean.length ? Math.round((supportive / withLean.length) * 100) : 0,
    flags,
  }
}

function CampaignCard({ c }: { c: BoothCampaign }) {
  const visits = useMemo(() => VISITS.filter((v) => v.constituency === c.constituency && c.booths.includes(v.boothNo)), [c])
  const r = useMemo(() => rates(visits), [visits])
  const pct = Math.min(100, Math.round((c.doorsDone / c.targetDoors) * 100))
  const workers = WORKERS.filter((w) => c.workerIds.includes(w.id))
  const active = c.status === 'active'
  const dist = districtColor(c.district)

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)',
        borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{c.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.4 }}>{c.description}</div>
        </div>
        <span
          style={{
            fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap',
            color: active ? '#F06C18' : '#22C55E',
            backgroundColor: active ? 'rgba(240,108,24,0.12)' : 'rgba(34,197,94,0.12)',
          }}
        >
          {active ? 'ACTIVE' : 'COMPLETED'}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-primary)' }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: dist }} />
          {c.constituency}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.booths.length} booths · {c.booths.map((b) => `#${b}`).join(', ')}</span>
      </div>

      {/* progress */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
          <span style={{ color: 'var(--text-secondary)' }}>{c.doorsDone} / {c.targetDoors} doors</span>
          <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{pct}%</span>
        </div>
        <div style={{ height: 7, borderRadius: 999, backgroundColor: 'var(--bg-tertiary, var(--bg-hover))', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', backgroundColor: active ? 'var(--accent-primary)' : '#22C55E', borderRadius: 999 }} />
        </div>
      </div>

      {/* mini KPIs */}
      <div style={{ display: 'flex', gap: 18 }}>
        {[
          { k: 'Contact', v: `${r.contact}%` },
          { k: 'Support', v: `${r.support}%` },
          { k: 'Flags', v: String(r.flags) },
        ].map((s) => (
          <div key={s.k}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{s.v}</div>
            <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.k}</div>
          </div>
        ))}
        {/* worker avatars */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
          {workers.map((w, i) => {
            let h = 0
            for (let j = 0; j < w.name.length; j++) h = (h * 31 + w.name.charCodeAt(j)) % 997
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={w.id}
                title={w.name}
                alt={w.name}
                src={`/unsplash/workers/worker-${(h % 8) + 1}.jpg`}
                onError={(e) => { const el = e.target as HTMLImageElement; el.outerHTML = `<span title=\"${w.name}\" style=\"width:26px;height:26px;border-radius:999px;margin-left:${i ? -8 : 0}px;background:rgba(240,108,24,0.18);color:var(--accent-primary);border:2px solid var(--bg-secondary);display:grid;place-items:center;font-size:10px;font-weight:700\">${initials(w.name)}</span>` }}
                style={{ width: 26, height: 26, borderRadius: 999, marginLeft: i ? -8 : 0, objectFit: 'cover', border: '2px solid var(--bg-secondary)' }}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

interface BoothRow {
  boothNo: number
  boothName: string
  constituency: string
  worker: string
  knocks: number
  support: number
  lastAt: string
}

function BoothLeaderboard() {
  const rows = useMemo<BoothRow[]>(() => {
    const map = new Map<number, D2DVisit[]>()
    for (const v of VISITS) {
      if (!map.has(v.boothNo)) map.set(v.boothNo, [])
      map.get(v.boothNo)!.push(v)
    }
    const out: BoothRow[] = []
    for (const [boothNo, vs] of map) {
      const met = vs.filter((v) => v.outcome === 'met')
      const withLean = met.filter((v) => v.survey?.lean)
      const supportive = withLean.filter((v) => v.survey!.lean === 'supporter' || v.survey!.lean === 'leaning').length
      const latest = vs.reduce((a, b) => (+new Date(b.visitedAt) > +new Date(a.visitedAt) ? b : a))
      out.push({
        boothNo,
        boothName: vs[0].boothName,
        constituency: vs[0].constituency,
        worker: vs[0].workerName,
        knocks: vs.length,
        support: withLean.length ? Math.round((supportive / withLean.length) * 100) : 0,
        lastAt: latest.visitedAt,
      })
    }
    return out.sort((a, b) => b.knocks - a.knocks)
  }, [])

  const TH: React.CSSProperties = { textAlign: 'left', padding: '9px 12px', fontSize: 10.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-primary)' }
  const TD: React.CSSProperties = { padding: '9px 12px', fontSize: 12.5, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-primary)' }

  return (
    <div style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-primary)' }}>
        Booth Leaderboard
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead>
            <tr>
              <th style={TH}>Booth</th>
              <th style={TH}>Constituency</th>
              <th style={TH}>Worker</th>
              <th style={{ ...TH, textAlign: 'right' }}>Knocks</th>
              <th style={{ ...TH, textAlign: 'right' }}>Support</th>
              <th style={{ ...TH, textAlign: 'right' }}>Last activity</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.boothNo}>
                <td style={TD}>
                  <span style={{ fontWeight: 600 }}>#{r.boothNo}</span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>{r.boothName}</span>
                </td>
                <td style={{ ...TD, color: 'var(--text-secondary)' }}>{r.constituency}</td>
                <td style={{ ...TD, color: 'var(--text-secondary)' }}>{r.worker}</td>
                <td style={{ ...TD, textAlign: 'right', fontWeight: 600 }}>{r.knocks}</td>
                <td style={{ ...TD, textAlign: 'right' }}>
                  <span style={{ color: r.support >= 50 ? '#22C55E' : r.support > 0 ? '#F59E0B' : 'var(--text-muted)', fontWeight: 600 }}>
                    {r.support}%
                  </span>
                </td>
                <td style={{ ...TD, textAlign: 'right', color: 'var(--text-muted)' }}>{timeAgo(r.lastAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function D2DCampaignsTab() {
  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
        {CAMPAIGNS.map((c) => (
          <CampaignCard key={c.id} c={c} />
        ))}
      </div>
      <BoothLeaderboard />
    </div>
  )
}
