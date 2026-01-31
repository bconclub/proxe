'use client'

import React, { useState, useEffect } from 'react';
import styles from './BookingCalendarWidget.module.css';
import type { BrandConfig } from '@/configs';

export interface BookingCalendarWidgetProps {
  onClose?: () => void;
  onBookingComplete?: (bookingData: BookingData) => void;
  brand?: string;
  config?: BrandConfig;
  prefillName?: string;
  prefillEmail?: string;
  prefillPhone?: string;
  sessionId?: string;
  onContactDraft?: (data: { name?: string; email?: string; phone?: string }) => void;
  onContactSubmit?: (data: { name?: string; email?: string; phone?: string }) => void | Promise<void>;
}

interface BookingData {
  date: string;
  time: string;
  name: string;
  email: string;
  phone: string;
  googleEventId?: string;
}

interface TimeSlot {
  time: string;
  displayTime: string;
  available: boolean;
}

// Available time slots: 11:00 AM, 1:00 PM, 3:00 PM, 4:00 PM, 5:00 PM, 6:00 PM
const AVAILABLE_SLOTS = [
  '11:00 AM',
  '1:00 PM',
  '3:00 PM',
  '4:00 PM',
  '5:00 PM',
  '6:00 PM',
];

export function BookingCalendarWidget({
  onClose,
  onBookingComplete,
  brand,
  config,
  prefillName,
  prefillEmail,
  prefillPhone,
  sessionId,
  onContactDraft,
  onContactSubmit,
}: BookingCalendarWidgetProps) {
  // Helper to clean phone number (remove +1 prefix if present)
  const cleanPhoneNumber = (phone: string | null | undefined): string => {
    if (!phone) return '';
    // Remove +1 prefix if present
    return phone.replace(/^\+1\s*/, '').trim();
  };

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [showTimeSlots, setShowTimeSlots] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [isWarning, setIsWarning] = useState(false);
  const [formData, setFormData] = useState({
    name: prefillName || '',
    email: prefillEmail || '',
    phone: cleanPhoneNumber(prefillPhone),
    sessionType: '' as 'online' | 'offline' | '',
  });
  useEffect(() => {
    setFormData((prev) => {
      const next = {
        ...prev,
        name: prefillName !== undefined ? prefillName : prev.name,
        email: prefillEmail !== undefined ? prefillEmail : prev.email,
        phone: prefillPhone !== undefined ? cleanPhoneNumber(prefillPhone) : prev.phone,
      };
      return next;
    });

    const draftPayload: { name?: string; email?: string; phone?: string } = {};
    if (prefillName) draftPayload.name = prefillName;
    if (prefillEmail) draftPayload.email = prefillEmail;
    if (prefillPhone) draftPayload.phone = prefillPhone;
    if (onContactDraft && Object.keys(draftPayload).length > 0) {
      onContactDraft(draftPayload);
    }
  }, [prefillName, prefillEmail, prefillPhone, onContactDraft]);

  const today = new Date();
  const [currentDate, setCurrentDate] = useState(new Date(today.getFullYear(), today.getMonth(), today.getDate()));

  const formatDateForAPI = (date: Date): string => {
    // Format date as YYYY-MM-DD using local timezone to avoid timezone conversion issues
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Helper to get absolute API URL (works in iframe)
  const getApiUrl = (path: string) => {
    if (typeof window === 'undefined') return path;
    if (path.startsWith('http')) return path;
    return `${window.location.origin}${path.startsWith('/') ? path : `/${path}`}`;
  };

  // Check availability when date is selected
  useEffect(() => {
    if (selectedDate && !showForm && !showConfirmation) {
      checkAvailability();
    }
  }, [selectedDate]);

  const checkAvailability = async () => {
    if (!selectedDate) return;

    setLoadingAvailability(true);
    setBookingError(null);
    setIsWarning(false);

    try {
      const dateStr = formatDateForAPI(selectedDate);

      const response = await fetch(getApiUrl('/api/calendar/availability'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ date: dateStr }),
      });

      const data = await response.json().catch(() => ({ error: 'Failed to parse response' }));

      if (!response.ok) {
        const errorMsg = data.error || 'Failed to check availability';
        const detailsMsg = data.details ? `: ${data.details}` : '';
        const suggestionMsg = data.suggestion ? ` ${data.suggestion}` : '';
        throw new Error(`${errorMsg}${detailsMsg}${suggestionMsg}`);
      }

      // Show warning if credentials are not configured
      if (data.warning) {
        setBookingError(data.warning);
        setIsWarning(true);
      } else {
        setIsWarning(false);
      }

      // Map API response to our time slots
      const slots: TimeSlot[] = AVAILABLE_SLOTS.map((slot) => {
        // Find matching slot from API response (API returns displayTime format)
        const apiSlot = data.slots.find((s: any) => {
          const apiTime = s.time || s.displayTime || '';
          return apiTime.trim() === slot;
        });

        return {
          time: slot,
          displayTime: slot,
          available: apiSlot ? apiSlot.available : true, // Default to available if not found
        };
      });

      setTimeSlots(slots);
      setShowTimeSlots(true);
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to check availability. Please check your Google Calendar configuration.';
      setBookingError(errorMessage);
      setIsWarning(false);
      // Default to all slots available if API fails
      setTimeSlots(AVAILABLE_SLOTS.map(slot => ({
        time: slot,
        displayTime: slot,
        available: true,
      })));
      setShowTimeSlots(true);
    } finally {
      setLoadingAvailability(false);
    }
  };

  const handleDateClick = (date: Date) => {
    // Check if it's Sunday (0 = Sunday)
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0) {
      return; // Don't allow Sunday selection
    }

    // Only allow future dates
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const clickedDate = new Date(date);
    clickedDate.setHours(0, 0, 0, 0);

    if (clickedDate >= today) {
      setSelectedDate(date);
      setSelectedTime(null);
      setShowForm(false);
      setShowConfirmation(false);
    }
  };

  const handleTimeClick = (time: string) => {
    const slot = timeSlots.find(s => s.time === time);
    if (slot && slot.available) {
      setSelectedTime(time);
      setShowForm(true);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.email || !formData.phone || !selectedDate || !selectedTime) {
      return;
    }

    // Require session type selection
    if (!formData.sessionType) {
      setBookingError('Please select session type (Online or Facility Visit)');
      return;
    }

    setBookingError(null);
    setIsWarning(false);

    try {
      const dateStr = formatDateForAPI(selectedDate);

      const response = await fetch(getApiUrl('/api/calendar/book'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date: dateStr,
          time: selectedTime,
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          sessionType: formData.sessionType,
          ...(sessionId && { sessionId }),
          ...(brand && { brand }),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to create booking' }));
        const errorMessage = errorData.error || `Failed to create booking (${response.status})`;
        throw new Error(errorMessage);
      }

      const data = await response.json();

      const bookingData: BookingData = {
        date: dateStr, // Use YYYY-MM-DD format for storage
        time: selectedTime!,
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        googleEventId: data.eventId, // Include Google Calendar event ID
      };

      setShowConfirmation(true);
      if (onContactSubmit) {
        await onContactSubmit({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
        });
      }

      if (onBookingComplete) {
        onBookingComplete(bookingData);
      }
    } catch (error: any) {
      setBookingError(error.message || 'Failed to create booking. Please try again.');
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const nextForm = {
      ...formData,
      [name]: value,
    };
    setFormData(nextForm);
    if (onContactDraft) {
      const payload: { name?: string; email?: string; phone?: string } = {};
      if (name === 'name') {
        payload.name = value;
      } else if (name === 'email') {
        payload.email = value;
      } else if (name === 'phone') {
        payload.phone = value;
      }
      if (Object.keys(payload).length > 0) {
        onContactDraft(payload);
      }
    }
  };

  // Get days of current month
  const getMonthDays = () => {
    const days = [];
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - startDate.getDay());

    for (let i = 0; i < 42; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      days.push(date);
    }
    return days;
  };

  const monthDays = getMonthDays();
  const currentMonth = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
    setCurrentDate(newDate);
  };

  // Calculate end time for display
  const getEndTime = (time: string): string => {
    const [timePart, period] = time.split(' ');
    const [hour] = timePart.split(':');
    let hourNum = parseInt(hour);
    if (period === 'PM' && hourNum !== 12) hourNum += 12;
    if (period === 'AM' && hourNum === 12) hourNum = 0;
    const endHour = hourNum + 1;
    const endHour12 = endHour > 12 ? endHour - 12 : endHour === 0 ? 12 : endHour;
    const endPeriod = endHour >= 12 ? 'PM' : 'AM';
    return `${endHour12}:00 ${endPeriod}`;
  };

  // Generate Google Calendar link
  const generateGoogleCalendarLink = (): string => {
    if (!selectedDate || !selectedTime) return '';

    const dateStr = formatDateForAPI(selectedDate);
    const [timePart, period] = selectedTime.split(' ');
    const [hour, minute] = timePart.split(':');
    let hourNum = parseInt(hour);
    if (period === 'PM' && hourNum !== 12) hourNum += 12;
    if (period === 'AM' && hourNum === 12) hourNum = 0;

    const startDate = new Date(`${dateStr}T${hourNum.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00+05:30`);
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // Add 1 hour

    const formatGoogleDate = (date: Date): string => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const startStr = formatGoogleDate(startDate);
    const endStr = formatGoogleDate(endDate);

    const eventTitle = config?.name ? `${config.name} Consultation` : 'Aviation Consultation';
    const title = encodeURIComponent(eventTitle);
    const details = encodeURIComponent(`Consultation Booking\n\nName: ${formData.name}\nEmail: ${formData.email}\nPhone: ${formData.phone}\n\nContact: ${formData.email}`);
    const location = encodeURIComponent(formData.sessionType === 'offline' ? 'Windchasers Aviation Academy Facility' : 'Online Session (Video Call)');

    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startStr}/${endStr}&details=${details}&location=${location}`;
  };

  // Generate ICS file content
  const generateICSFile = (): string => {
    if (!selectedDate || !selectedTime) return '';

    const dateStr = formatDateForAPI(selectedDate);
    const [timePart, period] = selectedTime.split(' ');
    const [hour, minute] = timePart.split(':');
    let hourNum = parseInt(hour);
    if (period === 'PM' && hourNum !== 12) hourNum += 12;
    if (period === 'AM' && hourNum === 12) hourNum = 0;

    const startDate = new Date(`${dateStr}T${hourNum.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00+05:30`);
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // Add 1 hour

    const formatICSDate = (date: Date): string => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const startStr = formatICSDate(startDate);
    const endStr = formatICSDate(endDate);
    const nowStr = formatICSDate(new Date());

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Windchasers//Booking Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${Date.now()}@windchasers.in`,
      `DTSTAMP:${nowStr}`,
      `DTSTART:${startStr}`,
      `DTEND:${endStr}`,
      `SUMMARY:${config?.name ? `${config.name} Consultation` : 'Aviation Consultation'}`,
      `DESCRIPTION:Consultation Booking\\n\\nName: ${formData.name}\\nEmail: ${formData.email}\\nPhone: ${formData.phone}\\n\\nContact: ${formData.email}`,
      `LOCATION:${formData.sessionType === 'offline' ? 'Windchasers Aviation Academy Facility' : 'Online Session (Video Call)'}`,
      'STATUS:CONFIRMED',
      'SEQUENCE:0',
      'BEGIN:VALARM',
      'TRIGGER:-PT30M',
      'ACTION:DISPLAY',
      'DESCRIPTION:Reminder: PROXe Demo',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    return icsContent;
  };

  // Handle download ICS file
  const handleDownloadICS = () => {
    const icsContent = generateICSFile();
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `proxe-demo-${formatDateForAPI(selectedDate!)}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  // Handle open Google Calendar
  const handleOpenGoogleCalendar = () => {
    const googleLink = generateGoogleCalendarLink();
    if (googleLink) {
      window.open(googleLink, '_blank');
    }
  };

  if (showConfirmation) {
    return (
      <div className={styles.calendarContainer} data-view="confirmation">
        <div className={styles.confirmationContainer}>
          <div className={styles.confirmationIcon}>✓</div>
          <h2 className={styles.confirmationTitle}>Booking Confirmed!</h2>
          <div className={styles.confirmationText}>
            <span>Your demo is scheduled for</span>
            <strong>{selectedDate?.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric'
            })} at {selectedTime} - {getEndTime(selectedTime!)}</strong>
          </div>
          <div className={styles.calendarActions}>
            <button
              onClick={handleOpenGoogleCalendar}
              className={styles.addToCalendarButton}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
              Add to Calendar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showForm) {
    return (
      <div className={styles.calendarContainer} data-view="form">
        <div className={styles.formContainer}>
          <h2 className={styles.formTitle}>Booking Details</h2>
          <p className={styles.formSubtitle}>
            {selectedDate?.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric'
            })} at {selectedTime} - {getEndTime(selectedTime!)}
          </p>

          {bookingError && (
            <div className={isWarning ? styles.warningMessage : styles.errorMessage}>{bookingError}</div>
          )}

          <form onSubmit={handleFormSubmit} className={styles.bookingForm}>
            <div className={styles.formGroup}>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
                placeholder="Name"
              />
            </div>

            <div className={styles.formGroup}>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                required
                placeholder="Email"
              />
            </div>

            <div className={styles.formGroup}>
              <input
                type="tel"
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                required
                placeholder="Enter your phone number"
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="sessionType" style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                Session Type <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  padding: '10px 16px',
                  border: `2px solid ${formData.sessionType === 'online' ? '#3b82f6' : '#e5e7eb'}`,
                  borderRadius: '8px',
                  backgroundColor: formData.sessionType === 'online' ? '#eff6ff' : 'transparent',
                  transition: 'all 0.2s',
                  flex: '1',
                  minWidth: '120px'
                }}>
                  <input
                    type="radio"
                    id="sessionType-online"
                    name="sessionType"
                    value="online"
                    checked={formData.sessionType === 'online'}
                    onChange={(e) => setFormData({ ...formData, sessionType: e.target.value as 'online' | 'offline' })}
                    style={{ marginRight: '8px' }}
                    required
                  />
                  <span>Online Session</span>
                </label>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  padding: '10px 16px',
                  border: `2px solid ${formData.sessionType === 'offline' ? '#3b82f6' : '#e5e7eb'}`,
                  borderRadius: '8px',
                  backgroundColor: formData.sessionType === 'offline' ? '#eff6ff' : 'transparent',
                  transition: 'all 0.2s',
                  flex: '1',
                  minWidth: '120px'
                }}>
                  <input
                    type="radio"
                    id="sessionType-offline"
                    name="sessionType"
                    value="offline"
                    checked={formData.sessionType === 'offline'}
                    onChange={(e) => setFormData({ ...formData, sessionType: e.target.value as 'online' | 'offline' })}
                    style={{ marginRight: '8px' }}
                    required
                  />
                  <span>Facility Visit</span>
                </label>
              </div>
            </div>

            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.backButton}
                onClick={() => {
                  setShowForm(false);
                  setSelectedTime(null);
                  setBookingError(null);
                }}
              >
                Back
              </button>
              <button type="submit" className={styles.submitButton}>
                Book Now
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.calendarContainer} data-brand={brand || 'proxe'}>
      {onClose && (
        <button className={styles.closeButton} onClick={onClose} aria-label="Close calendar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      )}

      {bookingError && !showForm && (
        <div className={isWarning ? styles.warningMessage : styles.errorMessage} style={{ marginBottom: '16px' }}>
          {bookingError}
        </div>
      )}

      <div className={styles.calendarLayout}>
        {/* Calendar Section */}
        <div className={styles.calendarSection}>
          <div className={styles.calendarHeader}>
            <button onClick={() => navigateMonth('prev')} className={styles.navButton}>
              ←
            </button>
            <span className={styles.monthYear}>{currentMonth}</span>
            <button onClick={() => navigateMonth('next')} className={styles.navButton}>
              →
            </button>
          </div>

          <div className={styles.monthGrid}>
            <div className={styles.monthDaysHeader}>
              {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((day) => (
                <div key={day} className={styles.monthDayHeader}>{day}</div>
              ))}
            </div>
            <div className={styles.monthDaysGrid}>
              {monthDays.map((day, index) => {
                const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                const isToday = day.toDateString() === new Date().toDateString();
                const isSelected = selectedDate?.toDateString() === day.toDateString();
                const isPast = day < new Date(new Date().setHours(0, 0, 0, 0));
                const isSunday = day.getDay() === 0;

                return (
                  <button
                    key={index}
                    className={`${styles.monthDateButton} ${!isCurrentMonth ? styles.monthDateOther : ''} ${isToday ? styles.dateToday : ''} ${isSelected ? styles.dateSelected : ''} ${isPast || isSunday ? styles.datePast : ''}`}
                    onClick={() => handleDateClick(day)}
                    disabled={isPast || !isCurrentMonth || isSunday}
                    title={isSunday ? 'Sundays are unavailable' : ''}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Time Slots Section */}
        <div className={styles.timeSlotsSection}>
          <h3 className={styles.timeSlotsTitle}>Time</h3>
          {loadingAvailability ? (
            <div className={styles.loadingText}>Checking availability...</div>
          ) : selectedDate ? (
            <div className={styles.timeSlotsList}>
              {timeSlots.map((slot) => (
                <button
                  key={slot.time}
                  className={`${styles.timeSlot} ${selectedTime === slot.time ? styles.timeSlotSelected : ''} ${!slot.available ? styles.timeSlotUnavailable : ''}`}
                  onClick={() => handleTimeClick(slot.time)}
                  disabled={!slot.available}
                  title={!slot.available ? 'This slot is already booked' : ''}
                >
                  {slot.displayTime}
                </button>
              ))}
            </div>
          ) : (
            <div className={styles.timeSlotsPlaceholder}>
              Select a date to see available times
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
