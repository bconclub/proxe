'use client'

import { useState, useEffect, useRef } from 'react'
import { formatDateTime, formatDate } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { MdLanguage, MdChat, MdPhone, MdShare, MdAutoAwesome, MdOpenInNew, MdHistory, MdCall, MdEvent, MdMessage, MdNote, MdEdit, MdTrendingUp, MdTrendingDown, MdRemove, MdCheckCircle, MdSchedule, MdPsychology, MdFlashOn, MdBarChart } from 'react-icons/md'
import { useRouter } from 'next/navigation'
import LeadStageSelector from './LeadStageSelector'
import ActivityLoggerModal from './ActivityLoggerModal'
import { LeadStage } from '@/types'

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
  const stageButtonRef = useRef<HTMLDivElement>(null)
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

  // Calculate Lead Score Breakdown
  const calculateLeadScore = async (leadData: Lead) => {
    try {
      const supabase = createClient()
      
      // Fetch messages for analysis
      const { data: messages } = await supabase
        .from('conversations')
        .select('content, sender, created_at, channel')
        .eq('lead_id', leadData.id)
        .order('created_at', { ascending: true })

      // Get conversation summaries from unified_context
      const unifiedContext = leadData.unified_context || {}
      const conversationSummary = 
        unifiedContext.unified_summary ||
        unifiedContext.web?.conversation_summary ||
        unifiedContext.whatsapp?.conversation_summary ||
        unifiedContext.voice?.conversation_summary ||
        unifiedContext.social?.conversation_summary ||
        ''
      
      // Combine all text for analysis
      const allText = [
        conversationSummary,
        ...(messages || []).map((m: any) => m.content || '').filter(Boolean)
      ].join(' ').toLowerCase()

      // ============================================
      // 1. AI Analysis (60% weight)
      // ============================================
      let aiScore = 0
      
      // Intent signals detection
      const intentKeywords = {
        pricing: ['price', 'cost', 'pricing', 'fee', 'charge', 'afford', 'budget', 'expensive', 'cheap', 'discount', 'offer'],
        booking: ['book', 'booking', 'schedule', 'appointment', 'reserve', 'available', 'slot', 'time', 'date'],
        urgency: ['urgent', 'asap', 'soon', 'immediately', 'quickly', 'fast', 'today', 'now', 'hurry', 'rushed']
      }
      
      let intentSignals = 0
      Object.values(intentKeywords).forEach(keywords => {
        const found = keywords.some(keyword => allText.includes(keyword))
        if (found) intentSignals++
      })
      // Intent signals: 0-3, normalize to 0-100
      const intentScore = Math.min(100, (intentSignals / 3) * 100)
      
      // Sentiment analysis (simple keyword-based)
      const positiveWords = ['good', 'great', 'excellent', 'perfect', 'love', 'amazing', 'wonderful', 'happy', 'satisfied', 'interested', 'yes', 'sure', 'definitely']
      const negativeWords = ['bad', 'terrible', 'worst', 'hate', 'disappointed', 'frustrated', 'angry', 'no', 'not', "don't", "won't", 'cancel']
      
      const positiveCount = positiveWords.filter(word => allText.includes(word)).length
      const negativeCount = negativeWords.filter(word => allText.includes(word)).length
      const sentimentScore = positiveCount > negativeCount 
        ? Math.min(100, 50 + (positiveCount * 10))
        : Math.max(0, 50 - (negativeCount * 10))
      
      // Buying signals detection
      const buyingSignals = [
        'when can', 'how much', 'what is the price', 'tell me about', 'i want', 'i need',
        'interested in', 'looking for', 'considering', 'deciding', 'compare', 'options'
      ]
      const buyingSignalCount = buyingSignals.filter(signal => allText.includes(signal)).length
      const buyingSignalScore = Math.min(100, buyingSignalCount * 20)
      
      // Combine AI scores (weighted average)
      aiScore = (intentScore * 0.4 + sentimentScore * 0.3 + buyingSignalScore * 0.3)
      
      // ============================================
      // 2. Activity (30% weight)
      // ============================================
      const messageCount = messages?.length || 0
      // Message count: normalize to 0-1 (100 messages = 1.0, capped at 1.0)
      const msgCountNormalized = Math.min(1.0, messageCount / 100)
      
      // Response rate (52% = good baseline)
      const customerMessages = messages?.filter((m: any) => m.sender === 'customer').length || 0
      const agentMessages = messages?.filter((m: any) => m.sender === 'agent').length || 0
      const responseRate = customerMessages > 0 
        ? (agentMessages / customerMessages) 
        : 0
      // Response rate is already 0-1 (e.g., 0.52 for 52%)
      
      // Recency score (days since last interaction)
      const lastInteraction = 
        leadData.last_interaction_at || 
        unifiedContext.whatsapp?.last_interaction ||
        unifiedContext.web?.last_interaction ||
        unifiedContext.voice?.last_interaction ||
        unifiedContext.social?.last_interaction ||
        leadData.timestamp
      
      const daysSinceLastInteraction = lastInteraction
        ? Math.floor((new Date().getTime() - new Date(lastInteraction).getTime()) / (1000 * 60 * 60 * 24))
        : 999
      
      // Recency: 0 days = 1.0, 7 days = 0.5, 30 days = 0 (normalize to 0-1)
      const recencyScore = Math.max(0, Math.min(1.0, 1.0 - (daysSinceLastInteraction / 30)))
      
      // Channel mix bonus (2+ channels = bonus) - add 0.1 to the average
      const activeChannels = new Set(messages?.map((m: any) => m.channel).filter(Boolean) || []).size
      const channelMixBonus = activeChannels >= 2 ? 0.1 : 0
      
      // Activity score: ((msg_count/100 + response_rate + recency_score) / 3) * 0.3
      // Then convert to 0-100 scale for display
      const activityScoreBase = ((msgCountNormalized + responseRate + recencyScore) / 3) + channelMixBonus
      const activityScore = Math.min(100, activityScoreBase * 100)
      
      // ============================================
      // 3. Business Signals (10% weight)
      // ============================================
      let businessScore = 0
      
      // Booking exists = +10 points
      const hasBooking = !!(leadData.booking_date || leadData.booking_time || 
        unifiedContext.web?.booking_date || unifiedContext.web?.booking?.date ||
        unifiedContext.whatsapp?.booking_date || unifiedContext.whatsapp?.booking?.date ||
        unifiedContext.voice?.booking_date || unifiedContext.voice?.booking?.date ||
        unifiedContext.social?.booking_date || unifiedContext.social?.booking?.date)
      if (hasBooking) businessScore += 10
      
      // Email/phone provided = +5 points
      if (leadData.email || leadData.phone) businessScore += 5
      
      // Multi-touchpoint = +5 points (2+ channels)
      if (activeChannels >= 2) businessScore += 5
      
      // Business score can be 0-20, but we need it to contribute 10% (0-10 points) to total
      // So we normalize: businessScore (0-20) -> (0-10) for the 10% weight
      const businessScoreNormalized = Math.min(10, businessScore)
      
      // ============================================
      // Calculate Total Score
      // ============================================
      const totalScore = Math.min(100, 
        (aiScore * 0.6) + 
        (activityScore * 0.3) + 
        businessScoreNormalized
      )
      
      return {
        score: Math.round(totalScore),
        breakdown: {
          ai: Math.round(aiScore * 0.6), // Already weighted (0-60)
          activity: Math.round(activityScore * 0.3), // Already weighted (0-30)
          business: Math.round(businessScoreNormalized), // Already normalized to 0-10 for 10% weight
        }
      }
    } catch (error) {
      console.error('Error calculating lead score:', error)
      return {
        score: 0,
        breakdown: {
          ai: 0,
          activity: 0,
          business: 0
        }
      }
    }
  }

  // Calculate and set unified score
  const calculateAndSetScore = async () => {
    if (!lead) return
    const leadData = freshLeadData || lead
    const result = await calculateLeadScore(leadData)
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
        // Get booking from multiple sources (same logic as loadQuickStats)
        const unifiedContext = data.unified_context || lead.unified_context
        const bookingDate = 
          data.booking_date || 
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
          data.booking_time || 
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
          name: data.customer_name || lead.name,
          email: data.email || lead.email,
          phone: data.phone || lead.phone,
          timestamp: data.created_at || lead.timestamp,
          last_interaction_at: data.last_interaction_at || lead.last_interaction_at || null,
          booking_date: bookingDate,
          booking_time: bookingTime,
          lead_score: data.lead_score ?? lead.lead_score ?? null,
          lead_stage: data.lead_stage || lead.lead_stage || null,
          sub_stage: data.sub_stage || lead.sub_stage || null,
          stage_override: data.stage_override ?? lead.stage_override ?? null,
          unified_context: data.unified_context || lead.unified_context || null,
          first_touchpoint: data.first_touchpoint || lead.first_touchpoint || null,
          last_touchpoint: data.last_touchpoint || lead.last_touchpoint || null,
          status: data.status || lead.status || null,
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
      messages30Days?.forEach((msg: any) => {
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
      const totalInteractions = messages30Days?.length || 0
      
      // Calculate last touch day (most recent day with interactions)
      let lastTouchDay: string | null = null
      if (messages30Days && messages30Days.length > 0) {
        const lastMessage = messages30Days[messages30Days.length - 1]
        const lastDate = new Date(lastMessage.created_at)
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
        const unifiedContext = leadData?.unified_context || lead.unified_context
        const bookingDate = 
          leadData?.booking_date || 
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
          leadData?.booking_time || 
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
        const unifiedContext = leadData?.unified_context || lead.unified_context
        const bookingDate = 
          leadData?.booking_date || 
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
          leadData?.booking_time || 
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
    if (score >= 70) return { bg: '#EF4444', text: '#FFFFFF', label: 'Hot 🔥' }
    if (score >= 40) return { bg: '#F97316', text: '#FFFFFF', label: 'Warm ⚡' }
    return { bg: '#3B82F6', text: '#FFFFFF', label: 'Cold ❄️' }
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
      <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-40" onClick={onClose}></div>
      
      <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4" onClick={onClose}>
        <div 
          className="relative bg-white dark:bg-[#1A1A1A] rounded-lg shadow-xl z-50 flex flex-col"
          style={{ 
            width: '54vw', 
            maxWidth: '720px',
            height: '85vh',
            maxHeight: '85vh'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Row 1: Title Row - Name/Email (left) + Lead Health + Stage (right) */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-[#262626] flex-shrink-0">
            {/* Left: Name + Email (stacked, title style) */}
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{currentLead.name || 'Unknown Lead'}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">{currentLead.email || currentLead.phone || 'No contact info'}</p>
            </div>

            {/* Right: Lead Health box + Stage badge (inline) */}
            <div className="flex items-center gap-3">
              {/* Lead Health Box */}
              <div 
                className="w-16 h-16 rounded-xl flex flex-col items-center justify-center shadow-md flex-shrink-0"
                style={{ backgroundColor: healthColor.bg, color: healthColor.text }}
              >
                <span className="text-3xl font-bold">{score}</span>
                <span className="text-xs font-medium opacity-90">{healthColor.label}</span>
              </div>

              {/* Stage Badge */}
              <div className="flex items-center gap-2">
                <div 
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${getStageBadgeClass(currentStage)}`}
                  style={currentStage === 'In Sequence' ? {
                    backgroundColor: 'var(--accent-subtle)',
                    color: 'var(--accent-primary)'
                  } : undefined}
                >
                  {currentStage}
                </div>
                <button
                  onClick={() => setShowStageDropdown(!showStageDropdown)}
                  className="p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  title="Edit stage"
                >
                  <MdEdit size={16} />
                </button>
              </div>

              {/* Close Button */}
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors ml-2"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Stage Dropdown */}
            {showStageDropdown && (
              <>
                <div className="fixed inset-0 z-[60]" onClick={() => setShowStageDropdown(false)} />
                <div className="absolute right-4 top-20 z-[70] bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#262626] rounded-lg shadow-xl p-2 w-[220px]">
                  {['New', 'Engaged', 'Qualified', 'High Intent', 'Booking Made', 'Converted', 'Closed Lost', 'In Sequence', 'Cold'].map((stage) => (
                    <button
                      key={stage}
                      onClick={() => handleStageChange(stage as LeadStage)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                        currentStage === stage
                          ? getStageBadgeClass(stage) + ' font-semibold'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                      }`}
                      style={currentStage === stage && stage === 'In Sequence' ? {
                        backgroundColor: 'var(--accent-subtle)',
                        color: 'var(--accent-primary)'
                      } : undefined}
                    >
                      {stage}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Row 2: Info Row - Customer Journey (left 50%) + Quick Stats (right 50%) */}
          <div className="grid grid-cols-2 gap-4 p-4 border-b border-gray-200 dark:border-[#262626] flex-shrink-0">
            {/* Left 50%: Customer Journey */}
            <div>
              <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Customer Journey</h3>
              {activeChannels.length > 0 ? (
                <div className="overflow-x-auto">
                  <div className="flex gap-3 flex-nowrap">
                    {activeChannels.map((channel) => (
                      <div 
                        key={channel.key} 
                        className="flex items-center gap-2 flex-shrink-0 min-w-[140px]"
                      >
                        <div 
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white shadow-sm flex-shrink-0"
                          style={{ backgroundColor: channel.color }}
                        >
                          <channel.icon size={16} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{channel.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {channel.firstDate ? formatDateIST(channel.firstDate) : '-'}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{channel.count} msgs</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400">No channels yet</p>
              )}
            </div>

            {/* Right 50%: Quick Stats (2×2 grid) */}
            <div>
              <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Quick Stats</h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 bg-gray-50 dark:bg-[#1F1F1F] rounded-lg">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Messages</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{quickStats.totalMessages}</p>
                </div>
                <div className="p-2 bg-gray-50 dark:bg-[#1F1F1F] rounded-lg">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Response Rate</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{quickStats.responseRate}%</p>
                </div>
                <div className="p-2 bg-gray-50 dark:bg-[#1F1F1F] rounded-lg">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Avg Response</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">
                    {quickStats.avgResponseTime > 0 ? `${quickStats.avgResponseTime}m` : '-'}
                  </p>
                </div>
                <div className="p-2 bg-gray-50 dark:bg-[#1F1F1F] rounded-lg">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Booking</p>
                  {quickStats.hasBooking ? (
                    <div className="flex items-center gap-1.5">
                      <MdCheckCircle className="text-green-500 flex-shrink-0" size={18} />
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {formatDateIST(
                          currentLead.booking_date || 
                          currentLead.unified_context?.web?.booking_date || 
                          currentLead.unified_context?.web?.booking?.date ||
                          currentLead.unified_context?.whatsapp?.booking_date ||
                          currentLead.unified_context?.whatsapp?.booking?.date ||
                          currentLead.unified_context?.voice?.booking_date ||
                          currentLead.unified_context?.voice?.booking?.date ||
                          currentLead.unified_context?.social?.booking_date ||
                          currentLead.unified_context?.social?.booking?.date
                        )}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xl font-bold text-gray-400 dark:text-gray-500">-</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* TABS */}
          <div className="flex border-b border-gray-200 dark:border-[#262626] flex-shrink-0">
            <button
              onClick={() => setActiveTab('activity')}
              className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === 'activity'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Activity
            </button>
            <button
              onClick={() => setActiveTab('summary')}
              className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === 'summary'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Summary
            </button>
            <button
              onClick={() => setActiveTab('breakdown')}
              className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === 'breakdown'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Score Breakdown
            </button>
            <button
              onClick={() => setActiveTab('interaction')}
              className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === 'interaction'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              30-Day Interaction
            </button>
          </div>

          {/* TAB CONTENT - Scrollable */}
          <div className="flex-1 overflow-y-auto">
            {/* Activity Tab - 70% width with improved message display */}
            {activeTab === 'activity' && (
              <div className="p-6" style={{ width: '70%', maxWidth: '840px' }}>
                {loadingActivities ? (
                  <div className="text-sm text-center py-8 text-gray-500 dark:text-gray-400">
                    <div className="animate-pulse">Loading activities...</div>
                  </div>
                ) : activities.length === 0 ? (
                  <div className="text-sm text-center py-8 text-gray-500 dark:text-gray-400">
                    No activities yet
                  </div>
                ) : (
                  <div className="space-y-4">
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
                        <div key={activity.id} className="flex gap-3">
                          <div className="flex flex-col items-center flex-shrink-0">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white shadow-sm" style={{ backgroundColor: color }}>
                              {Icon}
                            </div>
                            {index < activities.length - 1 && (
                              <div className="w-0.5 flex-1 mt-2" style={{ backgroundColor: color, opacity: 0.3 }} />
                            )}
                          </div>
                          <div className="flex-1 pb-4 min-w-0">
                            {/* Message bubble for customer/PROXe messages */}
                            {activity.content && (isCustomer || isProxe) ? (
                              <div 
                                className={`rounded-2xl px-4 py-3 mb-2 ${
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
                              <p className="text-sm mt-1 text-gray-700 dark:text-gray-300 leading-relaxed">
                                {activity.content}
                              </p>
                            ) : null}
                            
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 dark:text-white">
                                  {activity.action || 'Activity'}
                                </p>
                                {activity.channel && (
                                  <span 
                                    className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                                    style={{ 
                                      backgroundColor: `${color}20`,
                                      color: color
                                    }}
                                  >
                                    {activity.channel}
                                  </span>
                                )}
                              </div>
                              <span className="text-xs whitespace-nowrap text-gray-500 dark:text-gray-400 flex-shrink-0">
                                {formatDateTimeIST(activity.timestamp)}
                              </span>
                            </div>
                            <p className="text-xs mt-0.5" style={{ color }}>
                              {activity.actor || 'Unknown'}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Other Tabs - Full Width */}
            {activeTab !== 'activity' && (
              <div className="p-6">
                {/* Summary Tab */}
                {activeTab === 'summary' && (
              <div className="space-y-4">
                <div className="p-4 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-gray-900 dark:text-white">
                    <MdAutoAwesome size={16} className="text-blue-500" />
                    Unified Summary
                    {loadingSummary && (
                      <span className="text-xs ml-2 text-gray-500 dark:text-gray-400">Generating...</span>
                    )}
                  </h3>
                  {loadingSummary ? (
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      <div className="animate-pulse">Loading summary...</div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm leading-relaxed mb-3 text-gray-700 dark:text-gray-300">
                        {unifiedSummary || 'No summary available. Summary will be generated on next page load.'}
                      </p>
                      {summaryAttribution && (
                        <p className="text-xs pt-3 border-t border-blue-200 dark:border-blue-800 text-gray-500 dark:text-gray-400">
                          {summaryAttribution}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {summaryData && (
                  <div className="space-y-3">
                    {summaryData.keyInfo && (summaryData.keyInfo.budget || summaryData.keyInfo.serviceInterest || summaryData.keyInfo.painPoints) && (
                      <div className="p-3 rounded-lg bg-gray-50 dark:bg-[#1F1F1F]">
                        <p className="text-xs font-semibold mb-2 text-gray-900 dark:text-white">Buying Signals</p>
                        <div className="space-y-1">
                          {summaryData.keyInfo.budget && (
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              <span className="font-medium">Budget:</span> {summaryData.keyInfo.budget}
                            </p>
                          )}
                          {summaryData.keyInfo.serviceInterest && (
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              <span className="font-medium">Interest:</span> {summaryData.keyInfo.serviceInterest}
                            </p>
                          )}
                          {summaryData.keyInfo.painPoints && (
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              <span className="font-medium">Pain Points:</span> {summaryData.keyInfo.painPoints}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

                {/* Score Breakdown Tab */}
                {activeTab === 'breakdown' && (
              <div className="space-y-6">
                {calculatedScore ? (
                  <>
                    {/* 3 Cards in Row */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Card 1 - AI Analysis (60%) */}
                      <div className="p-4 rounded-lg border-2 border-blue-200 dark:border-blue-800 bg-white dark:bg-[#1A1A1A]">
                        <div className="flex items-center gap-2 mb-3">
                          <MdPsychology size={24} className="text-blue-500 dark:text-blue-400" />
                          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">AI Analysis</h3>
                        </div>
                        <div className="mb-2">
                          <p className="text-3xl font-bold text-gray-900 dark:text-white">
                            {calculatedScore.breakdown.ai}/60
                          </p>
                          <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
                            {Math.round((calculatedScore.breakdown.ai / 60) * 100)}%
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-4">
                          <span className="px-2 py-1 text-xs rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                            Intent
                          </span>
                          <span className="px-2 py-1 text-xs rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                            Sentiment
                          </span>
                          <span className="px-2 py-1 text-xs rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                            Buying
                          </span>
                        </div>
                      </div>

                      {/* Card 2 - Activity (30%) */}
                      <div className="p-4 rounded-lg border-2 border-green-200 dark:border-green-800 bg-white dark:bg-[#1A1A1A]">
                        <div className="flex items-center gap-2 mb-3">
                          <MdFlashOn size={24} className="text-green-500 dark:text-green-400" />
                          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Activity</h3>
                        </div>
                        <div className="mb-2">
                          <p className="text-3xl font-bold text-gray-900 dark:text-white">
                            {calculatedScore.breakdown.activity}/30
                          </p>
                          <p className="text-sm font-medium text-green-600 dark:text-green-400">
                            {Math.round((calculatedScore.breakdown.activity / 30) * 100)}%
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-4">
                          <span className="px-2 py-1 text-xs rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                            Messages
                          </span>
                          <span className="px-2 py-1 text-xs rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                            Response Rate
                          </span>
                          <span className="px-2 py-1 text-xs rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                            Recency
                          </span>
                          <span className="px-2 py-1 text-xs rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                            Channels
                          </span>
                        </div>
                      </div>

                      {/* Card 3 - Business Signals (10%) */}
                      <div className="p-4 rounded-lg border-2 border-purple-200 dark:border-purple-800 bg-white dark:bg-[#1A1A1A]">
                        <div className="flex items-center gap-2 mb-3">
                          <MdBarChart size={24} className="text-purple-500 dark:text-purple-400" />
                          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Business Signals</h3>
                        </div>
                        <div className="mb-2">
                          <p className="text-3xl font-bold text-gray-900 dark:text-white">
                            {calculatedScore.breakdown.business}/10
                          </p>
                          <p className="text-sm font-medium text-purple-600 dark:text-purple-400">
                            {Math.round((calculatedScore.breakdown.business / 10) * 100)}%
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-4">
                          <span className="px-2 py-1 text-xs rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                            Booking
                          </span>
                          <span className="px-2 py-1 text-xs rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                            Contact Info
                          </span>
                          <span className="px-2 py-1 text-xs rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                            Multi-channel
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Total Score Card - Large with Radial */}
                    <div className="p-6 rounded-lg bg-gradient-to-br from-gray-50 to-gray-100 dark:from-[#1F1F1F] dark:to-[#262626] border border-gray-200 dark:border-[#262626]">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Total Score</h3>
                          <p className="text-5xl font-bold text-gray-900 dark:text-white">
                            {calculatedScore.score}/100
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {Math.round((calculatedScore.score / 100) * 100)}% complete
                          </p>
                        </div>
                        {/* Radial Progress Circle */}
                        <div className="relative w-24 h-24 flex-shrink-0">
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
                              className="text-blue-500 dark:text-blue-400 transition-all duration-500"
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
                    </div>

                    {/* Info Footer */}
                    <div className="p-4 rounded-lg bg-gray-50 dark:bg-[#1F1F1F]">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Score is calculated live based on engagement, intent signals, and activity patterns. Updates automatically when the modal opens or when activities change.
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-center py-8 text-gray-500 dark:text-gray-400">
                    <div className="animate-pulse">Calculating score breakdown...</div>
                  </div>
                )}
              </div>
            )}

                {/* 30-Day Interaction Tab (from first touchpoint) */}
                {activeTab === 'interaction' && (
              <div className="space-y-4">
                {loading30Days ? (
                  <div className="text-sm text-center py-8 text-gray-500 dark:text-gray-400">
                    <div className="animate-pulse">Loading interaction data...</div>
                  </div>
                ) : interaction30Days ? (
                  <div className="grid grid-cols-2 gap-6">
                    {/* Left Column - Stats */}
                    <div className="space-y-6">
                      {/* Total Interactions */}
                      <div>
                        <p className="text-4xl font-bold text-gray-900 dark:text-white">
                          {interaction30Days.totalInteractions}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Total interactions (first 30 days)</p>
                      </div>

                      {/* Last Touch Day */}
                      <div className="p-4 bg-gray-50 dark:bg-[#1F1F1F] rounded-lg">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Last Touch Day</p>
                        <p className="text-lg font-semibold text-gray-900 dark:text-white">
                          {interaction30Days.lastTouchDay || 'No interactions yet'}
                        </p>
                      </div>
                    </div>

                    {/* Right Column - Calendar */}
                    <div className="w-full">
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
                        
                        // Calculate number of weeks needed (30 days can span 5 weeks)
                        const numWeeks = Math.ceil(30 / 7)
                        
                        return (
                          <div className="flex flex-col gap-2">
                            {/* Day rows - 7 rows (Sunday to Saturday) */}
                            {[0, 1, 2, 3, 4, 5, 6].map((targetDayOfWeek) => {
                              // Find all days in the 30-day period that fall on this day of week
                              const daysForThisRow = allDays.filter(d => d.dayOfWeek === targetDayOfWeek)
                              
                              // Group into weeks (each week can have at most 1 day of this type)
                              const weekCells: Array<{ date: Date; dateStr: string; count: number } | null> = []
                              
                              for (let weekIndex = 0; weekIndex < numWeeks; weekIndex++) {
                                // Find the day that falls in this week
                                const dayInWeek = daysForThisRow.find(day => {
                                  const daysFromStart = Math.floor((day.date.getTime() - firstTouchpoint.getTime()) / (1000 * 60 * 60 * 24))
                                  const weekStart = weekIndex * 7
                                  const weekEnd = weekStart + 7
                                  return daysFromStart >= weekStart && daysFromStart < weekEnd
                                })
                                
                                if (dayInWeek) {
                                  weekCells.push(dayInWeek)
                                } else {
                                  weekCells.push(null)
                                }
                              }
                              
                              return (
                                <div key={targetDayOfWeek} className="flex items-center gap-2">
                                  {/* Day label on left */}
                                  <div className="w-12 text-sm text-gray-500 dark:text-gray-400 text-right pr-3 font-medium flex-shrink-0">
                                    {dayNames[targetDayOfWeek]}
                                  </div>
                                  {/* Days across weeks */}
                                  <div className="flex flex-1" style={{ gap: '8px' }}>
                                    {weekCells.map((day, weekIndex) => {
                                      if (!day) {
                                        // Empty cell
                                        return (
                                          <div
                                            key={`${targetDayOfWeek}-${weekIndex}`}
                                            className="w-5 h-5 flex-shrink-0"
                                          />
                                        )
                                      }
                                      
                                      // Color intensity mapping with larger dots
                                      let opacity = 0.1
                                      let size = 20 // Bigger dots
                                      
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
                                          key={`${day.dateStr}-${weekIndex}`}
                                          className="rounded-full cursor-pointer transition-all hover:scale-125 flex-shrink-0"
                                          style={{
                                            width: `${size}px`,
                                            height: `${size}px`,
                                            backgroundColor: 'var(--accent-primary)',
                                            opacity: opacity,
                                            minWidth: '20px',
                                            minHeight: '20px',
                                          }}
                                          title={`${dateStr}: ${day.count} message${day.count !== 1 ? 's' : ''}`}
                                        />
                                      )
                                    })}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-center py-4 text-gray-500 dark:text-gray-400">
                    No interaction data available
                  </div>
                )}
              </div>
                )}
              </div>
            )}
          </div>
        </div>
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
