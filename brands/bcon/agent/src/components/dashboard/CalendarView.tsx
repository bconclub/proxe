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

// Color mapping for sources
const getSourceColor = (source: string | null) => {
  const colors: Record<string, string> = {
    web: 'bg-blue-500',
    whatsapp: 'bg-green-500',
    voice: 'bg-primary-600',
    social: 'bg-orange-500',
  }
  return colors[source || 'web'] || 'bg-primary-600'
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
                  ${isSelected ? 'bg-primary-600 text-white font-semibold' : ''}
                  ${isToday && !isSelected ? 'bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200 font-semibold' : ''}
                  hover:bg-gray-100 dark:hover:bg-[#262626]
                  relative
                `}
              >
                {format(day, 'd')}
                {dayBookings.length > 0 && (
                  <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-0.5 pb-0.5">
                    {dayBookings.slice(0, 3).map((_, i) => (
                      <div
                        key={i}
                        className="w-1 h-1 rounded-full bg-primary-600"
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
                  ? 'bg-primary-600 text-white' 
                  : 'bg-gray-100 dark:bg-[#262626] text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#333]'
                }
              `}
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
                  ? 'bg-primary-600 text-white' 
                  : 'bg-gray-100 dark:bg-[#262626] text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#333]'
                }
              `}
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
              className="px-3 md:px-4 py-1.5 md:py-2 text-xs md:text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700"
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
                      className={`
                        border-b border-gray-200 dark:border-[#262626] p-1 md:p-2 text-center
                        ${isToday ? 'bg-primary-50 dark:bg-primary-900/20' : ''}
                        ${isSelected ? 'bg-primary-100 dark:bg-primary-900/40' : ''}
                      `}
                      style={{ height: '60px', minHeight: '60px' }}
                    >
                      <div className="text-[10px] md:text-xs text-gray-500 dark:text-gray-400">
                        {DAYS_OF_WEEK[dayIdx].substring(0, 3)}
                      </div>
                      <div
                        className={`
                          text-xs md:text-sm font-semibold mt-0.5 md:mt-1
                          ${isToday ? 'text-primary-600 dark:text-primary-400' : 'text-gray-900 dark:text-white'}
                        `}
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
                              // Handle overlapping bookings by offsetting horizontally
                              const leftOffset = idx * 50 // Offset for overlapping bookings
                              const callTitle = booking.metadata?.conversation_summary 
                                || booking.metadata?.title 
                                || booking.metadata?.summary 
                                || 'Call'
                              return (
                                <div
                                  key={booking.id}
                                  onClick={(e) => handleBookingClick(booking, e)}
                                  className={`
                                    rounded px-1.5 md:px-2 py-0.5 text-[9px] md:text-[10px] leading-tight
                                    ${getSourceColor(booking.source)}
                                    text-white cursor-pointer hover:opacity-90 hover:shadow-lg
                                    z-10 transition-all overflow-hidden
                                  `}
                                  style={{
                                    ...style,
                                    left: `${2 + leftOffset}px`,
                                    right: `${2 + (hourBookings.length > 1 ? leftOffset + 2 : 0)}px`,
                                    width: hourBookings.length > 1 ? `calc(50% - ${leftOffset}px)` : undefined,
                                  }}
                                  title={`${booking.booking_time} - ${callTitle} - ${booking.name || 'Unnamed'}`}
                                >
                                  <div className="font-semibold truncate mb-0.5 text-[8px] md:text-[10px]">
                                    {booking.booking_time}
                                  </div>
                                  <div className="text-[8px] md:text-[9px] opacity-90 truncate italic mb-0.5 hidden md:block">
                                    {callTitle.length > 20 ? callTitle.substring(0, 20) + '...' : callTitle}
                                  </div>
                                  <div className="font-medium truncate text-[8px] md:text-[10px]">
                                    {booking.name || 'Unnamed Customer'}
                                  </div>
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
                        ${isSelected ? 'ring-2 ring-primary-600' : ''}
                        ${isToday ? 'bg-primary-50 dark:bg-primary-900/20' : ''}
                        cursor-pointer hover:bg-gray-50 dark:hover:bg-[#262626]
                      `}
                    >
                      <div
                        className={`
                          text-sm font-semibold mb-1
                          ${isToday ? 'text-primary-600 dark:text-primary-400' : 'text-gray-900 dark:text-white'}
                        `}
                      >
                        {format(day, 'd')}
                      </div>
                      <div className="space-y-1">
                        {dayBookings.slice(0, 3).map((booking) => (
                          <div
                            key={booking.id}
                            onClick={(e) => handleBookingClick(booking, e)}
                            className={`
                              text-xs px-2 py-1 rounded truncate
                              ${getSourceColor(booking.source)}
                              text-white cursor-pointer hover:opacity-90 hover:shadow-md
                              transition-all
                            `}
                            title={`${booking.name || 'Unnamed'} - ${booking.booking_time}`}
                          >
                            {booking.booking_time} {booking.name || 'Unnamed'}
                          </div>
                        ))}
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

      {/* Booking Details Modal */}
      {isModalOpen && selectedBooking && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#1A1A1A] rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Booking Details
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <MdClose size={24} />
                </button>
              </div>

              {/* Booking Info */}
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <span className="text-gray-400 mt-0.5">
                    <MdPerson size={20} />
                  </span>
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Name</div>
                    <div className="text-base font-medium text-gray-900 dark:text-white">
                      {selectedBooking.name || 'Unnamed Lead'}
                    </div>
                  </div>
                </div>

                {selectedBooking.email && (
                  <div className="flex items-start gap-3">
                    <span className="text-gray-400 mt-0.5">
                      <MdEmail size={20} />
                    </span>
                    <div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">Email</div>
                      <div className="text-base text-gray-900 dark:text-white">
                        {selectedBooking.email}
                      </div>
                    </div>
                  </div>
                )}

                {selectedBooking.phone && (
                  <div className="flex items-start gap-3">
                    <span className="text-gray-400 mt-0.5">
                      <MdPhone size={20} />
                    </span>
                    <div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">Phone</div>
                      <div className="text-base text-gray-900 dark:text-white">
                        {selectedBooking.phone}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3">
                  <span className="text-gray-400 mt-0.5">
                    <MdCalendarToday size={20} />
                  </span>
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Date</div>
                    <div className="text-base text-gray-900 dark:text-white">
                      {selectedBooking.booking_date && format(new Date(selectedBooking.booking_date), 'MMMM d, yyyy')}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="text-gray-400 mt-0.5">
                    <MdAccessTime size={20} />
                  </span>
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Time</div>
                    <div className="text-base text-gray-900 dark:text-white">
                      {selectedBooking.booking_time}
                    </div>
                  </div>
                </div>

                {/* Course Interest */}
                {(selectedBooking.metadata?.courseInterest || selectedBooking.unified_context?.bcon?.course_interest) && (
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Course Interest</div>
                    <div className="text-base text-gray-900 dark:text-white">
                      {(() => {
                        const courseInterest = selectedBooking.metadata?.courseInterest || selectedBooking.unified_context?.bcon?.course_interest;
                        const courseNameMap: Record<string, string> = {
                          'pilot': 'Pilot Training',
                          'helicopter': 'Helicopter Training',
                          'drone': 'Drone Training',
                          'cabin': 'Cabin Crew Training',
                        };
                        return courseNameMap[courseInterest?.toLowerCase()] || courseInterest || '-';
                      })()}
                    </div>
                  </div>
                )}

                {/* Session Type */}
                {(selectedBooking.metadata?.sessionType) && (
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Session Type</div>
                    <div className="text-base text-gray-900 dark:text-white">
                      {selectedBooking.metadata.sessionType === 'offline' ? 'Offline / Facility Visit' : 
                       selectedBooking.metadata.sessionType === 'online' ? 'Online Session' : 
                       selectedBooking.metadata.sessionType}
                    </div>
                  </div>
                )}

                {/* Conversation Summary */}
                {(selectedBooking.metadata?.conversationSummary || selectedBooking.metadata?.conversation_summary || selectedBooking.unified_context?.web?.conversation_summary) && (
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Summary</div>
                    <div className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-[#262626] p-3 rounded-md max-h-32 overflow-y-auto">
                      {selectedBooking.metadata?.conversationSummary || 
                       selectedBooking.metadata?.conversation_summary || 
                       selectedBooking.unified_context?.web?.conversation_summary || '-'}
                    </div>
                  </div>
                )}

                {/* Description (shorter unified description) */}
                {selectedBooking.metadata?.description && (
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Details</div>
                    <div className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-[#262626] p-3 rounded-md max-h-40 overflow-y-auto whitespace-pre-wrap">
                      {(() => {
                        const fullDescription = selectedBooking.metadata.description;
                        // Extract key details for shorter display
                        const lines = fullDescription.split('\n');
                        const keyLines: string[] = [];
                        let inDetails = false;
                        
                        for (const line of lines) {
                          const trimmed = line.trim();
                          if (trimmed.includes('Candidate Information:') || trimmed.includes('Course Interest:') || 
                              trimmed.includes('Session Type:') || trimmed.includes('Booking Details:')) {
                            inDetails = true;
                            continue;
                          }
                          if (trimmed && inDetails && !trimmed.includes('BCON Club')) {
                            keyLines.push(trimmed);
                          }
                        }
                        
                        // If we found key lines, use them; otherwise use first 300 chars
                        if (keyLines.length > 0) {
                          return keyLines.join('\n');
                        }
                        return fullDescription.length > 300 ? fullDescription.substring(0, 300) + '...' : fullDescription;
                      })()}
                    </div>
                  </div>
                )}

                <div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Source</div>
                  <span className={`
                    px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full
                    ${getSourceColor(selectedBooking.source)}
                    text-white
                  `}>
                    {selectedBooking.source || selectedBooking.first_touchpoint || selectedBooking.last_touchpoint || 'web'}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-6 pt-4 border-t border-gray-200 dark:border-[#262626] flex gap-3">
                <button
                  onClick={handleViewClientDetails}
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors text-sm font-medium"
                >
                  View Client Details
                </button>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 dark:border-[#262626] text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-[#262626] transition-colors text-sm"
                >
                  Close
                </button>
              </div>
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

