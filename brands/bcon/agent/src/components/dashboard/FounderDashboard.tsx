'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../lib/supabase/client'
import { playSound } from '@/lib/sound-prefs'
import Image from 'next/image'
import { MdTrendingUp, MdTrendingDown, MdRemove, MdCheckCircle, MdSchedule, MdMessage, MdWarning, MdArrowForward, MdLocalFireDepartment, MdSpeed, MdPeople, MdEvent, MdRefresh, MdCancel, MdTrendingUp as MdScoreUp, MdSwapHoriz, MdPhoneDisabled, MdArrowUpward, MdShowChart, MdFlashOn, MdChatBubble, MdCalendarToday, MdArrowDropDown, MdWhatsapp, MdLanguage, MdEventBusy, MdNotifications, MdFavorite, MdSettings, MdLogout, MdCall } from 'react-icons/md'
import LeadDetailsModal from './LeadDetailsModal'
import TodaySnapshotButton from './TodaySnapshotButton'
import NotificationCenter from './NotificationCenter'
import DashboardBrain from './DashboardBrain'
import { useFeatureFlags } from '@/lib/useFeatureFlags'
import type { Lead } from '@/types'
import {
  Sparkline,
  ActivityArea,
  ConversationsTrendChart,
  RadialProgress,
} from './MicroCharts'

type TimeFilter = 'All' | '7D' | '14D' | '30D'

