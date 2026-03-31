/**
 * Stage Detector Service - GPFC 2: Stage Detection and Tagging
 * 
 * Calculates the actual stage based on lead data and conversation patterns.
 * Provides confidence scoring and stage transition recommendations.
 */

import { createClient } from '@/lib/supabase/client'
import { 
  JourneyStageId, 
  LEAD_STAGE_TO_JOURNEY,
  getStage,
  STAGE_MAP,
} from '@/lib/constants/flowStages'

// ============================================================================
// TYPES
// ============================================================================

export interface StageDetectionResult {
  detectedStage: JourneyStageId
  confidence: 'high' | 'medium' | 'low'
  detectedBy: 'manual' | 'ai' | 'rule'
  reasons: string[]
  suggestedActions: SuggestedAction[]
  tone: 'soft' | 'normal' | 'aggressive' | 'very_aggressive'
  shouldUpdate: boolean
}

export interface SuggestedAction {
  id: string
  label: string
  description: string
  timing: string
  dueIn?: number // minutes until due, negative if overdue
  type: 'send_template' | 'schedule_call' | 'manual_task' | 'wait'
  templateId?: string
  autoExecutable: boolean
}

export interface LeadStageData {
  id: string
  lead_stage: string
  response_count: number
  lead_score: number
  first_message_at?: string
  last_interaction_at?: string
  booking_date?: string
  booking_time?: string
  unified_context?: {
    demo_completed?: boolean
    proposal_sent?: boolean
    payment_received?: boolean
    [key: string]: any
  }
  metadata?: {
    stage_override?: boolean
    [key: string]: any
  }
}

// ============================================================================
// HIGH-INTENT KEYWORDS
// ============================================================================

const HIGH_INTENT_KEYWORDS = [
  'pricing', 'price', 'cost', 'how much', 'budget', 'investment',
  'demo', 'meeting', 'schedule', 'book a call', 'appointment',
  'proposal', 'quote', 'quotation', 'package',
  'signup', 'sign up', 'purchase', 'buy', 'ready to',
  'interested in', 'want to proceed', 'go ahead',
]

// ============================================================================
// STAGE DETECTION LOGIC
// ============================================================================

/**
 * Detect stage based on lead data
 */
