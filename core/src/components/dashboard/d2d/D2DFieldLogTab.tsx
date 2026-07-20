'use client'

// Field Log tab: full-width KPI strip, then a two-column body - left is the
// filter row + segregated leads table + drawer; right is the analytics rail.

import { useMemo, useState } from 'react'
import { MdTune } from 'react-icons/md'
import D2DStatsStrip from './D2DStatsStrip'
import D2DLeadsTable from './D2DLeadsTable'
import D2DVisitDrawer from './D2DVisitDrawer'
import D2DFieldRail from './D2DFieldRail'
import { VISITS, WORKERS, D2D_OUTCOME, type D2DVisit, type D2DOutcome } from '@/data/mock-d2d'

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ fontSize: 12.5, padding: '7px 10px', borderRadius: 8, backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', cursor: 'pointer', minWidth: 160 }}>
        {children}
      </select>
    </label>
  )
}

export default function D2DFieldLogTab() {
  const [constituency, setConstituency] = useState('all')
  const [outcome, setOutcome] = useState<'all' | D2DOutcome>('all')
  const [workerId, setWorkerId] = useState('all')
  const [booth, setBooth] = useState('all')

  const constituencies = useMemo(() => Array.from(new Set(VISITS.map((v) => v.constituency))).sort(), [])
  const booths = useMemo(() => Array.from(new Set(VISITS.map((v) => `${v.boothNo}`))).sort((a, b) => +a - +b), [])

  const filtered = useMemo(
    () => VISITS.filter((v) => {
      if (constituency !== 'all' && v.constituency !== constituency) return false
      if (outcome !== 'all' && v.outcome !== outcome) return false
      if (workerId !== 'all' && v.workerId !== workerId) return false
      if (booth !== 'all' && `${v.boothNo}` !== booth) return false
      return true
    }).sort((a, b) => +new Date(b.visitedAt) - +new Date(a.visitedAt)),
    [constituency, outcome, workerId, booth],
  )

  const [selected, setSelected] = useState<D2DVisit | null>(null)

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <D2DStatsStrip />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 18, alignItems: 'start' }} className="d2d-fieldlog-grid">
        {/* main column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Select label="Constituency" value={constituency} onChange={setConstituency}>
              <option value="all">All constituencies</option>
              {constituencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Select label="Outcome" value={outcome} onChange={(v) => setOutcome(v as any)}>
              <option value="all">All outcomes</option>
              {(Object.keys(D2D_OUTCOME) as D2DOutcome[]).map((o) => <option key={o} value={o}>{D2D_OUTCOME[o].label}</option>)}
            </Select>
            <Select label="Worker" value={workerId} onChange={setWorkerId}>
              <option value="all">All workers</option>
              {WORKERS.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
            <Select label="Booth / Area" value={booth} onChange={setBooth}>
              <option value="all">All booths</option>
              {booths.map((b) => <option key={b} value={b}>Booth {b}</option>)}
            </Select>
            <button style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 500, color: 'var(--text-secondary)', background: 'transparent', border: '1px solid var(--border-primary)', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', marginLeft: 'auto' }}>
              <MdTune size={15} /> More filters
            </button>
          </div>

          <D2DLeadsTable visits={filtered} onRowClick={setSelected} />
        </div>

        {/* right analytics rail */}
        <D2DFieldRail />
      </div>

      <D2DVisitDrawer visit={selected} onClose={() => setSelected(null)} />

      <style>{`@media (max-width: 1100px){ .d2d-fieldlog-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}
