'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../lib/supabase/client'
import { playSound } from '@/lib/sound-prefs'
import Image from 'next/image'
import { MdTrendingUp, MdTrendingDown, MdRemove, MdCheckCircle, MdSchedule, MdMessage, MdWarning, MdArrowForward, MdLocalFireDepartment, MdSpeed, MdPeople, MdEvent, MdRefresh, MdCancel, MdTrendingUp as MdScoreUp, MdSwapHoriz, MdPhoneDisabled, MdArrowUpward, MdShowChart, MdFlashOn, MdChatBubble, MdCalendarToday, MdArrowDropDown, MdWhatsapp, MdLanguage, MdEventBusy, MdNotifications } from 'react-icons/md'
import LeadDetailsModal from './LeadDetailsModal'
import TodaySnapshotButton from './TodaySnapshotButton'
import NotificationCenter from './NotificationCenter'
import DashboardBrain from './DashboardBrain'
import type { Lead } from '@/types'
import {
  Sparkline,
  TrendSparkline,
  MiniFunnel,
  ChannelActivityBars,
  DonutChart,
  Heatmap,
  StackedBar,
  ActivityArea,
  RadialProgress,
  MiniBarChart,
} from './MicroCharts'

type TimeFilter = 'All' | '7D' | '14D' | '30D'
const TIME_FILTERS: TimeFilter[] = ['All', '7D', '14D', '30D']

