'use client'

import { useState, useEffect } from 'react'
import { getBrandConfig } from '@/configs'

export interface FeatureFlags {
  voice?: boolean
  brain?: boolean
  pipelineFunnel?: boolean
  followUpSequence?: boolean
}

/**
 * Runtime feature flags for the dashboard.
 *
 * Starts from the brand config defaults (getBrandConfig().features) — synchronous,
 * so there's NO flash for the common case where the DB matches the default — then
 * overrides from /api/dashboard/settings/features once it loads. Gates (nav, the
 * Calls page, the Brain button) read this instead of the static config so the
 * Settings → Features toggles take effect without a redeploy.
 */
export function useFeatureFlags(): FeatureFlags {
  const [flags, setFlags] = useState<FeatureFlags>(() => getBrandConfig().features || {})

  useEffect(() => {
    let alive = true
    fetch('/api/dashboard/settings/features')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d?.features) setFlags({ ...(getBrandConfig().features || {}), ...d.features })
      })
      .catch(() => {
        /* keep config defaults on failure */
      })
    return () => {
      alive = false
    }
  }, [])

  return flags
}
