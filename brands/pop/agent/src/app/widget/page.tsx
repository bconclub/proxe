'use client'

import React, { useState, useEffect } from 'react'
import { ChatWidget } from '@/components/widget/ChatWidget'

export const dynamic = 'force-dynamic'

/**
 * Widget-only page for embedding and dashboard preview.
 * Renders ChatWidget with transparent background - widget handles
 * its own positioning (bubble bottom-right, fixed within iframe).
 */
export default function WidgetPage() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return <ChatWidget widgetStyle="bubble" />
}
