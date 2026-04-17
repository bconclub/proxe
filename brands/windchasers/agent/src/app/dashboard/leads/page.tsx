'use client'

import { Suspense } from 'react'
import LeadsTable from '@/components/dashboard/LeadsTable'

function LeadsPageContent() {
  return <LeadsTable showLimitSelector />
}

export default function LeadsPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-sm flex-1" style={{ color: 'var(--text-secondary)' }}>Loading...</div>}>
      <LeadsPageContent />
    </Suspense>
  )
}
