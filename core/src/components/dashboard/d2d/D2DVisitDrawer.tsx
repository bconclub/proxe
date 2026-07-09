'use client'

// Right slide-over showing the full detail of one D2D visit: photo gallery,
// household roster, grievance + loop status, and the visit timeline.

import { useState } from 'react'
import { MdClose, MdLocationOn, MdPhone, MdPerson } from 'react-icons/md'
import {
  D2D_OUTCOME, D2D_LEAN, D2D_GRIEVANCE, D2D_LOOP, districtColor, timeAgo,
  type D2DVisit, type D2DPhoto,
} from '@/data/mock-d2d'

function PhotoTile({ photo, size, onClick }: { photo: D2DPhoto; size: number; onClick?: () => void }) {
  return (
    <div onClick={onClick} title={`${photo.label} · ${timeAgo(photo.takenAt)}`}
      style={{ position: 'relative', width: size, height: size, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border-primary)', cursor: onClick ? 'pointer' : 'default', flexShrink: 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.url} alt={photo.label} width={size} height={size} style={{ width: size, height: size, objectFit: 'cover', display: 'block' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '3px 6px', fontSize: 9, fontWeight: 600, color: '#fff', background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)' }}>{photo.label}</div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '4px 0 10px' }}>
      {children}
    </div>
  )
}

function Pill({ label, color, filled = false }: { label: string; color: string; filled?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, padding: '2px 9px', borderRadius: 999, color: filled ? '#fff' : color, backgroundColor: filled ? color : `${color}1F` }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: filled ? '#fff' : color }} />
      {label}
    </span>
  )
}

export default function D2DVisitDrawer({ visit, onClose }: { visit: D2DVisit | null; onClose: () => void }) {
  const [zoom, setZoom] = useState<D2DPhoto | null>(null)
  if (!visit) return null

  const outcome = D2D_OUTCOME[visit.outcome]
  const lean = visit.survey?.lean ? D2D_LEAN[visit.survey.lean] : null
  const grv = visit.survey?.grievanceCategory ? D2D_GRIEVANCE[visit.survey.grievanceCategory] : null
  const loop = visit.loopStatus ? D2D_LOOP[visit.loopStatus] : null
  const dist = districtColor(visit.district)

  return (
    <>
      {/* backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 80 }}
      />
      {/* panel */}
      <div
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(460px, 100vw)',
          backgroundColor: 'var(--bg-primary)', borderLeft: '1px solid var(--border-primary)',
          zIndex: 81, display: 'flex', flexDirection: 'column', boxShadow: '-12px 0 32px rgba(0,0,0,0.35)',
        }}
      >
        {/* header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-primary)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>{visit.householdHead}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                <MdLocationOn size={13} /> {visit.addressNote}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
              <MdClose size={20} />
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 4, color: 'var(--accent-primary)', backgroundColor: 'var(--accent-subtle, rgba(240,108,24,0.12))' }}>
              AC {visit.acNo}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-primary)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: dist }} />
              {visit.constituency} · Booth {visit.boothNo}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <Pill label={outcome.label} color={outcome.color} filled={visit.outcome === 'met'} />
            {lean && <Pill label={lean.label} color={lean.color} />}
            {visit.survey?.flagHung && <Pill label="Flag hung" color="#F06C18" />}
          </div>
        </div>

        {/* body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 22 }}>
          {/* meta line */}
          <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><MdPerson size={14} /> {visit.workerName}</span>
            {visit.phone && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><MdPhone size={13} /> {visit.phone}</span>}
            {visit.latitude != null && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <MdLocationOn size={13} /> {visit.latitude.toFixed(4)}°N, {visit.longitude!.toFixed(4)}°E
              </span>
            )}
          </div>

          {/* photo gallery */}
          {visit.photos.length > 0 && (
            <div>
              <SectionTitle>Field Photos · {visit.photos.length}</SectionTitle>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {visit.photos.map((p) => (
                  <PhotoTile key={p.id} photo={p} size={100} onClick={() => setZoom(p)} />
                ))}
              </div>
            </div>
          )}

          {/* household roster */}
          {visit.survey && visit.survey.members.length > 0 && (
            <div>
              <SectionTitle>Household · {visit.survey.householdSize} members</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {visit.survey.members.map((mem, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-primary)',
                      backgroundColor: 'var(--bg-secondary)',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{mem.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{mem.age} · {mem.gender} · {mem.relation}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* grievance */}
          {grv && (
            <div>
              <SectionTitle>Grievance</SectionTitle>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <Pill label={grv.label} color={grv.color} />
                {loop && <Pill label={loop.label} color={loop.color} />}
              </div>
              {visit.survey?.grievanceNote && (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                  “{visit.survey.grievanceNote}”
                </p>
              )}
            </div>
          )}

          {/* notes */}
          {visit.notes && (
            <div>
              <SectionTitle>Notes</SectionTitle>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>{visit.notes}</p>
            </div>
          )}

          {/* timeline */}
          <div>
            <SectionTitle>Visit Timeline</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {visit.timeline.map((t, i) => {
                const c = D2D_OUTCOME[t.outcome].color
                const last = i === visit.timeline.length - 1
                return (
                  <div key={i} style={{ display: 'flex', gap: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span style={{ width: 11, height: 11, borderRadius: 999, backgroundColor: c, marginTop: 3, flexShrink: 0 }} />
                      {!last && <span style={{ width: 2, flex: 1, minHeight: 22, backgroundImage: 'linear-gradient(var(--border-primary) 60%, transparent 0)', backgroundSize: '2px 6px' }} />}
                    </div>
                    <div style={{ paddingBottom: last ? 0 : 14 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{t.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{timeAgo(t.at)}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* photo zoom */}
      {zoom && (
        <div
          onClick={() => setZoom(null)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 90, display: 'grid', placeItems: 'center', padding: 24 }}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <PhotoTile photo={zoom} size={Math.min(360, typeof window !== 'undefined' ? window.innerWidth - 60 : 360)} />
          </div>
        </div>
      )}
    </>
  )
}
