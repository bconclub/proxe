'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/dashboard/DashboardLayout'

interface StatusData {
  systemHealth: { version: string; status: 'ok' | 'error'; timestamp: string }
  database: { status: string; canQuery: boolean }
  connectivity: { canReachSupabase: boolean; responseTime?: number }
  [key: string]: unknown
}

interface MetricsData {
  totalLeads?: number
  activeToday?: number
  tasksPending?: number
  avgResponseTime?: number
  total_leads?: number
  active_today?: number
  tasks_pending?: number
  avg_response_time?: number
  [key: string]: unknown
}

const CHANGELOG: { version: string; date: string; items: string[] }[] = [
  {
    version: '0.0.16',
    date: '2026-04-11',
    items: [
      'Quick buttons chip style — flex row, right-aligned, no 2×2 grid',
      'Double typing indicator fixed — suppressed when streaming',
      'Compact user bubble — smaller avatar + name',
      'Welcome message corrected to BCON identity',
      'Rainbow conic-gradient border when AI responding',
      'Calendar date highlight — border not shadow',
      'Calendar bubble — removed duplicate BCON header',
      'Prompt: 4 strict rules (no PROXe, no text-less buttons, etc.)',
      'Prompt: tighter probing questions + booking push after 3–4 msgs',
      'Prompt: Indian English language tone added',
      'Config: quickButtons + exploreButtons updated for BCON',
      'Booking keywords: added "audit" to trigger calendar',
      'handleQuickButtonClick wrapped in try/catch',
      'Delete lead URL fixed to query param ?id=',
    ],
  },
  {
    version: '0.0.15',
    date: '2026-04-10',
    items: [
      'Widget scroll animation removed',
      '4 quick buttons 2×2 grid layout',
      'Bigger fonts (msg 15px, header 16px)',
      'Visible input box with white border',
      'Lead dedup: phone → email → upsert',
      'Inbox channel icon colored backgrounds',
      'Flows funnel TOP / MID / BOTTOM labels',
      'Delete lead button with confirm dialog',
      'Calendar timezone Asia/Kolkata GMT+05:30',
      'Calendar event colors by status',
      'Welcome message pre-loads name+service',
    ],
  },
  {
    version: '0.0.14',
    date: '2026-04-09',
    items: [
      'bcon-web-prompt.ts created',
      'BCON identity updated',
      'Sync script preserves brand configs',
      'Widget preview browser mockup',
      'Mobile quick buttons dynamic',
    ],
  },
  {
    version: '0.0.13',
    date: '2026-04-01',
    items: [
      'Widget preview 70% complete',
      'exploreButtons AI in Marketing',
      'Dynamic mobile quick buttons',
      '/api/website endpoint live',
      'Welcome template wired',
    ],
  },
]

