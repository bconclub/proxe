'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

interface Lead {
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
}

export function useRealtimeLeads() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()

    // Initial fetch
    const fetchLeads = async () => {
      try {
        const { data, error } = await supabase
          .from('unified_leads')
          .select('*')
          .order('timestamp', { ascending: false })
          .limit(1000)

        if (error) {
          // Provide more helpful error messages
          console.error('Supabase error:', error)
          
          if (error.message.includes('relation') || error.message.includes('does not exist') || error.code === '42P01') {
            throw new Error('The unified_leads view does not exist. Please run the database migrations in supabase/migrations/')
          }
          if (error.message.includes('permission denied') || error.message.includes('RLS') || error.code === '42501') {
            throw new Error('Permission denied. Please check your Row Level Security (RLS) policies.')
          }
          if (error.message.includes('JWT') || error.message.includes('Invalid API key')) {
            throw new Error('Invalid Supabase configuration. Please check your NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
          }
          if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            throw new Error('Unable to connect to Supabase. Please check your internet connection and Supabase project status.')
          }
          throw new Error(error.message || 'Failed to fetch leads')
        }
        setLeads(data || [])
        setLoading(false)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch leads'
        console.error('Error fetching leads:', err)
        setError(errorMessage)
        setLoading(false)
      }
    }

    fetchLeads()

    // Subscribe to real-time changes from sessions table (master table)
    const channel = supabase
      .channel('leads-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sessions',
        },
        (payload: RealtimePostgresChangesPayload<any>) => {
          // Map session data to unified_leads format
          const mapSessionToLead = (session: any) => ({
            id: session.id,
            name: session.user_name || null,
            email: session.email || null,
            phone: session.phone || null,
            source: session.channel || 'web',
            timestamp: session.created_at || new Date().toISOString(),
            status: session.booking_status === 'confirmed' ? 'booked' : 
                    session.booking_status === 'pending' ? 'pending' :
                    session.booking_status === 'cancelled' ? 'cancelled' : null,
            booking_date: session.booking_date || null,
            booking_time: session.booking_time || null,
          })

          if (payload.eventType === 'INSERT') {
            const newSession = payload.new
            const mappedLead = mapSessionToLead(newSession)
            if (mappedLead.name || mappedLead.email || mappedLead.phone) {
              setLeads((prev) => [mappedLead, ...prev].slice(0, 1000))
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedSession = payload.new
            const mappedLead = mapSessionToLead(updatedSession)
            setLeads((prev) =>
              prev.map((lead) =>
                lead.id === mappedLead.id ? mappedLead : lead
              )
            )
          } else if (payload.eventType === 'DELETE') {
            setLeads((prev) => prev.filter((lead) => lead.id !== payload.old.id))
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


