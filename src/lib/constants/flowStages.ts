/**
 * Flow Stages Constants - Single Source of Truth
 * 
 * This file contains all journey stage definitions, timing rules, and helpers
 * Used by: Flows page, LeadStageSelector, Task Worker, Template Library
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
  MdSchedule,
  MdAutoAwesome,
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

export type LeadStageMapping = 
  | 'New'
  | 'Engaged' 
  | 'Qualified'
  | 'High Intent'
  | 'Booking Made'
  | 'No Show'
  | 'Demo Taken'
  | 'Proposal Sent'
  | 'Converted'
  | 'Closed Lost'
  | 'In Sequence'
  | 'Cold'

export type Channel = 'whatsapp' | 'voice' | 'sms' | 'email'
export type Tone = 'soft' | 'normal' | 'aggressive' | 'very_aggressive'
export type Variant = 'A' | 'B' | 'C'

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
  leadStageMapping: LeadStageMapping
  description: string
  condition: string
  timing: string
  timingRules: TimingRule[]
  channels: Channel[]
  tone: Tone
  color: string
  bgColor: string
  borderColor: string
  icon: IconType
  isTerminal: boolean
  isAutoAssigned: boolean
  requiresSetup: boolean
}

export interface TemplateSlot {
  stageId: JourneyStageId
  day: number
  channel: Channel
  variants: Variant[]
}

// ============================================================================
// JOURNEY STAGES DEFINITION
// ============================================================================

export const JOURNEY_STAGES: JourneyStage[] = [
  {
    id: 'one_touch',
    name: 'One Touch',
    leadStageMapping: 'New',
    description: 'Initial contact, low engagement',
    condition: 'response_count < 2',
    timing: 'Day 3, Day 7, Day 30, Day 90',
    timingRules: [
      { day: 3, offsetHours: 72, channels: ['whatsapp'], tone: 'soft', description: 'Initial follow-up' },
      { day: 7, offsetHours: 168, channels: ['whatsapp'], tone: 'soft', description: 'Value reminder' },
      { day: 30, offsetHours: 720, channels: ['whatsapp'], tone: 'normal', description: 'Monthly check-in' },
      { day: 90, offsetHours: 2160, channels: ['whatsapp'], tone: 'normal', description: 'Quarterly touch' },
    ],
    channels: ['whatsapp'],
    tone: 'soft',
    color: '#3b82f6',
    bgColor: 'rgba(59, 130, 246, 0.1)',
    borderColor: 'rgba(59, 130, 246, 0.3)',
    icon: MdTouchApp,
    isTerminal: false,
    isAutoAssigned: false,
    requiresSetup: true,
  },
  {
    id: 'low_touch',
    name: 'Low Touch',
    leadStageMapping: 'Qualified',
    description: 'Early engagement building',
    condition: 'response_count 2-5',
    timing: 'Day 3, Day 7',
    timingRules: [
      { day: 3, offsetHours: 72, channels: ['whatsapp'], tone: 'normal', description: 'Engagement boost' },
      { day: 7, offsetHours: 168, channels: ['whatsapp', 'voice'], tone: 'normal', description: 'Voice intro' },
    ],
    channels: ['whatsapp', 'voice'],
    tone: 'normal',
    color: '#06b6d4',
    bgColor: 'rgba(6, 182, 212, 0.1)',
    borderColor: 'rgba(6, 182, 212, 0.3)',
    icon: MdMessage,
    isTerminal: false,
    isAutoAssigned: false,
    requiresSetup: true,
  },
  {
    id: 'engaged',
    name: 'Engaged',
    leadStageMapping: 'Engaged',
    description: 'Active conversation flow',
    condition: '5+ messages exchanged',
    timing: 'Day 1, Day 3',
    timingRules: [
      { day: 1, offsetHours: 24, channels: ['whatsapp'], tone: 'normal', description: 'Quick follow-up' },
      { day: 3, offsetHours: 72, channels: ['whatsapp', 'voice'], tone: 'normal', description: 'Value add + voice' },
    ],
    channels: ['whatsapp', 'voice'],
    tone: 'normal',
    color: '#22c55e',
    bgColor: 'rgba(34, 197, 94, 0.1)',
    borderColor: 'rgba(34, 197, 94, 0.3)',
    icon: MdChat,
    isTerminal: false,
    isAutoAssigned: false,
    requiresSetup: true,
  },
  {
    id: 'high_intent',
    name: 'High Intent',
    leadStageMapping: 'High Intent',
    description: 'Strong buying signals detected',
    condition: 'lead_score 61-85',
    timing: '24h + Voice call (+4h)',
    timingRules: [
      { day: 1, offsetHours: 24, channels: ['whatsapp', 'voice'], tone: 'aggressive', description: 'Immediate voice + WhatsApp' },
      { day: 1, offsetHours: 28, channels: ['voice'], tone: 'aggressive', description: 'Voice follow-up 4h later' },
    ],
    channels: ['whatsapp', 'voice'],
    tone: 'aggressive',
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
    icon: MdTrendingUp,
    isTerminal: false,
    isAutoAssigned: false,
    requiresSetup: true,
  },
  {
    id: 'booking_made',
    name: 'Booking Made',
    leadStageMapping: 'Booking Made',
    description: 'Call scheduled and confirmed',
    condition: 'booking confirmed',
    timing: '24h reminder + 30m reminder',
    timingRules: [
      { day: 1, offsetHours: -24, channels: ['whatsapp'], tone: 'normal', description: '24h reminder (before call)' },
      { day: 1, offsetHours: -0.5, channels: ['whatsapp', 'voice'], tone: 'aggressive', description: '30min reminder' },
    ],
    channels: ['whatsapp', 'voice'],
    tone: 'aggressive',
    color: '#8b5cf6',
    bgColor: 'rgba(139, 92, 246, 0.1)',
    borderColor: 'rgba(139, 92, 246, 0.3)',
    icon: MdEvent,
    isTerminal: false,
    isAutoAssigned: false,
    requiresSetup: true,
  },
  {
    id: 'no_show',
    name: 'No Show',
    leadStageMapping: 'No Show',
    description: 'Missed scheduled appointment',
    condition: 'booking missed',
    timing: '30m, Day 1, Day 3, Day 7',
    timingRules: [
      { day: 1, offsetHours: 0.5, channels: ['whatsapp', 'voice'], tone: 'aggressive', description: 'Immediate 30m recovery' },
      { day: 1, offsetHours: 24, channels: ['whatsapp'], tone: 'aggressive', description: 'Day 1 recovery' },
      { day: 3, offsetHours: 72, channels: ['whatsapp', 'voice'], tone: 'aggressive', description: 'Day 3 recovery' },
      { day: 7, offsetHours: 168, channels: ['whatsapp'], tone: 'very_aggressive', description: 'Final recovery' },
    ],
    channels: ['whatsapp', 'voice'],
    tone: 'aggressive',
    color: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    icon: MdPhoneMissed,
    isTerminal: false,
    isAutoAssigned: false,
    requiresSetup: true,
  },
  {
    id: 'demo_taken',
    name: 'Demo Taken',
    leadStageMapping: 'Demo Taken',
    description: 'Product demo completed',
    condition: 'demo completed',
    timing: 'Day 1, Day 3, Day 5 + Voice (Day 2)',
    timingRules: [
      { day: 1, offsetHours: 24, channels: ['whatsapp'], tone: 'normal', description: 'Thank you + next steps' },
      { day: 2, offsetHours: 48, channels: ['voice'], tone: 'normal', description: 'Voice follow-up' },
      { day: 3, offsetHours: 72, channels: ['whatsapp'], tone: 'aggressive', description: 'Value reinforcement' },
      { day: 5, offsetHours: 120, channels: ['whatsapp', 'voice'], tone: 'aggressive', description: 'Close push' },
    ],
    channels: ['whatsapp', 'voice'],
    tone: 'aggressive',
    color: '#ec4899',
    bgColor: 'rgba(236, 72, 153, 0.1)',
    borderColor: 'rgba(236, 72, 153, 0.3)',
    icon: MdVideocam,
    isTerminal: false,
    isAutoAssigned: false,
    requiresSetup: true,
  },
  {
    id: 'proposal_sent',
    name: 'Proposal Sent',
    leadStageMapping: 'Proposal Sent',
    description: 'Pricing/proposal delivered',
    condition: 'proposal delivered',
    timing: 'Day 1, Voice (+4h), Day 3, Day 5',
    timingRules: [
      { day: 1, offsetHours: 4, channels: ['voice'], tone: 'aggressive', description: 'Voice confirmation 4h after' },
      { day: 1, offsetHours: 24, channels: ['whatsapp'], tone: 'aggressive', description: 'Day 1 follow-up' },
      { day: 3, offsetHours: 72, channels: ['whatsapp', 'voice'], tone: 'very_aggressive', description: 'Day 3 push' },
      { day: 5, offsetHours: 120, channels: ['whatsapp', 'voice'], tone: 'very_aggressive', description: 'Final close' },
    ],
    channels: ['whatsapp', 'voice'],
    tone: 'very_aggressive',
    color: '#f97316',
    bgColor: 'rgba(249, 115, 22, 0.1)',
    borderColor: 'rgba(249, 115, 22, 0.3)',
    icon: MdDescription,
    isTerminal: false,
    isAutoAssigned: false,
    requiresSetup: true,
  },
  {
    id: 'converted',
    name: 'Converted / Closed Lost',
    leadStageMapping: 'Converted',
    description: 'Final stage - deal outcome',
    condition: 'deal closed',
    timing: 'No follow-up',
    timingRules: [],
    channels: [],
    tone: 'normal',
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
    icon: MdCheckCircle,
    isTerminal: true,
    isAutoAssigned: false,
    requiresSetup: false,
  },
]

// ============================================================================
// LOOKUP MAPS
// ============================================================================

/** Quick lookup by stage ID */
export const STAGE_MAP: Record<JourneyStageId, JourneyStage> = JOURNEY_STAGES.reduce(
  (acc, stage) => ({ ...acc, [stage.id]: stage }),
  {} as Record<JourneyStageId, JourneyStage>
)

