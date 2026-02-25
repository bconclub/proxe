'use client'

import { useState, useEffect, useCallback } from 'react'
import { MdClose } from 'react-icons/md'

interface ErrorLog {
  timestamp: string
  component: string
  message: string
  details?: string
}

interface ErrorLogsModalProps {
  isOpen: boolean
  onClose: () => void
  component: string
}

export default function ErrorLogsModal({ isOpen, onClose, component }: ErrorLogsModalProps) {
  const [logs, setLogs] = useState<ErrorLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch(`/api/status/error-logs?component=${encodeURIComponent(component)}&limit=10`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch error logs')
      }
      
      const data = await response.json()
      setLogs(data.logs || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch error logs')
    } finally {
      setLoading(false)
    }
  }, [component])

  useEffect(() => {
    if (isOpen) {
      fetchLogs()
    }
  }, [isOpen, fetchLogs])

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp)
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    } catch {
      return timestamp
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-50" 
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
        <div 
          className="relative w-full max-w-2xl bg-white dark:bg-[#1A1A1A] rounded-lg shadow-xl z-50 flex flex-col max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-[#262626] flex-shrink-0">
            <div>
              <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                Error Logs: {component}
              </h2>
              <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                Last 10 error logs for this component
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            >
              <MdClose size={24} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-current" style={{ borderColor: 'var(--accent-primary)' }}></div>
                <p className="mt-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Loading logs...
                </p>
              </div>
            ) : error ? (
              <div className="p-4 rounded-lg" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                <p className="text-sm" style={{ color: '#ef4444' }}>Error: {error}</p>
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  No error logs found for {component}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {logs.map((log, index) => (
                  <div
                    key={index}
                    className="p-4 rounded-lg border"
                    style={{
                      background: 'var(--bg-secondary)',
                      borderColor: 'rgba(239, 68, 68, 0.3)',
                    }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}>
                            {log.component}
                          </span>
                          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            {formatTimestamp(log.timestamp)}
                          </span>
                        </div>
                        <p className="text-sm font-medium mt-1" style={{ color: '#ef4444' }}>
                          {log.message}
                        </p>
                        {log.details && (
                          <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                            {log.details}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-[#262626] flex-shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg font-medium transition-colors"
              style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-primary)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