const SPRINT_DONE: { title: string; date: string; category: string }[] = [
  { title: 'Form fills wired to /api/website', date: 'Apr 1', category: 'Infrastructure' },
  { title: 'bcon_welcome_web_v1 template created', date: 'Apr 7', category: 'Product' },
  { title: 'Sync script fixed', date: 'Apr 9', category: 'Infrastructure' },
  { title: 'Web widget prompt created', date: 'Apr 9', category: 'Widget' },
  { title: 'Widget preview browser mockup', date: 'Apr 9', category: 'Widget' },
  { title: 'Scroll animation removed from embed', date: 'Apr 10', category: 'Widget' },
  { title: 'Quick buttons 2×2 grid (4 buttons)', date: 'Apr 10', category: 'Widget' },
  { title: 'Bigger fonts + visible input box', date: 'Apr 10', category: 'Widget' },
  { title: 'Welcome message pre-loads context', date: 'Apr 10', category: 'Widget' },
  { title: 'Lead dedup order fixed', date: 'Apr 10', category: 'Lead Automation' },
  { title: 'Delete lead button + confirm dialog', date: 'Apr 10', category: 'Lead Automation' },
  { title: 'Calendar timezone + event colors', date: 'Apr 10', category: 'Product' },
  { title: 'Inbox icon colors + sidebar width', date: 'Apr 10', category: 'Product' },
  { title: 'Flows funnel TOP/MID/BOTTOM labels', date: 'Apr 10', category: 'Product' },
  { title: 'Quick buttons chip style, right-aligned', date: 'Apr 11', category: 'Widget' },
  { title: 'Double typing indicator fixed', date: 'Apr 11', category: 'Widget' },
  { title: 'Compact user message bubble', date: 'Apr 11', category: 'Widget' },
  { title: 'Welcome message corrected (BCON identity)', date: 'Apr 11', category: 'Widget' },
  { title: 'Rainbow conic-gradient border on response', date: 'Apr 11', category: 'Widget' },
  { title: 'Calendar date highlight — border not shadow', date: 'Apr 11', category: 'Widget' },
  { title: 'Removed duplicate BCON header in calendar bubble', date: 'Apr 11', category: 'Widget' },
  { title: 'Prompt strict rules + probing questions + booking push', date: 'Apr 11', category: 'Product' },
  { title: 'Config quickButtons + exploreButtons updated', date: 'Apr 11', category: 'Product' },
  { title: 'Audit keyword triggers calendar directly', date: 'Apr 11', category: 'Lead Automation' },
  { title: 'Button click error safety (try/catch)', date: 'Apr 11', category: 'Infrastructure' },
  { title: 'Delete lead URL fixed to ?id= query param', date: 'Apr 11', category: 'Lead Automation' },
]

const SPRINT_PENDING: { title: string; added: string; category: string }[] = [
  { title: 'Widget live on bconclub.com', added: 'Apr 9', category: 'Infrastructure' },
  { title: 'Fix phone ID undefined in task worker', added: 'Apr 9', category: 'Lead Automation' },
  { title: 'Fix dedup — same template repeating', added: 'Apr 9', category: 'Lead Automation' },
  { title: 'DEMO_TAKEN + PROPOSAL_SENT admin notes', added: 'Apr 9', category: 'Product' },
  { title: 'Stage-based follow-up logic', added: 'Apr 9', category: 'Product' },
  { title: 'Outbound call button', added: 'Apr 9', category: 'Product' },
  { title: 'Prompt - first message marketing focus not landing', added: 'Apr 11', category: 'Widget' },
  { title: 'Browser dedup - returning visitor creates new lead', added: 'Apr 11', category: 'Lead Automation' },
  { title: 'Booking unavailable error on bconclub.com calendar', added: 'Apr 11', category: 'Product' },
  { title: 'Task worker restart safely on VPS', added: 'Apr 11', category: 'Infrastructure' },
  { title: 'Response speed optimization (avg 9709ms)', added: 'Apr 11', category: 'Infrastructure' },
  { title: 'WhatsApp delivery receipt icons (amber/green/blue)', added: 'Apr 11', category: 'Product' },
  { title: 'Widget streaming - choppy text delivery', added: 'Apr 11', category: 'Widget' },
  { title: 'Status page command center redesign', added: 'Apr 11', category: 'Product' },
  { title: '3-part welcome message sequence', added: 'Apr 11', category: 'Widget' },
  { title: 'AI response - no empty button-only messages', added: 'Apr 11', category: 'Widget' },
  { title: 'Dashboard - avg lead score + combined response time widget', added: 'Apr 11', category: 'Product' },
  { title: 'Dashboard - Leads Needing Attention logic fix', added: 'Apr 11', category: 'Product' },
  { title: 'Leads table - bulk select + bulk delete with password (826991)', added: 'Apr 11', category: 'Product' },
  { title: 'Lead modal - Next Actions stage-based logic', added: 'Apr 11', category: 'Product' },
  { title: 'Pipeline view - stages not mapping to leads (all zeros)', added: 'Apr 11', category: 'Product' },
  { title: 'Tasks - verify worker actually firing, not just UI state', added: 'Apr 11', category: 'Infrastructure' },
  { title: 'Sequences - wire WhatsApp templates to Day 1/3/7/30 slots', added: 'Apr 11', category: 'Product' },
  { title: 'Sequences - coverage % + clickable lead count badges', added: 'Apr 11', category: 'Product' },
  { title: 'Sequences - remove Legacy View, keep Journey Flow only', added: 'Apr 11', category: 'Product' },
  { title: 'Agents page - phone input + manual template send fix', added: 'Apr 11', category: 'Product' },
  { title: 'Voice - latency reduction', added: 'Apr 11', category: 'Infrastructure' },
  { title: 'Latency reduction across all channels (WA, web, voice)', added: 'Apr 11', category: 'Infrastructure' },
]

