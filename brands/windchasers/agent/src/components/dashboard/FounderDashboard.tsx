'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../lib/supabase/client'
import { playSound } from '@/lib/sound-prefs'
import Image from 'next/image'
import { MdTrendingUp, MdTrendingDown, MdRemove, MdCheckCircle, MdSchedule, MdMessage, MdWarning, MdArrowForward, MdLocalFireDepartment, MdSpeed, MdPeople, MdEvent, MdRefresh, MdCancel, MdTrendingUp as MdScoreUp, MdSwapHoriz, MdPhoneDisabled, MdArrowUpward, MdShowChart, MdFlashOn, MdChatBubble, MdCalendarToday, MdArrowDropDown, MdWhatsapp, MdLanguage, MdEventBusy, MdNotifications, MdFavorite } from 'react-icons/md'
import LeadDetailsModal from './LeadDetailsModal'
import TodaySnapshotButton from './TodaySnapshotButton'
import NotificationCenter from './NotificationCenter'
import DashboardBrain from './DashboardBrain'
import type { Lead } from '@/types'
import {
  Sparkline,
  ActivityArea,
  RadialProgress,
} from './MicroCharts'

type TimeFilter = 'All' | '7D' | '14D' | '30D'

interface FounderMetrics {
  hotLeads: { count: number; leads: Array<{ id: string; name: string; score: number }> }
  totalConversations: { total: number; count7D: number; count14D: number; count30D: number; trend7D: number; trend14D: number; trend30D: number }
  totalLeads: { count: number; count7D: number; count14D: number; count30D: number; fromConversations: number; conversionRate: number }
  engagedLeads: { count: number; count7D: number; count14D: number; count30D: number; total: number; engagementRate: number; leads: Array<{ id: string; name: string; score: number }> }
  warmLeads: { count: number; count7D: number; count14D: number; count30D: number; leads: Array<{ id: string; name: string; score: number }> }
  responseHealth: { avgMs: number; status: 'good' | 'warning' | 'critical' }
  leadsNeedingAttention: Array<{
    id: string
    name: string
    score: number
    lastContact: string
    stage: string
    owner?: { name?: string | null; email?: string | null } | null
    channel?: string | null
  }>
  upcomingBookings: Array<{
    id: string
    name: string
    title?: string | null
    date: string
    time: string
    datetime: string
    owner?: { name?: string | null; email?: string | null } | null
  }>
  staleLeads: { count: number; leads: Array<{ id: string; name: string }> }
  leadFlow: { new: number; engaged: number; qualified: number; booked: number }
  channelPerformance: {
    web: { total: number; booked: number }
    whatsapp: { total: number; booked: number }
    voice: { total: number; booked: number }
  }
  scoreDistribution: { hot: number; warm: number; cold: number }
  recentActivity: Array<{ id: string; channel: string; type: string; timestamp: string; content: string; metadata?: any }>
  quickStats: { bestChannel: string; busiestHour: string; topPainPoint: string }
  trends?: {
    leads: { data: Array<{ value: number }>; change: number }
    bookings: { data: Array<{ value: number }>; change: number }
    conversations: { data: Array<{ value: number }>; change: number }
    hotLeads: { data: Array<{ value: number }>; change: number }
    responseTime: { data: Array<{ value: number }>; change: number }
  }
  upcomingBookingsTrend?: Array<{ value: number }>
  hourlyActivity?: Array<{ time: string; value: number }>
  radialMetrics?: {
    avgScore: number
    responseRate: number
    bookingRate: number
    avgResponseTime: number
  }
  radialTrends?: {
    avgScore: Array<{ value: number }>
    responseRate: Array<{ value: number }>
    bookingRate: Array<{ value: number }>
    avgResponseTime: Array<{ value: number }>
  }
}

// "Mon, 15 Jun · 4:00 PM" in IST from a stored booking datetime.
function formatBookingWhen(iso: string): string {
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    const date = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
    const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
    return `${date} · ${time}`
  } catch {
    return ''
  }
}

