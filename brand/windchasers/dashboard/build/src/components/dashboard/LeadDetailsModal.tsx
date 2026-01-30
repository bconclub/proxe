'use client'

import { useState, useEffect, useRef } from 'react'
import { formatDateTime, formatDate } from '@/lib/utils'
import { createClient } from '../../lib/supabase/client'
import { format } from 'date-fns'
import { MdLanguage, MdChat, MdPhone, MdShare, MdAutoAwesome, MdOpenInNew, MdHistory, MdCall, MdEvent, MdMessage, MdNote, MdEdit, MdTrendingUp, MdTrendingDown, MdRemove, MdCheckCircle, MdSchedule, MdPsychology, MdFlashOn, MdBarChart, MdEmail, MdChevronRight } from 'react-icons/md'
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
                  <article className={`lead-stat-card lead-stat-key-event flex flex-col justify-between h-full p-3 min-h-[80px] rounded-lg border ${
                    (() => {
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
                        className={`lead-stage-option w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                          currentStage === stage
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
              className={`lead-modal-tab lead-details-modal-tab lead-details-modal-tab-activity px-4 py-1.5 text-sm font-medium transition-colors border-b-2 ${
                activeTab === 'activity'
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
              className={`lead-modal-tab lead-details-modal-tab lead-details-modal-tab-summary px-4 py-1.5 text-sm font-medium transition-colors border-b-2 ${
                activeTab === 'summary'
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
              className={`lead-modal-tab lead-details-modal-tab lead-details-modal-tab-breakdown px-4 py-1.5 text-sm font-medium transition-colors border-b-2 ${
                activeTab === 'breakdown'
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
              className={`lead-modal-tab lead-details-modal-tab lead-details-modal-tab-interaction px-4 py-1.5 text-sm font-medium transition-colors border-b-2 ${
                activeTab === 'interaction'
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
                          return activity.icon === 'sequence' ? <MdHistory size={18} /> : <MdMessage size={18} />
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
                        <li key={activity.id} className="lead-activity-item flex gap-3">
                          <div className="lead-activity-timeline flex flex-col items-center flex-shrink-0">
                            <div 
                              className="lead-activity-icon w-10 h-10 rounded-full flex items-center justify-center text-white shadow-sm" 
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
                          <article className="lead-activity-content flex-1 pb-2 min-w-0">
                            {/* Message bubble for customer/PROXe messages */}
                            {activity.content && (isCustomer || isProxe) ? (
                              <div 
                                className={`lead-activity-message rounded-2xl px-4 py-3 mb-2 ${
                                  isCustomer 
                                    ? 'bg-gray-100 dark:bg-gray-800 ml-auto' 
                                    : 'bg-blue-50 dark:bg-blue-900/20'
                                }`}
                                style={{ 
                                  maxWidth: '95%',
                                  marginLeft: isCustomer ? 'auto' : '0'
                                }}
                              >
                                <p className="text-sm text-gray-900 dark:text-white leading-relaxed">
                                  {activity.content}
                                </p>
                              </div>
                            ) : activity.content ? (
                              <p className="lead-activity-text text-sm mt-1 text-gray-700 dark:text-gray-300 leading-relaxed">
                                {activity.content}
                              </p>
                            ) : null}
                            
                            <div className="lead-activity-header flex items-start justify-between gap-2 mb-1">
                              <div className="lead-activity-meta flex items-center gap-2 flex-1 min-w-0">
                                <h4 className="lead-activity-action text-sm font-medium text-gray-900 dark:text-white">
                                  {activity.action || 'Activity'}
                                </h4>
                                {activity.channel && (
                                  <span 
                                    className="lead-activity-channel text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                                    style={{ 
                                      backgroundColor: `${color}20`,
                                      color: color
                                    }}
                                    aria-label={`Channel: ${activity.channel}`}
                                  >
                                    {activity.channel}
                                  </span>
                                )}
                              </div>
                              <time className="lead-activity-time text-xs whitespace-nowrap text-gray-500 dark:text-gray-400 flex-shrink-0" dateTime={activity.timestamp}>
                                {formatDateTimeIST(activity.timestamp)}
                              </time>
                            </div>
                            <p className="lead-activity-actor text-xs mt-0.5" style={{ color }}>
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
                    className="lead-tabpanel-summary space-y-4"
                  >
                    <article className="lead-summary-card p-4 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
                      <h3 className="lead-summary-title text-sm font-semibold mb-3 flex items-center gap-2 text-gray-900 dark:text-white">
                        <MdAutoAwesome size={16} className="text-blue-500" aria-hidden="true" />
                        Unified Summary
                        {loadingSummary && (
                          <span className="lead-summary-loading text-xs ml-2 text-gray-500 dark:text-gray-400" aria-live="polite">Generating...</span>
                        )}
                      </h3>
                      {loadingSummary ? (
                        <div className="lead-summary-loading-state text-sm text-gray-500 dark:text-gray-400" aria-live="polite">
                          <div className="animate-pulse">Loading summary...</div>
                        </div>
                      ) : (
                        <div className="lead-summary-content">
                          <p className="lead-summary-text text-sm leading-relaxed mb-3 text-gray-700 dark:text-gray-300">
                            {unifiedSummary || 'No summary available. Summary will be generated on next page load.'}
                          </p>
                          {summaryAttribution && (
                            <footer className="lead-summary-attribution text-xs pt-3 border-t border-blue-200 dark:border-blue-800 text-gray-500 dark:text-gray-400">
                              {summaryAttribution}
                            </footer>
                          )}
                        </div>
                      )}
                    </article>

                    {summaryData && (
                      <section className="lead-buying-signals space-y-3">
                        {summaryData.keyInfo && (summaryData.keyInfo.budget || summaryData.keyInfo.serviceInterest || summaryData.keyInfo.painPoints) && (
                          <article className="lead-buying-signals-card p-3 rounded-lg bg-gray-50 dark:bg-[#1F1F1F]">
                            <h4 className="lead-buying-signals-title text-xs font-semibold mb-2 text-gray-900 dark:text-white">Buying Signals</h4>
                            <dl className="lead-buying-signals-list space-y-1">
                              {summaryData.keyInfo.budget && (
                                <div className="lead-buying-signal-item">
                                  <dt className="font-medium inline">Budget:</dt>
                                  <dd className="inline text-xs text-gray-600 dark:text-gray-400"> {summaryData.keyInfo.budget}</dd>
                                </div>
                              )}
                              {summaryData.keyInfo.serviceInterest && (
                                <div className="lead-buying-signal-item">
                                  <dt className="font-medium inline">Interest:</dt>
                                  <dd className="inline text-xs text-gray-600 dark:text-gray-400"> {summaryData.keyInfo.serviceInterest}</dd>
                                </div>
                              )}
                              {summaryData.keyInfo.painPoints && (
                                <div className="lead-buying-signal-item">
                                  <dt className="font-medium inline">Pain Points:</dt>
                                  <dd className="inline text-xs text-gray-600 dark:text-gray-400"> {summaryData.keyInfo.painPoints}</dd>
                                </div>
                              )}
                            </dl>
                          </article>
                        )}
                      </section>
                    )}
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
                      <>
                        {/* 3 Cards in Row */}
                        <div className="lead-score-breakdown-grid grid grid-cols-1 md:grid-cols-3 gap-4">
                          {/* Card 1 - AI Analysis (60%) */}
                          <article className="lead-score-card lead-score-ai p-4 rounded-lg bg-white dark:bg-[#1A1A1A]">
                            <div className="lead-score-card-header flex items-center gap-2 mb-3">
                              <MdPsychology size={24} className="text-blue-500 dark:text-blue-400" aria-hidden="true" />
                              <h3 className="lead-score-card-title text-sm font-semibold text-gray-900 dark:text-white">AI Analysis</h3>
                            </div>
                            <div className="lead-score-card-value mb-2">
                              <p className="text-3xl font-bold text-gray-900 dark:text-white" aria-label={`AI Analysis score: ${calculatedScore.breakdown.ai} out of 60`}>
                                {calculatedScore.breakdown.ai}/60
                              </p>
                              <p className="lead-score-card-percentage text-sm font-medium text-blue-600 dark:text-blue-400">
                                {Math.round((calculatedScore.breakdown.ai / 60) * 100)}%
                              </p>
                            </div>
                            <ul className="lead-score-card-tags flex flex-wrap gap-1.5 mt-4" aria-label="AI Analysis factors">
                              <li><span className="px-2 py-1 text-xs rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">Intent</span></li>
                              <li><span className="px-2 py-1 text-xs rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">Sentiment</span></li>
                              <li><span className="px-2 py-1 text-xs rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">Buying</span></li>
                            </ul>
                          </article>

                          {/* Card 2 - Activity (30%) */}
                          <article className="lead-score-card lead-score-activity p-4 rounded-lg bg-white dark:bg-[#1A1A1A]">
                            <div className="lead-score-card-header flex items-center gap-2 mb-3">
                              <MdFlashOn size={24} className="text-green-500 dark:text-green-400" aria-hidden="true" />
                              <h3 className="lead-score-card-title text-sm font-semibold text-gray-900 dark:text-white">Activity</h3>
                            </div>
                            <div className="lead-score-card-value mb-2">
                              <p className="text-3xl font-bold text-gray-900 dark:text-white" aria-label={`Activity score: ${calculatedScore.breakdown.activity} out of 30`}>
                                {calculatedScore.breakdown.activity}/30
                              </p>
                              <p className="lead-score-card-percentage text-sm font-medium text-green-600 dark:text-green-400">
                                {Math.round((calculatedScore.breakdown.activity / 30) * 100)}%
                              </p>
                            </div>
                            <ul className="lead-score-card-tags flex flex-wrap gap-1.5 mt-4" aria-label="Activity factors">
                              <li><span className="px-2 py-1 text-xs rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">Messages</span></li>
                              <li><span className="px-2 py-1 text-xs rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">Response Rate</span></li>
                              <li><span className="px-2 py-1 text-xs rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">Recency</span></li>
                              <li><span className="px-2 py-1 text-xs rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">Channels</span></li>
                            </ul>
                          </article>

                          {/* Card 3 - Business Signals (10%) */}
                          <article className="lead-score-card lead-score-business p-4 rounded-lg bg-white dark:bg-[#1A1A1A]">
                            <div className="lead-score-card-header flex items-center gap-2 mb-3">
                              <MdBarChart size={24} className="text-purple-500 dark:text-purple-400" aria-hidden="true" />
                              <h3 className="lead-score-card-title text-sm font-semibold text-gray-900 dark:text-white">Business Signals</h3>
                            </div>
                            <div className="lead-score-card-value mb-2">
                              <p className="text-3xl font-bold text-gray-900 dark:text-white" aria-label={`Business Signals score: ${calculatedScore.breakdown.business} out of 10`}>
                                {calculatedScore.breakdown.business}/10
                              </p>
                              <p className="lead-score-card-percentage text-sm font-medium text-purple-600 dark:text-purple-400">
                                {Math.round((calculatedScore.breakdown.business / 10) * 100)}%
                              </p>
                            </div>
                            <ul className="lead-score-card-tags flex flex-wrap gap-1.5 mt-4" aria-label="Business Signals factors">
                              <li><span className="px-2 py-1 text-xs rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">Booking</span></li>
                              <li><span className="px-2 py-1 text-xs rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">Contact Info</span></li>
                              <li><span className="px-2 py-1 text-xs rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">Multi-channel</span></li>
                            </ul>
                          </article>
                        </div>

                        {/* Total Score Card - Large with Radial */}
                        <article className="lead-total-score-card p-6 rounded-lg" style={{ backgroundColor: healthColor.bg, color: healthColor.text }}>
                          <div className="lead-total-score-content flex items-center justify-between">
                            <div className="lead-total-score-info">
                              <h3 className="lead-total-score-title text-sm font-semibold mb-2" style={{ color: healthColor.text }}>Total Score</h3>
                              <p className="lead-total-score-value text-5xl font-bold" style={{ color: healthColor.text }} aria-label={`Total lead score: ${calculatedScore.score} out of 100`}>
                                {calculatedScore.score}/100
                              </p>
                              <p className="lead-total-score-percentage text-sm mt-1 opacity-90" style={{ color: healthColor.text }}>
                                {Math.round((calculatedScore.score / 100) * 100)}% complete
                              </p>
                            </div>
                            {/* Radial Progress Circle */}
                            <div className="lead-score-radial relative w-24 h-24 flex-shrink-0" aria-hidden="true">
                              <svg className="transform -rotate-90 w-24 h-24" viewBox="0 0 100 100">
                                <circle
                                  cx="50"
                                  cy="50"
                                  r="42"
                                  stroke="currentColor"
                                  strokeWidth="8"
                                  fill="none"
                                  className="text-gray-200 dark:text-gray-700"
                                />
                                <circle
                                  cx="50"
                                  cy="50"
                                  r="42"
                                  stroke="currentColor"
                                  strokeWidth="8"
                                  fill="none"
                                  strokeDasharray={`${2 * Math.PI * 42}`}
                                  strokeDashoffset={`${2 * Math.PI * 42 * (1 - calculatedScore.score / 100)}`}
                                  style={{ color: healthColor.text }}
                                  className="transition-all duration-500"
                                  strokeLinecap="round"
                                />
                              </svg>
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-xl font-bold text-gray-900 dark:text-white">
                                  {Math.round((calculatedScore.score / 100) * 100)}%
                                </span>
                              </div>
                            </div>
                          </div>
                        </article>

                        {/* Info Footer */}
                        <footer className="lead-score-info-footer p-4 rounded-lg bg-gray-50 dark:bg-[#1F1F1F]">
                          <p className="lead-score-info-text text-xs text-gray-500 dark:text-gray-400">
                            Score is calculated live based on engagement, intent signals, and activity patterns. Updates automatically when the modal opens or when activities change.
                          </p>
                        </footer>
                      </>
                    ) : (
                      <div className="lead-score-loading text-sm text-center py-8 text-gray-500 dark:text-gray-400" aria-live="polite">
                        <div className="animate-pulse">Calculating score breakdown...</div>
                      </div>
                    )}
                  </section>
                )}

                {/* 30-Day Interaction Tab (from first touchpoint) */}
                {activeTab === 'interaction' && (
                  <section 
                    id="lead-tabpanel-interaction"
                    role="tabpanel"
                    aria-labelledby="lead-tab-interaction"
                    className="lead-tabpanel-interaction space-y-4"
                  >
                    {loading30Days ? (
                      <div className="lead-interaction-loading text-sm text-center py-8 text-gray-500 dark:text-gray-400" aria-live="polite">
                        <div className="animate-pulse">Loading interaction data...</div>
                      </div>
                    ) : interaction30Days ? (
                      <div className="lead-interaction-grid grid grid-cols-2 gap-6">
                        {/* Left Column - Stats */}
                        <section className="lead-interaction-stats space-y-6">
                          {/* Total Interactions */}
                          <article className="lead-interaction-total">
                            <p className="lead-interaction-total-value text-4xl font-bold text-gray-900 dark:text-white" aria-label={`${interaction30Days.totalInteractions} total interactions in first 30 days`}>
                              {interaction30Days.totalInteractions}
                            </p>
                            <p className="lead-interaction-total-label text-xs text-gray-500 dark:text-gray-400 mt-1">Total interactions (first 30 days)</p>
                          </article>

                          {/* Last Touch Day */}
                          <article className="lead-interaction-last-touch p-4 bg-gray-50 dark:bg-[#1F1F1F] rounded-lg">
                            <p className="lead-interaction-last-touch-label text-xs text-gray-500 dark:text-gray-400 mb-1">Last Touch Day</p>
                            <p className="lead-interaction-last-touch-value text-lg font-semibold text-gray-900 dark:text-white">
                              {interaction30Days.lastTouchDay || 'No interactions yet'}
                            </p>
                          </article>
                        </section>

                        {/* Right Column - Calendar */}
                        <section className="lead-interaction-calendar w-full" aria-label="30-day interaction calendar">
                      {(() => {
                        // Get first touchpoint date
                        const firstTouchpoint = new Date(lead?.created_at || lead?.timestamp || new Date())
                        firstTouchpoint.setHours(0, 0, 0, 0)
                        
                        // Build a map of date -> count for quick lookup
                        const dateCountMap = new Map<string, number>()
                        interaction30Days.dailyData.forEach(d => {
                          dateCountMap.set(d.date, d.count)
                        })
                        
                        // Generate all 30 days starting from first touchpoint
                        const allDays: Array<{ date: Date; dateStr: string; count: number; dayOfWeek: number }> = []
                        for (let i = 0; i < 30; i++) {
                          const date = new Date(firstTouchpoint)
                          date.setDate(date.getDate() + i)
                          const dateStr = date.toISOString().split('T')[0]
                          const count = dateCountMap.get(dateStr) || 0
                          allDays.push({ date, dateStr, count, dayOfWeek: date.getDay() })
                        }
                        
                        // Day names (Sunday = 0, Monday = 1, etc.)
                        const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
                        
                        // Get the day of week for the first touchpoint (0 = Sunday, 1 = Monday, etc.)
                        const firstDayOfWeek = firstTouchpoint.getDay()
                        
                        // Calculate number of weeks needed (30 days + empty cells at start)
                        const totalCells = firstDayOfWeek + 30
                        const numWeeks = Math.ceil(totalCells / 7)
                        
                        // Group days into weeks (each week has 7 days, starting from Sunday)
                        const weeks: Array<Array<{ date: Date; dateStr: string; count: number; dayOfWeek: number } | null>> = []
                        for (let weekIndex = 0; weekIndex < numWeeks; weekIndex++) {
                          const weekDays: Array<{ date: Date; dateStr: string; count: number; dayOfWeek: number } | null> = []
                          
                          // For each day of week (Sunday to Saturday = 0 to 6)
                          for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
                            // Calculate the absolute day index
                            const absoluteDayIndex = weekIndex * 7 + dayOfWeek - firstDayOfWeek
                            
                            if (absoluteDayIndex >= 0 && absoluteDayIndex < 30) {
                              weekDays.push(allDays[absoluteDayIndex])
                            } else {
                              weekDays.push(null)
                            }
                          }
                          weeks.push(weekDays)
                        }
                        
                        return (
                          <div className="lead-calendar-container flex flex-col gap-1">
                            {/* Day labels row at top */}
                            <div className="lead-calendar-header grid grid-cols-7 gap-3 mb-2" role="row">
                              {dayNames.map((dayName, index) => (
                                <div key={index} className="lead-calendar-day-label text-center text-xs text-gray-500 dark:text-gray-400 font-medium" role="columnheader">
                                  {dayName}
                                </div>
                              ))}
                            </div>
                            
                            {/* Week rows */}
                            <div className="lead-calendar-weeks flex flex-col gap-2">
                              {weeks.map((week, weekIndex) => (
                                <div key={weekIndex} className="lead-calendar-week grid grid-cols-7 gap-3" role="row">
                                  {week.map((day, dayIndex) => {
                                    if (!day) {
                                      // Empty cell (beyond 30 days)
                                      return (
                                        <div
                                          key={`${weekIndex}-${dayIndex}`}
                                          className="lead-calendar-empty-cell w-4 h-4 flex-shrink-0"
                                          aria-hidden="true"
                                        />
                                      )
                                    }
                                    
                                    // Color intensity mapping
                                    let opacity = 0.1
                                    let size = 16
                                    
                                    if (day.count === 0) {
                                      opacity = 0.08 // Barely visible
                                    } else if (day.count >= 1 && day.count <= 2) {
                                      opacity = 0.5 // Medium opacity
                                    } else if (day.count >= 3 && day.count <= 5) {
                                      opacity = 0.85 // Bright accent
                                    } else if (day.count > 5) {
                                      opacity = 1.0 // Full accent
                                    }
                                    
                                    // Format date for tooltip
                                    const dateStr = day.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                    
                                    return (
                                      <div
                                        key={day.dateStr}
                                        className="lead-calendar-day rounded cursor-pointer transition-all hover:scale-110 flex-shrink-0"
                                        style={{
                                          width: `${size}px`,
                                          height: `${size}px`,
                                          backgroundColor: 'var(--accent-primary)',
                                          opacity: opacity,
                                          minWidth: '16px',
                                          minHeight: '16px',
                                        }}
                                        title={`${dateStr}: ${day.count} message${day.count !== 1 ? 's' : ''}`}
                                        aria-label={`${dateStr}: ${day.count} message${day.count !== 1 ? 's' : ''}`}
                                        role="gridcell"
                                      />
                                    )
                                  })}
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })()}
                        </section>
                      </div>
                    ) : (
                      <div className="lead-interaction-empty text-sm text-center py-4 text-gray-500 dark:text-gray-400">
                        No interaction data available
                      </div>
                    )}
                  </section>
                )}
              </div>
            )}
          </main>
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
  )
}
