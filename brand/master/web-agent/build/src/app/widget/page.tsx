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

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div style={{ 
        width: '100%', 
        height: '100vh',
        backgroundColor: 'transparent',
        position: 'relative',
        overflow: 'hidden'
      }} />
    )
  }

  return (
    <div style={{ 
      width: '100%', 
      height: '100vh',
      backgroundColor: 'transparent',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <ChatWidget widgetStyle="searchbar" />
    </div>
  )
}
