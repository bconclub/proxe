'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../lib/supabase/client'
import Image from 'next/image'
import { MdTrendingUp, MdTrendingDown, MdRemove, MdCheckCircle, MdSchedule, MdMessage, MdWarning, MdArrowForward, MdLocalFireDepartment, MdSpeed, MdPeople, MdEvent, MdRefresh, MdCancel, MdTrendingUp as MdScoreUp, MdSwapHoriz, MdPhoneDisabled, MdArrowUpward, MdShowChart, MdFlashOn, MdChatBubble, MdCalendarToday, MdArrowDropDown, MdWhatsapp, MdLanguage, MdEventBusy, MdNotifications } from 'react-icons/md'
import LeadDetailsModal from './LeadDetailsModal'
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

interface FounderMetrics {
  hotLeads: { count: number; leads: Array<{ id: string; name: string; score: number }> }
  totalConversations: { total: number; count7D: number; count14D: number; count30D: number; trend7D: number; trend14D: number; trend30D: number }
  totalLeads: { count: number; count7D: number; count14D: number; count30D: number; fromConversations: number; conversionRate: number }
  engagedLeads: { count: number; total: number; engagementRate: number; leads: Array<{ id: string; name: string; score: number }> }
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

export default function FounderDashboard() {
  const router = useRouter()
  const [metrics, setMetrics] = useState<FounderMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [showLeadModal, setShowLeadModal] = useState(false)
  const [conversationTimeFilter, setConversationTimeFilter] = useState<'7D' | '14D' | '30D'>('30D')
  const [warmLeadsFilter, setWarmLeadsFilter] = useState<'7D' | '14D' | '30D'>('30D')
  const [leadsFilter, setLeadsFilter] = useState<'7D' | '14D' | '30D'>('30D')
  const [hotLeadsFilter, setHotLeadsFilter] = useState<'7D' | '14D' | '30D'>('7D')
  
  // Hot Leads threshold with localStorage persistence
  const [hotLeadThreshold, setHotLeadThreshold] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('hot-lead-threshold')
      return saved ? parseInt(saved, 10) : 70
    }
    return 70
  })
  const [showThresholdDropdown, setShowThresholdDropdown] = useState(false)

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
      case 'avgScore':
        if (value >= 60) return GREEN
        if (value >= 30) return AMBER
        return RED

      case 'responseRate':
        if (value >= 95) return GREEN
        if (value >= 80) return AMBER
        return RED

      case 'bookingRate':
        if (value >= 25) return GREEN
        if (value >= 15) return AMBER
        return RED

      case 'avgResponseTime':
        // Lower is better
        if (value <= 3000) return GREEN
        if (value <= 8000) return AMBER
        return RED

      default:
        return GREEN
    }
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
                src="/bcon-icon.png"
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
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">

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
              <RadialProgress value={metrics.radialMetrics.avgScore} label="" color={getMetricColor('avgScore', metrics.radialMetrics.avgScore)} size={96} />
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
              {conversationTimeFilter === '7D' && metrics.totalConversations.count7D}
              {conversationTimeFilter === '14D' && metrics.totalConversations.count14D}
              {conversationTimeFilter === '30D' && metrics.totalConversations.count30D}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              {metrics.totalConversations.total} all time
            </p>
          </div>
          {metrics.trends?.conversations && (
            <div className="hidden sm:block w-full my-3" style={{ height: '36px' }}>
              <Sparkline data={metrics.trends.conversations.data} color="#3B82F6" height={36} />
            </div>
          )}
          <div className="flex items-center justify-between mt-2 sm:mt-0">
            <button onClick={() => router.push('/dashboard/inbox')} className="text-xs font-medium flex items-center gap-1 hover:underline" style={{ color: '#3B82F6' }}>
              View <MdArrowForward size={12} />
            </button>
            <div className="hidden sm:flex gap-1">
              {(['7D', '14D', '30D'] as const).map((period) => (
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
              {metrics.engagedLeads?.count ?? 0}
            </p>
            <p className="text-xs mt-1" style={{ color: '#22C55E' }}>
              {metrics.engagedLeads?.engagementRate?.toFixed(1) ?? '0.0'}%
            </p>
          </div>
          {metrics.trends?.leads && (
            <div className="hidden sm:block w-full my-3" style={{ height: '36px' }}>
              <Sparkline data={metrics.trends.leads.data} color="#22C55E" height={36} showGradient={true} />
            </div>
          )}
          <button onClick={() => router.push('/dashboard/leads?filter=engaged')} className="text-xs font-medium flex items-center gap-1 hover:underline mt-2 sm:mt-0" style={{ color: '#22C55E' }}>
            View <MdArrowForward size={12} />
          </button>
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
              {warmLeadsFilter === '7D' && (metrics.warmLeads?.count7D ?? 0)}
              {warmLeadsFilter === '14D' && (metrics.warmLeads?.count14D ?? 0)}
              {warmLeadsFilter === '30D' && (metrics.warmLeads?.count30D ?? 0)}
            </p>
            <p className="text-xs mt-1" style={{ color: '#F97316' }}>
              Score 40–69
            </p>
          </div>
          {metrics.trends?.leads && (
            <div className="hidden sm:block w-full my-3" style={{ height: '36px' }}>
              <Sparkline data={metrics.trends.leads.data} color="#F97316" height={36} showGradient={true} />
            </div>
          )}
          <div className="flex items-center justify-between mt-2 sm:mt-0">
            <button onClick={() => router.push('/dashboard/leads?filter=warm')} className="text-xs font-medium flex items-center gap-1 hover:underline" style={{ color: '#F97316' }}>
              View <MdArrowForward size={12} />
            </button>
            <div className="hidden sm:flex gap-1">
              {(['7D', '14D', '30D'] as const).map((period) => (
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
              {leadsFilter === '7D' && (metrics.totalLeads.count7D ?? metrics.totalLeads.count)}
              {leadsFilter === '14D' && (metrics.totalLeads.count14D ?? metrics.totalLeads.count)}
              {leadsFilter === '30D' && (metrics.totalLeads.count30D ?? metrics.totalLeads.count)}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--accent-primary)' }}>
              {metrics.totalLeads.count} all time
            </p>
          </div>
          {metrics.trends?.leads && (
            <div className="hidden sm:block w-full my-3" style={{ height: '36px' }}>
              <Sparkline data={metrics.trends.leads.data} color="var(--accent-primary)" height={36} showGradient={true} />
            </div>
          )}
          <div className="flex items-center justify-between mt-2 sm:mt-0">
            <button onClick={() => router.push('/dashboard/leads')} className="text-xs font-medium flex items-center gap-1 hover:underline" style={{ color: 'var(--accent-primary)' }}>
              View <MdArrowForward size={12} />
            </button>
            <div className="hidden sm:flex gap-1">
              {(['7D', '14D', '30D'] as const).map((period) => (
                <button key={period} onClick={() => setLeadsFilter(period)}
                  className={`px-2 py-0.5 text-[10px] rounded ${leadsFilter === period ? 'text-[var(--text-button)]' : ''}`}
                  style={leadsFilter === period ? { backgroundColor: 'var(--button-bg)' } : { backgroundColor: 'var(--accent-subtle)', color: 'var(--text-secondary)' }}
                >{period}</button>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* Upcoming Events - Full width below cards */}
      <div
        className="rounded-lg p-3 sm:p-6 border transition-all hover:shadow-lg mb-4 sm:mb-6"
        style={{
          backgroundColor: 'rgba(59, 130, 246, 0.05)',
          borderColor: 'rgba(59, 130, 246, 0.2)',
        }}
      >
        <div className="flex items-center justify-between mb-4">
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
        {metrics.upcomingBookings.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {metrics.upcomingBookings.slice(0, 4).map((booking) => (
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
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {formatCountdown(booking.datetime)}
                  </p>
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

      {/* BOTTOM ROW - Leads Needing Attention & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Leads Needing Attention */}
        <div 
          className="rounded-lg p-4 sm:p-6 border"
          style={{ 
            backgroundColor: 'var(--bg-secondary)',
            borderColor: 'var(--accent-subtle)'
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base sm:text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Leads Needing Attention</h2>
            <button 
              onClick={() => router.push('/dashboard/inbox')}
              className="text-xs font-medium flex items-center gap-1 hover:underline"
              style={{ color: 'var(--accent-primary)' }}
            >
              View All <MdArrowForward size={14} />
            </button>
          </div>
          <div className="space-y-2">
            {metrics.leadsNeedingAttention.length === 0 ? (
              <p className="text-sm text-center py-4" style={{ color: 'var(--text-secondary)' }}>No leads need attention</p>
            ) : (
              metrics.leadsNeedingAttention.slice(0, 5).map((lead) => (
                <div
                  key={lead.id}
                  className="flex items-center justify-between gap-3 rounded-lg cursor-pointer transition-all"
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    padding: '10px 12px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--accent-subtle)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'
                  }}
                  onClick={(e) => {
                    console.log('🟢 Clicked on lead row:', lead.name, 'leadId:', lead.id)
                    e.stopPropagation()
                    openLeadModal(lead.id)
                  }}
                >
                  {/* Left: Name, Score, Stage */}
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{lead.name}</span>
                    <span 
                      className="text-xs px-1.5 py-0.5 rounded font-medium"
                      style={{ 
                        backgroundColor: 'var(--accent-subtle)',
                        color: 'var(--accent-primary)'
                      }}
                    >
                      {lead.score}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{lead.stage}</span>
                  </div>
                  {/* Right: Time and Reply Button */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {formatTimeAgo(lead.lastContact)}
                    </span>
                    <button 
                    className="px-3 py-1.5 text-[var(--text-button)] text-xs rounded-lg transition-colors flex-shrink-0"
                    style={{ backgroundColor: 'var(--button-bg)' }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                    onClick={(e) => {
                      e.stopPropagation()
                      openLeadModal(lead.id)
                    }}
                    >
                      Reply
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Activity Feed */}
        <div 
          className="rounded-lg p-6 border"
          style={{ 
            backgroundColor: 'var(--bg-secondary)',
            borderColor: 'var(--accent-subtle)'
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base sm:text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Recent Activity</h2>
            <button 
              onClick={() => router.push('/dashboard/inbox')}
              className="text-xs font-medium flex items-center gap-1 hover:underline"
              style={{ color: 'var(--accent-primary)' }}
            >
              View All <MdArrowForward size={14} />
            </button>
          </div>
          <div className="space-y-3">
            {metrics.recentActivity.length === 0 ? (
              <p className="text-sm text-center py-4" style={{ color: 'var(--text-secondary)' }}>No recent activity</p>
            ) : (
              metrics.recentActivity.slice(0, 10).map((activity, index) => {
                // Comprehensive icon + color system for Recent Activity
                const getActivityIcon = (text: string, channel: string, type: string) => {
                  const textLower = (text || '').toLowerCase()
                  const channelLower = (channel || '').toLowerCase()
                  
                  // ========================================================================
                  // PRIORITY 1: EVENT-SPECIFIC ICONS (Override channel icons)
                  // ========================================================================
                  
                  // 1. SCORE CHANGES
                  if (textLower.includes('score jumped')) {
                    return { 
                      icon: MdShowChart, 
                      color: '#F59E0B', // Orange
                      bgColor: '#F59E0B',
                      opacity: 0.2
                    }
                  }
                  if (textLower.includes('hot lead') || textLower.includes('became a hot lead') || type === 'hot_lead') {
                    return { 
                      icon: MdLocalFireDepartment, 
                      color: '#EF4444', // Red
                      bgColor: '#EF4444',
                      opacity: 0.2
                    }
                  }
                  
                  // 2. BOOKINGS
                  if (textLower.includes('booked') || textLower.includes('scheduled') || type === 'booking_made') {
                    return { 
                      icon: MdEvent, 
                      color: '#10B981', // Green
                      bgColor: '#10B981',
                      opacity: 0.2
                    }
                  }
                  if (textLower.includes('cancelled') && (textLower.includes('booking') || textLower.includes('call') || textLower.includes('event'))) {
                    return { 
                      icon: MdEventBusy, 
                      color: '#EF4444', // Red
                      bgColor: '#EF4444',
                      opacity: 0.2
                    }
                  }
                  
                  // 3. STAGE CHANGES - color-coded by target stage
                  if (textLower.includes('entered') && textLower.includes('stage') || textLower.includes('moved from') || type === 'stage_change') {
                    // Determine color based on the NEW stage
                    const stageColorMap: Record<string, { color: string; icon: any }> = {
                      'high intent':   { color: '#EF4444', icon: MdTrendingUp },    // Red
                      'booking made':  { color: '#10B981', icon: MdEvent },          // Green
                      'converted':     { color: '#10B981', icon: MdTrendingUp },     // Green
                      'qualified':     { color: '#F97316', icon: MdArrowUpward },    // Orange
                      'engaged':       { color: '#8B5CF6', icon: MdArrowUpward },    // Purple
                      'in sequence':   { color: '#3B82F6', icon: MdArrowUpward },    // Blue
                      'new':           { color: '#6B7280', icon: MdArrowUpward },    // Gray
                      'lost':          { color: '#EF4444', icon: MdTrendingDown },   // Red
                      'cold':          { color: '#6B7280', icon: MdTrendingDown },   // Gray
                    }
                    // Match stage from text
                    let stageStyle = { color: '#8B5CF6', icon: MdArrowUpward } // purple default
                    for (const [stage, style] of Object.entries(stageColorMap)) {
                      if (textLower.includes(stage)) {
                        stageStyle = style
                        break
                      }
                    }
                    return {
                      icon: stageStyle.icon,
                      color: stageStyle.color,
                      bgColor: stageStyle.color,
                      opacity: 0.2
                    }
                  }
                  
                  // 4. NEW LEAD / NEW MESSAGE
                  if (type === 'new_lead_scored' || (textLower.includes('scored') && textLower.includes('entered'))) {
                    return {
                      icon: MdFlashOn,
                      color: '#8B5CF6', // Purple
                      bgColor: '#8B5CF6',
                      opacity: 0.2
                    }
                  }
                  if (type === 'new_lead' || textLower.includes('arrived via')) {
                    return {
                      icon: MdPeople,
                      color: '#3B82F6', // Blue
                      bgColor: '#3B82F6',
                      opacity: 0.2
                    }
                  }
                  if (type === 'new_message' || textLower.includes('sent a message')) {
                    return {
                      icon: MdChatBubble,
                      color: '#6366F1', // Indigo
                      bgColor: '#6366F1',
                      opacity: 0.2
                    }
                  }
                  if (type === 'went_cold' || textLower.includes('went cold')) {
                    return {
                      icon: MdWarning,
                      color: '#F59E0B', // Amber
                      bgColor: '#F59E0B',
                      opacity: 0.2
                    }
                  }

                  // 5. ENGAGEMENT (Channel-specific, but text-based)
                  if (textLower.includes('engaged via whatsapp')) {
                    return { 
                      icon: MdWhatsapp, 
                      color: '#25D366', // Green
                      bgColor: '#25D366',
                      opacity: 0.2
                    }
                  }
                  if (textLower.includes('engaged via web')) {
                    return { 
                      icon: MdLanguage, 
                      color: '#3B82F6', // Blue
                      bgColor: '#3B82F6',
                      opacity: 0.2
                    }
                  }
                  
                  // ========================================================================
                  // PRIORITY 2: CHANNEL-BASED ICONS (Fallback if no event-specific match)
                  // ========================================================================
                  
                  if (channelLower === 'whatsapp') {
                    return { 
                      icon: MdWhatsapp, 
                      color: '#25D366', // Green
                      bgColor: '#25D366',
                      opacity: 0.2
                    }
                  }
                  if (channelLower === 'web') {
                    return { 
                      icon: MdLanguage, 
                      color: '#3B82F6', // Blue
                      bgColor: '#3B82F6',
                      opacity: 0.2
                    }
                  }
                  
                  // ========================================================================
                  // PRIORITY 3: GENERAL FALLBACK
                  // ========================================================================
                  
                  return { 
                    icon: MdNotifications, 
                    color: '#6B7280', // Gray
                    bgColor: '#6B7280',
                    opacity: 0.2
                  }
                }

                const activityIconData = getActivityIcon(activity.content || '', activity.channel || '', activity.type || '')
                const { icon: ActivityIcon, color: iconColor, bgColor, opacity } = activityIconData
                const channelLabel = activity.channel === 'whatsapp' ? 'WhatsApp' : activity.channel === 'web' ? 'Web' : activity.channel || 'System'

                // Convert hex color to rgba for opacity, or handle CSS variables
                const getBackgroundColor = (color: string, alpha: number) => {
                  if (color.startsWith('#')) {
                    const r = parseInt(color.slice(1, 3), 16)
                    const g = parseInt(color.slice(3, 5), 16)
                    const b = parseInt(color.slice(5, 7), 16)
                    return `rgba(${r}, ${g}, ${b}, ${alpha})`
                  }
                  // For CSS variables, use the fallback bgColor (which should be hex)
                  if (bgColor && bgColor.startsWith('#')) {
                    const r = parseInt(bgColor.slice(1, 3), 16)
                    const g = parseInt(bgColor.slice(3, 5), 16)
                    const b = parseInt(bgColor.slice(5, 7), 16)
                    return `rgba(${r}, ${g}, ${b}, ${alpha})`
                  }
                  // Ultimate fallback
                  return `rgba(139, 92, 246, ${alpha})`
                }

                return (
                  <div
                    key={index}
                    className="flex items-start gap-3 rounded-lg cursor-pointer transition-all"
                    style={{
                      backgroundColor: 'var(--bg-tertiary)',
                      padding: '12px'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--accent-subtle)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'
                    }}
                    onClick={() => openLeadModal(activity.id)}
                  >
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{
                        backgroundColor: getBackgroundColor(iconColor, opacity),
                        color: iconColor
                      }}
                    >
                      <ActivityIcon 
                        size={20}
                        style={{ color: iconColor }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{activity.content}</p>
                      {/* Show score badge for stage changes and score events */}
                      {activity.metadata?.score && (activity.type === 'stage_change' || activity.type === 'new_lead_scored') && (
                        <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded text-[10px] font-bold" style={{ backgroundColor: 'rgba(139, 92, 246, 0.15)', color: '#A78BFA' }}>
                          Score: {activity.metadata.score}
                        </span>
                      )}
                      {activity.type === 'score_change' && activity.metadata?.oldScore != null && activity.metadata?.newScore != null && (
                        <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded text-[10px] font-bold" style={{
                          backgroundColor: activity.metadata.scoreDiff > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: activity.metadata.scoreDiff > 0 ? '#34D399' : '#F87171'
                        }}>
                          {activity.metadata.oldScore} → {activity.metadata.newScore} ({activity.metadata.scoreDiff > 0 ? '+' : ''}{activity.metadata.scoreDiff})
                        </span>
                      )}
                      <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                        {formatTimeAgo(activity.timestamp)} • {channelLabel}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
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
