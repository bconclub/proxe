/**
 * Lead Stage - Unified status system
 * 
 * AUTO-CALCULATED STAGES (based on score/activity):
 * - New: Default, score 0-30, no activity
 * - Engaged: Score 0-30 BUT active chat/conversation
 * - Qualified: Score 31-60
 * - High Intent: Score 61-85
 * - Booking Made: Score 86-100 OR actual booking created
 * - In Sequence: Score < 61, no active chat, in automated follow-up
 * 
 * FLOW JOURNEY STAGES (milestone-based):
 * - No Show: Booking was missed (auto or manual)
 * - Demo Taken: Product demo completed
 * - Proposal Sent: Pricing/proposal delivered
 * 
 * MANUAL/TERMINAL STAGES:
 * - Converted: Manual close (customer converted)
 * - Closed Lost: Manual close (lead lost)
 * - Cold: Manual mark OR auto after 30 days in sequence with no response
 * 
 * Note: 'In Sequence' is auto-calculated from score < 61, but can be manually overridden.
 * When stage_override = true, the AI will not change the stage except for:
 * 1. Booking made (always forces 'Booking Made')
 * 2. Re-engagement from 'Cold' after 30+ days
 */
export type LeadStage = 
  | 'New'           // Score 0-30, no active chat
  | 'Engaged'       // Score 0-30, active chat
  | 'Qualified'     // Score 31-60
  | 'High Intent'   // Score 61-85 (supports sub_stage: proposal/negotiation/on-hold)
  | 'Booking Made'  // Score 86-100 OR actual booking
  | 'No Show'       // Booking was missed
  | 'Demo Taken'    // Product demo completed
  | 'Proposal Sent' // Pricing/proposal delivered
  | 'Converted'     // Manual close - won
  | 'Closed Lost'   // Manual close - lost
  | 'In Sequence'   // Auto: Score < 61, in follow-up sequence
  | 'Cold'          // Auto/Manual: Dormant lead, no active follow-up

/**
 * Sub-stages for 'High Intent' leads only
 * Tracks where the lead is in the sales negotiation process
 */
export type HighIntentSubStage = 'proposal' | 'negotiation' | 'on-hold'

/**
 * Stages that are typically auto-assigned by the AI scoring system
 */
export const AUTO_ASSIGNED_STAGES: LeadStage[] = ['New', 'Engaged', 'Qualified', 'High Intent', 'Booking Made', 'In Sequence']

/**
 * Stages that require manual intervention or represent terminal states
 */
export const MANUAL_STAGES: LeadStage[] = ['Converted', 'Closed Lost', 'Cold']

/**
 * Stages that indicate active follow-up is happening
 */
export const ACTIVE_SEQUENCE_STAGES: LeadStage[] = ['In Sequence']

export interface Lead {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  source: string | null
  first_touchpoint?: string | null
  last_touchpoint?: string | null
  timestamp: string
  /** @deprecated Use lead_stage instead */
  status: string | null
  booking_date: string | null
  booking_time: string | null
  metadata?: any
  unified_context?: any
  // Lead scoring fields
  lead_score?: number | null
  lead_stage?: LeadStage | null
  /** Only used when lead_stage = 'High Intent'. Values: proposal, negotiation, on-hold */
  sub_stage?: string | null
  /** When TRUE, AI will not auto-change the stage (except for booking/re-engagement) */
  stage_override?: boolean | null
  last_scored_at?: string | null
  last_interaction_at?: string | null
  is_active_chat?: boolean | null
}

export interface Booking {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  booking_date: string | null
  booking_time: string | null
  source: string | null
}

export interface Metrics {
  totalConversations: number
  activeConversations: number
  avgResponseTime: number
  conversionRate: number
  leadsByChannel: { name: string; value: number }[]
  conversationsOverTime: { date: string; count: number }[]
  conversionFunnel: { stage: string; count: number }[]
  responseTimeTrends: { date: string; avgTime: number }[]
}

export type UserRole = 'admin' | 'viewer'

export interface DashboardUser {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  created_at: string
  updated_at: string
  last_login: string | null
  is_active: boolean
}

// Knowledge Base types
export type KnowledgeBaseType = 'pdf' | 'doc' | 'url' | 'text'
export type EmbeddingsStatus = 'pending' | 'processing' | 'ready' | 'error'

export interface KnowledgeBaseItem {
  id: string
  brand: string
  type: KnowledgeBaseType
  title: string
  source_url: string | null
  content: string | null
  question: string | null
  answer: string | null
  category: string | null
  subcategory: string | null
  tags: string[]
  file_name: string | null
  file_size: number | null
  file_type: string | null
  chunks: any
  embeddings_status: EmbeddingsStatus
  error_message: string | null
  metadata: any
  created_at: string
  updated_at: string
}

export interface KnowledgeBaseChunk {
  id: string
  knowledge_base_id: string
  brand: string
  chunk_index: number
  content: string
  char_start: number | null
  char_end: number | null
  token_estimate: number | null
  embedding: number[] | null
  created_at: string
}
