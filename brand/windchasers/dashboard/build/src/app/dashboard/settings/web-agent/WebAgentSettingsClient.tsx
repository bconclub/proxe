'use client'

import { useState, useEffect, useRef } from 'react'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import {
  MdCode,
  MdRefresh,
  MdContentCopy,
  MdClose,
  MdFiberManualRecord,
  MdCheckCircle,
  MdInfoOutline
} from 'react-icons/md'

export default function WebAgentSettingsClient() {
  const [isResetting, setIsResetting] = useState(false)
  const [showCodePanel, setShowCodePanel] = useState(false)
  const [copySuccess, setCopySuccess] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Auto-load preview when component mounts
  useEffect(() => {
    const envVar = process.env.NEXT_PUBLIC_WEB_AGENT_URL || ''
    const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost'
    const isOldPort = envVar.includes(':3001')

    let widgetUrl: string
    if (isLocalhost && (isOldPort || !envVar)) {
      widgetUrl = 'http://localhost:4003/'
    } else if (envVar && !isOldPort) {
      widgetUrl = `${envVar}/`
    } else if (isLocalhost) {
      widgetUrl = 'http://localhost:4003/'
    } else if (typeof window !== 'undefined') {
      widgetUrl = 'https://agent.windchasers.in/'
    } else {
      widgetUrl = 'https://agent.windchasers.in/'
    }

    if (iframeRef.current) {
      iframeRef.current.src = widgetUrl
    }
  }, [])

  const handleResetWidget = () => {
    if (typeof window === 'undefined') return

    setIsResetting(true)
    try {
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

      const widgetUrl = process.env.NEXT_PUBLIC_WEB_AGENT_URL
        ? `${process.env.NEXT_PUBLIC_WEB_AGENT_URL}/widget`
        : typeof window !== 'undefined' && window.location.hostname === 'localhost'
          ? 'http://localhost:4003/widget'
          : 'https://agent.windchasers.in/widget'

      if (iframeRef.current) {
        iframeRef.current.src = widgetUrl
      }

      setTimeout(() => {
        setIsResetting(false)
      }, 800)
    } catch (error) {
      console.error('Error resetting widget:', error)
      setIsResetting(false)
    }
  }

  const handleCopyCode = () => {
    navigator.clipboard.writeText(embedCode)
    setCopySuccess(true)
    setTimeout(() => setCopySuccess(false), 2000)
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
        backgroundColor: 'var(--bg-primary)',
      }}>
        {/* Installation Code Panel - Left Side Sidebar */}
        <div
          style={{
            width: showCodePanel ? '400px' : '0px',
            height: '100%',
            backgroundColor: 'var(--bg-secondary)',
            borderRight: showCodePanel ? '1px solid var(--border-primary)' : '0 solid transparent',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 100,
            transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1), border-right 0.4s linear',
          }}
        >
          <div style={{ padding: '32px 24px', width: '400px', flex: 1, opacity: showCodePanel ? 1 : 0, transition: 'opacity 0.3s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MdCode size={24} style={{ color: 'var(--accent-primary)' }} />
                <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  Installation
                </h2>
              </div>
              <button
                onClick={() => setShowCodePanel(false)}
                className="p-1 rounded-full transition-colors"
                style={{ color: 'var(--text-secondary)', backgroundColor: 'transparent' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <MdClose size={24} />
              </button>
            </div>

            <div
              className="p-6 rounded-xl"
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-primary)',
                boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.05)'
              }}
            >
              <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                Add this script tag to your website's footer to embed the chat widget.
              </p>

              <div className="relative group">
                <div
                  className="p-4 rounded-lg overflow-x-auto text-xs font-mono"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-primary)',
                    color: 'var(--accent-primary)',
                    minHeight: '80px',
                    display: 'flex',
                    alignItems: 'center',
                    paddingRight: '60px'
                  }}
                >
                  <code style={{ wordBreak: 'break-all' }}>{embedCode}</code>
                </div>

                <button
                  onClick={handleCopyCode}
                  className="absolute top-1/2 -translate-y-1/2 right-3 p-2.5 rounded-lg transition-all flex items-center gap-2"
                  style={{
                    backgroundColor: copySuccess ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                    color: copySuccess ? 'white' : 'var(--text-primary)',
                    border: '1px solid var(--border-primary)',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
                  }}
                  title="Copy to clipboard"
                >
                  {copySuccess ? <MdCheckCircle size={18} /> : <MdContentCopy size={18} />}
                  <span className="text-xs font-medium">{copySuccess ? 'Copied' : ''}</span>
                </button>
              </div>

              <div
                className="mt-8 p-5 rounded-xl flex gap-3"
                style={{
                  backgroundColor: 'var(--accent-subtle)',
                  border: '1px dashed var(--accent-primary)'
                }}
              >
                <MdInfoOutline size={20} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                <div>
                  <h4 className="text-xs font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Integration Note</h4>
                  <p className="text-xs opacity-80" style={{ color: 'var(--text-primary)', lineHeight: '1.5' }}>
                    The widget will automatically initialize when the script loads.
                    Place it before the closing <code>&lt;/body&gt;</code> tag.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Preview Container */}
        <div
          style={{
            flex: 1,
            height: '100%',
            position: 'relative',
            backgroundColor: 'var(--bg-primary)',
            display: 'flex',
            flexDirection: 'column',
            transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {/* Header with controls */}
          <div
            style={{
              padding: '16px 32px',
              borderBottom: '1px solid var(--border-primary)',
              backgroundColor: 'rgba(26, 15, 10, 0.8)', // Semi-transparent dark
              backdropFilter: 'blur(12px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
              zIndex: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    Widget Preview
                  </h1>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '10px',
                      fontWeight: 'bold',
                      textTransform: 'uppercase',
                      backgroundColor: 'rgba(34, 197, 94, 0.1)',
                      color: '#22c55e',
                      border: '1px solid rgba(34, 197, 94, 0.2)'
                    }}
                  >
                    <MdFiberManualRecord size={8} className="animate-pulse" />
                    Live
                  </span>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Interact with your virtual agent in real-time
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <button
                onClick={() => setShowCodePanel(!showCodePanel)}
                className="px-6 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2"
                style={{
                  backgroundColor: showCodePanel ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                  color: showCodePanel ? 'white' : 'var(--text-primary)',
                  border: '1px solid var(--border-primary)',
                  cursor: 'pointer',
                  boxShadow: showCodePanel ? '0 0 15px rgba(201, 169, 97, 0.4)' : 'none'
                }}
              >
                <MdCode size={18} />
                {showCodePanel ? 'Code Active' : 'Show Code'}
              </button>

              <button
                onClick={handleResetWidget}
                disabled={isResetting}
                className="px-6 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-primary)',
                  cursor: isResetting ? 'not-allowed' : 'pointer',
                  opacity: isResetting ? 0.6 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isResetting) e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                }}
                onMouseLeave={(e) => {
                  if (!isResetting) e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'
                }}
              >
                <MdRefresh size={18} className={isResetting ? 'animate-spin' : ''} />
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
              backgroundColor: '#000', // Dark background for the preview area
            }}
          >
            {/* Overlay Gradient for more premium look if needed, but the widget has its own UI */}
            <iframe
              ref={iframeRef}
              src={(() => {
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
                  return 'https://agent.windchasers.in/'
                } else {
                  return 'https://agent.windchasers.in/'
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
            />
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
