'use client'

import { useEffect, useState, useCallback } from 'react'

// Make this route public - no authentication required
export const dynamic = 'force-dynamic'

/**
 * Widget Preview Page
 * 
 * Shows a mock landing page with the chat widget embedded,
 * demonstrating how it will look on a real website.
 */
export default function WidgetPage() {
  const [widgetUrl, setWidgetUrl] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [serverAvailable, setServerAvailable] = useState<boolean | null>(null)
  const [showFallback, setShowFallback] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [isRetrying, setIsRetrying] = useState(false)

  const checkServer = useCallback(async () => {
    if (!widgetUrl) {
      setIsLoading(false)
      setIsRetrying(false)
      return
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000) // Increased timeout for production
      
      // Check if URL is same origin (no CORS issues)
      const isSameOrigin = typeof window !== 'undefined' && 
        (widgetUrl.startsWith(window.location.origin) || 
         widgetUrl.includes('localhost') || 
         widgetUrl.includes('127.0.0.1'))
      
      if (isSameOrigin) {
        try {
          // Try to fetch the widget page
          const response = await fetch(widgetUrl, { 
            method: 'GET', 
            mode: 'cors',
            signal: controller.signal,
            cache: 'no-cache',
            credentials: 'include'
          })
          clearTimeout(timeoutId)
          
          if (response.ok) {
            setServerAvailable(true)
            setShowFallback(false)
          } else {
            setServerAvailable(false)
            setShowFallback(true)
          }
        } catch (fetchError) {
          clearTimeout(timeoutId)
          // For localhost or same origin, always try to load iframe (CORS might block fetch but iframe works)
          if (widgetUrl.includes('localhost') || 
              widgetUrl.includes('127.0.0.1') ||
              widgetUrl.includes('windchasers.in') || 
              (typeof window !== 'undefined' && widgetUrl.startsWith(window.location.origin))) {
            setServerAvailable(true)
            setShowFallback(false)
            // Try loading the iframe anyway - it might work even if fetch failed
          } else {
            // For other domains, still try to load but show fallback if it fails
            setServerAvailable(true)
            setShowFallback(false)
          }
        }
      } else {
        // For cross-origin URLs, assume available and let iframe handle it
        setServerAvailable(true)
        setShowFallback(false)
      }
    } catch (error) {
      console.log('Server check error:', error)
      // For localhost or same-origin, always try to load the iframe
      if (widgetUrl.includes('localhost') || 
          widgetUrl.includes('127.0.0.1') ||
          widgetUrl.includes('windchasers.in') || 
          (typeof window !== 'undefined' && widgetUrl.startsWith(window.location.origin))) {
        setServerAvailable(true)
        setShowFallback(false)
      } else {
        // For other domains, still try to load
        setServerAvailable(true)
        setShowFallback(false)
      }
    } finally {
      setIsLoading(false)
      setIsRetrying(false)
    }
  }, [widgetUrl])

  useEffect(() => {
    // Determine the web-agent URL
    let agentUrl: string
    
    const envVar = process.env.NEXT_PUBLIC_WEB_AGENT_URL || ''
    const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost'
    const isOldPort = envVar.includes(':3001')
    
    // Check if we have an environment variable set
    if (envVar && !isOldPort) {
      // Use env var if it's set and correct (not old port 3001)
      agentUrl = envVar
    } else if (isLocalhost && isOldPort) {
      // Override old port 3001 with correct port 4003 for localhost
      agentUrl = 'http://localhost:4003'
    } else {
      // Auto-detect based on current location
      if (typeof window !== 'undefined') {
        const currentHost = window.location.hostname
        const currentProtocol = window.location.protocol
        
        // If we're on production domain (proxe.windchasers.in), use same domain
        if (currentHost.includes('windchasers.in') || currentHost.includes('proxe.windchasers.in')) {
          // On production, widget is at /widget path on same domain
          agentUrl = `${currentProtocol}//${currentHost}`
        } else {
          // Development - use localhost:4003 (Windchasers web-agent dev port)
          agentUrl = 'http://localhost:4003'
        }
      } else {
        // Server-side fallback
        agentUrl = 'http://localhost:4003'
      }
    }
    
    // Construct widget URL
    const url = agentUrl.endsWith('/widget') ? agentUrl : `${agentUrl}/widget`
    setWidgetUrl(url)
  }, [])

  // Separate effect to check server when widgetUrl is set
  useEffect(() => {
    if (widgetUrl) {
      checkServer()
    }
  }, [widgetUrl, checkServer])

  const handleRetry = () => {
    setIsRetrying(true)
    setRetryCount(prev => prev + 1)
    checkServer()
  }

  return (
    <div style={{ 
      width: '100%', 
      height: '100vh',
      backgroundColor: '#1A0F0A',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Mock Landing Page Content */}
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        position: 'relative',
        zIndex: 1
      }}>
        {/* Main Heading */}
        <h1 style={{
          fontSize: 'clamp(2.5rem, 5vw, 4rem)',
          fontWeight: '700',
          color: '#C9A961',
          textAlign: 'center',
          marginBottom: '20px',
          lineHeight: '1.2',
          letterSpacing: '-0.02em'
        }}>
          Windchasers Pilot Training Academy
        </h1>
        
        {/* Tagline */}
        <p style={{
          fontSize: 'clamp(1rem, 2vw, 1.25rem)',
          color: '#E8D5B7',
          textAlign: 'center',
          maxWidth: '800px',
          padding: '0 24px',
          lineHeight: '1.6',
          opacity: 0.9
        }}>
          Your gateway to aviation excellence. Explore our courses and start your journey today.
        </p>
      </div>

      {/* Chat Widget - Embedded as overlay */}
      {/* Always try to load iframe if we have a URL - don't block on server check */}
      {widgetUrl && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 10000
        }}>
          <iframe
            src={widgetUrl}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              backgroundColor: 'transparent',
              pointerEvents: 'auto'
            }}
            title="Chat Widget"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            allow="microphone; camera"
            onError={(e) => {
              console.error('Widget iframe error:', e)
              // Show fallback only after delay to allow iframe to load
              setTimeout(() => {
                // Double-check if iframe actually failed
                const iframe = e.currentTarget
                try {
                  // Try to access iframe - if it fails, show fallback
                  if (!iframe.contentWindow) {
                    setServerAvailable(false)
                    setShowFallback(true)
                  }
                } catch {
                  // CORS error is OK - iframe might still be loading
                  console.log('CORS check (iframe may still be loading)')
                }
              }, 2000)
            }}
            onLoad={() => {
              setServerAvailable(true)
              setShowFallback(false)
            }}
            onLoadStart={() => {
              // Hide fallback when iframe starts loading
              setShowFallback(false)
              setServerAvailable(true)
            }}
          />
        </div>
      )}
      
      {/* Show fallback overlay only if iframe fails to load after timeout */}
      {showFallback && widgetUrl && (
        // Fallback message overlay
        <div 
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            padding: '40px',
            textAlign: 'center',
            color: '#E8D5B7',
            backgroundColor: 'rgba(26, 15, 10, 0.95)',
            borderRadius: '8px',
            zIndex: 10001,
            maxWidth: '600px',
            border: '1px solid rgba(201, 169, 97, 0.3)',
            backdropFilter: 'blur(10px)'
          }}
        >
          <div style={{ marginBottom: '20px' }}>
            <div style={{
              width: '60px',
              height: '60px',
              margin: '0 auto',
              borderRadius: '50%',
              backgroundColor: '#C9A961',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              color: '#1A0F0A',
              fontWeight: 'bold'
            }}>
              W
            </div>
          </div>
          <p style={{ marginBottom: '10px', fontSize: '18px', color: '#C9A961', fontWeight: '600' }}>
            Web-Agent Server Not Running
          </p>
          <p style={{ fontSize: '13px', opacity: 0.8, marginBottom: '15px', lineHeight: '1.6' }}>
            {typeof window !== 'undefined' && window.location.hostname.includes('windchasers.in')
              ? 'The web-agent server needs to be deployed and accessible. Set NEXT_PUBLIC_WEB_AGENT_URL environment variable if the web-agent is on a different domain.'
              : 'The widget preview requires the web-agent server to be running.'}
          </p>
          {typeof window !== 'undefined' && !window.location.hostname.includes('windchasers.in') && (
            <div style={{ 
              backgroundColor: 'rgba(201, 169, 97, 0.1)', 
              padding: '15px', 
              borderRadius: '6px',
              marginBottom: '15px',
              textAlign: 'left'
            }}>
              <p style={{ fontSize: '12px', opacity: 0.9, marginBottom: '8px', fontWeight: '500' }}>
                To start the server locally:
              </p>
              <code style={{ 
                fontSize: '11px', 
                opacity: 0.9, 
                display: 'block', 
                padding: '8px',
                backgroundColor: 'rgba(26, 15, 10, 0.5)',
                borderRadius: '4px',
                fontFamily: 'monospace'
              }}>
                cd brand/windchasers/web-agent/build<br/>
                npm run dev
              </code>
            </div>
          )}
          {typeof window !== 'undefined' && window.location.hostname.includes('windchasers.in') && (
            <div style={{ 
              backgroundColor: 'rgba(201, 169, 97, 0.1)', 
              padding: '15px', 
              borderRadius: '6px',
              marginBottom: '15px',
              textAlign: 'left'
            }}>
              <p style={{ fontSize: '12px', opacity: 0.9, marginBottom: '8px', fontWeight: '500' }}>
                Production Setup:
              </p>
              <p style={{ fontSize: '11px', opacity: 0.9, marginBottom: '8px', lineHeight: '1.6' }}>
                1. Deploy the web-agent server separately or serve it from the same domain<br/>
                2. Set <code style={{ backgroundColor: 'rgba(26, 15, 10, 0.5)', padding: '2px 4px', borderRadius: '2px' }}>NEXT_PUBLIC_WEB_AGENT_URL</code> environment variable<br/>
                3. Or ensure the web-agent is accessible at: <code style={{ backgroundColor: 'rgba(26, 15, 10, 0.5)', padding: '2px 4px', borderRadius: '2px' }}>{typeof window !== 'undefined' ? window.location.origin : 'https://proxe.windchasers.in'}/widget</code>
              </p>
            </div>
          )}
          <p style={{ fontSize: '11px', opacity: 0.6, fontFamily: 'monospace', marginTop: '10px', marginBottom: '20px' }}>
            Expected URL: {widgetUrl}
          </p>
          <button
            onClick={handleRetry}
            disabled={isRetrying}
            style={{
              padding: '10px 20px',
              backgroundColor: '#C9A961',
              color: '#1A0F0A',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: isRetrying ? 'not-allowed' : 'pointer',
              opacity: isRetrying ? 0.6 : 1,
              transition: 'opacity 0.2s',
            }}
            onMouseEnter={(e) => {
              if (!isRetrying) {
                e.currentTarget.style.opacity = '0.9'
              }
            }}
            onMouseLeave={(e) => {
              if (!isRetrying) {
                e.currentTarget.style.opacity = '1'
              }
            }}
          >
            {isRetrying ? 'Checking...' : `Retry Connection ${retryCount > 0 ? `(${retryCount})` : ''}`}
          </button>
        </div>
      )}
    </div>
  )
}
