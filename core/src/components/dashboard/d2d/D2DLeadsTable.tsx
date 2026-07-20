'use client'

// Segregated D2D leads table - one row per household knocked. Columns match the
// campaign mockup: Household · Worker · Booth/Area · Visit Outcome · Members
// Spoken To · Grievance · Support Lean · Photos (real thumbnails) · Last Visit.
// Client-side pagination. Row click → visit drawer.

import { useMemo, useState } from 'react'
import { MdGroups, MdArrowUpward, MdArrowDownward, MdMoreVert, MdChevronLeft, MdChevronRight } from 'react-icons/md'
import {
  D2D_OUTCOME, D2D_LEAN, D2D_GRIEVANCE, timeAgo, type D2DVisit, type D2DLean,
} from '@/data/mock-d2d'

const PER_PAGE = 10

function avatarColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return `hsl(${h}, 55%, 45%)`
}
function initials(name: string): string {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
}
// Demo worker portrait: deterministic per name from the 8 bundled photos in
// /unsplash/workers. Falls back to the initials disc if the image 404s.
function workerPhoto(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997
  return `/unsplash/workers/worker-${(h % 8) + 1}.jpg`
}
function WorkerAvatar({ name, size = 24 }: { name: string; size?: number }) {
  const [broken, setBroken] = useState(false)
  if (broken) {
    return <span style={{ width: size, height: size, borderRadius: 999, backgroundColor: avatarColor(name), color: '#fff', display: 'grid', placeItems: 'center', fontSize: size * 0.4, fontWeight: 700, flexShrink: 0 }}>{initials(name)}</span>
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={workerPhoto(name)} alt={name} onError={() => setBroken(true)}
      style={{ width: size, height: size, borderRadius: 999, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border-primary)' }} />
  )
}

function OutcomePill({ v }: { v: D2DVisit }) {
  const o = D2D_OUTCOME[v.outcome]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: o.color, whiteSpace: 'nowrap' }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: o.color }} />
      {o.label}
    </span>
  )
}

function GrievancePill({ cat }: { cat: keyof typeof D2D_GRIEVANCE }) {
  const g = D2D_GRIEVANCE[cat]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, color: g.color, backgroundColor: `${g.color}1F`, whiteSpace: 'nowrap' }}>
      <span style={{ width: 5, height: 5, borderRadius: 999, backgroundColor: g.color }} />{g.label}
    </span>
  )
}

function LeanCell({ lean }: { lean?: D2DLean }) {
  if (!lean) return <span style={{ color: 'var(--text-muted)' }}>-</span>
  const l = D2D_LEAN[lean]
  const up = lean === 'supporter' || lean === 'leaning'
  const flat = lean === 'undecided'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: l.color }}>
      {!flat && (up ? <MdArrowUpward size={13} /> : <MdArrowDownward size={13} />)}
      {l.label}
    </span>
  )
}

function PhotoThumbs({ v }: { v: D2DVisit }) {
  if (!v.photos.length) return <span style={{ color: 'var(--text-muted)' }}>-</span>
  const shown = v.photos.slice(0, 2)
  const extra = v.photos.length - shown.length
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {shown.map((p) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={p.id} src={p.url} alt={p.label} title={p.label} width={30} height={30}
          style={{ width: 30, height: 30, borderRadius: 6, objectFit: 'cover', border: '1px solid var(--border-primary)', flexShrink: 0 }} />
      ))}
      {extra > 0 && (
        <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)', backgroundColor: 'var(--bg-tertiary, var(--bg-hover))', borderRadius: 6, padding: '2px 5px' }}>+{extra}</span>
      )}
    </div>
  )
}

const TH: React.CSSProperties = {
  textAlign: 'left', padding: '10px 12px', fontSize: 10.5, fontWeight: 600,
  letterSpacing: '0.03em', textTransform: 'uppercase', color: 'var(--text-muted)',
  position: 'sticky', top: 0, backgroundColor: 'var(--bg-secondary)', zIndex: 1,
  borderBottom: '1px solid var(--border-primary)', whiteSpace: 'nowrap',
}
const TD: React.CSSProperties = { padding: '9px 12px', fontSize: 12.5, color: 'var(--text-primary)', verticalAlign: 'middle' }

