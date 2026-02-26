'use client'

import { useEffect, useState } from 'react'
import { createClient } from '../lib/supabase/client'
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

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

    // Initial fetch - try all_leads first, fallback to unified_leads if access denied
    const fetchLeads = async () => {
      try {
        // Try all_leads first (same as LeadDetailsModal) to get all fields including lead_score and lead_stage
        let data: any[] | null = null
        let error: any = null
        
        const { data: allLeadsData, error: allLeadsError } = await supabase
          .from('all_leads')
          .select('id, customer_name, email, phone, created_at, last_interaction_at, booking_date, booking_time, lead_score, lead_stage, sub_stage, stage_override, unified_context, first_touchpoint, last_touchpoint, status, brand, metadata')
          .order('last_interaction_at', { ascending: false })
          .limit(1000)

        if (allLeadsError) {
          // If all_leads fails due to RLS/permissions, fallback to unified_leads
          if (allLeadsError.message.includes('permission denied') || allLeadsError.message.includes('RLS') || allLeadsError.code === '42501' || allLeadsError.message.includes('does not exist') || allLeadsError.code === '42P01') {
            const { data: unifiedData, error: unifiedError } = await supabase
              .from('unified_leads')
              .select('*')
              .order('last_interaction_at', { ascending: false })
              .limit(1000)

            if (unifiedError) {
              error = unifiedError
            } else {
              data = unifiedData
            }
          } else {
            error = allLeadsError
          }
        } else {
          data = allLeadsData
        }

        if (error) {
          // Provide more helpful error messages
          console.error('Supabase error:', error)
          
          if (error.message.includes('relation') || error.message.includes('does not exist') || error.code === '42P01') {
            throw new Error('The leads table/view does not exist. Please run the database migrations in supabase/migrations/')
          }
          if (error.message.includes('permission denied') || error.message.includes('RLS') || error.code === '42501') {
            throw new Error('Permission denied. Please check your Row Level Security (RLS) policies.')
          }
          if (error.message.includes('JWT') || error.message.includes('Invalid API key')) {
            throw new Error('Invalid Supabase configuration. Please check your NEXT_PUBLIC_BCON_SUPABASE_URL and NEXT_PUBLIC_BCON_SUPABASE_ANON_KEY in .env.local')
          }
          if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            throw new Error('Unable to connect to Supabase. Please check your internet connection and Supabase project status.')
          }
          throw new Error(error.message || 'Failed to fetch leads')
        }
        
        // Map data to match expected Lead interface
        // Handle both all_leads (customer_name) and unified_leads (name) formats
        const mappedLeads = (data || []).map((lead: any) => ({
          id: lead.id,
          name: lead.customer_name || lead.name || null,
          email: lead.email || null,
          phone: lead.phone || null,
          source: lead.first_touchpoint || lead.last_touchpoint || 'web',
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

    // Subscribe to real-time changes from all_leads table
    const channel = supabase
      .channel('leads-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'all_leads',
        },
        async (payload: RealtimePostgresChangesPayload<any>) => {
          // On change, refetch using same logic as initial fetch (try all_leads, fallback to unified_leads)
          try {
            let data: any[] | null = null
            
            const { data: allLeadsData, error: allLeadsError } = await supabase
              .from('all_leads')
              .select('id, customer_name, email, phone, created_at, last_interaction_at, booking_date, booking_time, lead_score, lead_stage, sub_stage, stage_override, unified_context, first_touchpoint, last_touchpoint, status, brand, metadata')
              .order('last_interaction_at', { ascending: false })
              .limit(1000)

            if (allLeadsError) {
              // Fallback to unified_leads if all_leads fails
              const { data: unifiedData } = await supabase
                .from('unified_leads')
                .select('*')
                .order('last_interaction_at', { ascending: false })
                .limit(1000)
              data = unifiedData
            } else {
              data = allLeadsData
            }

            if (data) {
              // Map data to match expected Lead interface (handle both formats)
              const mappedLeads = data.map((lead: any) => ({
                id: lead.id,
                name: lead.customer_name || lead.name || null,
                email: lead.email || null,
                phone: lead.phone || null,
                source: lead.first_touchpoint || lead.last_touchpoint || 'web',
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
            }
          } catch (err) {
            console.error('Error refetching leads after realtime update:', err)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  return { leads, loading, error }
}


