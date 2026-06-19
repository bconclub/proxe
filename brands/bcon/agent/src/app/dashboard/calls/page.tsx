'use client'

import { Suspense } from 'react'
import CallsTable from '@/components/dashboard/CallsTable'

export default function CallsPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-sm flex-1" style={{ color: 'var(--text-secondary)' }}>Loading...</div>}>
      <CallsTable />
    </Suspense>
  )
}
