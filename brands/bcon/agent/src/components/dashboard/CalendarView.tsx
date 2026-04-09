'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths, addWeeks, subWeeks } from 'date-fns'
import { MdChevronLeft, MdChevronRight, MdClose, MdCalendarToday, MdAccessTime, MdAdd, MdSend, MdPhone, MdEvent, MdMessage, MdNote } from 'react-icons/md'
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
  status?: string | null
}

interface CalendarViewProps {
  bookings: Booking[]
  onDateSelect?: (date: Date) => void
  headerRight?: React.ReactNode
}

// Business hours only - 8 AM to 6 PM
const HOURS = Array.from({ length: 11 }, (_, i) => i + 8) // 8,9,10,...,18
const DAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function formatHour(hour: number): string {
  if (hour === 0) return '12 AM'
  if (hour < 12) return `${hour} AM`
  if (hour === 12) return '12 PM'
  return `${hour - 12} PM`
}

export default function CalendarView({ bookings, onDateSelect, headerRight }: CalendarViewProps) {
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
  const [showNoteInput, setShowNoteInput] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [noteType, setNoteType] = useState<'note' | 'call' | 'meeting' | 'message'>('note')
  const [savingNote, setSavingNote] = useState(false)
  const [recentNotes, setRecentNotes] = useState<Array<{ note: string; activity_type: string; created_at: string }>>([])
  const [loadingNotes, setLoadingNotes] = useState(false)

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

  // Auto-scroll to top on mount (grid already starts at 8 AM)
  useEffect(() => {
    if (scrollRef.current && viewMode === 'week') {
      scrollRef.current.scrollTop = 0
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

  // Fetch recent notes when modal opens
  const fetchNotes = async (leadId: string) => {
    setLoadingNotes(true)
    try {
      const res = await fetch(`/api/dashboard/leads/${leadId}/activities`)
      if (!res.ok) return
      const data = await res.json()
      const notes = (data.activities || [])
        .filter((a: any) => a.type === 'team')
        .slice(0, 5)
        .map((a: any) => ({ note: a.content, activity_type: a.icon, created_at: a.timestamp }))
      setRecentNotes(notes)
    } catch { /* ignore */ }
    finally { setLoadingNotes(false) }
  }

  const handleSaveNote = async () => {
    if (!selectedBooking || !noteText.trim()) return
    setSavingNote(true)
    try {
      const res = await fetch(`/api/dashboard/leads/${selectedBooking.id}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activity_type: noteType, note: noteText.trim() }),
      })
      if (!res.ok) throw new Error('Failed to save')
      setNoteText('')
      setShowNoteInput(false)
      fetchNotes(selectedBooking.id)
    } catch (err) {
      console.error('Error saving note:', err)
    } finally {
      setSavingNote(false)
    }
  }

  const handleBookingModalOpen = (booking: Booking, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedBooking(booking)
    setIsModalOpen(true)
    setShowNoteInput(false)
    setNoteText('')
    setNoteType('note')
    setRecentNotes([])
    fetchNotes(booking.id)
  }

  const NOTE_TYPES = [
    { value: 'call' as const, label: 'Call', icon: MdPhone },
    { value: 'meeting' as const, label: 'Meeting', icon: MdEvent },
    { value: 'message' as const, label: 'Message', icon: MdMessage },
    { value: 'note' as const, label: 'Note', icon: MdNote },
  ]

  // Timezone label
  const tzOffset = new Date().getTimezoneOffset()
  const tzHours = Math.abs(Math.floor(tzOffset / 60))
  const tzMins = Math.abs(tzOffset % 60)
  const tzSign = tzOffset <= 0 ? '+' : '-'
  const tzLabel = `GMT${tzSign}${String(tzHours).padStart(2, '0')}:${String(tzMins).padStart(2, '0')}`

// Get event color based on booking status and date
function getEventColor(booking: Booking): string {
  const today = new Date().toISOString().split('T')[0]
  const isPast = booking.booking_date && booking.booking_date < today
  
  // Check status from metadata or unified_context
  const status = booking.status || 
    booking.metadata?.status || 
    booking.metadata?.booking_status ||
    booking.unified_context?.web?.booking_status ||
    booking.unified_context?.whatsapp?.booking_status
  
  if (status === 'no_show' || status === 'no-show' || status === 'cancelled') {
    return '#EF4444' // Red for no-show/cancelled
  }
  if (status === 'completed' || status === 'done' || status === 'attended') {
    return '#22C55E' // Green for completed
  }
  if (isPast) {
    return '#9CA3AF' // Gray for past bookings
  }
  return '#3B82F6' // Blue for upcoming
}

  return (
    <div className="flex gap-0 h-[calc(100vh-64px)]">
      {/* Left Sidebar - Mini Calendar */}
      <div className="hidden lg:flex flex-col w-[180px] flex-shrink-0 px-3 py-2 border-r" style={{ borderColor: 'var(--border-primary)' }}>
        {/* Mini calendar month nav */}
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-0.5 rounded hover:bg-[var(--bg-hover)]">
            <MdChevronLeft size={16} style={{ color: 'var(--text-secondary)' }} />
          </button>
          <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
            {format(currentDate, 'MMM yyyy')}
          </span>
          <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-0.5 rounded hover:bg-[var(--bg-hover)]">
            <MdChevronRight size={16} style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <div key={i} className="text-[9px] text-center font-medium py-0.5" style={{ color: 'var(--text-secondary)' }}>{d}</div>
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
                className="relative aspect-square flex items-center justify-center text-[10px] rounded-full hover:bg-[var(--bg-hover)]"
                style={{
                  color: !isCurrentMonth ? 'var(--text-secondary)' : isSelected ? '#fff' : isToday ? 'var(--accent-primary)' : 'var(--text-primary)',
                  backgroundColor: isSelected ? 'var(--button-bg)' : isToday ? 'var(--accent-subtle)' : 'transparent',
                  fontWeight: isToday || isSelected ? 600 : 400,
                  opacity: !isCurrentMonth ? 0.4 : 1,
                }}
              >
                {format(day, 'd')}
                {hasBookings && !isSelected && (
                  <span className="absolute bottom-0 w-1 h-1 rounded-full" style={{ backgroundColor: 'var(--button-bg)' }} />
                )}
              </button>
            )
          })}
        </div>

        {/* View toggle */}
        <div className="mt-3 pt-3 flex gap-1" style={{ borderTop: '1px solid var(--border-primary)' }}>
          {(['week', 'month'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className="flex-1 py-1 text-[10px] font-medium rounded transition-colors capitalize"
              style={{
                backgroundColor: viewMode === mode ? 'var(--button-bg)' : 'transparent',
                color: viewMode === mode ? 'var(--text-button)' : 'var(--text-secondary)',
              }}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Main Calendar */}
      <div className="flex-1 flex flex-col min-w-0" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        {/* Top bar */}
        <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ borderColor: 'var(--border-primary)' }}>
          <button
            onClick={() => { setCurrentDate(new Date()); setSelectedDate(new Date()) }}
            className="px-3 py-1 text-xs font-medium border rounded hover:shadow-sm transition-shadow"
            style={{ borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
          >
            Today
          </button>
          <button onClick={() => navigateDate('prev')} className="p-0.5 rounded-full hover:bg-[var(--bg-hover)]">
            <MdChevronLeft size={20} style={{ color: 'var(--text-secondary)' }} />
          </button>
          <button onClick={() => navigateDate('next')} className="p-0.5 rounded-full hover:bg-[var(--bg-hover)]">
            <MdChevronRight size={20} style={{ color: 'var(--text-secondary)' }} />
          </button>
          <h2 className="text-sm font-medium ml-1" style={{ color: 'var(--text-primary)' }}>
            {format(currentDate, 'MMMM yyyy')}
          </h2>
          {/* Mobile view toggle */}
          <div className="lg:hidden flex gap-1">
            {(['week', 'month'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className="px-2 py-0.5 text-[10px] font-medium rounded capitalize"
                style={{
                  backgroundColor: viewMode === mode ? 'var(--button-bg)' : 'transparent',
                  color: viewMode === mode ? 'var(--text-button)' : 'var(--text-secondary)',
                }}
              >
                {mode}
              </button>
            ))}
          </div>
          {/* Right side - sync button etc. */}
          {headerRight && <div className="ml-auto">{headerRight}</div>}
        </div>

        {viewMode === 'week' ? (
          /* ===== WEEK VIEW - Google Calendar Style ===== */
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Day header row - fixed */}
            <div className="flex border-b" style={{ borderColor: 'var(--border-primary)' }}>
              {/* Timezone label in corner */}
              <div className="w-[48px] flex-shrink-0 flex items-end justify-center pb-0.5">
                <span className="text-[8px]" style={{ color: 'var(--text-secondary)' }}>{tzLabel}</span>
              </div>
              {/* Day columns */}
              {weekDays.map((day, i) => {
                const isToday = isSameDay(day, new Date())
                return (
                  <div
                    key={i}
                    className="flex-1 text-center py-1 border-l"
                    style={{ borderColor: 'var(--border-primary)' }}
                  >
                    <div className="text-[10px] font-medium" style={{ color: isToday ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
                      {DAY_LABELS[i]}
                    </div>
                    <div
                      className="text-lg font-normal leading-tight mx-auto flex items-center justify-center"
                      style={{
                        color: isToday ? '#fff' : 'var(--text-primary)',
                        backgroundColor: isToday ? 'var(--button-bg)' : 'transparent',
                        borderRadius: '50%',
                        width: '30px',
                        height: '30px',
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
                <div className="w-[48px] flex-shrink-0">
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="relative border-b"
                      style={{ height: '52px', borderColor: 'color-mix(in srgb, var(--border-primary) 40%, transparent)' }}
                    >
                      {hour > 0 && (
                        <span className="absolute -top-[6px] right-1.5 text-[9px] leading-none" style={{ color: 'var(--text-secondary)' }}>
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
                        style={{ height: '52px', borderColor: 'color-mix(in srgb, var(--border-primary) 40%, transparent)' }}
                      />
                    ))}
                    {/* Booking events overlaid */}
                    {getBookingsForDate(day).map((booking, bIdx) => {
                      if (!booking.booking_time) return null
                      const [h, m] = booking.booking_time.split(':').map(Number)
                      const top = (h - 8) * 52 + Math.round((m || 0) * 52 / 60)
                      const height = 52 // 1-hour block
                      const dayBookingsAtHour = getBookingsForTimeSlot(day, h)
                      const total = dayBookingsAtHour.length
                      const idx = dayBookingsAtHour.indexOf(booking)
                      const widthPct = total > 1 ? 100 / total : 100
                      const leftPct = total > 1 ? idx * widthPct : 0

                      const topic = booking.booking_title || booking.metadata?.title || null
                      const eventColor = getEventColor(booking)
                      return (
                        <div
                          key={booking.id}
                          onClick={(e) => handleBookingModalOpen(booking, e)}
                          className="absolute rounded px-1.5 py-0.5 text-white cursor-pointer hover:brightness-110 hover:shadow-md transition-all z-10 overflow-hidden"
                          style={{
                            top: `${top}px`,
                            height: `${height - 2}px`,
                            left: total > 1 ? `${leftPct}%` : '2px',
                            right: total > 1 ? undefined : '2px',
                            width: total > 1 ? `calc(${widthPct}% - 4px)` : undefined,
                            backgroundColor: eventColor,
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
          <div className="flex-1 flex flex-col overflow-hidden p-2">
            <div className="flex-1 grid grid-cols-7 overflow-hidden rounded border" style={{ borderColor: 'var(--border-primary)', gridTemplateRows: `auto repeat(${Math.ceil(calendarDays.length / 7)}, 1fr)` }}>
              {/* Day headers */}
              {DAY_LABELS.map((day) => (
                <div key={day} className="text-center text-[10px] font-medium py-1" style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-tertiary)' }}>
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
                        backgroundColor: isToday ? 'var(--button-bg)' : 'transparent',
                      }}
                    >
                      {format(day, 'd')}
                    </div>
                    <div className="flex-1 space-y-px overflow-y-auto">
                      {dayBookings.map((booking) => {
                        const eventColor = getEventColor(booking)
                        return (
                          <div
                            key={booking.id}
                            onClick={(e) => handleBookingModalOpen(booking, e)}
                            className="text-[10px] leading-tight px-1 py-px rounded text-white truncate cursor-pointer hover:brightness-110"
                            style={{ backgroundColor: eventColor }}
                          >
                            {booking.booking_time?.substring(0, 5)} {booking.name || 'Unnamed'}
                          </div>
                        )
                      })}
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
            <div className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {selectedBooking.name || 'Unnamed Lead'}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {selectedBooking.email && <span>{selectedBooking.email}</span>}
                    {selectedBooking.email && selectedBooking.phone && <span>-</span>}
                    {selectedBooking.phone && <span>{selectedBooking.phone}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setShowNoteInput(!showNoteInput)}
                    className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
                    title="Add context note"
                    style={{ color: showNoteInput ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
                  >
                    <MdAdd size={20} />
                  </button>
                  <button onClick={() => setIsModalOpen(false)} className="p-1 rounded hover:bg-[var(--bg-hover)]">
                    <MdClose size={20} style={{ color: 'var(--text-secondary)' }} />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-5 p-3 rounded-lg mb-3" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
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
                <span className="ml-auto px-2 py-0.5 text-[10px] font-semibold rounded-full text-[var(--text-button)]" style={{ backgroundColor: 'var(--button-bg)' }}>
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
                  <div className="text-[13px] leading-relaxed font-normal p-3 rounded-lg mb-3" style={{ color: 'var(--text-primary)' }}>
                    {summary}
                  </div>
                )
              })()}

              {/* Add Context Note Section */}
              {showNoteInput && (
                <div className="mb-3 p-3 rounded-lg border" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-tertiary)' }}>
                  <div className="flex items-center gap-1 mb-2">
                    {NOTE_TYPES.map((type) => {
                      const Icon = type.icon
                      const isActive = noteType === type.value
                      return (
                        <button
                          key={type.value}
                          onClick={() => setNoteType(type.value)}
                          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors"
                          style={{
                            backgroundColor: isActive ? 'var(--button-bg)' : 'transparent',
                            color: isActive ? 'var(--text-button)' : 'var(--text-secondary)',
                          }}
                        >
                          <Icon size={12} />
                          {type.label}
                        </button>
                      )
                    })}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && noteText.trim()) handleSaveNote() }}
                      placeholder="Quick note... e.g. Had a call, discussed pricing"
                      className="flex-1 px-2.5 py-1.5 text-xs rounded border bg-transparent focus:outline-none focus:ring-1"
                      style={{ borderColor: 'var(--border-primary)', color: 'var(--text-primary)', '--tw-ring-color': 'var(--accent-primary)' } as any}
                      autoFocus
                    />
                    <button
                      onClick={handleSaveNote}
                      disabled={savingNote || !noteText.trim()}
                      className="px-2.5 py-1.5 rounded text-[var(--text-button)] text-xs font-medium disabled:opacity-40 hover:brightness-110 transition-all"
                      style={{ backgroundColor: 'var(--button-bg)' }}
                    >
                      {savingNote ? '...' : <MdSend size={14} />}
                    </button>
                  </div>
                </div>
              )}

              {/* Recent Notes */}
              {recentNotes.length > 0 && (
                <div className="mb-3 space-y-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-secondary)' }}>Recent Notes</div>
                  {recentNotes.map((n, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs px-2 py-1.5 rounded" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <span className="flex-shrink-0 mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        {n.activity_type === 'call' ? <MdPhone size={12} /> : n.activity_type === 'meeting' ? <MdEvent size={12} /> : n.activity_type === 'message' ? <MdMessage size={12} /> : <MdNote size={12} />}
                      </span>
                      <span className="flex-1 text-[12px]" style={{ color: 'var(--text-primary)' }}>{n.note}</span>
                      <span className="text-[9px] flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
                        {(() => {
                          try {
                            const d = new Date(n.created_at)
                            const now = new Date()
                            const diffMs = now.getTime() - d.getTime()
                            const diffMins = Math.floor(diffMs / 60000)
                            if (diffMins < 60) return `${diffMins}m ago`
                            const diffHrs = Math.floor(diffMins / 60)
                            if (diffHrs < 24) return `${diffHrs}h ago`
                            const diffDays = Math.floor(diffHrs / 24)
                            return `${diffDays}d ago`
                          } catch { return '' }
                        })()}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={handleViewClientDetails}
                className="w-full py-2.5 text-sm font-medium text-[var(--text-button)] rounded-lg hover:brightness-110 transition-all"
                style={{ backgroundColor: 'var(--button-bg)' }}
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
