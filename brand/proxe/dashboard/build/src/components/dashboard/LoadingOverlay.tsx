'use client'

import { useEffect, useState } from 'react'

interface LoadingOverlayProps {
  isLoading: boolean
  message?: string
}

export default function LoadingOverlay({ isLoading, message = 'Loading...' }: LoadingOverlayProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [shouldRender, setShouldRender] = useState(false)

  useEffect(() => {
    if (isLoading) {
      setShouldRender(true)
      // Small delay to ensure smooth fade in
      const timer = setTimeout(() => setIsVisible(true), 10)
      return () => clearTimeout(timer)
    } else {
      // Fade out first, then remove from DOM
      setIsVisible(false)
      const timer = setTimeout(() => setShouldRender(false), 300)
      return () => clearTimeout(timer)
    }
  }, [isLoading])

  if (!shouldRender) return null

  return (
    <div
      className={`loading-overlay fixed inset-0 z-50 flex items-center justify-center transition-all duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
      }}
    >
      <div className="loading-overlay-content flex flex-col items-center gap-4">
        {/* Loading Spinner */}
        <div className="loading-overlay-spinner relative w-16 h-16">
          {/* Outer ring */}
          <div
            className="loading-overlay-spinner-outer absolute inset-0 rounded-full border-4 animate-spin"
            style={{
              borderColor: 'var(--accent-primary)',
              borderTopColor: 'transparent',
              borderRightColor: 'transparent',
              borderWidth: '4px',
              animationDuration: '1s',
            }}
          />
          {/* Inner ring */}
          <div
            className="loading-overlay-spinner-inner absolute inset-2 rounded-full border-4 animate-spin"
            style={{
              borderColor: 'transparent',
              borderTopColor: 'var(--accent-primary)',
              borderRightColor: 'var(--accent-primary)',
              borderWidth: '3px',
              animationDuration: '0.8s',
              animationDirection: 'reverse',
            }}
          />
          {/* Center dot */}
          <div
            className="loading-overlay-spinner-center absolute inset-0 flex items-center justify-center"
          >
            <div
              className="loading-overlay-spinner-dot w-2 h-2 rounded-full"
              style={{
                backgroundColor: 'var(--accent-primary)',
              }}
            />
          </div>
        </div>
        
        {/* Loading Message */}
        <p
          className="loading-overlay-message text-lg font-medium animate-pulse"
          style={{ color: 'var(--text-primary)' }}
        >
          {message}
        </p>
      </div>
    </div>
  )
}

