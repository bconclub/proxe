/**
 * StageBadge - Unified visual component for lead stage display
 * 
 * Single source of truth for stage colors, icons, and behavior.
 * Use this component everywhere a stage badge is needed.
 */

'use client'

import { LeadStage, HighIntentSubStage, AUTO_ASSIGNED_STAGES } from '@/types'

interface StageBadgeProps {
  stage: LeadStage | null | undefined
  subStage?: HighIntentSubStage | string | null
  isAuto?: boolean // Show "Auto" indicator for system-assigned stages
  isOverridden?: boolean // Show "Manual" indicator
  size?: 'sm' | 'md' | 'lg'
  showTooltip?: boolean
  onClick?: () => void
  className?: string
}

// Stage configuration - single source of truth for visual styling
const STAGE_CONFIG: Record<LeadStage, {
  label: string
  color: string
  bgColor: string
  borderColor: string
  icon: string
  description: string
}> = {
  'New': {
    label: 'New',
    color: '#3b82f6', // blue-500
    bgColor: 'rgba(59, 130, 246, 0.1)',
    borderColor: 'rgba(59, 130, 246, 0.3)',
    icon: '●',
    description: 'Fresh lead, no significant interaction',
  },
  'Engaged': {
    label: 'Engaged',
    color: '#06b6d4', // cyan-500
    bgColor: 'rgba(6, 182, 212, 0.1)',
    borderColor: 'rgba(6, 182, 212, 0.3)',
    icon: '💬',
    description: 'Active chat/conversation',
  },
  'Qualified': {
    label: 'Qualified',
    color: '#eab308', // yellow-500
    bgColor: 'rgba(234, 179, 8, 0.1)',
    borderColor: 'rgba(234, 179, 8, 0.3)',
    icon: '★',
    description: 'Score 31-60, moderate interest',
  },
  'High Intent': {
    label: 'High Intent',
    color: '#f97316', // orange-500
    bgColor: 'rgba(249, 115, 22, 0.1)',
    borderColor: 'rgba(249, 115, 22, 0.3)',
    icon: '🔥',
    description: 'Score 61-85, strong buying signals',
  },
  'Booking Made': {
    label: 'Booking Made',
    color: '#22c55e', // green-500
    bgColor: 'rgba(34, 197, 94, 0.1)',
    borderColor: 'rgba(34, 197, 94, 0.3)',
    icon: '📅',
    description: 'Call booked or score 86-100',
  },
  'Converted': {
    label: 'Converted',
    color: '#059669', // emerald-600
    bgColor: 'rgba(5, 150, 105, 0.15)',
    borderColor: 'rgba(5, 150, 105, 0.4)',
    icon: '✓',
    description: 'Customer converted',
  },
  'Closed Lost': {
    label: 'Closed Lost',
    color: '#ef4444', // red-500
    bgColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    icon: '✕',
    description: 'Lead no longer viable',
  },
  'In Sequence': {
    label: 'In Sequence',
    color: '#a855f7', // purple-500
    bgColor: 'rgba(168, 85, 247, 0.1)',
    borderColor: 'rgba(168, 85, 247, 0.3)',
    icon: '↻',
    description: 'Automated follow-up active (score < 61)',
  },
  'Cold': {
    label: 'Cold',
    color: '#64748b', // slate-500
    bgColor: 'rgba(100, 116, 139, 0.1)',
    borderColor: 'rgba(100, 116, 139, 0.3)',
    icon: '❄',
    description: 'Dormant lead, no active follow-up',
  },
}

// Sub-stage configuration for High Intent
const SUB_STAGE_CONFIG: Record<HighIntentSubStage, {
  label: string
  color: string
  bgColor: string
}> = {
  'proposal': {
    label: 'Proposal',
    color: '#f97316',
    bgColor: 'rgba(249, 115, 22, 0.15)',
  },
  'negotiation': {
    label: 'Negotiation',
    color: '#ea580c',
    bgColor: 'rgba(234, 88, 12, 0.15)',
  },
  'on-hold': {
    label: 'On Hold',
    color: '#94a3b8',
    bgColor: 'rgba(148, 163, 184, 0.15)',
  },
}

// Size configurations
const SIZE_CONFIG = {
  sm: {
    padding: '2px 8px',
    fontSize: '10px',
    iconSize: '10px',
    subStagePadding: '1px 6px',
    subStageFontSize: '9px',
  },
  md: {
    padding: '4px 12px',
    fontSize: '12px',
    iconSize: '12px',
    subStagePadding: '2px 8px',
    subStageFontSize: '10px',
  },
  lg: {
    padding: '6px 16px',
    fontSize: '14px',
    iconSize: '14px',
    subStagePadding: '3px 10px',
    subStageFontSize: '11px',
  },
}