// Human-readable duration from milliseconds (agent reply latency).
function fmtMs(ms: number): string {
  if (!ms || ms <= 0) return '—'
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`
  const h = Math.floor(ms / 3_600_000)
  const m = Math.round((ms % 3_600_000) / 60_000)
  return `${h}h ${m}m`
}

export default function FounderDashboard() {
  const router = useRouter()
  const [metrics, setMetrics] = useState<FounderMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [showLeadModal, setShowLeadModal] = useState(false)

  // Hot Leads threshold with localStorage persistence
  const [hotLeadThreshold] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('hot-lead-threshold')
      return saved ? parseInt(saved, 10) : 70
    }
    return 70
  })

  // Fire the soft "ready" chime once, when the home page's first load lands.
  const readyChimedRef = useRef(false)

  const loadMetrics = useCallback(async () => {
    try {
      const response = await fetch(`/api/dashboard/founder-metrics?hotLeadThreshold=${hotLeadThreshold}`)
      if (response.ok) {
        const data = await response.json()
        setMetrics(data)
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('Error loading metrics:', response.status, errorData)
        setMetrics(null)
      }
    } catch (error) {
      console.error('Error loading metrics:', error)
      setMetrics(null)
    } finally {
      setLoading(false)
      if (!readyChimedRef.current) {
        readyChimedRef.current = true
        playSound('ready') // once per mount; gated by the Configure toggle + mute
      }
    }
  }, [hotLeadThreshold])

  useEffect(() => {
    loadMetrics()
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') loadMetrics()
    }
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') loadMetrics()
    }, 60000)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [hotLeadThreshold, loadMetrics])

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  const openLeadModal = async (leadId: string) => {
    try {
      const supabase = createClient()
      const { data: lead, error } = await supabase
        .from('all_leads')
        .select('id, customer_name, email, phone, created_at, last_interaction_at, lead_score, lead_stage, sub_stage, unified_context, first_touchpoint, last_touchpoint, status')
        .eq('id', leadId)
        .single()

      if (error) {
        console.error('Error fetching lead:', error)
        return
      }
      if (!lead) return

      const typedLead = lead as any
      const unifiedContext = typedLead.unified_context || {}
      const webBooking = unifiedContext?.web?.booking || {}
      const whatsappBooking = unifiedContext?.whatsapp?.booking || {}
      const bookingDate = webBooking?.date || webBooking?.booking_date || whatsappBooking?.date || whatsappBooking?.booking_date || null
      const bookingTime = webBooking?.time || webBooking?.booking_time || whatsappBooking?.time || whatsappBooking?.booking_time || null

      const modalLead: Lead = {
        id: typedLead.id || '',
        name: typedLead.customer_name || 'Unknown',
        email: typedLead.email || '',
        phone: typedLead.phone || '',
        source: typedLead.first_touchpoint || typedLead.last_touchpoint || 'web',
        first_touchpoint: typedLead.first_touchpoint || null,
        last_touchpoint: typedLead.last_touchpoint || null,
        timestamp: typedLead.created_at || new Date().toISOString(),
        status: typedLead.status || null,
        booking_date: bookingDate,
        booking_time: bookingTime,
        unified_context: typedLead.unified_context || null,
        metadata: typedLead.metadata || {},
      }
      setSelectedLead(modalLead)
      setShowLeadModal(true)
    } catch (err) {
      console.error('Error opening lead modal:', err)
    }
  }

  const formatCountdown = (datetime: string) => {
    const bookingDate = new Date(datetime)
    const now = new Date()
    const diffMs = bookingDate.getTime() - now.getTime()
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    if (diffMs < 0) return 'Past'
    if (diffDays > 0) {
      const hours = Math.floor((diffMs % 86400000) / 3600000)
      return `In ${diffDays}d ${hours}h`
    }
    if (diffHours > 0) return `In ${diffHours}h`
    const mins = Math.floor(diffMs / 60000)
    return `In ${mins}m`
  }

  const getInitials = (name: string) =>
    name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || 'L'

  // Intent label from score (mockup: High Intent / Comparing / Ready to Book style).
  const intentFor = (score: number): { label: string; color: string; bg: string } => {
    if (score >= hotLeadThreshold) return { label: 'High Intent', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' }
    if (score >= 50) return { label: 'Comparing', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' }
    return { label: 'Needs follow-up', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' }
  }

  // Recommended next step derived from the lead's stage (Phase-1 heuristic;
  // a later phase wires the real agent_tasks "next action").
  const nextStepFor = (stage: string): string => {
    const s = (stage || '').toLowerCase()
    if (s.includes('booking')) return 'Confirm the slot'
    if (s.includes('high')) return 'Push to book a call'
    if (s.includes('qualified')) return 'Share pricing + offers'
    if (s.includes('engaged')) return 'Share program details'
    if (s.includes('converted')) return 'Onboard / next steps'
    if (s.includes('lost') || s.includes('cold')) return 'Re-engage'
    return 'First outreach'
  }

  // Status from last-contact recency + score.
  const statusFor = (lastContact: string, score: number): { label: string; color: string; bg: string } => {
    const hrs = (Date.now() - new Date(lastContact).getTime()) / 3_600_000
    if (score >= hotLeadThreshold && hrs > 24) return { label: 'Overdue', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' }
    if (hrs <= 24) return { label: 'Due today', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' }
    return { label: 'Scheduled', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 rounded-full animate-ping opacity-30" style={{ backgroundColor: 'var(--accent-primary)', width: '100px', height: '100px', margin: '-10px' }} />
            <div className="relative animate-pulse">
              <Image src="/logo.png" alt="Windchasers" width={80} height={80} className="drop-shadow-lg" priority />
            </div>
          </div>
          <div className="animate-pulse text-sm" style={{ color: 'var(--text-secondary)' }}>Loading dashboard...</div>
        </div>
      </div>
    )
  }

  if (!metrics) {
    return (
      <div className="p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
          <p className="text-red-700 dark:text-red-300 font-semibold mb-2">Failed to load metrics</p>
          <button onClick={loadMetrics} className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm">Retry</button>
        </div>
      </div>
    )
  }

  // ── Derived values for the mockup layout ──────────────────────────────────
  const rm = metrics.radialMetrics
  const flow = metrics.leadFlow || { new: 0, engaged: 0, qualified: 0, booked: 0 }
  const total = metrics.totalLeads?.count || 0
  const pct = (n: number) => (total > 0 ? `${Math.round((n / total) * 100)}% of total` : '')
  const convSeries = metrics.trends?.conversations?.data || []
  const dailyAvg = convSeries.length ? Math.round(convSeries.reduce((a, b) => a + (b.value || 0), 0) / convSeries.length) : 0
  // Booked calls + what share of total leads that represents (founder conversion view).
  const bookedVal = Math.max(flow.booked || 0, metrics.upcomingBookings.length)
  const bookedPctOfLeads = total > 0 ? `${Math.round((bookedVal / total) * 100)}% of total leads` : 'no leads yet'

  return (
    <div className="flex flex-col gap-3 p-3 sm:p-4 h-full overflow-y-auto xl:overflow-hidden">
      {/* Floating controls — home page only */}
      <TodaySnapshotButton />
      <NotificationCenter />
      <DashboardBrain />

      {/* ── ROW 1 · KPI cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4 shrink-0">
        <NewLeadsCard metrics={metrics} onOpen={() => router.push('/dashboard/leads')} />
        <KpiCard
          icon={<MdPeople size={15} />} iconColor="#22c55e"
          label="Engaged Leads"
          value={metrics.engagedLeads?.count ?? 0}
          sparkData={metrics.trends?.leads?.data} sparkColor="#22c55e"
          sub={total > 0 ? `of ${total} total leads` : 'engaged'}
          onClick={() => router.push('/dashboard/leads?filter=engaged')}
        />
        <KpiCard
          icon={<MdShowChart size={15} />} iconColor="#06b6d4"
          label="Response Rate"
          value={`${Math.round(rm?.responseRate ?? 0)}%`}
          sparkData={metrics.radialTrends?.responseRate} sparkColor="#06b6d4"
          sub="reply coverage"
        />
        {/* Follow-up Health — status + ring */}
        <div className="rounded-xl p-4 border flex flex-col justify-between" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', minHeight: 132 }}>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ backgroundColor: 'rgba(34,197,94,0.12)', color: '#22c55e' }}><MdFavorite size={15} /></span>
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Follow-up Health</span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <div>
              <div className="text-2xl sm:text-3xl font-bold leading-none capitalize" style={{ color: metrics.responseHealth.status === 'good' ? '#22c55e' : metrics.responseHealth.status === 'warning' ? '#f59e0b' : '#ef4444' }}>
                {metrics.responseHealth.status === 'good' ? 'Good' : metrics.responseHealth.status === 'warning' ? 'Fair' : 'Needs work'}
              </div>
            </div>
            <RadialProgress value={Math.round(rm?.responseRate ?? 0)} size={48} color={metrics.responseHealth.status === 'good' ? '#22c55e' : metrics.responseHealth.status === 'warning' ? '#f59e0b' : '#ef4444'} showPercentage={false} label="" />
          </div>
          <span className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{Math.round(rm?.responseRate ?? 0)}% on track</span>
        </div>
        <KpiCard
          icon={<MdEvent size={15} />} iconColor="#a855f7"
          label="Booked Calls / Events"
          value={bookedVal}
          delta={<KpiDelta change={metrics.trends?.bookings?.change} />}
          sparkData={metrics.trends?.bookings?.data} sparkColor="#a855f7"
          sub={bookedPctOfLeads}
          onClick={() => router.push('/dashboard/bookings')}
        />
        <KpiCard
          icon={<MdSpeed size={15} />} iconColor="#3B82F6"
          label="Avg Response Time"
          value={fmtMs(metrics.responseHealth.avgMs)}
          delta={<KpiDelta change={metrics.trends?.responseTime?.change} goodWhenUp={false} suffix="" />}
          sparkData={metrics.trends?.responseTime?.data} sparkColor="#3B82F6"
        />
      </div>

      {/* ── ROW 2 · Engine Overview + Upcoming Events ─────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 sm:gap-5 xl:flex-1 xl:min-h-0">
        {/* Engine Overview funnel */}
        <section className="xl:col-span-8 rounded-xl p-4 sm:p-6 border flex flex-col min-h-0 overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Engine Overview</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>How leads are moving through your follow-up engine</p>
          {/* Funnel fills the card's height so there's no dead space at the bottom */}
          <div className="flex-1 flex items-center justify-between gap-1 py-4 sm:py-6">
            <EngineNode icon={<MdPeople size={28} />} color="#3B82F6" count={metrics.totalLeads?.count ?? 0} label="Total Leads" sub="top of funnel" />
            <EngineNode icon={<MdPeople size={28} />} color="#22c55e" count={metrics.engagedLeads?.count ?? flow.engaged} label="Engaged" sub={pct(metrics.engagedLeads?.count ?? flow.engaged)} />
            <EngineNode icon={<MdLocalFireDepartment size={28} />} color="#f59e0b" count={metrics.warmLeads?.count ?? 0} label="Warm" sub={pct(metrics.warmLeads?.count ?? 0)} />
            <EngineNode icon={<MdSchedule size={28} />} color="#a855f7" count={metrics.staleLeads?.count ?? 0} label="Follow-up Due" sub={(metrics.staleLeads?.count ?? 0) > 0 ? 'Needs attention' : 'All clear'} />
            <EngineNode icon={<MdCalendarToday size={28} />} color="#10b981" count={flow.booked || 0} label="Booked" sub="This week" last />
          </div>
          <div className="pt-4 border-t text-xs flex items-center gap-2" style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}>
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#22c55e' }} />
            {metrics.responseHealth.status === 'good' ? 'Your follow-up engine is performing well. Keep it going!' : 'Some leads need attention — check the Follow-up Due column.'}
          </div>
        </section>

        {/* Upcoming Events — owner-aware (narrower so Engine Overview is more prominent) */}
        <section className="xl:col-span-4 rounded-xl p-4 sm:p-5 border flex flex-col min-h-0 overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
          <div className="flex items-center justify-between gap-3 mb-3 shrink-0">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Upcoming Events</h3>
            <button onClick={() => router.push('/dashboard/bookings')} className="text-xs font-medium flex items-center gap-1 hover:underline whitespace-nowrap" style={{ color: 'var(--accent-primary)' }}>
              View all <MdArrowForward size={13} />
            </button>
          </div>
          <div className="flex-1 space-y-2.5 overflow-y-auto min-h-0">
            {metrics.upcomingBookings.length > 0 ? (
              metrics.upcomingBookings.slice(0, 5).map((booking) => (
                <button
                  key={booking.id} type="button" onClick={() => openLeadModal(booking.id)}
                  className="w-full flex items-center gap-3 p-2.5 text-left rounded-lg transition-all border"
                  style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-tertiary)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent-primary)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-primary)' }}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold" style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}>
                    {getInitials(booking.name)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{booking.name}</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold whitespace-nowrap" style={{ background: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}>
                        {formatCountdown(booking.datetime)}
                      </span>
                    </div>
                    {booking.title && (
                      <p className="text-[11px] truncate" style={{ color: 'var(--text-primary)', opacity: 0.8 }}>{booking.title}</p>
                    )}
                    <p className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>
                      {formatBookingWhen(booking.datetime)}
                    </p>
                    <p className="text-[10px] truncate" style={{ color: booking.owner?.name ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                      Owner: {booking.owner?.name || 'Unassigned'}
                    </p>
                  </div>
                </button>
              ))
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No upcoming events</p>
            )}
          </div>
        </section>
      </div>

      {/* ── ROW 3 · Priority Lead Queue + Conversations Trend ─────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 sm:gap-5 xl:flex-1 xl:min-h-0">
        {/* Priority Lead Queue */}
        <section className="xl:col-span-7 rounded-xl border overflow-hidden flex flex-col min-h-0" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--border-primary)' }}>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Priority Lead Queue</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Leads that need your attention now</p>
            </div>
            <button onClick={() => router.push('/dashboard/leads')} className="text-xs font-medium flex items-center gap-1 hover:underline whitespace-nowrap" style={{ color: 'var(--accent-primary)' }}>
              View Leads <MdArrowForward size={13} />
            </button>
          </div>
          {metrics.leadsNeedingAttention.length > 0 ? (
            <div className="overflow-auto flex-1 min-h-0">
              <table className="min-w-full text-left">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                    <th className="px-4 py-2 font-medium">Lead</th>
                    <th className="px-3 py-2 font-medium">Intent</th>
                    <th className="px-3 py-2 font-medium hidden md:table-cell">Recommended Next Step</th>
                    <th className="px-3 py-2 font-medium hidden lg:table-cell">Due</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.leadsNeedingAttention.slice(0, 6).map((lead) => {
                    const intent = intentFor(lead.score)
                    const status = statusFor(lead.lastContact, lead.score)
                    return (
                      <tr key={lead.id} onClick={() => openLeadModal(lead.id)} className="group cursor-pointer border-t transition-colors" style={{ borderColor: 'var(--border-primary)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3 min-w-[150px]">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}>{getInitials(lead.name)}</span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{lead.name}</p>
                              <p className="text-[11px] truncate capitalize" style={{ color: 'var(--text-secondary)' }}>{lead.channel || 'unknown'} · score {lead.score}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center rounded px-2 py-1 text-[11px] font-semibold whitespace-nowrap" style={{ backgroundColor: intent.bg, color: intent.color }}>{intent.label}</span>
                        </td>
                        <td className="px-3 py-3 hidden md:table-cell">
                          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{nextStepFor(lead.stage)}</span>
                        </td>
                        <td className="px-3 py-3 hidden lg:table-cell">
                          <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{formatTimeAgo(lead.lastContact)}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center rounded px-2 py-1 text-[11px] font-medium whitespace-nowrap" style={{ backgroundColor: status.bg, color: status.color }}>{status.label}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-4 py-8 text-sm" style={{ color: 'var(--text-secondary)' }}>No priority leads right now.</div>
          )}
        </section>

        {/* Conversations Trend */}
        <section className="xl:col-span-5 rounded-xl p-4 sm:p-5 border flex flex-col min-h-0 overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
          <div className="flex items-center justify-between gap-3 mb-3 shrink-0">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Conversations Trend</h3>
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}>7D</span>
          </div>
          <div className="flex-1 min-h-[120px]">
            {convSeries.length > 1 ? (
              <ActivityArea data={convSeries.map((d, i) => ({ time: String(i), value: d.value }))} color="#afd510" />
            ) : (
              <div className="flex items-center justify-center h-full text-xs" style={{ color: 'var(--text-muted)' }}>Not enough data yet</div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t" style={{ borderColor: 'var(--border-primary)' }}>
            <div>
              <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{metrics.totalConversations.total}</div>
              <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Total</div>
            </div>
            <div>
              <KpiDelta change={metrics.trends?.conversations?.change} />
              <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>vs last 7 days</div>
            </div>
            <div>
              <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{dailyAvg}</div>
              <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Daily avg</div>
            </div>
          </div>
        </section>
      </div>

      {/* Lead Details Modal */}
      {showLeadModal && selectedLead && (
        <LeadDetailsModal
          lead={selectedLead}
          isOpen={showLeadModal}
          onClose={() => { setShowLeadModal(false); setSelectedLead(null) }}
          onStatusUpdate={async () => { await loadMetrics() }}
        />
      )}
    </div>
  )
}

// ── Home-page building blocks (mockup layout) ──────────────────────────────

function KpiDelta({ change, goodWhenUp = true, suffix = '%' }: { change?: number; goodWhenUp?: boolean; suffix?: string }) {
  if (change == null || !isFinite(change) || change === 0) return null
  const up = change > 0
  const good = up === goodWhenUp
  const color = good ? '#22c55e' : '#ef4444'
  const Icon = up ? MdTrendingUp : MdTrendingDown
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold" style={{ color }}>
      <Icon size={13} />{Math.abs(Math.round(change))}{suffix}
    </span>
  )
}

function KpiCard({ icon, iconColor, label, value, sub, delta, sparkData, sparkColor, onClick }: {
  icon: React.ReactNode
  iconColor: string
  label: string
  value: React.ReactNode
  sub?: string
  delta?: React.ReactNode
  sparkData?: Array<{ value: number }>
  sparkColor?: string
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl p-4 border flex flex-col justify-between ${onClick ? 'cursor-pointer hover:shadow-lg transition-shadow' : ''}`}
      style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', minHeight: 132 }}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ backgroundColor: `${iconColor}1f`, color: iconColor }}>{icon}</span>
        <span className="text-xs font-medium truncate" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      </div>
      <div className="flex items-end gap-2 mt-2">
        <span className="text-2xl sm:text-3xl font-bold leading-none" style={{ color: 'var(--text-primary)' }}>{value}</span>
        {delta}
      </div>
      {sparkData && sparkData.length > 1 ? (
        <div className="w-full mt-2" style={{ height: 30 }}>
          <Sparkline data={sparkData} color={sparkColor || iconColor} height={30} showGradient />
        </div>
      ) : (
        <div style={{ height: 30 }} />
      )}
      <span className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{sub || 'vs last 7 days'}</span>
    </div>
  )
}

