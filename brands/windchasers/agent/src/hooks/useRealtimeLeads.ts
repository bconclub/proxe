'use client'

import { useEffect, useState } from 'react'
import { createClient } from '../lib/supabase/client'

interface Lead {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  source: string | null
  first_touchpoint: string | null
  last_touchpoint: string | null
  brand: string | null
  timestamp: string
  last_interaction_at: string | null
  booking_date: string | null
  booking_time: string | null
  status: string | null
  metadata?: any
  unified_context?: any
  lead_score?: number | null
  lead_stage?: string | null
  sub_stage?: string | null
  stage_override?: boolean | null
  last_scored_at?: string | null
  is_active_chat?: boolean | null
}

export function useRealtimeLeads() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()

    const fetchLeads = async () => {
      try {
        // Try all_leads first (has enriched columns like lead_score, lead_stage),
        // fallback to unified_leads if it doesn't exist
        const { data: allLeadsData, error: allLeadsError } = await supabase
          .from('all_leads')
          .select('id, customer_name, email, phone, created_at, last_interaction_at, booking_date, booking_time, lead_score, lead_stage, sub_stage, stage_override, unified_context, first_touchpoint, last_touchpoint, status, brand, metadata')
          .order('last_interaction_at', { ascending: false })
          .limit(1000)

        let data: any[] | null = null
        let queryError: any = null

        if (allLeadsError && (allLeadsError.message.includes('does not exist') || allLeadsError.code === '42P01' || allLeadsError.message.includes('permission denied') || allLeadsError.code === '42501')) {
          // Fallback to unified_leads
          const { data: unifiedData, error: unifiedError } = await supabase
            .from('unified_leads')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(1000)

          data = unifiedData
          queryError = unifiedError
        } else if (allLeadsError) {
          queryError = allLeadsError
        } else {
          data = allLeadsData
        }

        if (queryError) {
          console.error('Supabase error:', queryError)
          if (queryError.message.includes('Failed to fetch') || queryError.message.includes('NetworkError')) {
            throw new Error('Unable to connect to Supabase. Please check your internet connection and Supabase project status.')
          }
          throw new Error(queryError.message || 'Failed to fetch leads')
        }

        const mappedLeads = (data || []).map((lead: any) => ({
          id: lead.id,
          name: lead.customer_name || lead.name || null,
          email: lead.email || null,
          phone: lead.phone || null,
          source: lead.first_touchpoint || lead.last_touchpoint || lead.source || 'web',
          first_touchpoint: lead.first_touchpoint || null,
          last_touchpoint: lead.last_touchpoint || null,
          brand: lead.brand || null,
          timestamp: lead.created_at || lead.timestamp || new Date().toISOString(),
          last_interaction_at: lead.last_interaction_at || null,
          booking_date: lead.booking_date || null,
          booking_time: lead.booking_time || null,
          status: lead.status || null,
          metadata: lead.metadata || null,
          unified_context: lead.unified_context || null,
          lead_score: lead.lead_score ?? null,
          lead_stage: lead.lead_stage || null,
          sub_stage: lead.sub_stage || null,
          stage_override: lead.stage_override ?? null,
          last_scored_at: lead.last_scored_at || null,
          is_active_chat: lead.is_active_chat ?? null,
        }))

        setLeads(mappedLeads)
        setLoading(false)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch leads'
        console.error('Error fetching leads:', err)
        setError(errorMessage)
        setLoading(false)
      }
    }

    fetchLeads()

    // Subscribe to real-time changes on all_leads (FIXED: was unified_leads)
    const channel = supabase
      .channel('all_leads_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'all_leads',
        },
        () => {
          fetchLeads()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  return { leads, loading, error }
}
