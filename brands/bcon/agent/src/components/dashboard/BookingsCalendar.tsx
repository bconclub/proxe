'use client'

import { useEffect, useState, useCallback } from 'react'
import { formatDate, formatTime } from '@/lib/utils'
import CalendarView from './CalendarView'
import { MdSync, MdCheckCircle, MdError } from 'react-icons/md'

interface Booking {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  booking_date: string | null
  booking_time: string | null
  booking_title?: string | null
  source: string | null
  first_touchpoint?: string | null
  last_touchpoint?: string | null
  metadata?: any
}

interface BookingsCalendarProps {
  view?: 'full' | 'upcoming' | 'calendar'
}

export default function BookingsCalendar({ view = 'full' }: BookingsCalendarProps) {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<{
    success: boolean
    message: string
    details?: string
    errorList?: string[]
  } | null>(null)
  const [showErrors, setShowErrors] = useState(false)

  const fetchBookings = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/bookings')
      if (!res.ok) throw new Error('Failed to fetch bookings')
      const data = await res.json()
      const sorted = (data.bookings || []).sort((a: Booking, b: Booking) => {
        const dateA = new Date(`${a.booking_date}T${a.booking_time}`)
        const dateB = new Date(`${b.booking_date}T${b.booking_time}`)
        return dateA.getTime() - dateB.getTime()
      })

      if (view === 'upcoming') {
        const now = new Date()
        setBookings(
          sorted.filter((booking: Booking) => {
            const bookingDateTime = new Date(
              `${booking.booking_date}T${booking.booking_time}`
            )
            return bookingDateTime >= now
          })
        )
      } else {
        setBookings(sorted)
      }
    } catch (err) {
      console.error('Error fetching bookings:', err)
    }
  }, [view])

  useEffect(() => {
    fetchBookings()
  }, [fetchBookings])

  // Auto-sync with Google Calendar on page load
  useEffect(() => {
    if (view === 'calendar' || view === 'full') {
      handleSyncCalendar()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSyncCalendar = async () => {
    setSyncing(true)
    setSyncStatus(null)

    try {
      const response = await fetch('/api/calendar/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      // Safely parse response — read as text first to avoid JSON.parse crash
      const text = await response.text()
      let data: any
      try {
        data = JSON.parse(text)
      } catch {
        console.error('Calendar sync returned non-JSON:', text.substring(0, 200))
        throw new Error('Calendar sync failed — unexpected server response')
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to sync calendar')
      }

      setSyncStatus({
        success: !data.errors || data.errors.length === 0,
        message: data.message || 'Synced',
        details: data.errors && data.errors.length > 0
          ? `${data.created} created, ${data.updated} updated. ${data.errors.length} errors.`
          : `${data.created} created, ${data.updated} updated.`,
        errorList: data.errors || [],
      })
      setShowErrors(false)

      // Refresh bookings after sync
      setTimeout(() => { fetchBookings() }, 2000)
    } catch (error: any) {
      setSyncStatus({
        success: false,
        message: error.message || 'Failed to sync calendar',
      })
    } finally {
      setSyncing(false)
    }
  }

  // Calendar view
  if (view === 'calendar' || view === 'full') {
    const syncBar = (
      <div className="flex items-center gap-2">
        <button
          onClick={handleSyncCalendar}
          disabled={syncing}
          className={`
            flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors
            ${syncing ? 'bg-gray-400 cursor-not-allowed text-white' : 'text-white hover:opacity-90'}
          `}
          style={!syncing ? { backgroundColor: 'var(--accent-primary)' } : undefined}
        >
          <MdSync className={syncing ? 'animate-spin' : ''} size={14} />
          {syncing ? 'Syncing...' : 'Sync Google Calendar'}
        </button>
        {syncStatus && (
          <div className="relative">
            <div
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] ${
                syncStatus.success
                  ? 'bg-green-500/10 text-green-500'
                  : syncStatus.errorList && syncStatus.errorList.length > 0
                    ? 'bg-amber-500/10 text-amber-500'
                    : 'bg-red-500/10 text-red-500'
              }`}
            >
              {syncStatus.success ? <MdCheckCircle size={14} /> : <MdError size={14} />}
              <span>{syncStatus.message}</span>
              {syncStatus.details && <span className="opacity-75">({syncStatus.details})</span>}
              {syncStatus.errorList && syncStatus.errorList.length > 0 && (
                <button onClick={() => setShowErrors(!showErrors)} className="ml-0.5 underline opacity-75 hover:opacity-100 cursor-pointer">
                  {showErrors ? 'Hide' : 'Errors'}
                </button>
              )}
            </div>
            {showErrors && syncStatus.errorList && syncStatus.errorList.length > 0 && (
              <div className="absolute top-full left-0 mt-1 z-50 w-[360px] max-h-48 overflow-y-auto border rounded-lg shadow-xl p-2" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-semibold" style={{ color: 'var(--text-secondary)' }}>Sync Errors ({syncStatus.errorList.length})</span>
                  <button onClick={() => setShowErrors(false)} className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>✕</button>
                </div>
                <div className="space-y-1">
                  {syncStatus.errorList.map((err, idx) => (
                    <div key={idx} className="text-[10px] bg-red-500/10 text-red-500 px-2 py-1 rounded">{err}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )

    return <CalendarView bookings={bookings} headerRight={syncBar} />
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
