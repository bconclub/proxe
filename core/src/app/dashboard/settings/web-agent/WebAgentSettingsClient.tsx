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
  const [isResettingChat, setIsResettingChat] = useState(false)
  const [showCodePanel, setShowCodePanel] = useState(false)
  const [copySuccess, setCopySuccess] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Auto-load preview when component mounts
  useEffect(() => {
    if (iframeRef.current) {
      iframeRef.current.src = '/widget/bubble'
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

      if (iframeRef.current) {
        iframeRef.current.src = '/widget/bubble'
      }

      setTimeout(() => {
        setIsResetting(false)
      }, 800)
    } catch (error) {
      console.error('Error resetting widget:', error)
      setIsResetting(false)
    }
  }

  const handleResetChat = () => {
    if (typeof window === 'undefined') return

    setIsResettingChat(true)
    try {
      // ChatWidget stores the session id at this key for windchasers.
      window.localStorage.removeItem('windchasers.chat.sessionId')

      if (iframeRef.current) {
        iframeRef.current.src = `/widget/bubble?reset=${Date.now()}`
      }

      setTimeout(() => {
        setIsResettingChat(false)
      }, 800)
    } catch (error) {
      console.error('Error resetting chat session:', error)
      setIsResettingChat(false)
    }
  }

  const handleCopyCode = () => {
    navigator.clipboard.writeText(embedCode)
    setCopySuccess(true)
    setTimeout(() => setCopySuccess(false), 2000)
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '')
  const embedCode = `<script src="${appUrl}/api/widget/embed.js"></script>`

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
        {/* Installation Code Modal */}
        {showCodePanel && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              backdropFilter: 'blur(4px)',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px'
            }}
            onClick={() => setShowCodePanel(false)}
          >
            <div
              style={{
                width: '100%',
                maxWidth: '600px',
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: '16px',
                border: '1px solid var(--border-primary)',
                boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
                position: 'relative',
                overflow: 'hidden'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ padding: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <MdCode size={28} style={{ color: 'var(--accent-primary)' }} />
                    <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                      Installation
                    </h2>
                  </div>
                  <button
                    onClick={() => setShowCodePanel(false)}
                    className="p-2 rounded-full transition-colors hover:bg-white/5"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <MdClose size={24} />
                  </button>
                </div>

                <div
                  className="p-8 rounded-2xl"
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid var(--border-primary)',
                    boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.05)'
                  }}
                >
                  <p className="text-base mb-6 font-medium" style={{ color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                    Add this script tag to your website&apos;s footer to embed the chat widget.
                  </p>

                  <div className="relative group">
                    <div
                      className="p-5 rounded-xl overflow-x-auto text-sm font-mono"
                      style={{
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border-primary)',
                        color: 'var(--accent-primary)',
                        minHeight: '100px',
                        display: 'flex',
                        alignItems: 'center',
                        paddingRight: '60px'
                      }}
                    >
                      <code style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{embedCode}</code>
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
          </div>
        )}

        {/* LEFT PANEL (30%) - Controls */}
        <div
          style={{
            width: '30%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid var(--border-primary)',
            backgroundColor: 'var(--bg-secondary)',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '24px',
              borderBottom: '1px solid var(--border-primary)',
              backgroundColor: 'var(--bg-secondary)',
            }}
          >
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

          {/* Controls */}
          <div
            style={{
              flex: 1,
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <button
              onClick={() => setShowCodePanel(!showCodePanel)}
              className="w-full px-6 py-3 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2"
              style={{
                backgroundColor: showCodePanel ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                color: showCodePanel ? 'white' : 'var(--text-primary)',
                border: '1px solid var(--border-primary)',
                cursor: 'pointer',
              }}
            >
              <MdCode size={18} />
              {showCodePanel ? 'Code Active' : 'Show Installation Code'}
            </button>

            <button
              onClick={handleResetWidget}
              disabled={isResetting}
              className="w-full px-6 py-3 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2"
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

            <button
              onClick={handleResetChat}
              disabled={isResettingChat}
              className="w-full px-6 py-3 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-primary)',
                cursor: isResettingChat ? 'not-allowed' : 'pointer',
                opacity: isResettingChat ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isResettingChat) e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
              }}
              onMouseLeave={(e) => {
                if (!isResettingChat) e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'
              }}
            >
              <MdRefresh size={18} className={isResettingChat ? 'animate-spin' : ''} />
              {isResettingChat ? 'Resetting chat...' : 'Reset Chat'}
            </button>

            <div
              style={{
                marginTop: 'auto',
                padding: '16px',
                borderRadius: '12px',
                backgroundColor: 'var(--accent-subtle)',
                border: '1px dashed var(--accent-primary)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <MdInfoOutline size={16} style={{ color: 'var(--accent-primary)' }} />
                <h4 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>Preview Mode</h4>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                The widget appears as it would on your website. Click the bubble to open the chat.
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL (70%) - Browser Mockup */}
        <div
          style={{
            width: '70%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--bg-primary)',
            padding: '40px',
          }}
        >
          {/* Browser Mockup Container */}
          <div
            style={{
              width: '100%',
              maxWidth: '1000px',
              height: '100%',
              maxHeight: '680px',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)',
              backgroundColor: 'var(--bg-secondary)',
            }}
          >
            {/* Browser Top Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                backgroundColor: 'var(--bg-tertiary)',
                borderBottom: '1px solid var(--border-primary)',
              }}
            >
              {/* Window Controls (3 dots) */}
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <div
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: '#FF5F57',
                  }}
                />
                <div
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: '#FFBD2E',
                  }}
                />
                <div
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: '#28CA41',
                  }}
                />
              </div>

              {/* URL Bar */}
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '6px 16px',
                  backgroundColor: 'var(--bg-secondary)',
                  borderRadius: '6px',
                  border: '1px solid var(--border-primary)',
                }}
              >
                <span
                  style={{
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                  }}
                >
                  {(() => {
                    const raw =
                      process.env.NEXT_PUBLIC_SITE_URL ||
                      process.env.NEXT_PUBLIC_APP_URL ||
                      'https://windchasers.in'
                    try {
                      return new URL(raw).hostname.replace(/^www\./, '')
                    } catch {
                      return raw.replace(/^https?:\/\//, '').replace(/^www\./, '')
                    }
                  })()}
                </span>
              </div>
            </div>

            {/* Browser Content Area */}
            <div
              style={{
                flex: 1,
                position: 'relative',
                backgroundColor: 'var(--bg-primary)',
                overflow: 'hidden',
              }}
            >
              {/* Fake Page Content Background */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'linear-gradient(180deg, var(--bg-primary) 0%, var(--bg-secondary) 100%)',
                }}
              >
                {/* Mock website content lines */}
                <div style={{ padding: '60px', opacity: 0.3 }}>
                  <div style={{ width: '40%', height: '24px', backgroundColor: 'var(--text-secondary)', borderRadius: '4px', marginBottom: '24px' }} />
                  <div style={{ width: '60%', height: '12px', backgroundColor: 'var(--text-secondary)', borderRadius: '4px', marginBottom: '12px' }} />
                  <div style={{ width: '50%', height: '12px', backgroundColor: 'var(--text-secondary)', borderRadius: '4px', marginBottom: '12px' }} />
                  <div style={{ width: '55%', height: '12px', backgroundColor: 'var(--text-secondary)', borderRadius: '4px', marginBottom: '40px' }} />
                  <div style={{ width: '80%', height: '200px', backgroundColor: 'var(--text-secondary)', borderRadius: '8px', marginBottom: '24px' }} />
                  <div style={{ width: '45%', height: '12px', backgroundColor: 'var(--text-secondary)', borderRadius: '4px', marginBottom: '12px' }} />
                  <div style={{ width: '40%', height: '12px', backgroundColor: 'var(--text-secondary)', borderRadius: '4px' }} />
                </div>
              </div>

              {/* Widget Iframe - Positioned bottom-right like a real chat bubble */}
              <div
                style={{
                  position: 'absolute',
                  bottom: '20px',
                  right: '20px',
                  width: '420px',
                  height: '580px',
                  pointerEvents: 'none',
                }}
              >
                <iframe
                  ref={iframeRef}
                  src="/widget/bubble"
                  style={{
                    width: '420px',
                    height: '580px',
                    border: 'none',
                    pointerEvents: 'auto',
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
        </div>
      </div>
    </DashboardLayout>
  )
}
