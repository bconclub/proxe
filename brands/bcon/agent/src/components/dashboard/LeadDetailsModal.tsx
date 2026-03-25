'use client'

import { useState, useEffect, useRef } from 'react'
import { formatDateTime, formatDate } from '@/lib/utils'
import { createClient } from '../../lib/supabase/client'
import { format } from 'date-fns'
import { MdLanguage, MdChat, MdPhone, MdShare, MdAutoAwesome, MdOpenInNew, MdHistory, MdCall, MdEvent, MdMessage, MdNote, MdEdit, MdTrendingUp, MdTrendingDown, MdRemove, MdCheckCircle, MdSchedule, MdPsychology, MdFlashOn, MdBarChart, MdEmail, MdChevronRight, MdSmartToy, MdPerson, MdRefresh, MdHelpOutline, MdInfo, MdCheck, MdPayments, MdReportProblem, MdSchool, MdHistoryEdu, MdFlightTakeoff, MdAccountBalanceWallet, MdPersonOutline, MdOutlineInsights, MdMic, MdAdd, MdMoreHoriz, MdDynamicForm, MdClose } from 'react-icons/md'
import { FaWhatsapp } from 'react-icons/fa'
import { useRouter } from 'next/navigation'
import LeadStageSelector from './LeadStageSelector'
import ActivityLoggerModal from './ActivityLoggerModal'
import { LeadStage } from '@/types'
import type { Lead as ScoreLead } from '@/types'
import { calculateLeadScore as calculateLeadScoreUtil, type CalculatedScore } from '@/lib/leadScoreCalculator'

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

function formatCountdown(scheduledAt: string): string {
  const now = Date.now()
  const target = new Date(scheduledAt).getTime()
  const diff = target - now

  if (diff <= 0) return 'Now'

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) {
    const date = new Date(scheduledAt)
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)
    const dayAfter = new Date(tomorrow)
    dayAfter.setDate(dayAfter.getDate() + 1)

    if (target < dayAfter.getTime()) {
      return `Tomorrow at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })}`
    }
    return `In ${days}d ${hours % 24}h`
  }

  if (hours > 0) return `In ${hours}h ${minutes % 60}m`
  return `In ${minutes}m`
}

function getTaskTypeConfig(taskType: string): { color: string; bg: string; label: string } {
  const t = (taskType || '').toLowerCase()
  if (t.includes('nudge')) return { color: '#F97316', bg: 'rgba(249,115,22,0.12)', label: 'Nudge' }
  if (t.includes('reminder')) return { color: '#3B82F6', bg: 'rgba(59,130,246,0.12)', label: 'Reminder' }
  if (t.includes('re_engage') || t.includes('reengage')) return { color: '#EF4444', bg: 'rgba(239,68,68,0.12)', label: 'Re-engage' }
  if (t.includes('follow')) return { color: '#22C55E', bg: 'rgba(34,197,94,0.12)', label: 'Follow-up' }
  return { color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)', label: taskType?.replace(/_/g, ' ') || 'Task' }
}

function getTaskActionLabel(task: any): string {
  const channel = task.metadata?.channel || 'WhatsApp'
  const t = (task.task_type || '').toLowerCase()
  if (t.includes('nudge')) return `${channel} nudge`
  if (t.includes('reminder') && t.includes('booking')) return 'Booking reminder'
  if (t.includes('reminder')) return `${channel} reminder`
  if (t.includes('follow')) return `${channel} follow-up`
  if (t.includes('re_engage') || t.includes('reengage')) return `${channel} re-engagement`
  return task.task_description || task.task_type?.replace(/_/g, ' ') || 'Scheduled action'
}

