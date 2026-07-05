'use client'

import { Suspense } from 'react'
import LeadsTable from '@/components/dashboard/LeadsTable'
import { getCurrentBrandId } from '@/configs'

function ScoutsPageContent() {
  // lokazen brands this segment as "Gigs" (umbrella over Scout + Connector);
  // other scout brands keep "Scouts" filtered to scouts only.
  const isLokazen = getCurrentBrandId() === 'lokazen'
  const title = isLokazen ? 'Gigs' : 'Scouts'
  const filter = isLokazen ? 'gig' : 'scout'
  return <LeadsTable showLimitSelector initialUserTypeFilter={filter} hideUserTypeFilter title={title} />
}

export default function ScoutsPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-sm flex-1" style={{ color: 'var(--text-secondary)' }}>Loading...</div>}>
      <ScoutsPageContent />
    </Suspense>
  )
}
