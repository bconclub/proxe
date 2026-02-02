'use client'

import React, { useState, useEffect } from 'react'
import { ChatWidget } from '@/components/ChatWidget'

/**
 * Bubble-only page for iframe embedding
 * This page shows only the ChatWidget in a bubble-style container
 * Used by embed.js to load the widget in an iframe
 */
export default function BubblePage() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return null
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      right: 0,
      zIndex: 999999,
      background: 'transparent',
      margin: 0,
      padding: 0,
      border: 'none',
      width: '100%',
      height: '100%',
      overflow: 'visible',
      pointerEvents: 'auto'
    }}>
      <div style={{ width: '100%', height: '100%' }}>
        <ChatWidget
          apiUrl="https://agent.windchasers.in/api/chat"
          widgetStyle="bubble"
        />
      </div>
    </div>
  )
}
