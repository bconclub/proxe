'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  MdTouchApp,
  MdMessage,
  MdChat,
  MdTrendingUp,
  MdEvent,
  MdPhoneMissed,
  MdVideocam,
  MdDescription,
  MdCheckCircle,
  MdArrowDownward,
  MdWhatsapp,
  MdPhoneInTalk,
  MdSchedule,
  MdWarning,
  MdExpandMore,
  MdExpandLess,
  MdAdd,
  MdSync,
  MdInfo,
  MdEdit,
  MdArrowForward,
  MdCircle,
} from 'react-icons/md'

import { 
  JOURNEY_STAGES,
  STAGE_ORDER,
  getStage,
  getToneColor,
  getTemplateSlotsForStage,
  isSlotApplicable,
  JourneyStageId,
  Channel,
  TemplateStatus,
} from '@/lib/constants/flowStages'

// ============================================================================
// TYPES
// ============================================================================

interface LeadCounts {
  [stageId: string]: number
}

interface CoverageData {
  totalSlots: number
  filledSlots: number
  approvedSlots: number
  pendingSlots: number
  emptySlots: number
  coverage: number
}

interface StageCoverage {
  [stageId: string]: CoverageData
}

interface TemplateData {
  id: string
  stage: string
  day: number
  channel: string
  variant: string
  meta_template_name: string
  meta_status: 'pending' | 'approved' | 'rejected'
  content: string
}

interface SlotAssignment {
  template?: TemplateData
  status: TemplateStatus
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function FlowsPage() {
  const [leadCounts, setLeadCounts] = useState<LeadCounts>({})
  const [coverage, setCoverage] = useState<StageCoverage>({})
  const [templates, setTemplates] = useState<TemplateData[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [expandedStage, setExpandedStage] = useState<JourneyStageId | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<{
    stageId: JourneyStageId
    day: number
    channel: Channel
  } | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      
      // Fetch stats (includes lead counts + coverage)
      const statsRes = await fetch('/api/dashboard/flows/stats')
      const statsData = await statsRes.json()
      
      if (statsData.success) {
        setLeadCounts(statsData.stats.leadCounts || {})
        setCoverage(statsData.stats.coverageByStage || {})
      }

      // Fetch all templates
      const templatesRes = await fetch('/api/dashboard/flows/templates')
      const templatesData = await templatesRes.json()
      
      if (templatesData.success) {
        // Flatten templates from grouped format
        const allTemplates: TemplateData[] = []
        Object.values(templatesData.templates || {}).forEach((stageTemplates: any) => {
          allTemplates.push(...stageTemplates)
        })
        setTemplates(allTemplates)
      }
    } catch (err) {
      console.error('Failed to fetch flow data:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  const handleSync = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/dashboard/flows/sync-meta', { method: 'POST' })
      if (res.ok) await fetchData()
    } catch (err) {
      console.error('Sync failed:', err)
    } finally {
      setSyncing(false)
    }
  }

  const getSlotAssignment = (stageId: JourneyStageId, day: number, channel: Channel): SlotAssignment => {
    const template = templates.find(t => 
      t.stage === stageId && t.day === day && t.channel === channel
    )
    
    if (!template) return { status: 'empty' }
    return { template, status: template.meta_status }
  }