/** Map lead stage to journey stage */
export const LEAD_STAGE_TO_JOURNEY: Record<string, JourneyStageId> = {
  'New': 'one_touch',
  'Qualified': 'low_touch',
  'Engaged': 'engaged',
  'High Intent': 'high_intent',
  'Booking Made': 'booking_made',
  'No Show': 'no_show',
  'Demo Taken': 'demo_taken',
  'Proposal Sent': 'proposal_sent',
  'Converted': 'converted',
  'Closed Lost': 'converted',
  'In Sequence': 'one_touch', // Default to one_touch for sequence
  'Cold': 'one_touch', // Default to one_touch for cold
}

/** All days used in timing rules */
export const TIMING_DAYS = [1, 3, 7, 30, 90]

/** All channels */
export const ALL_CHANNELS: Channel[] = ['whatsapp', 'voice', 'sms', 'email']

/** All variants for A/B/C testing */
export const ALL_VARIANTS: Variant[] = ['A', 'B', 'C']

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get stage by ID
 */
export function getStage(stageId: JourneyStageId): JourneyStage {
  return STAGE_MAP[stageId]
}

/**
 * Get all template slots for a stage
 * Returns all day/channel combinations
 */
export function getTemplateSlotsForStage(stageId: JourneyStageId): TemplateSlot[] {
  const stage = STAGE_MAP[stageId]
  if (!stage || stage.isTerminal) return []
  
  const slots: TemplateSlot[] = []
  
  // Get unique day/channel combinations from timing rules
  const seen = new Set<string>()
  
  stage.timingRules.forEach(rule => {
    rule.channels.forEach(channel => {
      const key = `${rule.day}-${channel}`
      if (!seen.has(key)) {
        seen.add(key)
        slots.push({
          stageId,
          day: rule.day,
          channel,
          variants: ['A', 'B', 'C'],
        })
      }
    })
  })
  
  return slots
}

