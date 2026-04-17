'use client'

import { Suspense } from 'react'
import BookingsCalendar from '@/components/dashboard/BookingsCalendar'

function BookingsPageContent() {
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


