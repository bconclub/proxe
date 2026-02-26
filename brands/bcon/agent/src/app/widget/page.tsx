'use client'

import React, { useEffect, useState } from 'react'
import { ChatWidget } from '@/components/widget/ChatWidget'

export const dynamic = 'force-dynamic'

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
      backgroundColor: '#0F0A06',
      position: 'fixed',
      top: 0,
      left: 0,
      margin: 0,
      padding: 0,
      overflow: 'hidden'
    }}>
      <ChatWidget widgetStyle="bubble" />
    </div>
  )
}
