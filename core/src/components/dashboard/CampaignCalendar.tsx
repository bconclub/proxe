'use client'

// POP EVENTS - the campaign calendar, laid out to the reference design:
// KPI strip (Confirmed / Leadership Proposed / AI Suggested / Awaiting Sign-off),
// legend + filters, month grid with typed multi-day pills and day-count badges,
// and the Event Intelligence rail (selected day breakdown, AI rationale,
// quick actions, overlap detection, upcoming approvals).
// Event kinds:
//   • confirmed   (solid saffron)     - locked in and happening
//   • leadership  (blue outline)      - the leader proposes from the field
//   • ai          (dashed purple)     - PROXe suggests from listen signals / gaps
//   • awaiting    (dashed orange)     - proposal escalated, needs sign-off
// Mock data for now - swap for campaign_events once the planning flow lands.

import React, { useEffect, useMemo, useState } from 'react'
import { MdChevronLeft, MdChevronRight, MdAutoAwesome, MdCampaign, MdCheckCircle, MdSchedule, MdFilterList, MdExpandMore, MdEventAvailable, MdFlag, MdWarningAmber, MdCalendarToday, MdPersonAddAlt } from 'react-icons/md'

type Kind = 'confirmed' | 'leadership' | 'ai' | 'awaiting'
interface Ev {
  id: string
  title: string
  place?: string
  startOff: number // days from today (inclusive)
  endOff: number   // days from today (inclusive)
  kind: Kind
  priority?: 'High' | 'Medium'
  rationale?: string
  confidence?: number
}

// Mock campaign events, positioned RELATIVE to today so they always land in the
// visible month. Whole-week spans = yatra legs; multi-day = camps/padyatras.
const MOCK: Ev[] = [
  { id: 'e1', title: 'Punjab Jodo Yatra · Leg 1', place: 'Majha belt', startOff: -2, endOff: 4, kind: 'confirmed' },
  { id: 'e2', title: 'Booth Workers Meet', place: 'Patiala', startOff: 0, endOff: 0, kind: 'confirmed' },
  { id: 'e3', title: 'Kisan Maha Rally', place: 'Barnala', startOff: 1, endOff: 1, kind: 'confirmed' },
  { id: 'e4', title: 'Press Conference · MSP payments', place: 'Chandigarh', startOff: 2, endOff: 2, kind: 'confirmed' },
  { id: 'e5', title: 'Cultural Night + Concert', place: 'Ludhiana', startOff: 3, endOff: 3, kind: 'confirmed' },
  { id: 'e6', title: 'Sangrur Nukkad Meetings', place: 'Sangrur', startOff: -6, endOff: -4, kind: 'confirmed' },
  { id: 'e13', title: 'Village Sarpanch Roundtable', place: 'Moga', startOff: 9, endOff: 9, kind: 'confirmed' },
  { id: 'e7', title: 'AI · De-addiction Town Hall', place: 'Ludhiana', startOff: 6, endOff: 6, kind: 'awaiting', priority: 'High', rationale: 'Drug related signals in Ludhiana are up 3x this fortnight; a town hall closes the response gap while attention is high.', confidence: 86 },
  { id: 'e8', title: 'AI · Youth Employment Camp', place: 'Doaba', startOff: 7, endOff: 9, kind: 'ai', priority: 'Medium', rationale: 'Job scarcity is the loudest youth topic in Doaba; no field activity is scheduled there for 2 weeks.', confidence: 78 },
  { id: 'e9', title: 'Punjab Jodo Yatra · Leg 2', place: 'Malwa belt', startOff: 12, endOff: 18, kind: 'leadership' },
  { id: 'e10', title: 'AI · Water Crisis Padyatra', place: 'Malwa', startOff: 14, endOff: 16, kind: 'ai', priority: 'High', rationale: 'AI suggests a water grievance outreach padyatra in Malwa due to rising local chatter around water shortages and no scheduled field activity in the belt.', confidence: 82 },
  { id: 'e11', title: 'Grievance Redressal Camp', place: 'Bathinda', startOff: 20, endOff: 22, kind: 'leadership' },
  { id: 'e12', title: 'AI · Farmers Outreach', place: 'Doaba', startOff: -5, endOff: -5, kind: 'ai', priority: 'Medium', rationale: 'MSP payment anger clustered in Doaba mandis; a farmers outreach visit would meet it head on.', confidence: 74 },
  { id: 'e14', title: 'Leadership · District Core Committee Meet', place: 'Jalandhar', startOff: 8, endOff: 8, kind: 'awaiting', priority: 'High' },
  { id: 'e15', title: 'AI · Skill Development Camp', place: 'Moga', startOff: 13, endOff: 13, kind: 'awaiting', priority: 'Medium', rationale: 'Youth employment chatter in Moga with zero scheduled response; a skill camp converts frustration to engagement.', confidence: 71 },
  { id: 'e16', title: 'Mohalla Meeting Series', place: 'Amritsar East', startOff: -9, endOff: -8, kind: 'confirmed' },
  { id: 'e17', title: 'Youth Sports Tournament', place: 'Hoshiarpur', startOff: 10, endOff: 11, kind: 'confirmed' },
  { id: 'e18', title: 'AI · Canal Water Fix Drive', place: 'Patiala', startOff: 23, endOff: 24, kind: 'ai', priority: 'High', rationale: 'Canal water is the top trending phrase statewide; a visible fix drive in Patiala rides the wave.', confidence: 80 },
  { id: 'e19', title: 'Booth Committee Formation', place: 'Ferozepur', startOff: 26, endOff: 27, kind: 'leadership' },
  { id: 'e20', title: 'Mandi Visit · MSP dues', place: 'Sangrur', startOff: 5, endOff: 5, kind: 'confirmed' },
]

