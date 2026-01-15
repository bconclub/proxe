'use client'

import { useState, useEffect } from 'react'
import { format, startOfWeek, endOfWeek, parseISO } from 'date-fns'
import { formatDateTime } from '@/lib/utils'
import Link from 'next/link'

interface Booking {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  booking_date: string | null
  booking_time: string | null
  source?: string | null
  first_touchpoint?: string | null
  status?: string | null
}

export default function RecentBookings() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchThisWeekBookings()
  }, [])

  const fetchThisWeekBookings = async () => {
    setLoading(true)
    try {
      const now = new Date()
      const weekStart = startOfWeek(now, { weekStartsOn: 0 }) // Sunday
      const weekEnd = endOfWeek(now, { weekStartsOn: 0 }) // Saturday

      const startDate = format(weekStart, 'yyyy-MM-dd')
      const endDate = format(weekEnd, 'yyyy-MM-dd')

      const response = await fetch(
        `/api/dashboard/bookings?startDate=${startDate}&endDate=${endDate}`
      )
      if (!response.ok) throw new Error('Failed to fetch bookings')
      const data = await response.json()

      // Sort by date and time, limit to 10
      const sorted = (data.bookings || [])
        .sort((a: Booking, b: Booking) => {
          const dateA = new Date(`${a.booking_date}T${a.booking_time}`)
          const dateB = new Date(`${b.booking_date}T${b.booking_time}`)
          return dateA.getTime() - dateB.getTime()
        })
        .slice(0, 10)

      setBookings(sorted)
    } catch (error) {
      console.error('Error fetching bookings:', error)
      setBookings([])
    }
    setLoading(false)
  }

  const getSourceColor = (source: string | null | undefined): { className?: string; style?: React.CSSProperties } => {
    const accentColor = typeof window !== 'undefined' 
      ? getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim() || 'var(--accent-primary)'
      : 'var(--accent-primary)'
    
    if (source === 'voice') {
      return { style: { backgroundColor: accentColor } }
    }
    
    const sourceColors: Record<string, string> = {
      web: 'bg-blue-500',
      whatsapp: 'bg-green-500',
      social: 'bg-pink-500',
    }
    return { className: sourceColors[source || ''] || 'bg-gray-500' }
  }

  const formatBookingDateTime = (date: string | null, time: string | null) => {
    if (!date || !time) return 'N/A'
    try {
      const dateTime = parseISO(`${date}T${time}`)
      return format(dateTime, 'MMM d, h:mm a')
    } catch {
      return `${date} ${time}`
    }
  }

  if (loading) {
    return (
      <div className="text-center py-4" style={{ color: 'var(--text-secondary)' }}>
        Loading bookings...
      </div>
    )
  }

  if (bookings.length === 0) {
    return (
      <div className="text-center py-4" style={{ color: 'var(--text-secondary)' }}>
        No bookings this week
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {bookings.map((booking) => (
        <div
          key={booking.id}
          className="p-3 rounded-lg border transition-colors hover:bg-opacity-50"
          style={{
            background: 'var(--bg-tertiary)',
            borderColor: 'var(--border-primary)',
          }}
        >
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              <h4 className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                {booking.name || 'Unknown'}
              </h4>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                {formatBookingDateTime(booking.booking_date, booking.booking_time)}
              </p>
            </div>
            {booking.first_touchpoint && (
              <span
                className={`px-2 py-1 rounded-full text-xs font-medium text-white ${getSourceColor(
                  booking.first_touchpoint
                ).className || ''}`}
                style={getSourceColor(booking.first_touchpoint).style}
              >
                {booking.first_touchpoint}
              </span>
            )}
          </div>
          {booking.email && (
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {booking.email}
            </p>
          )}
          {booking.phone && (
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {booking.phone}
            </p>
          )}
        </div>
      ))}
      <div className="pt-2">
        <Link
          href="/dashboard/bookings"
          className="text-sm font-medium hover:underline"
          style={{ color: 'var(--accent-primary)' }}
        >
          View All Bookings →
        </Link>
      </div>
    </div>
  )
}



