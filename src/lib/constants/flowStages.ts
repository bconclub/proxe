/**
 * Flow Stages Constants - 9 Stage System
 * 
 * Complete journey stage definitions for the Flow Builder
 */

import { 
  MdTouchApp, 
  MdMessage, 
  MdChat, 
  MdTrendingUp, 
  MdEvent, 
  MdPhoneMissed, 
  MdVideocam, 
  MdDescription, 
  MdCheckCircle,
  MdArrowForward,
} from 'react-icons/md'
import { IconType } from 'react-icons'

// ============================================================================
// TYPES
// ============================================================================

export type JourneyStageId = 
  | 'one_touch' 
  | 'low_touch' 
  | 'engaged' 
  | 'high_intent' 
  | 'booking_made' 
  | 'no_show' 
  | 'demo_taken' 
  | 'proposal_sent' 
  | 'converted'

export type Channel = 'whatsapp' | 'voice' | 'sms' | 'email'
export type Tone = 'soft' | 'normal' | 'aggressive' | 'very_aggressive'
export type Variant = 'A' | 'B' | 'C'
export type TemplateStatus = 'empty' | 'pending' | 'approved' | 'rejected'

export interface TemplateSlot {
  day: number
  channel: Channel
  variant: Variant
  status: TemplateStatus
  templateName?: string
}

export interface TimingRule {
  day: number
  offsetHours: number
  channels: Channel[]
  tone: Tone
  description: string
}

export interface JourneyStage {
  id: JourneyStageId
  name: string
  slug: string
  description: string
  condition: string
  timing: string
  timingRules: TimingRule[]
  channels: Channel[]
  tone: Tone
  color: string
  icon: IconType
  isTerminal: boolean
  requiresSetup: boolean
  // Days that should be shown in the grid (1, 3, 7, 30)
  gridDays: number[]
}

// ============================================================================
// 9 STAGE DEFINITIONS
// ============================================================================

