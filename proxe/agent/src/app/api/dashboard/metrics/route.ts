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

    // Get all leads
    const { data: leads, error: leadsError } = await supabase
      .from('unified_leads')
      .select('*')

    if (leadsError) throw leadsError

    const now = new Date()
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    // Calculate metrics
    const totalConversations = leads?.length || 0
    const activeConversations =
      leads?.filter(
        (lead) =>
          new Date(lead.last_interaction_at || lead.timestamp) >= last24Hours
      ).length || 0

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

    // Average response time (mock data - replace with actual calculation)
    const avgResponseTime = 5 // minutes

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
        leads?.filter(
          (lead) =>
            (lead.last_interaction_at || lead.timestamp).startsWith(dateStr)
        ).length || 0
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

    // Response time trends (mock data - replace with actual calculation)
    const responseTimeTrends = []
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now)
      date.setDate(date.getDate() - i)
      responseTimeTrends.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        avgTime: Math.floor(Math.random() * 10) + 3, // Mock data
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
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      },
      { status: 500 }
    )
  }
}