interface FounderMetrics {
  hotLeads: { count: number; leads: Array<{ id: string; name: string; score: number }> }
  totalConversations: { total: number; count7D: number; count14D: number; count30D: number; trend7D: number; trend14D: number; trend30D: number }
  totalLeads: { count: number; count7D: number; count14D: number; count30D: number; fromConversations: number; conversionRate: number }
  engagedLeads: { count: number; count7D: number; count14D: number; count30D: number; total: number; engagementRate: number; leads: Array<{ id: string; name: string; score: number }> }
  warmLeads: { count: number; count7D: number; count14D: number; count30D: number; leads: Array<{ id: string; name: string; score: number }> }
  responseHealth: { avgMs: number; status: 'good' | 'warning' | 'critical' }
  leadsNeedingAttention: Array<{ id: string; name: string; score: number; lastContact: string; stage: string }>
  upcomingBookings: Array<{ id: string; name: string; title?: string | null; date: string; time: string; datetime: string }>
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
  trendSeries?: {
    conversations: Record<TimeFilter, Array<{ value: number }>>
    totalLeads: Record<TimeFilter, Array<{ value: number }>>
    engagedLeads: Record<TimeFilter, Array<{ value: number }>>
    warmLeads: Record<TimeFilter, Array<{ value: number }>>
  }
  upcomingBookingsTrend?: Array<{ value: number }>
  hourlyActivity?: Array<{ time: string; value: number }>
  channelDistribution?: Array<{ name: string; value: number }>
  heatmapData?: Array<{ hour: number; value: number }>
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

export default function FounderDashboard() {
  const router = useRouter()
  const [metrics, setMetrics] = useState<FounderMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [showLeadModal, setShowLeadModal] = useState(false)
  const [conversationTimeFilter, setConversationTimeFilter] = useState<TimeFilter>('All')
  const [engagedLeadsFilter, setEngagedLeadsFilter] = useState<TimeFilter>('All')
  const [warmLeadsFilter, setWarmLeadsFilter] = useState<TimeFilter>('All')
  const [leadsFilter, setLeadsFilter] = useState<TimeFilter>('All')
  
  // Hot Leads threshold with localStorage persistence
  const [hotLeadThreshold, setHotLeadThreshold] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('hot-lead-threshold')
      return saved ? parseInt(saved, 10) : 70
    }
    return 70
  })
  const [showThresholdDropdown, setShowThresholdDropdown] = useState(false)

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
    // Initial load
    loadMetrics()
    
    // Only poll when component is visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadMetrics()
      }
    }
    
    // Poll every 60 seconds (1 minute) instead of 30 seconds
    const interval = setInterval(() => {
      // Only poll if page is visible
      if (document.visibilityState === 'visible') {
        loadMetrics()
      }
    }, 60000)
    
    // Listen for visibility changes
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
    console.log('🔵 openLeadModal called with leadId:', leadId)
    try {
      const supabase = createClient()
      const { data: lead, error } = await supabase
        .from('all_leads')
        .select('id, customer_name, email, phone, created_at, last_interaction_at, lead_score, lead_stage, sub_stage, unified_context, first_touchpoint, last_touchpoint, status')
        .eq('id', leadId)
        .single()

      if (error) {
        console.error('❌ Error fetching lead:', error)
        return
      }

      if (lead) {
        const typedLead = lead as {
          id?: string
          customer_name?: string | null
          email?: string | null
          phone?: string | null
          created_at?: string | null
          last_interaction_at?: string | null
          lead_score?: number | null
          lead_stage?: string | null
          sub_stage?: string | null
          status?: string | null
          first_touchpoint?: string | null
          last_touchpoint?: string | null
          metadata?: any
          unified_context?: {
            web?: { booking?: any; booking_date?: any; booking_time?: any }
            whatsapp?: { booking?: any; booking_date?: any; booking_time?: any }
          }
        }
        console.log('✅ Lead fetched:', typedLead.customer_name || 'Unknown')
        // Get booking data from unified_context
        const unifiedContext = typedLead.unified_context || {}
        const webBooking = unifiedContext?.web?.booking || {}
        const whatsappBooking = unifiedContext?.whatsapp?.booking || {}
        
        const bookingDate = 
          webBooking?.date || 
          webBooking?.booking_date ||
          whatsappBooking?.date ||
          whatsappBooking?.booking_date ||
          null
        
        const bookingTime = 
          webBooking?.time || 
          webBooking?.booking_time ||
          whatsappBooking?.time ||
          whatsappBooking?.booking_time ||
          null

        // Convert to Lead type expected by LeadDetailsModal
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

        console.log('✅ Setting selected lead and opening modal')
        setSelectedLead(modalLead)
        setShowLeadModal(true)
        console.log('✅ Modal state updated - showLeadModal:', true, 'selectedLead:', modalLead.id)
      } else {
        console.warn('⚠️ Lead data is null or undefined')
      }
    } catch (err) {
      console.error('❌ Error opening lead modal:', err)
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

  const getResponseHealthColor = (status: string) => {
    switch (status) {
      case 'good': return 'text-green-600 dark:text-green-400'
      case 'warning': return 'text-yellow-600 dark:text-yellow-400'
      case 'critical': return 'text-red-600 dark:text-red-400'
      default: return 'text-gray-600 dark:text-gray-400'
    }
  }

  const getResponseHealthBg = (status: string) => {
    switch (status) {
      case 'good': return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
      case 'warning': return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
      case 'critical': return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
      default: return 'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800'
    }
  }

  // Traffic light colors for At a Glance metrics (B2B warm WhatsApp lead benchmarks)
  const getMetricColor = (metricType: 'avgScore' | 'responseRate' | 'bookingRate' | 'avgResponseTime', value: number): string => {
    const GREEN = '#22c55e'
    const AMBER = '#f59e0b'
    const RED = '#ef4444'

    switch (metricType) {
      // Thresholds tuned to realistic B2B lead-gen / AI-agent benchmarks so a
      // healthy dashboard reads green, not alarming red on first open.
      case 'avgScore':
        // Lead score 0-100. Avg ~50 across a funnel is solid.
        if (value >= 50) return GREEN
        if (value >= 30) return AMBER
        return RED

      case 'responseRate':
        // % of inbound that got a reply. 80%+ is healthy for an always-on agent.
        if (value >= 80) return GREEN
        if (value >= 50) return AMBER
        return RED

      case 'bookingRate':
        // Lead → booking conversion %. 8%+ is strong for cold WhatsApp leads
        // (industry lead-to-meeting benchmarks sit ~5-12%).
        if (value >= 8) return GREEN
        if (value >= 3) return AMBER
        return RED

      case 'avgResponseTime':
        // Agent reply latency (ms). Lower is better; under ~5s feels instant.
        if (value <= 5000) return GREEN
        if (value <= 15000) return AMBER
        return RED

      default:
        return GREEN
    }
  }

  const periodLabel = (period: TimeFilter) => {
    if (period === 'All') return 'all time'
    if (period === '7D') return 'last 7 days'
    if (period === '14D') return 'last 14 days'
    return 'last 30 days'
  }

  const getTrendData = (
    metric: keyof NonNullable<FounderMetrics['trendSeries']>,
    period: TimeFilter,
    fallback?: Array<{ value: number }>,
  ) => {
    const data = metrics?.trendSeries?.[metric]?.[period]
    return data && data.length > 0 ? data : fallback || []
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div
              className="absolute inset-0 rounded-full animate-ping opacity-30"
              style={{
                backgroundColor: 'var(--accent-primary)',
                width: '100px',
                height: '100px',
                margin: '-10px',
              }}
            />
            <div className="relative animate-pulse">
              <Image
                src="/logo.png"
                alt="BCON"
                width={80}
                height={80}
                className="drop-shadow-lg"
                priority
              />
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
          <p className="text-sm text-red-600 dark:text-red-400">
            Please check:
          </p>
          <ul className="text-sm text-red-600 dark:text-red-400 list-disc list-inside mt-2 space-y-1">
            <li>Server is running (check terminal logs)</li>
            <li>Database connection is working</li>
            <li>Check browser console for detailed errors</li>
          </ul>
          <button
            onClick={loadMetrics}
            className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-6 p-4 sm:p-6 min-h-[calc(100vh-3.5rem)]">

      {/* Today's Snapshot — front-dashboard only (fixed top-right "eye" button) */}
      <TodaySnapshotButton />

      {/* Status-change notifications — home page only (bell below the eye + toasts + sound) */}
      <NotificationCenter />

      {/* Dashboard Brain — ask-anything over live data (button below the bell) */}
      <DashboardBrain />

      {/* AT A GLANCE - Radial Progress Charts with Trends */}
      {metrics.radialMetrics && (
        <div 
          className="rounded-lg p-4 sm:p-6 border"
          style={{ 
            backgroundColor: 'var(--bg-secondary)',
            borderColor: 'var(--accent-subtle)'
          }}
        >
          <h2 className="text-base sm:text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>At a Glance</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            <div className="flex flex-col items-center">
              <RadialProgress value={metrics.radialMetrics.avgScore} label="" color={getMetricColor('avgScore', metrics.radialMetrics.avgScore)} size={96} valueFormatter={(v) => `${Math.round(v)}`} showPercentage={false} />
              <p className="text-xs font-medium mt-2" style={{ color: 'var(--text-secondary)' }}>Avg Lead Score</p>
            </div>
            <div className="flex flex-col items-center">
              <RadialProgress value={metrics.radialMetrics.responseRate} label="" color={getMetricColor('responseRate', metrics.radialMetrics.responseRate)} size={96} />
              <p className="text-xs font-medium mt-2" style={{ color: 'var(--text-secondary)' }}>Response Rate</p>
            </div>
            <div className="flex flex-col items-center">
              <RadialProgress value={metrics.radialMetrics.bookingRate} label="" color={getMetricColor('bookingRate', metrics.radialMetrics.bookingRate)} size={96} />
              <p className="text-xs font-medium mt-2" style={{ color: 'var(--text-secondary)' }}>Key Event Rate</p>
            </div>
            <div className="flex flex-col items-center">
              <RadialProgress value={metrics.radialMetrics.avgResponseTime} max={10000} label="" color={getMetricColor('avgResponseTime', metrics.radialMetrics.avgResponseTime)} size={96} valueFormatter={(v) => `${Math.round(v)}ms`} showPercentage={false} />
              <p className="text-xs font-medium mt-2" style={{ color: 'var(--text-secondary)' }}>Avg Response</p>
            </div>
          </div>
        </div>
      )}

      {/* NUMBER CARDS ROW */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
        {/* Card 1: Total Conversations */}
        <div
          className="rounded-xl p-3 sm:p-5 lg:p-6 border transition-all hover:shadow-lg sm:aspect-[4/3] flex flex-col justify-between"
          style={{
            backgroundColor: 'rgba(59, 130, 246, 0.05)',
            borderColor: 'rgba(59, 130, 246, 0.2)',
          }}
        >
          <div>
            <div className="flex items-center gap-1.5 mb-2 sm:mb-4">
              <MdChatBubble className="text-blue-500 flex-shrink-0" size={14} />
              <h3 className="text-xs sm:text-sm font-semibold truncate" style={{ color: 'var(--text-secondary)' }}>Conversations</h3>
            </div>
            <p className="text-2xl sm:text-4xl lg:text-5xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {conversationTimeFilter === 'All' && (metrics.totalConversations.total ?? 0)}
              {conversationTimeFilter === '7D' && metrics.totalConversations.count7D}
              {conversationTimeFilter === '14D' && metrics.totalConversations.count14D}
              {conversationTimeFilter === '30D' && metrics.totalConversations.count30D}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              {conversationTimeFilter === 'All' ? `${metrics.totalConversations.total} all time` : periodLabel(conversationTimeFilter)}
            </p>
          </div>
          {getTrendData('conversations', conversationTimeFilter, metrics.trends?.conversations?.data).length > 0 && (
            <div className="hidden sm:block w-full my-3" style={{ height: '48px' }}>
              <Sparkline data={getTrendData('conversations', conversationTimeFilter, metrics.trends?.conversations?.data)} color="#3B82F6" height={48} />
            </div>
          )}
          <div className="flex items-center justify-between mt-2 sm:mt-0">
            <button onClick={() => router.push('/dashboard/inbox')} className="text-xs font-medium flex items-center gap-1 hover:underline" style={{ color: '#3B82F6' }}>
              View <MdArrowForward size={12} />
            </button>
            <div className="hidden sm:flex gap-1">
              {TIME_FILTERS.map((period) => (
                <button key={period} onClick={() => setConversationTimeFilter(period)}
                  className={`px-2 py-0.5 text-[10px] rounded ${conversationTimeFilter === period ? 'text-[var(--text-button)]' : ''}`}
                  style={conversationTimeFilter === period ? { backgroundColor: '#3B82F6' } : { backgroundColor: 'rgba(59, 130, 246, 0.1)', color: 'var(--text-secondary)' }}
                >{period}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Card 2: Engaged Leads */}
        <div
          className="rounded-xl p-3 sm:p-5 lg:p-6 border transition-all hover:shadow-lg sm:aspect-[4/3] flex flex-col justify-between"
          style={{
            backgroundColor: 'rgba(34, 197, 94, 0.05)',
            borderColor: 'rgba(34, 197, 94, 0.2)',
          }}
        >
          <div>
            <div className="flex items-center gap-1.5 mb-2 sm:mb-4">
              <MdLocalFireDepartment className="text-green-500 flex-shrink-0" size={14} />
              <h3 className="text-xs sm:text-sm font-semibold truncate" style={{ color: 'var(--text-secondary)' }}>Engaged Leads</h3>
            </div>
            <p className="text-2xl sm:text-4xl lg:text-5xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {engagedLeadsFilter === 'All' && (metrics.engagedLeads?.count ?? 0)}
              {engagedLeadsFilter === '7D' && (metrics.engagedLeads?.count7D ?? 0)}
              {engagedLeadsFilter === '14D' && (metrics.engagedLeads?.count14D ?? 0)}
              {engagedLeadsFilter === '30D' && (metrics.engagedLeads?.count30D ?? 0)}
            </p>
            <p className="text-xs mt-1" style={{ color: '#22C55E' }}>
              {engagedLeadsFilter === 'All' ? `${metrics.engagedLeads?.engagementRate?.toFixed(1) ?? '0.0'}%` : periodLabel(engagedLeadsFilter)}
            </p>
          </div>
          {getTrendData('engagedLeads', engagedLeadsFilter, metrics.trends?.leads?.data).length > 0 && (
            <div className="hidden sm:block w-full my-3" style={{ height: '48px' }}>
              <Sparkline data={getTrendData('engagedLeads', engagedLeadsFilter, metrics.trends?.leads?.data)} color="#22C55E" height={48} showGradient={true} />
            </div>
          )}
          <div className="flex items-center justify-between mt-2 sm:mt-0">
            <button onClick={() => router.push('/dashboard/leads?filter=engaged')} className="text-xs font-medium flex items-center gap-1 hover:underline" style={{ color: '#22C55E' }}>
              View <MdArrowForward size={12} />
            </button>
            <div className="hidden sm:flex gap-1">
              {TIME_FILTERS.map((period) => (
                <button key={period} onClick={() => setEngagedLeadsFilter(period)}
                  className={`px-2 py-0.5 text-[10px] rounded ${engagedLeadsFilter === period ? 'text-[var(--text-button)]' : ''}`}
                  style={engagedLeadsFilter === period ? { backgroundColor: '#22C55E' } : { backgroundColor: 'rgba(34, 197, 94, 0.1)', color: 'var(--text-secondary)' }}
                >{period}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Card 3: Warm Leads */}
        <div
          className="rounded-xl p-3 sm:p-5 lg:p-6 border transition-all hover:shadow-lg sm:aspect-[4/3] flex flex-col justify-between"
          style={{
            backgroundColor: 'rgba(249, 115, 22, 0.05)',
            borderColor: 'rgba(249, 115, 22, 0.2)',
          }}
        >
          <div>
            <div className="flex items-center gap-1.5 mb-2 sm:mb-4">
              <MdLocalFireDepartment className="text-orange-500 flex-shrink-0" size={14} />
              <h3 className="text-xs sm:text-sm font-semibold truncate" style={{ color: 'var(--text-secondary)' }}>Warm Leads</h3>
            </div>
            <p className="text-2xl sm:text-4xl lg:text-5xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {warmLeadsFilter === 'All' && (metrics.warmLeads?.count ?? 0)}
              {warmLeadsFilter === '7D' && (metrics.warmLeads?.count7D ?? 0)}
              {warmLeadsFilter === '14D' && (metrics.warmLeads?.count14D ?? 0)}
              {warmLeadsFilter === '30D' && (metrics.warmLeads?.count30D ?? 0)}
            </p>
            <p className="text-xs mt-1" style={{ color: '#F97316' }}>
              {warmLeadsFilter === 'All'
                ? `${(metrics.totalLeads?.count ? ((metrics.warmLeads?.count ?? 0) / metrics.totalLeads.count) * 100 : 0).toFixed(1)}%`
                : periodLabel(warmLeadsFilter)}
            </p>
          </div>
          {getTrendData('warmLeads', warmLeadsFilter, metrics.trends?.leads?.data).length > 0 && (
            <div className="hidden sm:block w-full my-3" style={{ height: '48px' }}>
              <Sparkline data={getTrendData('warmLeads', warmLeadsFilter, metrics.trends?.leads?.data)} color="#F97316" height={48} showGradient={true} />
            </div>
          )}
          <div className="flex items-center justify-between mt-2 sm:mt-0">
            <button onClick={() => router.push('/dashboard/leads?filter=warm')} className="text-xs font-medium flex items-center gap-1 hover:underline" style={{ color: '#F97316' }}>
              View <MdArrowForward size={12} />
            </button>
            <div className="hidden sm:flex gap-1">
              {TIME_FILTERS.map((period) => (
                <button key={period} onClick={() => setWarmLeadsFilter(period)}
                  className={`px-2 py-0.5 text-[10px] rounded ${warmLeadsFilter === period ? 'text-[var(--text-button)]' : ''}`}
                  style={warmLeadsFilter === period ? { backgroundColor: '#F97316' } : { backgroundColor: 'rgba(249, 115, 22, 0.1)', color: 'var(--text-secondary)' }}
                >{period}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Card 4: Total Leads */}
        <div
          className="rounded-xl p-3 sm:p-5 lg:p-6 border transition-all hover:shadow-lg sm:aspect-[4/3] flex flex-col justify-between"
          style={{
            backgroundColor: 'var(--accent-subtle)',
            borderColor: 'var(--accent-primary)',
          }}
        >
          <div>
            <div className="flex items-center gap-1.5 mb-2 sm:mb-4">
              <MdPeople className="flex-shrink-0" style={{ color: 'var(--accent-primary)' }} size={14} />
              <h3 className="text-xs sm:text-sm font-semibold truncate" style={{ color: 'var(--text-secondary)' }}>Total Leads</h3>
            </div>
            <p className="text-2xl sm:text-4xl lg:text-5xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {leadsFilter === 'All' && metrics.totalLeads.count}
              {leadsFilter === '7D' && (metrics.totalLeads.count7D ?? metrics.totalLeads.count)}
              {leadsFilter === '14D' && (metrics.totalLeads.count14D ?? metrics.totalLeads.count)}
              {leadsFilter === '30D' && (metrics.totalLeads.count30D ?? metrics.totalLeads.count)}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--accent-primary)' }}>
              {leadsFilter === 'All' ? `${metrics.totalLeads.count} all time` : periodLabel(leadsFilter)}
            </p>
          </div>
          {getTrendData('totalLeads', leadsFilter, metrics.trends?.leads?.data).length > 0 && (
            <div className="hidden sm:block w-full my-3" style={{ height: '48px' }}>
              <Sparkline data={getTrendData('totalLeads', leadsFilter, metrics.trends?.leads?.data)} color="var(--accent-primary)" height={48} showGradient={true} />
            </div>
          )}
          <div className="flex items-center justify-between mt-2 sm:mt-0">
            <button onClick={() => router.push('/dashboard/leads')} className="text-xs font-medium flex items-center gap-1 hover:underline" style={{ color: 'var(--accent-primary)' }}>
              View <MdArrowForward size={12} />
            </button>
            <div className="hidden sm:flex gap-1">
              {TIME_FILTERS.map((period) => (
                <button key={period} onClick={() => setLeadsFilter(period)}
                  className={`px-2 py-0.5 text-[10px] rounded ${leadsFilter === period ? 'text-[var(--text-button)]' : ''}`}
                  style={leadsFilter === period ? { backgroundColor: 'var(--button-bg)' } : { backgroundColor: 'var(--accent-subtle)', color: 'var(--text-secondary)' }}
                >{period}</button>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* Upcoming Events - Full width; grows to fill the viewport (full-screen feel) */}
      <div
        className="rounded-lg p-3 sm:p-6 border transition-all hover:shadow-lg flex-1 flex flex-col"
        style={{
          backgroundColor: 'rgba(59, 130, 246, 0.05)',
          borderColor: 'rgba(59, 130, 246, 0.2)',
        }}
      >
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Upcoming Events</h3>
            <span className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {metrics.upcomingBookings.length}
            </span>
          </div>
          <button
            onClick={() => router.push('/dashboard/bookings')}
            className="text-xs font-medium flex items-center gap-1 hover:underline"
            style={{ color: '#3B82F6' }}
          >
            View All <MdArrowForward size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
        {metrics.upcomingBookings.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {metrics.upcomingBookings.slice(0, 8).map((booking) => (
              <div
                key={booking.id}
                onClick={() => openLeadModal(booking.id)}
                className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all border"
                style={{
                  borderColor: 'rgba(59, 130, 246, 0.2)',
                  backgroundColor: 'var(--bg-tertiary)',
                  borderRadius: '8px',
                  borderWidth: '1px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)'
                  e.currentTarget.style.borderColor = '#3B82F6'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'
                  e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.2)'
                }}
              >
                <MdEvent
                  className="flex-shrink-0"
                  size={18}
                  style={{ color: '#3B82F6' }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {booking.name}
                  </p>
                  {booking.title && (
                    <p className="text-xs truncate" style={{ color: 'var(--text-primary)', opacity: 0.7 }}>
                      {booking.title}
                    </p>
                  )}
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                      {formatBookingWhen(booking.datetime)}
                    </span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap"
                      style={{ background: 'rgba(59,130,246,0.15)', color: '#3B82F6' }}
                    >
                      {formatCountdown(booking.datetime)}
                    </span>
                  </div>
                </div>
                <MdArrowForward
                  className="flex-shrink-0"
                  size={16}
                  style={{ color: '#3B82F6' }}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No upcoming events</p>
        )}
        </div>
      </div>

      {/* Lead Details Modal */}
      {showLeadModal && selectedLead && (
        <LeadDetailsModal
          lead={selectedLead}
          isOpen={showLeadModal}
          onClose={() => {
            console.log('🔴 Closing modal')
            setShowLeadModal(false)
            setSelectedLead(null)
          }}
          onStatusUpdate={async () => {
            await loadMetrics()
          }}
        />
      )}
      {/* Debug: Show modal state */}
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed bottom-4 right-4 bg-black/80 text-white text-xs p-2 rounded z-50">
          Modal: {showLeadModal ? 'OPEN' : 'CLOSED'} | Lead: {selectedLead?.id || 'NONE'}
        </div>
      )}
    </div>
  )
}
