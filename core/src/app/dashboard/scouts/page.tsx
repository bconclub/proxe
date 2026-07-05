'use client'

import { Suspense } from 'react'
import LeadsTable from '@/components/dashboard/LeadsTable'
import { getCurrentBrandId } from '@/configs'

function ScoutsPageContent() {
  // lokazen brands this segment as "Gigs"; other scout brands keep "Scouts".
  const title = getCurrentBrandId() === 'lokazen' ? 'Gigs' : 'Scouts'
  return <LeadsTable showLimitSelector initialUserTypeFilter="scout" hideUserTypeFilter title={title} />
}

export default function ScoutsPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-sm flex-1" style={{ color: 'var(--text-secondary)' }}>Loading...</div>}>
      <ScoutsPageContent />
    </Suspense>
  )
}