export const JOURNEY_STAGES: JourneyStage[] = [
  {
    id: 'one_touch',
    name: 'One Touch',
    slug: 'one-touch',
    description: 'Initial contact, low engagement',
    condition: 'response_count < 2',
    timing: 'Day 1, 3, 7, 30',
    gridDays: [1, 3, 7, 30],
    timingRules: [
      { day: 1, offsetHours: 24, channels: ['whatsapp'], tone: 'soft', description: 'Initial follow-up' },
      { day: 3, offsetHours: 72, channels: ['whatsapp'], tone: 'soft', description: 'Value reminder' },
      { day: 7, offsetHours: 168, channels: ['whatsapp'], tone: 'soft', description: 'Weekly check-in' },
      { day: 30, offsetHours: 720, channels: ['whatsapp'], tone: 'normal', description: 'Monthly touch' },
    ],
    channels: ['whatsapp'],
    tone: 'soft',
    color: '#22c55e', // Green for soft
    icon: MdTouchApp,
    isTerminal: false,
    requiresSetup: true,
  },
  {
    id: 'low_touch',
    name: 'Low Touch',
    slug: 'low-touch',
    description: 'Early engagement building',
    condition: 'response_count 2-5',
    timing: 'Day 3, 7, 30',
    gridDays: [3, 7, 30],
    timingRules: [
      { day: 3, offsetHours: 72, channels: ['whatsapp'], tone: 'normal', description: 'Engagement boost' },
      { day: 7, offsetHours: 168, channels: ['whatsapp', 'voice'], tone: 'normal', description: 'Voice intro' },
      { day: 30, offsetHours: 720, channels: ['whatsapp'], tone: 'normal', description: 'Monthly nurture' },
    ],
    channels: ['whatsapp', 'voice'],
    tone: 'normal',
    color: '#3b82f6', // Blue for normal
    icon: MdMessage,
    isTerminal: false,
    requiresSetup: true,
  },
  {
    id: 'engaged',
    name: 'Engaged',
    slug: 'engaged',
    description: 'Active conversation flow',
    condition: '5+ messages exchanged',
    timing: 'Day 3, 7, 30',
    gridDays: [3, 7, 30],
    timingRules: [
      { day: 3, offsetHours: 72, channels: ['whatsapp'], tone: 'normal', description: 'Value add' },
      { day: 7, offsetHours: 168, channels: ['whatsapp', 'voice'], tone: 'normal', description: 'Voice escalation' },
      { day: 30, offsetHours: 720, channels: ['whatsapp'], tone: 'normal', description: 'Monthly check' },
    ],
    channels: ['whatsapp', 'voice'],
    tone: 'normal',
    color: '#3b82f6', // Blue for normal
    icon: MdChat,
    isTerminal: false,
    requiresSetup: true,
  },
  {
    id: 'high_intent',
    name: 'High Intent',
    slug: 'high-intent',
    description: 'Strong buying signals detected',
    condition: 'lead_score >= 61',
    timing: 'Day 1 (msg+call), 3, 7',
    gridDays: [1, 3, 7],
    timingRules: [
      { day: 1, offsetHours: 24, channels: ['whatsapp', 'voice'], tone: 'aggressive', description: 'Immediate voice + WhatsApp' },
      { day: 1, offsetHours: 28, channels: ['voice'], tone: 'aggressive', description: 'Voice follow-up +4h' },
      { day: 3, offsetHours: 72, channels: ['whatsapp', 'voice'], tone: 'aggressive', description: 'Aggressive follow-up' },
      { day: 7, offsetHours: 168, channels: ['whatsapp'], tone: 'aggressive', description: 'Final push' },
    ],
    channels: ['whatsapp', 'voice'],
    tone: 'aggressive',
    color: '#f59e0b', // Orange for aggressive
    icon: MdTrendingUp,
    isTerminal: false,
    requiresSetup: true,
  },
  {
    id: 'booking_made',
    name: 'Booking Made',
    slug: 'booking-made',
    description: 'Call scheduled and confirmed',
    condition: 'booking confirmed',
    timing: '24h, 30m, Day 7',
    gridDays: [1, 7], // 1 = day of booking (24h before, 30m before)
    timingRules: [
      { day: 1, offsetHours: -24, channels: ['whatsapp'], tone: 'normal', description: '24h reminder before call' },
      { day: 1, offsetHours: -0.5, channels: ['whatsapp', 'voice'], tone: 'aggressive', description: '30min reminder' },
      { day: 7, offsetHours: 168, channels: ['whatsapp'], tone: 'normal', description: 'Post-booking follow-up' },
    ],
    channels: ['whatsapp', 'voice'],
    tone: 'aggressive',
    color: '#f59e0b', // Orange for aggressive
    icon: MdEvent,
    isTerminal: false,
    requiresSetup: true,
  },
  {
    id: 'no_show',
    name: 'No Show',
    slug: 'no-show',
    description: 'Missed scheduled appointment',
    condition: 'booking missed',
    timing: 'Immediate, Day 1, 3, 7',
    gridDays: [1, 3, 7],
    timingRules: [
      { day: 1, offsetHours: 0.5, channels: ['whatsapp', 'voice'], tone: 'aggressive', description: 'Immediate 30m recovery' },
      { day: 1, offsetHours: 24, channels: ['whatsapp'], tone: 'aggressive', description: 'Day 1 recovery' },
      { day: 3, offsetHours: 72, channels: ['whatsapp', 'voice'], tone: 'aggressive', description: 'Day 3 recovery' },
      { day: 7, offsetHours: 168, channels: ['whatsapp'], tone: 'very_aggressive', description: 'Final recovery' },
    ],
    channels: ['whatsapp', 'voice'],
    tone: 'aggressive',
    color: '#f59e0b', // Orange for aggressive
    icon: MdPhoneMissed,
    isTerminal: false,
    requiresSetup: true,
  },
  {
    id: 'demo_taken',
    name: 'Demo Taken',
    slug: 'demo-taken',
    description: 'Product demo completed',
    condition: 'demo completed',
    timing: 'Day 1 (msg+call), 3, 7',
    gridDays: [1, 3, 7],
    timingRules: [
      { day: 1, offsetHours: 24, channels: ['whatsapp'], tone: 'normal', description: 'Thank you + next steps' },
      { day: 1, offsetHours: 28, channels: ['voice'], tone: 'normal', description: 'Voice follow-up +4h' },
      { day: 3, offsetHours: 72, channels: ['whatsapp'], tone: 'aggressive', description: 'Value reinforcement' },
      { day: 7, offsetHours: 168, channels: ['whatsapp', 'voice'], tone: 'aggressive', description: 'Close push' },
    ],
    channels: ['whatsapp', 'voice'],
    tone: 'aggressive',
    color: '#f59e0b', // Orange for aggressive
    icon: MdVideocam,
    isTerminal: false,
    requiresSetup: true,
  },
  {
    id: 'proposal_sent',
    name: 'Proposal Sent',
    slug: 'proposal-sent',
    description: 'Pricing/proposal delivered',
    condition: 'proposal delivered',
    timing: 'Day 1, 3, 7',
    gridDays: [1, 3, 7],
    timingRules: [
      { day: 1, offsetHours: 4, channels: ['voice'], tone: 'aggressive', description: 'Voice confirmation +4h' },
      { day: 1, offsetHours: 24, channels: ['whatsapp'], tone: 'aggressive', description: 'Day 1 follow-up' },
      { day: 3, offsetHours: 72, channels: ['whatsapp', 'voice'], tone: 'very_aggressive', description: 'Day 3 push' },
      { day: 7, offsetHours: 168, channels: ['whatsapp', 'voice'], tone: 'very_aggressive', description: 'Final close' },
    ],
    channels: ['whatsapp', 'voice'],
    tone: 'very_aggressive',
    color: '#ef4444', // Red for very aggressive
    icon: MdDescription,
    isTerminal: false,
    requiresSetup: true,
  },
  {
    id: 'converted',
    name: 'Converted / Closed Lost',
    slug: 'converted',
    description: 'Final stage - deal outcome',
    condition: 'deal closed',
    timing: 'No follow-up',
    gridDays: [],
    timingRules: [],
    channels: [],
    tone: 'normal',
    color: '#10b981', // Green for terminal
    icon: MdCheckCircle,
    isTerminal: true,
    requiresSetup: false,
  },
]

