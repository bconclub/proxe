'use client'

import { useEffect, useState } from 'react'
import { 
  MdMessage,
  MdLocalFireDepartment,
  MdAccessTime,
  MdAnalytics,
} from 'react-icons/md'

interface ChannelMetricsProps {
  channel: 'web' | 'whatsapp' | 'voice' | 'social'
}

export default function ChannelMetrics({ channel }: ChannelMetricsProps) {
  const [metrics, setMetrics] = useState({
    totalConversations: 0,
    activeConversations: 0,
    conversionRate: 0,
    avgResponseTime: 0,
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
    </div>
  )
}


