'use client'

import { useEffect, useState } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { 
  MdMessage,
  MdLocalFireDepartment,
  MdAccessTime,
  MdAnalytics,
} from 'react-icons/md'

interface ChannelMetricsProps {
  channel: 'web' | 'whatsapp' | 'voice' | 'social'
}

const COLORS = ['#5B1A8C', '#00C49F', '#FFBB28', '#FF8042']

export default function ChannelMetrics({ channel }: ChannelMetricsProps) {
  const [metrics, setMetrics] = useState({
    totalConversations: 0,
    activeConversations: 0,
    conversionRate: 0,
    avgResponseTime: 0,
    conversationsOverTime: [] as { date: string; count: number }[],
    statusBreakdown: [] as { name: string; value: number }[],
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const response = await fetch(`/api/dashboard/channels/${channel}/metrics`)
        if (!response.ok) throw new Error('Failed to fetch metrics')
        const data = await response.json()
        setMetrics(data)
        setLoading(false)
      } catch (error) {
        console.error('Error fetching channel metrics:', error)
        setLoading(false)
      }
    }

    fetchMetrics()
    const interval = setInterval(fetchMetrics, 30000) // Refresh every 30 seconds
    return () => clearInterval(interval)
  }, [channel])

  if (loading) {
    return <div className="text-center py-8 text-gray-900 dark:text-gray-100">Loading metrics...</div>
  }

  const channelNames = {
    web: 'Web Chat',
    whatsapp: 'WhatsApp',
    voice: 'Voice',
    social: 'Social Media',
  }

  return (
    <div className="space-y-6">
      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#262626] overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <span className="text-gray-600 dark:text-gray-400">
                  <MdMessage size={32} />
                </span>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                    Total Conversations
                  </dt>
                  <dd className="text-lg font-medium text-gray-900 dark:text-white">
                    {metrics.totalConversations}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#262626] overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <span className="text-gray-600 dark:text-gray-400">
                  <MdLocalFireDepartment size={32} />
                </span>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                    Active (24h)
                  </dt>
                  <dd className="text-lg font-medium text-gray-900 dark:text-white">
                    {metrics.activeConversations}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#262626] overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <span className="text-gray-600 dark:text-gray-400">
                  <MdAccessTime size={32} />
                </span>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                    Avg Response Time
                  </dt>
                  <dd className="text-lg font-medium text-gray-900 dark:text-white">
                    {metrics.avgResponseTime}m
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#262626] overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <span className="text-gray-600 dark:text-gray-400">
                  <MdAnalytics size={32} />
                </span>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                    Conversion Rate
                  </dt>
                  <dd className="text-lg font-medium text-gray-900 dark:text-white">
                    {metrics.conversionRate}%
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conversations Over Time */}
        <div className="bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#262626] shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            {channelNames[channel]} Conversations Over Time
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={metrics.conversationsOverTime}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#5B1A8C"
                name="Conversations"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Status Breakdown */}
        <div className="bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#262626] shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Leads by Status
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={metrics.statusBreakdown}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) =>
                  `${name} ${(percent * 100).toFixed(0)}%`
                }
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {metrics.statusBreakdown.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}