// New Leads KPI with an inline period toggle (7D / 14D / 30D / All). Clicking the
// number opens the leads list; the pills swap the count without leaving the page.
function NewLeadsCard({ metrics, onOpen }: { metrics: FounderMetrics; onOpen: () => void }) {
  const [period, setPeriod] = useState<'7D' | '14D' | '30D' | 'All'>('7D')
  const tl = metrics.totalLeads
  const value = period === '7D' ? tl.count7D : period === '14D' ? tl.count14D : period === '30D' ? tl.count30D : tl.count
  const periods: Array<'7D' | '14D' | '30D' | 'All'> = ['7D', '14D', '30D', 'All']
  const spark = metrics.trends?.leads?.data

  return (
    <div className="rounded-xl p-4 border flex flex-col justify-between" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', minHeight: 132 }}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ backgroundColor: '#3B82F61f', color: '#3B82F6' }}><MdPeople size={15} /></span>
          <span className="text-xs font-medium truncate" style={{ color: 'var(--text-secondary)' }}>New Leads</span>
        </div>
        <div className="flex items-center gap-0.5">
          {periods.map((p) => (
            <button
              key={p}
              type="button"
              onClick={(e) => { e.stopPropagation(); setPeriod(p) }}
              className="text-[10px] font-semibold rounded px-1.5 py-0.5 transition-colors"
              style={{ color: period === p ? '#3B82F6' : 'var(--text-muted)', backgroundColor: period === p ? 'rgba(59,130,246,0.14)' : 'transparent' }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-end gap-2 mt-2 cursor-pointer" onClick={onOpen}>
        <span className="text-2xl sm:text-3xl font-bold leading-none" style={{ color: 'var(--text-primary)' }}>{value}</span>
        {/* Only the 7-day change is real; hide the delta on other periods rather
            than repeat the 7-day number (that's the bug founder flagged). */}
        {period === '7D' && <KpiDelta change={metrics.trends?.leads?.change} />}
      </div>
      {spark && spark.length > 1 ? (
        <div className="w-full mt-2" style={{ height: 30 }}>
          <Sparkline data={spark} color="#3B82F6" height={30} showGradient />
        </div>
      ) : (
        <div style={{ height: 30 }} />
      )}
      <span className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
        {period === 'All' ? 'all time' : `last ${period.replace('D', ' days')}`}
      </span>
    </div>
  )
}

function EngineNode({ icon, color, count, label, sub, last }: {
  icon: React.ReactNode
  color: string
  count: number
  label: string
  sub?: string
  last?: boolean
}) {
  return (
    <>
      <div className="flex flex-col items-center text-center flex-1 min-w-[64px]">
        <span className="flex h-16 w-16 items-center justify-center rounded-full mb-3" style={{ backgroundColor: `${color}1f`, color }}>{icon}</span>
        <span className="text-3xl font-bold leading-none" style={{ color: 'var(--text-primary)' }}>{count}</span>
        <span className="text-xs mt-1.5 leading-tight" style={{ color: 'var(--text-secondary)' }}>{label}</span>
        {sub && <span className="text-[11px] mt-0.5 font-medium" style={{ color }}>{sub}</span>}
      </div>
      {!last && <MdArrowForward className="shrink-0 mx-0.5 hidden sm:block" size={18} style={{ color: 'var(--text-muted)' }} />}
    </>
  )
}
