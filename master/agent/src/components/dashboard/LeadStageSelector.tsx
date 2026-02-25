'use client'

import { useState, useEffect } from 'react'
import { LeadStage, HighIntentSubStage } from '@/types'
import ActivityLoggerModal from './ActivityLoggerModal'

interface LeadStageSelectorProps {
  leadId: string
  currentStage: LeadStage | null
  currentSubStage?: string | null
  onStageChange?: (stage: LeadStage, subStage?: string | null) => void
  disabled?: boolean
}

const STAGE_OPTIONS: { value: LeadStage; label: string; description: string; scoreRange?: string }[] = [
  { value: 'New', label: 'New', description: '0-30 score', scoreRange: '0-30' },
  { value: 'Engaged', label: 'Engaged', description: '0-30 score, active chat', scoreRange: '0-30' },
  { value: 'Qualified', label: 'Qualified', description: '31-60 score', scoreRange: '31-60' },
  { value: 'High Intent', label: 'High Intent', description: '61-85 score', scoreRange: '61-85' },
  { value: 'Booking Made', label: 'Booking Made', description: '86-100 score', scoreRange: '86-100' },
  { value: 'Converted', label: 'Converted', description: 'Manual close', scoreRange: 'Manual' },
  { value: 'Closed Lost', label: 'Closed Lost', description: 'Manual', scoreRange: 'Manual' },
  { value: 'In Sequence', label: 'In Sequence', description: 'Auto for <61 score', scoreRange: 'Auto' },
  { value: 'Cold', label: 'Cold', description: 'Exhausted sequences', scoreRange: 'Auto' },
]

const SUB_STAGE_OPTIONS: { value: HighIntentSubStage; label: string }[] = [
  { value: 'proposal', label: 'Proposal' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'on-hold', label: 'On Hold' },
]

const getStageColor = (stage: LeadStage | null): string => {
  const colors: Record<LeadStage, string> = {
    'New': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    'Engaged': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
    'Qualified': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    'High Intent': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    'Booking Made': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    'Converted': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
    'Closed Lost': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    'In Sequence': '', // Uses inline styles with CSS variables
    'Cold': 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  }
  return stage ? colors[stage] : colors['New']
}

export default function LeadStageSelector({
  leadId,
  currentStage,
  currentSubStage,
  onStageChange,
  disabled = false
}: LeadStageSelectorProps) {
  const [stage, setStage] = useState<LeadStage | null>(currentStage)
  const [subStage, setSubStage] = useState<string | null>(currentSubStage || null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showActivityModal, setShowActivityModal] = useState(false)
  const [pendingStageChange, setPendingStageChange] = useState<{
    stageChangeId: string | null
    oldStage: string | null
    newStage: string
  } | null>(null)

  // Update local state when props change
  useEffect(() => {
    setStage(currentStage)
  }, [currentStage])

  useEffect(() => {
    setSubStage(currentSubStage || null)
  }, [currentSubStage])

  const handleStageChange = async (newStage: LeadStage) => {
    if (disabled || isUpdating) return

    setError(null)
    
    // Show activity logger modal first (required for manual override)
    const oldStage = stage
    setPendingStageChange({
      stageChangeId: null,
      oldStage,
      newStage,
    })
    setShowActivityModal(true)
  }

  const handleActivitySave = async (activity: {
    activity_type: 'call' | 'meeting' | 'message' | 'note'
    note: string
    duration?: number
    next_followup?: string
  }) => {
    if (!pendingStageChange) return

    setIsUpdating(true)
    setError(null)

    try {
      // Call override endpoint with activity data
      const response = await fetch(`/api/dashboard/leads/${leadId}/override`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          new_stage: pendingStageChange.newStage,
          activity_type: activity.activity_type,
          note: activity.note,
          duration_minutes: activity.duration,
          next_followup_date: activity.next_followup,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update stage')
      }

      const data = await response.json()
      setStage(pendingStageChange.newStage as LeadStage)
      if (pendingStageChange.newStage !== 'High Intent') {
        setSubStage(null)
      }

      setShowActivityModal(false)
      setPendingStageChange(null)

      if (onStageChange) {
        onStageChange(pendingStageChange.newStage as LeadStage, null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update stage')
      console.error('Error updating stage:', err)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleSubStageChange = async (newSubStage: HighIntentSubStage) => {
    if (disabled || isUpdating || stage !== 'High Intent') return

    setError(null)
    setIsUpdating(true)

    try {
      const response = await fetch(`/api/dashboard/leads/${leadId}/stage`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          stage: 'High Intent',
          sub_stage: newSubStage,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update sub-stage')
      }

      setSubStage(newSubStage)

      if (onStageChange) {
        onStageChange('High Intent', newSubStage)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update sub-stage')
      console.error('Error updating sub-stage:', err)
    } finally {
      setIsUpdating(false)
    }
  }


  return (
    <>
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Lead Stage
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {STAGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleStageChange(option.value)}
                disabled={disabled || isUpdating}
                className={`
                  px-3 py-2 text-sm font-medium rounded-md transition-colors
                  ${stage === option.value
                    ? `${getStageColor(option.value)} ring-2 ring-offset-2 ring-current`
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                  }
                  ${disabled || isUpdating ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
                title={option.description}
              >
                {option.label}
              </button>
            ))}
          </div>
          {error && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        {stage === 'High Intent' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Sub-Stage
            </label>
            <div className="flex gap-2">
              {SUB_STAGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSubStageChange(option.value)}
                  disabled={disabled || isUpdating}
                  className={`
                    px-3 py-2 text-sm font-medium rounded-md transition-colors
                    ${subStage === option.value
                      ? 'bg-orange-200 text-orange-900 dark:bg-orange-800 dark:text-orange-100 ring-2 ring-offset-2 ring-orange-500'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                    }
                    ${disabled || isUpdating ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                  `}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Activity Logger Modal */}
      <ActivityLoggerModal
        isOpen={showActivityModal}
        onClose={() => {
          if (!isUpdating) {
            setShowActivityModal(false)
            setPendingStageChange(null)
          }
        }}
        onSave={handleActivitySave}
        stageChange={pendingStageChange ? {
          oldStage: pendingStageChange.oldStage,
          newStage: pendingStageChange.newStage,
        } : undefined}
      />
    </>
  )
}