/**
 * Check if a stage is typically auto-assigned by the AI
 */
export function isAutoAssignedStage(stage: LeadStage | null | undefined): boolean {
  if (!stage) return false
  return AUTO_ASSIGNED_STAGES.includes(stage)
}

/**
 * Get stage configuration
 */
export function getStageConfig(stage: LeadStage | null | undefined) {
  if (!stage) return STAGE_CONFIG['New']
  return STAGE_CONFIG[stage] || STAGE_CONFIG['New']
}

/**
 * StageBadge Component
 */
export default function StageBadge({
  stage,
  subStage,
  isAuto,
  isOverridden,
  size = 'md',
  showTooltip = true,
  onClick,
  className = '',
}: StageBadgeProps) {
  const config = getStageConfig(stage)
  const sizeStyles = SIZE_CONFIG[size]
  
  // Determine if we should show auto indicator
  const showAutoIndicator = isAuto !== undefined 
    ? isAuto 
    : (stage && isAutoAssignedStage(stage) && !isOverridden)
  
  // Determine tooltip content
  const tooltipContent = showTooltip
    ? `${config.description}${isOverridden ? ' (Manually overridden)' : ''}`
    : undefined

  return (
    <div 
      className={`inline-flex items-center gap-1.5 ${className}`}
      title={tooltipContent}
    >
      {/* Main Stage Badge */}
      <span
        onClick={onClick}
        className={`
          inline-flex items-center gap-1.5 rounded-full font-medium
          border transition-all duration-200
          ${onClick ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}
        `}
        style={{
          padding: sizeStyles.padding,
          fontSize: sizeStyles.fontSize,
          color: config.color,
          backgroundColor: config.bgColor,
          borderColor: config.borderColor,
        }}
      >
        {/* Stage Icon */}
        <span style={{ fontSize: sizeStyles.iconSize }}>
          {config.icon}
        </span>
        
        {/* Stage Label */}
        <span>{config.label}</span>
        
        {/* Auto/Manual Indicator */}
        {showAutoIndicator && (
          <span 
            className="ml-0.5 px-1 rounded text-[8px] font-normal uppercase tracking-wider"
            style={{
              backgroundColor: 'rgba(0,0,0,0.1)',
              color: config.color,
            }}
          >
            Auto
          </span>
        )}
        {isOverridden && (
          <span 
            className="ml-0.5 px-1 rounded text-[8px] font-normal uppercase tracking-wider"
            style={{
              backgroundColor: 'rgba(0,0,0,0.1)',
              color: config.color,
            }}
          >
            Manual
          </span>
        )}
      </span>
      
      {/* Sub-Stage Badge (only for High Intent) */}
      {stage === 'High Intent' && subStage && SUB_STAGE_CONFIG[subStage as HighIntentSubStage] && (
        <span
          className="inline-flex items-center rounded-full font-medium"
          style={{
            padding: sizeStyles.subStagePadding,
            fontSize: sizeStyles.subStageFontSize,
            color: SUB_STAGE_CONFIG[subStage as HighIntentSubStage].color,
            backgroundColor: SUB_STAGE_CONFIG[subStage as HighIntentSubStage].bgColor,
          }}
        >
          {SUB_STAGE_CONFIG[subStage as HighIntentSubStage].label}
        </span>
      )}
    </div>
  )
}

/**
 * StageBadgeWithPulse - For "In Sequence" to show active automation
 */
export function StageBadgeWithPulse({
  stage,
  ...props
}: Omit<StageBadgeProps, 'isAuto'>) {
  const isInSequence = stage === 'In Sequence'
  
  if (!isInSequence) {
    return <StageBadge stage={stage} {...props} />
  }
  
  return (
    <div className="relative inline-flex">
      {/* Pulse animation ring */}
      <span className="absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-20 animate-ping" />
      
      <StageBadge 
        stage={stage} 
        {...props} 
        className={`relative ${props.className || ''}`}
      />
    </div>
  )
}

/**
 * CompactStageBadge - Icon only, for table cells
 */
export function CompactStageBadge({
  stage,
  showTooltip = true,
  onClick,
  className = '',
}: {
  stage: LeadStage | null | undefined
  showTooltip?: boolean
  onClick?: () => void
  className?: string
}) {
  const config = getStageConfig(stage)
  
  return (
    <span
      onClick={onClick}
      className={`
        inline-flex items-center justify-center w-6 h-6 rounded-full
        text-xs font-medium border transition-all duration-200
        ${onClick ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}
        ${className}
      `}
      style={{
        color: config.color,
        backgroundColor: config.bgColor,
        borderColor: config.borderColor,
      }}
      title={showTooltip ? config.description : undefined}
    >
      {config.icon}
    </span>
  )
}
