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
import { useRealtimeMetrics } from '@/hooks/useRealtimeMetrics'
import { 
  MdMessage,
  MdLocalFireDepartment,
  MdAccessTime,
  MdAnalytics,
} from 'react-icons/md'

interface MetricsDashboardProps {
  detailed?: boolean
}

const COLORS = ['#5B1A8C', '#00C49F', '#FFBB28', '#FF8042', '#8884d8']

export default function MetricsDashboard({ detailed = false }: MetricsDashboardProps) {
  const { metrics, loading } = useRealtimeMetrics()

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

      {detailed && (
        <>
          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Conversations Over Time */}
            <div className="bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#262626] shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                Conversations Over Time
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

            {/* Leads by Source */}
            <div className="bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#262626] shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                Leads by Source
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={metrics.leadsByChannel}
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
                    {metrics.leadsByChannel.map((entry, index) => (
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

            {/* Conversion Funnel */}
            <div className="bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#262626] shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                Conversion Funnel
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={metrics.conversionFunnel}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="stage" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#00C49F" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Response Time Trends */}
            <div className="bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#262626] shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                Response Time Trends
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={metrics.responseTimeTrends}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="avgTime"
                    stroke="#FF8042"
                    name="Avg Response Time (min)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  )
}