// ============================================================================
// LOOKUP MAPS
// ============================================================================

export const STAGE_MAP: Record<JourneyStageId, JourneyStage> = JOURNEY_STAGES.reduce(
  (acc, stage) => ({ ...acc, [stage.id]: stage }),
  {} as Record<JourneyStageId, JourneyStage>
)

export const STAGE_ORDER: JourneyStageId[] = [
  'one_touch',
  'low_touch',
  'engaged',
  'high_intent',
  'booking_made',
  'no_show',
  'demo_taken',
  'proposal_sent',
  'converted',
]

// Map lead stage to journey stage
export const LEAD_STAGE_TO_JOURNEY: Record<string, JourneyStageId> = {
  'New': 'one_touch',
  'One Touch': 'one_touch',
  'Qualified': 'low_touch',
  'Low Touch': 'low_touch',
  'Engaged': 'engaged',
  'High Intent': 'high_intent',
  'Booking Made': 'booking_made',
  'No Show': 'no_show',
  'Demo Taken': 'demo_taken',
  'Proposal Sent': 'proposal_sent',
  'Converted': 'converted',
  'Closed Won': 'converted',
  'Closed Lost': 'converted',
  'In Sequence': 'one_touch',
  'Cold': 'one_touch',
}

// ============================================================================
// HELPERS
// ============================================================================

export function getStage(stageId: JourneyStageId): JourneyStage {
  return STAGE_MAP[stageId]
}

