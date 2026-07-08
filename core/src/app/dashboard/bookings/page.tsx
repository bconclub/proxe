'use client'

import { Suspense } from 'react'
import BookingsCalendar from '@/components/dashboard/BookingsCalendar'
import CampaignCalendar from '@/components/dashboard/CampaignCalendar'
import { getBrandConfig } from '@/configs'

function BookingsPageContent() {
  // POP "Events" = the campaign calendar (confirmed + AI/leadership tentative
  // events, whole-day/week spans), not grievance/call/demo bookings.
  if (getBrandConfig().brand === 'pop') {
    return <CampaignCalendar />
  }
  return (
    <BookingsCalendar view="calendar" />
  )
}

export default function BookingsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <BookingsPageContent />
    </Suspense>
  )
}


