'use client'

import { useEffect, useState } from 'react'
import { formatDate, formatTime } from '@/lib/utils'
import { useRealtimeLeads } from '@/hooks/useRealtimeLeads'
import CalendarView from './CalendarView'

interface Booking {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  booking_date: string | null
  booking_time: string | null
  source: string | null
  first_touchpoint?: string | null
  last_touchpoint?: string | null
  metadata?: any
}

interface BookingsCalendarProps {
  view?: 'full' | 'upcoming' | 'calendar'
}

export default function BookingsCalendar({ view = 'full' }: BookingsCalendarProps) {
  const { leads } = useRealtimeLeads()
  const [bookings, setBookings] = useState<Booking[]>([])

  useEffect(() => {
    const bookingsWithDates = leads.filter(
      (lead) => lead.booking_date && lead.booking_time
    ) as Booking[]

    // Sort by booking date and time
    const sorted = bookingsWithDates.sort((a, b) => {
      const dateA = new Date(`${a.booking_date}T${a.booking_time}`)
      const dateB = new Date(`${b.booking_date}T${b.booking_time}`)
      return dateA.getTime() - dateB.getTime()
    })

    if (view === 'upcoming') {
      const now = new Date()
      setBookings(
        sorted.filter((booking) => {
          const bookingDateTime = new Date(
            `${booking.booking_date}T${booking.booking_time}`
          )
          return bookingDateTime >= now
        })
      )
    } else {
      setBookings(sorted)
    }
  }, [leads, view])

  // Calendar view
  if (view === 'calendar' || view === 'full') {
    return <CalendarView bookings={bookings} />
  }

  // Upcoming list view
  const upcomingBookings = bookings.slice(0, 10)

  return (
    <div>
      <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Next 10 Upcoming Bookings
        </h3>

      <div className="space-y-4">
        {upcomingBookings.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No bookings found
          </div>
        ) : (
          upcomingBookings.map((booking) => (
            <div
              key={booking.id}
              className="border border-gray-200 dark:border-[#262626] bg-white dark:bg-[#1A1A1A] rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="text-lg font-medium text-gray-900 dark:text-white">
                    {booking.name || 'Unnamed Lead'}
                  </h4>
                  <div className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
                    {booking.email && <div>Email: {booking.email}</div>}
                    {booking.phone && <div>Phone: {booking.phone}</div>}
                    <div>
                      Date: {booking.booking_date && formatDate(booking.booking_date)}
                    </div>
                    <div>
                      Time: {booking.booking_time && formatTime(booking.booking_time)}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <span 
                    className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full"
                    style={{ 
                      backgroundColor: 'var(--accent-subtle)',
                      color: 'var(--accent-primary)'
                    }}
                  >
                    {booking.source || booking.first_touchpoint || booking.last_touchpoint || 'web'}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}


