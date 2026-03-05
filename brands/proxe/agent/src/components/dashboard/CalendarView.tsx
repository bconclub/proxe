'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths, addWeeks, subWeeks } from 'date-fns'
import { MdChevronLeft, MdChevronRight, MdViewWeek, MdViewModule, MdClose, MdPerson, MdEmail, MdPhone, MdCalendarToday, MdAccessTime } from 'react-icons/md'
import LeadDetailsModal from './LeadDetailsModal'
import type { Lead } from '@/types'

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
  unified_context?: any
}

interface CalendarViewProps {
  bookings: Booking[]
  onDateSelect?: (date: Date) => void
}

const HOURS = Array.from({ length: 24 }, (_, i) => i) // 0-23 hours
const DAYS_OF_WEEK = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

// All events use brand accent color
const getSourceColor = (_source: string | null) => {
  return '' // Using inline style with var(--accent-primary) instead
}

export default function CalendarView({ bookings, onDateSelect }: CalendarViewProps) {
  const router = useRouter()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<'week' | 'month'>('month')
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false)
  const [loadingLead, setLoadingLead] = useState(false)

  // Check for date query parameter on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const dateParam = params.get('date')
      if (dateParam) {
        const date = new Date(dateParam)
        if (!isNaN(date.getTime())) {
          setSelectedDate(date)
          setCurrentDate(date)
          if (viewMode === 'week') {
            // Switch to week view to show the selected date
            setViewMode('week')
          }
        }
      }
    }
  }, [viewMode])

  // Get bookings for a specific date
  const getBookingsForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return bookings.filter(
      (b) => b.booking_date === dateStr && b.booking_time
    )
  }

  // Get bookings for a specific date and time slot (hour)
  const getBookingsForTimeSlot = (date: Date, hour: number) => {
    const dateBookings = getBookingsForDate(date)
    return dateBookings.filter((b) => {
      if (!b.booking_time) return false
      const [hours] = b.booking_time.split(':').map(Number)
      return hours === hour
    })
  }

  // Calculate position and height for booking block within an hour slot
  const getBookingStyle = (booking: Booking, hour: number) => {
    if (!booking.booking_time) return {}
    const [hours, minutes = 0] = booking.booking_time.split(':').map(Number)

    // Position within the hour slot (0-60 minutes)
    // Each hour slot is 48px tall (40% smaller than 80px), so 1 minute = 48/60 = 0.8px
    const minutesInHour = minutes
    const topOffset = (minutesInHour / 60) * 48 // Position within the hour slot

    // Default height: 1 hour (48px), but can be adjusted
    const height = 48 // 1 hour block (40% smaller)

    return {
      top: `${topOffset}px`,
      height: `${height}px`,
      position: 'absolute' as const,
      left: '4px',
      right: '4px',
    }
  }

  // Week view
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 })
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 })
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd })

  // Month view
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd })

  // Calendar grid for month view (including previous/next month days)
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd })

  const navigateDate = (direction: 'prev' | 'next') => {
    if (viewMode === 'week') {
      setCurrentDate(direction === 'next' ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1))
    } else {
      setCurrentDate(direction === 'next' ? addMonths(currentDate, 1) : subMonths(currentDate, 1))
    }
  }

  const handleDateClick = (date: Date, fromMiniCalendar?: boolean) => {
    setSelectedDate(date)
    if (viewMode === 'week' || fromMiniCalendar) {
      setCurrentDate(date)
    }
    onDateSelect?.(date)
    // Navigate to bookings page with date filter
    const dateStr = format(date, 'yyyy-MM-dd')
    router.push(`/dashboard/bookings?date=${dateStr}`)
  }

  const handleBookingClick = (booking: Booking, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent date click
    setSelectedBooking(booking)
    setIsModalOpen(true)
  }

  const handleViewClientDetails = async () => {
    if (!selectedBooking) return

    setIsModalOpen(false)
    setLoadingLead(true)

    try {
      // Fetch full lead details from unified_leads
      const response = await fetch(`/api/dashboard/leads?limit=1000`)
      if (!response.ok) throw new Error('Failed to fetch leads')

      const data = await response.json()
      const lead = data.leads?.find((l: any) => l.id === selectedBooking.id)

      if (lead) {
        // Convert to Lead type expected by LeadDetailsModal
        const modalLead: Lead = {
          id: lead.id,
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          source: lead.first_touchpoint || lead.last_touchpoint || lead.source || 'web',
          timestamp: lead.timestamp || lead.last_interaction_at || new Date().toISOString(),
          status: lead.status || null,
          booking_date: lead.booking_date || selectedBooking.booking_date,
          booking_time: lead.booking_time || selectedBooking.booking_time,
          metadata: lead.metadata,
        }
        setSelectedLead(modalLead)
        setIsLeadModalOpen(true)
      } else {
        // If not found in leads, create from booking data
        const modalLead: Lead = {
          id: selectedBooking.id,
          name: selectedBooking.name,
          email: selectedBooking.email,
          phone: selectedBooking.phone,
          source: selectedBooking.source || selectedBooking.first_touchpoint || selectedBooking.last_touchpoint || 'web',
          timestamp: new Date().toISOString(),
          status: null,
          booking_date: selectedBooking.booking_date,
          booking_time: selectedBooking.booking_time,
          metadata: selectedBooking.metadata,
        }
        setSelectedLead(modalLead)
        setIsLeadModalOpen(true)
      }
    } catch (error) {
      console.error('Error fetching lead details:', error)
      // Fallback: create lead from booking data
      const modalLead: Lead = {
        id: selectedBooking.id,
        name: selectedBooking.name,
        email: selectedBooking.email,
        phone: selectedBooking.phone,
        source: selectedBooking.source || selectedBooking.first_touchpoint || selectedBooking.last_touchpoint || 'web',
        timestamp: new Date().toISOString(),
        status: null,
        booking_date: selectedBooking.booking_date,
        booking_time: selectedBooking.booking_time,
        metadata: selectedBooking.metadata,
      }
      setSelectedLead(modalLead)
      setIsLeadModalOpen(true)
    } finally {
      setLoadingLead(false)
    }
  }

  const handleUpdateLeadStatus = async (leadId: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/dashboard/leads/${leadId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (!response.ok) throw new Error('Failed to update status')

      // Update selected lead status
      if (selectedLead && selectedLead.id === leadId) {
        setSelectedLead({ ...selectedLead, status: newStatus || null })
      }
    } catch (err) {
      console.error('Error updating lead status:', err)
      throw err
    }
  }

  return (
    <div className="flex flex-col md:flex-row gap-4 md:gap-6 h-[calc(100vh-200px)]">
      {/* Left Sidebar - Mini Calendar */}
      <div className="hidden md:block w-64 flex-shrink-0 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#262626] rounded-lg p-4">
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => setCurrentDate(subMonths(currentDate, 1))}
              className="p-1 hover:bg-gray-100 dark:hover:bg-[#262626] rounded"
            >
              <MdChevronLeft size={20} />
            </button>
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              {format(currentDate, 'MMMM yyyy')}
            </span>
            <button
              onClick={() => setCurrentDate(addMonths(currentDate, 1))}
              className="p-1 hover:bg-gray-100 dark:hover:bg-[#262626] rounded"
            >
              <MdChevronRight size={20} />
            </button>
          </div>
        </div>

        {/* Mini Calendar Grid */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day) => (
            <div
              key={day}
              className="text-xs text-center text-gray-500 dark:text-gray-400 font-medium py-1"
            >
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day, idx) => {
            const isCurrentMonth = isSameMonth(day, currentDate)
            const isSelected = isSameDay(day, selectedDate)
            const isToday = isSameDay(day, new Date())
            const dayBookings = getBookingsForDate(day)

            return (
              <button
                key={idx}
                onClick={() => handleDateClick(day, true)}
                className={`
                  aspect-square text-xs p-1 rounded
                  ${!isCurrentMonth ? 'text-gray-300 dark:text-gray-600' : 'text-gray-900 dark:text-gray-100'}
                  ${isSelected ? 'text-white font-semibold' : ''}
                  ${isToday && !isSelected ? 'font-semibold' : ''}
                  hover:bg-gray-100 dark:hover:bg-[#262626]
                  relative
                `}
                style={{
                  ...(isSelected ? { backgroundColor: 'var(--accent-primary)', color: 'white' } : {}),
                  ...(isToday && !isSelected ? { backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)' } : {}),
                }}
              >
                {format(day, 'd')}
                {dayBookings.length > 0 && (
                  <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-0.5 pb-0.5">
                    {dayBookings.slice(0, 3).map((_, i) => (
                      <div
                        key={i}
                        className="w-1 h-1 rounded-full"
                        style={{ backgroundColor: 'var(--accent-primary)' }}
                      />
                    ))}
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {/* View Mode Toggle */}
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-[#262626]">
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('week')}
              className={`
                flex-1 px-3 py-2 text-sm rounded-md transition-colors
                ${viewMode === 'week'
                  ? 'text-white'
                  : 'bg-gray-100 dark:bg-[#262626] text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#333]'
                }
              `}
              style={viewMode === 'week' ? { backgroundColor: 'var(--accent-primary)' } : undefined}
            >
              <span className="inline mr-1">
                <MdViewWeek size={16} />
              </span>
              Week
            </button>
            <button
              onClick={() => setViewMode('month')}
              className={`
                flex-1 px-3 py-2 text-sm rounded-md transition-colors
                ${viewMode === 'month'
                  ? 'text-white'
                  : 'bg-gray-100 dark:bg-[#262626] text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#333]'
                }
              `}
              style={viewMode === 'month' ? { backgroundColor: 'var(--accent-primary)' } : undefined}
            >
              <span className="inline mr-1">
                <MdViewModule size={16} />
              </span>
              Month
            </button>
          </div>
        </div>
      </div>

      {/* Main Calendar View */}
      <div className="flex-1 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#262626] rounded-lg overflow-hidden min-w-0">
        {/* Header */}
        <div className="border-b border-gray-200 dark:border-[#262626] p-2 md:p-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 md:gap-4">
              <button
                onClick={() => navigateDate('prev')}
                className="p-2 hover:bg-gray-100 dark:hover:bg-[#262626] rounded"
              >
                <MdChevronLeft size={20} />
              </button>
              <h2 className="text-sm md:text-lg font-semibold text-gray-900 dark:text-white">
                {viewMode === 'week'
                  ? `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`
                  : format(currentDate, 'MMMM yyyy')}
              </h2>
              <button
                onClick={() => navigateDate('next')}
                className="p-2 hover:bg-gray-100 dark:hover:bg-[#262626] rounded"
              >
                <MdChevronRight size={20} />
              </button>
            </div>
            <button
              onClick={() => {
                setCurrentDate(new Date())
                setSelectedDate(new Date())
              }}
              className="px-3 md:px-4 py-1.5 md:py-2 text-xs md:text-sm text-white rounded-md hover:opacity-90 transition-opacity"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              Today
            </button>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="overflow-x-auto overflow-y-auto h-[calc(100%-60px)] md:h-[calc(100%-80px)]">
          {viewMode === 'week' ? (
            /* Week View */
            <div className="grid grid-cols-8 min-w-[800px] md:min-w-full">
              {/* Time column */}
              <div className="border-r border-gray-200 dark:border-[#262626] sticky left-0 bg-white dark:bg-[#1A1A1A] z-10 w-16 md:w-auto">
                {/* Empty header to align with day headers - exact match */}
                <div className="border-b border-gray-200 dark:border-[#262626] p-1 md:p-2 text-center flex flex-col justify-center" style={{ height: '60px', minHeight: '60px' }}></div>
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="border-b border-gray-100 dark:border-[#262626] px-1 md:px-2 flex items-center"
                    style={{ height: '48px', minHeight: '48px' }}
                  >
                    <span className="text-[10px] md:text-xs text-gray-500 dark:text-gray-400 font-medium">
                      {hour === 0 ? '12A' : hour < 12 ? `${hour}A` : hour === 12 ? '12P' : `${hour - 12}P`}
                    </span>
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {weekDays.map((day, dayIdx) => {
                const dayBookings = getBookingsForDate(day)
                const isSelected = isSameDay(day, selectedDate)
                const isToday = isSameDay(day, new Date())

                return (
                  <div
                    key={dayIdx}
                    className="border-r border-gray-200 dark:border-[#262626] last:border-r-0 relative"
                  >
                    {/* Day header */}
                    <div
                      className="border-b border-gray-200 dark:border-[#262626] p-1 md:p-2 text-center"
                      style={{
                        height: '60px',
                        minHeight: '60px',
                        ...(isSelected ? { backgroundColor: 'var(--accent-subtle)' } : isToday ? { backgroundColor: 'var(--accent-subtle)' } : {}),
                      }}
                    >
                      <div className="text-[10px] md:text-xs text-gray-500 dark:text-gray-400">
                        {DAYS_OF_WEEK[dayIdx].substring(0, 3)}
                      </div>
                      <div
                        className={`
                          text-xs md:text-sm font-semibold mt-0.5 md:mt-1
                          ${!isToday ? 'text-gray-900 dark:text-white' : ''}
                        `}
                        style={isToday ? { color: 'var(--accent-primary)' } : undefined}
                      >
                        {format(day, 'd')}
                      </div>
                    </div>

                    {/* Time slots */}
                    <div className="relative">
                      {HOURS.map((hour) => {
                        const hourBookings = getBookingsForTimeSlot(day, hour)
                        return (
                          <div
                            key={hour}
                            className="border-b border-gray-100 dark:border-[#262626] relative"
                            style={{ height: '48px' }}
                          >
                            {hourBookings.map((booking, idx) => {
                              const style = getBookingStyle(booking, hour)
                              const total = hourBookings.length
                              const widthPercent = 100 / total
                              const leftPercent = idx * widthPercent
                              const callTopic = booking.booking_title
                                || booking.metadata?.title
                                || booking.metadata?.conversation_summary
                                || booking.metadata?.summary
                                || null
                              return (
                                <div
                                  key={booking.id}
                                  onClick={(e) => handleBookingClick(booking, e)}
                                  className="rounded px-1.5 md:px-2 py-0.5 text-[9px] md:text-[10px] leading-tight text-white cursor-pointer hover:opacity-90 hover:shadow-lg z-10 transition-all overflow-hidden"
                                  style={{
                                    ...style,
                                    backgroundColor: 'var(--accent-primary)',
                                    left: total > 1 ? `${leftPercent}%` : '4px',
                                    right: total > 1 ? undefined : '4px',
                                    width: total > 1 ? `calc(${widthPercent}% - 4px)` : undefined,
                                  }}
                                  title={`${booking.booking_time?.substring(0, 5)} · ${booking.name || 'Unnamed'}${callTopic ? ` · ${callTopic}` : ''}`}
                                >
                                  <div className="font-semibold truncate text-[8px] md:text-[10px]">
                                    {booking.booking_time?.substring(0, 5)}
                                  </div>
                                  <div className="font-medium truncate text-[8px] md:text-[10px]">
                                    {booking.name || 'Unnamed'}
                                  </div>
                                  {callTopic && (
                                    <div className="text-[7px] md:text-[9px] opacity-80 truncate">
                                      {callTopic}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            /* Month View */
            <div className="p-4">
              <div className="grid grid-cols-7 gap-2">
                {/* Day headers */}
                {DAYS_OF_WEEK.map((day) => (
                  <div
                    key={day}
                    className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 py-2"
                  >
                    {day}
                  </div>
                ))}

                {/* Calendar days */}
                {calendarDays.map((day, idx) => {
                  const isCurrentMonth = isSameMonth(day, currentDate)
                  const isSelected = isSameDay(day, selectedDate)
                  const isToday = isSameDay(day, new Date())
                  const dayBookings = getBookingsForDate(day)

                  return (
                    <div
                      key={idx}
                      onClick={() => handleDateClick(day, false)}
                      className={`
                        min-h-24 p-2 border border-gray-200 dark:border-[#262626] rounded
                        ${!isCurrentMonth ? 'bg-gray-50 dark:bg-[#0D0D0D] opacity-50' : 'bg-white dark:bg-[#1A1A1A]'}
                        cursor-pointer hover:bg-gray-50 dark:hover:bg-[#262626]
                      `}
                      style={{
                        ...(isSelected ? { boxShadow: '0 0 0 2px var(--accent-primary)' } : {}),
                        ...(isToday ? { backgroundColor: 'var(--accent-subtle)' } : {}),
                      }}
                    >
                      <div
                        className={`
                          text-sm font-semibold mb-1
                          ${!isToday ? 'text-gray-900 dark:text-white' : ''}
                        `}
                        style={isToday ? { color: 'var(--accent-primary)' } : undefined}
                      >
                        {format(day, 'd')}
                      </div>
                      <div className="space-y-1">
                        {dayBookings.slice(0, 3).map((booking) => {
                          const topic = booking.booking_title || booking.metadata?.title || null
                          return (
                            <div
                              key={booking.id}
                              onClick={(e) => handleBookingClick(booking, e)}
                              className="text-xs px-2 py-1 rounded text-white cursor-pointer hover:opacity-90 hover:shadow-md transition-all"
                              style={{ backgroundColor: 'var(--accent-primary)' }}
                              title={`${booking.booking_time?.substring(0, 5)} · ${booking.name || 'Unnamed'}${topic ? ` · ${topic}` : ''}`}
                            >
                              <div className="truncate">{booking.booking_time?.substring(0, 5)} {booking.name || 'Unnamed'}</div>
                              {topic && <div className="truncate opacity-80 text-[10px]">{topic}</div>}
                            </div>
                          )
                        })}
                        {dayBookings.length > 3 && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            +{dayBookings.length - 3} more
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Booking Details Modal — Clean, wider card */}
      {isModalOpen && selectedBooking && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#1A1A1A] rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-[#333]">
            <div className="p-6">
              {/* Header row: Name + Close */}
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                    {selectedBooking.name || 'Unnamed Lead'}
                  </h3>
                  <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {selectedBooking.email && <span>{selectedBooking.email}</span>}
                    {selectedBooking.email && selectedBooking.phone && <span>•</span>}
                    {selectedBooking.phone && <span>{selectedBooking.phone}</span>}
                  </div>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1"
                >
                  <MdClose size={22} />
                </button>
              </div>

              {/* Date & Time row */}
              <div className="flex items-center gap-6 p-4 rounded-lg mb-4" style={{ backgroundColor: 'var(--bg-tertiary, #262626)' }}>
                <div className="flex items-center gap-2">
                  <MdCalendarToday size={18} style={{ color: 'var(--accent-primary)' }} />
                  <span className="text-base font-medium text-gray-900 dark:text-white">
                    {selectedBooking.booking_date && format(new Date(selectedBooking.booking_date), 'EEE, MMM d, yyyy')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <MdAccessTime size={18} style={{ color: 'var(--accent-primary)' }} />
                  <span className="text-base font-medium text-gray-900 dark:text-white">
                    {selectedBooking.booking_time}
                  </span>
                </div>
                <span
                  className="ml-auto px-2.5 py-0.5 text-[11px] font-semibold rounded-full text-white"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                >
                  {selectedBooking.source || selectedBooking.first_touchpoint || selectedBooking.last_touchpoint || 'web'}
                </span>
              </div>

              {/* Summary (if available) */}
              {(() => {
                const summary = selectedBooking.metadata?.conversationSummary ||
                  selectedBooking.metadata?.conversation_summary ||
                  selectedBooking.unified_context?.web?.conversation_summary ||
                  selectedBooking.unified_context?.whatsapp?.conversation_summary
                if (!summary) return null
                return (
                  <div className="text-sm text-gray-600 dark:text-gray-300 p-3 rounded-lg mb-4 leading-relaxed" style={{ backgroundColor: 'var(--bg-tertiary, #262626)' }}>
                    {summary}
                  </div>
                )
              })()}

              {/* Action */}
              <button
                onClick={handleViewClientDetails}
                className="w-full px-4 py-2.5 text-white rounded-lg hover:opacity-90 transition-all text-sm font-medium"
                style={{ backgroundColor: 'var(--accent-primary)' }}
              >
                View Client Details →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Client Details Modal */}
      <LeadDetailsModal
        lead={selectedLead}
        isOpen={isLeadModalOpen}
        onClose={() => {
          setIsLeadModalOpen(false)
          setSelectedLead(null)
        }}
        onStatusUpdate={handleUpdateLeadStatus}
      />
    </div>
  )
}