export function detectStage(lead: LeadStageData): StageDetectionResult {
  const reasons: string[] = []
  const suggestedActions: SuggestedAction[] = []
  
  // Check for manual override
  if (lead.metadata?.stage_override) {
    const manualStage = lead.lead_stage as JourneyStageId
    return {
      detectedStage: LEAD_STAGE_TO_JOURNEY[lead.lead_stage] || manualStage || 'one_touch',
      confidence: 'high',
      detectedBy: 'manual',
      reasons: ['Manual stage override set'],
      suggestedActions: getStageActions(manualStage, lead),
      tone: getStageTone(manualStage),
      shouldUpdate: false,
    }
  }

  // 1. Converted / Closed Lost (terminal stages)
  if (lead.lead_stage === 'Converted' || lead.lead_stage === 'Closed Won') {
    return {
      detectedStage: 'converted',
      confidence: 'high',
      detectedBy: 'rule',
      reasons: ['Lead marked as Converted'],
      suggestedActions: [],
      tone: 'normal',
      shouldUpdate: false,
    }
  }

  if (lead.lead_stage === 'Closed Lost') {
    return {
      detectedStage: 'converted',
      confidence: 'high',
      detectedBy: 'rule',
      reasons: ['Lead marked as Closed Lost'],
      suggestedActions: [{
        id: 're_engage',
        label: 'Schedule re-engagement',
        description: 'Move to cold and schedule 30-day re-engagement',
        timing: 'In 30 days',
        type: 'manual_task',
        autoExecutable: false,
      }],
      tone: 'normal',
      shouldUpdate: false,
    }
  }

  // 2. Proposal Sent
  if (lead.unified_context?.proposal_sent || lead.lead_stage === 'Proposal Sent') {
    reasons.push('Proposal sent to lead')
    return {
      detectedStage: 'proposal_sent',
      confidence: 'high',
      detectedBy: lead.unified_context?.proposal_sent ? 'ai' : 'rule',
      reasons,
      suggestedActions: getStageActions('proposal_sent', lead),
      tone: 'very_aggressive',
      shouldUpdate: lead.lead_stage !== 'Proposal Sent',
    }
  }

  // 3. Demo Taken
  if (lead.unified_context?.demo_completed || lead.lead_stage === 'Demo Taken') {
    reasons.push('Demo completed')
    return {
      detectedStage: 'demo_taken',
      confidence: 'high',
      detectedBy: lead.unified_context?.demo_completed ? 'ai' : 'rule',
      reasons,
      suggestedActions: getStageActions('demo_taken', lead),
      tone: 'aggressive',
      shouldUpdate: lead.lead_stage !== 'Demo Taken',
    }
  }

  // 4. Booking Made
  if (lead.booking_date) {
    const bookingDate = new Date(lead.booking_date)
    const now = new Date()
    
    if (bookingDate > now) {
      reasons.push(`Future booking scheduled for ${bookingDate.toLocaleDateString()}`)
      return {
        detectedStage: 'booking_made',
        confidence: 'high',
        detectedBy: 'rule',
        reasons,
        suggestedActions: getStageActions('booking_made', lead),
        tone: 'aggressive',
        shouldUpdate: lead.lead_stage !== 'Booking Made',
      }
    } else {
      // Booking passed - check if completed or no-show
      reasons.push(`Booking date passed (${bookingDate.toLocaleDateString()})`)
      return {
        detectedStage: 'no_show',
        confidence: 'medium',
        detectedBy: 'rule',
        reasons,
        suggestedActions: getStageActions('no_show', lead),
        tone: 'aggressive',
        shouldUpdate: lead.lead_stage !== 'No Show',
      }
    }
  }

  // 5. High Intent
  if (lead.lead_score >= 61 || hasHighIntentKeywords(lead)) {
    if (lead.lead_score >= 61) {
      reasons.push(`Lead score ${lead.lead_score} >= 61`)
    }
    if (hasHighIntentKeywords(lead)) {
      reasons.push('High-intent keywords detected')
    }
    return {
      detectedStage: 'high_intent',
      confidence: 'high',
      detectedBy: lead.lead_score >= 61 ? 'rule' : 'ai',
      reasons,
      suggestedActions: getStageActions('high_intent', lead),
      tone: 'aggressive',
      shouldUpdate: !['High Intent', 'Booking Made', 'Demo Taken', 'Proposal Sent'].includes(lead.lead_stage),
    }
  }

  // Calculate activity metrics
  const hoursSinceLastInteraction = lead.last_interaction_at
    ? (Date.now() - new Date(lead.last_interaction_at).getTime()) / (1000 * 60 * 60)
    : Infinity

  const hoursSinceFirstMessage = lead.first_message_at
    ? (Date.now() - new Date(lead.first_message_at).getTime()) / (1000 * 60 * 60)
    : Infinity

  // 6. No Show (booking passed without completion)
  if (lead.lead_stage === 'No Show') {
    reasons.push('Previously marked as No Show')
    return {
      detectedStage: 'no_show',
      confidence: 'high',
      detectedBy: 'rule',
      reasons,
      suggestedActions: getStageActions('no_show', lead),
      tone: 'aggressive',
      shouldUpdate: false,
    }
  }

  // 7. Engaged (5+ responses, active within 48h)
  if (lead.response_count > 5 && hoursSinceLastInteraction <= 48) {
    reasons.push(`${lead.response_count} responses, active within 48h`)
    return {
      detectedStage: 'engaged',
      confidence: 'high',
      detectedBy: 'rule',
      reasons,
      suggestedActions: getStageActions('engaged', lead),
      tone: 'normal',
      shouldUpdate: !['Engaged', 'High Intent', 'Booking Made'].includes(lead.lead_stage),
    }
  }

  // 8. Low Touch (2-5 responses, 24-48h since last)
  if (lead.response_count >= 2 && lead.response_count <= 5 && hoursSinceLastInteraction >= 24 && hoursSinceLastInteraction <= 48) {
    reasons.push(`${lead.response_count} responses, last message ${Math.round(hoursSinceLastInteraction)}h ago`)
    return {
      detectedStage: 'low_touch',
      confidence: 'medium',
      detectedBy: 'rule',
      reasons,
      suggestedActions: getStageActions('low_touch', lead),
      tone: 'normal',
      shouldUpdate: !['Qualified', 'Engaged', 'High Intent'].includes(lead.lead_stage),
    }
  }

  // 9. One Touch (0-2 responses, within 24h of first message)
  if (lead.response_count < 2 && hoursSinceFirstMessage <= 24) {
    reasons.push(`${lead.response_count} responses, first message within 24h`)
    return {
      detectedStage: 'one_touch',
      confidence: 'medium',
      detectedBy: 'rule',
      reasons,
      suggestedActions: getStageActions('one_touch', lead),
      tone: 'soft',
      shouldUpdate: lead.lead_stage !== 'New',
    }
  }

  // Default: One Touch
  reasons.push('Default stage for low engagement')
  return {
    detectedStage: 'one_touch',
    confidence: 'low',
    detectedBy: 'rule',
    reasons,
    suggestedActions: getStageActions('one_touch', lead),
    tone: 'soft',
    shouldUpdate: false,
  }
}

/**
 * Check if lead has high-intent keywords in conversations
 */
