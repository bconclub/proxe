'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/dashboard/DashboardLayout'

interface StatusData {
  systemHealth: {
    version: string
    status: 'ok' | 'error'
    timestamp: string
  }
  environmentKeys: {
    key: string
    isSet: boolean
  }[]
  supabaseConfig: {
    url: string | null
    urlValid: boolean
    anonKey: string | null
    anonKeyValid: boolean
    serviceRoleKey: string | null
    serviceRoleKeyValid: boolean
  }
  connectivity: {
    canReachSupabase: boolean
    responseTime?: number
    error?: string
  }
  auth: {
    status: 'ok' | 'error' | 'rate_limited'
    canAuthenticate: boolean
    error?: string
    rateLimitInfo?: {
      isRateLimited: boolean
      retryAfter?: number
    }
  }
  database: {
    status: 'connected' | 'disconnected' | 'error' | 'unauthorized'
    message: string
    canQuery: boolean
    error?: string
    tablesAccessible?: string[]
  }
  project: {
    status: 'active' | 'paused' | 'unknown'
    message: string
  }
  apiStatus: {
    claude: {
      status: 'valid' | 'invalid' | 'error'
      message?: string
    }
    supabase: {
      status: 'valid' | 'invalid' | 'error'
      message?: string
    }
  }
  performance: {
    averageGap: number
    fastest: number
    slowest: number
    sample: string
  }
  recommendations: string[]
}