  const getTotalCoverage = (): number => {
    const stages = JOURNEY_STAGES.filter(s => !s.isTerminal)
    const totalSlots = stages.reduce((sum, s) => sum + (coverage[s.id]?.totalSlots || 0), 0)
    const approvedSlots = stages.reduce((sum, s) => sum + (coverage[s.id]?.approvedSlots || 0), 0)
    return totalSlots > 0 ? Math.round((approvedSlots / totalSlots) * 100) : 0
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ color: 'var(--text-secondary)' }}>Loading flow builder...</div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 8px 0', color: 'var(--text-primary)' }}>
          Customer Journey Flows
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>
          Configure follow-up templates for each journey stage
        </p>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 32, flexWrap: 'wrap', justifyContent: 'center' }}>
        <StatCard
          label="Total Leads"
          value={Object.values(leadCounts).reduce((a, b) => a + b, 0)}
          icon={<MdInfo size={24} />}
          color="#3b82f6"
        />
        <StatCard
          label="Template Coverage"
          value={`${getTotalCoverage()}%`}
          icon={<MdCheckCircle size={24} />}
          color={getTotalCoverage() >= 80 ? '#22c55e' : getTotalCoverage() >= 50 ? '#f59e0b' : '#ef4444'}
        />
        <StatCard
          label="Stages Configured"
          value={`${Object.values(coverage).filter(c => c.coverage > 0).length}/8`}
          icon={<MdSchedule size={24} />}
          color="#8b5cf6"
        />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 32 }}>
        <button
          onClick={handleSync}
          disabled={syncing}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
            background: 'var(--bg-secondary)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            color: 'var(--text-primary)',
            fontSize: 14,
            cursor: syncing ? 'not-allowed' : 'pointer',
            opacity: syncing ? 0.6 : 1,
          }}
        >
          <MdSync size={18} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
          {syncing ? 'Syncing...' : 'Sync with Meta'}
        </button>
      </div>

      {/* 9 Stage Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {STAGE_ORDER.map((stageId, index) => {
          const stage = getStage(stageId)
          const isExpanded = expandedStage === stageId
          const stageCoverage = coverage[stageId]
          
          return (
            <StageCard
              key={stageId}
              stage={stage}
              leadCount={leadCounts[stageId] || 0}
              coverage={stageCoverage}
              isExpanded={isExpanded}
              isLast={index === STAGE_ORDER.length - 1}
              hasBranch={stageId === 'booking_made'}
              onToggle={() => setExpandedStage(isExpanded ? null : stageId)}
              onSlotClick={(day, channel) => setSelectedSlot({ stageId, day, channel })}
              getSlotAssignment={getSlotAssignment}
            />
          )
        })}
      </div>

      {/* Assignment Modal */}
      {selectedSlot && (
        <SlotAssignmentModal
          slot={selectedSlot}
          existingTemplate={getSlotAssignment(selectedSlot.stageId, selectedSlot.day, selectedSlot.channel).template}
          onClose={() => setSelectedSlot(null)}
          onSaved={fetchData}
        />
      )}
    </div>
  )
}

// ============================================================================
// STAGE CARD
// ============================================================================

interface StageCardProps {
  stage: ReturnType<typeof getStage>
  leadCount: number
  coverage?: CoverageData
  isExpanded: boolean
  isLast: boolean
  hasBranch?: boolean
  onToggle: () => void
  onSlotClick: (day: number, channel: Channel) => void
  getSlotAssignment: (stageId: JourneyStageId, day: number, channel: Channel) => SlotAssignment
}

