'use client'

// Door2Door artifact surface - the field-canvassing monitoring + app-preview
// page. Reached from the dashboard artifact switcher (brands/pop/config.ts
// `d2d` entry, href '/dashboard/d2d'). Demo data lives in @/data/mock-d2d.
//
// Three tabs:
//   Field Log      - KPI strip + segregated D2D leads table + visit detail drawer
//   Booth Campaigns - campaigns running at booth level + booth leaderboard
//   App Preview     - phone-frame mockups of the volunteer field app

import { useState } from 'react'
import { MdListAlt, MdCampaign, MdPhoneIphone, MdCalendarToday, MdFilterList, MdAdd, MdKeyboardArrowDown } from 'react-icons/md'
import D2DFieldLogTab from '@/components/dashboard/d2d/D2DFieldLogTab'
import D2DCampaignsTab from '@/components/dashboard/d2d/D2DCampaignsTab'
import D2DAppPreviewTab from '@/components/dashboard/d2d/D2DAppPreviewTab'

const TABS = [
  { id: 'field', label: 'Field Log', icon: MdListAlt },
  { id: 'campaigns', label: 'Booth Campaigns', icon: MdCampaign },
  { id: 'app', label: 'App Preview', icon: MdPhoneIphone },
] as const

const hdrBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 500,
  padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
  backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-primary)',
}

export default function D2DPage() {
  const [active, setActive] = useState<(typeof TABS)[number]['id']>('field')

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 'calc(100vh - 60px)' }}>
      {/* Header */}
      <div className="px-6 pt-6 pb-0 border-b" style={{ borderColor: 'var(--border-primary)' }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Door to Door</h1>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', padding: '2px 6px', borderRadius: 4, color: '#F59E0B', backgroundColor: 'rgba(245, 158, 11, 0.12)' }}>WIP</span>
            </div>
            <p className="mb-4" style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
              Volunteer household visits, surveys, grievances &amp; support lean.
            </p>
          </div>
          {/* header controls (visual - demo) */}
          <div className="flex items-center gap-2">
            <button style={hdrBtn}>
              <MdCalendarToday size={14} /> May 12 - May 18, 2025 <MdKeyboardArrowDown size={16} style={{ color: 'var(--text-muted)' }} />
            </button>
            <button style={hdrBtn}><MdFilterList size={14} /> Filters</button>
            <button style={{ ...hdrBtn, backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none', fontWeight: 600 }}>
              <MdAdd size={16} /> Log Visit
            </button>
          </div>
        </div>
        <div className="flex gap-1">
          {TABS.map((tab) => {
            const on = active === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActive(tab.id)}
                className="px-4 py-2 text-sm font-medium rounded-t-lg transition-colors flex items-center gap-2"
                style={{
                  backgroundColor: on ? 'var(--button-bg, var(--accent-primary))' : 'transparent',
                  color: on ? 'var(--text-button, #fff)' : 'var(--text-muted)',
                }}
              >
                <tab.icon size={16} className="flex-shrink-0" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {active === 'field' && <D2DFieldLogTab />}
        {active === 'campaigns' && <D2DCampaignsTab />}
        {active === 'app' && <D2DAppPreviewTab />}
      </div>
    </div>
  )
}