const DAY = 86400000
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const serial = (d: Date) => Math.floor(startOfDay(d).getTime() / DAY)
const WD = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const ACCENT = '#F06C18' // POP brand saffron (theme --accent-primary is a neutral gray, not the brand)
// hex twin for alpha-composed tints ( var() cannot take a '1f' suffix )
const ACCENT_HEX = '#F06C18'

const KIND_META: Record<Kind, { label: string; color: string; icon: React.ReactNode }> = {
  confirmed: { label: 'Confirmed', color: ACCENT_HEX, icon: <MdCheckCircle size={11} /> },
  leadership: { label: 'Leadership Proposed', color: '#3b82f6', icon: <MdCampaign size={11} /> },
  ai: { label: 'AI Suggested', color: '#8b5cf6', icon: <MdAutoAwesome size={11} /> },
  awaiting: { label: 'Awaiting Sign-off', color: '#f59e0b', icon: <MdSchedule size={11} /> },
}

// pill style per kind. Confirmed rides the BRAND accent token; tinted pills use
// theme text so light mode stays readable (hardcoded pale text vanished on white).
function evStyle(kind: Kind): React.CSSProperties {
  switch (kind) {
    case 'confirmed': return { background: ACCENT, color: '#fff', border: `1px solid ${ACCENT}` }
    case 'leadership': return { background: '#3b82f626', color: 'var(--text-primary)', border: '1px solid #3b82f6' }
    case 'ai': return { background: '#8b5cf62b', color: 'var(--text-primary)', border: '1px dashed #8b5cf6' }
    case 'awaiting': return { background: '#f59e0b26', color: 'var(--text-primary)', border: '1px dashed #f59e0b' }
  }
}

// greedy lane packing for one week's bars
function packLanes<T extends { startCol: number; span: number }>(evs: T[]): (T & { lane: number })[] {
  const laneEnd: number[] = []
  const out: (T & { lane: number })[] = []
  const sorted = [...evs].sort((a, b) => a.startCol - b.startCol || b.span - a.span)
  for (const e of sorted) {
    let lane = 0
    while (laneEnd[lane] != null && laneEnd[lane] >= e.startCol) lane++
    laneEnd[lane] = e.startCol + e.span - 1
    out.push({ ...e, lane })
  }
  return out
}

const HEADER_H = 26
const LANE_H = 22
const LANE_GAP = 3

