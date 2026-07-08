'use client'

// POP EVENTS — the campaign calendar. NOT grievance/call/demo bookings: these
// are campaign events. Two kinds:
//   • Confirmed (solid)   — events locked in and actually happening.
//   • Tentative (dashed)  — proposals not yet locked, pushed by:
//        - AI          (PROXe suggests, from listen signals / gaps)
//        - Leadership  (the leader proposes from the field)
// Whole-day and whole-week spans are first-class (yatra legs, multi-day camps).
// Mock data for now — swap for campaign_events once the planning flow lands.

import React, { useEffect, useMemo, useState } from 'react'
import { MdChevronLeft, MdChevronRight, MdAutoAwesome, MdCampaign, MdCheckCircle } from 'react-icons/md'

type Status = 'confirmed' | 'tentative'
type Source = 'leadership' | 'ai' | 'field'
interface Ev {
  id: string
  title: string
  place?: string
  startOff: number // days from today (inclusive)
  endOff: number   // days from today (inclusive)
  status: Status
  source: Source
}

// Mock campaign events, positioned RELATIVE to today so they always land in the
// visible month. Whole-week spans = yatra legs; multi-day = camps/padyatras.
const MOCK: Ev[] = [
  { id: 'e1', title: 'Punjab Jodo Yatra · Leg 1', place: 'Majha belt', startOff: -2, endOff: 4, status: 'confirmed', source: 'leadership' },
  { id: 'e2', title: 'Booth Workers Meet', place: 'Patiala', startOff: 0, endOff: 0, status: 'confirmed', source: 'field' },
  { id: 'e3', title: 'Kisan Maha Rally', place: 'Barnala', startOff: 1, endOff: 1, status: 'confirmed', source: 'field' },
  { id: 'e4', title: 'Press Conference · MSP payments', place: 'Chandigarh', startOff: 2, endOff: 2, status: 'confirmed', source: 'leadership' },
  { id: 'e5', title: 'Cultural Night + Concert', place: 'Ludhiana', startOff: 3, endOff: 3, status: 'confirmed', source: 'field' },
  { id: 'e6', title: 'Sangrur Nukkad Meetings', place: 'Sangrur', startOff: -6, endOff: -4, status: 'confirmed', source: 'field' },
  { id: 'e7', title: 'AI · De-addiction Town Hall', place: 'Majha', startOff: 6, endOff: 6, status: 'tentative', source: 'ai' },
  { id: 'e8', title: 'AI · Youth Employment Camp', place: 'Doaba', startOff: 7, endOff: 9, status: 'tentative', source: 'ai' },
  { id: 'e9', title: 'Punjab Jodo Yatra · Leg 2', place: 'Malwa belt', startOff: 12, endOff: 18, status: 'tentative', source: 'leadership' },
  { id: 'e10', title: 'AI · Water Crisis Padyatra', place: 'Malwa', startOff: 14, endOff: 16, status: 'tentative', source: 'ai' },
  { id: 'e11', title: 'Grievance Redressal Camp', place: 'Bathinda', startOff: 20, endOff: 22, status: 'tentative', source: 'leadership' },
  { id: 'e12', title: 'AI · Farmers Outreach', place: 'Doaba', startOff: -5, endOff: -5, status: 'tentative', source: 'ai' },
]

