'use client'

import { useState, useEffect, useRef } from 'react'
import { formatDateTime, formatDate } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { MdLanguage, MdChat, MdPhone, MdShare, MdAutoAwesome, MdOpenInNew, MdHistory, MdCall, MdEvent, MdMessage, MdNote, MdEdit, MdTrendingUp, MdTrendingDown, MdRemove, MdCheckCircle, MdSchedule, MdPsychology, MdFlashOn, MdBarChart, MdEmail, MdChevronRight, MdSmartToy, MdPerson, MdRefresh, MdHelpOutline, MdInfo, MdCheck, MdClose, MdPayments, MdReportProblem, MdSchool, MdHistoryEdu, MdFlightTakeoff, MdAccountBalanceWallet, MdPersonOutline, MdOutlineInsights } from 'react-icons/md'
import { useRouter } from 'next/navigation'
import LeadStageSelector from './LeadStageSelector'
import ActivityLoggerModal from './ActivityLoggerModal'
import { LeadStage } from '@/types'
import type { Lead as ScoreLead } from '@/types'
import { calculateLeadScore as calculateLeadScoreUtil } from '@/lib/leadScoreCalculator'

// Helper functions for IST date/time formatting
function formatDateIST(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  const day = date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Kolkata'
  }).replace(/\//g, '-');
  return day;
}

function formatTimeIST(dateString: string | null | undefined): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata'
  });
}

function formatDateTimeIST(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  return `${formatDateIST(dateString)}, ${formatTimeIST(dateString)}`;
}

function formatBookingTime(timeString: string | null | undefined): string {
  if (!timeString) return '';
  const timeParts = timeString.toString().split(':');
  if (timeParts.length < 2) return timeString.toString();
  const hours = parseInt(timeParts[0], 10);
  const minutes = parseInt(timeParts[1], 10);
  if (isNaN(hours) || isNaN(minutes)) return timeString.toString();
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  const minutesStr = minutes.toString().padStart(2, '0');
  return `${hours12}:${minutesStr} ${period}`;
}

function formatBookingDateShort(dateString: string | null | undefined): string {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateString;
  }
}

