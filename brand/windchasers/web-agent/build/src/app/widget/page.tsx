'use client'

import React, { useEffect, useState } from 'react'
import { ChatWidget } from '@/components/ChatWidget'
import '@/styles/theme.css'

/**
 * Widget-only page for embedding
 * This page shows only the ChatWidget without any page content
 * Using client-side only rendering to avoid hydration mismatches
 */
export default function WidgetPage() {
  const [mounted, setMounted] = useState(false)
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api/chat'

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div style={{ 
        width: '100vw', 
        height: '100vh',
        backgroundColor: 'transparent',
        position: 'fixed',
        top: 0,
        left: 0,
        overflow: 'hidden',
        margin: 0,
        padding: 0
      }} />
    )
  }

  return (
    <div style={{ 
      width: '100vw', 
      height: '100vh',
      backgroundColor: '#0F0A06', // Match widget theme dark background for visibility
      position: 'fixed',
      top: 0,
      left: 0,
      margin: 0,
      padding: 0,
      overflow: 'hidden'
    }}>
      <ChatWidget apiUrl={apiUrl} widgetStyle="bubble" />
    </div>
  )
}
