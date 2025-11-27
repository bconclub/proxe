export interface Lead {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  source: string | null
  timestamp: string
  status: string | null
  booking_date: string | null
  booking_time: string | null
  metadata?: any
  unified_context?: any
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