function renderMarkdown(text: string) {
  if (!text) return null;

  // Simple regex to handle **bold** text
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-bold text-gray-900 dark:text-white">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

const ALL_CHANNELS = ['web', 'whatsapp', 'voice', 'social'];

const ChannelIcon = ({ channel, size = 16, active = false }: { channel: string; size?: number; active?: boolean }) => {
  const style = {
    opacity: active ? 1 : 0.3,
    filter: 'invert(1) brightness(2)',
  };

  switch (channel) {
    case 'web':
      return <img src="/browser-stroke-rounded.svg" alt="Web" width={size} height={size} style={style} title="Website" />;
    case 'whatsapp':
      return <img src="/whatsapp-business-stroke-rounded.svg" alt="WhatsApp" width={size} height={size} style={style} title="WhatsApp" />;
    case 'voice':
      return <img src="/ai-voice-stroke-rounded.svg" alt="Voice" width={size} height={size} style={style} title="Voice" />;
    case 'social':
      return <img src="/video-ai-stroke-rounded.svg" alt="Social" width={size} height={size} style={style} title="Social" />;
    default:
      return null;
  }
};

interface Lead {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  source: string | null
  first_touchpoint?: string | null
  last_touchpoint?: string | null
  timestamp: string
  status: string | null
  booking_date: string | null
  booking_time: string | null
  metadata?: any
  unified_context?: any
  lead_score?: number | null
  lead_stage?: string | null
  sub_stage?: string | null
  stage_override?: boolean | null
  last_scored_at?: string | null
  last_interaction_at?: string | null
  created_at?: string | null
}

interface LeadDetailsModalProps {
  lead: Lead | null
  isOpen: boolean
  onClose: () => void
  onStatusUpdate: (leadId: string, newStatus: string) => Promise<void>
}

const CHANNEL_CONFIG = {
  web: {
    name: 'Web',
    icon: MdLanguage,
    color: '#3B82F6',
    emoji: '🌐'
  },
  whatsapp: {
    name: 'WhatsApp',
    icon: MdChat,
    color: '#22C55E',
    emoji: '💬'
  },
  voice: {
    name: 'Voice',
    icon: MdPhone,
    color: 'var(--accent-primary)',
    emoji: '📞'
  },
  social: {
    name: 'Social',
    icon: MdShare,
    color: '#EC4899',
    emoji: '📱'
  }
}

const STAGE_PROGRESSION = [
  { stage: 'New', order: 0 },
  { stage: 'Engaged', order: 1 },
  { stage: 'Qualified', order: 2 },
  { stage: 'High Intent', order: 3 },
  { stage: 'Booking Made', order: 4 },
  { stage: 'Converted', order: 5 },
]

export default function LeadDetailsModal({ lead, isOpen, onClose, onStatusUpdate }: LeadDetailsModalProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'activity' | 'summary' | 'breakdown' | 'interaction'>('activity')
  const [showStageDropdown, setShowStageDropdown] = useState(false)
  const [showActivityModal, setShowActivityModal] = useState(false)
  const stageButtonRef = useRef<HTMLButtonElement>(null)
  const [dropdownPosition, setDropdownPosition] = useState<'below' | 'above'>('below')
  const [pendingStageChange, setPendingStageChange] = useState<{
    oldStage: string | null
    newStage: LeadStage
  } | null>(null)
  const [unifiedSummary, setUnifiedSummary] = useState<string>('')
  const [summaryAttribution, setSummaryAttribution] = useState<string>('')
  const [summaryData, setSummaryData] = useState<any>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [activities, setActivities] = useState<any[]>([])
  const [loadingActivities, setLoadingActivities] = useState(false)

  // 30-Day Interaction data (from first touchpoint)
  const [interaction30Days, setInteraction30Days] = useState<{
    totalInteractions: number
    dailyData: Array<{ date: string; count: number }>
    lastTouchDay: string | null
  } | null>(null)
  const [loading30Days, setLoading30Days] = useState(false)

  // New state for enhanced metrics
  const [channelData, setChannelData] = useState<{
    web: { count: number; firstDate: string | null; lastDate: string | null }
    whatsapp: { count: number; firstDate: string | null; lastDate: string | null }
    voice: { count: number; firstDate: string | null; lastDate: string | null }
    social: { count: number; firstDate: string | null; lastDate: string | null }
  }>({
    web: { count: 0, firstDate: null, lastDate: null },
    whatsapp: { count: 0, firstDate: null, lastDate: null },
    voice: { count: 0, firstDate: null, lastDate: null },
    social: { count: 0, firstDate: null, lastDate: null },
  })
  const [quickStats, setQuickStats] = useState<{
    totalMessages: number
    responseRate: number
    avgResponseTime: number
    hasBooking: boolean
  }>({
    totalMessages: 0,
    responseRate: 0,
    avgResponseTime: 0,
    hasBooking: false,
  })
  const [previousScore, setPreviousScore] = useState<number | null>(null)
  const [freshLeadData, setFreshLeadData] = useState<Lead | null>(null)
  const [calculatedScore, setCalculatedScore] = useState<{
    score: number
    breakdown: {
      ai: number
      activity: number
      business: number
    }
  } | null>(null)

  // Calculate and set unified score (using shared utility)
  const calculateAndSetScore = async () => {
    if (!lead) return
    const leadData = freshLeadData || lead
    const result = await calculateLeadScoreUtil(leadData as ScoreLead)
    setCalculatedScore(result)
  }

  // Fetch fresh lead data from database when modal opens
  const loadFreshLeadData = async () => {
    if (!lead) return
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('all_leads')
        .select('id, customer_name, email, phone, created_at, last_interaction_at, booking_date, booking_time, lead_score, lead_stage, sub_stage, stage_override, unified_context, first_touchpoint, last_touchpoint, status')
        .eq('id', lead.id)
        .single()

      if (error) {
        console.error('Error fetching fresh lead data:', error)
        return
      }

      if (data) {
        const typedData = data as {
          booking_date?: string | null
          booking_time?: string | null
          unified_context?: any
          lead_stage?: string | null
          sub_stage?: string | null
          stage_override?: boolean | null
          lead_score?: number | null
          first_touchpoint?: string | null
          last_touchpoint?: string | null
          status?: string | null
          created_at?: string | null
          last_interaction_at?: string | null
          customer_name?: string | null
          email?: string | null
          phone?: string | null
        }
        // Get booking from multiple sources (same logic as loadQuickStats)
        const unifiedContext = typedData.unified_context || lead.unified_context
        const bookingDate =
          typedData.booking_date ||
          lead.booking_date ||
          unifiedContext?.web?.booking_date ||
          unifiedContext?.web?.booking?.date ||
          unifiedContext?.whatsapp?.booking_date ||
          unifiedContext?.whatsapp?.booking?.date ||
          unifiedContext?.voice?.booking_date ||
          unifiedContext?.voice?.booking?.date ||
          unifiedContext?.social?.booking_date ||
          unifiedContext?.social?.booking?.date ||
          null

        const bookingTime =
          typedData.booking_time ||
          lead.booking_time ||
          unifiedContext?.web?.booking_time ||
          unifiedContext?.web?.booking?.time ||
          unifiedContext?.whatsapp?.booking_time ||
          unifiedContext?.whatsapp?.booking?.time ||
          unifiedContext?.voice?.booking_time ||
          unifiedContext?.voice?.booking?.time ||
          unifiedContext?.social?.booking_time ||
          unifiedContext?.social?.booking?.time ||
          null

        // Merge fresh data with existing lead prop
        const mergedLead: Lead = {
          ...lead,
          name: typedData.customer_name || lead.name,
          email: typedData.email || lead.email,
          phone: typedData.phone || lead.phone,
          timestamp: typedData.created_at || lead.timestamp,
          last_interaction_at: typedData.last_interaction_at || lead.last_interaction_at || null,
          booking_date: bookingDate,
          booking_time: bookingTime,
          lead_score: typedData.lead_score ?? lead.lead_score ?? null,
          lead_stage: typedData.lead_stage || lead.lead_stage || null,
          sub_stage: typedData.sub_stage || lead.sub_stage || null,
          stage_override: typedData.stage_override ?? lead.stage_override ?? null,
          unified_context: typedData.unified_context || lead.unified_context || null,
          first_touchpoint: typedData.first_touchpoint || lead.first_touchpoint || null,
          last_touchpoint: typedData.last_touchpoint || lead.last_touchpoint || null,
          status: typedData.status || lead.status || null,
        }
        setFreshLeadData(mergedLead)
      }
    } catch (error) {
      console.error('Error loading fresh lead data:', error)
    }
  }

  // Load 30-day interaction data (from first touchpoint)
  const load30DayInteractions = async () => {
    if (!lead) return
    setLoading30Days(true)
    try {
      const supabase = createClient()

      // Get first touchpoint date (created_at)
      const firstTouchpoint = new Date(lead.created_at || lead.timestamp || new Date())
      const thirtyDaysLater = new Date(firstTouchpoint)
      thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30)

      // Fetch messages from first 30 days (customer messages only)
      const { data: messages30Days, error: error30 } = await supabase
        .from('conversations')
        .select('created_at, sender')
        .eq('lead_id', lead.id)
        .eq('sender', 'customer')
        .gte('created_at', firstTouchpoint.toISOString())
        .lt('created_at', thirtyDaysLater.toISOString())
        .order('created_at', { ascending: true })

      if (error30) {
        console.error('Error loading 30-day interactions:', error30)
        setLoading30Days(false)
        return
      }

      const typedMessages30Days = (messages30Days ?? []) as Array<{ created_at?: string | null }>
      // Group messages by date for first 30 days
      const dailyCounts: Record<string, number> = {}

      // Initialize all 30 days with 0
      for (let i = 0; i < 30; i++) {
        const date = new Date(firstTouchpoint)
        date.setDate(date.getDate() + i)
        const dateStr = date.toISOString().split('T')[0]
        dailyCounts[dateStr] = 0
      }

      // Count messages per day
      typedMessages30Days.forEach((msg) => {
        if (!msg.created_at) return
        const dateStr = new Date(msg.created_at).toISOString().split('T')[0]
        if (dailyCounts[dateStr] !== undefined) {
          dailyCounts[dateStr] = (dailyCounts[dateStr] || 0) + 1
        }
      })

      // Convert to array and sort by date
      const dailyData = Object.entries(dailyCounts)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date))

      // Calculate total interactions
      const totalInteractions = typedMessages30Days.length

      // Calculate last touch day (most recent day with interactions)
      let lastTouchDay: string | null = null
      if (typedMessages30Days.length > 0) {
        const lastMessage = typedMessages30Days[typedMessages30Days.length - 1]
        const lastDate = lastMessage.created_at ? new Date(lastMessage.created_at) : new Date()
        lastTouchDay = lastDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      }

      setInteraction30Days({
        totalInteractions,
        dailyData,
        lastTouchDay,
      })
    } catch (error) {
      console.error('Error loading 30-day interactions:', error)
    } finally {
      setLoading30Days(false)
    }
  }

  // Load all data when lead changes
  useEffect(() => {
    if (lead && isOpen) {
      loadFreshLeadData()
      loadUnifiedSummary()
      loadActivities()
      loadChannelData()
      loadQuickStats()
      loadScoreHistory()
      // Calculate score immediately with lead prop (will recalculate when freshLeadData loads)
      calculateAndSetScore()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead, isOpen])

  // Recalculate score after fresh lead data is loaded (more accurate)
  useEffect(() => {
    if (freshLeadData && isOpen) {
      calculateAndSetScore()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshLeadData, isOpen])


  // Load 30-day interaction data when interaction tab is active
  useEffect(() => {
    if (activeTab === 'interaction' && lead && isOpen) {
      load30DayInteractions()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, lead, isOpen])


  const loadUnifiedSummary = async () => {
    if (!lead) return
    setLoadingSummary(true)
    try {
      console.log('Loading unified summary for lead:', lead.id)
      const response = await fetch(`/api/dashboard/leads/${lead.id}/summary`)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to load summary' }))
        console.error('Error loading unified summary:', response.status, errorData)
        setUnifiedSummary('')
        setSummaryAttribution('')
        setSummaryData(null)
        return
      }

      const data = await response.json()
      console.log('Summary API response:', { hasSummary: !!data.summary, summaryLength: data.summary?.length })

      if (data.summary) {
        setUnifiedSummary(data.summary)
        setSummaryAttribution(data.attribution || '')
        setSummaryData(data.data || null)
      } else {
        // If no summary in response, clear the state
        console.warn('No summary in API response')
        setUnifiedSummary('')
        setSummaryAttribution('')
        setSummaryData(null)
      }
    } catch (error) {
      console.error('Error loading unified summary:', error)
      setUnifiedSummary('')
      setSummaryAttribution('')
      setSummaryData(null)
    } finally {
      setLoadingSummary(false)
    }
  }

  const loadActivities = async () => {
    if (!lead) return
    setLoadingActivities(true)
    try {
      const response = await fetch(`/api/dashboard/leads/${lead.id}/activities`)
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.activities) {
          setActivities(data.activities)
        }
      }
    } catch (error) {
      console.error('Error loading activities:', error)
    } finally {
      setLoadingActivities(false)
    }
  }

  const loadChannelData = async () => {
    if (!lead) return
    try {
      const supabase = createClient()
      const { data: messages } = await supabase
        .from('conversations')
        .select('channel, created_at')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: true })

      if (messages && Array.isArray(messages)) {
        const channelStats: typeof channelData = {
          web: { count: 0, firstDate: null, lastDate: null },
          whatsapp: { count: 0, firstDate: null, lastDate: null },
          voice: { count: 0, firstDate: null, lastDate: null },
          social: { count: 0, firstDate: null, lastDate: null },
        }

        messages.forEach((msg: any) => {
          const channel = msg.channel as keyof typeof channelStats
          if (channelStats[channel]) {
            channelStats[channel].count++
            if (!channelStats[channel].firstDate) {
              channelStats[channel].firstDate = msg.created_at
            }
            channelStats[channel].lastDate = msg.created_at
          }
        })

        setChannelData(channelStats)
      }
    } catch (error) {
      console.error('Error loading channel data:', error)
    }
  }

  const loadQuickStats = async () => {
    if (!lead) return
    try {
      const supabase = createClient()
      // Select metadata to get response_time_ms
      const { data: messages } = await supabase
        .from('conversations')
        .select('sender, created_at, metadata')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: true })

      // Fetch fresh lead data to check booking
      const { data: leadData } = await supabase
        .from('all_leads')
        .select('booking_date, booking_time, unified_context')
        .eq('id', lead.id)
        .single()

      const typedLeadData = leadData as {
        booking_date?: string | null
        booking_time?: string | null
        unified_context?: any
      } | null

      if (messages && Array.isArray(messages) && messages.length > 0) {
        // Calculate response rate: (agent replies / customer messages) * 100
        const customerMessages = messages.filter((m: any) => m.sender === 'customer')
        const agentMessages = messages.filter((m: any) => m.sender === 'agent')
        const responseRate = customerMessages.length > 0
          ? Math.round((agentMessages.length / customerMessages.length) * 100)
          : 0

        // Calculate average response time from metadata.response_time_ms
        let totalResponseTime = 0
        let responseCount = 0

        // First, try to use metadata.response_time_ms
        messages.forEach((msg: any) => {
          if (msg.sender === 'agent' && msg.metadata?.response_time_ms) {
            const responseTimeMs = typeof msg.metadata.response_time_ms === 'number'
              ? msg.metadata.response_time_ms
              : parseInt(msg.metadata.response_time_ms, 10)
            if (!isNaN(responseTimeMs) && responseTimeMs > 0) {
              totalResponseTime += responseTimeMs
              responseCount++
            }
          }
        })

        // Fallback to timestamp calculation if no metadata.response_time_ms
        if (responseCount === 0) {
          for (let i = 0; i < messages.length - 1; i++) {
            const msg1 = messages[i] as any
            const msg2 = messages[i + 1] as any
            if (msg1.sender === 'customer' && msg2.sender === 'agent') {
              const timeDiff = new Date(msg2.created_at).getTime() - new Date(msg1.created_at).getTime()
              if (timeDiff > 0) {
                totalResponseTime += timeDiff
                responseCount++
              }
            }
          }
        }

        // Convert to minutes (metadata is in ms, timestamp diff is also in ms)
        const avgResponseTime = responseCount > 0
          ? Math.round(totalResponseTime / responseCount / 60000)
          : 0

        // Check booking from multiple sources - prioritize fresh data
        const unifiedContext = typedLeadData?.unified_context || lead.unified_context
        const bookingDate =
          typedLeadData?.booking_date ||
          lead.booking_date ||
          unifiedContext?.web?.booking_date ||
          unifiedContext?.web?.booking?.date ||
          unifiedContext?.whatsapp?.booking_date ||
          unifiedContext?.whatsapp?.booking?.date ||
          unifiedContext?.voice?.booking_date ||
          unifiedContext?.voice?.booking?.date ||
          unifiedContext?.social?.booking_date ||
          unifiedContext?.social?.booking?.date ||
          null

        const bookingTime =
          typedLeadData?.booking_time ||
          lead.booking_time ||
          unifiedContext?.web?.booking_time ||
          unifiedContext?.web?.booking?.time ||
          unifiedContext?.whatsapp?.booking_time ||
          unifiedContext?.whatsapp?.booking?.time ||
          unifiedContext?.voice?.booking_time ||
          unifiedContext?.voice?.booking?.time ||
          unifiedContext?.social?.booking_time ||
          unifiedContext?.social?.booking?.time ||
          null

        const hasBooking = !!(bookingDate || bookingTime)

        setQuickStats({
          totalMessages: messages.length,
          responseRate,
          avgResponseTime,
          hasBooking,
        })
      } else {
        // Even with no messages, check for booking
        const unifiedContext = typedLeadData?.unified_context || lead.unified_context
        const bookingDate =
          typedLeadData?.booking_date ||
          lead.booking_date ||
          unifiedContext?.web?.booking_date ||
          unifiedContext?.web?.booking?.date ||
          unifiedContext?.whatsapp?.booking_date ||
          unifiedContext?.whatsapp?.booking?.date ||
          unifiedContext?.voice?.booking_date ||
          unifiedContext?.voice?.booking?.date ||
          unifiedContext?.social?.booking_date ||
          unifiedContext?.social?.booking?.date ||
          null

        const bookingTime =
          typedLeadData?.booking_time ||
          lead.booking_time ||
          unifiedContext?.web?.booking_time ||
          unifiedContext?.web?.booking?.time ||
          unifiedContext?.whatsapp?.booking_time ||
          unifiedContext?.whatsapp?.booking?.time ||
          unifiedContext?.voice?.booking_time ||
          unifiedContext?.voice?.booking?.time ||
          unifiedContext?.social?.booking_time ||
          unifiedContext?.social?.booking?.time ||
          null

        const hasBooking = !!(bookingDate || bookingTime)

        setQuickStats({
          totalMessages: 0,
          responseRate: 0,
          avgResponseTime: 0,
          hasBooking,
        })
      }
    } catch (error) {
      console.error('Error loading quick stats:', error)
    }
  }

  const loadScoreHistory = async () => {
    if (!lead) return
    try {
      const supabase = createClient()
      const { data: history } = await supabase
        .from('stage_history')
        .select('score_at_change, changed_at')
        .eq('lead_id', lead.id)
        .order('changed_at', { ascending: false })
        .limit(2)

      if (history && Array.isArray(history) && history.length > 1) {
        const prev = history[1] as any
        setPreviousScore(prev.score_at_change)
      }
    } catch (error) {
      console.error('Error loading score history:', error)
    }
  }


  if (!isOpen || !lead) return null

  // Use fresh lead data if available, otherwise fall back to prop
  const currentLead = freshLeadData || lead

  // Calculate days in pipeline
  const daysInPipeline = Math.floor((new Date().getTime() - new Date(currentLead.timestamp).getTime()) / (1000 * 60 * 60 * 24))

  // Calculate days inactive - prioritize all_leads.last_interaction_at, then check unified_context channels
  const lastInteraction: string | null =
    currentLead.last_interaction_at ||
    currentLead.unified_context?.whatsapp?.last_interaction ||
    currentLead.unified_context?.web?.last_interaction ||
    currentLead.unified_context?.voice?.last_interaction ||
    currentLead.unified_context?.social?.last_interaction ||
    currentLead.timestamp ||
    null
  const daysInactive = lastInteraction ? Math.floor((new Date().getTime() - new Date(lastInteraction).getTime()) / (1000 * 60 * 60 * 24)) : 0

  // Get health score from calculated score (live calculation)
  const score = calculatedScore?.score ?? 0
  const getHealthColor = (score: number) => {
    if (score >= 90) return { bg: '#22C55E', text: '#15803D', label: 'Hot 🔥' } // Green for Hot (90-100)
    if (score >= 70) return { bg: '#F97316', text: '#C2410C', label: 'Warm ⚡' } // Orange for Warm (70-89)
    return { bg: '#3B82F6', text: '#1E40AF', label: 'Cold ❄️' } // Blue for Cold (0-69)
  }
  const healthColor = getHealthColor(score)

  // Calculate health trend
  const getHealthTrend = () => {
    if (previousScore === null) return null
    const diff = score - previousScore
    if (diff > 5) return { icon: MdTrendingUp, color: '#22C55E', label: 'Warming' }
    if (diff < -5) return { icon: MdTrendingDown, color: '#EF4444', label: 'Cooling' }
    return { icon: MdRemove, color: '#6B7280', label: 'Stable' }
  }
  const healthTrend = getHealthTrend()

  // Auto-detect stage from conversation
  const autoDetectStage = (): string => {
    if (currentLead.lead_stage && !currentLead.stage_override) {
      return currentLead.lead_stage
    }

    // Simple auto-detection based on score and activity
    if (score >= 86 || currentLead.booking_date) return 'Booking Made'
    if (score >= 61) return 'High Intent'
    if (score >= 31) return 'Qualified'
    if (quickStats.totalMessages > 3) return 'Engaged'
    return 'New'
  }
  const detectedStage = autoDetectStage()
  const currentStage = currentLead.lead_stage || detectedStage

  // Calculate stage duration
  const getStageDuration = () => {
    try {
      const supabase = createClient()
      // This would need to fetch from stage_history, simplified for now
      return daysInPipeline
    } catch {
      return daysInPipeline
    }
  }
  const stageDuration = getStageDuration()

  // Get stage progress
  const getStageProgress = () => {
    const stageOrder = STAGE_PROGRESSION.find(s => s.stage === currentStage)?.order ?? 0
    return Math.round((stageOrder / (STAGE_PROGRESSION.length - 1)) * 100)
  }

  // Get stage badge color
  const getStageBadgeClass = (stage: string | null) => {
    if (!stage) return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    const stageColors: Record<string, string> = {
      'New': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      'Engaged': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
      'Qualified': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      'High Intent': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      'Booking Made': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      'Converted': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
      'Closed Lost': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      'In Sequence': '', // Will use inline styles with CSS variables
      'Cold': 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
    }
    return stageColors[stage] || stageColors['New']
  }

  // Handle stage change
  const handleStageChange = (newStage: LeadStage) => {
    const oldStage: string | null = currentLead.lead_stage || null
    setPendingStageChange({ oldStage, newStage })
    setShowStageDropdown(false)
    setShowActivityModal(true)
  }

  const handleActivitySave = async (activity: {
    activity_type: 'call' | 'meeting' | 'message' | 'note'
    note: string
    duration?: number
    next_followup?: string
  }) => {
    if (!pendingStageChange) return

    try {
      const response = await fetch(`/api/dashboard/leads/${lead.id}/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_stage: pendingStageChange.newStage,
          activity_type: activity.activity_type,
          note: activity.note,
          duration_minutes: activity.duration,
          next_followup_date: activity.next_followup,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update stage')
      }

      const supabase = createClient()
      const { data } = await supabase
        .from('all_leads')
        .select('lead_stage, sub_stage, lead_score, stage_override, last_interaction_at, booking_date, booking_time, unified_context')
        .eq('id', lead.id)
        .single()

      if (data) {
        const leadData = data as any
        // Update fresh lead data state
        setFreshLeadData((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            lead_stage: leadData.lead_stage,
            sub_stage: leadData.sub_stage,
            lead_score: leadData.lead_score,
            stage_override: leadData.stage_override,
            last_interaction_at: leadData.last_interaction_at || prev.last_interaction_at,
            booking_date: leadData.booking_date || leadData.unified_context?.web?.booking_date || leadData.unified_context?.whatsapp?.booking_date || prev.booking_date,
            booking_time: leadData.booking_time || leadData.unified_context?.web?.booking_time || leadData.unified_context?.whatsapp?.booking_time || prev.booking_time,
            unified_context: leadData.unified_context || prev.unified_context,
          }
        })
      }

      setShowActivityModal(false)
      setPendingStageChange(null)
      await loadFreshLeadData() // Reload fresh data
      await calculateAndSetScore() // Recalculate score after stage update
      loadUnifiedSummary()
      loadActivities()
    } catch (err) {
      console.error('Error updating stage:', err)
      alert(err instanceof Error ? err.message : 'Failed to update stage')
    }
  }

  // Get active channels in order
  const getActiveChannels = () => {
    const channels: Array<{
      name: string
      icon: any
      color: string
      emoji: string
      key: string
      count: number
      firstDate: string | null
      lastDate: string | null
    }> = []
    if (channelData.web.count > 0) channels.push({ ...CHANNEL_CONFIG.web, key: 'web', ...channelData.web })
    if (channelData.whatsapp.count > 0) channels.push({ ...CHANNEL_CONFIG.whatsapp, key: 'whatsapp', ...channelData.whatsapp })
    if (channelData.voice.count > 0) channels.push({ ...CHANNEL_CONFIG.voice, key: 'voice', ...channelData.voice })
    if (channelData.social.count > 0) channels.push({ ...CHANNEL_CONFIG.social, key: 'social', ...channelData.social })
    return channels.sort((a, b) => {
      const aDate = a.firstDate ? new Date(a.firstDate).getTime() : 0
      const bDate = b.firstDate ? new Date(b.firstDate).getTime() : 0
      return aDate - bDate
    })
  }
  const activeChannels = getActiveChannels()

  return (
    <>
      <div
        className="lead-modal-backdrop fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-40"
        onClick={onClose}
        aria-hidden="true"
      ></div>

      <div
        className="lead-modal-overlay fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4"
        onClick={onClose}
        aria-hidden="true"
      >
        <dialog
          open={isOpen}
          className="lead-modal-dialog lead-details-modal relative bg-white dark:bg-[#1A1A1A] rounded-lg shadow-xl z-50 flex flex-col"
          style={{
            width: '54vw',
            maxWidth: '720px',
            height: '70vh',
            maxHeight: '70vh'
          }}
          onClick={(e) => e.stopPropagation()}
          aria-labelledby="lead-modal-title"
          aria-modal="true"
        >
          {/* Single Row Header: Contact Card (Left) + Journey & Stats (Right) */}
          <header className="lead-modal-header lead-details-modal-header flex flex-row items-stretch gap-6 p-4 border-b border-gray-200 dark:border-[#262626] flex-shrink-0 relative min-h-[160px]">
            {/* LEFT HALF: Contact Card - Business Card Style */}
            <section className="lead-contact-card flex-1 flex flex-col justify-between h-full p-3 bg-gray-50/50 dark:bg-gray-800/30 rounded-xl border border-gray-200/50 dark:border-gray-700/30">
              {/* Top Section: Name, Score, Status */}
              <div className="lead-contact-card-header">
                {/* Name + Score badge (top row) */}
                <div className="lead-contact-name-row flex items-start justify-between mb-1 gap-2">
                  <h2
                    id="lead-modal-title"
                    className="lead-contact-name text-xl font-bold text-gray-900 dark:text-white leading-tight flex-1 min-w-0 truncate"
                  >
                    {currentLead.name || 'Unknown Lead'}
                  </h2>

                  {/* Lead Health Score - Right aligned */}
                  <div
                    className="lead-score-card w-14 h-14 rounded-lg flex flex-col items-center justify-center shadow-sm flex-shrink-0 relative border"
                    role="status"
                    aria-label={`Lead score: ${score} out of 100, ${healthColor.label}`}
                    style={{
                      backgroundColor: score >= 90
                        ? 'rgba(34, 197, 94, 0.05)'
                        : score >= 70
                          ? 'rgba(249, 115, 22, 0.05)'
                          : 'rgba(59, 130, 246, 0.05)',
                      borderColor: score >= 90
                        ? 'rgba(34, 197, 94, 0.2)'
                        : score >= 70
                          ? 'rgba(249, 115, 22, 0.2)'
                          : 'rgba(59, 130, 246, 0.2)'
                    }}
                  >
                    {/* Colored badge at top */}
                    <div
                      className="lead-score-indicator absolute top-0 left-0 right-0 h-1 rounded-t-lg"
                      style={{
                        backgroundColor: score >= 90
                          ? '#22C55E'
                          : score >= 70
                            ? '#F97316'
                            : '#3B82F6'
                      }}
                    ></div>
                    <span className="lead-score-value text-lg font-bold leading-none" style={{ color: healthColor.text }}>{score}</span>
                    <span className="lead-score-label text-[8px] font-medium opacity-90 mt-0.5" style={{ color: healthColor.text }}>{healthColor.label}</span>
                  </div>
                </div>

                {/* Status badge below name */}
                <div className="lead-stage-container flex items-center gap-1 relative">
                  <span
                    className={`lead-stage-badge px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 ${getStageBadgeClass(currentStage)}`}
                    style={currentStage === 'In Sequence' ? {
                      backgroundColor: 'var(--accent-subtle)',
                      color: 'var(--accent-primary)'
                    } : undefined}
                    aria-label={`Current stage: ${currentStage}`}
                  >
                    {currentStage}
                  </span>
                  <button
                    ref={stageButtonRef}
                    onClick={() => setShowStageDropdown(!showStageDropdown)}
                    className="lead-stage-edit-button p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
                    title="Edit stage"
                    aria-label="Edit lead stage"
                    aria-expanded={showStageDropdown}
                    aria-haspopup="true"
                  >
                    <MdEdit size={12} className="text-gray-500 dark:text-gray-400" />
                  </button>
                </div>
              </div>

              {/* Contact Info Section - Bottom */}
              <address className="lead-contact-info space-y-1 mt-auto not-italic">
                {/* Email with icon */}
                {currentLead.email && (
                  <div className="lead-contact-email flex items-center gap-1.5">
                    <div className="lead-contact-icon w-6 h-6 rounded bg-gray-100 dark:bg-gray-700/50 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                      <MdEmail className="text-gray-600 dark:text-gray-300" size={14} />
                    </div>
                    <a
                      href={`mailto:${currentLead.email}`}
                      className="lead-contact-email-link text-sm font-medium text-gray-700 dark:text-gray-300 leading-tight truncate"
                    >
                      {currentLead.email}
                    </a>
                  </div>
                )}

                {/* Phone with icon */}
                {currentLead.phone && (
                  <div className="lead-contact-phone flex items-center gap-1.5">
                    <div className="lead-contact-icon w-6 h-6 rounded bg-gray-100 dark:bg-gray-700/50 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                      <MdPhone className="text-gray-600 dark:text-gray-300" size={14} />
                    </div>
                    <a
                      href={`tel:${currentLead.phone}`}
                      className="lead-contact-phone-link text-sm font-medium text-gray-700 dark:text-gray-300 leading-tight"
                    >
                      {currentLead.phone}
                    </a>
                  </div>
                )}

                {!currentLead.email && !currentLead.phone && (
                  <p className="lead-contact-empty text-sm text-gray-500 dark:text-gray-400">No contact info</p>
                )}
              </address>
            </section>

            {/* RIGHT HALF: Customer Journey + Quick Stats */}
            <section className="lead-journey-stats-section flex-1 flex flex-col h-full gap-4">
              {/* Customer Journey - TOP */}
              <section className="lead-journey-section">
                <h3 className="lead-journey-title text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Customer Journey</h3>
                {activeChannels.length > 0 ? (
                  <nav className="lead-journey-channels flex items-center gap-1.5 flex-wrap" aria-label="Customer journey channels">
                    {activeChannels.map((channel, index) => (
                      <div key={channel.key} className="lead-journey-channel-item flex items-center gap-1.5">
                        <div
                          className="lead-journey-channel-icon w-6 h-6 rounded-full flex items-center justify-center text-white shadow-sm flex-shrink-0 cursor-pointer"
                          style={{ backgroundColor: channel.color }}
                          title={`${channel.name} - ${channel.firstDate ? formatDateIST(channel.firstDate) : 'N/A'}, ${channel.count} msgs`}
                          aria-label={`${channel.name} channel`}
                        >
                          <channel.icon size={14} />
                        </div>
                        {index < activeChannels.length - 1 && (
                          <MdChevronRight className="lead-journey-separator text-gray-400 dark:text-gray-500 flex-shrink-0" size={16} aria-hidden="true" />
                        )}
                      </div>
                    ))}
                  </nav>
                ) : (
                  <p className="lead-journey-empty text-xs text-gray-500 dark:text-gray-400">No channels yet</p>
                )}
              </section>

              {/* Quick Stats - BELOW Journey (3 in a row) */}
              <section className="lead-quick-stats-section">
                <h3 className="lead-quick-stats-title text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Quick Stats</h3>
                <div className="lead-quick-stats-grid grid grid-cols-3 gap-2">
                  <article className="lead-stat-card lead-stat-messages flex flex-col justify-between h-full p-3 min-h-[80px] bg-white dark:bg-[#1A1A1A] rounded-lg border border-gray-200 dark:border-[#262626]">
                    <p className="lead-stat-label text-sm text-gray-400 dark:text-gray-500">Messages</p>
                    <p className="lead-stat-value text-2xl font-bold text-gray-900 dark:text-white mt-auto" aria-label={`${quickStats.totalMessages} total messages`}>{quickStats.totalMessages}</p>
                  </article>
                  <article className="lead-stat-card lead-stat-response-rate flex flex-col justify-between h-full p-3 min-h-[80px] bg-white dark:bg-[#1A1A1A] rounded-lg border border-gray-200 dark:border-[#262626]">
                    <p className="lead-stat-label text-sm text-gray-400 dark:text-gray-500">Response Rate</p>
                    <p className="lead-stat-value text-2xl font-bold text-gray-900 dark:text-white mt-auto" aria-label={`${quickStats.responseRate}% response rate`}>{quickStats.responseRate}%</p>
                  </article>
                  <article className={`lead-stat-card lead-stat-key-event flex flex-col justify-between h-full p-3 min-h-[80px] rounded-lg border ${(() => {
                    const bookingDate = currentLead.booking_date ||
                      currentLead.unified_context?.web?.booking_date ||
                      currentLead.unified_context?.web?.booking?.date ||
                      currentLead.unified_context?.whatsapp?.booking_date ||
                      currentLead.unified_context?.whatsapp?.booking?.date ||
                      currentLead.unified_context?.voice?.booking_date ||
                      currentLead.unified_context?.voice?.booking?.date ||
                      currentLead.unified_context?.social?.booking_date ||
                      currentLead.unified_context?.social?.booking?.date;
                    const bookingTime = currentLead.booking_time ||
                      currentLead.unified_context?.web?.booking_time ||
                      currentLead.unified_context?.web?.booking?.time ||
                      currentLead.unified_context?.whatsapp?.booking_time ||
                      currentLead.unified_context?.whatsapp?.booking?.time ||
                      currentLead.unified_context?.voice?.booking_time ||
                      currentLead.unified_context?.voice?.booking?.time ||
                      currentLead.unified_context?.social?.booking_time ||
                      currentLead.unified_context?.social?.booking?.time;
                    return bookingDate && bookingTime
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                      : 'bg-white dark:bg-[#1A1A1A] border-gray-200 dark:border-[#262626]';
                  })()
                    }`}>
                    <p className="lead-stat-label text-xs text-gray-400 dark:text-gray-500">Key Event</p>
                    <div className="lead-stat-content mt-auto">
                      {(() => {
                        const bookingDate = currentLead.booking_date ||
                          currentLead.unified_context?.web?.booking_date ||
                          currentLead.unified_context?.web?.booking?.date ||
                          currentLead.unified_context?.whatsapp?.booking_date ||
                          currentLead.unified_context?.whatsapp?.booking?.date ||
                          currentLead.unified_context?.voice?.booking_date ||
                          currentLead.unified_context?.voice?.booking?.date ||
                          currentLead.unified_context?.social?.booking_date ||
                          currentLead.unified_context?.social?.booking?.date;
                        const bookingTime = currentLead.booking_time ||
                          currentLead.unified_context?.web?.booking_time ||
                          currentLead.unified_context?.web?.booking?.time ||
                          currentLead.unified_context?.whatsapp?.booking_time ||
                          currentLead.unified_context?.whatsapp?.booking?.time ||
                          currentLead.unified_context?.voice?.booking_time ||
                          currentLead.unified_context?.voice?.booking?.time ||
                          currentLead.unified_context?.social?.booking_time ||
                          currentLead.unified_context?.social?.booking?.time;

                        if (bookingDate && bookingTime) {
                          const formattedDate = formatBookingDateShort(bookingDate);
                          const formattedTime = formatBookingTime(bookingTime);
                          return (
                            <a
                              href="/dashboard/bookings"
                              className="lead-booking-link flex flex-col cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={(e) => {
                                e.stopPropagation();
                                // Optionally navigate to calendar with date filter
                              }}
                              aria-label={`View booking on ${formattedDate} at ${formattedTime}`}
                            >
                              <div className="lead-booking-date flex items-center gap-1">
                                <MdEvent className="text-blue-600 dark:text-blue-400 flex-shrink-0" size={16} aria-hidden="true" />
                                <time className="text-lg font-bold text-blue-700 dark:text-blue-300" dateTime={bookingDate}>
                                  {formattedDate}
                                </time>
                              </div>
                              <time className="lead-booking-time text-xs font-medium text-blue-600 dark:text-blue-400 mt-0.5" dateTime={bookingTime}>
                                {formattedTime}
                              </time>
                            </a>
                          );
                        }
                        return (
                          <p className="lead-stat-empty text-2xl font-bold text-gray-500 dark:text-gray-400" aria-label="No key event">-</p>
                        );
                      })()}
                    </div>
                  </article>
                </div>
              </section>
            </section>

            {/* Close Button - Absolute positioned top right */}
            <button
              onClick={onClose}
              className="lead-modal-close-button absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              aria-label="Close lead details modal"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Stage Dropdown */}
            {showStageDropdown && stageButtonRef.current && (
              <>
                <div
                  className="lead-stage-dropdown-backdrop fixed inset-0 z-[60]"
                  onClick={() => setShowStageDropdown(false)}
                  aria-hidden="true"
                />
                <menu
                  className="lead-stage-dropdown fixed z-[70] bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#262626] rounded-lg shadow-xl p-2 w-[220px]"
                  style={{
                    top: `${stageButtonRef.current.getBoundingClientRect().bottom + 8}px`,
                    left: `${Math.max(8, stageButtonRef.current.getBoundingClientRect().right - 220)}px`,
                  }}
                  role="menu"
                  aria-label="Select lead stage"
                >
                  {['New', 'Engaged', 'Qualified', 'High Intent', 'Booking Made', 'Converted', 'Closed Lost', 'In Sequence', 'Cold'].map((stage) => (
                    <li key={stage} role="none">
                      <button
                        onClick={() => handleStageChange(stage as LeadStage)}
                        className={`lead-stage-option w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${currentStage === stage
                          ? getStageBadgeClass(stage) + ' font-semibold'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                          }`}
                        style={currentStage === stage && stage === 'In Sequence' ? {
                          backgroundColor: 'var(--accent-subtle)',
                          color: 'var(--accent-primary)'
                        } : undefined}
                        role="menuitem"
                        aria-label={`Change stage to ${stage}`}
                      >
                        {stage}
                      </button>
                    </li>
                  ))}
                </menu>
              </>
            )}
          </header>

          {/* TABS */}
          <nav className="lead-modal-tabs lead-details-modal-tabs flex border-b border-gray-200 dark:border-[#262626] flex-shrink-0" role="tablist" aria-label="Lead details sections">
            <button
              onClick={() => setActiveTab('activity')}
              className={`lead-modal-tab lead-details-modal-tab lead-details-modal-tab-activity px-4 py-1.5 text-sm font-medium transition-colors border-b-2 ${activeTab === 'activity'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              role="tab"
              aria-selected={activeTab === 'activity'}
              aria-controls="lead-tabpanel-activity"
              id="lead-tab-activity"
            >
              Activity
            </button>
            <button
              onClick={() => setActiveTab('summary')}
              className={`lead-modal-tab lead-details-modal-tab lead-details-modal-tab-summary px-4 py-1.5 text-sm font-medium transition-colors border-b-2 ${activeTab === 'summary'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              role="tab"
              aria-selected={activeTab === 'summary'}
              aria-controls="lead-tabpanel-summary"
              id="lead-tab-summary"
            >
              Summary
            </button>
            <button
              onClick={() => setActiveTab('breakdown')}
              className={`lead-modal-tab lead-details-modal-tab lead-details-modal-tab-breakdown px-4 py-1.5 text-sm font-medium transition-colors border-b-2 ${activeTab === 'breakdown'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              role="tab"
              aria-selected={activeTab === 'breakdown'}
              aria-controls="lead-tabpanel-breakdown"
              id="lead-tab-breakdown"
            >
              Score Breakdown
            </button>
            <button
              onClick={() => setActiveTab('interaction')}
              className={`lead-modal-tab lead-details-modal-tab lead-details-modal-tab-interaction px-4 py-1.5 text-sm font-medium transition-colors border-b-2 ${activeTab === 'interaction'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              role="tab"
              aria-selected={activeTab === 'interaction'}
              aria-controls="lead-tabpanel-interaction"
              id="lead-tab-interaction"
            >
              30-Day Interaction
            </button>
          </nav>

          {/* TAB CONTENT - Scrollable */}
          <main className="lead-modal-content lead-details-modal-tab-content overflow-y-auto flex-1 min-h-0">
            {/* Activity Tab - 70% width with improved message display */}
            {activeTab === 'activity' && (
              <section
                id="lead-tabpanel-activity"
                role="tabpanel"
                aria-labelledby="lead-tab-activity"
                className="lead-tabpanel-activity px-4 pt-4 pb-2"
                style={{ width: '70%', maxWidth: '840px' }}
              >
                {loadingActivities ? (
                  <div className="lead-activity-loading text-sm text-center py-8 text-gray-500 dark:text-gray-400" aria-live="polite">
                    <div className="animate-pulse">Loading activities...</div>
                  </div>
                ) : activities.length === 0 ? (
                  <div className="lead-activity-empty text-sm text-center py-8 text-gray-500 dark:text-gray-400">
                    No activities yet
                  </div>
                ) : (
                  <ol className="lead-activity-list space-y-4" aria-label="Lead activity timeline">
                    {activities.map((activity, index) => {
                      const getActivityIcon = () => {
                        if (activity.type === 'proxe') {
                          return <MdSmartToy size={18} />
                        } else if (activity.type === 'customer') {
                          return <MdPerson size={18} />
                        } else if (activity.type === 'team') {
                          switch (activity.icon) {
                            case 'call': return <MdCall size={18} />
                            case 'meeting': return <MdEvent size={18} />
                            case 'message': return <MdMessage size={18} />
                            case 'note': return <MdNote size={18} />
                            default: return <MdHistory size={18} />
                          }
                        } else {
                          return activity.icon === 'booking' ? <MdEvent size={18} /> : <MdMessage size={18} />
                        }
                      }
                      const color = activity.color || '#6B7280'
                      const Icon = getActivityIcon()
                      const isCustomer = activity.type === 'customer'
                      const isProxe = activity.type === 'proxe'

                      return (
                        <li key={activity.id} className={`lead-activity-item flex gap-3 ${isCustomer ? 'flex-row-reverse' : ''}`}>
                          <div className="lead-activity-timeline flex flex-col items-center flex-shrink-0">
                            <div
                              className="lead-activity-icon w-10 h-10 rounded-full flex items-center justify-center text-white shadow-sm transition-transform hover:scale-105"
                              style={{ backgroundColor: color }}
                              aria-hidden="true"
                            >
                              {Icon}
                            </div>
                            {index < activities.length - 1 && (
                              <div
                                className="lead-activity-connector w-0.5 flex-1 mt-2"
                                style={{ backgroundColor: color, opacity: 0.3 }}
                                aria-hidden="true"
                              />
                            )}
                          </div>
                          <article className={`lead-activity-content flex-1 pb-2 min-w-0 ${isCustomer ? 'text-right' : 'text-left'}`}>
                            {/* Message bubble for customer/PROXe messages */}
                            {activity.content && (isCustomer || isProxe) ? (
                              <div
                                className={`lead-activity-message rounded-2xl px-4 py-3 mb-2 shadow-sm ${isCustomer
                                  ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/30'
                                  : 'bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30'
                                  }`}
                                style={{
                                  maxWidth: '85%',
                                  marginLeft: isCustomer ? 'auto' : '0',
                                  marginRight: isCustomer ? '0' : 'auto'
                                }}
                              >
                                <p className={`text-sm leading-relaxed ${isCustomer ? 'text-emerald-900 dark:text-emerald-50' : 'text-blue-900 dark:text-blue-50'}`}>
                                  {renderMarkdown(activity.content)}
                                </p>
                              </div>
                            ) : activity.content ? (
                              <p className="text-sm font-medium text-gray-900 dark:text-white mb-2 leading-relaxed">
                                {renderMarkdown(activity.content)}
                              </p>
                            ) : null}

                            <div className={`lead-activity-header flex items-start justify-between gap-2 mb-1 ${isCustomer ? 'flex-row-reverse' : ''}`}>
                              <div className={`lead-activity-meta flex items-center gap-2 flex-1 min-w-0 ${isCustomer ? 'flex-row-reverse' : ''}`}>
                                <h4 className="lead-activity-action text-sm font-semibold text-gray-900 dark:text-white">
                                  {activity.action || 'Activity'}
                                </h4>
                                {activity.channel && (
                                  <span
                                    className="lead-activity-channel text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex-shrink-0"
                                    style={{
                                      backgroundColor: `${color}15`,
                                      color: color
                                    }}
                                    aria-label={`Channel: ${activity.channel}`}
                                  >
                                    {activity.channel}
                                  </span>
                                )}
                              </div>
                              <time className="lead-activity-time text-[10px] uppercase font-medium whitespace-nowrap text-gray-400 dark:text-gray-500 flex-shrink-0" dateTime={activity.timestamp}>
                                {formatDateTimeIST(activity.timestamp)}
                              </time>
                            </div>
                            <p className="lead-activity-actor text-xs mt-0.5 font-medium" style={{ color }}>
                              {activity.actor || 'Unknown'}
                            </p>
                          </article>
                        </li>
                      )
                    })}
                  </ol>
                )}
              </section>
            )}

            {/* Other Tabs - Full Width */}
            {activeTab !== 'activity' && (
              <div className="lead-tabpanel-container px-4 pt-4 pb-2">
                {/* Summary Tab */}
                {activeTab === 'summary' && (
                  <section
                    id="lead-tabpanel-summary"
                    role="tabpanel"
                    aria-labelledby="lead-tab-summary"
                    className="lead-tabpanel-summary space-y-6"
                  >
                    <article className="lead-summary-card p-4 rounded-xl border border-blue-200/50 dark:border-blue-800/30 bg-blue-50/30 dark:bg-blue-900/10 shadow-sm relative overflow-hidden">
                      {/* Decorative background element */}
                      <div className="absolute top-0 right-0 p-8 opacity-5">
                        <MdAutoAwesome size={120} />
                      </div>

                      <h3 className="lead-summary-title text-base font-bold mb-4 flex items-center gap-2 text-blue-900 dark:text-blue-100 relative">
                        <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400">
                          <MdAutoAwesome size={18} />
                        </div>
                        Executive Summary
                        {loadingSummary && (
                          <div className="flex gap-1 ml-auto">
                            <span className="w-1 h-1 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.3s]"></span>
                            <span className="w-1 h-1 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.15s]"></span>
                            <span className="w-1 h-1 rounded-full bg-blue-400 animate-bounce"></span>
                          </div>
                        )}
                      </h3>

                      {loadingSummary ? (
                        <div className="lead-summary-loading-state space-y-3 py-2">
                          <div className="h-2.5 bg-blue-200/50 dark:bg-blue-800/20 rounded-full w-3/4 animate-pulse"></div>
                          <div className="h-2.5 bg-blue-200/50 dark:bg-blue-800/20 rounded-full w-full animate-pulse"></div>
                          <div className="h-2.5 bg-blue-200/50 dark:bg-blue-800/20 rounded-full w-2/3 animate-pulse"></div>
                        </div>
                      ) : (
                        <div className="lead-summary-content relative">
                          <div className="lead-summary-text text-sm leading-relaxed text-gray-700 dark:text-gray-300 mb-6">
                            {unifiedSummary || 'No summary available. Analysis will update on the next interaction.'}
                          </div>
                          {summaryAttribution && (
                            <footer className="lead-summary-attribution text-[10px] pt-3 border-t border-blue-100 dark:border-blue-800/50 text-gray-500 dark:text-gray-400 font-medium italic">
                              Summarized {summaryAttribution}
                            </footer>
                          )}
                        </div>
                      )}
                    </article>

                    {/* Compact Intelligence Insights - Inline to save scroll space */}
                    <article className="lead-intelligence-insights p-4 rounded-xl bg-gray-50/30 dark:bg-gray-800/20 border border-gray-100 dark:border-gray-800/50 shadow-sm">
                      <div className="flex flex-col gap-6">
                        {/* Buying Signals Group */}
                        {summaryData && summaryData.keyInfo && (summaryData.keyInfo.budget || summaryData.keyInfo.serviceInterest || summaryData.keyInfo.painPoints) && (
                          <div className="space-y-3">
                            <h4 className="flex items-center gap-2 text-[9px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-[0.2em]">
                              <MdTrendingUp size={12} />
                              Buying Signals
                            </h4>
                            <div className="flex flex-wrap gap-x-8 gap-y-3">
                              {summaryData.keyInfo.budget && (
                                <div className="flex items-center gap-2 group">
                                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-all">
                                    <MdAccountBalanceWallet size={14} />
                                  </div>
                                  <div>
                                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-tight">Budget</p>
                                    <p className="text-xs font-semibold text-gray-900 dark:text-gray-200">{summaryData.keyInfo.budget}</p>
                                  </div>
                                </div>
                              )}
                              {summaryData.keyInfo.serviceInterest && (
                                <div className="flex items-center gap-2 group">
                                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-all">
                                    <MdOutlineInsights size={14} />
                                  </div>
                                  <div>
                                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-tight">Interest</p>
                                    <p className="text-xs font-semibold text-gray-900 dark:text-gray-200">{summaryData.keyInfo.serviceInterest}</p>
                                  </div>
                                </div>
                              )}
                              {summaryData.keyInfo.painPoints && (
                                <div className="flex items-center gap-2 group">
                                  <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-600 dark:text-red-400 group-hover:bg-red-500 group-hover:text-white transition-all">
                                    <MdReportProblem size={14} />
                                  </div>
                                  <div>
                                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-tight">Pain Point</p>
                                    <p className="text-xs font-semibold text-gray-900 dark:text-gray-200 max-w-[200px] truncate">{summaryData.keyInfo.painPoints}</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Divider Line */}
                        {(summaryData?.keyInfo?.budget || summaryData?.keyInfo?.serviceInterest) && currentLead.unified_context?.master && (
                          <div className="h-px bg-gray-100 dark:bg-gray-800 w-full" />
                        )}

                        {/* Lead Profile Group */}
                        {(() => {
                          const masterData = currentLead.unified_context?.master || {};
                          const hasData = Object.keys(masterData).length > 0;
                          if (!hasData) return null;

                          return (
                            <div className="space-y-3">
                              <h4 className="flex items-center gap-2 text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">
                                <MdPersonOutline size={12} />
                                Lead Profile
                              </h4>
                              <div className="flex flex-wrap gap-x-8 gap-y-3">
                                {masterData.user_type && (
                                  <div className="flex items-center gap-2 group">
                                    <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800/50 flex items-center justify-center text-gray-500 dark:text-gray-400 group-hover:bg-amber-500 group-hover:text-white transition-all">
                                      <MdPerson size={14} />
                                    </div>
                                    <div>
                                      <p className="text-[9px] font-medium text-gray-500 uppercase tracking-tight">Type</p>
                                      <p className="text-xs font-semibold text-gray-900 dark:text-gray-200 capitalize">{masterData.user_type}</p>
                                    </div>
                                  </div>
                                )}
                                {masterData.course_interest && (
                                  <div className="flex items-center gap-2 group">
                                    <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800/50 flex items-center justify-center text-gray-500 dark:text-gray-400 group-hover:bg-amber-500 group-hover:text-white transition-all">
                                      <MdFlightTakeoff size={14} />
                                    </div>
                                    <div>
                                      <p className="text-[9px] font-medium text-gray-500 uppercase tracking-tight">Course</p>
                                      <p className="text-xs font-semibold text-gray-900 dark:text-gray-200 capitalize">{masterData.course_interest}</p>
                                    </div>
                                  </div>
                                )}
                                {(masterData.plan_to_fly || masterData.timeline) && (
                                  <div className="flex items-center gap-2 group">
                                    <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800/50 flex items-center justify-center text-gray-500 dark:text-gray-400 group-hover:bg-amber-500 group-hover:text-white transition-all">
                                      <MdSchedule size={14} />
                                    </div>
                                    <div>
                                      <p className="text-[9px] font-medium text-gray-500 uppercase tracking-tight">Timeline</p>
                                      <p className="text-xs font-semibold text-gray-900 dark:text-gray-200">
                                        {(() => {
                                          const t = masterData.plan_to_fly || masterData.timeline;
                                          const map: any = { 'asap': 'ASAP', '1-3mo': '1-3m', '6+mo': '6m+', '1yr+': '1y+' };
                                          return map[t] || t;
                                        })()}
                                      </p>
                                    </div>
                                  </div>
                                )}
                                {masterData.education && (
                                  <div className="flex items-center gap-2 group">
                                    <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800/50 flex items-center justify-center text-gray-500 dark:text-gray-400 group-hover:bg-amber-500 group-hover:text-white transition-all">
                                      <MdSchool size={14} />
                                    </div>
                                    <div>
                                      <p className="text-[9px] font-medium text-gray-500 uppercase tracking-tight">Edu</p>
                                      <p className="text-xs font-semibold text-gray-900 dark:text-gray-200 capitalize">{masterData.education.replace('_', ' ')}</p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </article>
                  </section>
                )}

                {/* Score Breakdown Tab */}
                {activeTab === 'breakdown' && (
                  <section
                    id="lead-tabpanel-breakdown"
                    role="tabpanel"
                    aria-labelledby="lead-tab-breakdown"
                    className="lead-tabpanel-breakdown space-y-6"
                  >
                    {calculatedScore ? (
                      <div className="flex flex-col gap-6">
                        {/* Summary Score Card */}
                        <article className="lead-score-summary-card p-6 rounded-2xl bg-white dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 shadow-sm relative overflow-hidden">
                          <div className="flex flex-col md:flex-row items-center gap-8 relative z-10">
                            {/* Radial Progress */}
                            <div className="relative flex-shrink-0">
                              <svg className="w-32 h-32 transform -rotate-90">
                                <circle
                                  cx="64"
                                  cy="64"
                                  r="58"
                                  stroke="currentColor"
                                  strokeWidth="10"
                                  fill="transparent"
                                  className="text-gray-100 dark:text-gray-800"
                                />
                                <circle
                                  cx="64"
                                  cy="64"
                                  r="58"
                                  stroke="currentColor"
                                  strokeWidth="10"
                                  fill="transparent"
                                  strokeDasharray={2 * Math.PI * 58}
                                  strokeDashoffset={2 * Math.PI * 58 * (1 - calculatedScore.score / 100)}
                                  strokeLinecap="round"
                                  className="transition-all duration-1000 ease-out"
                                  style={{ color: healthColor.bg }}
                                />
                              </svg>
                              <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-3xl font-black text-gray-900 dark:text-white leading-tight">
                                  {calculatedScore.score}
                                </span>
                                <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                                  Health
                                </span>
                              </div>
                            </div>

                            {/* Score Breakdown Details */}
                            <div className="flex-1 space-y-6 w-full text-center md:text-left">
                              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div>
                                  <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center justify-center md:justify-start gap-2">
                                    Lead Health Assessment
                                    <span
                                      className="text-xs px-2 py-0.5 rounded-full font-bold"
                                      style={{ backgroundColor: `${healthColor.bg}15`, color: healthColor.bg }}
                                    >
                                      {healthColor.label}
                                    </span>
                                  </h3>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    Comprehensive intent analysis based on AI signals, activity patterns, and business fit.
                                  </p>
                                </div>
                                {healthTrend && (
                                  <div className="flex flex-col items-center md:items-end">
                                    <div className="flex items-center gap-1 font-bold" style={{ color: healthTrend.color }}>
                                      <healthTrend.icon size={16} />
                                      <span className="text-sm">{(score - (previousScore || 0)) > 0 ? '+' : ''}{score - (previousScore || 0)}</span>
                                    </div>
                                    <span className="text-[10px] uppercase tracking-tighter text-gray-400 font-bold">{healthTrend.label}</span>
                                  </div>
                                )}
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/10 border border-gray-100 dark:border-gray-800/50">
                                  <div className="flex items-center justify-center sm:justify-start gap-2 mb-2 text-blue-600 dark:text-blue-400">
                                    <MdPsychology size={14} />
                                    <span className="text-[10px] font-black uppercase tracking-wider">AI Signals</span>
                                  </div>
                                  <div className="flex items-end justify-between">
                                    <span className="text-xl font-bold text-gray-900 dark:text-white">{calculatedScore.breakdown.ai}<span className="text-xs text-gray-400 font-normal">/60</span></span>
                                    <div className="h-1 w-12 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(calculatedScore.breakdown.ai / 60) * 100}%` }}></div>
                                    </div>
                                  </div>
                                </div>

                                <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/10 border border-gray-100 dark:border-gray-800/50">
                                  <div className="flex items-center justify-center sm:justify-start gap-2 mb-2 text-emerald-600 dark:text-emerald-400">
                                    <MdFlashOn size={14} />
                                    <span className="text-[10px] font-black uppercase tracking-wider">Engagement</span>
                                  </div>
                                  <div className="flex items-end justify-between">
                                    <span className="text-xl font-bold text-gray-900 dark:text-white">{calculatedScore.breakdown.activity}<span className="text-xs text-gray-400 font-normal">/20</span></span>
                                    <div className="h-1 w-12 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(calculatedScore.breakdown.activity / 20) * 100}%` }}></div>
                                    </div>
                                  </div>
                                </div>

                                <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/10 border border-gray-100 dark:border-gray-800/50">
                                  <div className="flex items-center justify-center sm:justify-start gap-2 mb-2 text-amber-600 dark:text-amber-400">
                                    <MdBarChart size={14} />
                                    <span className="text-[10px] font-black uppercase tracking-wider">Business Fit</span>
                                  </div>
                                  <div className="flex items-end justify-between">
                                    <span className="text-xl font-bold text-gray-900 dark:text-white">{calculatedScore.breakdown.business}<span className="text-xs text-gray-400 font-normal">/20</span></span>
                                    <div className="h-1 w-12 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                      <div className="h-full bg-amber-500 rounded-full" style={{ width: `${(calculatedScore.breakdown.business / 20) * 100}%` }}></div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </article>

                        {/* Legend/Info Footer */}
                        <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/5 border border-gray-100 dark:border-gray-800 text-[10px] text-gray-500 flex items-center gap-3">
                          <MdInfo size={14} className="text-blue-500" />
                          <p>Scores are updated in real-time. High Health (&gt;90) indicates an immediate conversion opportunity. Moderate Health (70-89) requires nurturing. Low Health (&lt;70) is early stage engagement.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-4"></div>
                        <p className="text-sm">Analyzing intent markers...</p>
                      </div>
                    )}
                  </section>
                )}

                {/* Interaction Tab */}
                {activeTab === 'interaction' && (
                  <section
                    id="lead-tabpanel-interaction"
                    role="tabpanel"
                    aria-labelledby="lead-tab-interaction"
                    className="lead-tabpanel-interaction space-y-6"
                  >
                    {loading30Days ? (
                      <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-4"></div>
                        <p className="text-sm">Mapping interaction history...</p>
                      </div>
                    ) : interaction30Days ? (
                      <div className="space-y-6">
                        {/* Interaction Highlights */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                          <article className="p-4 rounded-xl bg-blue-50/30 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30">
                            <h4 className="flex items-center gap-2 text-[9px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-1">
                              <MdChat size={12} />
                              Total Engagement
                            </h4>
                            <p className="text-2xl font-black text-gray-900 dark:text-white leading-tight">
                              {interaction30Days.totalInteractions}
                            </p>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">In first 30 days</p>
                          </article>

                          <article className="p-4 rounded-xl bg-emerald-50/30 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800/30">
                            <h4 className="flex items-center gap-2 text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-1">
                              <MdCheckCircle size={12} />
                              Response Rate
                            </h4>
                            <p className="text-2xl font-black text-gray-900 dark:text-white leading-tight">
                              {quickStats.responseRate}%
                            </p>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">Agent acknowledgment</p>
                          </article>

                          <article className="p-4 rounded-xl bg-amber-50/30 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/30">
                            <h4 className="flex items-center gap-2 text-[9px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-1">
                              <MdSchedule size={12} />
                              Avg Resp Time
                            </h4>
                            <p className="text-2xl font-black text-gray-900 dark:text-white leading-tight">
                              {quickStats.avgResponseTime}m
                            </p>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">From initial outreach</p>
                          </article>

                          <article className="p-4 rounded-xl bg-purple-50/30 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-800/30">
                            <h4 className="flex items-center gap-2 text-[9px] font-black text-purple-600 dark:text-purple-400 uppercase tracking-widest mb-1">
                              <MdHistory size={12} />
                              Last Activity
                            </h4>
                            <p className="text-lg font-bold text-gray-900 dark:text-white leading-tight truncate">
                              {interaction30Days.lastTouchDay || '--'}
                            </p>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">Recency marker</p>
                          </article>
                        </div>

                        {/* 30-Day Activity Calendar - Heatmap Style */}
                        <article className="p-6 rounded-2xl bg-white dark:bg-gray-800/20 border border-gray-100 dark:border-gray-800 shadow-sm">
                          <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                            <MdEvent size={18} className="text-blue-500" />
                            Engagement Heatmap (First 30 Days)
                          </h3>
                          <div className="flex flex-col gap-2">
                            {/* Calendar Framework */}
                            <div className="grid grid-cols-7 gap-2">
                              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                                <div key={i} className="text-[10px] font-black text-gray-400 dark:text-gray-600 text-center uppercase">
                                  {day}
                                </div>
                              ))}

                              {(() => {
                                const days: any[] = [];
                                const firstTouch = new Date(lead?.created_at || lead?.timestamp || new Date());
                                firstTouch.setHours(0, 0, 0, 0);

                                // Padding for the first week
                                for (let i = 0; i < firstTouch.getDay(); i++) {
                                  days.push(<div key={`pad-${i}`} className="aspect-square" />);
                                }

                                // Fill 30 days
                                interaction30Days.dailyData.forEach((d, idx) => {
                                  const count = d.count;
                                  const opacity = count === 0 ? 0.05 :
                                    count === 1 ? 0.2 :
                                      count < 5 ? 0.4 :
                                        count < 10 ? 0.7 : 1;

                                  days.push(
                                    <div
                                      key={idx}
                                      className="aspect-square rounded-[20%] relative group transition-all"
                                      style={{ backgroundColor: count > 0 ? `rgba(59, 130, 246, ${opacity})` : 'rgba(156, 163, 175, 0.05)' }}
                                      title={`${d.date}: ${count} interactions`}
                                    >
                                      {count > 0 && <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-sm">{count}</span>}

                                      {/* Indicator for today/first day */}
                                      {idx === 0 && (
                                        <div className="absolute -top-1 -right-1 w-2 h-2 bg-amber-500 rounded-full border-2 border-white dark:border-gray-900" title="First Touchpoint" />
                                      )}
                                    </div>
                                  );
                                });
                                return days;
                              })()}
                            </div>
                            <div className="mt-4 flex items-center justify-end gap-2 text-[10px] text-gray-400 font-medium">
                              <span>Less</span>
                              <div className="flex gap-1">
                                <div className="w-3 h-3 rounded bg-blue-500 opacity-5" />
                                <div className="w-3 h-3 rounded bg-blue-500 opacity-20" />
                                <div className="w-3 h-3 rounded bg-blue-500 opacity-50" />
                                <div className="w-3 h-3 rounded bg-blue-500 opacity-100" />
                              </div>
                              <span>More</span>
                            </div>
                          </div>
                        </article>
                      </div>
                    ) : (
                      <div className="text-center py-12 text-gray-500 text-sm font-medium">No interaction data available.</div>
                    )}
                  </section>
                )}
              </div>
            )}
          </main>

          {/* Action Buttons */}
          <div className="lead-modal-footer px-4 py-4 sm:px-6 bg-gray-50 dark:bg-[#111111]/50 flex justify-between items-center border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push(`/dashboard/inbox?lead=${lead.id}`)}
                className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-[#1A1A1A] hover:bg-gray-50 dark:hover:bg-gray-800 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <MdChat className="mr-2 h-5 w-5" aria-hidden="true" />
                Open in Inbox
              </button>
            </div>
            <button
              type="button"
              className="inline-flex items-center px-6 py-2 border border-transparent text-sm font-bold rounded-lg shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all active:scale-95"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </dialog>
      </div>

      {/* Activity Logger Modal */}
      {showActivityModal && pendingStageChange && (
        <ActivityLoggerModal
          isOpen={showActivityModal}
          onClose={() => {
            setShowActivityModal(false)
            setPendingStageChange(null)
          }}
          onSave={handleActivitySave}
          leadName={currentLead.name || 'Lead'}
          stageChange={{
            oldStage: pendingStageChange.oldStage,
            newStage: pendingStageChange.newStage
          }}
        />
      )}
    </>
  );
}