function hasHighIntentKeywords(lead: LeadStageData): boolean {
  // This would require fetching recent conversations
  // For now, check unified_context for intent signals
  const context = lead.unified_context
  if (!context) return false

  const textToCheck = [
    context.last_message,
    context.conversation_summary,
    ...(context.pain_points || []),
    ...(context.service_interests || []),
  ].join(' ').toLowerCase()

  return HIGH_INTENT_KEYWORDS.some(kw => textToCheck.includes(kw.toLowerCase()))
}

/**
 * Get tone for stage
 */
function getStageTone(stageId: JourneyStageId): 'soft' | 'normal' | 'aggressive' | 'very_aggressive' {
  const stage = getStage(stageId)
  return stage?.tone || 'normal'
}

/**
 * Get suggested actions for a stage
 */
function getStageActions(stageId: JourneyStageId, lead: LeadStageData): SuggestedAction[] {
  const hoursSinceLastInteraction = lead.last_interaction_at
    ? (Date.now() - new Date(lead.last_interaction_at).getTime()) / (1000 * 60 * 60)
    : Infinity

  switch (stageId) {
    case 'one_touch':
      return [
        {
          id: 'send_day1',
          label: 'Send initial outreach',
          description: 'Day 1 template: Intro + value proposition',
          timing: 'Due now',
          dueIn: 0,
          type: 'send_template',
          templateId: 'follow_up_day1',
          autoExecutable: true,
        },
        {
          id: 'wait_24h',
          label: 'Wait for response',
          description: 'Check back in 24 hours if no reply',
          timing: 'In 24 hours',
          dueIn: 24 * 60,
          type: 'wait',
          autoExecutable: false,
        },
      ]

    case 'low_touch':
      return [
        {
          id: 'send_day3_nurture',
          label: 'Send nurture content',
          description: 'Day 3 value-add template: Case study or helpful content',
          timing: 'Due now',
          dueIn: Math.max(0, 72 - hoursSinceLastInteraction * 60),
          type: 'send_template',
          templateId: 'follow_up_day3',
          autoExecutable: true,
        },
        {
          id: 'ask_qualifying',
          label: 'Ask qualifying question',
          description: 'Send question to gauge interest level',
          timing: 'If no reply to nurture',
          type: 'manual_task',
          autoExecutable: false,
        },
      ]

    case 'engaged':
      return [
        {
          id: 'continue_thread',
          label: 'Continue conversation',
          description: 'Reply to last message or add value',
          timing: 'Active thread',
          type: 'manual_task',
          autoExecutable: false,
        },
        {
          id: 'schedule_demo',
          label: 'Schedule demo',
          description: 'Offer product demo if interest confirmed',
          timing: 'When ready',
          type: 'schedule_call',
          autoExecutable: false,
        },
      ]

    case 'high_intent':
      return [
        {
          id: 'send_aggressive_day1',
          label: 'Send conversion template',
          description: 'Day 1 aggressive: Direct ask + urgency',
          timing: 'Due now',
          dueIn: 0,
          type: 'send_template',
          templateId: 'follow_up_day1_aggressive',
          autoExecutable: true,
        },
        {
          id: 'schedule_voice',
          label: 'Schedule voice call',
          description: 'Escalate to voice call within 4 hours',
          timing: 'In 4 hours',
          dueIn: 4 * 60,
          type: 'schedule_call',
          autoExecutable: false,
        },
      ]

    case 'booking_made':
      return [
        {
          id: 'send_24h_reminder',
          label: 'Send 24h reminder',
          description: 'Confirm booking 24 hours before call',
          timing: lead.booking_date ? `Before ${lead.booking_date}` : 'Schedule',
          type: 'send_template',
          templateId: 'booking_reminder_24h',
          autoExecutable: true,
        },
        {
          id: 'send_30m_reminder',
          label: 'Send 30m reminder',
          description: 'Final reminder 30 minutes before call',
          timing: '30 min before',
          type: 'send_template',
          templateId: 'booking_reminder_30m',
          autoExecutable: true,
        },
      ]

    case 'no_show':
      return [
        {
          id: 'recovery_message',
          label: 'Send recovery message',
          description: 'Immediate recovery: "Sorry we missed you"',
          timing: 'Due now',
          dueIn: 0,
          type: 'send_template',
          templateId: 'recovery_immediate',
          autoExecutable: true,
        },
        {
          id: 'schedule_recovery_call',
          label: 'Schedule follow-up call',
          description: 'Call to reschedule within 24 hours',
          timing: 'In 24 hours',
          dueIn: 24 * 60,
          type: 'schedule_call',
          autoExecutable: false,
        },
      ]

    case 'demo_taken':
      return [
        {
          id: 'send_day1_followup',
          label: 'Send Day 1 follow-up',
          description: 'Thank you + next steps + proposal',
          timing: '24h after demo',
          type: 'send_template',
          templateId: 'demo_follow_up_day1',
          autoExecutable: true,
        },
        {
          id: 'request_feedback',
          label: 'Request feedback',
          description: 'Ask for demo feedback and concerns',
          timing: 'Day 2',
          type: 'manual_task',
          autoExecutable: false,
        },
      ]

    case 'proposal_sent':
      return [
        {
          id: 'send_day1_checkin',
          label: 'Send Day 1 check-in',
          description: 'Check if proposal received and questions',
          timing: 'Due now',
          dueIn: 0,
          type: 'send_template',
          templateId: 'proposal_day1',
          autoExecutable: true,
        },
        {
          id: 'send_day3_urgency',
          label: 'Send Day 3 urgency',
          description: 'Create urgency: limited spots/pricing',
          timing: 'In 2 days',
          dueIn: 48 * 60,
          type: 'send_template',
          templateId: 'proposal_day3',
          autoExecutable: true,
        },
      ]

    default:
      return []
  }
}

