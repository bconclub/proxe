'use client'

import { Suspense } from 'react'
import CallsTable from '@/components/dashboard/CallsTable'
import { useFeatureFlags } from '@/lib/useFeatureFlags'

export default function CallsPage() {
  // Voice/Calls is a per-brand feature toggle (Settings → Features) - a brand
  // with voice off can't reach this page even by direct URL.
  const { voice } = useFeatureFlags()
  if (!voice) {
    return (
      <div className="text-center py-16 text-sm" style={{ color: 'var(--text-secondary)' }}>
        Calls are not enabled for this brand.
      </div>
    )
  }
  return (
    <Suspense fallback={<div className="text-center py-12 text-sm flex-1" style={{ color: 'var(--text-secondary)' }}>Loading...</div>}>
      <CallsTable />
    </Suspense>
  )
}