function renderMarkdown(text: string) {
  if (!text) return null;

  // Simple regex to handle **bold** text
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-bold text-[var(--text-primary)]">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

/** Render summary as plain text - just sentences, no formatting */
function renderSummary(text: string) {
  if (!text) return null;
  return (
    <p className="text-[13px] leading-relaxed font-normal" style={{ color: 'var(--text-primary)' }}>
      {text.trim()}
    </p>
  );
}

const ALL_CHANNELS = ['web', 'whatsapp', 'voice', 'social', 'meta_forms'];

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
    icon: FaWhatsapp,
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
  },
  meta_forms: {
    name: 'Meta Forms',
    icon: MdDynamicForm,
    color: '#1877F2',
    emoji: '📋'
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
  const [activeTab, setActiveTab] = useState<'activity' | 'summary' | 'breakdown' | 'interaction'>('summary')
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
    leadInDay: string | null
  } | null>(null)
  const [loading30Days, setLoading30Days] = useState(false)

  // New state for enhanced metrics
  const [channelData, setChannelData] = useState<{
    web: { count: number; firstDate: string | null; lastDate: string | null }
    whatsapp: { count: number; firstDate: string | null; lastDate: string | null }
    voice: { count: number; firstDate: string | null; lastDate: string | null }
    meta_forms: { count: number; firstDate: string | null; lastDate: string | null }
    social: { count: number; firstDate: string | null; lastDate: string | null }
  }>({
    web: { count: 0, firstDate: null, lastDate: null },
    whatsapp: { count: 0, firstDate: null, lastDate: null },
    voice: { count: 0, firstDate: null, lastDate: null },
    social: { count: 0, firstDate: null, lastDate: null },
    meta_forms: { count: 0, firstDate: null, lastDate: null },
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
  const [calculatedScore, setCalculatedScore] = useState<CalculatedScore | null>(null)

  // Admin notes state
  const [showAdminNoteInput, setShowAdminNoteInput] = useState(false)
  const [adminNoteText, setAdminNoteText] = useState('')
  const [savingAdminNote, setSavingAdminNote] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [showAdminNotes, setShowAdminNotes] = useState(false)
  const recognitionRef = useRef<any>(null)
  // AI classification progress state
  const [noteProgress, setNoteProgress] = useState<{ steps: { text: string; done: boolean }[]; visible: boolean }>({ steps: [], visible: false })

  // Log a Call state
  const [showLogCallForm, setShowLogCallForm] = useState(false)
  const [logCallOutcome, setLogCallOutcome] = useState<string>('Connected')
  const [logCallNotes, setLogCallNotes] = useState('')
  const [savingLogCall, setSavingLogCall] = useState(false)

  // Send Message state
  const [showSendMessageForm, setShowSendMessageForm] = useState(false)
  const [sendMessageText, setSendMessageText] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)

  // "+" action dropdown
  const [showActionDropdown, setShowActionDropdown] = useState(false)

  // Next Actions state
  const [leadTasks, setLeadTasks] = useState<any[]>([])
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [, setTick] = useState(0)

  // Calculate and set unified score (using shared utility) and persist to DB
  const calculateAndSetScore = async () => {
    if (!lead) return
    const leadData = freshLeadData || lead
    const result = await calculateLeadScoreUtil(leadData as ScoreLead)
    setCalculatedScore(result)

    // Persist recalculated score to DB so list and modal always match
    if (result && typeof result.score === 'number') {
      try {
        await fetch(`/api/dashboard/leads/${lead.id}/score`, { method: 'POST' })
      } catch (err) {
        console.error('Failed to persist recalculated score:', err)
      }
    }
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

  // Helper to get local YYYY-MM-DD
  const getLocalDateKey = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Load 30-day interaction data (from first touchpoint)
  const load30DayInteractions = async () => {
    if (!lead) return
    setLoading30Days(true)
    try {
      const supabase = createClient()

      // Get first touchpoint date (created_at)
      const firstTouchpoint = new Date(lead.created_at || lead.timestamp || new Date())
      firstTouchpoint.setHours(0, 0, 0, 0)

      const leadInDay = firstTouchpoint.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

      const thirtyDaysLater = new Date(firstTouchpoint)
      thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 31) // Allow for 30 full days

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

      // Initialize all 30 days with 0 using LOCAL date keys
      for (let i = 0; i < 30; i++) {
        const d = new Date(firstTouchpoint)
        d.setDate(d.getDate() + i)
        const dateStr = getLocalDateKey(d)
        dailyCounts[dateStr] = 0
      }

      // Count messages per day using LOCAL dates
      typedMessages30Days.forEach((msg) => {
        if (!msg.created_at) return
        const dateStr = getLocalDateKey(new Date(msg.created_at))
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
        leadInDay,
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
      loadUnifiedSummary(true) // Always regenerate fresh summary on open
      loadActivities()
      loadChannelData()
      loadQuickStats()
      loadScoreHistory()
      loadLeadTasks()
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

  // Live countdown timer - re-render every 60s for task countdowns
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000)
    return () => clearInterval(interval)
  }, [])

  const loadUnifiedSummary = async (refresh = false) => {
    if (!lead) return
    setUnifiedSummary('')
    setSummaryAttribution('')
    setSummaryData(null)
    setLoadingSummary(true)
    try {
      console.log('Loading unified summary for lead:', lead.id, { refresh })
      const url = `/api/dashboard/leads/${lead.id}/summary${refresh ? '?refresh=true' : ''}`
      const response = await fetch(url)

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
          meta_forms: { count: 0, firstDate: null, lastDate: null },
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
        // Calculate response rate: what % of customer messages got a reply (capped at 100%)
        const customerMessages = messages.filter((m: any) => m.sender === 'customer')
        const agentMessages = messages.filter((m: any) => m.sender === 'agent')
        const responseRate = customerMessages.length > 0
          ? Math.min(100, Math.round((agentMessages.length / customerMessages.length) * 100))
          : 0

        // Calculate average response time from metadata.response_time_ms
        // Use only last 5 agent messages to reflect current performance
        let totalResponseTime = 0
        let responseCount = 0

        // First, try to use metadata.response_time_ms (last 5 only)
        const agentMsgsWithTime = messages.filter((msg: any) =>
          msg.sender === 'agent' && msg.metadata?.response_time_ms
        ).slice(-5)

        agentMsgsWithTime.forEach((msg: any) => {
          const responseTimeMs = typeof msg.metadata.response_time_ms === 'number'
            ? msg.metadata.response_time_ms
            : parseInt(msg.metadata.response_time_ms, 10)
          if (!isNaN(responseTimeMs) && responseTimeMs > 0) {
            totalResponseTime += responseTimeMs
            responseCount++
          }
        })

        // Fallback to timestamp calculation if no metadata.response_time_ms
        // Use last 10 messages to find up to 5 customer→agent pairs
        if (responseCount === 0) {
          const recentMessages = messages.slice(-10)
          for (let i = 0; i < recentMessages.length - 1; i++) {
            const msg1 = recentMessages[i] as any
            const msg2 = recentMessages[i + 1] as any
            if (msg1.sender === 'customer' && msg2.sender === 'agent') {
              const timeDiff = new Date(msg2.created_at).getTime() - new Date(msg1.created_at).getTime()
              if (timeDiff > 0) {
                totalResponseTime += timeDiff
                responseCount++
                if (responseCount >= 5) break
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
        .from('lead_stage_changes')
        .select('new_score, created_at')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false })
        .limit(2)

      if (history && Array.isArray(history) && history.length > 1) {
        const prev = history[1] as any
        setPreviousScore(prev.new_score)
      }
    } catch (error) {
      console.error('Error loading score history:', error)
    }
  }

  const loadLeadTasks = async () => {
    if (!lead) return
    setLoadingTasks(true)
    try {
      const response = await fetch(`/api/dashboard/tasks?lead_id=${lead.id}`)
      if (response.ok) {
        const data = await response.json()
        setLeadTasks(data.tasks || [])
      }
    } catch (error) {
      console.error('Error loading lead tasks:', error)
    } finally {
      setLoadingTasks(false)
    }
  }

  const handleCancelTask = async (taskId: string) => {
    try {
      const response = await fetch(`/api/dashboard/tasks/${taskId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      })
      if (response.ok) {
        loadLeadTasks()
      }
    } catch (error) {
      console.error('Error cancelling task:', error)
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

  // Get health score — use DB lead_score when admin has explicitly overridden, otherwise use calculated
  const score = (currentLead.stage_override && currentLead.lead_score != null && currentLead.lead_score > 0)
    ? Math.max(currentLead.lead_score, calculatedScore?.score ?? 0)
    : (calculatedScore?.score ?? 0)
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
    // If admin explicitly set the stage, use it
    if (currentLead.lead_stage && currentLead.stage_override) {
      return currentLead.lead_stage
    }

    // If stage exists from DB (not overridden), still use it
    if (currentLead.lead_stage) {
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
  const currentStage = detectedStage

  // Calculate stage duration
  const getStageDuration = () => {
    try {
      const supabase = createClient()
      // This would need to fetch from lead_stage_changes, simplified for now
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
      'Not Qualified': 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
      'In Sequence': '', // Will use inline styles with CSS variables
      'Cold': 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
      'R&R': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    }
    return stageColors[stage] || stageColors['New']
  }

  // Admin note handlers
  const handleSaveAdminNote = async () => {
    if (!adminNoteText.trim() || !lead) return
    setSavingAdminNote(true)
    // Show initial analyzing step
    setNoteProgress({ steps: [{ text: 'Analyzing note...', done: false }], visible: true })
    try {
      const response = await fetch(`/api/dashboard/leads/${lead.id}/admin-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: adminNoteText.trim() }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save note')
      }
      const result = await response.json()

      // Build step-by-step progress from response
      const allSteps: { text: string; done: boolean }[] = [
        { text: 'Analyzing note...', done: true },
      ]

      // Show classification
      const categoryLabels: Record<string, string> = {
        BOOKING_MADE: 'Booking Made', POST_CALL: 'Post Call', NOT_POTENTIAL: 'Not Potential',
        HOT_LEAD: 'Hot Lead', WARM_LATER: 'Warm — Later', RNR: 'Rang No Response',
        NOT_INTERESTED: 'Not Interested', CONVERTED: 'Converted', MEETING_REQUEST: 'Meeting Request',
        SEND_MESSAGE: 'Send Message', NAME_UPDATE: 'Name Update', INFO_ONLY: 'Info Only',
      }
      const categoryLabel = categoryLabels[result.classification?.category] || result.classification?.category || 'Unknown'
      allSteps.push({ text: `Classified as: ${categoryLabel}`, done: true })

      // Add each action taken
      if (result.actions_taken) {
        for (const action of result.actions_taken) {
          allSteps.push({ text: action, done: true })
        }
      }

      allSteps.push({ text: 'Done', done: true })

      // Animate steps one by one
      for (let i = 0; i < allSteps.length; i++) {
        await new Promise(resolve => setTimeout(resolve, i === 0 ? 100 : 400))
        setNoteProgress({ steps: allSteps.slice(0, i + 1), visible: true })
      }

      setAdminNoteText('')
      setShowAdminNoteInput(false)

      // Keep visible for a moment, then fade out and refresh
      await new Promise(resolve => setTimeout(resolve, 2000))
      setNoteProgress(prev => ({ ...prev, visible: false }))
      await new Promise(resolve => setTimeout(resolve, 300))
      setNoteProgress({ steps: [], visible: false })

      loadActivities()
      loadLeadTasks()
      loadFreshLeadData()
    } catch (err) {
      console.error('Error saving admin note:', err)
      setNoteProgress({ steps: [{ text: 'Analyzing note...', done: true }, { text: 'Error saving note', done: true }], visible: true })
      setTimeout(() => setNoteProgress({ steps: [], visible: false }), 2000)
    } finally {
      setSavingAdminNote(false)
    }
  }

  const handleDeleteAdminNote = async (note: any) => {
    if (!lead || !confirm('Delete this note?')) return
    try {
      const response = await fetch(`/api/dashboard/leads/${lead.id}/admin-notes`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_id: note.id, note_text: note.text, note_created_at: note.created_at }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to delete note')
      }
      loadFreshLeadData()
    } catch (err) {
      console.error('Error deleting admin note:', err)
    }
  }

  const handleLogCall = async () => {
    if (!lead) return
    setSavingLogCall(true)
    try {
      const response = await fetch(`/api/dashboard/leads/${lead.id}/log-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome: logCallOutcome, notes: logCallNotes.trim() || undefined }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to log call')
      }
      setShowLogCallForm(false)
      setLogCallOutcome('Connected')
      setLogCallNotes('')
      loadActivities()
      loadLeadTasks()
      loadFreshLeadData()
    } catch (err) {
      console.error('Error logging call:', err)
    } finally {
      setSavingLogCall(false)
    }
  }

  const handleSendMessage = async () => {
    if (!sendMessageText.trim() || !lead) return
    setSendingMessage(true)
    try {
      const response = await fetch('/api/dashboard/inbox/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id,
          channel: 'whatsapp',
          action: 'send',
          message: sendMessageText.trim(),
        }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to send message')
      }
      setSendMessageText('')
      setShowSendMessageForm(false)
      loadActivities()
      loadFreshLeadData()
    } catch (err) {
      console.error('Error sending message:', err)
    } finally {
      setSendingMessage(false)
    }
  }

  const closeAllActionForms = () => {
    setShowLogCallForm(false)
    setShowAdminNoteInput(false)
    setShowSendMessageForm(false)
  }

  const toggleVoiceDictation = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Voice dictation is not supported in this browser.')
      return
    }

    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-IN'

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript
      setAdminNoteText((prev) => (prev ? prev + ' ' + transcript : transcript))
      setIsListening(false)
    }

    recognition.onerror = () => setIsListening(false)
    recognition.onend = () => setIsListening(false)

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
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
    disqualification_reason?: string
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
          disqualification_reason: activity.disqualification_reason,
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
    // Add meta_forms as first step if first_touchpoint is meta_forms (even with 0 conversation messages)
    const ft = currentLead.first_touchpoint
    const leadSources: string[] = currentLead.unified_context?.lead_sources || []
    if (ft === 'meta_forms' || leadSources.includes('meta_forms')) {
      const config = CHANNEL_CONFIG.meta_forms
      channels.push({
        ...config,
        key: 'meta_forms',
        count: channelData.meta_forms.count || 1,
        firstDate: channelData.meta_forms.firstDate || currentLead.created_at || currentLead.timestamp,
        lastDate: channelData.meta_forms.lastDate || currentLead.created_at || currentLead.timestamp,
      })
    }
    const lt = currentLead.last_touchpoint
    const uc = currentLead.unified_context || {}
    const hasChannel = (ch: string) =>
      channelData[ch as keyof typeof channelData]?.count > 0 ||
      ft === ch || lt === ch ||
      leadSources.includes(ch) ||
      !!(uc[ch])
    const alreadyAdded = channels.map(c => c.key)
    if (hasChannel('web') && !alreadyAdded.includes('web')) channels.push({ ...CHANNEL_CONFIG.web, key: 'web', ...channelData.web })
    if (hasChannel('whatsapp') && !alreadyAdded.includes('whatsapp')) channels.push({ ...CHANNEL_CONFIG.whatsapp, key: 'whatsapp', ...channelData.whatsapp })
    if (hasChannel('voice') && !alreadyAdded.includes('voice')) channels.push({ ...CHANNEL_CONFIG.voice, key: 'voice', ...channelData.voice })
    if (hasChannel('social') && !alreadyAdded.includes('social')) channels.push({ ...CHANNEL_CONFIG.social, key: 'social', ...channelData.social })

    // If lead_sources array exists, sort by that order; otherwise sort by firstDate
    if (leadSources.length > 0) {
      return channels.sort((a, b) => {
        const aIdx = leadSources.indexOf(a.key)
        const bIdx = leadSources.indexOf(b.key)
        // Items in lead_sources come first in order; others sort by firstDate
        if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx
        if (aIdx !== -1) return -1
        if (bIdx !== -1) return 1
        const aDate = a.firstDate ? new Date(a.firstDate).getTime() : 0
        const bDate = b.firstDate ? new Date(b.firstDate).getTime() : 0
        return aDate - bDate
      })
    }
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
          className="lead-modal-dialog lead-details-modal relative bg-[var(--bg-primary)] rounded-lg shadow-xl z-50 flex flex-col"
          style={{
            width: '54vw',
            maxWidth: '720px',
            height: '88vh',
            maxHeight: '88vh'
          }}
          onClick={(e) => e.stopPropagation()}
          aria-labelledby="lead-modal-title"
          aria-modal="true"
        >
          {/* Single Row Header: Contact Card (Left) + Journey & Stats (Right) */}
          <header className="lead-modal-header lead-details-modal-header flex flex-row items-stretch gap-6 p-4 border-b border-[var(--border-primary)] flex-shrink-0 relative min-h-[140px]">
            {/* LEFT HALF: Contact Card - Business Card Style */}
            <section className="lead-contact-card flex-1 flex flex-col justify-between h-full p-3 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)]">
              {/* Top Section: Name, Score, Status */}
              <div className="lead-contact-card-header">
                {/* Name + Score badge (top row) */}
                <div className="lead-contact-name-row flex items-start justify-between mb-1 gap-2">
                  <h2
                    id="lead-modal-title"
                    className="lead-contact-name text-xl font-bold text-[var(--text-primary)] leading-tight flex-1 min-w-0 truncate"
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
                    className="lead-stage-edit-button p-0.5 rounded hover:bg-[var(--bg-hover)] transition-colors flex-shrink-0"
                    title="Edit stage"
                    aria-label="Edit lead stage"
                    aria-expanded={showStageDropdown}
                    aria-haspopup="true"
                  >
                    <MdEdit size={12} className="text-[var(--text-muted)]" />
                  </button>
                </div>

                {/* Service Interest & Pain Point pills - only for engaged leads (score 50+) */}
                {score >= 50 && (() => {
                  const ctx = currentLead.unified_context || {}
                  const si = summaryData?.keyInfo?.serviceInterest
                    || ctx.service_interest
                    || ctx.form_data?.business_type
                    || ctx.form_data?.service
                    || null
                  const pp = summaryData?.keyInfo?.painPoints
                    || ctx.pain_point
                    || null
                  if (!si && !pp) return null
                  return (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {si && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium" style={{ background: 'rgba(99,102,241,0.12)', color: 'rgba(139,142,255,0.95)' }}>
                          <MdOutlineInsights size={10} />
                          {si}
                        </span>
                      )}
                      {pp && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] max-w-[200px] truncate" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>
                          {pp}
                        </span>
                      )}
                    </div>
                  )
                })()}
              </div>

              {/* Contact Info Section - Bottom */}
              <address className="lead-contact-info space-y-1 mt-auto not-italic">
                {/* Email with icon */}
                {currentLead.email && (
                  <div className="lead-contact-email flex items-center gap-1.5">
                    <div className="lead-contact-icon w-6 h-6 rounded bg-[var(--bg-secondary)] flex items-center justify-center flex-shrink-0" aria-hidden="true">
                      <MdEmail className="text-[var(--text-secondary)]" size={14} />
                    </div>
                    <a
                      href={`mailto:${currentLead.email}`}
                      className="lead-contact-email-link text-sm font-medium text-[var(--text-secondary)] leading-tight truncate"
                    >
                      {currentLead.email}
                    </a>
                  </div>
                )}

                {/* Phone with icon */}
                {currentLead.phone && (
                  <div className="lead-contact-phone flex items-center gap-1.5">
                    <div className="lead-contact-icon w-6 h-6 rounded bg-[var(--bg-secondary)] flex items-center justify-center flex-shrink-0" aria-hidden="true">
                      <MdPhone className="text-[var(--text-secondary)]" size={14} />
                    </div>
                    <a
                      href={`tel:${currentLead.phone}`}
                      className="lead-contact-phone-link text-sm font-medium text-[var(--text-secondary)] leading-tight"
                    >
                      {currentLead.phone}
                    </a>
                  </div>
                )}

                {!currentLead.email && !currentLead.phone && (
                  <p className="lead-contact-empty text-sm text-[var(--text-muted)]">No contact info</p>
                )}
              </address>
            </section>

            {/* RIGHT HALF: Customer Journey + Quick Stats */}
            <section className="lead-journey-stats-section flex-1 flex flex-col h-full gap-4">
              {/* Customer Journey - TOP */}
              <section className="lead-journey-section">
                <h3 className="lead-journey-title text-xs font-semibold text-[var(--text-secondary)] mb-2">Customer Journey</h3>
                <div className="lead-journey-row flex items-center gap-1.5">
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
                            <MdChevronRight className="lead-journey-separator text-[var(--text-muted)] flex-shrink-0" size={16} aria-hidden="true" />
                          )}
                        </div>
                      ))}
                    </nav>
                  ) : (
                    <p className="lead-journey-empty text-xs text-[var(--text-muted)]">No channels yet</p>
                  )}
                </div>

                {/* Inline admin note input */}
                {showAdminNoteInput && (
                  <div className="lead-admin-note-input flex items-center gap-2 mt-2 p-2 bg-[var(--bg-primary)] rounded-lg border border-[var(--border-primary)]">
                    <input
                      type="text"
                      value={adminNoteText}
                      onChange={(e) => setAdminNoteText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && adminNoteText.trim()) handleSaveAdminNote()
                      }}
                      placeholder="Add context about this lead..."
                      className="flex-1 text-xs bg-transparent border-none outline-none text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                      autoFocus
                      disabled={savingAdminNote}
                    />
                    <button
                      onClick={toggleVoiceDictation}
                      className={`lead-admin-note-mic w-6 h-6 flex items-center justify-center rounded-full transition-colors ${
                        isListening
                          ? 'bg-red-500 text-white animate-pulse'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                      }`}
                      title={isListening ? 'Stop dictation' : 'Voice dictation'}
                      aria-label={isListening ? 'Stop voice dictation' : 'Start voice dictation'}
                    >
                      <MdMic size={14} />
                    </button>
                    <button
                      onClick={handleSaveAdminNote}
                      disabled={!adminNoteText.trim() || savingAdminNote}
                      className="lead-admin-note-save w-6 h-6 flex items-center justify-center rounded-full bg-blue-500 text-white disabled:opacity-40 transition-colors"
                      title="Save note"
                    >
                      <MdCheck size={12} />
                    </button>
                  </div>
                )}

                {/* AI Classification Progress */}
                {noteProgress.steps.length > 0 && (
                  <div
                    className="mt-2 p-2.5 rounded-lg border border-[var(--border-primary)] overflow-hidden"
                    style={{
                      background: 'var(--bg-primary)',
                      opacity: noteProgress.visible ? 1 : 0,
                      transition: 'opacity 0.3s ease',
                    }}
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <MdAutoAwesome size={12} className="text-indigo-400 animate-pulse" />
                      <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-400">PROXe AI</span>
                    </div>
                    <div className="space-y-1">
                      {noteProgress.steps.map((step, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-1.5"
                          style={{
                            animation: 'fadeSlideIn 0.3s ease forwards',
                            animationDelay: `${i * 0.05}s`,
                          }}
                        >
                          {step.done ? (
                            step.text === 'Done' ? (
                              <MdCheckCircle size={12} className="text-green-400 flex-shrink-0" />
                            ) : step.text.startsWith('Error') ? (
                              <MdClose size={12} className="text-red-400 flex-shrink-0" />
                            ) : (
                              <MdCheck size={12} className="text-emerald-400 flex-shrink-0" />
                            )
                          ) : (
                            <div className="w-3 h-3 flex-shrink-0 flex items-center justify-center">
                              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                            </div>
                          )}
                          <span
                            className={`text-[10px] ${
                              step.text === 'Done'
                                ? 'font-bold text-green-400'
                                : step.text.startsWith('Classified as')
                                  ? 'font-semibold text-[var(--text-primary)]'
                                  : step.text.startsWith('Error')
                                    ? 'font-medium text-red-400'
                                    : 'text-[var(--text-secondary)]'
                            }`}
                          >
                            {step.text}
                          </span>
                        </div>
                      ))}
                    </div>
                    <style>{`
                      @keyframes fadeSlideIn {
                        from { opacity: 0; transform: translateY(-4px); }
                        to { opacity: 1; transform: translateY(0); }
                      }
                    `}</style>
                  </div>
                )}

                {/* Log a Call form */}
                {showLogCallForm && (
                  <div className="lead-log-call-form flex items-center gap-2 mt-2 p-2 bg-[var(--bg-primary)] rounded-lg border border-[var(--border-primary)]">
                    <select
                      value={logCallOutcome}
                      onChange={(e) => setLogCallOutcome(e.target.value)}
                      className="text-xs bg-transparent border border-[var(--border-primary)] rounded px-1.5 py-1 text-[var(--text-primary)] outline-none"
                      disabled={savingLogCall}
                    >
                      <option value="Connected">Connected</option>
                      <option value="No Answer">No Answer</option>
                      <option value="Busy">Busy</option>
                      <option value="Voicemail">Voicemail</option>
                    </select>
                    <input
                      type="text"
                      value={logCallNotes}
                      onChange={(e) => setLogCallNotes(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleLogCall()
                      }}
                      placeholder="Notes (optional)..."
                      className="flex-1 text-xs bg-transparent border-none outline-none text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                      disabled={savingLogCall}
                    />
                    <button
                      onClick={handleLogCall}
                      disabled={savingLogCall}
                      className="lead-log-call-save w-6 h-6 flex items-center justify-center rounded-full bg-green-500 text-white disabled:opacity-40 transition-colors"
                      title="Save call log"
                    >
                      <MdCheck size={12} />
                    </button>
                  </div>
                )}

                {/* Send Message form */}
                {showSendMessageForm && (
                  <div className="lead-send-message-form flex items-center gap-2 mt-2 p-2 bg-[var(--bg-primary)] rounded-lg border border-[var(--border-primary)]">
                    <FaWhatsapp className="text-green-500 flex-shrink-0" size={14} />
                    <input
                      type="text"
                      value={sendMessageText}
                      onChange={(e) => setSendMessageText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && sendMessageText.trim()) handleSendMessage()
                      }}
                      placeholder="Type a WhatsApp message..."
                      className="flex-1 text-xs bg-transparent border-none outline-none text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                      autoFocus
                      disabled={sendingMessage}
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={!sendMessageText.trim() || sendingMessage}
                      className="lead-send-message-save w-6 h-6 flex items-center justify-center rounded-full bg-green-500 text-white disabled:opacity-40 transition-colors"
                      title="Send message"
                    >
                      <MdCheck size={12} />
                    </button>
                  </div>
                )}

                {/* Admin notes - 3-dot menu */}
                {currentLead.unified_context?.admin_notes?.length > 0 && (
                  <div className="relative inline-block mt-1">
                    <button
                      onClick={() => setShowAdminNotes(!showAdminNotes)}
                      className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                      title={`${(currentLead.unified_context.admin_notes as any[]).length} admin notes`}
                    >
                      <MdMoreHoriz size={18} />
                    </button>
                    {showAdminNotes && (
                      <div className="absolute left-0 top-6 z-50 w-64 max-h-48 overflow-y-auto bg-[var(--bg-primary)] rounded-lg border border-[var(--border-primary)] shadow-lg p-2 space-y-1.5">
                        {(currentLead.unified_context.admin_notes as any[])
                          .filter((note: any, idx: number, arr: any[]) =>
                            arr.findIndex((n: any) => n.text === note.text && n.created_at === note.created_at) === idx
                          )
                          .slice().reverse().map((note: any, i: number) => (
                          <div key={note.id || `${note.created_at}-${i}`} className="group text-[11px] text-[var(--text-muted)] flex items-start gap-1.5">
                            <MdNote size={11} className="mt-0.5 flex-shrink-0 text-orange-400" />
                            <span className="flex-1">{note.text} <span className="text-[var(--text-muted)]">({new Date(note.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})</span></span>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteAdminNote(note) }}
                              className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-red-500/20 text-[var(--text-muted)] hover:text-red-400"
                              title="Delete note"
                            >
                              <MdClose size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* Quick Stats - BELOW Journey (3 in a row) */}
              <section className="lead-quick-stats-section">
                <h3 className="lead-quick-stats-title text-xs font-semibold text-[var(--text-secondary)] mb-2">Quick Stats</h3>
                <div className="lead-quick-stats-grid grid grid-cols-3 gap-2">
                  <article className="lead-stat-card lead-stat-messages flex flex-col justify-between h-full p-3 min-h-[80px] bg-[var(--bg-primary)] rounded-lg border border-[var(--border-primary)]">
                    <p className="lead-stat-label text-sm text-[var(--text-muted)]">Messages</p>
                    <p className="lead-stat-value text-2xl font-bold text-[var(--text-primary)] mt-auto" aria-label={`${quickStats.totalMessages} total messages`}>{quickStats.totalMessages}</p>
                  </article>
                  <article className="lead-stat-card lead-stat-response-rate flex flex-col justify-between h-full p-3 min-h-[80px] bg-[var(--bg-primary)] rounded-lg border border-[var(--border-primary)]">
                    <p className="lead-stat-label text-sm text-[var(--text-muted)]">Response Rate</p>
                    <p className="lead-stat-value text-2xl font-bold text-[var(--text-primary)] mt-auto" aria-label={`${quickStats.responseRate}% response rate`}>{quickStats.responseRate}%</p>
                  </article>
                  <article className={`lead-stat-card lead-stat-key-event flex flex-col justify-between h-full p-3 min-h-[80px] rounded-lg border ${(() => {
                    const bd = currentLead.booking_date || currentLead.unified_context?.web?.booking_date || currentLead.unified_context?.web?.booking?.date || currentLead.unified_context?.whatsapp?.booking_date || currentLead.unified_context?.whatsapp?.booking?.date || currentLead.unified_context?.voice?.booking_date || currentLead.unified_context?.voice?.booking?.date || currentLead.unified_context?.social?.booking_date || currentLead.unified_context?.social?.booking?.date;
                    const bt = currentLead.booking_time || currentLead.unified_context?.web?.booking_time || currentLead.unified_context?.web?.booking?.time || currentLead.unified_context?.whatsapp?.booking_time || currentLead.unified_context?.whatsapp?.booking?.time || currentLead.unified_context?.voice?.booking_time || currentLead.unified_context?.voice?.booking?.time || currentLead.unified_context?.social?.booking_time || currentLead.unified_context?.social?.booking?.time;
                    return bd && bt ? 'bg-[var(--bg-secondary)] border-[var(--border-primary)]' : 'bg-[var(--bg-primary)] border-[var(--border-primary)]';
                  })()}`}>
                    <p className="lead-stat-label text-sm text-[var(--text-muted)]">Key Event</p>
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
                              }}
                              aria-label={`View booking on ${formattedDate} at ${formattedTime}`}
                            >
                              <div className="lead-booking-date flex items-center gap-1">
                                <MdEvent className="text-blue-600 dark:text-blue-400 flex-shrink-0" size={14} aria-hidden="true" />
                                <time className="text-sm font-bold text-blue-700 dark:text-blue-300" dateTime={bookingDate}>
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
                          <p className="lead-stat-empty text-2xl font-bold text-[var(--text-muted)]" aria-label="No key event">-</p>
                        );
                      })()}
                    </div>
                  </article>
                </div>
              </section>
            </section>

            {/* Action "+" Button - Absolute positioned top right */}
            <div className="absolute top-4 right-4">
              <button
                onClick={() => setShowActionDropdown(!showActionDropdown)}
                className="lead-action-button w-9 h-9 flex items-center justify-center rounded-full bg-blue-500 hover:bg-blue-600 text-white shadow-md transition-colors"
                aria-label="Quick actions"
                aria-expanded={showActionDropdown}
                aria-haspopup="true"
              >
                <MdAdd size={22} />
              </button>
              {showActionDropdown && (
                <>
                  <div className="fixed inset-0 z-[60]" onClick={() => setShowActionDropdown(false)} aria-hidden="true" />
                  <div className="absolute right-0 top-11 z-[70] bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg shadow-xl py-1 w-44">
                    <button
                      onClick={() => { setShowActionDropdown(false); closeAllActionForms(); setShowLogCallForm(true) }}
                      className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] flex items-center gap-2 transition-colors"
                    >
                      <MdCall size={16} className="text-green-500" /> Log a Call
                    </button>
                    <button
                      onClick={() => { setShowActionDropdown(false); closeAllActionForms(); setShowAdminNoteInput(true) }}
                      className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] flex items-center gap-2 transition-colors"
                    >
                      <MdNote size={16} className="text-blue-500" /> Add a Note
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Stage Dropdown */}
            {showStageDropdown && stageButtonRef.current && (
              <>
                <div
                  className="lead-stage-dropdown-backdrop fixed inset-0 z-[60]"
                  onClick={() => setShowStageDropdown(false)}
                  aria-hidden="true"
                />
                <menu
                  className="lead-stage-dropdown fixed z-[70] bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg shadow-xl p-2 w-[220px]"
                  style={{
                    top: `${stageButtonRef.current.getBoundingClientRect().bottom + 8}px`,
                    left: `${Math.max(8, stageButtonRef.current.getBoundingClientRect().right - 220)}px`,
                  }}
                  role="menu"
                  aria-label="Select lead stage"
                >
                  {['New', 'Engaged', 'Qualified', 'High Intent', 'Booking Made', 'Converted', 'Closed Lost', 'Not Qualified', 'Cold', 'R&R'].map((stage) => (
                    <li key={stage} role="none">
                      <button
                        onClick={() => handleStageChange(stage as LeadStage)}
                        className={`lead-stage-option w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${currentStage === stage
                          ? getStageBadgeClass(stage) + ' font-semibold'
                          : 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]'
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
          <nav className="lead-modal-tabs lead-details-modal-tabs flex border-b border-[var(--border-primary)] flex-shrink-0" role="tablist" aria-label="Lead details sections">
            <button
              onClick={() => setActiveTab('summary')}
              className={`lead-modal-tab lead-details-modal-tab lead-details-modal-tab-summary px-4 py-1.5 text-sm font-medium transition-colors border-b-2 ${activeTab === 'summary'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              role="tab"
              aria-selected={activeTab === 'summary'}
              aria-controls="lead-tabpanel-summary"
              id="lead-tab-summary"
            >
              Summary
            </button>
            <button
              onClick={() => setActiveTab('activity')}
              className={`lead-modal-tab lead-details-modal-tab lead-details-modal-tab-activity px-4 py-1.5 text-sm font-medium transition-colors border-b-2 ${activeTab === 'activity'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              role="tab"
              aria-selected={activeTab === 'activity'}
              aria-controls="lead-tabpanel-activity"
              id="lead-tab-activity"
            >
              Activity
            </button>
            <button
              onClick={() => setActiveTab('breakdown')}
              className={`lead-modal-tab lead-details-modal-tab lead-details-modal-tab-breakdown px-4 py-1.5 text-sm font-medium transition-colors border-b-2 ${activeTab === 'breakdown'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
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
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
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
                  <div className="lead-activity-loading text-sm text-center py-8 text-[var(--text-muted)]" aria-live="polite">
                    <div className="animate-pulse">Loading activities...</div>
                  </div>
                ) : activities.length === 0 ? (
                  <div className="lead-activity-empty text-sm text-center py-8 text-[var(--text-muted)]">
                    No activities yet
                  </div>
                ) : (
                  <ol className="lead-activity-list space-y-4" aria-label="Lead activity timeline">
                    {(() => {
                      // Merge activities with task events for unified timeline
                      const taskActivities: any[] = []
                      leadTasks.forEach((task: any) => {
                        // Task creation event
                        taskActivities.push({
                          id: `task-created-${task.id}`,
                          type: 'proxe',
                          actor: 'PROXe',
                          action: `Created ${task.task_type?.replace(/_/g, ' ')} task`,
                          content: task.task_description || null,
                          timestamp: task.created_at,
                          color: '#8B5CF6',
                          _taskIcon: 'created',
                        })
                        // Task completion event
                        if (task.status === 'completed' && task.completed_at) {
                          taskActivities.push({
                            id: `task-done-${task.id}`,
                            type: 'proxe',
                            actor: 'PROXe',
                            action: task.metadata?.completed_action || `Sent ${task.task_type?.replace(/_/g, ' ')}`,
                            channel: task.metadata?.channel || 'whatsapp',
                            timestamp: task.completed_at,
                            color: '#22C55E',
                            _taskIcon: 'completed',
                          })
                        }
                        // Task failure event
                        if ((task.status === 'failed' || task.status === 'failed_24h_window') && task.completed_at) {
                          taskActivities.push({
                            id: `task-fail-${task.id}`,
                            type: 'proxe',
                            actor: 'PROXe',
                            action: task.error_message || `${task.task_type?.replace(/_/g, ' ')} failed`,
                            timestamp: task.completed_at,
                            color: '#EF4444',
                            _taskIcon: 'failed',
                          })
                        }
                      })
                      const merged = [...activities, ...taskActivities].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                      return merged.map((activity, index) => {
                      const getActivityIcon = () => {
                        if (activity._taskIcon === 'completed') return <MdCheckCircle size={18} />
                        if (activity._taskIcon === 'failed') return <MdReportProblem size={18} />
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
                            {index < merged.length - 1 && (
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
                              <p className="lead-activity-text text-sm mt-1 text-[var(--text-secondary)] leading-relaxed">
                                {renderMarkdown(activity.content)}
                              </p>
                            ) : null}

                            <div className={`lead-activity-header flex items-start justify-between gap-2 mb-1 ${isCustomer ? 'flex-row-reverse' : ''}`}>
                              <div className={`lead-activity-meta flex items-center gap-2 flex-1 min-w-0 ${isCustomer ? 'flex-row-reverse' : ''}`}>
                                <h4 className="lead-activity-action text-sm font-semibold text-[var(--text-primary)]">
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
                              <time className="lead-activity-time text-[10px] uppercase font-medium whitespace-nowrap text-[var(--text-muted)] flex-shrink-0" dateTime={activity.timestamp}>
                                {formatDateTimeIST(activity.timestamp)}
                              </time>
                            </div>
                            <p className="lead-activity-actor text-xs mt-0.5 font-medium" style={{ color }}>
                              {activity.actor || 'Unknown'}
                            </p>
                          </article>
                        </li>
                      )
                    })})()}
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
                    <article className="lead-summary-card p-3 rounded-lg border" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                      <h3 className="lead-summary-title text-xs font-semibold mb-2 flex items-center justify-between text-[var(--text-primary)]">
                        <div className="flex items-center gap-1.5">
                          <MdAutoAwesome size={14} className="text-blue-500" aria-hidden="true" />
                          Summary
                        </div>
                        <button
                          onClick={() => loadUnifiedSummary(true)}
                          disabled={loadingSummary}
                          className="p-0.5 px-1.5 hover:bg-[var(--bg-hover)] rounded-full transition-colors flex items-center gap-1 text-[9px] font-bold disabled:opacity-50 disabled:cursor-not-allowed" style={{ color: 'var(--accent-primary)' }}
                          title="Regenerate summary"
                        >
                          <MdRefresh size={12} className={loadingSummary ? 'animate-spin' : ''} />
                          <span>{loadingSummary ? 'REGENERATING...' : 'REFRESH'}</span>
                        </button>
                      </h3>
                      {loadingSummary && !unifiedSummary ? (
                        <div className="lead-summary-loading-state text-xs text-[var(--text-muted)] py-1" aria-live="polite">
                          <div className="animate-pulse flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"></div>
                            Loading summary...
                          </div>
                        </div>
                      ) : (
                        <div className={`lead-summary-content transition-opacity ${loadingSummary ? 'opacity-60' : 'opacity-100'}`}>
                          <div className="lead-summary-text mb-2">
                            {unifiedSummary ? renderSummary(unifiedSummary) : <p className="text-xs text-[var(--text-muted)]">No summary available. Click Refresh to generate one.</p>}
                          </div>
                          {summaryAttribution && (
                            <footer className="lead-summary-attribution text-[10px] pt-2 border-t border-[var(--border-primary)] text-[var(--text-muted)]">
                              {summaryAttribution}
                            </footer>
                          )}
                        </div>
                      )}
                    </article>

                    {/* Next Actions */}
                    <section className="lead-next-actions mt-4">
                      <h3 className="text-xs font-semibold mb-2 flex items-center gap-1.5 text-[var(--text-primary)]">
                        <MdSchedule size={14} className="text-orange-500" />
                        Next Actions
                      </h3>
                      {loadingTasks ? (
                        <div className="text-xs text-[var(--text-muted)] animate-pulse py-2">Loading tasks...</div>
                      ) : (() => {
                        const pendingTasks = leadTasks.filter(t => ['pending', 'queued', 'awaiting_approval'].includes(t.status))
                        if (pendingTasks.length === 0) {
                          return (
                            <p className="text-xs text-[var(--text-muted)] py-2 italic">
                              No actions scheduled. Add a note to trigger next steps.
                            </p>
                          )
                        }
                        return (
                          <div className="space-y-2">
                            {pendingTasks.map((task: any) => {
                              const typeConfig = getTaskTypeConfig(task.task_type)
                              const actionLabel = getTaskActionLabel(task)
                              const reason = task.metadata?.timing_reason || task.metadata?.next_action_reason || ''
                              return (
                                <div key={task.id} className="flex items-start gap-2 p-2.5 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] group">
                                  <span
                                    className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider flex-shrink-0 mt-0.5"
                                    style={{ color: typeConfig.color, backgroundColor: typeConfig.bg }}
                                  >
                                    {typeConfig.label}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-[var(--text-primary)] capitalize">{actionLabel}</p>
                                    {task.scheduled_at && (
                                      <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                                        <MdSchedule size={11} className="inline mr-0.5 -mt-0.5" />
                                        {formatCountdown(task.scheduled_at)}
                                      </p>
                                    )}
                                    {reason && (
                                      <p className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate">{reason}</p>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => handleCancelTask(task.id)}
                                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-[var(--text-muted)] hover:text-red-500 transition-all flex-shrink-0"
                                    title="Cancel task"
                                  >
                                    <MdClose size={14} />
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })()}
                    </section>

                    {/* Compact Intelligence Insights - Only render when data exists */}
                    {(() => {
                      const hasKeyInfo = summaryData?.keyInfo && (summaryData.keyInfo.budget || summaryData.keyInfo.serviceInterest || summaryData.keyInfo.painPoints)
                      const brandProfileCheck = currentLead.unified_context?.bcon || currentLead.unified_context?.windchasers || {}
                      const hasProfile = Object.keys(brandProfileCheck).length > 0
                      if (!hasKeyInfo && !hasProfile) return null
                      return (
                    <article className="lead-intelligence-insights p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] shadow-sm">
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
                                    <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-tight">Budget</p>
                                    <p className="text-xs font-black text-[var(--text-primary)]">{summaryData.keyInfo.budget}</p>
                                  </div>
                                </div>
                              )}
                              {summaryData.keyInfo.serviceInterest && (
                                <div className="flex items-center gap-2 group">
                                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-all">
                                    <MdOutlineInsights size={14} />
                                  </div>
                                  <div>
                                    <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-tight">Interest</p>
                                    <p className="text-xs font-black text-[var(--text-primary)]">{summaryData.keyInfo.serviceInterest}</p>
                                  </div>
                                </div>
                              )}
                              {summaryData.keyInfo.painPoints && (
                                <div className="flex items-center gap-2 group">
                                  <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-600 dark:text-red-400 group-hover:bg-red-500 group-hover:text-white transition-all">
                                    <MdReportProblem size={14} />
                                  </div>
                                  <div>
                                    <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-tight">Pain Point</p>
                                    <p className="text-xs font-black text-[var(--text-primary)] max-w-[200px] truncate">{summaryData.keyInfo.painPoints}</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Divider Line */}
                        {(summaryData?.keyInfo?.budget || summaryData?.keyInfo?.serviceInterest) && (currentLead.unified_context?.bcon || currentLead.unified_context?.windchasers) && (
                          <div className="h-px bg-[var(--border-primary)] w-full" />
                        )}

                        {/* Lead Profile Group */}
                        {(() => {
                          const brandProfileData = currentLead.unified_context?.bcon || currentLead.unified_context?.windchasers || {};
                          const hasData = Object.keys(brandProfileData).length > 0;
                          if (!hasData) return null;

                          return (
                            <div className="space-y-3">
                              <h4 className="flex items-center gap-2 text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-[0.2em]">
                                <MdPersonOutline size={12} />
                                Lead Profile
                              </h4>
                              <div className="flex flex-wrap gap-x-8 gap-y-3">
                                {brandProfileData.user_type && (
                                  <div className="flex items-center gap-2 group">
                                    <div className="w-8 h-8 rounded-lg bg-[var(--bg-secondary)] flex items-center justify-center text-[var(--text-muted)] group-hover:bg-amber-500 group-hover:text-white transition-all">
                                      <MdPerson size={14} />
                                    </div>
                                    <div>
                                      <p className="text-[9px] font-medium text-[var(--text-muted)] uppercase tracking-tight">Type</p>
                                      <p className="text-xs font-semibold text-[var(--text-primary)] capitalize">{brandProfileData.user_type}</p>
                                    </div>
                                  </div>
                                )}
                                {brandProfileData.course_interest && (
                                  <div className="flex items-center gap-2 group">
                                    <div className="w-8 h-8 rounded-lg bg-[var(--bg-secondary)] flex items-center justify-center text-[var(--text-muted)] group-hover:bg-amber-500 group-hover:text-white transition-all">
                                      <MdFlightTakeoff size={14} />
                                    </div>
                                    <div>
                                      <p className="text-[9px] font-medium text-[var(--text-muted)] uppercase tracking-tight">Course</p>
                                      <p className="text-xs font-semibold text-[var(--text-primary)] capitalize">{brandProfileData.course_interest}</p>
                                    </div>
                                  </div>
                                )}
                                {(brandProfileData.plan_to_fly || brandProfileData.timeline) && (
                                  <div className="flex items-center gap-2 group">
                                    <div className="w-8 h-8 rounded-lg bg-[var(--bg-secondary)] flex items-center justify-center text-[var(--text-muted)] group-hover:bg-amber-500 group-hover:text-white transition-all">
                                      <MdSchedule size={14} />
                                    </div>
                                    <div>
                                      <p className="text-[9px] font-medium text-[var(--text-muted)] uppercase tracking-tight">Timeline</p>
                                      <p className="text-xs font-semibold text-[var(--text-primary)]">
                                        {(() => {
                                          const t = brandProfileData.plan_to_fly || brandProfileData.timeline;
                                          const map: any = { 'asap': 'ASAP', '1-3mo': '1-3m', '6+mo': '6m+', '1yr+': '1y+' };
                                          return map[t] || t;
                                        })()}
                                      </p>
                                    </div>
                                  </div>
                                )}
                                {brandProfileData.education && (
                                  <div className="flex items-center gap-2 group">
                                    <div className="w-8 h-8 rounded-lg bg-[var(--bg-secondary)] flex items-center justify-center text-[var(--text-muted)] group-hover:bg-amber-500 group-hover:text-white transition-all">
                                      <MdSchool size={14} />
                                    </div>
                                    <div>
                                      <p className="text-[9px] font-medium text-[var(--text-muted)] uppercase tracking-tight">Edu</p>
                                      <p className="text-xs font-semibold text-[var(--text-primary)] capitalize">{brandProfileData.education.replace('_', ' ')}</p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </article>
                      )
                    })()}

                    {/* Next step one-liner */}
                    {(() => {
                      const firstPending = leadTasks.find(t => ['pending', 'queued', 'awaiting_approval'].includes(t.status))
                      if (!firstPending) return null
                      const actionLabel = getTaskActionLabel(firstPending)
                      const countdown = firstPending.scheduled_at ? formatCountdown(firstPending.scheduled_at) : ''
                      return (
                        <p className="text-xs text-[var(--text-secondary)] mt-3 pt-3 border-t border-[var(--border-primary)] flex items-center gap-1.5">
                          <MdFlashOn size={13} className="text-orange-500 flex-shrink-0" />
                          <span><strong className="text-[var(--text-primary)]">Next:</strong> {actionLabel} {countdown ? countdown.toLowerCase() : ''}{firstPending.metadata?.next_action_reason ? ` — ${firstPending.metadata.next_action_reason}` : ''}</span>
                        </p>
                      )
                    })()}
                  </section>
                )}

                {/* Score Breakdown Tab */}
                {activeTab === 'breakdown' && (
                  <section
                    id="lead-tabpanel-breakdown"
                    role="tabpanel"
                    aria-labelledby="lead-tab-breakdown"
                    className="lead-tabpanel-breakdown space-y-5"
                  >
                    {calculatedScore ? (
                      <div className="space-y-4">
                        {/* Score headline + Temperature badge */}
                        <div>
                          <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-extrabold text-[var(--text-primary)]">{calculatedScore.score}/100</span>
                            <span className="text-sm font-bold" style={{ color: healthColor.text }}>{healthColor.label}</span>
                            {(() => {
                              const temp = currentLead.unified_context?.lead_temperature
                              if (!temp) return null
                              const tempConfig: Record<string, { color: string; bg: string; label: string }> = {
                                hot:  { color: '#DC2626', bg: 'rgba(220,38,38,0.12)', label: 'HOT' },
                                warm: { color: '#F97316', bg: 'rgba(249,115,22,0.12)', label: 'WARM' },
                                cool: { color: '#3B82F6', bg: 'rgba(59,130,246,0.12)', label: 'COOL' },
                                cold: { color: '#6B7280', bg: 'rgba(107,114,128,0.12)', label: 'COLD' },
                              }
                              const cfg = tempConfig[temp] || tempConfig.warm
                              return (
                                <span
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider"
                                  style={{ color: cfg.color, backgroundColor: cfg.bg }}
                                >
                                  {temp === 'hot' ? '🔥' : temp === 'warm' ? '🟠' : temp === 'cool' ? '🔵' : '⚪'} {cfg.label}
                                </span>
                              )
                            })()}
                          </div>
                          <p className="text-xs text-[var(--text-muted)] mt-1">Based on conversation activity and intent signals</p>
                        </div>

                        {/* Temperature History Timeline */}
                        {currentLead.unified_context?.temperature_history?.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2">Temperature History</p>
                            <div className="flex items-center gap-0.5 overflow-x-auto pb-1">
                              {(currentLead.unified_context.temperature_history as Array<{temperature: string; timestamp: string; reason: string}>).slice(-15).map((entry: {temperature: string; timestamp: string; reason: string}, i: number) => {
                                const dotColor = entry.temperature === 'hot' ? '#DC2626' : entry.temperature === 'warm' ? '#F97316' : entry.temperature === 'cool' ? '#3B82F6' : '#6B7280'
                                const time = new Date(entry.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                                return (
                                  <div key={i} className="flex flex-col items-center group relative" title={`${entry.temperature}: ${entry.reason}\n${time}`}>
                                    <div
                                      className="w-3 h-3 rounded-full flex-shrink-0 cursor-pointer transition-transform group-hover:scale-150"
                                      style={{ backgroundColor: dotColor }}
                                    />
                                    {i < (currentLead.unified_context.temperature_history as Array<any>).slice(-15).length - 1 && (
                                      <div className="w-3 h-px bg-[var(--border-secondary)]" />
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {/* Signals list */}
                        <div className="space-y-1.5">
                          {/* Positive signals */}
                          {calculatedScore.breakdown.details.hasBooking && (
                            <p className="text-sm text-green-500 dark:text-green-400">+ Booking recorded</p>
                          )}
                          {calculatedScore.breakdown.details.hasContact && (
                            <p className="text-sm text-green-500 dark:text-green-400">+ Direct contact info provided</p>
                          )}
                          {calculatedScore.breakdown.details.responseRate >= 80 && (
                            <p className="text-sm text-green-500 dark:text-green-400">+ {calculatedScore.breakdown.details.responseRate}% response rate</p>
                          )}
                          {calculatedScore.breakdown.details.msgCount >= 5 && (
                            <p className="text-sm text-green-500 dark:text-green-400">+ {calculatedScore.breakdown.details.msgCount} messages exchanged</p>
                          )}
                          {calculatedScore.breakdown.details.multiChannel && (
                            <p className="text-sm text-green-500 dark:text-green-400">+ Multi-channel engagement</p>
                          )}
                          {calculatedScore.breakdown.details.sentimentScore >= 50 && (
                            <p className="text-sm text-green-500 dark:text-green-400">+ Positive sentiment</p>
                          )}
                          {calculatedScore.breakdown.details.daysInactive <= 2 && (
                            <p className="text-sm text-green-500 dark:text-green-400">+ Active recently</p>
                          )}

                          {/* Negative signals */}
                          {calculatedScore.breakdown.details.buyingScore < 40 && (
                            <p className="text-sm text-orange-500 dark:text-orange-400">- Buying signals low ({calculatedScore.breakdown.details.buyingScore}%)</p>
                          )}
                          {!calculatedScore.breakdown.details.multiChannel && (
                            <p className="text-sm text-orange-500 dark:text-orange-400">- Single channel only</p>
                          )}
                          {calculatedScore.breakdown.details.intentScore < 80 && calculatedScore.breakdown.details.intentScore > 0 && (
                            <p className="text-sm text-orange-500 dark:text-orange-400">- Intent level moderate ({calculatedScore.breakdown.details.intentScore}%)</p>
                          )}
                          {calculatedScore.breakdown.details.intentScore === 0 && (
                            <p className="text-sm text-red-500 dark:text-red-400">- No intent signals detected</p>
                          )}
                          {!calculatedScore.breakdown.details.hasBooking && (
                            <p className="text-sm text-orange-500 dark:text-orange-400">- No booking yet</p>
                          )}
                          {!calculatedScore.breakdown.details.hasContact && (
                            <p className="text-sm text-red-500 dark:text-red-400">- No contact info</p>
                          )}
                          {calculatedScore.breakdown.details.responseRate < 80 && calculatedScore.breakdown.details.responseRate > 0 && (
                            <p className="text-sm text-orange-500 dark:text-orange-400">- Response rate low ({calculatedScore.breakdown.details.responseRate}%)</p>
                          )}
                          {calculatedScore.breakdown.details.daysInactive > 3 && (
                            <p className="text-sm text-red-500 dark:text-red-400">- Inactive for {calculatedScore.breakdown.details.daysInactive} days</p>
                          )}
                          {calculatedScore.breakdown.details.sentimentScore < 50 && (
                            <p className="text-sm text-orange-500 dark:text-orange-400">- Neutral sentiment</p>
                          )}
                          {calculatedScore.breakdown.details.msgCount < 5 && (
                            <p className="text-sm text-orange-500 dark:text-orange-400">- Low message volume ({calculatedScore.breakdown.details.msgCount})</p>
                          )}
                        </div>

                        {/* Next step */}
                        <p className="text-sm font-semibold text-[var(--text-primary)] pt-1">
                          {calculatedScore.score >= 80
                            ? 'High intent - ready for direct outreach or closing.'
                            : calculatedScore.score >= 60
                              ? calculatedScore.breakdown.details.hasBooking
                                ? 'Booking exists - confirm attendance and prep for the call.'
                                : 'Warm lead - push for a booking or direct call.'
                              : calculatedScore.score >= 40
                                ? 'Needs a follow-up to re-engage - conversation stalled.'
                                : 'Cold lead - nurture with value content or re-qualify.'}
                        </p>
                      </div>
                    ) : (
                      <div className="text-center py-20 animate-pulse text-[var(--text-muted)]">
                        Analyzing...
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
                      <div className="lead-interaction-loading text-sm text-center py-8 text-[var(--text-muted)]" aria-live="polite">
                        <div className="animate-pulse">Loading interaction data...</div>
                      </div>
                    ) : interaction30Days ? (
                      <div className="lead-interaction-grid grid grid-cols-2 gap-6">
                        {/* Left Column - Stats */}
                        <section className="lead-interaction-stats space-y-4">
                          {/* Total Interactions */}
                          <article className="lead-interaction-total p-4 bg-blue-50/50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-800/20">
                            <div className="flex items-baseline gap-2">
                              <p className="lead-interaction-total-value text-5xl font-extrabold text-blue-600 dark:text-blue-400" aria-label={`${interaction30Days.totalInteractions} total interactions in first 30 days`}>
                                {interaction30Days.totalInteractions}
                              </p>
                              <span className="text-xs font-semibold text-blue-600/60 dark:text-blue-400/60 uppercase">Interactions</span>
                            </div>
                            <p className="lead-interaction-total-label text-[10px] text-[var(--text-muted)] mt-1 uppercase tracking-wider font-medium">First 30 days activity</p>
                          </article>

                          <div className="grid grid-cols-1 gap-3">
                            {/* Lead In Day */}
                            <article className="lead-interaction-lead-in p-3 bg-[var(--bg-primary)] rounded-lg border border-[var(--border-primary)] shadow-sm">
                              <p className="lead-interaction-label text-[10px] text-[var(--text-muted)] mb-1 uppercase tracking-wider font-bold">Contact Created</p>
                              <p className="lead-interaction-value text-sm font-semibold text-[var(--text-primary)]">
                                {interaction30Days.leadInDay || 'Unknown'}
                              </p>
                            </article>

                            {/* Last Touch Day */}
                            <article className="lead-interaction-last-touch p-3 bg-[var(--bg-primary)] rounded-lg border border-[var(--border-primary)] shadow-sm">
                              <p className="lead-interaction-label text-[10px] text-[var(--text-muted)] mb-1 uppercase tracking-wider font-bold">Latest Touchpoint</p>
                              <p className="lead-interaction-value text-sm font-semibold text-[var(--text-primary)]">
                                {interaction30Days.lastTouchDay || 'No interactions yet'}
                              </p>
                            </article>
                          </div>

                          <div className="interaction-legend pt-4">
                            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-bold mb-2">Legend</p>
                            <div className="flex items-center gap-2">
                              {[0.08, 0.5, 0.85, 1.0].map((op, i) => (
                                <div key={i} className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'var(--accent-primary)', opacity: op }}></div>
                              ))}
                              <span className="text-[10px] text-[var(--text-muted)] ml-1">Low → High Activity</span>
                            </div>
                          </div>
                        </section>

                        {/* Right Column - Calendar */}
                        <section className="lead-interaction-calendar w-full" aria-label="30-day interaction calendar">
                          {(() => {
                            // Helper function to get a local date string in YYYY-MM-DD format
                            const getLocalDateKey = (date: Date): string => {
                              const year = date.getFullYear();
                              const month = (date.getMonth() + 1).toString().padStart(2, '0');
                              const day = date.getDate().toString().padStart(2, '0');
                              return `${year}-${month}-${day}`;
                            };

                            // Get first touchpoint date
                            const firstTouchpoint = new Date(lead?.created_at || lead?.timestamp || new Date())
                            firstTouchpoint.setHours(0, 0, 0, 0)

                            const startMonth = firstTouchpoint.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

                            // Build a map of date -> count for quick lookup
                            const dateCountMap = new Map<string, number>()
                            interaction30Days.dailyData.forEach(d => {
                              dateCountMap.set(d.date, d.count)
                            })

                            // Generate all 30 days starting from first touchpoint using helper
                            const allDays: Array<{ date: Date; dateStr: string; count: number; dayOfWeek: number }> = []
                            for (let i = 0; i < 30; i++) {
                              const date = new Date(firstTouchpoint)
                              date.setDate(date.getDate() + i)
                              const dateStr = getLocalDateKey(date)
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
                                {/* Calendar Title */}
                                <div className="lead-calendar-title mb-4 bg-[var(--bg-secondary)] p-2 rounded-lg flex items-center justify-between">
                                  <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest">{startMonth}</p>
                                  <div className="flex gap-1">
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                                    <span className="text-[8px] font-bold text-blue-500 uppercase">Live Journey</span>
                                  </div>
                                </div>

                                {/* Day labels row at top */}
                                <div className="lead-calendar-header grid grid-cols-7 gap-3 mb-3 border-b border-[var(--border-primary)] pb-2" role="row">
                                  {dayNames.map((dayName, index) => (
                                    <div key={index} className="lead-calendar-day-label text-center text-[10px] text-[var(--text-muted)] font-bold" role="columnheader">
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
                                            className="lead-calendar-day rounded-[3px] cursor-pointer transition-all hover:ring-2 hover:ring-blue-400 hover:scale-110 flex-shrink-0"
                                            style={{
                                              width: `24px`,
                                              height: `24px`,
                                              backgroundColor: 'var(--accent-primary)',
                                              opacity: opacity,
                                              minWidth: '24px',
                                              minHeight: '24px',
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
                      <div className="lead-interaction-empty text-sm text-center py-4 text-[var(--text-muted)]">
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
