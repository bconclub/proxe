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
  totalConversations: { count7D: number; count14D: number; count30D: number; trend7D: number }
  totalLeads: { count: number; fromConversations: number; conversionRate: number }
  responseHealth: { avgSeconds: number; status: 'good' | 'warning' | 'critical' }
  leadsNeedingAttention: Array<{ id: string; name: string; score: number; lastContact: string; stage: string }>
  upcomingBookings: Array<{ id: string; name: string; date: string; time: string; datetime: string }>
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
  const [conversationTimeFilter, setConversationTimeFilter] = useState<'7D' | '14D' | '30D'>('7D')
  const [leadsFilter, setLeadsFilter] = useState<'7D' | '14D' | '30D'>('7D')
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

  // Traffic light colors for At a Glance metrics
  const getMetricColor = (metricType: 'avgScore' | 'responseRate' | 'bookingRate' | 'avgResponseTime', value: number): string => {
    const GREEN = '#10b981' // emerald-500
    const AMBER = '#f59e0b' // amber-500
    const RED = '#ef4444'   // red-500

    switch (metricType) {
      case 'avgScore':
        // Green: 90-99%, Amber: 50-89%, Red: <50%
        if (value >= 90) return GREEN
        if (value >= 50) return AMBER
        return RED

      case 'responseRate':
        // Green: 95-100%, Amber: 90-94%, Red: <90%
        if (value >= 95) return GREEN
        if (value >= 90) return AMBER
        return RED

      case 'bookingRate':
        // Green: ≥70%, Amber: 50-69%, Red: <50%
        if (value >= 70) return GREEN
        if (value >= 50) return AMBER
        return RED

      case 'avgResponseTime':
        // Green: 3-5s, Amber: 5.1-8s, Red: >8s
        if (value >= 3 && value <= 5) return GREEN
        if (value > 5 && value <= 8) return AMBER
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
                src="/windchasers-icon.png"
                alt="Windchasers"
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>Command Center</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Real-time founder metrics at a glance
          </p>
        </div>
        <button
          onClick={loadMetrics}
          className="flex items-center gap-2 px-4 py-2 text-white rounded-lg transition-colors"
          style={{ backgroundColor: 'var(--accent-primary)' }}
          onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
          onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
        >
          <MdRefresh size={18} />
          Refresh
        </button>
      </div>

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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {/* Avg Score */}
            <div className="flex flex-col items-center">
              {(() => {
                const metricColor = getMetricColor('avgScore', metrics.radialMetrics.avgScore)
                return (
                  <>
                    <RadialProgress
                      value={metrics.radialMetrics.avgScore}
                      label="Avg Score"
                      color={metricColor}
                    />
                    {metrics.radialTrends?.avgScore && (
                      <div className="w-full mt-2" style={{ height: '40px' }}>
                        <Sparkline data={metrics.radialTrends.avgScore} color={metricColor} height={40} />
                      </div>
                    )}
                  </>
                )
              })()}
            </div>

            {/* Response Rate */}
            <div className="flex flex-col items-center">
              {(() => {
                const metricColor = getMetricColor('responseRate', metrics.radialMetrics.responseRate)
                return (
                  <>
                    <RadialProgress
                      value={metrics.radialMetrics.responseRate}
                      label="Response Rate"
                      color={metricColor}
                    />
                    {metrics.radialTrends?.responseRate && (
                      <div className="w-full mt-2" style={{ height: '40px' }}>
                        <Sparkline data={metrics.radialTrends.responseRate} color={metricColor} height={40} />
                      </div>
                    )}
                  </>
                )
              })()}
            </div>

            {/* Key Event Rate */}
            <div className="flex flex-col items-center">
              {(() => {
                const metricColor = getMetricColor('bookingRate', metrics.radialMetrics.bookingRate)
                return (
                  <>
                    <RadialProgress
                      value={metrics.radialMetrics.bookingRate}
                      label="Key Event Rate"
                      color={metricColor}
                    />
                    {metrics.radialTrends?.bookingRate && (
                      <div className="w-full mt-2" style={{ height: '40px' }}>
                        <Sparkline data={metrics.radialTrends.bookingRate} color={metricColor} height={40} />
                      </div>
                    )}
                  </>
                )
              })()}
            </div>

            {/* Avg Response Time */}
            <div className="flex flex-col items-center">
              {(() => {
                const metricColor = getMetricColor('avgResponseTime', metrics.radialMetrics.avgResponseTime)
                return (
                  <>
                    <RadialProgress
                      value={metrics.radialMetrics.avgResponseTime}
                      max={15}
                      label="Avg Response"
                      color={metricColor}
                      valueFormatter={(v) => `${v.toFixed(1)}s`}
                      showPercentage={false}
                    />
                    {metrics.radialTrends?.avgResponseTime && (
                      <div className="w-full mt-2" style={{ height: '40px' }}>
                        <Sparkline
                          data={metrics.radialTrends.avgResponseTime}
                          color={metricColor}
                          height={40}
                        />
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* NUMBER CARDS ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {/* Card 1: Total Conversations */}
        <div 
          className="rounded-lg p-4 sm:p-6 border transition-all hover:shadow-lg flex flex-col"
          style={{ 
            backgroundColor: 'rgba(59, 130, 246, 0.05)',
            borderColor: 'rgba(59, 130, 246, 0.2)',
            justifyContent: 'space-between'
          }}
        >
          {/* 1. Title + Filter */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Total Conversations</h3>
            <div className="flex gap-1">
              {(['7D', '14D', '30D'] as const).map((period) => (
                <button
                  key={period}
                  onClick={() => setConversationTimeFilter(period)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    conversationTimeFilter === period
                      ? 'text-white'
                      : ''
                  }`}
                  style={conversationTimeFilter === period 
                    ? { backgroundColor: '#3B82F6' }
                    : { 
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        color: 'var(--text-secondary)'
                      }
                  }
                  onMouseEnter={(e) => {
                    if (conversationTimeFilter !== period) {
                      e.currentTarget.style.backgroundColor = '#3B82F6'
                      e.currentTarget.style.opacity = '0.8'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (conversationTimeFilter !== period) {
                      e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)'
                      e.currentTarget.style.opacity = '1'
                    }
                  }}
                >
                  {period}
                </button>
              ))}
            </div>
          </div>
          {/* 2. Big Number */}
          <p className="text-3xl sm:text-4xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            {conversationTimeFilter === '7D' && metrics.totalConversations.count7D}
            {conversationTimeFilter === '14D' && metrics.totalConversations.count14D}
            {conversationTimeFilter === '30D' && metrics.totalConversations.count30D}
          </p>
          {/* 3. Metric Details - Trend */}
          <div className="flex items-center gap-1 mb-2">
            {metrics.totalConversations.trend7D > 0 ? (
              <>
                <MdTrendingUp className="text-green-600" size={16} />
                <span className="text-sm text-green-600 font-medium">↑ {Math.abs(metrics.totalConversations.trend7D)}%</span>
              </>
            ) : metrics.totalConversations.trend7D < 0 ? (
              <>
                <MdTrendingDown className="text-red-600" size={16} />
                <span className="text-sm text-red-600 font-medium">↓ {Math.abs(metrics.totalConversations.trend7D)}%</span>
              </>
            ) : (
              <>
                <MdRemove className="text-gray-400" size={16} />
                <span className="text-sm text-gray-400 font-medium">0%</span>
              </>
            )}
          </div>
          {/* 4. Sparkline Graph */}
          <div className="mt-auto">
            {metrics.trends?.conversations && (
              <div className="w-full mb-2" style={{ height: '40px' }}>
                <Sparkline 
                  data={metrics.trends.conversations.data} 
                  color="#3B82F6" 
                  height={40} 
                />
              </div>
            )}
            {/* 5. Action Link */}
            <button 
              onClick={() => router.push('/dashboard/inbox')}
              className="text-xs font-medium flex items-center gap-1 hover:underline"
              style={{ color: '#3B82F6' }}
            >
              View All <MdArrowForward size={14} />
            </button>
          </div>
        </div>

        {/* Card 2: Total Leads */}
        <div 
          className="rounded-lg p-4 sm:p-6 border transition-all hover:shadow-lg flex flex-col"
          style={{ 
            backgroundColor: 'var(--accent-subtle)',
            borderColor: 'var(--accent-primary)',
            justifyContent: 'space-between'
          }}
        >
          {/* 1. Title + Filter */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Total Leads</h3>
            <div className="flex gap-1">
              {(['7D', '14D', '30D'] as const).map((period) => (
                <button
                  key={period}
                  onClick={() => setLeadsFilter(period)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    leadsFilter === period
                      ? 'text-white'
                      : ''
                  }`}
                  style={leadsFilter === period 
                    ? { backgroundColor: 'var(--accent-primary)' }
                    : { 
                        backgroundColor: 'var(--accent-subtle)',
                        color: 'var(--text-secondary)'
                      }
                  }
                  onMouseEnter={(e) => {
                    if (leadsFilter !== period) {
                      e.currentTarget.style.backgroundColor = 'var(--accent-primary)'
                      e.currentTarget.style.opacity = '0.8'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (leadsFilter !== period) {
                      e.currentTarget.style.backgroundColor = 'var(--accent-subtle)'
                      e.currentTarget.style.opacity = '1'
                    }
                  }}
                >
                  {period}
                </button>
              ))}
            </div>
          </div>
          {/* 2. Big Number */}
          <p className="text-3xl sm:text-4xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            {metrics.totalLeads.count}
          </p>
          {/* 3. Metric Details - Stacked */}
          <div className="flex flex-col gap-1 mb-2">
            {/* Row 1: Main metric */}
            <p className="text-sm font-medium" style={{ color: 'var(--accent-primary)' }}>
              {metrics.totalLeads.conversionRate.toFixed(1)}% conversion
            </p>
            {/* Row 2: Context */}
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              From {metrics.totalLeads.fromConversations} conversations
            </p>
          </div>
          {/* 4. Sparkline Graph */}
          <div className="mt-auto">
            {metrics.trends?.leads && (
              <div className="w-full mb-2" style={{ height: '40px' }}>
                <Sparkline 
                  data={metrics.trends.leads.data} 
                  color="var(--accent-primary)" 
                  height={40}
                  showGradient={true}
                />
              </div>
            )}
            {/* 5. Action Link */}
            <button 
              onClick={() => router.push('/dashboard/leads')}
              className="text-xs font-medium flex items-center gap-1 hover:underline"
              style={{ color: 'var(--accent-primary)' }}
            >
              View All <MdArrowForward size={14} />
            </button>
          </div>
        </div>

        {/* Card 3: Hot Leads - Semantic green for success/positive */}
        <div 
          className="rounded-lg p-4 sm:p-6 border transition-all hover:shadow-lg flex flex-col"
          style={{ 
            backgroundColor: 'rgba(34, 197, 94, 0.05)',
            borderColor: 'rgba(34, 197, 94, 0.2)',
            justifyContent: 'space-between'
          }}
        >
          {/* 1. Title + Filter */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <MdLocalFireDepartment className="text-green-600 dark:text-green-400" size={20} />
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Hot Leads</h3>
            </div>
            <div className="flex gap-1">
              {(['7D', '14D', '30D'] as const).map((period) => (
                <button
                  key={period}
                  onClick={() => setHotLeadsFilter(period)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    hotLeadsFilter === period
                      ? 'text-white'
                      : ''
                  }`}
                  style={hotLeadsFilter === period 
                    ? { backgroundColor: 'var(--accent-primary)' }
                    : { 
                        backgroundColor: 'var(--accent-subtle)',
                        color: 'var(--text-secondary)'
                      }
                  }
                  onMouseEnter={(e) => {
                    if (hotLeadsFilter !== period) {
                      e.currentTarget.style.backgroundColor = 'var(--accent-primary)'
                      e.currentTarget.style.opacity = '0.8'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (hotLeadsFilter !== period) {
                      e.currentTarget.style.backgroundColor = 'var(--accent-subtle)'
                      e.currentTarget.style.opacity = '1'
                    }
                  }}
                >
                  {period}
                </button>
              ))}
            </div>
          </div>
          {/* 2. Big Number */}
          <p className="text-3xl sm:text-4xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            {metrics.hotLeads.count}
          </p>
          {/* 3. Metric Details */}
          <div className="mb-2 relative">
            <div className="flex items-center gap-1">
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Score &gt;</span>
              <button
                onClick={() => setShowThresholdDropdown(!showThresholdDropdown)}
                className="flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded transition-colors hover:bg-opacity-10"
                style={{ 
                  color: 'var(--accent-primary)',
                  backgroundColor: showThresholdDropdown ? 'var(--accent-subtle)' : 'transparent'
                }}
                onBlur={() => setTimeout(() => setShowThresholdDropdown(false), 200)}
              >
                {hotLeadThreshold}
                <MdArrowDropDown size={14} />
              </button>
            </div>
            {showThresholdDropdown && (
              <div 
                className="absolute left-0 top-6 z-10 mt-1 rounded-md shadow-lg border"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  borderColor: 'var(--accent-subtle)',
                  minWidth: '80px'
                }}
              >
                {[70, 80, 90, 100].map((threshold) => (
                  <button
                    key={threshold}
                    onClick={() => {
                      setHotLeadThreshold(threshold)
                      localStorage.setItem('hot-lead-threshold', threshold.toString())
                      setShowThresholdDropdown(false)
                    }}
                    className="w-full text-left px-3 py-2 text-xs transition-colors hover:bg-opacity-20"
                    style={{
                      color: threshold === hotLeadThreshold ? 'var(--accent-primary)' : 'var(--text-secondary)',
                      backgroundColor: threshold === hotLeadThreshold ? 'var(--accent-subtle)' : 'transparent'
                    }}
                  >
                    {threshold}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* 4. Sparkline Graph */}
          <div className="mt-auto">
            {metrics.trends?.hotLeads && (
              <div className="w-full mb-2" style={{ height: '40px' }}>
                <Sparkline 
                  data={metrics.trends.hotLeads.data} 
                  color="#22C55E" 
                  height={40} 
                />
              </div>
            )}
            {/* 5. Action Link */}
            <button 
              onClick={() => router.push('/dashboard/inbox?filter=hot')}
              className="text-xs font-medium flex items-center gap-1 hover:underline"
              style={{ color: 'var(--accent-primary)' }}
            >
              View All <MdArrowForward size={14} />
            </button>
          </div>
        </div>

        {/* Card 4: Upcoming Events - Semantic blue for info/upcoming */}
        <div 
          className="rounded-lg p-4 sm:p-6 border transition-all hover:shadow-lg flex flex-col"
          style={{ 
            backgroundColor: 'rgba(59, 130, 246, 0.05)',
            borderColor: 'rgba(59, 130, 246, 0.2)',
            justifyContent: 'space-between'
          }}
        >
          {/* 1. Title */}
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>Upcoming Events</h3>
          {/* 2. Big Number */}
          <p className="text-3xl sm:text-4xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            {metrics.upcomingBookings.length}
          </p>
          {/* 3. Event Items List */}
          {metrics.upcomingBookings.length > 0 ? (
            <div className="space-y-2 mb-2">
              {metrics.upcomingBookings.slice(0, 2).map((booking) => (
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
                    e.currentTarget.style.borderColor = 'var(--accent-subtle)'
                  }}
                >
                  {/* Calendar Icon */}
                  <MdEvent 
                    className="flex-shrink-0" 
                    size={18} 
                    style={{ color: '#3B82F6' }} 
                  />
                  {/* Event Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      {booking.name}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {formatCountdown(booking.datetime)}
                    </p>
                  </div>
                  {/* Arrow Icon */}
                  <MdArrowForward 
                    className="flex-shrink-0" 
                    size={16} 
                    style={{ color: '#3B82F6' }} 
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>No upcoming events</p>
          )}
          {/* 4. Action Link */}
          <div className="mt-auto">
            <button 
              onClick={() => router.push('/dashboard/bookings')}
              className="text-xs font-medium flex items-center gap-1 hover:underline"
              style={{ color: '#3B82F6' }}
            >
              View All <MdArrowForward size={14} />
            </button>
          </div>
        </div>
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
                    className="px-3 py-1.5 text-white text-xs rounded-lg transition-colors flex-shrink-0"
                    style={{ backgroundColor: 'var(--accent-primary)' }}
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
                  
                  // 3. STAGE CHANGES
                  if (textLower.includes('entered') && textLower.includes('stage')) {
                    // "entered [stage]" → MdArrowUpward (purple)
                    return { 
                      icon: MdArrowUpward, 
                      color: 'var(--accent-primary)', // Purple
                      bgColor: '#8B5CF6', // Purple fallback
                      opacity: 0.2
                    }
                  }
                  if (textLower.includes('moved from') && textLower.includes('to')) {
                    // "moved from X to Y" → MdTrendingUp (purple)
                    return { 
                      icon: MdTrendingUp, 
                      color: 'var(--accent-primary)', // Purple
                      bgColor: '#8B5CF6', // Purple fallback
                      opacity: 0.2
                    }
                  }
                  if (type === 'stage_change') {
                    // Generic stage change → MdArrowUpward (purple)
                    return { 
                      icon: MdArrowUpward, 
                      color: 'var(--accent-primary)', // Purple
                      bgColor: '#8B5CF6', // Purple fallback
                      opacity: 0.2
                    }
                  }
                  
                  // 4. ENGAGEMENT (Channel-specific, but text-based)
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