export function getToneColor(tone: Tone): { bg: string; color: string; label: string } {
  switch (tone) {
    case 'soft':
      return { bg: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', label: 'Soft' }
    case 'normal':
      return { bg: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', label: 'Normal' }
    case 'aggressive':
      return { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', label: 'Aggressive' }
    case 'very_aggressive':
      return { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', label: 'Very Aggressive' }
    default:
      return { bg: 'rgba(255, 255, 255, 0.06)', color: '#9ca3af', label: 'Normal' }
  }
}

export function getChannelIcon(channel: Channel): string {
  switch (channel) {
    case 'whatsapp': return '💬'
    case 'voice': return '📞'
    case 'sms': return '✉️'
    case 'email': return '📧'
    default: return '📱'
  }
}

export function getChannelLabel(channel: Channel): string {
  switch (channel) {
    case 'whatsapp': return 'WhatsApp'
    case 'voice': return 'Voice'
    case 'sms': return 'SMS'
    case 'email': return 'Email'
    default: return channel
  }
}

/**
 * Get all slots for a stage (all day/channel combinations)
 */
export function getTemplateSlotsForStage(stageId: JourneyStageId): { day: number; channel: Channel }[] {
  const stage = STAGE_MAP[stageId]
  if (!stage || stage.isTerminal) return []
  
  const slots: { day: number; channel: Channel }[] = []
  const seen = new Set<string>()
  
  stage.timingRules.forEach(rule => {
    rule.channels.forEach(channel => {
      const key = `${rule.day}-${channel}`
      if (!seen.has(key)) {
        seen.add(key)
        slots.push({ day: rule.day, channel })
      }
    })
  })
  
  return slots
}

/**
 * Check if a slot is applicable for a stage
 */
export function isSlotApplicable(stageId: JourneyStageId, day: number, channel: Channel): boolean {
  const stage = STAGE_MAP[stageId]
  if (!stage) return false
  
  return stage.timingRules.some(rule => 
    rule.day === day && rule.channels.includes(channel)
  )
}

/**
 * Get template status color
 */
export function getTemplateStatusColor(status: TemplateStatus): string {
  switch (status) {
    case 'approved': return '#22c55e'
    case 'pending': return '#f59e0b'
    case 'rejected': return '#ef4444'
    case 'empty': return '#6b7280'
    default: return '#6b7280'
  }
}

/**
 * Calculate stage coverage percentage
 */
export function calculateStageCoverage(
  stageId: JourneyStageId,
  assignedSlots: { day: number; channel: Channel }[]
): number {
  const expectedSlots = getTemplateSlotsForStage(stageId)
  if (expectedSlots.length === 0) return 100
  
  const assignedCount = assignedSlots.filter(assigned => 
    expectedSlots.some(expected => 
      expected.day === assigned.day && expected.channel === assigned.channel
    )
  ).length
  
  return Math.round((assignedCount / expectedSlots.length) * 100)
}

/**
 * Get the next stage in the flow
 */
export function getNextStage(currentStageId: JourneyStageId): JourneyStageId | null {
  const currentIndex = STAGE_ORDER.indexOf(currentStageId)
  if (currentIndex === -1 || currentIndex >= STAGE_ORDER.length - 1) return null
  
  // Special case: booking_made can branch to no_show OR demo_taken
  if (currentStageId === 'booking_made') return 'demo_taken' // Default path
  
  return STAGE_ORDER[currentIndex + 1]
}

/**
 * Get all possible next stages (for branching)
 */
export function getNextStages(currentStageId: JourneyStageId): JourneyStageId[] {
  switch (currentStageId) {
    case 'booking_made':
      return ['no_show', 'demo_taken']
    case 'no_show':
      return ['booking_made'] // Can rebook
    case 'demo_taken':
      return ['proposal_sent']
    case 'proposal_sent':
      return ['converted']
    default:
      const next = getNextStage(currentStageId)
      return next ? [next] : []
  }
}

/**
 * Generate template name for a slot
 */
export function generateTemplateName(
  brand: string,
  stageId: JourneyStageId,
  day: number,
  channel: Channel,
  variant: Variant
): string {
  return `${brand}_${stageId}_d${day}_${channel}_v${variant}`.toLowerCase()
}
