import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { subDays, format, parseISO } from 'date-fns'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    // AUTHENTICATION DISABLED - No auth check needed
    // const {
    //   data: { user },
    // } = await supabase.auth.getUser()

    // if (!user) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // }

    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '7', 10)

    const endDate = new Date()
    const startDate = subDays(endDate, days)

    // Get all leads
    const { data: leads, error: leadsError } = await supabase
      .from('all_leads')
      .select('*')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())

    if (leadsError) throw leadsError

    // Get all messages for conversations
    const { data: messages, error: messagesError } = await supabase
      .from('conversations')
      .select('created_at, lead_id, channel')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())

    if (messagesError) throw messagesError

    // Generate time series data
    const generateTimeSeries = (
      data: any[],
      dateField: string,
      groupBy: 'day' | 'hour' = 'day'
    ) => {
      const series: { date: string; value: number }[] = []
      const dateMap = new Map<string, number>()

      // Initialize all dates with 0
      for (let i = days - 1; i >= 0; i--) {
        const date = subDays(endDate, i)
        const dateKey = format(date, 'MMM d')
        dateMap.set(dateKey, 0)
      }

      // Count data points per date
      data.forEach((item) => {
        const itemDate = parseISO(item[dateField])
        const dateKey = format(itemDate, 'MMM d')
        dateMap.set(dateKey, (dateMap.get(dateKey) || 0) + 1)
      })

      // Convert to array
      dateMap.forEach((value, date) => {
        series.push({ date, value })
      })

      return series.sort((a, b) => {
        const dateA = parseISO(a.date)
        const dateB = parseISO(b.date)
        return dateA.getTime() - dateB.getTime()
      })
    }

    // Total Leads time series
    const totalLeads = generateTimeSeries(leads || [], 'created_at')

    // Total Conversations time series (unique lead_ids per day)
    const conversationsByDate = new Map<string, Set<string>>()
    messages?.forEach((msg) => {
      const dateKey = format(parseISO(msg.created_at), 'MMM d')
      if (!conversationsByDate.has(dateKey)) {
        conversationsByDate.set(dateKey, new Set())
      }
      conversationsByDate.get(dateKey)?.add(msg.lead_id)
    })

    const totalConversations: { date: string; value: number }[] = []
    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(endDate, i)
      const dateKey = format(date, 'MMM d')
      totalConversations.push({
        date: dateKey,
        value: conversationsByDate.get(dateKey)?.size || 0,
      })
    }

    // Conversion Ratio (leads with booking / total conversations)
    const conversionRatio: { date: string; value: number }[] = []
    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(endDate, i)
      const dateKey = format(date, 'MMM d')
      const dateStr = format(date, 'yyyy-MM-dd')

      const dayLeads = leads?.filter((lead) =>
        lead.created_at?.startsWith(dateStr)
      ) || []
      const dayConversations = conversationsByDate.get(dateKey)?.size || 0

      const bookedLeads = dayLeads.filter((lead) => {
        const webData = lead.metadata?.web_data
        const bookingDate = lead.booking_date || webData?.booking_date
        return bookingDate && bookingDate.startsWith(dateStr)
      }).length

      const ratio =
        dayConversations > 0 ? (bookedLeads / dayConversations) * 100 : 0

      conversionRatio.push({
        date: dateKey,
        value: Math.round(ratio * 10) / 10, // Round to 1 decimal
      })
    }

    // Average Response Time (mock data for now - replace with actual calculation from messages)
    const avgResponseTime: { date: string; value: number }[] = []
    const baseResponseTime = 5000 // 5 seconds in milliseconds
    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(endDate, i)
      const dateKey = format(date, 'MMM d')
      // Mock data with slight variation
      const variance = 1 + (Math.random() - 0.5) * 0.3
      avgResponseTime.push({
        date: dateKey,
        value: Math.round(baseResponseTime * variance),
      })
    }

    // Calculate summary totals for overview cards
    const totalLeadsCount = totalLeads.reduce((sum, item) => sum + item.value, 0)
    
    // Total unique conversations across entire period (not sum of daily counts)
    const allUniqueConversations = new Set<string>()
    messages?.forEach((msg) => {
      if (msg.lead_id) {
        allUniqueConversations.add(msg.lead_id)
      }
    })
    const totalConversationsCount = allUniqueConversations.size
    
    // Average conversion ratio
    const avgConversionRatio = conversionRatio.length > 0
      ? conversionRatio.reduce((sum, item) => sum + item.value, 0) / conversionRatio.length
      : 0
    
    // Average response time
    const avgResponseTimeValue = avgResponseTime.length > 0
      ? Math.round(avgResponseTime.reduce((sum, item) => sum + item.value, 0) / avgResponseTime.length)
      : 0

    return NextResponse.json({
      totalLeads,
      totalConversations,
      conversionRatio,
      avgResponseTime,
      // Summary totals for overview cards
      summary: {
        totalLeads: totalLeadsCount,
        totalConversations: totalConversationsCount,
        conversionRatio: avgConversionRatio,
        avgResponseTime: avgResponseTimeValue,
      },
    })
  } catch (error) {
    console.error('Error fetching insights:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch insights',
        details:
          process.env.NODE_ENV === 'development'
            ? error instanceof Error
              ? error.message
              : 'Unknown error'
            : undefined,
      },
      { status: 500 }
    )
  }
}