export default function CampaignCalendar() {
  // avoid SSR/CSR date mismatch - compute after mount
  const [today, setToday] = useState<Date | null>(null)
  const [monthAnchor, setMonthAnchor] = useState<Date | null>(null)
  const [selectedSerial, setSelectedSerial] = useState<number | null>(null)
  const [evs, setEvs] = useState<Ev[]>(MOCK)
  const [kindFilter, setKindFilter] = useState<Kind | 'all'>('all')
  useEffect(() => {
    const t = new Date()
    setToday(t)
    setMonthAnchor(new Date(t.getFullYear(), t.getMonth(), 1))
    setSelectedSerial(serial(t))
  }, [])

  const events = useMemo<(Ev & { s: number; e: number })[]>(() => {
    if (!today) return []
    const base = serial(today)
    return evs.map((m) => ({ ...m, s: base + m.startOff, e: base + m.endOff }))
  }, [today, evs])

  const shown = useMemo(() => (kindFilter === 'all' ? events : events.filter((e) => e.kind === kindFilter)), [events, kindFilter])

  const weeks = useMemo(() => {
    if (!monthAnchor) return []
    const first = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1)
    const gridStart = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay()) // back to Sunday
    const rows: Date[][] = []
    for (let w = 0; w < 6; w++) {
      const row: Date[] = []
      for (let d = 0; d < 7; d++) row.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + w * 7 + d))
      rows.push(row)
      if (w >= 4 && row[6].getMonth() !== monthAnchor.getMonth() && row[0].getMonth() !== monthAnchor.getMonth()) break
    }
    return rows
  }, [monthAnchor])

  if (!today || !monthAnchor) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading calendar…</div>
  }

  const monthIdx = monthAnchor.getMonth()
  const todaySerial = serial(today)
  const selSerial = selectedSerial ?? todaySerial
  const counts = {
    confirmed: events.filter((e) => e.kind === 'confirmed').length,
    leadership: events.filter((e) => e.kind === 'leadership').length,
    ai: events.filter((e) => e.kind === 'ai').length,
    awaiting: events.filter((e) => e.kind === 'awaiting').length,
  }

  const onDay = (kind: Kind) => events.filter((e) => e.kind === kind && e.s <= selSerial && e.e >= selSerial)
  const selDate = new Date(selSerial * DAY)
  const selLabel = selDate.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  const firstAiOnDay = [...onDay('ai'), ...onDay('awaiting')].find((e) => e.rationale)
  // overlap: two events same place covering the selected day
  const dayEvents = events.filter((e) => e.s <= selSerial && e.e >= selSerial)
  const overlap = dayEvents.find((a) => dayEvents.some((b) => b.id !== a.id && a.place && a.place === b.place))
  const approvals = events.filter((e) => e.kind !== 'confirmed').sort((a, b) => a.s - b.s).slice(0, 5)

  const approve = (id: string) => setEvs((prev) => prev.map((x) => (x.id === id ? { ...x, kind: 'confirmed' } : x)))
  const reject = (id: string) => setEvs((prev) => prev.filter((x) => x.id !== id))

  const move = (delta: number) => setMonthAnchor(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + delta, 1))
  const goToday = () => { setMonthAnchor(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedSerial(todaySerial) }

  const evDate = (e: Ev & { s: number }) => new Date(e.s * DAY).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 310px', gap: 14, width: '100%', alignItems: 'start' }} className="cc-wrap">
      <div style={{ minWidth: 0 }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>Campaign Events</h1>
            <p style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>Plan the ground calendar. Track leadership pushes, confirmed events, and AI suggestions in one place.</p>
          </div>
          <button onClick={goToday} style={btnStyle}>Today</button>
          <button onClick={() => move(-1)} style={iconBtn} aria-label="Previous month"><MdChevronLeft size={18} /></button>
          <button onClick={() => move(1)} style={iconBtn} aria-label="Next month"><MdChevronRight size={18} /></button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 19, fontWeight: 800, color: 'var(--text-primary)' }}>
            {MONTHS[monthIdx]} {monthAnchor.getFullYear()} <MdExpandMore size={18} color="var(--text-muted)" />
          </div>
        </div>

        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: 10, marginBottom: 12 }}>
          <Kpi icon={<MdEventAvailable size={20} />} color={ACCENT_HEX} label="Confirmed Events" value={counts.confirmed} sub="+6 vs last 30 days" subColor="#22c55e" />
          <Kpi icon={<MdFlag size={20} />} color="#3b82f6" label="Leadership Proposed" value={counts.leadership} sub="+2 vs last 30 days" subColor="#22c55e" />
          <Kpi icon={<MdAutoAwesome size={20} />} color="#8b5cf6" label="AI Suggested" value={counts.ai} sub="+5 vs last 30 days" subColor="#22c55e" />
          <Kpi icon={<MdSchedule size={20} />} color="#f59e0b" label="Awaiting Sign-off" value={counts.awaiting} sub="Needs approval" subColor="#f59e0b" />
        </div>

        {/* legend + filters */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12, fontSize: 11.5, color: 'var(--text-secondary)' }}>
          <Legend swatch={{ background: 'var(--accent-primary, #F06C18)' }} label="Confirmed" active={kindFilter === 'all' || kindFilter === 'confirmed'} onClick={() => setKindFilter(kindFilter === 'confirmed' ? 'all' : 'confirmed')} />
          <Legend swatch={{ background: '#8b5cf61f', border: '1px dashed #8b5cf6' }} label="AI Suggested" active={kindFilter === 'all' || kindFilter === 'ai'} onClick={() => setKindFilter(kindFilter === 'ai' ? 'all' : 'ai')} />
          <Legend swatch={{ background: '#3b82f61a', border: '1px solid #3b82f6' }} label="Leadership Proposed" active={kindFilter === 'all' || kindFilter === 'leadership'} onClick={() => setKindFilter(kindFilter === 'leadership' ? 'all' : 'leadership')} />
          <Legend swatch={{ background: '#f59e0b1a', border: '1px dashed #f59e0b' }} label="Awaiting Approval" active={kindFilter === 'all' || kindFilter === 'awaiting'} onClick={() => setKindFilter(kindFilter === 'awaiting' ? 'all' : 'awaiting')} />
          <button onClick={() => setKindFilter('all')} style={{ ...btnStyle, marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px' }}><MdFilterList size={15} /> Filters</button>
        </div>

        {/* weekday header */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderTop: '1px solid var(--border-primary)', borderLeft: '1px solid var(--border-primary)', borderTopLeftRadius: 10, borderTopRightRadius: 10, overflow: 'hidden' }}>
          {WD.map((w) => (
            <div key={w} style={{ padding: '8px 10px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-muted)', textAlign: 'center', borderRight: '1px solid var(--border-primary)', background: 'var(--bg-secondary)' }}>{w}</div>
          ))}
        </div>

        {/* week rows */}
        <div style={{ borderLeft: '1px solid var(--border-primary)' }}>
          {weeks.map((week, wi) => {
            const weekStart = serial(week[0])
            const weekEnd = serial(week[6])
            const inWeek = shown.filter((e) => e.e >= weekStart && e.s <= weekEnd)
            const bars = packLanes(inWeek.map((e) => {
              const s = Math.max(e.s, weekStart)
              const en = Math.min(e.e, weekEnd)
              return { ...e, startCol: s - weekStart, span: en - s + 1, contStart: e.s < weekStart, contEnd: e.e > weekEnd }
            }))
            const maxLane = bars.reduce((m, b) => Math.max(m, b.lane), -1)
            const rowMinH = Math.max(86, HEADER_H + (maxLane + 1) * (LANE_H + LANE_GAP) + 8)

            return (
              <div key={wi} style={{ position: 'relative', borderBottom: '1px solid var(--border-primary)' }}>
                {/* day cells (background + numbers + count badges + selection) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
                  {week.map((d, di) => {
                    const dSerial = serial(d)
                    const isToday = dSerial === todaySerial
                    const isSel = dSerial === selSerial
                    const otherMonth = d.getMonth() !== monthIdx
                    const nOnDay = events.filter((e) => e.s <= dSerial && e.e >= dSerial).length
                    return (
                      <div key={di} onClick={() => setSelectedSerial(dSerial)}
                        style={{ minHeight: rowMinH, borderRight: '1px solid var(--border-primary)', padding: '5px 7px', cursor: 'pointer', background: isSel ? 'rgba(240,108,24,0.07)' : otherMonth ? 'var(--bg-primary)' : 'var(--bg-secondary)', opacity: otherMonth ? 0.5 : 1, boxShadow: isSel ? 'inset 0 0 0 1.5px rgba(240,108,24,0.55)' : 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span>
                            {nOnDay >= 3 && (
                              <span style={{ fontSize: 9.5, fontWeight: 800, color: '#0b0d12', background: ACCENT, borderRadius: 10, padding: '1px 6px' }}>{nOnDay}</span>
                            )}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: isToday ? 800 : 500, color: isToday ? '#fff' : 'var(--text-secondary)', background: isToday ? ACCENT : 'transparent', borderRadius: 12, padding: isToday ? '1px 7px' : 0 }}>{d.getDate()}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {/* event bars overlay */}
                <div style={{ position: 'absolute', top: HEADER_H, left: 0, right: 0, display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gridAutoRows: LANE_H, rowGap: LANE_GAP, columnGap: 3, padding: '0 3px', pointerEvents: 'none' }}>
                  {bars.map((b) => (
                    <div
                      key={b.id}
                      title={`${b.title}${b.place ? ' · ' + b.place : ''} - ${KIND_META[b.kind].label}`}
                      onClick={() => setSelectedSerial(Math.max(b.s, weekStart))}
                      style={{
                        gridColumn: `${b.startCol + 1} / span ${b.span}`,
                        gridRow: b.lane + 1,
                        display: 'flex', alignItems: 'center', gap: 5,
                        fontSize: 11, fontWeight: 600, lineHeight: 1,
                        padding: '0 7px', height: LANE_H,
                        borderRadius: 6,
                        borderTopLeftRadius: b.contStart ? 0 : 6, borderBottomLeftRadius: b.contStart ? 0 : 6,
                        borderTopRightRadius: b.contEnd ? 0 : 6, borderBottomRightRadius: b.contEnd ? 0 : 6,
                        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                        pointerEvents: 'auto', cursor: 'pointer',
                        ...evStyle(b.kind),
                      }}
                    >
                      <span style={{ flexShrink: 0, display: 'flex', opacity: 0.9 }}>{KIND_META[b.kind].icon}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.title}{b.span === 1 && b.place ? ` · ${b.place}` : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* footer legend with counts */}
        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', justifyContent: 'center', padding: '14px 0 4px', fontSize: 12, color: 'var(--text-secondary)' }}>
          {(Object.keys(KIND_META) as Kind[]).map((k) => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <span style={{ color: KIND_META[k].color, display: 'flex' }}>{KIND_META[k].icon}</span>
              <b style={{ color: 'var(--text-primary)' }}>{KIND_META[k].label}</b> {counts[k]} events
            </span>
          ))}
        </div>
      </div>

      {/* ── Event Intelligence rail ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={railCard}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
            <MdAutoAwesome size={15} color="#8b5cf6" />
            <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-primary)' }}>Event Intelligence</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginBottom: 10 }}>
            <MdCalendarToday size={13} color="var(--text-muted)" style={{ marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Selected Day</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{selLabel}</div>
            </div>
          </div>

          {([['confirmed', 'Confirmed Events'], ['leadership', 'Leadership Pushes'], ['ai', 'AI Suggested Opportunities'], ['awaiting', 'Awaiting Approval']] as [Kind, string][]).map(([k, label]) => {
            const list = onDay(k)
            return (
              <div key={k} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: KIND_META[k].color, display: 'flex' }}>{KIND_META[k].icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: KIND_META[k].color }}>{label}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 800, minWidth: 20, textAlign: 'center', borderRadius: 9, padding: '1px 4px', background: `${KIND_META[k].color}22`, color: KIND_META[k].color, border: `1px solid ${KIND_META[k].color}44` }}>{list.length}</span>
                </div>
                {list.length === 0 ? (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', margin: '3px 0 0 20px' }}>No {label.toLowerCase()} today</div>
                ) : k === 'ai' || k === 'awaiting' ? (
                  list.map((e) => (
                    <div key={e.id} style={{ margin: '5px 0 0 20px', fontSize: 11.5, color: 'var(--text-primary)', border: `1px dashed ${KIND_META[k].color}`, background: `${KIND_META[k].color}14`, borderRadius: 8, padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <MdAutoAwesome size={11} color={KIND_META[k].color} /> {e.title}
                    </div>
                  ))
                ) : (
                  list.map((e) => (
                    <div key={e.id} style={{ margin: '3px 0 0 20px', fontSize: 11.5, color: 'var(--text-secondary)' }}>• {e.title}{e.place ? ` · ${e.place}` : ''}</div>
                  ))
                )}
              </div>
            )
          })}

          {/* AI rationale */}
          <div style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.35)', borderRadius: 10, padding: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#a78bfa', marginBottom: 4 }}>AI Rationale</div>
            <p style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
              {firstAiOnDay?.rationale || 'No AI proposals on this day. Pick a day with a dashed pill to see why PROXe is suggesting it.'}
            </p>
            {firstAiOnDay?.confidence && <div style={{ fontSize: 10.5, fontWeight: 700, color: '#a78bfa', marginTop: 5 }}>Confidence: {firstAiOnDay.confidence}%</div>}
          </div>

          {/* quick actions */}
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 7 }}>Quick Actions</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 12 }}>
            <button onClick={() => firstAiOnDay && approve(firstAiOnDay.id)} style={{ ...actionBtn, background: 'var(--accent-primary, #F06C18)', color: '#fff', border: 'none', opacity: firstAiOnDay ? 1 : 0.5 }}>Approve</button>
            <button onClick={() => firstAiOnDay && reject(firstAiOnDay.id)} style={{ ...actionBtn, opacity: firstAiOnDay ? 1 : 0.5 }}>Reject</button>
            <button style={{ ...actionBtn, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><MdEventAvailable size={13} /> Convert to Event</button>
            <button style={{ ...actionBtn, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><MdPersonAddAlt size={13} /> Assign Owner</button>
          </div>

          {/* overlap detection */}
          {overlap && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 10, padding: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: '#ef4444', marginBottom: 3 }}><MdWarningAmber size={14} /> Overlap Detected</div>
              <p style={{ fontSize: 11, lineHeight: 1.45, color: 'var(--text-secondary)' }}>
                {overlap.title} overlaps with another event in {overlap.place}. <span style={{ color: '#ef4444', fontWeight: 700, cursor: 'pointer' }}>View Details</span>
              </p>
            </div>
          )}
        </div>

        {/* upcoming approvals */}
        <div style={railCard}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-primary)' }}>Upcoming Approvals</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: ACCENT, cursor: 'pointer' }}>View all</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {approvals.map((e) => (
              <div key={e.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${KIND_META[e.kind].color}1f`, color: KIND_META[e.kind].color }}>{KIND_META[e.kind].icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}{e.place ? ` · ${e.place}` : ''}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{evDate(e)}</div>
                </div>
                {e.priority && (
                  <span style={{ fontSize: 9.5, fontWeight: 800, borderRadius: 6, padding: '2px 7px', flexShrink: 0, color: e.priority === 'High' ? '#ef4444' : '#f59e0b', background: e.priority === 'High' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)', border: `1px solid ${e.priority === 'High' ? 'rgba(239,68,68,0.35)' : 'rgba(245,158,11,0.35)'}` }}>{e.priority}</span>
                )}
              </div>
            ))}
            {approvals.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Nothing pending. All proposals are signed off.</div>}
          </div>
          <button style={{ ...actionBtn, width: '100%', marginTop: 12, background: 'var(--accent-primary, #F06C18)', color: '#fff', border: 'none' }}>Manage Approvals</button>
        </div>
      </div>

      <style>{`@media (max-width: 1100px){ .cc-wrap{ grid-template-columns: minmax(0,1fr) !important; } }`}</style>
    </div>
  )
}

const btnStyle: React.CSSProperties = { background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 9, padding: '7px 15px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }
const iconBtn: React.CSSProperties = { background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 9, padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }
const railCard: React.CSSProperties = { background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 14, padding: 14 }
const actionBtn: React.CSSProperties = { background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 9, padding: '8px 6px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }

function Kpi({ icon, color, label, value, sub, subColor }: { icon: React.ReactNode; color: string; label: string; value: number; sub: string; subColor: string }) {
  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 13, padding: '13px 15px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ width: 42, height: 42, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${color}1f`, color }}>{icon}</span>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</div>
        <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1, color: 'var(--text-primary)' }}>{value}</div>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: subColor }}>{sub}</div>
      </div>
    </div>
  )
}

const Legend: React.FC<{ swatch: React.CSSProperties; label: string; active?: boolean; onClick?: () => void }> = ({ swatch, label, active = true, onClick }) => (
  <button onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 'inherit', opacity: active ? 1 : 0.45, padding: 0 }}>
    <span style={{ width: 26, height: 13, borderRadius: 4, display: 'inline-block', ...swatch }} />
    {label}
  </button>
)