export default function StatusPage() {
  const [status, setStatus] = useState<StatusData | null>(null)
  const [metrics, setMetrics] = useState<MetricsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [statusRes, metricsRes] = await Promise.allSettled([
        fetch('/api/status', { credentials: 'include' }),
        fetch('/api/dashboard/founder-metrics', { credentials: 'include' }),
      ])
      if (statusRes.status === 'fulfilled' && statusRes.value.ok) {
        setStatus(await statusRes.value.json())
      }
      if (metricsRes.status === 'fulfilled' && metricsRes.value.ok) {
        setMetrics(await metricsRes.value.json())
      }
      setLastUpdated(new Date())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 30000)
    return () => clearInterval(interval)
  }, [])

  const dbOnline = status?.database?.canQuery === true
  const webOnline = status?.systemHealth?.status === 'ok'
  const supabaseOnline = status?.connectivity?.canReachSupabase === true

  const totalLeads = metrics?.totalLeads ?? metrics?.total_leads ?? null
  const activeToday = metrics?.activeToday ?? metrics?.active_today ?? null
  const tasksPending = metrics?.tasksPending ?? metrics?.tasks_pending ?? null
  const avgResponseTime = metrics?.avgResponseTime ?? metrics?.avg_response_time ?? null

  const doneCount = SPRINT_DONE.length
  const totalCount = SPRINT_DONE.length + SPRINT_PENDING.length
  const progressPct = Math.round((doneCount / totalCount) * 100)

  const categories = Array.from(new Set(SPRINT_DONE.map((i) => i.category)))

  return (
    <DashboardLayout>
      <div style={{ padding: '24px', maxWidth: '1280px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Command Center
            </h1>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
              {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Loading...'}
            </p>
          </div>
          <button
            onClick={fetchAll}
            disabled={loading}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 500,
              background: '#8B5CF6',
              color: 'white',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {/* ZONE 1 — System Health Strip */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '14px 20px',
          borderRadius: '10px',
          background: 'var(--bg-secondary)',
          flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: '4px' }}>
            System Health
          </span>
          {[
            { label: 'Database', online: dbOnline },
            { label: 'Web Agent', online: webOnline },
            { label: 'WhatsApp', online: null },
            { label: 'Voice', online: null },
          ].map(({ label, online }) => (
            <div
              key={label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                borderRadius: '20px',
                background: 'var(--bg-tertiary)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <span style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: online === null ? '#6B7280' : online ? '#22C55E' : '#EF4444',
                flexShrink: 0,
                boxShadow: online ? '0 0 6px #22C55E80' : undefined,
              }} />
              <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>
                {label}
              </span>
              {status?.connectivity?.responseTime && label === 'Database' && (
                <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                  {status.connectivity.responseTime}ms
                </span>
              )}
            </div>
          ))}
          {status?.systemHealth?.version && (
            <span style={{ marginLeft: 'auto', fontSize: '11px', fontFamily: 'monospace', color: '#8B5CF6', fontWeight: 600 }}>
              v{status.systemHealth.version}
            </span>
          )}
        </div>

        {/* ZONE 2 — Two Column: Sprint + Changelog */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

          {/* LEFT — Active Sprint */}
          <div style={{ borderRadius: '10px', background: 'var(--bg-secondary)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                Sprint: Go-Live Readiness
              </h2>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '0 0 4px' }}>Apr 7 → Apr 14</p>
              <p style={{ fontSize: '11px', fontWeight: 700, color: '#EF4444', margin: 0, letterSpacing: '0.04em' }}>
                ⚑ APR 14 DEADLINE — GO LIVE SPRINT
              </p>
            </div>

            {/* Progress bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{doneCount} of {totalCount} tasks done</span>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#22C55E' }}>{progressPct}%</span>
              </div>
              <div style={{ height: '6px', borderRadius: '3px', background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progressPct}%`, background: 'linear-gradient(90deg, #22C55E, #16A34A)', borderRadius: '3px', transition: 'width 0.4s ease' }} />
              </div>
            </div>

            {/* Done items grouped by category */}
            <div>
              <p style={{ fontSize: '11px', fontWeight: 600, color: '#22C55E', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>
                Done
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {categories.map((cat) => (
                  <div key={cat}>
                    <p style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 5px' }}>
                      {cat}
                    </p>
                    {SPRINT_DONE.filter((i) => i.category === cat).map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '3px 0' }}>
                        <span style={{ color: '#22C55E', fontSize: '12px', flexShrink: 0 }}>✓</span>
                        <span style={{ fontSize: '12px', color: 'var(--text-primary)', flex: 1 }}>{item.title}</span>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)', flexShrink: 0 }}>{item.date}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Pending items */}
            <div>
              <p style={{ fontSize: '11px', fontWeight: 600, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>
                Pending
              </p>
              {SPRINT_PENDING.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '3px 0' }}>
                  <span style={{ color: '#F59E0B', fontSize: '12px', flexShrink: 0 }}>⏱</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-primary)', flex: 1 }}>{item.title}</span>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)', flexShrink: 0 }}>{item.category}</span>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT — Build History */}
          <div style={{ borderRadius: '10px', background: 'var(--bg-secondary)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Build History
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', maxHeight: '560px' }}>
              {CHANGELOG.map((entry) => (
                <div key={entry.version} style={{ padding: '14px', borderRadius: '8px', background: 'var(--bg-tertiary)', border: '1px solid rgba(139,92,246,0.15)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <span style={{
                      padding: '3px 9px',
                      borderRadius: '5px',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      background: '#8B5CF620',
                      color: '#8B5CF6',
                      border: '1px solid #8B5CF640',
                    }}>
                      v{entry.version}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      {new Date(entry.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {entry.items.map((item, idx) => (
                      <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '7px' }}>
                        <span style={{ color: '#22C55E', fontSize: '11px', marginTop: '1px', flexShrink: 0 }}>✓</span>
                        <span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ZONE 3 — Live Metrics Strip */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '12px',
        }}>
          {[
            { label: 'Total Leads', value: totalLeads, suffix: '', color: '#8B5CF6' },
            { label: 'Active Today', value: activeToday, suffix: '', color: '#3B82F6' },
            { label: 'Tasks Pending', value: tasksPending, suffix: '', color: '#F59E0B' },
            { label: 'Avg Response', value: avgResponseTime, suffix: avgResponseTime ? 's' : '', color: '#22C55E' },
          ].map(({ label, value, suffix, color }) => (
            <div
              key={label}
              style={{
                padding: '16px 20px',
                borderRadius: '10px',
                background: 'var(--bg-secondary)',
                border: `1px solid ${color}25`,
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {label}
              </span>
              <span style={{ fontSize: '28px', fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
                {value !== null && value !== undefined ? `${value}${suffix}` : '—'}
              </span>
            </div>
          ))}
        </div>

      </div>
    </DashboardLayout>
  )
}
