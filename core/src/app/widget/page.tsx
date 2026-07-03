'use client'

import React, { useState, useEffect } from 'react'
// @brand/widget resolves to the pack's widget: either a re-export of core's
// ChatWidget or the brand's own fork-exact implementation.
import { ChatWidget } from '@brand/widget'
import { getBrandConfig } from '@/configs'
import { applyBrandColorVars } from '@/lib/widget-brand-vars'

export const dynamic = 'force-dynamic'

/**
 * Widget-only page for embedding and dashboard preview.
 * Renders ChatWidget with transparent background - widget handles
 * its own positioning (bubble bottom-right, fixed within iframe).
 */
export default function WidgetPage() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    applyBrandColorVars(getBrandConfig())
    setMounted(true)
  }, [])

  if (!mounted) return null

  return <ChatWidget widgetStyle="bubble" />
}