interface FounderMetrics {
  hotLeads: { count: number; leads: Array<{ id: string; name: string; score: number }> }
  totalConversations: { total: number; count1D?: number; count7D: number; count14D: number; count30D: number; trend7D: number; trend14D: number; trend30D: number }
  totalLeads: { count: number; count1D?: number; count7D: number; count14D: number; count30D: number; change7D?: number; change14D?: number; change30D?: number; fromConversations: number; conversionRate: number }
  engagedLeads: { count: number; count1D?: number; count7D: number; count14D: number; count30D: number; total: number; engagementRate: number; leads: Array<{ id: string; name: string; score: number }> }
  warmLeads: { count: number; count1D?: number; count7D: number; count14D: number; count30D: number; leads: Array<{ id: string; name: string; score: number }> }
  leadsRecovered?: { count: number }
  funnel?: Record<'Today' | '7D' | '14D' | 'All', { total: number; engaged: number; warm: number; followUpDue: number; booked: number }>
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
  calls?: {
    total: number
    inbound: number
    outbound: number
    today: number
    todayInbound: number
    todayOutbound: number
    count7D: number
    trend7D: number
    trend: { data: Array<{ value: number }>; change: number }
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
  trendSeries?: { conversations: Record<TimeFilter, Array<{ value: number }>> }
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
  // Runtime feature flags (Settings → Features) gate the Brain button.
  const features = useFeatureFlags()
  const [metrics, setMetrics] = useState<FounderMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [showLeadModal, setShowLeadModal] = useState(false)

  // Per-card date ranges (founder: "put the toggle inside the cards, as we used
  // to have"). Active Conversations defaults to Today (24h); the trend to 7D.
  const [acRange, setAcRange] = useState<'Today' | '7D' | '14D'>('Today')
  const [range, setRange] = useState<'7D' | '14D' | '30D'>('7D')
  // Engine Overview funnel — All-time snapshot by default, with 7d/14d windows.
  const [engineRange, setEngineRange] = useState<'Today' | '7D' | '14D' | 'All'>('All')
  // Top-bar user profile menu.
  const [profileOpen, setProfileOpen] = useState(false)
  const [user, setUser] = useState<{ name: string; email: string } | null>(null)
  const profileRef = useRef<HTMLDivElement>(null)

  // Pull the signed-in user once for the greeting + profile menu.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (cancelled) return
        const meta = (user?.user_metadata || {}) as Record<string, unknown>
        const name = (meta.full_name as string) || (meta.name as string) || ''
        setUser({ name, email: user?.email || '' })
      } catch { /* soft-fail — greeting falls back to "Founder" */ }
    })()
    return () => { cancelled = true }
  }, [])

  // Close the profile menu on outside click.
  useEffect(() => {
    if (!profileOpen) return
    const onClick = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [profileOpen])

  const handleLogout = async () => {
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
    } catch { /* redirect anyway */ }
    window.location.href = '/auth/login'
  }

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
        .select('id, customer_name, email, phone, created_at, last_interaction_at, lead_score, lead_stage, sub_stage, unified_context, first_touchpoint, last_touchpoint, metadata')
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

  // Recency tint for the countdown chip only: closer = blue, mid = amber, far = muted.
  const countdownTint = (datetime: string): { bg: string; color: string } => {
    const h = (new Date(datetime).getTime() - Date.now()) / 3_600_000
    if (h <= 24) return { bg: 'rgba(59,130,246,0.18)', color: '#60a5fa' }
    if (h <= 72) return { bg: 'rgba(245,158,11,0.18)', color: '#fbbf24' }
    return { bg: 'var(--bg-tertiary)', color: 'var(--text-muted)' }
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
              <Image src="/bcon-icon.png" alt="BCON" width={80} height={80} className="drop-shadow-lg" priority />
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
  // Engine Overview — the lead-funnel nodes (Total/Engaged/Warm) follow its
  // All/7d/14d toggle; Follow-up Due + Booked stay current-state (no historical
  // range in the metrics yet).
  // Cohort funnel for the selected window — all five nodes scale together (leads
  // acquired in the window → how far each got). Falls back to the old per-metric
  // counts if the backend hasn't shipped `funnel` yet.
  const fn = metrics.funnel?.[engineRange]
  const engTotal = fn ? fn.total : engineRange === 'Today' ? (metrics.totalLeads?.count1D ?? 0) : engineRange === '7D' ? (metrics.totalLeads?.count7D ?? 0) : engineRange === '14D' ? (metrics.totalLeads?.count14D ?? 0) : (metrics.totalLeads?.count ?? 0)
  const engEngaged = fn ? fn.engaged : engineRange === '7D' ? (metrics.engagedLeads?.count7D ?? 0) : engineRange === '14D' ? (metrics.engagedLeads?.count14D ?? 0) : (metrics.engagedLeads?.count ?? flow.engaged)
  const engWarm = fn ? fn.warm : engineRange === '7D' ? (metrics.warmLeads?.count7D ?? 0) : engineRange === '14D' ? (metrics.warmLeads?.count14D ?? 0) : (metrics.warmLeads?.count ?? 0)
  const engDue = fn ? fn.followUpDue : (metrics.staleLeads?.count ?? 0)
  const engBooked = fn ? fn.booked : (flow.booked || 0)
  const engPct = (n: number) => (engTotal > 0 ? `${Math.round((n / engTotal) * 100)}% of total` : '0% of total')
  const engTopSub = engineRange === 'All' ? 'top of funnel' : engineRange === 'Today' ? 'new today' : engineRange === '7D' ? 'new in 7 days' : 'new in 14 days'
  // Active Conversations card — its OWN toggle (24h / 7d / 14d), distinct leads
  // with conversation activity in the window.
  const tc = metrics.totalConversations
  const acValue = acRange === '7D' ? tc.count7D : acRange === '14D' ? tc.count14D : (tc.count1D ?? 0)
  const acLabel = acRange === 'Today' ? 'in the last 24 hours' : acRange === '7D' ? 'in the last 7 days' : 'in the last 14 days'
  // Conversations Trend — its own toggle (7d / 14d / 30d). Real per-day series
  // (distinct leads messaged/day); old trends.conversations.data came back ~flat.
  const rangeDays = range === '14D' ? 14 : range === '30D' ? 30 : 7
  const rangeLabel = `last ${rangeDays} days`
  const convSeries = (metrics.trendSeries?.conversations?.[range]?.length
    ? metrics.trendSeries.conversations[range]
    : metrics.trends?.conversations?.data) || []
  const convTotal = convSeries.length ? convSeries.reduce((a, b) => a + (b.value || 0), 0) : metrics.totalConversations.total
  const dailyAvg = convSeries.length ? Math.round((convTotal / convSeries.length) * 10) / 10 : 0
  const convChange = range === '14D'
    ? metrics.totalConversations.trend14D
    : range === '30D'
      ? metrics.totalConversations.trend30D
      : metrics.totalConversations.trend7D
  const displayName = user?.name || (user?.email ? user.email.split('@')[0] : 'Founder')
  const firstName = displayName.split(' ')[0] || 'Founder'
  const profileInitials = getInitials(displayName)
  // Time-of-day greeting in IST (shifts morning/afternoon/evening/night).
  const istHour = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }))
  const greeting = istHour < 12 ? 'Good morning' : istHour < 17 ? 'Good afternoon' : istHour < 21 ? 'Good evening' : 'Good night'
  // Follow-up Health follows the REPLY RATE shown on the card (not the
  // response-time bucket) — so a 100% reply rate never reads as "Fair".
  // >=90% green/Good, >=70% amber/Fair, else red/Needs work. Matches Windchasers.
  const replyRate = Math.round(rm?.responseRate ?? 0)
  const healthLevel: 'good' | 'warning' | 'critical' = replyRate >= 90 ? 'good' : replyRate >= 70 ? 'warning' : 'critical'
  const healthColor = healthLevel === 'good' ? '#22c55e' : healthLevel === 'warning' ? '#f59e0b' : '#ef4444'
  const healthLabel = healthLevel === 'good' ? 'Good' : healthLevel === 'warning' ? 'Fair' : 'Needs work'
  // Booked calls + what share of total leads that represents (founder conversion view).
  const bookedVal = Math.max(flow.booked || 0, metrics.upcomingBookings.length)
  const bookedPctOfLeads = total > 0 ? `${Math.round((bookedVal / total) * 100)}% of total leads` : 'no leads yet'

  return (
    <div className="flex flex-col gap-3 p-3 sm:p-4 h-full overflow-y-auto xl:overflow-hidden">
      {/* Subtle bento entrance — cards fade + rise in, lightly staggered. Plays
          once on mount (DOM persists across the 60s metric refresh, so it doesn't
          replay). Respects reduced-motion. */}
      <style>{`
        @keyframes wcBentoIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @media (prefers-reduced-motion: no-preference) {
          .wc-bento > * { animation: wcBentoIn 0.45s cubic-bezier(0.22,1,0.36,1) both; }
          .wc-bento > *:nth-child(2) { animation-delay: 0.05s; }
          .wc-bento > *:nth-child(3) { animation-delay: 0.10s; }
          .wc-bento > *:nth-child(4) { animation-delay: 0.15s; }
          .wc-bento > *:nth-child(5) { animation-delay: 0.20s; }
        }
      `}</style>
      {/* ── ROW 0 · Top bar — greeting + range toggle + controls + profile ── */}
      <header className="flex items-center justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-bold leading-tight truncate" style={{ color: 'var(--text-primary)' }}>
            {greeting}, {firstName} <span aria-hidden>👋</span>
          </h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Labelled buttons make Snapshot + Ask PROXe discoverable; bell stays an
              icon on the right next to the profile. */}
          <TodaySnapshotButton inline label="Snapshot" />
          {features.brain && <DashboardBrain inline label="Ask PROXe" />}
          <NotificationCenter inline />
          {/* Profile menu */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setProfileOpen((o) => !o)}
              className="flex items-center gap-1 rounded-full pl-1 pr-1.5 py-1 border transition-colors hover:opacity-90"
              style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
              aria-haspopup="menu"
              aria-expanded={profileOpen}
              title={user?.email || 'Account'}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold" style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}>
                {profileInitials}
              </span>
              <MdArrowDropDown size={18} style={{ color: 'var(--text-secondary)' }} />
            </button>
            {profileOpen && (
              <div className="absolute right-0 mt-2 rounded-xl border shadow-lg py-1 z-[65]" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)', minWidth: 220 }}>
                <div className="px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-muted)' }}>Signed in as</div>
                  <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }} title={user?.email}>{displayName}</div>
                  {user?.email && <div className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>{user.email}</div>}
                </div>
                <div style={{ height: 1, backgroundColor: 'var(--border-primary)', margin: '4px 0' }} />
                <button
                  onClick={() => { setProfileOpen(false); router.push('/dashboard/settings') }}
                  className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm transition-colors"
                  style={{ color: 'var(--text-primary)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <MdSettings size={17} /> Settings
                </button>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm transition-colors"
                  style={{ color: 'var(--text-primary)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <MdLogout size={17} /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── ROW 1 · KPI cards ─────────────────────────────────────────────── */}
      <div className="wc-bento grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4 shrink-0">
        {/* Card 1 — Active Conversations: own toggle (24h / 7d / 14d). */}
        <div className="rounded-xl p-4 border flex flex-col justify-between" style={{ backgroundColor: 'color-mix(in srgb, #3B82F6 4%, var(--bg-primary))', borderColor: 'color-mix(in srgb, #3B82F6 14%, var(--border-primary))', minHeight: 132, boxShadow: '0 6px 18px rgba(0,0,0,0.22)' }}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ backgroundColor: '#3B82F61f', color: '#3B82F6' }}><MdChatBubble size={15} /></span>
              <span className="text-xs font-medium truncate" style={{ color: 'var(--text-secondary)' }}>Active Conversations</span>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              {(['Today', '7D', '14D'] as const).map((p) => (
                <button
                  key={p} type="button" onClick={(e) => { e.stopPropagation(); setAcRange(p) }}
                  className="text-[10px] font-semibold rounded px-1.5 py-0.5 transition-colors"
                  style={{ color: acRange === p ? '#3B82F6' : 'var(--text-muted)', backgroundColor: acRange === p ? 'rgba(59,130,246,0.14)' : 'transparent' }}
                >
                  {p === 'Today' ? '24h' : p}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-end gap-2 mt-2 cursor-pointer" onClick={() => router.push('/dashboard/inbox')}>
            <span className="text-2xl sm:text-3xl font-bold leading-none" style={{ color: 'var(--text-primary)' }}>{acValue}</span>
          </div>
          {(() => {
            // Sparkline tracks the selected window (Today shows the 7-day context).
            const acSeries = metrics.trendSeries?.conversations?.[acRange === 'Today' ? '7D' : acRange]
            return acSeries && acSeries.length > 1 ? (
              <div className="w-full mt-2" style={{ height: 30 }}>
                <Sparkline data={acSeries} color="#3B82F6" height={30} showGradient />
              </div>
            ) : (
              <div style={{ height: 30 }} />
            )
          })()}
          <span className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{acLabel}</span>
        </div>
        {/* Card 2 — High Intent Leads: the hot, sales-ready leads PROXe scored. */}
        <KpiCard
          icon={<MdLocalFireDepartment size={15} />} iconColor="#22c55e"
          label="High Intent Leads"
          value={metrics.hotLeads?.count ?? 0}
          sparkData={metrics.trends?.hotLeads?.data} sparkColor="#22c55e"
          sub="flagged high-intent by PROXe"
          onClick={() => router.push('/dashboard/leads?filter=hot')}
        />
        {/* Follow-up Health — status + ring; whole card follows the status colour. */}
        <div className="rounded-xl p-4 border flex flex-col justify-between" style={{ backgroundColor: `color-mix(in srgb, ${healthColor} 4%, var(--bg-primary))`, borderColor: `color-mix(in srgb, ${healthColor} 14%, var(--border-primary))`, minHeight: 132, boxShadow: '0 6px 18px rgba(0,0,0,0.22)' }}>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ backgroundColor: `color-mix(in srgb, ${healthColor} 16%, transparent)`, color: healthColor }}>{healthLevel === 'good' ? <MdFavorite size={15} /> : <MdWarning size={15} />}</span>
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Follow-up Health</span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <div>
              <div className="text-2xl sm:text-3xl font-bold leading-none capitalize" style={{ color: healthColor }}>
                {healthLabel}
              </div>
            </div>
            <RadialProgress value={replyRate} size={48} color={healthColor} showPercentage={false} label="" />
          </div>
          <span className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{replyRate}% reply rate · {healthLevel === 'good' ? 'on track' : healthLevel === 'warning' ? 'room to improve' : 'needs attention'}</span>
        </div>
        <KpiCard
          icon={<MdEvent size={15} />} iconColor="#a855f7"
          label="Booked Calls / Events"
          value={bookedVal}
          delta={<KpiDelta change={metrics.trends?.bookings?.change} />}
          sparkData={metrics.trends?.bookings?.data} sparkColor="#a855f7"
          sub="vs last 7 days"
          onClick={() => router.push('/dashboard/bookings')}
        />
        <KpiCard
          icon={<MdSpeed size={15} />} iconColor="#3B82F6"
          label="Avg Response Time"
          value={fmtMs(metrics.responseHealth.avgMs)}
          delta={<KpiDelta change={metrics.trends?.responseTime?.change} goodWhenUp={false} suffix="" />}
          sparkData={metrics.trends?.responseTime?.data} sparkColor="#3B82F6"
        />
        {/* Calls — inbound + outbound voice volume (links to the Calls view). */}
        <KpiCard
          icon={<MdCall size={15} />} iconColor="#06b6d4"
          label="Calls"
          value={metrics.calls?.total ?? 0}
          delta={<KpiDelta change={metrics.calls?.trend?.change} />}
          sparkData={metrics.calls?.trend?.data} sparkColor="#06b6d4"
          sub={`${metrics.calls?.inbound ?? 0} in · ${metrics.calls?.outbound ?? 0} out`}
          onClick={() => router.push('/dashboard/calls')}
        />
      </div>

      {/* ── ROW 2 · Engine Overview + Upcoming Events ─────────────────────── */}
      <div className="wc-bento grid grid-cols-1 xl:grid-cols-12 gap-4 sm:gap-5 xl:flex-1 xl:min-h-0">
        {/* Engine Overview funnel */}
        <section className="xl:col-span-8 rounded-xl p-4 border flex flex-col min-h-0 overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
          <div className="flex items-center justify-between gap-2 shrink-0">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Engine Overview</h3>
            <div className="flex items-center gap-0.5 shrink-0">
              {(['Today', '7D', '14D', 'All'] as const).map((p) => (
                <button
                  key={p} type="button" onClick={() => setEngineRange(p)}
                  className="text-[10px] font-semibold rounded px-1.5 py-0.5 transition-colors"
                  style={{ color: engineRange === p ? 'var(--accent-primary)' : 'var(--text-muted)', backgroundColor: engineRange === p ? 'var(--accent-subtle)' : 'transparent' }}
                >
                  {p === 'Today' ? '24h' : p}
                </button>
              ))}
            </div>
          </div>
          {/* Funnel fills the card's height so there's no dead space at the bottom */}
          <div className="flex-1 flex items-center justify-between gap-1 py-4 sm:py-6">
            <EngineNode icon={<MdPeople size={28} />} color="#3B82F6" count={engTotal} label="Total Leads" sub={engTopSub} />
            <EngineNode icon={<MdPeople size={28} />} color="#22c55e" count={engEngaged} label="Engaged" sub={engPct(engEngaged)} />
            <EngineNode icon={<MdLocalFireDepartment size={28} />} color="#f59e0b" count={engWarm} label="Warm" sub={engPct(engWarm)} />
            <EngineNode icon={<MdSchedule size={28} />} color="#a855f7" count={engDue} label="Follow-up Due" sub={engDue > 0 ? 'Needs attention' : 'All clear'} />
            <EngineNode icon={<MdCalendarToday size={28} />} color="#10b981" count={engBooked} label="Booked" sub={engineRange === 'All' ? 'all time' : engineRange === 'Today' ? 'today' : `last ${engineRange === '7D' ? 7 : 14} days`} last />
          </div>
          <div className="pt-4 border-t text-xs flex items-center gap-2" style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}>
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: healthColor }} />
            {healthLevel === 'good' ? 'Your follow-up engine is performing well. Keep it going!' : 'Some leads need attention — check the Follow-up Due column.'}
          </div>
        </section>

        {/* Upcoming Events — owner-aware (narrower so Engine Overview is more prominent) */}
        <section className="xl:col-span-4 rounded-xl p-4 border flex flex-col min-h-0 overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
          <div className="flex items-center justify-between gap-3 mb-3 shrink-0">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Upcoming Events</h3>
            <button onClick={() => router.push('/dashboard/bookings')} className="text-xs font-medium flex items-center gap-1 hover:underline whitespace-nowrap" style={{ color: 'var(--accent-primary)' }}>
              View all <MdArrowForward size={13} />
            </button>
          </div>
          <div className="flex-1 space-y-1.5 overflow-y-auto min-h-0 pr-1.5">
            {metrics.upcomingBookings.length > 0 ? (
              metrics.upcomingBookings.map((booking) => (
                <button
                  key={booking.id} type="button" onClick={() => openLeadModal(booking.id)}
                  className="w-full flex items-start gap-2 p-2 text-left rounded-lg transition-all border"
                  style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-tertiary)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent-primary)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-primary)' }}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold" style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}>
                    {getInitials(booking.name)}
                  </span>
                  <div className="flex-1 min-w-0">
                    {/* Line 1 — name · date · owner, with the recency-coloured
                        countdown chip on the right (only thing that's coloured). */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-baseline gap-2.5 min-w-0">
                        <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{booking.name}</p>
                        <span className="flex items-center gap-1.5 shrink-0 text-[10px] whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                          <span>{formatBookingWhen(booking.datetime)}</span>
                          <span style={{ opacity: 0.4 }}>·</span>
                          <span style={{ color: booking.owner?.name ? 'var(--text-secondary)' : 'var(--text-muted)' }}>{booking.owner?.name || 'Unassigned'}</span>
                        </span>
                      </div>
                      {(() => { const t = countdownTint(booking.datetime); return (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap shrink-0" style={{ background: t.bg, color: t.color }}>
                          {formatCountdown(booking.datetime)}
                        </span>
                      ) })()}
                    </div>
                    {/* Line 2 — event title (only when present). No third line. */}
                    {booking.title && (
                      <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>{booking.title}</p>
                    )}
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
      <div className="wc-bento grid grid-cols-1 xl:grid-cols-12 gap-4 sm:gap-5 xl:flex-1 xl:min-h-0">
        {/* Priority Lead Queue */}
        <section className="xl:col-span-7 rounded-xl border overflow-hidden flex flex-col min-h-0" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
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
        <section className="xl:col-span-5 rounded-xl p-4 border flex flex-col min-h-0 overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)', boxShadow: '0 6px 18px rgba(0,0,0,0.22)' }}>
          <div className="flex items-center justify-between gap-3 mb-3 shrink-0">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Conversations Trend</h3>
              <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Conversations initiated per day</p>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              {(['7D', '14D', '30D'] as const).map((p) => (
                <button
                  key={p} type="button" onClick={() => setRange(p)}
                  className="text-[10px] font-semibold rounded px-1.5 py-0.5 transition-colors"
                  style={{ color: range === p ? 'var(--accent-primary)' : 'var(--text-muted)', backgroundColor: range === p ? 'var(--accent-subtle)' : 'transparent' }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 min-h-0">
            {convSeries.length > 1 ? (
              <ConversationsTrendChart data={convSeries} days={rangeDays} color="var(--accent-primary)" />
            ) : (
              <div className="flex items-center justify-center h-full text-xs" style={{ color: 'var(--text-muted)' }}>Not enough data yet</div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3 p-3 rounded-lg border shrink-0" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-tertiary)' }}>
            <div>
              <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{convTotal}</div>
              <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Total</div>
            </div>
            <div>
              <KpiDelta change={convChange} />
              <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>vs prior {rangeDays}d</div>
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
      style={{ backgroundColor: `color-mix(in srgb, ${iconColor} 4%, var(--bg-primary))`, borderColor: `color-mix(in srgb, ${iconColor} 14%, var(--border-primary))`, minHeight: 132, boxShadow: '0 6px 18px rgba(0,0,0,0.22)' }}
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
