'use client'

import { useState, useEffect, useRef } from 'react'
import DashboardLayout from '@/components/dashboard/DashboardLayout'

export default function WebAgentSettingsClient() {
  const [isResetting, setIsResetting] = useState(false)
  const [showCodePanel, setShowCodePanel] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Auto-load preview when component mounts
  useEffect(() => {
    // Determine widget URL - use environment variable or default to localhost in development
    const widgetUrl = process.env.NEXT_PUBLIC_WEB_AGENT_URL
      ? `${process.env.NEXT_PUBLIC_WEB_AGENT_URL}/widget`
      : typeof window !== 'undefined' && window.location.hostname === 'localhost'
        ? 'http://localhost:4001/widget'
        : 'https://widget.proxe.in/widget'

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
          key.startsWith('proxe-') ||
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
          ? 'http://localhost:4001/widget'
          : 'https://widget.proxe.in/widget'

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

  const embedCode = `<script src="https://widget.proxe.in/widget/embed.js"></script>`

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
              width: '500px',
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
            <div style={{ padding: '32px', flex: 1 }}>
              <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
                Installation
              </h2>

              <div className="p-8 rounded-xl" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-primary)' }}>
                <p className="text-base mb-6 font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Add this script tag to your website to embed the chat widget:
                </p>

                <div className="relative group">
                  <div
                    className="p-5 rounded-xl overflow-x-auto text-sm font-mono"
                    style={{
                      backgroundColor: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-primary)',
                      color: 'var(--text-primary)',
                      minHeight: '100px',
                      display: 'flex',
                      alignItems: 'center',
                      paddingRight: '60px'
                    }}
                  >
                    <code style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{embedCode}</code>
                  </div>

                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(embedCode)
                    }}
                    className="absolute top-1/2 -translate-y-1/2 right-3 p-2.5 rounded-lg transition-all flex items-center justify-center"
                    style={{
                      backgroundColor: 'var(--bg-hover)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-primary)',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                    }}
                    title="Copy to clipboard"
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

                <div className="mt-8 p-5 rounded-xl" style={{ backgroundColor: 'var(--accent-subtle)' }}>
                  <p className="text-xs" style={{ color: 'var(--accent-primary)' }}>
                    <strong>Note:</strong> The widget will automatically initialize when the script loads.
                    Place this script tag before the closing &lt;/body&gt; tag.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Full Screen Preview */}
        <div
          style={{
            width: showCodePanel ? 'calc(100% - 500px)' : '100%',
            marginLeft: showCodePanel ? '0' : '0',
            height: '100%',
            position: 'relative',
            backgroundColor: 'var(--bg-primary)',
            display: 'flex',
            flexDirection: 'column',
            transition: 'width 0.3s ease',
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
              backgroundColor: 'var(--bg-primary)',
            }}
          >
            <iframe
              ref={iframeRef}
              src={process.env.NEXT_PUBLIC_WEB_AGENT_URL
                ? `${process.env.NEXT_PUBLIC_WEB_AGENT_URL}/widget`
                : typeof window !== 'undefined' && window.location.hostname === 'localhost'
                  ? 'http://localhost:4001/widget'
                  : 'https://widget.proxe.in/widget'}
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
              onLoad={(e) => {
                console.log('Widget iframe loaded')
              }}
            />
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
