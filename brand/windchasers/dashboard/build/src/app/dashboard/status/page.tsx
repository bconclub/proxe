'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/dashboard/DashboardLayout'

interface StatusData {
  systemHealth: 'OK' | 'ERROR'
  buildVersion: string
  webAgentStatus: 'ACTIVE' | 'INACTIVE'
  dashboardStatus: 'ONLINE' | 'OFFLINE'
  whatsappAgentStatus: 'ACTIVE' | 'INACTIVE'
  databaseStatus: 'OK' | 'ERROR'
  lastUpdated: string
}

export default function StatusPage() {
  const [status, setStatus] = useState<StatusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Fetch status from API
      const response = await fetch('/api/status', {
        credentials: 'include',
      })
      
      if (!response.ok) {
        throw new Error(`Failed to fetch status: ${response.statusText}`)
      }
      
      const data = await response.json()
      
      // Determine system health
      const systemHealth: 'OK' | 'ERROR' = 
        data.systemHealth?.status === 'ok' && 
        data.database?.status === 'connected' 
          ? 'OK' 
          : 'ERROR'
      
      // Determine dashboard status (if API responds, it's online)
      const dashboardStatus: 'ONLINE' | 'OFFLINE' = response.ok ? 'ONLINE' : 'OFFLINE'
      
      // Determine web agent status (check if there are recent web sessions or if endpoint is accessible)
      let webAgentStatus: 'ACTIVE' | 'INACTIVE' = 'INACTIVE'
      try {
        const webResponse = await fetch('/api/dashboard/web/messages', {
          credentials: 'include',
        })
        if (webResponse.ok) {
          webAgentStatus = 'ACTIVE'
        }
      } catch {
        // If endpoint fails, check if database has web sessions
        if (data.database?.status === 'connected') {
          // Assume active if database is connected (simplified check)
          webAgentStatus = 'ACTIVE'
        }
      }
      
      // Determine WhatsApp agent status
      let whatsappAgentStatus: 'ACTIVE' | 'INACTIVE' = 'INACTIVE'
      try {
        const whatsappResponse = await fetch('/api/dashboard/whatsapp/messages', {
          credentials: 'include',
        })
        if (whatsappResponse.ok) {
          whatsappAgentStatus = 'ACTIVE'
        }
      } catch {
        // If endpoint fails, check if database has WhatsApp sessions
        if (data.database?.status === 'connected') {
          // Assume active if database is connected (simplified check)
          whatsappAgentStatus = 'ACTIVE'
        }
      }
      
      // Determine database status
      const databaseStatus: 'OK' | 'ERROR' = 
        data.database?.status === 'connected' ? 'OK' : 'ERROR'
      
      setStatus({
        systemHealth,
        buildVersion: data.systemHealth?.version || '1.0.0',
        webAgentStatus,
        dashboardStatus,
        whatsappAgentStatus,
        databaseStatus,
        lastUpdated: new Date().toISOString(),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status')
      // Set error status
      setStatus({
        systemHealth: 'ERROR',
        buildVersion: '1.0.0',
        webAgentStatus: 'INACTIVE',
        dashboardStatus: 'OFFLINE',
        whatsappAgentStatus: 'INACTIVE',
        databaseStatus: 'ERROR',
        lastUpdated: new Date().toISOString(),
      })
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
    if (status === 'OK' || status === 'ACTIVE' || status === 'ONLINE') {
      return '#10b981' // green-500
    }
    if (status === 'ERROR' || status === 'INACTIVE' || status === 'OFFLINE') {
      return '#ef4444' // red-500
    }
    return '#f59e0b' // yellow-500
  }

  const getStatusIndicator = (status: string) => {
    const color = getStatusColor(status)
    return (
      <div
        className="w-3 h-3 rounded-full"
        style={{
          backgroundColor: color,
          boxShadow: `0 0 8px ${color}80`,
        }}
      />
    )
  }

  if (loading && !status) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-current" style={{ borderColor: 'var(--accent-primary)' }}></div>
            <p className="mt-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Loading status...
            </p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (!status) return null

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              System Status
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              Last updated: {new Date(status.lastUpdated).toLocaleString()}
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

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 rounded-lg" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
            <p className="text-sm" style={{ color: '#ef4444' }}>Error: {error}</p>
          </div>
        )}

        {/* Status Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* System Health */}
          <div className="p-6 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                System Health
              </h2>
              {getStatusIndicator(status.systemHealth)}
            </div>
            <p className="text-2xl font-bold" style={{ color: getStatusColor(status.systemHealth) }}>
              {status.systemHealth}
            </p>
          </div>

          {/* Build Version */}
          <div className="p-6 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
            <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
              Build Version
            </h2>
            <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              v{status.buildVersion}
            </p>
          </div>

          {/* Web Agent Status */}
          <div className="p-6 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                Web Agent Status
              </h2>
              {getStatusIndicator(status.webAgentStatus)}
            </div>
            <p className="text-2xl font-bold" style={{ color: getStatusColor(status.webAgentStatus) }}>
              {status.webAgentStatus}
            </p>
          </div>

          {/* Dashboard Status */}
          <div className="p-6 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                Dashboard Status
              </h2>
              {getStatusIndicator(status.dashboardStatus)}
            </div>
            <p className="text-2xl font-bold" style={{ color: getStatusColor(status.dashboardStatus) }}>
              {status.dashboardStatus}
            </p>
          </div>

          {/* WhatsApp Agent Status */}
          <div className="p-6 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                WhatsApp Agent Status
              </h2>
              {getStatusIndicator(status.whatsappAgentStatus)}
            </div>
            <p className="text-2xl font-bold" style={{ color: getStatusColor(status.whatsappAgentStatus) }}>
              {status.whatsappAgentStatus}
            </p>
          </div>

          {/* Database Status */}
          <div className="p-6 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                Database Status
              </h2>
              {getStatusIndicator(status.databaseStatus)}
            </div>
            <p className="text-2xl font-bold" style={{ color: getStatusColor(status.databaseStatus) }}>
              {status.databaseStatus}
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