// ============================================================================
// DATABASE FUNCTIONS
// ============================================================================

const supabase = createClient()

/**
 * Detect and update lead stage
 */
export async function detectAndUpdateStage(leadId: string): Promise<StageDetectionResult | null> {
  try {
    // Get lead data
    const { data: lead } = await supabase
      .from('all_leads')
      .select('*')
      .eq('id', leadId)
      .single()

    if (!lead) return null

    // Detect stage
    const detection = detectStage(lead)

    // Update if needed
    if (detection.shouldUpdate) {
      await supabase
        .from('all_leads')
        .update({
          lead_stage: detection.detectedStage,
          stage_detected_at: new Date().toISOString(),
          stage_detected_by: detection.detectedBy,
        })
        .eq('id', leadId)
    }

    return detection
  } catch (error) {
    console.error('[StageDetector] Detection failed:', error)
    return null
  }
}

/**
 * Get stage for lead (with caching)
 */
export async function getLeadStage(leadId: string): Promise<StageDetectionResult | null> {
  try {
    const { data: lead } = await supabase
      .from('all_leads')
      .select('lead_stage, stage_detected_at, unified_context, metadata')
      .eq('id', leadId)
      .single()

    if (!lead) return null

    // Check if detection is recent (< 1 hour)
    const detectedAt = lead.stage_detected_at
    if (detectedAt) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
      if (new Date(detectedAt) > oneHourAgo && lead.unified_context?.stage_detection) {
        return lead.unified_context.stage_detection as StageDetectionResult
      }
    }

    // Re-detect
    return detectAndUpdateStage(leadId)
  } catch (error) {
    console.error('[StageDetector] Failed to get stage:', error)
    return null
  }
}

/**
 * Override lead stage manually
 */
export async function overrideLeadStage(
  leadId: string, 
  stage: JourneyStageId,
  reason?: string
): Promise<boolean> {
  try {
    const { data: lead } = await supabase
      .from('all_leads')
      .select('metadata, unified_context')
      .eq('id', leadId)
      .single()

    if (!lead) return false

    await supabase
      .from('all_leads')
      .update({
        lead_stage: stage,
        stage_override: true,
        stage_override_at: new Date().toISOString(),
        stage_override_reason: reason,
        metadata: {
          ...lead.metadata,
          stage_override: true,
        },
        unified_context: {
          ...lead.unified_context,
          stage_detection: {
            detectedStage: stage,
            confidence: 'high',
            detectedBy: 'manual',
            reasons: [reason || 'Manual override'],
            shouldUpdate: false,
          },
        },
      })
      .eq('id', leadId)

    return true
  } catch (error) {
    console.error('[StageDetector] Override failed:', error)
    return false
  }
}

/**
 * Execute a suggested action
 */
export async function executeAction(
  leadId: string,
  action: SuggestedAction
): Promise<boolean> {
  try {
    switch (action.type) {
      case 'send_template':
        // Queue template send
        await supabase.from('agent_tasks').insert({
          lead_id: leadId,
          task_type: action.templateId || 'send_template',
          status: 'pending',
          scheduled_at: new Date().toISOString(),
          metadata: {
            action_id: action.id,
            template_id: action.templateId,
            auto_executed: true,
          },
        })
        return true

      case 'schedule_call':
        // Create voice call task
        await supabase.from('agent_tasks').insert({
          lead_id: leadId,
          task_type: 'try_voice_call',
          status: 'pending',
          scheduled_at: action.dueIn 
            ? new Date(Date.now() + action.dueIn * 60 * 1000).toISOString()
            : new Date().toISOString(),
          metadata: {
            action_id: action.id,
            reason: action.description,
          },
        })
        return true

      default:
        return false
    }
  } catch (error) {
    console.error('[StageDetector] Action execution failed:', error)
    return false
  }
}