export default function D2DLeadsTable({ visits, onRowClick }: { visits: D2DVisit[]; onRowClick: (v: D2DVisit) => void }) {
  const [page, setPage] = useState(0)
  const pageCount = Math.max(1, Math.ceil(visits.length / PER_PAGE))
  const cur = Math.min(page, pageCount - 1)
  const rows = useMemo(() => visits.slice(cur * PER_PAGE, cur * PER_PAGE + PER_PAGE), [visits, cur])
  const from = visits.length ? cur * PER_PAGE + 1 : 0
  const to = Math.min(visits.length, (cur + 1) * PER_PAGE)

  // compact page-number list with ellipsis
  const pages: (number | '…')[] = []
  for (let i = 0; i < pageCount; i++) {
    if (i < 3 || i === pageCount - 1 || Math.abs(i - cur) <= 1) pages.push(i)
    else if (pages[pages.length - 1] !== '…') pages.push('…')
  }

  return (
    <div style={{ border: '1px solid var(--border-primary)', borderRadius: 12, overflow: 'hidden', backgroundColor: 'var(--bg-secondary)' }}>
      {/* Mobile: card list - same visits, tap opens the same drawer */}
      <div className="md:hidden">
        {rows.length === 0 && (
          <div style={{ padding: '32px 12px', textAlign: 'center', fontSize: 12.5, color: 'var(--text-muted)' }}>No visits match these filters.</div>
        )}
        {rows.map((v) => {
          const o = D2D_OUTCOME[v.outcome]
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => onRowClick(v)}
              style={{
                display: 'flex', flexDirection: 'column', gap: 6, width: '100%', textAlign: 'left',
                padding: '12px', border: 'none', borderBottom: '1px solid var(--border-primary)',
                backgroundColor: 'transparent', cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {v.householdHead}
                </span>
                <OutcomePill v={v} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: 4, color: 'var(--accent-primary)', backgroundColor: 'var(--accent-subtle, rgba(240,108,24,0.12))' }}>AC {v.acNo}</span>
                <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{v.constituency}</span>
                {v.survey?.grievanceCategory && <GrievancePill cat={v.survey.grievanceCategory} />}
                <LeanCell lean={v.survey?.lean} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <WorkerAvatar name={v.workerName} size={20} />
                <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.workerName}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  <span style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: o.color }} />{timeAgo(v.visitedAt)}
                </span>
              </div>
            </button>
          )
        })}
      </div>
      <div className="hidden md:block" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
          <colgroup>
            <col style={{ width: '17%' }} /><col style={{ width: '12%' }} /><col style={{ width: '13%' }} />
            <col style={{ width: '9%' }} /><col style={{ width: '8%' }} /><col style={{ width: '13%' }} />
            <col style={{ width: '9%' }} /><col style={{ width: '9%' }} /><col style={{ width: '8%' }} /><col style={{ width: '2%' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={TH}>Household<br /><span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--text-muted)' }}>Address</span></th>
              <th style={TH}>Worker</th>
              <th style={TH}>Booth / Area</th>
              <th style={TH}>Visit Outcome</th>
              <th style={TH}>Members<br /><span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--text-muted)' }}>Spoken To</span></th>
              <th style={TH}>Grievance (Top)</th>
              <th style={TH}>Support Lean</th>
              <th style={TH}>Photos</th>
              <th style={TH}>Last Visit</th>
              <th style={TH}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={10} style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', padding: '32px 12px' }}>No visits match these filters.</td></tr>
            )}
            {rows.map((v) => {
              const o = D2D_OUTCOME[v.outcome]
              return (
                <tr key={v.id} onClick={() => onRowClick(v)}
                  style={{ cursor: 'pointer', borderBottom: '1px solid var(--border-primary)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}>
                  <td style={TD}>
                    <div style={{ fontWeight: 600 }}>{v.householdHead}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>{v.addressNote}</div>
                  </td>
                  <td style={TD}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <WorkerAvatar name={v.workerName} />
                      <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{v.workerName}</span>
                    </div>
                  </td>
                  <td style={TD}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: 4, color: 'var(--accent-primary)', backgroundColor: 'var(--accent-subtle, rgba(240,108,24,0.12))', flexShrink: 0 }}>AC {v.acNo}</span>
                      <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{v.constituency}</span>
                    </div>
                  </td>
                  <td style={TD}><OutcomePill v={v} /></td>
                  <td style={TD}>
                    {v.survey ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>{v.survey.membersSpokenTo}<MdGroups size={13} color="var(--text-muted)" /></span>
                    ) : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                  </td>
                  <td style={TD}>
                    {v.survey?.grievanceCategory ? <GrievancePill cat={v.survey.grievanceCategory} /> : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                  </td>
                  <td style={TD}><LeanCell lean={v.survey?.lean} /></td>
                  <td style={TD}><PhotoThumbs v={v} /></td>
                  <td style={TD}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      <span style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: o.color }} />{timeAgo(v.visitedAt)}
                    </span>
                  </td>
                  <td style={TD}><MdMoreVert size={16} color="var(--text-muted)" /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* pagination */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderTop: '1px solid var(--border-primary)' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Showing {from} to {to} of {visits.length} recent visits</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => setPage(Math.max(0, cur - 1))} disabled={cur === 0} style={pageBtn(false, cur === 0)}><MdChevronLeft size={16} /></button>
          {pages.map((p, i) => p === '…'
            ? <span key={`e${i}`} style={{ padding: '0 4px', color: 'var(--text-muted)', fontSize: 12 }}>…</span>
            : <button key={p} onClick={() => setPage(p)} style={pageBtn(p === cur, false)}>{p + 1}</button>)}
          <button onClick={() => setPage(Math.min(pageCount - 1, cur + 1))} disabled={cur >= pageCount - 1} style={pageBtn(false, cur >= pageCount - 1)}><MdChevronRight size={16} /></button>
        </div>
      </div>
    </div>
  )
}

function pageBtn(active: boolean, disabled: boolean): React.CSSProperties {
  return {
    minWidth: 28, height: 28, borderRadius: 7, padding: '0 6px',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 600,
    backgroundColor: active ? 'var(--accent-primary)' : 'transparent',
    color: active ? '#fff' : disabled ? 'var(--text-muted)' : 'var(--text-secondary)',
    border: active ? 'none' : '1px solid var(--border-primary)',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
  }
}