export default function StatusPage() {
  const [status, setStatus] = useState<StatusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchStatus = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch('/api/status', {
        credentials: 'include',
      })
      
      if (!response.ok) {
        throw new Error(`Failed to fetch status: ${response.statusText}`)
      }
      
      const data = await response.json()
      setStatus(data)
      setLastUpdated(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStatus()
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  const getStatusColor = (status: string) => {
    if (status === 'ok' || status === 'connected' || status === 'valid' || status === 'active') {
      return 'text-green-500'
    }
    if (status === 'error' || status === 'disconnected' || status === 'invalid' || status === 'unauthorized') {
      return 'text-red-500'
    }
    if (status === 'rate_limited') {
      return 'text-yellow-500'
    }
    return 'text-gray-500'
  }

  const getStatusBadge = (status: string) => {
    if (status === 'ok' || status === 'connected' || status === 'valid' || status === 'active') {
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    }
    if (status === 'error' || status === 'disconnected' || status === 'invalid' || status === 'unauthorized') {
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    }
    if (status === 'rate_limited') {
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
    }
    return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
  }

  if (loading && !status) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-current"></div>
            <p className="mt-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Loading status...
            </p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (error && !status) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-red-800 dark:text-red-200">Error: {error}</p>
            <button
              onClick={fetchStatus}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (!status) return null

  return (
    <DashboardLayout>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              System Status
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              {lastUpdated && `Last updated: ${lastUpdated.toLocaleTimeString()}`}
            </p>
          </div>
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
            style={{
              background: 'var(--accent-primary)',
              color: 'white',
            }}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {/* System Health */}
        <div className="mb-6 p-6 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            System Health
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Version</p>
              <p className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
                {status.systemHealth.version}
              </p>
            </div>
            <div>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Status</p>
              <span className={`inline-block px-2 py-1 rounded text-sm font-medium ${getStatusBadge(status.systemHealth.status)}`}>
                {status.systemHealth.status.toUpperCase()}
              </span>
            </div>
            <div>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Timestamp</p>
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                {new Date(status.systemHealth.timestamp).toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* Supabase Configuration */}
        <div className="mb-6 p-6 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Supabase Configuration
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>URL</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono" style={{ color: 'var(--text-primary)' }}>
                  {status.supabaseConfig.url || 'Not set'}
                </span>
                {status.supabaseConfig.urlValid ? (
                  <span className="text-green-500">✓</span>
                ) : (
                  <span className="text-red-500">✗</span>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Anon Key</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono" style={{ color: 'var(--text-primary)' }}>
                  {status.supabaseConfig.anonKey || 'Not set'}
                </span>
                {status.supabaseConfig.anonKeyValid ? (
                  <span className="text-green-500">✓</span>
                ) : (
                  <span className="text-red-500">✗</span>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Service Role Key</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono" style={{ color: 'var(--text-primary)' }}>
                  {status.supabaseConfig.serviceRoleKey || 'Not set'}
                </span>
                {status.supabaseConfig.serviceRoleKeyValid ? (
                  <span className="text-green-500">✓</span>
                ) : (
                  <span className="text-red-500">✗</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Connectivity & Services */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Connectivity */}
          <div className="p-6 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
              Connectivity
            </h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Can Reach Supabase</span>
                <span className={getStatusColor(status.connectivity.canReachSupabase ? 'ok' : 'error')}>
                  {status.connectivity.canReachSupabase ? '✓ Yes' : '✗ No'}
                </span>
              </div>
              {status.connectivity.responseTime && (
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Response Time</span>
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                    {status.connectivity.responseTime}ms
                  </span>
                </div>
              )}
              {status.connectivity.error && (
                <div className="mt-2 p-2 rounded bg-red-50 dark:bg-red-900/20">
                  <p className="text-xs text-red-600 dark:text-red-400">{status.connectivity.error}</p>
                </div>
              )}
            </div>
          </div>

          {/* Auth Service */}
          <div className="p-6 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
              Auth Service
            </h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Status</span>
                <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getStatusBadge(status.auth.status)}`}>
                  {status.auth.status.toUpperCase()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Can Authenticate</span>
                <span className={getStatusColor(status.auth.canAuthenticate ? 'ok' : 'error')}>
                  {status.auth.canAuthenticate ? '✓ Yes' : '✗ No'}
                </span>
              </div>
              {status.auth.rateLimitInfo?.isRateLimited && (
                <div className="mt-2 p-2 rounded bg-yellow-50 dark:bg-yellow-900/20">
                  <p className="text-xs text-yellow-600 dark:text-yellow-400">
                    Rate Limited{status.auth.rateLimitInfo.retryAfter && ` - Retry after ${status.auth.rateLimitInfo.retryAfter}s`}
                  </p>
                </div>
              )}
              {status.auth.error && (
                <div className="mt-2 p-2 rounded bg-red-50 dark:bg-red-900/20">
                  <p className="text-xs text-red-600 dark:text-red-400">{status.auth.error}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Database */}
        <div className="mb-6 p-6 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Database
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Status</span>
              <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getStatusBadge(status.database.status)}`}>
                {status.database.status.toUpperCase()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Can Query</span>
              <span className={getStatusColor(status.database.canQuery ? 'ok' : 'error')}>
                {status.database.canQuery ? '✓ Yes' : '✗ No'}
              </span>
            </div>
            <div>
              <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Message</p>
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{status.database.message}</p>
            </div>
            {status.database.error && (
              <div className="mt-2 p-2 rounded bg-red-50 dark:bg-red-900/20">
                <p className="text-xs text-red-600 dark:text-red-400">{status.database.error}</p>
              </div>
            )}
            {status.database.tablesAccessible && status.database.tablesAccessible.length > 0 && (
              <div className="mt-3">
                <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>Accessible Tables</p>
                <div className="flex flex-wrap gap-2">
                  {status.database.tablesAccessible.map((table) => (
                    <span
                      key={table}
                      className="px-2 py-1 rounded text-xs"
                      style={{
                        background: 'var(--bg-tertiary)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {table}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* API Status */}
        <div className="mb-6 p-6 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            API Status
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Supabase API */}
            <div className="p-4 rounded" style={{ background: 'var(--bg-tertiary)' }}>
              <h3 className="font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Supabase API</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Status</span>
                  <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getStatusBadge(status.apiStatus.supabase.status)}`}>
                    {status.apiStatus.supabase.status.toUpperCase()}
                  </span>
                </div>
                {status.apiStatus.supabase.message && (
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {status.apiStatus.supabase.message}
                  </p>
                )}
              </div>
            </div>

            {/* Claude API */}
            <div className="p-4 rounded" style={{ background: 'var(--bg-tertiary)' }}>
              <h3 className="font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Claude API</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Status</span>
                  <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getStatusBadge(status.apiStatus.claude.status)}`}>
                    {status.apiStatus.claude.status.toUpperCase()}
                  </span>
                </div>
                {status.apiStatus.claude.message && (
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {status.apiStatus.claude.message}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Project Status */}
        <div className="mb-6 p-6 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Project Status
          </h2>
          <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Status</span>
            <div className="flex items-center gap-3">
              <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getStatusBadge(status.project.status)}`}>
                {status.project.status.toUpperCase()}
              </span>
            </div>
          </div>
          <p className="text-sm mt-2" style={{ color: 'var(--text-primary)' }}>
            {status.project.message}
          </p>
        </div>

        {/* Environment Keys */}
        <div className="mb-6 p-6 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Environment Variables
          </h2>
          <div className="space-y-2">
            {status.environmentKeys.map((env) => (
              <div key={env.key} className="flex items-center justify-between py-1">
                <span className="text-sm font-mono" style={{ color: 'var(--text-primary)' }}>
                  {env.key}
                </span>
                {env.isSet ? (
                  <span className="text-green-500 text-sm">✓ Set</span>
                ) : (
                  <span className="text-red-500 text-sm">✗ Not Set</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="mb-6 p-6 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Performance Metrics
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Average Gap</p>
              <p className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
                {status.performance.averageGap}s
              </p>
            </div>
            <div>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Fastest</p>
              <p className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
                {status.performance.fastest}s
              </p>
            </div>
            <div>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Slowest</p>
              <p className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
                {status.performance.slowest}s
              </p>
            </div>
            <div>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Sample</p>
              <p className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
                {status.performance.sample}
              </p>
            </div>
          </div>
        </div>

        {/* Recommendations */}
        {status.recommendations && status.recommendations.length > 0 && (
          <div className="p-6 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
              Recommendations
            </h2>
            <ul className="space-y-2">
              {status.recommendations.map((rec, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                    {rec.startsWith('✅') ? '✅' : rec.startsWith('⚠️') ? '⚠️' : '•'}
                  </span>
                  <span className="text-sm flex-1" style={{ color: 'var(--text-primary)' }}>
                    {rec.replace(/^[✅⚠️•]\s*/, '')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
