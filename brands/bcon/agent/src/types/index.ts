export type LeadStage = 
  | 'New'
  | 'Engaged'
  | 'Qualified'
  | 'High Intent'
  | 'Booking Made'
  | 'Converted'
  | 'Closed Lost'
  | 'In Sequence'
  | 'Cold'

export type HighIntentSubStage = 'proposal' | 'negotiation' | 'on-hold'

export interface Lead {
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
  // Lead scoring fields
  lead_score?: number | null
  lead_stage?: LeadStage | null
  sub_stage?: string | null
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
