'use client'

import { useState } from 'react'
import { MdClose, MdPhone, MdEvent, MdMessage, MdNote } from 'react-icons/md'

interface ActivityLoggerModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (activity: {
    activity_type: 'call' | 'meeting' | 'message' | 'note'
    note: string
    duration?: number
    next_followup?: string
  }) => Promise<void>
  leadName?: string
  stageChange?: {
    oldStage: string | null
    newStage: string
  }
}

const ACTIVITY_TYPES = [
  { value: 'call' as const, label: 'Call', icon: MdPhone, color: '#3B82F6' },
  { value: 'meeting' as const, label: 'Meeting', icon: MdEvent, color: typeof window !== 'undefined' ? getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim() || 'var(--accent-primary)' : 'var(--accent-primary)' },
  { value: 'message' as const, label: 'Message', icon: MdMessage, color: '#22C55E' },
  { value: 'note' as const, label: 'Note', icon: MdNote, color: '#F97316' },
]

export default function ActivityLoggerModal({
  isOpen,
  onClose,
  onSave,
  leadName,
  stageChange
}: ActivityLoggerModalProps) {
  const [activityType, setActivityType] = useState<'call' | 'meeting' | 'message' | 'note'>('call')
  const [note, setNote] = useState('')
  const [duration, setDuration] = useState('')
  const [nextFollowupDate, setNextFollowupDate] = useState('')
  const [nextFollowupTime, setNextFollowupTime] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Generate time options in 30-minute intervals
  const generateTimeOptions = () => {
    const options = []
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
        const displayTime = new Date(`2000-01-01T${timeString}`).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        })
        options.push({ value: timeString, label: displayTime })
      }
    }
    return options
  }

  const timeOptions = generateTimeOptions()

  if (!isOpen) return null

  const handleSave = async () => {
    if (!note.trim()) {
      setError('Note is required')
      return
    }

    setError(null)
    setIsSaving(true)

    try {
      // Combine date and time for next_followup
      let nextFollowupDateTime: string | undefined = undefined
      if (nextFollowupDate && nextFollowupTime) {
        const dateTime = new Date(`${nextFollowupDate}T${nextFollowupTime}`)
        nextFollowupDateTime = dateTime.toISOString()
      } else if (nextFollowupDate) {
        // If only date is provided, use start of day
        const dateTime = new Date(`${nextFollowupDate}T00:00`)
        nextFollowupDateTime = dateTime.toISOString()
      }

      await onSave({
        activity_type: activityType,
        note: note.trim(),
        duration: duration ? parseInt(duration, 10) : undefined,
        next_followup: nextFollowupDateTime,
      })
      
      // Reset form
      setNote('')
      setDuration('')
      setNextFollowupDate('')
      setNextFollowupTime('')
      setActivityType('call')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save activity')
    } finally {
      setIsSaving(false)
    }
  }

  const handleClose = () => {
    if (!isSaving) {
      setNote('')
      setDuration('')
      setNextFollowupDate('')
      setNextFollowupTime('')
      setError(null)
      onClose()
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-50" 
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
        <div 
          className="relative w-full max-w-md bg-white dark:bg-[#1A1A1A] rounded-lg shadow-xl z-50"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-[#262626]">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Log Activity
              </h2>
              {stageChange && (
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                  Stage changed: {stageChange.oldStage || 'None'} → {stageChange.newStage}
                </p>
              )}
            </div>
            <button
              onClick={handleClose}
              disabled={isSaving}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors disabled:opacity-50"
            >
              <MdClose size={24} />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            {/* Activity Type Selection */}
            <div>
              <label className="block text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>
                Activity Type <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {ACTIVITY_TYPES.map((type) => {
                  const Icon = type.icon
                  const isSelected = activityType === type.value
                  return (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => setActivityType(type.value)}
                      disabled={isSaving}
                      className={`
                        flex items-center gap-2 px-4 py-3 rounded-lg border-2 transition-all
                        ${isSelected
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                        }
                        disabled:opacity-50 disabled:cursor-not-allowed
                      `}
                    >
                      <Icon 
                        size={20} 
                        style={{ color: isSelected ? type.color : 'var(--text-secondary)' }}
                      />
                      <span 
                        className="text-sm font-medium"
                        style={{ color: isSelected ? type.color : 'var(--text-primary)' }}
                      >
                        {type.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Note (Required) */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                Note <span className="text-red-500">*</span>
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={isSaving}
                rows={4}
                placeholder="Enter activity details..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-[#262626] text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>

            {/* Duration (Optional) */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                Duration (minutes) <span className="text-xs text-gray-400">Optional</span>
              </label>
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                disabled={isSaving}
                min="0"
                placeholder="e.g., 15"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-[#262626] text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>

            {/* Next Follow-up (Optional) */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                Next Follow-up <span className="text-xs text-gray-400">Optional</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Date</label>
                  <input
                    type="date"
                    value={nextFollowupDate}
                    onChange={(e) => setNextFollowupDate(e.target.value)}
                    disabled={isSaving}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-[#262626] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Time</label>
                  <select
                    value={nextFollowupTime}
                    onChange={(e) => setNextFollowupTime(e.target.value)}
                    disabled={isSaving || !nextFollowupDate}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-[#262626] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    <option value="">Select time</option>
                    {timeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <button
                onClick={handleClose}
                disabled={isSaving}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !note.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : 'Save Activity'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

