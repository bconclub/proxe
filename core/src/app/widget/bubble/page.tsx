'use client'

import React, { useState, useEffect } from 'react'
import { ChatWidget } from '@/components/widget/ChatWidget'
import { getBrandConfig } from '@/configs'
import { applyBrandColorVars } from '@/lib/widget-brand-vars'

export const dynamic = 'force-dynamic'

/**
 * Bubble-only page for iframe embedding
 * Renders just the ChatWidget with transparent background
 * No wrapper - widget handles its own positioning
 */
export default function BubblePage() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    applyBrandColorVars(getBrandConfig())
    setMounted(true)
  }, [])

  if (!mounted) return null

  return <ChatWidget widgetStyle="bubble" />
}