function StageCard({
  stage,
  leadCount,
  coverage,
  isExpanded,
  isLast,
  hasBranch,
  onToggle,
  onSlotClick,
  getSlotAssignment,
}: StageCardProps) {
  const Icon = stage.icon
  const toneStyle = getToneColor(stage.tone)
  const gridDays = stage.gridDays
  
  // Get unique channels for this stage
  const channels = stage.channels

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Card */}
      <div
        style={{
          width: '100%',
          background: 'var(--bg-secondary, rgba(255,255,255,0.02))',
          border: `2px solid ${isExpanded ? stage.color : 'rgba(255,255,255,0.08)'}`,
          borderRadius: 16,
          overflow: 'hidden',
          transition: 'all 0.2s ease',
        }}
      >
        {/* Header */}
        <div
          onClick={onToggle}
          style={{
            padding: '20px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            cursor: 'pointer',
            background: isExpanded ? `${stage.color}08` : 'transparent',
          }}
        >
          {/* Icon */}
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: `${stage.color}20`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: stage.color,
            }}
          >
            <Icon size={24} />
          </div>

          {/* Info */}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                {stage.name}
              </h3>
              {/* Lead Count Badge */}
              <span
                style={{
                  padding: '4px 12px',
                  background: leadCount > 0 ? `${stage.color}30` : 'rgba(255,255,255,0.06)',
                  color: leadCount > 0 ? stage.color : 'var(--text-muted)',
                  borderRadius: 20,
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                {leadCount} leads
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
              {stage.description}
            </p>
          </div>

          {/* Coverage Indicator */}
          {!stage.isTerminal && coverage && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 16px',
                background: coverage.coverage >= 80 
                  ? 'rgba(34, 197, 94, 0.15)' 
                  : coverage.coverage >= 50 
                  ? 'rgba(245, 158, 11, 0.15)' 
                  : 'rgba(239, 68, 68, 0.15)',
                borderRadius: 8,
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: coverage.coverage >= 80 ? '#22c55e' : coverage.coverage >= 50 ? '#f59e0b' : '#ef4444',
                }}
              >
                {coverage.coverage}%
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>coverage</span>
            </div>
          )}

          {/* Expand Icon */}
          <div style={{ color: 'var(--text-muted)' }}>
            {isExpanded ? <MdExpandLess size={28} /> : <MdExpandMore size={28} />}
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && !stage.isTerminal && (
          <div style={{ padding: '0 24px 24px' }}>
            {/* Timing Grid */}
            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `120px repeat(${gridDays.length}, 1fr)`,
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <div></div>
                {gridDays.map(day => (
                  <div
                    key={day}
                    style={{
                      textAlign: 'center',
                      padding: '8px',
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      background: 'rgba(255,255,255,0.04)',
                      borderRadius: 6,
                    }}
                  >
                    Day {day}
                  </div>
                ))}
              </div>

              {/* Channel Rows */}
              {channels.map(channel => (
                <div
                  key={channel}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `120px repeat(${gridDays.length}, 1fr)`,
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  {/* Channel Label */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '8px 12px',
                      fontSize: 13,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {channel === 'whatsapp' ? <MdWhatsapp size={16} /> : <MdPhoneInTalk size={16} />}
                    {channel === 'whatsapp' ? 'WhatsApp' : 'Voice'}
                  </div>

                  {/* Slot Status */}
                  {gridDays.map(day => {
                    const isApplicable = isSlotApplicable(stage.id, day, channel)
                    const assignment = isApplicable 
                      ? getSlotAssignment(stage.id, day, channel)
                      : { status: 'empty' as TemplateStatus }

                    return (
                      <SlotCell
                        key={`${day}-${channel}`}
                        day={day}
                        channel={channel}
                        isApplicable={isApplicable}
                        assignment={assignment}
                        onClick={() => isApplicable && onSlotClick(day, channel)}
                      />
                    )
                  })}
                </div>
              ))}
            </div>

            {/* Legend */}
            <div
              style={{
                display: 'flex',
                gap: 16,
                padding: '12px 16px',
                background: 'rgba(255,255,255,0.03)',
                borderRadius: 8,
                fontSize: 12,
                color: 'var(--text-muted)',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <StatusDot color="#22c55e" /> Approved
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <StatusDot color="#f59e0b" /> Pending
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <StatusDot color="#ef4444" /> Rejected
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <StatusDot color="#6b7280" /> Empty
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Connector Arrow */}
      {!isLast && (
        <div style={{ position: 'relative', height: 40, display: 'flex', alignItems: 'center' }}>
          {/* Main flow line */}
          <div
            style={{
              width: 2,
              height: 40,
              background: hasBranch ? 'transparent' : 'rgba(255,255,255,0.1)',
              borderLeft: hasBranch ? '2px dashed rgba(255,255,255,0.2)' : 'none',
            }}
          />
          
          {/* Arrow */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              color: 'rgba(255,255,255,0.3)',
            }}
          >
            <MdArrowDownward size={20} />
          </div>

          {/* Branch indicator for Booking Made */}
          {hasBranch && (
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: 0,
                transform: 'translateX(-50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                fontSize: 11,
                color: 'var(--text-muted)',
              }}
            >
              <span>branches to</span>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <span style={{ color: '#ef4444' }}>No Show</span>
                <span>or</span>
                <span style={{ color: '#ec4899' }}>Demo</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// SLOT CELL
// ============================================================================

interface SlotCellProps {
  day: number
  channel: Channel
  isApplicable: boolean
  assignment: SlotAssignment
  onClick: () => void
}

function SlotCell({ isApplicable, assignment, onClick }: SlotCellProps) {
  if (!isApplicable) {
    return (
      <div
        style={{
          padding: '12px',
          background: 'transparent',
          borderRadius: 8,
        }}
      />
    )
  }

  const statusColors = {
    approved: '#22c55e',
    pending: '#f59e0b',
    rejected: '#ef4444',
    empty: '#6b7280',
  }

  const color = statusColors[assignment.status]
  const hasTemplate = assignment.status !== 'empty'

  return (
    <button
      onClick={onClick}
      style={{
        padding: '12px',
        background: hasTemplate ? `${color}15` : 'rgba(255,255,255,0.04)',
        border: `2px solid ${hasTemplate ? color : 'rgba(255,255,255,0.1)'}`,
        borderRadius: 8,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        transition: 'all 0.15s ease',
      }}
    >
      <StatusDot color={color} size={12} />
      {hasTemplate ? (
        <span
          style={{
            fontSize: 10,
            color: 'var(--text-secondary)',
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {assignment.template?.meta_template_name?.slice(0, 15) || 'Template'}
        </span>
      ) : (
        <MdAdd size={16} color={color} />
      )}
    </button>
  )
}

function StatusDot({ color, size = 10 }: { color: string; size?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        display: 'inline-block',
        boxShadow: `0 0 8px ${color}60`,
      }}
    />
  )
}

// ============================================================================
// STAT CARD
// ============================================================================

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string
  value: string | number
  icon: React.ReactNode
  color: string
}) {
  return (
    <div
      style={{
        flex: '1 1 0',
        minWidth: 140,
        maxWidth: 200,
        padding: '20px 24px',
        background: 'var(--bg-secondary)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          background: `${color}20`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
      </div>
    </div>
  )
}

// ============================================================================
// SLOT ASSIGNMENT MODAL
// ============================================================================

interface SlotAssignmentModalProps {
  slot: { stageId: JourneyStageId; day: number; channel: Channel }
  existingTemplate?: TemplateData
  onClose: () => void
  onSaved: () => void
}

function SlotAssignmentModal({ slot, existingTemplate, onClose, onSaved }: SlotAssignmentModalProps) {
  const [metaTemplates, setMetaTemplates] = useState<any[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState(existingTemplate?.meta_template_name || '')
  const [content, setContent] = useState(existingTemplate?.content || '')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const stage = getStage(slot.stageId)

  useEffect(() => {
    fetchMetaTemplates()
  }, [])

  const fetchMetaTemplates = async () => {
    try {
      // Fetch from Meta sync endpoint
      const res = await fetch('/api/dashboard/flows/templates')
      const data = await res.json()
      
      if (data.success) {
        // Flatten templates from all stages
        const allTemplates: any[] = []
        Object.values(data.templates || {}).forEach((stageTemplates: any) => {
          allTemplates.push(...stageTemplates)
        })
        setMetaTemplates(allTemplates)
      }
    } catch (err) {
      console.error('Failed to fetch templates:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!selectedTemplate) return
    
    setSaving(true)
    try {
      const res = await fetch('/api/dashboard/flows/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stageId: slot.stageId,
          day: slot.day,
          channel: slot.channel,
          variant: 'A',
          metaTemplateName: selectedTemplate,
          content: content || selectedTemplate,
          brand: 'default',
        }),
      })

      if (res.ok) {
        onSaved()
        onClose()
      } else {
        const err = await res.json()
        alert('Failed to save: ' + (err.error || 'Unknown error'))
      }
    } catch (err) {
      console.error('Save failed:', err)
      alert('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-primary)',
          borderRadius: 16,
          width: '100%',
          maxWidth: 480,
          maxHeight: '80vh',
          overflow: 'auto',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '24px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <h2 style={{ margin: '0 0 4px 0', fontSize: 20, fontWeight: 700 }}>
            Assign Template
          </h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 14 }}>
            {stage.name} • Day {slot.day} • {slot.channel === 'whatsapp' ? 'WhatsApp' : 'Voice'}
          </p>
        </div>

        {/* Content */}
        <div style={{ padding: 24 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>Loading...</div>
          ) : (
            <>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                  Select Meta Template
                </label>
                <select
                  value={selectedTemplate}
                  onChange={e => setSelectedTemplate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    color: 'var(--text-primary)',
                    fontSize: 14,
                  }}
                >
                  <option value="">Select template...</option>
                  {metaTemplates.map((t: any) => (
                    <option key={t.meta_template_name || t.id} value={t.meta_template_name || t.id}>
                      {t.meta_template_name || t.id} ({t.meta_status})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                  Content Preview
                </label>
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    color: 'var(--text-primary)',
                    fontSize: 14,
                    resize: 'vertical',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={handleSave}
                  disabled={!selectedTemplate || saving}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: stage.color,
                    border: 'none',
                    borderRadius: 8,
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: !selectedTemplate || saving ? 'not-allowed' : 'pointer',
                    opacity: !selectedTemplate || saving ? 0.6 : 1,
                  }}
                >
                  {saving ? 'Saving...' : existingTemplate ? 'Update Assignment' : 'Assign Template'}
                </button>
                <button
                  onClick={onClose}
                  style={{
                    padding: '12px 24px',
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 8,
                    color: 'var(--text-secondary)',
                    fontSize: 14,
                  }}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
