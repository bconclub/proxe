'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { format, subDays } from 'date-fns'

interface ChartData {
  date: string
  value: number
}

const dateRanges = [
  { label: '7D', days: 7 },
  { label: '28D', days: 28 },
  { label: '90D', days: 90 },
  { label: 'Custom', days: null },
]

export default function WebMetrics() {
  const [selectedRange, setSelectedRange] = useState<number>(7)
  const [loading, setLoading] = useState(true)
  const [totalConversations, setTotalConversations] = useState<ChartData[]>([])
  const [totalLeads, setTotalLeads] = useState<ChartData[]>([])
  const [conversionRatio, setConversionRatio] = useState<ChartData[]>([])
  const [avgResponseTime, setAvgResponseTime] = useState<ChartData[]>([])

  const fetchWebMetrics = useCallback(async () => {
    setLoading(true)
    try {
      const days = dateRanges.find(r => r.days === selectedRange)?.days || 7
      const endDate = new Date()
      const startDate = subDays(endDate, days)

      // Fetch web messages for conversations
      const messagesResponse = await fetch('/api/dashboard/web/messages')
      const messagesData = messagesResponse.ok ? await messagesResponse.json() : { messages: [] }

      // Fetch web leads
      const leadsResponse = await fetch('/api/dashboard/leads?source=web&limit=1000')
      const leadsData = leadsResponse.ok ? await leadsResponse.json() : { leads: [] }

      // Generate time series data
      const generateTimeSeries = (
        data: any[],
        dateField: string,
        valueFn: (item: any) => number,
        cumulative = false
      ) => {
        const series: ChartData[] = []
        const dateMap = new Map<string, number>()

        // Initialize all dates with 0
        for (let i = days - 1; i >= 0; i--) {
          const date = subDays(endDate, i)
          const dateKey = format(date, 'MMM d')
          dateMap.set(dateKey, 0)
        }

        // Filter data to date range
        const startDateStr = format(startDate, 'yyyy-MM-dd')
        const endDateStr = format(endDate, 'yyyy-MM-dd')

        // Aggregate data by date
        data.forEach((item) => {
          if (!item[dateField]) return
          const itemDate = new Date(item[dateField])
          const itemDateStr = format(itemDate, 'yyyy-MM-dd')
          
          // Only include items within date range
          if (itemDateStr >= startDateStr && itemDateStr <= endDateStr) {
            const dateKey = format(itemDate, 'MMM d')
            if (dateMap.has(dateKey)) {
              dateMap.set(dateKey, (dateMap.get(dateKey) || 0) + valueFn(item))
            }
          }
        })

        // Convert to array and sort, then make cumulative if needed
        let cumulativeValue = 0
        dateMap.forEach((value, date) => {
          if (cumulative) {
            cumulativeValue += value
            series.push({ date, value: cumulativeValue })
          } else {
            series.push({ date, value })
          }
        })

        return series.sort((a, b) => {
          const dateA = new Date(a.date)
          const dateB = new Date(b.date)
          return dateA.getTime() - dateB.getTime()
        })
      }

      // Total Conversations (unique conversations by date)
      const conversationsMap = new Map<string, Set<string>>()
      const allMessages = messagesData.messages || []
      
      allMessages.forEach((msg: any) => {
        if (!msg.created_at || !msg.lead_id) return
        const msgDate = new Date(msg.created_at)
        const dateStr = format(msgDate, 'yyyy-MM-dd')
        const dateKey = format(msgDate, 'MMM d')
        
        if (dateStr >= format(startDate, 'yyyy-MM-dd') && dateStr <= format(endDate, 'yyyy-MM-dd')) {
          if (!conversationsMap.has(dateKey)) {
            conversationsMap.set(dateKey, new Set())
          }
          conversationsMap.get(dateKey)?.add(msg.lead_id)
        }
      })

      const conversationsSeries: ChartData[] = []
      for (let i = days - 1; i >= 0; i--) {
        const date = subDays(endDate, i)
        const dateKey = format(date, 'MMM d')
        const count = conversationsMap.get(dateKey)?.size || 0
        conversationsSeries.push({ date: dateKey, value: count })
      }
      setTotalConversations(conversationsSeries)

      // Total Leads (leads by date)
      const leadsSeries = generateTimeSeries(
        leadsData.leads || [],
        'created_at',
        () => 1,
        false
      )
      setTotalLeads(leadsSeries)

      // Conversion Ratio (daily conversion rate)
      const allLeads = leadsData.leads || []
      const conversionRatioSeries: ChartData[] = []
      for (let i = days - 1; i >= 0; i--) {
        const date = subDays(endDate, i)
        const dateStr = format(date, 'yyyy-MM-dd')
        const dateKey = format(date, 'MMM d')

        const dayLeads = allLeads.filter((lead: any) => 
          lead.created_at?.startsWith(dateStr) || lead.timestamp?.startsWith(dateStr)
        )
        const dayConverted = dayLeads.filter((lead: any) => 
          lead.booking_date && lead.booking_date.startsWith(dateStr)
        )

        const ratio = dayLeads.length > 0 
          ? (dayConverted.length / dayLeads.length) * 100 
          : 0

        conversionRatioSeries.push({
          date: dateKey,
          value: Math.round(ratio * 10) / 10,
        })
      }
      setConversionRatio(conversionRatioSeries)

      // Average Response Time (mock data for now - would need actual response time data)
      const avgResponseTimeSeries: ChartData[] = []
      const baseResponseTime = 5000 // 5 seconds in milliseconds
      for (let i = days - 1; i >= 0; i--) {
        const date = subDays(endDate, i)
        const dateKey = format(date, 'MMM d')
        const variance = 1 + (Math.random() - 0.5) * 0.3
        avgResponseTimeSeries.push({
          date: dateKey,
          value: Math.round(baseResponseTime * variance),
        })
      }
      setAvgResponseTime(avgResponseTimeSeries)
    } catch (error) {
      console.error('Error fetching web metrics:', error)
      setTotalConversations([])
      setTotalLeads([])
      setConversionRatio([])
      setAvgResponseTime([])
    }
    setLoading(false)
  }, [selectedRange])

  useEffect(() => {
    fetchWebMetrics()
  }, [fetchWebMetrics])

  const ChartCard = ({
    title,
    value,
    data,
    suffix = '',
    formatValue = (v: number) => v.toString(),
  }: {
    title: string
    value: number | string
    data: ChartData[]
    suffix?: string
    formatValue?: (v: number) => string
  }) => (
    <div
      className="bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#262626] rounded-lg p-4 shadow-sm"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
    >
      <div className="mb-3">
        <h3 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
          {title}
        </h3>
        <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
          {typeof value === 'number' ? formatValue(value) : value}
          {suffix && <span className="text-lg ml-1" style={{ color: 'var(--text-secondary)' }}>{suffix}</span>}
        </p>
      </div>
      <div className="h-[120px]">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading...</div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" opacity={0.3} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
                stroke="var(--border-primary)"
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
                stroke="var(--border-primary)"
                width={40}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                }}
                labelStyle={{ color: 'var(--text-secondary)' }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--accent-primary)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: 'var(--accent-primary)' }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Date Range Selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
          Time Range:
        </span>
        {dateRanges.map((range) => (
          <button
            key={range.label}
            onClick={() => range.days && setSelectedRange(range.days)}
            className="px-3 py-1 rounded-md text-sm font-medium transition-colors"
            style={{
              background:
                selectedRange === range.days
                  ? 'var(--accent-primary)'
                  : 'var(--bg-tertiary)',
              color:
                selectedRange === range.days
                  ? 'white'
                  : 'var(--text-secondary)',
            }}
            disabled={range.days === null}
          >
            {range.label}
          </button>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <ChartCard
          title="Total Conversations"
          value={
            totalConversations.length > 0
              ? totalConversations.reduce((sum, item) => sum + item.value, 0)
              : 0
          }
          data={totalConversations}
          formatValue={(v) => v.toLocaleString()}
        />
        <ChartCard
          title="Total Leads"
          value={
            totalLeads.length > 0
              ? totalLeads.reduce((sum, item) => sum + item.value, 0)
              : 0
          }
          data={totalLeads}
          formatValue={(v) => v.toLocaleString()}
        />
        <ChartCard
          title="Conversion Ratio"
          value={
            conversionRatio.length > 0
              ? conversionRatio.reduce((sum, item) => sum + item.value, 0) / conversionRatio.length || 0
              : 0
          }
          data={conversionRatio}
          suffix="%"
          formatValue={(v) => v.toFixed(1)}
        />
        <ChartCard
          title="Avg Response Time"
          value={
            avgResponseTime.length > 0
              ? Math.round(avgResponseTime.reduce((sum, item) => sum + item.value, 0) / avgResponseTime.length) || 0
              : 0
          }
          data={avgResponseTime}
          suffix="ms"
          formatValue={(v) => v.toLocaleString()}
        />
      </div>
    </div>
  )
}



