'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths, addWeeks, subWeeks } from 'date-fns'
import { MdChevronLeft, MdChevronRight, MdClose, MdCalendarToday, MdAccessTime } from 'react-icons/md'
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

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const DAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function formatHour(hour: number): string {
  if (hour === 0) return '12 AM'
  if (hour < 12) return `${hour} AM`
  if (hour === 12) return '12 PM'
  return `${hour - 12} PM`
}

export default function CalendarView({ bookings, onDateSelect }: CalendarViewProps) {
  const router = useRouter()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week')
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
        }
      }
    }
  }, [])

  // Auto-scroll to 8 AM on mount
  useEffect(() => {
    if (scrollRef.current && viewMode === 'week') {
      const hourHeight = 44
      scrollRef.current.scrollTop = 8 * hourHeight
    }
  }, [viewMode])

  const getBookingsForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return bookings.filter((b) => b.booking_date === dateStr && b.booking_time)
  }

  const getBookingsForTimeSlot = (date: Date, hour: number) => {
    return getBookingsForDate(date).filter((b) => {
      if (!b.booking_time) return false
      const [h] = b.booking_time.split(':').map(Number)
      return h === hour
    })
  }

  // Week calculations
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 })
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 })
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd })

  // Month calculations
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
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

  const handleDateClick = (date: Date) => {
    setSelectedDate(date)
    setCurrentDate(date)
    onDateSelect?.(date)
  }

  const handleBookingClick = (booking: Booking, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedBooking(booking)
    setIsModalOpen(true)
  }

  const handleViewClientDetails = async () => {
    if (!selectedBooking) return
    setIsModalOpen(false)
    setLoadingLead(true)
    try {
      const response = await fetch(`/api/dashboard/leads?limit=1000`)
      if (!response.ok) throw new Error('Failed to fetch leads')
      const data = await response.json()
      const lead = data.leads?.find((l: any) => l.id === selectedBooking.id)
      const source = lead || selectedBooking
      const modalLead: Lead = {
        id: source.id,
        name: source.name || source.customer_name,
        email: source.email,
        phone: source.phone,
        source: source.first_touchpoint || source.last_touchpoint || source.source || 'web',
        timestamp: source.timestamp || source.last_interaction_at || new Date().toISOString(),
        status: source.status || null,
        booking_date: source.booking_date || selectedBooking.booking_date,
        booking_time: source.booking_time || selectedBooking.booking_time,
        metadata: source.metadata,
      }
      setSelectedLead(modalLead)
      setIsLeadModalOpen(true)
    } catch {
      const modalLead: Lead = {
        id: selectedBooking.id,
        name: selectedBooking.name,
        email: selectedBooking.email,
        phone: selectedBooking.phone,
        source: selectedBooking.source || 'web',
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
      if (selectedLead && selectedLead.id === leadId) {
        setSelectedLead({ ...selectedLead, status: newStatus || null })
      }
    } catch (err) {
      console.error('Error updating lead status:', err)
      throw err
    }
  }

  // Timezone label
  const tzOffset = new Date().getTimezoneOffset()
  const tzHours = Math.abs(Math.floor(tzOffset / 60))
  const tzMins = Math.abs(tzOffset % 60)
  const tzSign = tzOffset <= 0 ? '+' : '-'
  const tzLabel = `GMT${tzSign}${String(tzHours).padStart(2, '0')}:${String(tzMins).padStart(2, '0')}`

  return (
    <div className="flex gap-0 h-[calc(100vh-200px)]">
      {/* Left Sidebar — Mini Calendar (Google Calendar style) */}
      <div className="hidden lg:flex flex-col w-[220px] flex-shrink-0 p-4 border-r" style={{ borderColor: 'var(--border-primary)' }}>
        {/* Mini calendar month nav */}
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-[#333]">
            <MdChevronLeft size={18} style={{ color: 'var(--text-secondary)' }} />
          </button>
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {format(currentDate, 'MMMM yyyy')}
          </span>
          <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-[#333]">
            <MdChevronRight size={18} style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <div key={i} className="text-[10px] text-center font-medium py-1" style={{ color: 'var(--text-secondary)' }}>{d}</div>
          ))}
        </div>

        {/* Mini calendar grid */}
        <div className="grid grid-cols-7 gap-0">
          {calendarDays.map((day, idx) => {
            const isCurrentMonth = isSameMonth(day, currentDate)
            const isToday = isSameDay(day, new Date())
            const isSelected = isSameDay(day, selectedDate)
            const hasBookings = getBookingsForDate(day).length > 0

            return (
              <button
                key={idx}
                onClick={() => handleDateClick(day)}
                className="relative aspect-square flex items-center justify-center text-[11px] rounded-full hover:bg-gray-100 dark:hover:bg-[#333]"
                style={{
                  color: !isCurrentMonth ? 'var(--text-secondary)' : isSelected ? '#fff' : isToday ? 'var(--accent-primary)' : 'var(--text-primary)',
                  backgroundColor: isSelected ? 'var(--accent-primary)' : isToday ? 'var(--accent-subtle)' : 'transparent',
                  fontWeight: isToday || isSelected ? 600 : 400,
                  opacity: !isCurrentMonth ? 0.4 : 1,
                }}
              >
                {format(day, 'd')}
                {hasBookings && !isSelected && (
                  <span className="absolute bottom-0.5 w-1 h-1 rounded-full" style={{ backgroundColor: 'var(--accent-primary)' }} />
                )}
              </button>
            )
          })}
        </div>

        {/* View toggle */}
        <div className="mt-4 pt-4 flex gap-1" style={{ borderTop: '1px solid var(--border-primary)' }}>
          {(['week', 'month'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className="flex-1 py-1.5 text-xs font-medium rounded-md transition-colors capitalize"
              style={{
                backgroundColor: viewMode === mode ? 'var(--accent-primary)' : 'transparent',
                color: viewMode === mode ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Main Calendar */}
      <div className="flex-1 flex flex-col min-w-0" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        {/* Top bar — Google Calendar style */}
        <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ borderColor: 'var(--border-primary)' }}>
          <button
            onClick={() => { setCurrentDate(new Date()); setSelectedDate(new Date()) }}
            className="px-4 py-1.5 text-sm font-medium border rounded-md hover:shadow-sm transition-shadow"
            style={{ borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
          >
            Today
          </button>
          <button onClick={() => navigateDate('prev')} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-[#333]">
            <MdChevronLeft size={22} style={{ color: 'var(--text-secondary)' }} />
          </button>
          <button onClick={() => navigateDate('next')} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-[#333]">
            <MdChevronRight size={22} style={{ color: 'var(--text-secondary)' }} />
          </button>
          <h2 className="text-lg font-medium ml-2" style={{ color: 'var(--text-primary)' }}>
            {viewMode === 'week'
              ? format(currentDate, 'MMMM yyyy')
              : format(currentDate, 'MMMM yyyy')}
          </h2>
          {/* Mobile view toggle */}
          <div className="lg:hidden ml-auto flex gap-1">
            {(['week', 'month'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className="px-3 py-1 text-xs font-medium rounded capitalize"
                style={{
                  backgroundColor: viewMode === mode ? 'var(--accent-primary)' : 'transparent',
                  color: viewMode === mode ? '#fff' : 'var(--text-secondary)',
                }}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {viewMode === 'week' ? (
          /* ===== WEEK VIEW — Google Calendar Style ===== */
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Day header row — fixed */}
            <div className="flex border-b" style={{ borderColor: 'var(--border-primary)' }}>
              {/* Timezone label in corner */}
              <div className="w-[52px] flex-shrink-0 flex items-end justify-center pb-1">
                <span className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>{tzLabel}</span>
              </div>
              {/* Day columns */}
              {weekDays.map((day, i) => {
                const isToday = isSameDay(day, new Date())
                return (
                  <div
                    key={i}
                    className="flex-1 text-center py-2 border-l"
                    style={{ borderColor: 'var(--border-primary)' }}
                  >
                    <div className="text-[11px] font-medium" style={{ color: isToday ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
                      {DAY_LABELS[i]}
                    </div>
                    <div
                      className="text-[26px] font-normal leading-tight mx-auto mt-0.5 flex items-center justify-center"
                      style={{
                        color: isToday ? '#fff' : 'var(--text-primary)',
                        backgroundColor: isToday ? 'var(--accent-primary)' : 'transparent',
                        borderRadius: '50%',
                        width: '40px',
                        height: '40px',
                      }}
                    >
                      {format(day, 'd')}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Scrollable time grid */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
              <div className="flex relative">
                {/* Time labels */}
                <div className="w-[52px] flex-shrink-0">
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="relative border-b"
                      style={{ height: '44px', borderColor: 'color-mix(in srgb, var(--border-primary) 40%, transparent)' }}
                    >
                      {hour > 0 && (
                        <span className="absolute -top-[6px] right-2 text-[10px] leading-none" style={{ color: 'var(--text-secondary)' }}>
                          {formatHour(hour)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Day columns with time slots */}
                {weekDays.map((day, dayIdx) => (
                  <div key={dayIdx} className="flex-1 border-l relative" style={{ borderColor: 'var(--border-primary)' }}>
                    {HOURS.map((hour) => (
                      <div
                        key={hour}
                        className="border-b"
                        style={{ height: '44px', borderColor: 'color-mix(in srgb, var(--border-primary) 40%, transparent)' }}
                      />
                    ))}
                    {/* Booking events overlaid */}
                    {getBookingsForDate(day).map((booking, bIdx) => {
                      if (!booking.booking_time) return null
                      const [h, m] = booking.booking_time.split(':').map(Number)
                      const top = h * 44 + Math.round((m || 0) * 44 / 60)
                      const height = 44 // 1-hour block
                      const dayBookingsAtHour = getBookingsForTimeSlot(day, h)
                      const total = dayBookingsAtHour.length
                      const idx = dayBookingsAtHour.indexOf(booking)
                      const widthPct = total > 1 ? 100 / total : 100
                      const leftPct = total > 1 ? idx * widthPct : 0

                      const topic = booking.booking_title || booking.metadata?.title || null
                      return (
                        <div
                          key={booking.id}
                          onClick={(e) => handleBookingClick(booking, e)}
                          className="absolute rounded px-1.5 py-0.5 text-white cursor-pointer hover:brightness-110 hover:shadow-md transition-all z-10 overflow-hidden"
                          style={{
                            top: `${top}px`,
                            height: `${height - 2}px`,
                            left: total > 1 ? `${leftPct}%` : '2px',
                            right: total > 1 ? undefined : '2px',
                            width: total > 1 ? `calc(${widthPct}% - 4px)` : undefined,
                            backgroundColor: 'var(--accent-primary)',
                            fontSize: '10px',
                            lineHeight: '1.3',
                          }}
                          title={`${booking.booking_time?.substring(0, 5)} - ${booking.name || 'Unnamed'}${topic ? ` - ${topic}` : ''}`}
                        >
                          <div className="font-semibold truncate">{booking.name || 'Unnamed'}</div>
                          <div className="opacity-90 truncate">{booking.booking_time?.substring(0, 5)}{topic ? ` - ${topic}` : ''}</div>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* ===== MONTH VIEW ===== */
          <div className="flex-1 flex flex-col overflow-hidden p-4">
            <div className="flex-1 grid grid-cols-7 overflow-hidden rounded-lg border" style={{ borderColor: 'var(--border-primary)', gridTemplateRows: `auto repeat(${Math.ceil(calendarDays.length / 7)}, 1fr)` }}>
              {/* Day headers */}
              {DAY_LABELS.map((day) => (
                <div key={day} className="text-center text-xs font-medium py-1.5" style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-tertiary)' }}>
                  {day}
                </div>
              ))}
              {/* Calendar days */}
              {calendarDays.map((day, idx) => {
                const isCurrentMonth = isSameMonth(day, currentDate)
                const isToday = isSameDay(day, new Date())
                const dayBookings = getBookingsForDate(day)
                return (
                  <div
                    key={idx}
                    onClick={() => handleDateClick(day)}
                    className="p-1 cursor-pointer hover:brightness-110 transition-all overflow-y-auto flex flex-col"
                    style={{
                      backgroundColor: isCurrentMonth ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
                      borderTop: '1px solid var(--border-primary)',
                      borderRight: (idx % 7 !== 6) ? '1px solid color-mix(in srgb, var(--border-primary) 40%, transparent)' : 'none',
                      opacity: isCurrentMonth ? 1 : 0.5,
                      minHeight: 0,
                    }}
                  >
                    <div
                      className="text-[11px] font-medium mb-0.5 w-5 h-5 flex items-center justify-center rounded-full"
                      style={{
                        color: isToday ? '#fff' : 'var(--text-primary)',
                        backgroundColor: isToday ? 'var(--accent-primary)' : 'transparent',
                      }}
                    >
                      {format(day, 'd')}
                    </div>
                    <div className="flex-1 space-y-px overflow-y-auto">
                      {dayBookings.map((booking) => (
                        <div
                          key={booking.id}
                          onClick={(e) => handleBookingClick(booking, e)}
                          className="text-[10px] leading-tight px-1 py-px rounded text-white truncate cursor-pointer hover:brightness-110"
                          style={{ backgroundColor: 'var(--accent-primary)' }}
                        >
                          {booking.booking_time?.substring(0, 5)} {booking.name || 'Unnamed'}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Booking Details Modal */}
      {isModalOpen && selectedBooking && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setIsModalOpen(false)}>
          <div
            className="rounded-xl shadow-xl max-w-lg w-full border"
            style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {selectedBooking.name || 'Unnamed Lead'}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {selectedBooking.email && <span>{selectedBooking.email}</span>}
                    {selectedBooking.email && selectedBooking.phone && <span>-</span>}
                    {selectedBooking.phone && <span>{selectedBooking.phone}</span>}
                  </div>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-[#333]">
                  <MdClose size={20} style={{ color: 'var(--text-secondary)' }} />
                </button>
              </div>

              <div className="flex items-center gap-5 p-3 rounded-lg mb-4" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                <div className="flex items-center gap-2">
                  <MdCalendarToday size={16} style={{ color: 'var(--accent-primary)' }} />
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {selectedBooking.booking_date && format(new Date(selectedBooking.booking_date), 'EEE, MMM d, yyyy')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <MdAccessTime size={16} style={{ color: 'var(--accent-primary)' }} />
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{selectedBooking.booking_time}</span>
                </div>
                <span className="ml-auto px-2 py-0.5 text-[10px] font-semibold rounded-full text-white" style={{ backgroundColor: 'var(--accent-primary)' }}>
                  {selectedBooking.source || selectedBooking.first_touchpoint || 'web'}
                </span>
              </div>

              {(() => {
                const summary = selectedBooking.metadata?.conversationSummary ||
                  selectedBooking.metadata?.conversation_summary ||
                  selectedBooking.unified_context?.web?.conversation_summary ||
                  selectedBooking.unified_context?.whatsapp?.conversation_summary
                if (!summary) return null
                return (
                  <div className="text-xs leading-relaxed p-3 rounded-lg mb-4" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                    {summary}
                  </div>
                )
              })()}

              <button
                onClick={handleViewClientDetails}
                className="w-full py-2.5 text-sm font-medium text-white rounded-lg hover:brightness-110 transition-all"
                style={{ backgroundColor: 'var(--accent-primary)' }}
              >
                View Client Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Client Details Modal */}
      <LeadDetailsModal
        lead={selectedLead}
        isOpen={isLeadModalOpen}
        onClose={() => { setIsLeadModalOpen(false); setSelectedLead(null) }}
        onStatusUpdate={handleUpdateLeadStatus}
      />
    </div>
  )
}
