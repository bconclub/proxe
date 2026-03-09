'use client'

import { useState, useEffect } from 'react'
import { MdClose, MdMic, MdMicOff } from 'react-icons/md'
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition'

interface ActivityLoggerModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (activity: {
    activity_type: 'note'
    note: string
  }) => Promise<void>
  leadName?: string
  stageChange?: {
    oldStage: string | null
    newStage: string
  }
}

export default function ActivityLoggerModal({
  isOpen,
  onClose,
  onSave,
  leadName,
  stageChange
}: ActivityLoggerModalProps) {
  const [note, setNote] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Voice input
  const { isListening, isSupported, transcript, error: speechError, startListening, stopListening, resetTranscript } = useSpeechRecognition()

  // Append transcript to note
  useEffect(() => {
    if (transcript) {
      setNote(prev => {
        const separator = prev && !prev.endsWith(' ') ? ' ' : ''
        return prev + separator + transcript
      })
      resetTranscript()
    }
  }, [transcript, resetTranscript])

  if (!isOpen) return null

  const handleSave = async () => {
    if (!note.trim()) {
      setError('Please add a note')
      return
    }

    setError(null)
    setIsSaving(true)

    try {
      if (isListening) stopListening()

      await onSave({
        activity_type: 'note',
        note: note.trim(),
      })

      setNote('')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }

  const handleClose = () => {
    if (!isSaving) {
      if (isListening) stopListening()
      setNote('')
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

      {/* Modal - compact */}
      <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
        <div
          className="relative w-full max-w-sm bg-white dark:bg-[#1A1A1A] rounded-xl shadow-xl z-50"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-[#262626]">
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white">
                {stageChange ? 'Log Activity' : 'Add Note'}
              </h2>
              {stageChange && (
                <p className="text-xs mt-0.5 text-gray-500 dark:text-gray-400">
                  {stageChange.oldStage || 'None'} → {stageChange.newStage}
                </p>
              )}
            </div>
            <button
              onClick={handleClose}
              disabled={isSaving}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors disabled:opacity-50"
            >
              <MdClose size={20} />
            </button>
          </div>

          {/* Content - just a text area with mic */}
          <div className="px-5 py-4 space-y-3">
            <div className="relative">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={isSaving}
                rows={3}
                autoFocus
                placeholder={isListening ? 'Listening... speak now' : 'What happened? (type or use mic)'}
                className={`w-full px-3 py-2 pr-12 border rounded-lg bg-white dark:bg-[#262626] text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 disabled:opacity-50 resize-none text-sm ${
                  isListening
                    ? 'border-red-400 focus:ring-red-400'
                    : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'
                }`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    handleSave()
                  }
                }}
              />
              {isSupported && (
                <button
                  type="button"
                  onClick={isListening ? stopListening : startListening}
                  disabled={isSaving}
                  className={`absolute bottom-2 right-2 p-1.5 rounded-full transition-all disabled:opacity-50 ${
                    isListening
                      ? 'bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50'
                      : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                  title={isListening ? 'Stop recording' : 'Voice input'}
                >
                  {isListening ? (
                    <MdMic size={18} className="text-red-500 animate-pulse" />
                  ) : (
                    <MdMicOff size={18} className="text-gray-400" />
                  )}
                </button>
              )}
            </div>

            {isListening && (
              <p className="text-xs text-red-500 animate-pulse flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 bg-red-500 rounded-full animate-ping" />
                Listening...
              </p>
            )}
            {speechError && (
              <p className="text-xs text-amber-500">{speechError}</p>
            )}

            {/* Error */}
            {error && (
              <p className="text-xs text-red-500">{error}</p>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleClose}
                disabled={isSaving}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !note.trim()}
                className="flex-1 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
            <p className="text-[10px] text-gray-400 text-center">Ctrl+Enter to save</p>
          </div>
        </div>
      </div>
    </>
  )
}
