'use client'

import { useEffect, useState } from 'react'

interface Metrics {
  totalConversations: number
  activeConversations: number
  avgResponseTime: number
  conversionRate: number
  leadsByChannel: { name: string; value: number }[]
  conversationsOverTime: { date: string; count: number }[]
  conversionFunnel: { stage: string; count: number }[]
  responseTimeTrends: { date: string; avgTime: number }[]
}

export function useRealtimeMetrics() {
  const [metrics, setMetrics] = useState<Metrics>({
    totalConversations: 0,
    activeConversations: 0,
    avgResponseTime: 0,
    conversionRate: 0,
    leadsByChannel: [],
    conversationsOverTime: [],
    conversionFunnel: [],
    responseTimeTrends: [],
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const response = await fetch('/api/dashboard/metrics')
        if (!response.ok) throw new Error('Failed to fetch metrics')
        const data = await response.json()
        setMetrics(data)
        setLoading(false)
      } catch (error) {
        console.error('Error fetching metrics:', error)
        setLoading(false)
      }
    }

    fetchMetrics()

    // Refresh metrics every 30 seconds
    const interval = setInterval(fetchMetrics, 30000)

    return () => clearInterval(interval)
  }, [])

  return { metrics, loading }
}


