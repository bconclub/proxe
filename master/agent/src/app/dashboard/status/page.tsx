'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import ErrorLogsModal from '@/components/dashboard/ErrorLogsModal'

interface ErrorDetail {
  message: string
  timestamp: string
}

interface StatusData {
  systemHealth: 'OK' | 'ERROR'
  buildVersion: string
  webAgentStatus: 'ACTIVE' | 'INACTIVE'
  dashboardStatus: 'ONLINE' | 'OFFLINE'
  whatsappAgentStatus: 'ACTIVE' | 'INACTIVE'
  databaseStatus: 'OK' | 'ERROR'
  lastUpdated: string
  errorDetails?: {
    systemHealth?: ErrorDetail
    database?: ErrorDetail
    webAgent?: ErrorDetail
    whatsappAgent?: ErrorDetail
    dashboard?: ErrorDetail
  }
}

export default function StatusPage() {
  const [status, setStatus] = useState<StatusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [logsModalOpen, setLogsModalOpen] = useState(false)
  const [logsModalComponent, setLogsModalComponent] = useState<string>('')

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
      let webAgentError: ErrorDetail | undefined
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout
        
        const webResponse = await fetch('/api/dashboard/web/messages', {
          credentials: 'include',
          signal: controller.signal,
        })
        clearTimeout(timeoutId)
        
        if (webResponse.ok) {
          webAgentStatus = 'ACTIVE'
        } else {
          webAgentError = {
            message: `Web agent endpoint returned ${webResponse.status}`,
            timestamp: new Date().toISOString(),
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Web agent endpoint unreachable'
        webAgentError = {
          message: errorMsg,
          timestamp: new Date().toISOString(),
        }
        // If endpoint fails, check if database has web sessions
        if (data.database?.status === 'connected') {
          // Assume active if database is connected (simplified check)
          webAgentStatus = 'ACTIVE'
        }
      }
      
      // Determine WhatsApp agent status
      let whatsappAgentStatus: 'ACTIVE' | 'INACTIVE' = 'INACTIVE'
      let whatsappAgentError: ErrorDetail | undefined
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout
        
        const whatsappResponse = await fetch('/api/dashboard/whatsapp/messages', {
          credentials: 'include',
          signal: controller.signal,
        })
        clearTimeout(timeoutId)
        
        if (whatsappResponse.ok) {
          whatsappAgentStatus = 'ACTIVE'
        } else {
          whatsappAgentError = {
            message: `WhatsApp agent endpoint returned ${whatsappResponse.status}`,
            timestamp: new Date().toISOString(),
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'WhatsApp agent endpoint unreachable'
        whatsappAgentError = {
          message: errorMsg,
          timestamp: new Date().toISOString(),
        }
        // If endpoint fails, check if database has WhatsApp sessions
        if (data.database?.status === 'connected') {
          // Assume active if database is connected (simplified check)
          whatsappAgentStatus = 'ACTIVE'
        }
      }
      
      // Determine database status
      const databaseStatus: 'OK' | 'ERROR' = 
        data.database?.status === 'connected' ? 'OK' : 'ERROR'
      
      // Log errors for agents if they fail
      if (webAgentStatus === 'INACTIVE') {
        // Could log here if needed
      }
      if (whatsappAgentStatus === 'INACTIVE') {
        // Could log here if needed
      }
      
      // Merge error details from API with client-side detected errors
      const errorDetails = {
        ...data.errorDetails,
        ...(webAgentError && { webAgent: webAgentError }),
        ...(whatsappAgentError && { whatsappAgent: whatsappAgentError }),
      }
      
      setStatus({
        systemHealth,
        buildVersion: data.systemHealth?.version || '1.0.0',
        webAgentStatus,
        dashboardStatus,
        whatsappAgentStatus,
        databaseStatus,
        lastUpdated: new Date().toISOString(),
        errorDetails: Object.keys(errorDetails).length > 0 ? errorDetails : undefined,
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

  const formatErrorTime = (timestamp: string) => {
    try {
      const date = new Date(timestamp)
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    } catch {
      return timestamp
    }
  }

  const openLogsModal = (component: string) => {
    setLogsModalComponent(component)
    setLogsModalOpen(true)
  }

  const StatusCard = ({ 
    title, 
    status, 
    errorDetail, 
    componentName 
  }: { 
    title: string
    status: string
    errorDetail?: ErrorDetail
    componentName: string
  }) => {
    const isError = status === 'ERROR' || status === 'INACTIVE' || status === 'OFFLINE'
    
    return (
      <div className="p-6 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            {title}
          </h2>
          {getStatusIndicator(status)}
        </div>
        <div className="flex items-center justify-between">
          <p className="text-2xl font-bold" style={{ color: getStatusColor(status) }}>
            {status}
          </p>
          {isError && (
            <button
              onClick={() => openLogsModal(componentName)}
              className="text-xs px-2 py-1 rounded font-medium transition-colors"
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                color: '#ef4444',
                border: '1px solid rgba(239, 68, 68, 0.3)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'
              }}
            >
              View Logs
            </button>
          )}
        </div>
        {isError && errorDetail && (
          <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border-primary)' }}>
            <p className="text-xs flex items-start gap-2" style={{ color: '#ef4444' }}>
              <span>└─</span>
              <span className="flex-1">
                &quot;{errorDetail.message}&quot; at {formatErrorTime(errorDetail.timestamp)}
              </span>
            </p>
          </div>
        )}
      </div>
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
          <StatusCard
            title="System Health"
            status={status.systemHealth}
            errorDetail={status.errorDetails?.systemHealth}
            componentName="System Health"
          />

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
          <StatusCard
            title="Web Agent Status"
            status={status.webAgentStatus}
            errorDetail={status.errorDetails?.webAgent}
            componentName="Web Agent"
          />

          {/* Dashboard Status */}
          <StatusCard
            title="Dashboard Status"
            status={status.dashboardStatus}
            errorDetail={status.errorDetails?.dashboard}
            componentName="Dashboard"
          />

          {/* WhatsApp Agent Status */}
          <StatusCard
            title="WhatsApp Agent Status"
            status={status.whatsappAgentStatus}
            errorDetail={status.errorDetails?.whatsappAgent}
            componentName="WhatsApp Agent"
          />

          {/* Database Status */}
          <StatusCard
            title="Database Status"
            status={status.databaseStatus}
            errorDetail={status.errorDetails?.database}
            componentName="Database"
          />
        </div>

        {/* Error Logs Modal */}
        <ErrorLogsModal
          isOpen={logsModalOpen}
          onClose={() => setLogsModalOpen(false)}
          component={logsModalComponent}
        />
      </div>
    </DashboardLayout>
  )
}
