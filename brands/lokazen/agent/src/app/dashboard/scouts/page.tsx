'use client'

import { Suspense } from 'react'
import LeadsTable from '@/components/dashboard/LeadsTable'

function ScoutsPageContent() {
  return <LeadsTable showLimitSelector initialUserTypeFilter="scout" hideUserTypeFilter />
}

export default function ScoutsPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-sm flex-1" style={{ color: 'var(--text-secondary)' }}>Loading...</div>}>
      <ScoutsPageContent />
    </Suspense>
  )
}