/**
 * Get all template slots across all stages
 */
export function getAllTemplateSlots(): TemplateSlot[] {
  return JOURNEY_STAGES
    .filter(s => !s.isTerminal)
    .flatMap(s => getTemplateSlotsForStage(s.id))
}

/**
 * Get timing rules for a specific stage/day/channel
 */
export function getStageTiming(
  stageId: JourneyStageId,
  day: number,
  channel: Channel
): TimingRule | undefined {
  const stage = STAGE_MAP[stageId]
  if (!stage) return undefined
  
  return stage.timingRules.find(
    r => r.day === day && r.channels.includes(channel)
  )
}

/**
 * Get tone color for UI
 */
export function getToneColor(tone: Tone): { bg: string; color: string; label: string } {
  switch (tone) {
    case 'soft':
      return { bg: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', label: 'Soft' }
    case 'normal':
      return { bg: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', label: 'Normal' }
    case 'aggressive':
      return { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', label: 'Aggressive' }
    case 'very_aggressive':
      return { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', label: 'Very Aggressive' }
    default:
      return { bg: 'rgba(255, 255, 255, 0.06)', color: '#9ca3af', label: 'Normal' }
  }
}

/**
 * Get channel icon/label
 */
export function getChannelInfo(channel: Channel): { 
  label: string
  color: string
  bgColor: string
} {
  switch (channel) {
    case 'whatsapp':
      return { label: 'WhatsApp', color: '#22c55e', bgColor: 'rgba(34, 197, 94, 0.12)' }
    case 'voice':
      return { label: 'Voice', color: '#8b5cf6', bgColor: 'rgba(139, 92, 246, 0.12)' }
    case 'sms':
      return { label: 'SMS', color: '#3b82f6', bgColor: 'rgba(59, 130, 246, 0.12)' }
    case 'email':
      return { label: 'Email', color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.12)' }
    default:
      return { label: channel, color: '#9ca3af', bgColor: 'rgba(156, 163, 175, 0.12)' }
  }
}

/**
 * Calculate template coverage percentage for a stage
 */
export function calculateStageCoverage(
  stageId: JourneyStageId,
  assignedSlots: { day: number; channel: Channel }[]
): number {
  const expectedSlots = getTemplateSlotsForStage(stageId)
  if (expectedSlots.length === 0) return 100 // Terminal stages
  
  const assignedCount = assignedSlots.filter(assigned => 
    expectedSlots.some(expected => 
      expected.day === assigned.day && expected.channel === assigned.channel
    )
  ).length
  
  return Math.round((assignedCount / expectedSlots.length) * 100)
}

/**
 * Get next stage in journey
 */
export function getNextStage(currentStageId: JourneyStageId): JourneyStageId | null {
  const currentIndex = JOURNEY_STAGES.findIndex(s => s.id === currentStageId)
  if (currentIndex === -1 || currentIndex >= JOURNEY_STAGES.length - 1) return null
  return JOURNEY_STAGES[currentIndex + 1].id
}

/**
 * Get previous stage in journey
 */
export function getPreviousStage(currentStageId: JourneyStageId): JourneyStageId | null {
  const currentIndex = JOURNEY_STAGES.findIndex(s => s.id === currentStageId)
  if (currentIndex <= 0) return null
  return JOURNEY_STAGES[currentIndex - 1].id
}

/**
 * Check if a stage requires template setup
 */
export function stageRequiresSetup(stageId: JourneyStageId): boolean {
  const stage = STAGE_MAP[stageId]
  return stage?.requiresSetup ?? false
}

/**
 * Get total expected template count across all stages
 */
export function getTotalExpectedTemplates(): number {
  return getAllTemplateSlots().length * 3 // A, B, C variants for each slot
}

/**
 * Generate default template name
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
