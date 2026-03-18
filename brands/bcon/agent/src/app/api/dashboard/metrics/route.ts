import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    // AUTHENTICATION DISABLED - No auth check needed
    // const {
    //   data: { user },
    // } = await supabase.auth.getUser()

    // if (!user) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // }

    // Get all leads (use all_leads — every WhatsApp conversation = a lead)
    const { data: leads, error: leadsError } = await supabase
      .from('all_leads')
      .select('*')

    if (leadsError) throw leadsError

    const now = new Date()
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    // Calculate metrics
    const totalConversations = leads?.length || 0
    const activeConversations =
      leads?.filter((lead) => {
        const ts = lead.last_interaction_at || lead.timestamp
        if (!ts) return false
        const d = new Date(ts)
        return !isNaN(d.getTime()) && d >= last24Hours
      }).length || 0

    // Calculate conversion rate (leads with booking / total leads)
    // Booking data is in metadata.web_data.booking_date
    const bookedLeads =
      leads?.filter((lead) => {
        const webData = lead.metadata?.web_data
        return webData?.booking_date && webData?.booking_time
      }).length || 0
    const conversionRate =
      totalConversations > 0
        ? Math.round((bookedLeads / totalConversations) * 100)
        : 0

    // Average response time from conversations metadata
    const { data: agentMessages } = await supabase
      .from('conversations')
      .select('metadata')
      .eq('sender', 'agent')
      .not('metadata->input_to_output_gap_ms', 'is', null)

    let avgResponseTime = 0
    if (agentMessages && agentMessages.length > 0) {
      let totalMs = 0
      let count = 0
      agentMessages.forEach((msg) => {
        const gapMs = msg.metadata?.input_to_output_gap_ms
        const gapMsNum = typeof gapMs === 'number' ? gapMs : parseFloat(gapMs)
        if (!isNaN(gapMsNum) && gapMsNum > 0) {
          totalMs += gapMsNum
          count++
        }
      })
      if (count > 0) {
        avgResponseTime = Math.round(totalMs / count / 60000) // convert ms to minutes
      }
    }

    // Leads by channel (use first_touchpoint to show origin channel)
    const channelCounts: Record<string, number> = {}
    leads?.forEach((lead) => {
      const channel = lead.first_touchpoint || lead.last_touchpoint || 'unknown'
      channelCounts[channel] = (channelCounts[channel] || 0) + 1
    })

    const leadsByChannel = Object.entries(channelCounts).map(([name, value]) => ({
      name,
      value,
    }))

    // Conversations over time (last 7 days) - use last_interaction_at
    const conversationsOverTime = []
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now)
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split('T')[0]
      const count =
        leads?.filter((lead) => {
          const ts = lead.last_interaction_at || lead.timestamp
          return ts && typeof ts === 'string' && ts.startsWith(dateStr)
        }).length || 0
      conversationsOverTime.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        count,
      })
    }

    // Conversion funnel
    const conversionFunnel = [
      { stage: 'Leads', count: totalConversations },
      { stage: 'Contacted', count: leads?.filter((l) => l.status === 'contacted').length || 0 },
      { stage: 'Qualified', count: leads?.filter((l) => l.status === 'qualified').length || 0 },
      { stage: 'Booked', count: bookedLeads },
    ]

    // Response time trends from real data
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const { data: trendMessages } = await supabase
      .from('conversations')
      .select('created_at, metadata')
      .eq('sender', 'agent')
      .not('metadata->input_to_output_gap_ms', 'is', null)
      .gte('created_at', last7Days.toISOString())

    const trendByDate = new Map<string, { total: number; count: number }>()
    trendMessages?.forEach((msg) => {
      const dateKey = new Date(msg.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      const gapMs = msg.metadata?.input_to_output_gap_ms
      const gapMsNum = typeof gapMs === 'number' ? gapMs : parseFloat(gapMs)
      if (!isNaN(gapMsNum) && gapMsNum > 0) {
        const existing = trendByDate.get(dateKey) || { total: 0, count: 0 }
        existing.total += gapMsNum
        existing.count++
        trendByDate.set(dateKey, existing)
      }
    })

    const responseTimeTrends = []
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now)
      date.setDate(date.getDate() - i)
      const dateKey = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      const entry = trendByDate.get(dateKey)
      responseTimeTrends.push({
        date: dateKey,
        avgTime: entry ? Math.round(entry.total / entry.count / 60000) : 0,
      })
    }

    return NextResponse.json({
      totalConversations,
      activeConversations,
      avgResponseTime,
      conversionRate,
      leadsByChannel,
      conversationsOverTime,
      conversionFunnel,
      responseTimeTrends,
    })
  } catch (error) {
    console.error('Error fetching metrics:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Full error:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch metrics',
        message: errorMessage,
      },
      { status: 500 }
    )
  }
}


