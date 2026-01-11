'use client'

import { useState, useEffect, useRef } from 'react'
import { formatDateTime, formatDate } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { MdLanguage, MdChat, MdPhone, MdShare, MdAutoAwesome, MdOpenInNew, MdHistory, MdCall, MdEvent, MdMessage, MdNote, MdEdit, MdTrendingUp, MdTrendingDown, MdRemove, MdCheckCircle, MdSchedule } from 'react-icons/md'
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
    color: '#8B5CF6',
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
  const [activeTab, setActiveTab] = useState<'activity' | 'summary' | 'breakdown'>('activity')
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

  // Load all data when lead changes
  useEffect(() => {
    if (lead && isOpen) {
      loadUnifiedSummary()
      loadActivities()
      loadChannelData()
      loadQuickStats()
      loadScoreHistory()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead, isOpen])

  const loadUnifiedSummary = async () => {
    if (!lead) return
    setLoadingSummary(true)
    try {
      const response = await fetch(`/api/dashboard/leads/${lead.id}/summary`)
      const data = await response.json()
      if (data.summary) {
        setUnifiedSummary(data.summary)
        setSummaryAttribution(data.attribution || '')
        setSummaryData(data.data || null)
      }
    } catch (error) {
      console.error('Error loading unified summary:', error)
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
      const { data: messages } = await supabase
        .from('conversations')
        .select('sender, created_at')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: true })

      if (messages && Array.isArray(messages) && messages.length > 0) {
        const customerMessages = messages.filter((m: any) => m.sender === 'customer').length
        const responseRate = Math.round((customerMessages / messages.length) * 100)

        // Calculate average response time
        let totalResponseTime = 0
        let responseCount = 0
        for (let i = 0; i < messages.length - 1; i++) {
          const msg1 = messages[i] as any
          const msg2 = messages[i + 1] as any
          if (msg1.sender === 'customer' && msg2.sender === 'agent') {
            const timeDiff = new Date(msg2.created_at).getTime() - new Date(msg1.created_at).getTime()
            totalResponseTime += timeDiff
            responseCount++
          }
        }
        const avgResponseTime = responseCount > 0 ? Math.round(totalResponseTime / responseCount / 60000) : 0 // in minutes

        setQuickStats({
          totalMessages: messages.length,
          responseRate,
          avgResponseTime,
          hasBooking: !!lead.booking_date,
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

  // Calculate days in pipeline
  const daysInPipeline = Math.floor((new Date().getTime() - new Date(lead.timestamp).getTime()) / (1000 * 60 * 60 * 24))

  // Calculate days inactive
  const lastInteraction: string | null = lead.last_interaction_at || lead.unified_context?.last_interaction_at || lead.timestamp || null
  const daysInactive = lastInteraction ? Math.floor((new Date().getTime() - new Date(lastInteraction).getTime()) / (1000 * 60 * 60 * 24)) : 0

  // Get health score and color
  const score = lead.lead_score ?? 0
  const getHealthColor = (score: number) => {
    if (score >= 70) return { bg: '#EF4444', text: '#FFFFFF', label: 'Hot' }
    if (score >= 40) return { bg: '#F97316', text: '#FFFFFF', label: 'Warm' }
    return { bg: '#3B82F6', text: '#FFFFFF', label: 'Cold' }
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
    if (lead.lead_stage && !lead.stage_override) {
      return lead.lead_stage
    }
    
    // Simple auto-detection based on score and activity
    if (score >= 86 || lead.booking_date) return 'Booking Made'
    if (score >= 61) return 'High Intent'
    if (score >= 31) return 'Qualified'
    if (quickStats.totalMessages > 3) return 'Engaged'
    return 'New'
  }
  const detectedStage = autoDetectStage()
  const currentStage = lead.lead_stage || detectedStage

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
      'In Sequence': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      'Cold': 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
    }
    return stageColors[stage] || stageColors['New']
  }

  // Handle stage change
  const handleStageChange = (newStage: LeadStage) => {
    const oldStage: string | null = lead.lead_stage || null
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
        .select('lead_stage, sub_stage, lead_score, stage_override')
        .eq('id', lead.id)
        .single()
      
      if (data) {
        const leadData = data as any
        Object.assign(lead, {
          lead_stage: leadData.lead_stage,
          sub_stage: leadData.sub_stage,
          lead_score: leadData.lead_score,
          stage_override: leadData.stage_override
        })
      }

      setShowActivityModal(false)
      setPendingStageChange(null)
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
          className="relative w-full max-w-4xl bg-white dark:bg-[#1A1A1A] rounded-lg shadow-xl z-50"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-[#262626]">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{lead.name}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">{lead.email || lead.phone || 'No contact info'}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* TOP SECTION - Lead Health Card */}
          <div className="p-6 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-[#1F1F1F] dark:to-[#262626] border-b border-gray-200 dark:border-[#262626]">
            <div className="flex items-center justify-between gap-6">
              {/* Large Score Badge */}
              <div className="flex items-center gap-4">
                <div 
                  className="w-24 h-24 rounded-2xl flex flex-col items-center justify-center shadow-lg"
                  style={{ backgroundColor: healthColor.bg, color: healthColor.text }}
                >
                  <span className="text-4xl font-bold">{score}</span>
                  <span className="text-xs font-medium opacity-90">{healthColor.label}</span>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Lead Health</span>
                    {healthTrend && (
                      <div className="flex items-center gap-1 text-xs" style={{ color: healthTrend.color }}>
                        <healthTrend.icon size={16} />
                        <span>{healthTrend.label}</span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {daysInPipeline} days in pipeline • {daysInactive} days inactive
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Last activity: {lastInteraction ? formatDateTimeIST(lastInteraction) : 'Never'}
                  </p>
                </div>
              </div>

              {/* Stage Badge */}
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <div className={`px-4 py-2 rounded-lg text-base font-semibold ${getStageBadgeClass(currentStage)}`}>
                    {currentStage}
                  </div>
                  <button
                    onClick={() => setShowStageDropdown(!showStageDropdown)}
                    className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    title="Edit stage"
                  >
                    <MdEdit size={18} />
                  </button>
                </div>
                <div className="mt-2">
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{
                        width: `${getStageProgress()}%`,
                        backgroundColor: healthColor.bg,
                      }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {stageDuration} days in {currentStage}
                  </p>
                </div>
              </div>
            </div>

            {/* Stage Dropdown */}
            {showStageDropdown && (
              <>
                <div className="fixed inset-0 z-[60]" onClick={() => setShowStageDropdown(false)} />
                <div className="absolute right-6 top-32 z-[70] bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#262626] rounded-lg shadow-xl p-2 w-[220px]">
                  {['New', 'Engaged', 'Qualified', 'High Intent', 'Booking Made', 'Converted', 'Closed Lost', 'In Sequence', 'Cold'].map((stage) => (
                    <button
                      key={stage}
                      onClick={() => handleStageChange(stage as LeadStage)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                        currentStage === stage
                          ? getStageBadgeClass(stage) + ' font-semibold'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {stage}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* CHANNEL TIMELINE */}
          {activeChannels.length > 0 && (
            <div className="p-6 border-b border-gray-200 dark:border-[#262626]">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Customer Journey</h3>
              <div className="flex items-center gap-4">
                {activeChannels.map((channel, index) => (
                  <div key={channel.key} className="flex items-center gap-2">
                    <div className="flex flex-col items-center">
                      <div 
                        className="w-12 h-12 rounded-full flex items-center justify-center text-white shadow-md"
                        style={{ backgroundColor: channel.color }}
                      >
                        <channel.icon size={24} />
                      </div>
                      <div className="mt-2 text-center">
                        <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{channel.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{channel.count} msgs</p>
                        {channel.firstDate && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            {formatDateIST(channel.firstDate)}
                          </p>
                        )}
                      </div>
                    </div>
                    {index < activeChannels.length - 1 && (
                      <div className="w-8 h-0.5 bg-gray-300 dark:bg-gray-600 mx-2" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* QUICK STATS ROW */}
          <div className="p-6 border-b border-gray-200 dark:border-[#262626]">
            <div className="grid grid-cols-4 gap-4">
              <div className="p-4 bg-gray-50 dark:bg-[#1F1F1F] rounded-lg">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Messages</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{quickStats.totalMessages}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">exchanged</p>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-[#1F1F1F] rounded-lg">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Response Rate</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{quickStats.responseRate}%</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">customer replies</p>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-[#1F1F1F] rounded-lg">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Avg Response</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {quickStats.avgResponseTime > 0 ? `${quickStats.avgResponseTime}m` : '-'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">response time</p>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-[#1F1F1F] rounded-lg">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Booking</p>
                {quickStats.hasBooking ? (
                  <>
                    <div className="flex items-center gap-2">
                      <MdCheckCircle className="text-green-500" size={24} />
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {formatDateIST(lead.booking_date)}
                      </p>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {formatBookingTime(lead.booking_time)}
                    </p>
                  </>
                ) : (
                  <p className="text-2xl font-bold text-gray-400 dark:text-gray-500">-</p>
                )}
              </div>
            </div>
          </div>

          {/* TABS */}
          <div className="flex border-b border-gray-200 dark:border-[#262626]">
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
          </div>

          {/* TAB CONTENT */}
          <div className="p-6 max-h-[50vh] overflow-y-auto">
            {/* Activity Tab */}
            {activeTab === 'activity' && (
              <div>
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
                          return activity.icon === 'sequence' ? <MdHistory size={16} /> : <MdMessage size={16} />
                        } else if (activity.type === 'team') {
                          switch (activity.icon) {
                            case 'call': return <MdCall size={16} />
                            case 'meeting': return <MdEvent size={16} />
                            case 'message': return <MdMessage size={16} />
                            case 'note': return <MdNote size={16} />
                            default: return <MdHistory size={16} />
                          }
                        } else {
                          return activity.icon === 'booking' ? <MdEvent size={16} /> : <MdMessage size={16} />
                        }
                      }
                      const color = activity.color || '#6B7280'
                      const Icon = getActivityIcon()
                      return (
                        <div key={activity.id} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: color }}>
                              {Icon}
                            </div>
                            {index < activities.length - 1 && (
                              <div className="w-0.5 flex-1 mt-2" style={{ backgroundColor: color, opacity: 0.3 }} />
                            )}
                          </div>
                          <div className="flex-1 pb-4">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <div>
                                <p className="text-sm font-medium text-gray-900 dark:text-white">
                                  {activity.action || 'Activity'}
                                </p>
                                <p className="text-xs mt-0.5" style={{ color }}>
                                  {activity.actor || 'Unknown'}
                                </p>
                              </div>
                              <span className="text-xs whitespace-nowrap text-gray-500 dark:text-gray-400">
                                {formatDateTimeIST(activity.timestamp)}
                              </span>
                            </div>
                            {activity.content && (
                              <p className="text-xs mt-1 text-gray-600 dark:text-gray-400">
                                {activity.content}
                              </p>
                            )}
                            {activity.channel && (
                              <span className="text-xs mt-1 inline-block px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                                via {activity.channel}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

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
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-gray-50 dark:bg-[#1F1F1F]">
                  <h3 className="text-sm font-semibold mb-4 text-gray-900 dark:text-white">Score Components</h3>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-xs text-gray-600 dark:text-gray-400">AI Analysis (60%)</span>
                        <span className="text-xs font-semibold text-gray-900 dark:text-white">
                          {Math.round(score * 0.6)}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div className="h-2 rounded-full bg-blue-500" style={{ width: `${score * 0.6}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-xs text-gray-600 dark:text-gray-400">Activity (30%)</span>
                        <span className="text-xs font-semibold text-gray-900 dark:text-white">
                          {Math.round(score * 0.3)}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div className="h-2 rounded-full bg-green-500" style={{ width: `${score * 0.3}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-xs text-gray-600 dark:text-gray-400">Business Signals (10%)</span>
                        <span className="text-xs font-semibold text-gray-900 dark:text-white">
                          {Math.round(score * 0.1)}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div className="h-2 rounded-full bg-purple-500" style={{ width: `${score * 0.1}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-gray-50 dark:bg-[#1F1F1F]">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Score is calculated automatically based on engagement, intent signals, and activity patterns.
                    {lead.last_scored_at && ` Last updated: ${formatDateTimeIST(lead.last_scored_at)}`}
                  </p>
                </div>
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
          leadName={lead.name || 'Lead'}
          stageChange={{
            oldStage: pendingStageChange.oldStage,
            newStage: pendingStageChange.newStage
          }}
        />
      )}
    </>
  )
}
