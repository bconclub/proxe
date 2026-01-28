'use client'

import { useState, useEffect, useRef } from 'react'
import DashboardLayout from '@/components/dashboard/DashboardLayout'

export default function WebAgentSettingsClient() {
  const [isResetting, setIsResetting] = useState(false)
  const [showCodePanel, setShowCodePanel] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Auto-load preview when component mounts
  useEffect(() => {
    // Determine widget URL - use environment variable or default to same origin
    // IMPORTANT: If env var shows 3001 (old value), force 4003 for localhost development
    const envVar = process.env.NEXT_PUBLIC_WEB_AGENT_URL || ''
    const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost'
    const isOldPort = envVar.includes(':3001')
    
    let widgetUrl: string
    if (isLocalhost && (isOldPort || !envVar)) {
      // Force correct port for localhost development (safety fallback)
      // Use root page (/) to show hero title + widget, not just /widget
      widgetUrl = 'http://localhost:4003/'
    } else if (envVar && !isOldPort) {
      // Use env var if it's set and correct - use root page for full preview
      widgetUrl = `${envVar}/`
    } else if (isLocalhost) {
      // Localhost fallback - use root page
      widgetUrl = 'http://localhost:4003/'
    } else if (typeof window !== 'undefined') {
      // Production fallback - use root page
      widgetUrl = `${window.location.origin}/`
    } else {
      // Server-side fallback
      widgetUrl = '/'
    }
    
    // Ensure iframe loads when component mounts
    if (iframeRef.current) {
      iframeRef.current.src = widgetUrl
    }
  }, [])

  const handleResetWidget = () => {
    if (typeof window === 'undefined') return
    
    setIsResetting(true)
    try {
      // Clear all localStorage items related to the widget
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && (
          key.startsWith('windchasers-') ||
          key.startsWith('chat-') ||
          key.startsWith('session-') ||
          key.includes('widget') ||
          key.includes('chat')
        )) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key))
      
      // Determine widget URL
      const widgetUrl = process.env.NEXT_PUBLIC_WEB_AGENT_URL 
        ? `${process.env.NEXT_PUBLIC_WEB_AGENT_URL}/widget`
        : typeof window !== 'undefined' && window.location.hostname === 'localhost'
        ? 'http://localhost:4003/widget'
        : typeof window !== 'undefined'
        ? `${window.location.origin}/widget`
        : '/widget'
      
      // Reload the iframe to reset the widget state
      if (iframeRef.current) {
        iframeRef.current.src = widgetUrl
      }
      
      setTimeout(() => {
        setIsResetting(false)
      }, 500)
    } catch (error) {
      console.error('Error resetting widget:', error)
      setIsResetting(false)
    }
  }

  const embedCode = `<script src="https://proxe.windchasers.in/widget/embed.js"></script>`

  return (
    <DashboardLayout>
      <div style={{ 
        width: 'calc(100% + 64px)',
        height: 'calc(100vh - 48px)', 
        margin: '-24px -32px',
        padding: 0,
        position: 'relative',
        display: 'flex', 
        overflow: 'hidden',
      }}>
        {/* Installation Code Panel - Left Side */}
        {showCodePanel && (
          <div 
            style={{
              width: '400px',
              height: '100%',
              position: 'relative',
              left: 0,
              top: 0,
              backgroundColor: 'var(--bg-secondary)',
              borderRight: '1px solid var(--border-primary)',
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
              zIndex: 1000,
              boxShadow: '2px 0 8px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div style={{ padding: '24px', flex: 1 }}>
              <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                Installation
              </h2>
              
              <div className="p-6 rounded-lg" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-primary)' }}>
                <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                  Add this script tag to your website to embed the chat widget:
                </p>
                
                <div className="relative">
                  <pre
                    className="p-4 rounded-lg overflow-x-auto text-sm font-mono"
                    style={{
                      backgroundColor: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                    }}
                  >
                    <code>{embedCode}</code>
                  </pre>
                  
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(embedCode)
                      // You could add a toast notification here
                    }}
                    className="absolute top-2 right-2 px-3 py-1.5 rounded text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: 'var(--bg-hover)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-primary)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--accent-subtle)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                    }}
                  >
                    Copy
                  </button>
                </div>
                
                <div className="mt-4 p-4 rounded-lg" style={{ backgroundColor: 'var(--accent-subtle)' }}>
                  <p className="text-xs" style={{ color: 'var(--accent-primary)' }}>
                    <strong>Note:</strong> The widget will automatically initialize when the script loads. 
                    Make sure to place this script tag before the closing &lt;/body&gt; tag for best performance.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Full Screen Preview */}
        <div 
          style={{
            width: showCodePanel ? 'calc(100% - 400px)' : '100%',
            marginLeft: showCodePanel ? '400px' : '0',
            height: '100%',
            position: 'relative',
            backgroundColor: 'var(--bg-primary)',
            display: 'flex',
            flexDirection: 'column',
            transition: 'width 0.3s ease, margin-left 0.3s ease',
          }}
        >
          {/* Header with controls */}
          <div 
            style={{
              padding: '16px 24px',
              borderBottom: '1px solid var(--border-primary)',
              backgroundColor: 'var(--bg-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <div>
              <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)', marginBottom: '4px' }}>
                Widget Preview
              </h1>
              <p className="text-xs" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                Live preview of your chat widget
              </p>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <button
                onClick={() => setShowCodePanel(!showCodePanel)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-primary)',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'
                }}
              >
                {showCodePanel ? 'Hide Code' : 'Show Code'}
              </button>
              <button
                onClick={handleResetWidget}
                disabled={isResetting}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  backgroundColor: isResetting ? 'var(--bg-tertiary)' : 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-primary)',
                  cursor: isResetting ? 'not-allowed' : 'pointer',
                  opacity: isResetting ? 0.6 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isResetting) {
                    e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isResetting) {
                    e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'
                  }
                }}
              >
                {isResetting ? 'Resetting...' : 'Reset Widget'}
              </button>
            </div>
          </div>

          {/* Widget Container - Full Screen */}
          <div 
            style={{
              flex: 1,
              position: 'relative',
              overflow: 'hidden',
              backgroundColor: 'transparent', // Transparent to show widget's own background
            }}
          >
            <iframe
              ref={iframeRef}
              src={(() => {
                // Use same logic as widgetUrl resolution above
                // Use root page (/) to show hero title + widget, not just /widget
                const envVar = process.env.NEXT_PUBLIC_WEB_AGENT_URL || ''
                const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost'
                const isOldPort = envVar.includes(':3001')
                
                if (isLocalhost && (isOldPort || !envVar)) {
                  return 'http://localhost:4003/'
                } else if (envVar && !isOldPort) {
                  return `${envVar}/`
                } else if (isLocalhost) {
                  return 'http://localhost:4003/'
                } else if (typeof window !== 'undefined') {
                  return `${window.location.origin}/`
                } else {
                  return '/'
                }
              })()}
              className="w-full h-full border-0"
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
              }}
              title="Widget Preview"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
              allow="microphone; camera"
              onError={(e) => {
                console.error('Widget iframe error:', e)
              }}
              onLoad={() => {
                // Widget iframe loaded successfully
              }}
            />
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