const DAY = 86400000
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const serial = (d: Date) => Math.floor(startOfDay(d).getTime() / DAY)
const WD = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// visual style per (status, source)
function evStyle(e: Ev): React.CSSProperties {
  if (e.status === 'confirmed') {
    return { background: 'linear-gradient(90deg,#F06C18,#f0851f)', color: '#fff', border: '1px solid #F06C18' }
  }
  const c = e.source === 'ai' ? '#8b5cf6' : '#3b82f6'
  return { background: `${c}22`, color: '#fff', border: `1px dashed ${c}`, boxShadow: 'none' }
}
const srcIcon = (e: Ev) =>
  e.status === 'confirmed' ? <MdCheckCircle size={11} /> : e.source === 'ai' ? <MdAutoAwesome size={11} /> : <MdCampaign size={11} />

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
  // avoid SSR/CSR date mismatch — compute after mount
  const [today, setToday] = useState<Date | null>(null)
  const [monthAnchor, setMonthAnchor] = useState<Date | null>(null)
  useEffect(() => { const t = new Date(); setToday(t); setMonthAnchor(new Date(t.getFullYear(), t.getMonth(), 1)) }, [])

  const events = useMemo<(Ev & { s: number; e: number })[]>(() => {
    if (!today) return []
    const base = serial(today)
    return MOCK.map((m) => ({ ...m, s: base + m.startOff, e: base + m.endOff }))
  }, [today])

  const weeks = useMemo(() => {
    if (!monthAnchor) return []
    const first = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1)
    const gridStart = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay()) // back to Sunday
    const rows: Date[][] = []
    for (let w = 0; w < 6; w++) {
      const row: Date[] = []
      for (let d = 0; d < 7; d++) row.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + w * 7 + d))
      rows.push(row)
      // stop after we've covered the month (5 or 6 rows)
      if (w >= 4 && row[6].getMonth() !== monthAnchor.getMonth() && row[0].getMonth() !== monthAnchor.getMonth()) break
    }
    return rows
  }, [monthAnchor])

  if (!today || !monthAnchor) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading calendar…</div>
  }

  const monthIdx = monthAnchor.getMonth()
  const todaySerial = serial(today)
  const confirmedCount = events.filter((e) => e.status === 'confirmed').length
  const tentativeCount = events.length - confirmedCount

  const move = (delta: number) => setMonthAnchor(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + delta, 1))
  const goToday = () => setMonthAnchor(new Date(today.getFullYear(), today.getMonth(), 1))

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>Campaign Events</h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Confirmed events and the tentative ones AI and leadership are pushing for. Whole days and whole weeks get blocked for what is happening on the ground.</p>
        </div>
        <button onClick={goToday} style={btnStyle}>Today</button>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => move(-1)} style={iconBtn} aria-label="Previous month"><MdChevronLeft size={18} /></button>
          <button onClick={() => move(1)} style={iconBtn} aria-label="Next month"><MdChevronRight size={18} /></button>
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', minWidth: 150 }}>{MONTHS[monthIdx]} {monthAnchor.getFullYear()}</div>
      </div>

      {/* legend */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12, fontSize: 11.5, color: 'var(--text-secondary)' }}>
        <Legend swatch={{ background: 'linear-gradient(90deg,#F06C18,#f0851f)' }} label={`Confirmed · ${confirmedCount}`} />
        <Legend swatch={{ background: '#8b5cf622', border: '1px dashed #8b5cf6' }} icon={<MdAutoAwesome size={12} color="#8b5cf6" />} label="AI suggested" />
        <Legend swatch={{ background: '#3b82f622', border: '1px dashed #3b82f6' }} icon={<MdCampaign size={12} color="#3b82f6" />} label="Leadership proposed" />
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>{tentativeCount} tentative awaiting sign-off</span>
      </div>

      {/* weekday header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderTop: '1px solid var(--border-primary)', borderLeft: '1px solid var(--border-primary)' }}>
        {WD.map((w) => (
          <div key={w} style={{ padding: '7px 8px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--text-muted)', textAlign: 'right', borderRight: '1px solid var(--border-primary)', background: 'var(--bg-secondary)' }}>{w}</div>
        ))}
      </div>

      {/* week rows */}
      <div style={{ borderLeft: '1px solid var(--border-primary)' }}>
        {weeks.map((week, wi) => {
          const weekStart = serial(week[0])
          const weekEnd = serial(week[6])
          const inWeek = events.filter((e) => e.e >= weekStart && e.s <= weekEnd)
          const bars = packLanes(inWeek.map((e) => {
            const s = Math.max(e.s, weekStart)
            const en = Math.min(e.e, weekEnd)
            return { ...e, startCol: s - weekStart, span: en - s + 1, contStart: e.s < weekStart, contEnd: e.e > weekEnd }
          }))
          const maxLane = bars.reduce((m, b) => Math.max(m, b.lane), -1)
          const rowMinH = HEADER_H + (maxLane + 1) * (LANE_H + LANE_GAP) + 8

          return (
            <div key={wi} style={{ position: 'relative', borderBottom: '1px solid var(--border-primary)' }}>
              {/* day cells (background + numbers) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
                {week.map((d, di) => {
                  const isToday = serial(d) === todaySerial
                  const otherMonth = d.getMonth() !== monthIdx
                  return (
                    <div key={di} style={{ minHeight: rowMinH, borderRight: '1px solid var(--border-primary)', padding: '5px 7px', background: otherMonth ? 'var(--bg-primary)' : 'var(--bg-secondary)', opacity: otherMonth ? 0.5 : 1 }}>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 12, fontWeight: isToday ? 800 : 500, color: isToday ? '#fff' : 'var(--text-secondary)', background: isToday ? '#F06C18' : 'transparent', borderRadius: 12, padding: isToday ? '1px 7px' : 0 }}>{d.getDate()}</span>
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
                    title={`${b.title}${b.place ? ' · ' + b.place : ''} — ${b.status === 'confirmed' ? 'Confirmed' : b.source === 'ai' ? 'AI suggested' : 'Leadership proposed'}`}
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
                      pointerEvents: 'auto', cursor: 'default',
                      ...evStyle(b),
                    }}
                  >
                    <span style={{ flexShrink: 0, display: 'flex', opacity: 0.9 }}>{srcIcon(b)}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.title}{b.span === 1 && b.place ? ` · ${b.place}` : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = { background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 8, padding: '7px 13px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }
const iconBtn: React.CSSProperties = { background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 8, padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }

const Legend: React.FC<{ swatch: React.CSSProperties; label: string; icon?: React.ReactNode }> = ({ swatch, label, icon }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
    <span style={{ width: 22, height: 12, borderRadius: 3, display: 'inline-block', ...swatch }} />
    {icon}{label}
  </span>
)
