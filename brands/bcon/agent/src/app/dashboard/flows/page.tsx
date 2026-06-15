'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  MdArrowBack,
  MdPeople,
  MdAccessTime,
  MdTrendingUp,
  MdSkipNext,
  MdRemoveCircleOutline,
  MdPause,
  MdChat,
  MdEvent,
  MdPhoneCallback,
  MdPhoneMissed,
  MdReplay,
  MdAutorenew,
  MdWbSunny,
  MdTimeline,
  MdTouchApp,
  MdMessage,
  MdTrendingUp as MdTrending,
  MdVideocam,
  MdDescription,
  MdCheckCircle,
  MdExpandMore,
  MdExpandLess,
  MdAdd,
  MdCircle,
  MdSettings,
  MdClose,
} from 'react-icons/md'
import LeadDetailsModal from '@/components/dashboard/LeadDetailsModal'

// ── Types ─────────────────────────────────────────────────────────

interface FlowSummary {
  id: string
  name: string
  leadCount: number
  lastActivity: string | null
  successRate: number
  respondedCount: number
  steps: { name: string; order: number }[]
}

interface BoardLead {
  lead_id: string
  lead_name: string
  lead_phone: string
  task_id: string | null
  status: string
  scheduled_at: string | null
  completed_at: string | null
  responded: boolean
  all_task_ids: string[]
}

interface BoardStep {
  name: string
  order: number
  leads: BoardLead[]
}

interface StageStats {
  id: string
  name: string
  leadCount: number
  coverage: number
}

interface TemplateInfo {
  id?: string
  stage: string
  day: number
  channel: string
  status: string
  variant: string
  templateName: string
  content?: string
  isActive?: boolean
}

// ── 9 Stage Config ────────────────────────────────────────────────

const STAGE_CONFIG: Record<string, { 
  icon: React.ReactNode
  color: string
  bg: string
  timing: string
  days: number[]
  channels: string[]
}> = {
  one_touch: {
    icon: <MdTouchApp size={22} />,
    color: '#22c55e',
    bg: 'rgba(34,197,94,0.10)',
    timing: 'Day 1, 3, 7, 30',
    days: [1, 3, 7, 30],
    channels: ['whatsapp'],
  },
  low_touch: {
    icon: <MdMessage size={22} />,
    color: '#3b82f6',
    bg: 'rgba(59,130,246,0.10)',
    timing: 'Day 1, 3, 7',
    days: [1, 3, 7],
    channels: ['whatsapp', 'voice'],
  },
  engaged: {
    icon: <MdChat size={22} />,
    color: '#3b82f6',
    bg: 'rgba(59,130,246,0.10)',
    timing: 'Day 3, 7, 30',
    days: [3, 7, 30],
    channels: ['whatsapp', 'voice'],
  },
  high_intent: {
    icon: <MdTrending size={22} />,
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.10)',
    timing: 'Day 1, 3, 7',
    days: [1, 3, 7],
    channels: ['whatsapp', 'voice'],
  },
  booking_made: {
    icon: <MdEvent size={22} />,
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.10)',
    timing: '24h, 30m, Day 7',
    days: [1, 7],
    channels: ['whatsapp', 'voice'],
  },
  no_show: {
    icon: <MdPhoneMissed size={22} />,
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.10)',
    timing: 'Immediate, Day 1, 3, 7',
    days: [1, 3, 7],
    channels: ['whatsapp', 'voice'],
  },
  demo_taken: {
    icon: <MdVideocam size={22} />,
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.10)',
    timing: 'Day 1, 3, 7',
    days: [1, 3, 7],
    channels: ['whatsapp', 'voice'],
  },
  proposal_sent: {
    icon: <MdDescription size={22} />,
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.10)',
    timing: 'Day 1, 3, 7',
    days: [1, 3, 7],
    channels: ['whatsapp', 'voice'],
  },
  converted: {
    icon: <MdCheckCircle size={22} />,
    color: '#10b981',
    bg: 'rgba(16,185,129,0.10)',
    timing: 'Terminal',
    days: [],
    channels: [],
  },
}

const STAGE_ORDER = [
  'one_touch',
  'low_touch',
  'engaged',
  'high_intent',
  'booking_made',
  'no_show',
  'demo_taken',
  'proposal_sent',
  'converted',
]

// ── Flow visual config (legacy) ───────────────────────────────────

const FLOW_STYLE: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  new_lead_outreach:  { icon: <MdTimeline size={20} />,       color: '#3b82f6', bg: 'rgba(59,130,246,0.10)' },
  active_conversation:{ icon: <MdChat size={20} />,            color: '#22c55e', bg: 'rgba(34,197,94,0.10)' },
  booking_made:       { icon: <MdEvent size={20} />,           color: '#8b5cf6', bg: 'rgba(139,92,246,0.10)' },
  post_call:          { icon: <MdPhoneCallback size={20} />,   color: '#06b6d4', bg: 'rgba(6,182,212,0.10)' },
  rnr:                { icon: <MdPhoneMissed size={20} />,     color: '#ef4444', bg: 'rgba(239,68,68,0.10)' },
  follow_up_sequence: { icon: <MdReplay size={20} />,          color: '#f97316', bg: 'rgba(249,115,22,0.10)' },
  re_engagement:      { icon: <MdAutorenew size={20} />,       color: '#ec4899', bg: 'rgba(236,72,153,0.10)' },
  morning_briefing:   { icon: <MdWbSunny size={20} />,         color: '#eab308', bg: 'rgba(234,179,8,0.10)' },
}

const STATUS_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  pending:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: 'Pending' },
  queued:    { color: '#a855f7', bg: 'rgba(168,85,247,0.12)', label: 'Awaiting' },
  completed: { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  label: 'Sent' },
  failed:    { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  label: 'Failed' },
  responded: { color: '#22c55e', bg: 'rgba(34,197,94,0.20)',  label: 'Responded' },
  active:    { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', label: 'Active' },
  approved:  { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  label: 'Approved' },
  rejected:  { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  label: 'Rejected' },
  empty:     { color: '#6b7280', bg: 'rgba(107,114,128,0.12)', label: 'Empty' },
}

// ── Funnel Section Component ──────────────────────────────────────

interface FunnelSectionProps {
  title: string
  color: string
  stageIds: string[]
  stageStats: StageStats[]
  stageConfig: Record<string, { icon: React.ReactNode; color: string; bg: string; timing: string; days: number[]; channels: string[] }>
  expandedStage: string | null
  setExpandedStage: (stage: string | null) => void
  getSlotStatus: (stageId: string, day: number, channel: string) => string
  templates: TemplateInfo[]
  onAddTemplate: (stageId: string) => void
  onEditTemplate: (tpl: TemplateInfo) => void
  onDeleteTemplate: (id: string) => void
  onSetStatus: (id: string, status: string) => void
}

function FunnelSection({
  title,
  color,
  stageIds,
  stageStats,
  stageConfig,
  expandedStage,
  setExpandedStage,
  getSlotStatus,
  templates,
  onAddTemplate,
  onEditTemplate,
  onDeleteTemplate,
  onSetStatus,
}: FunnelSectionProps) {
  const stages = stageIds
    .map((id) => ({ id, stage: stageStats.find((s) => s.id === id) }))
    .filter((item): item is { id: string; stage: StageStats } => !!item.stage)

  if (stages.length === 0) return null

  return (
    <div style={{ marginBottom: 32 }}>
      {/* Section Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 16,
          padding: '12px 16px',
          background: `${color}15`,
          borderRadius: 12,
          borderLeft: `4px solid ${color}`,
        }}
      >
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: color,
          }}
        />
        <span
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: color,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          {title}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text-secondary)',
          }}
        >
          {stages.reduce((sum, s) => sum + s.stage.leadCount, 0)} leads
        </span>
      </div>

      {/* Stage Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {stages.map(({ id: stageId, stage }) => {
          const config = stageConfig[stageId]
          const isExpanded = expandedStage === stageId

          return (
            <div
              key={stageId}
              style={{
                background: 'var(--bg-secondary)',
                border: `2px solid ${isExpanded ? config.color : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 16,
                overflow: 'hidden',
                transition: 'all 0.2s ease',
              }}
            >
              {/* Header */}
              <div
                onClick={() => setExpandedStage(isExpanded ? null : stageId)}
                style={{
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  cursor: 'pointer',
                  background: isExpanded ? `${config.color}08` : 'transparent',
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: config.bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: config.color,
                  }}
                >
                  {config.icon}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 2 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {stage.name}
                    </h3>
                    <span
                      style={{
                        padding: '3px 10px',
                        background: stage.leadCount > 0 ? `${config.color}30` : 'rgba(255,255,255,0.06)',
                        color: stage.leadCount > 0 ? config.color : 'var(--text-muted)',
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {stage.leadCount} leads
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>{config.timing}</p>
                </div>

                {/* Coverage */}
                {!stageId.includes('converted') && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 12px',
                      background:
                        stage.coverage >= 80
                          ? 'rgba(34, 197, 94, 0.15)'
                          : stage.coverage >= 50
                            ? 'rgba(245, 158, 11, 0.15)'
                            : 'rgba(239, 68, 68, 0.15)',
                      borderRadius: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: stage.coverage >= 80 ? '#22c55e' : stage.coverage >= 50 ? '#f59e0b' : '#ef4444',
                      }}
                    >
                      {stage.coverage}%
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>coverage</span>
                  </div>
                )}

                <div style={{ color: 'var(--text-muted)' }}>
                  {isExpanded ? <MdExpandLess size={24} /> : <MdExpandMore size={24} />}
                </div>
              </div>

              {/* Expanded Template Grid */}
              {isExpanded && stageId !== 'converted' && (
                <div style={{ padding: '0 20px 20px' }}>
                  <div style={{ marginBottom: 16 }}>
                    {/* Day Headers */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: `100px repeat(${config.days.length}, 1fr)`,
                        gap: 8,
                        marginBottom: 8,
                      }}
                    >
                      <div></div>
                      {config.days.map((day) => (
                        <div
                          key={day}
                          style={{
                            textAlign: 'center',
                            padding: '6px',
                            fontSize: 11,
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
                    {config.channels.map((channel) => (
                      <div
                        key={channel}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: `100px repeat(${config.days.length}, 1fr)`,
                          gap: 8,
                          marginBottom: 8,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '6px 10px',
                            fontSize: 12,
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {channel === 'whatsapp' ? '💬' : '📞'}
                          {channel === 'whatsapp' ? 'WhatsApp' : 'Voice'}
                        </div>

                        {config.days.map((day) => {
                          const status = getSlotStatus(stageId, day, channel)
                          const colors: Record<string, string> = {
                            approved: '#22c55e',
                            pending: '#f59e0b',
                            rejected: '#ef4444',
                            empty: '#6b7280',
                          }
                          const slotColor = colors[status] || '#6b7280'

                          return (
                            <button
                              key={`${day}-${channel}`}
                              style={{
                                padding: '10px',
                                background: status !== 'empty' ? `${slotColor}15` : 'rgba(255,255,255,0.04)',
                                border: `2px solid ${status !== 'empty' ? slotColor : 'rgba(255,255,255,0.1)'}`,
                                borderRadius: 8,
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: 6,
                              }}
                            >
                              <span
                                style={{
                                  width: 10,
                                  height: 10,
                                  borderRadius: '50%',
                                  background: slotColor,
                                  boxShadow: `0 0 8px ${slotColor}60`,
                                }}
                              />
                              <span
                                style={{
                                  fontSize: 9,
                                  color: 'var(--text-muted)',
                                  textTransform: 'capitalize',
                                }}
                              >
                                {status}
                              </span>
                            </button>
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
                      padding: '10px 14px',
                      background: 'rgba(255,255,255,0.03)',
                      borderRadius: 8,
                      fontSize: 11,
                      color: 'var(--text-muted)',
                    }}
                  >
                    <LegendItem color="#22c55e" label="Approved" />
                    <LegendItem color="#f59e0b" label="Pending" />
                    <LegendItem color="#ef4444" label="Rejected" />
                    <LegendItem color="#6b7280" label="Empty" />
                  </div>

                  {/* Templates manager */}
                  {(() => {
                    const stageTemplates = templates.filter((t) => t.stage === stageId)
                    return (
                      <div style={{ marginTop: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>
                            {stageTemplates.length} template{stageTemplates.length === 1 ? '' : 's'}
                          </span>
                          <button
                            type="button"
                            onClick={() => onAddTemplate(stageId)}
                            style={{ ...flowButtonStyle('var(--button-bg)', 'var(--text-button)'), minHeight: 32, fontSize: 13, padding: '0 12px' }}
                          >
                            <MdAdd size={16} /> Add
                          </button>
                        </div>
                        {stageTemplates.length === 0 ? (
                          <div style={{ border: '1px dashed var(--border-primary)', borderRadius: 10, padding: '20px 16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                            No templates for this stage yet. Click <strong style={{ color: 'var(--text-primary)' }}>Add</strong> to create one.
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {stageTemplates.map((t, i) => {
                              const st = STATUS_STYLE[t.status] || STATUS_STYLE.empty
                              return (
                                <div key={t.id || i} style={{ border: '1px solid var(--border-primary)', borderRadius: 10, padding: 12, background: 'var(--bg-tertiary)' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                      <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Day {t.day}</span>
                                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t.channel === 'whatsapp' ? '💬 WhatsApp' : '📞 Voice'}</span>
                                      {t.variant && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· Variant {t.variant}</span>}
                                    </div>
                                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, color: st.color, background: st.bg }}>{st.label}</span>
                                  </div>
                                  {(t.templateName || t.content) && (
                                    <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                      {t.templateName ? <strong style={{ color: 'var(--text-primary)' }}>{t.templateName}: </strong> : null}{t.content}
                                    </p>
                                  )}
                                  <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                                    <button type="button" onClick={() => onEditTemplate(t)} style={miniBtn('var(--accent-primary)')}>Edit</button>
                                    {t.id && t.status !== 'approved' && <button type="button" onClick={() => onSetStatus(t.id!, 'approved')} style={miniBtn('#22c55e')}>Approve</button>}
                                    {t.id && t.status !== 'rejected' && <button type="button" onClick={() => onSetStatus(t.id!, 'rejected')} style={miniBtn('#ef4444')}>Reject</button>}
                                    {t.id && <button type="button" onClick={() => { if (confirm('Delete this template?')) onDeleteTemplate(t.id!) }} style={miniBtn('var(--text-secondary)')}>Delete</button>}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 0) {
    const future = -diff
    const m = Math.floor(future / 60000)
    const h = Math.floor(m / 60)
    const d = Math.floor(h / 24)
    if (d > 0) return `In ${d}d ${h % 24}h`
    if (h > 0) return `In ${h}h ${m % 60}m`
    return `In ${m}m`
  }
  const m = Math.floor(diff / 60000)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (d > 0) return `${d}d ago`
  if (h > 0) return `${h}h ago`
  if (m > 0) return `${m}m ago`
  return 'Just now'
}

function countdown(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = new Date(dateStr).getTime() - Date.now()
  if (diff <= 0) return 'Now'
  const m = Math.floor(diff / 60000)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (d > 0) return `In ${d}d ${h % 24}h`
  if (h > 0) return `In ${h}h ${m % 60}m`
  return `In ${m}m`
}

// ── Main Page ─────────────────────────────────────────────────────

export default function FlowsPage() {
  const [view, setView] = useState<'overview' | 'board' | 'stages'>('stages')
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null)
  const [selectedFlowName, setSelectedFlowName] = useState('')
  const [flows, setFlows] = useState<FlowSummary[]>([])
  const [board, setBoard] = useState<{ flowId: string; steps: BoardStep[] } | null>(null)
  const [stageStats, setStageStats] = useState<StageStats[]>([])
  const [templates, setTemplates] = useState<TemplateInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [boardLoading, setBoardLoading] = useState(false)
  const [selectedLead, setSelectedLead] = useState<any>(null)
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [expandedStage, setExpandedStage] = useState<string | null>(null)
  // Create Flow / edit template modal + Flow Settings modal
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorTemplate, setEditorTemplate] = useState<TemplateInfo | null>(null)
  const [editorStage, setEditorStage] = useState<string>('low_touch')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [flowError, setFlowError] = useState<string | null>(null)

  // Map 9 stages to legacy 8 flows for backward compatibility
  const mapStagesToFlows = useCallback((stages: StageStats[]): FlowSummary[] => {
    const stageMap = new Map(stages.map(s => [s.id, s]))
    
    return [
      {
        id: 'new_lead_outreach',
        name: 'New Lead Outreach',
        leadCount: stageMap.get('one_touch')?.leadCount || 0,
        lastActivity: null,
        successRate: stageMap.get('one_touch')?.coverage || 0,
        respondedCount: 0,
        steps: [{ name: 'Day 1', order: 1 }, { name: 'Day 3', order: 2 }, { name: 'Day 7', order: 3 }],
      },
      {
        id: 'follow_up_sequence',
        name: 'Follow-up Sequence',
        leadCount: (stageMap.get('low_touch')?.leadCount || 0) + (stageMap.get('engaged')?.leadCount || 0),
        lastActivity: null,
        successRate: Math.round(((stageMap.get('low_touch')?.coverage || 0) + (stageMap.get('engaged')?.coverage || 0)) / 2),
        respondedCount: 0,
        steps: [{ name: 'Day 3', order: 1 }, { name: 'Day 7', order: 2 }, { name: 'Day 30', order: 3 }],
      },
      {
        id: 'active_conversation',
        name: 'Active Conversation',
        leadCount: stageMap.get('high_intent')?.leadCount || 0,
        lastActivity: null,
        successRate: stageMap.get('high_intent')?.coverage || 0,
        respondedCount: 0,
        steps: [{ name: 'High Intent', order: 1 }],
      },
      {
        id: 'booking_made',
        name: 'Booking Made',
        leadCount: stageMap.get('booking_made')?.leadCount || 0,
        lastActivity: null,
        successRate: stageMap.get('booking_made')?.coverage || 0,
        respondedCount: 0,
        steps: [{ name: '24h Before', order: 1 }, { name: '30m Before', order: 2 }],
      },
      {
        id: 'rnr',
        name: 'No Show / RNR',
        leadCount: stageMap.get('no_show')?.leadCount || 0,
        lastActivity: null,
        successRate: stageMap.get('no_show')?.coverage || 0,
        respondedCount: 0,
        steps: [{ name: 'Immediate', order: 1 }, { name: 'Day 1', order: 2 }, { name: 'Day 3', order: 3 }],
      },
      {
        id: 'post_call',
        name: 'Post Demo',
        leadCount: stageMap.get('demo_taken')?.leadCount || 0,
        lastActivity: null,
        successRate: stageMap.get('demo_taken')?.coverage || 0,
        respondedCount: 0,
        steps: [{ name: 'Day 1', order: 1 }, { name: 'Day 3', order: 2 }],
      },
      {
        id: 'proposal_sent',
        name: 'Proposal Sent',
        leadCount: stageMap.get('proposal_sent')?.leadCount || 0,
        lastActivity: null,
        successRate: stageMap.get('proposal_sent')?.coverage || 0,
        respondedCount: 0,
        steps: [{ name: 'Day 1', order: 1 }, { name: 'Day 3', order: 2 }],
      },
      {
        id: 'converted',
        name: 'Converted / Closed',
        leadCount: stageMap.get('converted')?.leadCount || 0,
        lastActivity: null,
        successRate: 100,
        respondedCount: 0,
        steps: [{ name: 'Terminal', order: 1 }],
      },
    ]
  }, [])

  // Fetch legacy flows (kanban view) - uses new stats API
  const fetchFlows = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/flows/stats')
      if (!res.ok) return
      const data = await res.json()
      const mappedFlows = mapStagesToFlows(data.stages || [])
      setFlows(mappedFlows)
    } catch (err) {
      console.error('Failed to fetch flows:', err)
    }
  }, [mapStagesToFlows])

  // Fetch board data - uses new stats API
  const fetchBoard = useCallback(async (fid: string) => {
    setBoardLoading(true)
    try {
      const res = await fetch('/api/dashboard/flows/stats')
      if (!res.ok) return
      const data = await res.json()
      
      // Map stages to flows for legacy compatibility
      const mappedFlows = mapStagesToFlows(data.stages || [])
      setFlows(mappedFlows)
      
      // Build board from stage data
      const stageMap = new Map(data.stages.map((s: StageStats) => [s.id, s]))
      const templates: TemplateInfo[] = data.templates || []
      
      // Map flow ID to stage ID
      const flowToStage: Record<string, string> = {
        new_lead_outreach: 'one_touch',
        follow_up_sequence: 'low_touch',
        active_conversation: 'high_intent',
        booking_made: 'booking_made',
        rnr: 'no_show',
        post_call: 'demo_taken',
        proposal_sent: 'proposal_sent',
        converted: 'converted',
      }
      
      const stageId = flowToStage[fid]
      const stage = stageMap.get(stageId)
      
      if (stage) {
        // Get templates for this stage
        const stageTemplates = templates.filter((t: TemplateInfo) => t.stage === stageId)
        const steps: BoardStep[] = []
        
        // Group templates by day to create steps
        const days = [...new Set(stageTemplates.map(t => t.day))].sort((a, b) => a - b)
        
        if (days.length > 0) {
          for (const day of days) {
            const dayTemplates = stageTemplates.filter(t => t.day === day)
            steps.push({
              name: `Day ${day}`,
              order: day,
              leads: dayTemplates.map((t: TemplateInfo) => ({
                lead_id: `${t.stage}-${t.day}-${t.channel}`,
                lead_name: `${t.channel === 'whatsapp' ? '💬' : '📞'} ${t.templateName || 'Template'}`,
                lead_phone: '',
                task_id: null,
                status: t.status,
                scheduled_at: null,
                completed_at: t.status === 'approved' ? new Date().toISOString() : null,
                responded: false,
                all_task_ids: [],
              })),
            })
          }
        } else {
          // Fallback for stages without templates (like converted)
          steps.push({
            name: 'Leads',
            order: 1,
            leads: [],
          })
        }
        
        setBoard({ flowId: fid, steps })
      }
    } catch (err) {
      console.error('Failed to fetch board:', err)
    } finally {
      setBoardLoading(false)
    }
  }, [mapStagesToFlows])

  // Fetch 9-stage stats
  const fetchStageStats = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/flows/stats')
      if (!res.ok) return
      const data = await res.json()
      setStageStats(data.stages || [])
      setTemplates(data.templates || [])
    } catch (err) {
      console.error('Failed to fetch stage stats:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Quick actions ───────────────────────────────────────────────

  const taskAction = async (taskId: string, action: string, scheduledAt?: string) => {
    try {
      const res = await fetch(`/api/dashboard/tasks/${taskId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, scheduled_at: scheduledAt }),
      })
      return (await res.json()).success
    } catch { return false }
  }

  const handleSkip = async (lead: BoardLead) => {
    if (!lead.task_id) return
    setActionLoading(lead.lead_id)
    await taskAction(lead.task_id, 'cancel')
    if (selectedFlowId) await fetchBoard(selectedFlowId)
    setActionLoading(null)
  }

  const handleRemove = async (lead: BoardLead) => {
    setActionLoading(lead.lead_id)
    for (const tid of lead.all_task_ids) {
      await taskAction(tid, 'cancel')
    }
    if (selectedFlowId) await fetchBoard(selectedFlowId)
    setActionLoading(null)
  }

  const handlePause = async (lead: BoardLead) => {
    setActionLoading(lead.lead_id)
    for (const tid of lead.all_task_ids) {
      await taskAction(tid, 'cancel')
    }
    if (selectedFlowId) await fetchBoard(selectedFlowId)
    setActionLoading(null)
  }

  const handleLeadClick = async (leadId: string) => {
    try {
      const res = await fetch(`/api/dashboard/leads/${leadId}`)
      if (!res.ok) return
      const lead = await res.json()
      setSelectedLead({
        id: lead.id,
        name: lead.customer_name || lead.name || 'Unknown',
        email: lead.email || '',
        phone: lead.customer_phone_normalized || lead.phone || '',
        source: lead.first_touchpoint || lead.last_touchpoint || 'whatsapp',
        first_touchpoint: lead.first_touchpoint || null,
        last_touchpoint: lead.last_touchpoint || null,
        timestamp: lead.created_at || '',
        status: lead.status || null,
        booking_date: lead.unified_context?.web?.booking_date || null,
        booking_time: lead.unified_context?.web?.booking_time || null,
        unified_context: lead.unified_context || null,
        metadata: lead.metadata || {},
        lead_score: lead.lead_score || null,
        lead_stage: lead.lead_stage || null,
        sub_stage: lead.sub_stage || null,
      })
      setIsLeadModalOpen(true)
    } catch (err) {
      console.error('Failed to fetch lead:', err)
    }
  }

  const updateLeadStatus = useCallback(async (leadId: string, newStatus: string) => {
    try {
      await fetch(`/api/dashboard/leads/${leadId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
    } catch {}
  }, [])

  // ── Auto-refresh ────────────────────────────────────────────────

  useEffect(() => {
    fetchFlows()
    fetchStageStats()
    const interval = setInterval(() => {
      fetchFlows()
      fetchStageStats()
    }, 30000)
    return () => clearInterval(interval)
  }, [fetchFlows, fetchStageStats])

  useEffect(() => {
    if (selectedFlowId) {
      fetchBoard(selectedFlowId)
      const interval = setInterval(() => fetchBoard(selectedFlowId), 30000)
      return () => clearInterval(interval)
    }
  }, [selectedFlowId, fetchBoard])

  // ── Get template status for a slot ──────────────────────────────

  const getSlotStatus = (stageId: string, day: number, channel: string): string => {
    const template = templates.find(t =>
      t.stage === stageId && t.day === day && t.channel === channel
    )
    return template?.status || 'empty'
  }

  // ── Template CRUD (Create Flow / Flow Settings modals) ──────────────

  const reloadFlows = useCallback(async () => {
    await Promise.all([fetchStageStats(), fetchFlows()])
  }, [fetchStageStats, fetchFlows])

  const openCreateTemplate = (stageId?: string) => {
    setFlowError(null)
    setEditorTemplate(null)
    setEditorStage(stageId || expandedStage || 'low_touch')
    setEditorOpen(true)
  }

  const openEditTemplate = (tpl: TemplateInfo) => {
    setFlowError(null)
    setEditorTemplate(tpl)
    setEditorStage(tpl.stage)
    setEditorOpen(true)
  }

  const saveTemplate = async (payload: {
    id?: string
    stage: string
    day: number
    channel: string
    variant: string
    templateName: string
    content: string
  }) => {
    setSavingTemplate(true)
    setFlowError(null)
    try {
      const isEdit = !!payload.id
      const res = await fetch('/api/dashboard/flows/templates', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        setFlowError(data.error || 'Failed to save template')
        return false
      }
      setEditorOpen(false)
      setEditorTemplate(null)
      await reloadFlows()
      return true
    } catch {
      setFlowError('Network error while saving')
      return false
    } finally {
      setSavingTemplate(false)
    }
  }

  const setTemplateStatus = async (id: string, meta_status: string) => {
    await fetch('/api/dashboard/flows/templates', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, meta_status }),
    })
    await reloadFlows()
  }

  const deleteTemplate = async (id: string) => {
    await fetch(`/api/dashboard/flows/templates?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    await reloadFlows()
  }

  // ── Loading state ───────────────────────────────────────────────

  if (loading && view === 'stages') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Loading flows...</span>
      </div>
    )
  }

  // ── 9 Stage View ────────────────────────────────────────────────

  if (view === 'stages') {
    const totalLeads = stageStats.reduce((sum, s) => sum + s.leadCount, 0)
    const avgCoverage = stageStats.length > 0 
      ? Math.round(stageStats.reduce((sum, s) => sum + s.coverage, 0) / stageStats.length)
      : 0

    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 0 40px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px 0', color: 'var(--text-primary)' }}>
              Journey Flows
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>
              9-stage follow-up sequence with template coverage
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button type="button" onClick={() => openCreateTemplate()} style={flowButtonStyle('var(--button-bg)', 'var(--text-button)')}>
              <MdAdd size={18} /> Create Flow
            </button>
            <button type="button" onClick={() => setSettingsOpen(true)} style={flowGhostButtonStyle}>
              <MdSettings size={17} /> Flow Settings
            </button>
            <button
              onClick={() => setView('overview')}
              style={{
                padding: '8px 16px',
                background: 'var(--bg-secondary)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: 'var(--text-secondary)',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Legacy View
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 32, flexWrap: 'wrap' }}>
          <StatCard label="Total Leads" value={totalLeads} color="#3b82f6" />
          <StatCard 
            label="Avg Coverage" 
            value={`${avgCoverage}%`} 
            color={avgCoverage >= 80 ? '#22c55e' : avgCoverage >= 50 ? '#f59e0b' : '#ef4444'}
          />
          <StatCard 
            label="Stages Active" 
            value={`${stageStats.filter(s => s.leadCount > 0).length}/9`} 
            color="#8b5cf6"
          />
        </div>

        {/* Funnel Sections */}
        {/* TOP OF FUNNEL */}
        <FunnelSection
          title="TOP"
          color="#3B82F6"
          stageIds={['one_touch', 'low_touch', 'engaged']}
          stageStats={stageStats}
          stageConfig={STAGE_CONFIG}
          expandedStage={expandedStage}
          setExpandedStage={setExpandedStage}
          getSlotStatus={getSlotStatus}
          templates={templates}
          onAddTemplate={openCreateTemplate}
          onEditTemplate={openEditTemplate}
          onDeleteTemplate={deleteTemplate}
          onSetStatus={setTemplateStatus}
        />

        {/* MID FUNNEL */}
        <FunnelSection
          title="MID"
          color="#F59E0B"
          stageIds={['high_intent', 'booking_made', 'no_show']}
          stageStats={stageStats}
          stageConfig={STAGE_CONFIG}
          expandedStage={expandedStage}
          setExpandedStage={setExpandedStage}
          getSlotStatus={getSlotStatus}
          templates={templates}
          onAddTemplate={openCreateTemplate}
          onEditTemplate={openEditTemplate}
          onDeleteTemplate={deleteTemplate}
          onSetStatus={setTemplateStatus}
        />

        {/* BOTTOM FUNNEL */}
        <FunnelSection
          title="BOTTOM"
          color="#22C55E"
          stageIds={['demo_taken', 'proposal_sent', 'converted']}
          stageStats={stageStats}
          stageConfig={STAGE_CONFIG}
          expandedStage={expandedStage}
          setExpandedStage={setExpandedStage}
          getSlotStatus={getSlotStatus}
          templates={templates}
          onAddTemplate={openCreateTemplate}
          onEditTemplate={openEditTemplate}
          onDeleteTemplate={deleteTemplate}
          onSetStatus={setTemplateStatus}
        />

        {editorOpen && (
          <TemplateEditorModal
            template={editorTemplate}
            stageId={editorStage}
            saving={savingTemplate}
            error={flowError}
            onCancel={() => { setEditorOpen(false); setEditorTemplate(null); setFlowError(null) }}
            onSave={saveTemplate}
          />
        )}

        {settingsOpen && (
          <FlowSettingsModal
            stageStats={stageStats}
            templates={templates}
            onClose={() => setSettingsOpen(false)}
            onAddTemplate={(sid) => { setSettingsOpen(false); openCreateTemplate(sid) }}
          />
        )}
      </div>
    )
  }

  // ── Board view (legacy) ─────────────────────────────────────────

  if (view === 'board' && board && selectedFlowId) {
    const flowStyle = FLOW_STYLE[selectedFlowId] || FLOW_STYLE.new_lead_outreach
    const totalLeads = board.steps.reduce((sum, s) => sum + s.leads.length, 0)

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
        {/* Board header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => { setView('overview'); setSelectedFlowId(null); setBoard(null) }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 6,
              color: 'var(--text-secondary)', display: 'flex', alignItems: 'center',
            }}
          >
            <MdArrowBack size={20} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: flowStyle.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: flowStyle.color }}>
              {flowStyle.icon}
            </div>
            <div>
              <h1 style={{ color: 'var(--text-primary)', fontSize: 18, fontWeight: 700, margin: 0 }}>{selectedFlowName}</h1>
              <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{totalLeads} lead{totalLeads !== 1 ? 's' : ''} in flow</span>
            </div>
          </div>
          {boardLoading && (
            <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 'auto' }}>Refreshing...</span>
          )}
        </div>

        {/* Kanban columns */}
        <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0, overflowX: 'auto', paddingBottom: 4 }}>
          {board.steps.map((step, si) => (
            <div
              key={si}
              style={{
                flex: '1 1 0',
                minWidth: 220,
                maxWidth: 320,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Column header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 8, padding: '0 4px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: flowStyle.color, flexShrink: 0,
                  }} />
                  <span style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>
                    {step.name}
                  </span>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
                  background: 'rgba(255,255,255,0.06)', padding: '1px 8px', borderRadius: 10,
                }}>
                  {step.leads.length}
                </span>
              </div>

              {/* Lead cards */}
              <div style={{
                background: 'var(--bg-secondary)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                flex: 1,
                overflow: 'auto',
                padding: step.leads.length > 0 ? 6 : 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}>
                {step.leads.length === 0 ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '32px 12px', color: 'var(--text-muted)', fontSize: 12,
                  }}>
                    No leads at this step
                  </div>
                ) : (
                  step.leads.map((lead) => {
                    const st = lead.responded
                      ? STATUS_STYLE.responded
                      : STATUS_STYLE[lead.status] || STATUS_STYLE.pending
                    const isLoading = actionLoading === lead.lead_id
                    const timing = lead.status === 'pending' || lead.status === 'queued'
                      ? countdown(lead.scheduled_at)
                      : lead.completed_at
                        ? `Sent ${relativeTime(lead.completed_at)}`
                        : ''

                    return (
                      <div
                        key={lead.lead_id + '-' + si}
                        style={{
                          background: 'var(--bg-primary)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          borderRadius: 6,
                          padding: '10px 12px',
                          opacity: isLoading ? 0.5 : 1,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                          <span
                            onClick={() => handleLeadClick(lead.lead_id)}
                            style={{
                              color: 'var(--text-primary)', fontSize: 13, fontWeight: 600,
                              cursor: 'pointer', textDecoration: 'underline',
                              textDecorationColor: 'rgba(255,255,255,0.15)',
                            }}
                          >
                            {lead.lead_name}
                          </span>
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
                            color: st.color, background: st.bg, flexShrink: 0,
                          }}>
                            {st.label}
                          </span>
                        </div>

                        {lead.lead_phone && (
                          <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 4 }}>
                            {lead.lead_phone}
                          </div>
                        )}

                        {timing && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                            <MdAccessTime size={11} style={{ color: 'var(--text-muted)' }} />
                            <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{timing}</span>
                          </div>
                        )}

                        {!lead.responded && lead.task_id && (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              onClick={() => handleSkip(lead)}
                              disabled={isLoading}
                              style={{
                                background: 'rgba(59,130,246,0.10)', border: 'none', borderRadius: 4,
                                padding: '3px 8px', cursor: 'pointer',
                                color: '#3b82f6', fontSize: 10, fontWeight: 600,
                              }}
                            >
                              Skip
                            </button>
                            <button
                              onClick={() => handleRemove(lead)}
                              disabled={isLoading}
                              style={{
                                background: 'rgba(239,68,68,0.10)', border: 'none', borderRadius: 4,
                                padding: '3px 8px', cursor: 'pointer',
                                color: '#ef4444', fontSize: 10, fontWeight: 600,
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          ))}
        </div>

        {selectedLead && (
          <LeadDetailsModal
            lead={selectedLead}
            isOpen={isLeadModalOpen}
            onClose={() => { setIsLeadModalOpen(false); setSelectedLead(null) }}
            onStatusUpdate={updateLeadStatus}
          />
        )}
      </div>
    )
  }

  // ── Overview grid (legacy) ──────────────────────────────────────

  const totalLeadsInFlows = flows.reduce((sum, f) => sum + f.leadCount, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h1 style={{ color: 'var(--text-primary)', fontSize: 18, fontWeight: 700, margin: 0 }}>Flows</h1>
        <button
          onClick={() => setView('stages')}
          style={{
            padding: '8px 16px',
            background: 'var(--bg-secondary)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            color: 'var(--text-secondary)',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          New 9-Stage View
        </button>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 12,
      }}>
        {flows.map((flow) => {
          const style = FLOW_STYLE[flow.id] || FLOW_STYLE.new_lead_outreach
          return (
            <button
              key={flow.id}
              onClick={() => {
                setSelectedFlowId(flow.id)
                setSelectedFlowName(flow.name)
                setView('board')
              }}
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 10,
                padding: '20px',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: style.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: style.color,
                }}>
                  {style.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600 }}>
                    {flow.name}
                  </div>
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: style.bg, color: style.color,
                  padding: '3px 10px', borderRadius: 12, fontSize: 13, fontWeight: 700,
                }}>
                  <MdPeople size={14} />
                  {flow.leadCount}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Components ────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
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
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
    </div>
  )
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
      {label}
    </span>
  )
}

// ── Template-management styles + modals (ported from WC, BCON-themed) ──

const flowButtonStyle = (background: string, color: string): React.CSSProperties => ({
  minHeight: 40,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  border: '1px solid transparent',
  borderRadius: 10,
  padding: '0 16px',
  background,
  color,
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
})

const flowGhostButtonStyle: React.CSSProperties = {
  minHeight: 40,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  border: '1px solid var(--border-primary)',
  borderRadius: 10,
  padding: '0 16px',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  fontSize: 14,
  fontWeight: 650,
  cursor: 'pointer',
}

const miniBtn = (color: string): React.CSSProperties => ({
  border: '1px solid var(--border-primary)',
  background: 'transparent',
  color,
  borderRadius: 8,
  padding: '5px 10px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
})

function humanizeStage(id: string): string {
  return id.replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase())
}

const modalInputStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 40,
  border: '1px solid var(--border-primary)',
  borderRadius: 9,
  background: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
  padding: '0 12px',
  fontSize: 14,
  outline: 'none',
}

const modalLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--text-secondary)',
  marginBottom: 6,
}

function ModalShell({ title, onClose, children, width = 480 }: { title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px', animation: 'bcon-fade-in 140ms ease' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width, maxWidth: '94vw', maxHeight: '86vh', overflowY: 'auto', background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 16, boxShadow: '0 24px 60px rgba(0,0,0,0.4)', padding: 20 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 850, color: 'var(--text-primary)' }}>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" style={{ border: 0, background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4 }}>
            <MdClose size={20} />
          </button>
        </div>
        {children}
      </div>
      <style jsx global>{`
        @keyframes bcon-fade-in { from { opacity: 0 } to { opacity: 1 } }
      `}</style>
    </div>
  )
}

function TemplateEditorModal({
  template,
  stageId,
  saving,
  error,
  onCancel,
  onSave,
}: {
  template: TemplateInfo | null
  stageId: string
  saving: boolean
  error: string | null
  onCancel: () => void
  onSave: (payload: { id?: string; stage: string; day: number; channel: string; variant: string; templateName: string; content: string }) => void
}) {
  const [stage, setStage] = useState(template?.stage || stageId)
  const [day, setDay] = useState(String(template?.day ?? 1))
  const [channel, setChannel] = useState(template?.channel || 'whatsapp')
  const [variant, setVariant] = useState(template?.variant || 'A')
  const [templateName, setTemplateName] = useState(template?.templateName || '')
  const [content, setContent] = useState(template?.content || '')

  const isEdit = !!template?.id
  const canSave = content.trim().length > 0 && Number.isFinite(Number(day)) && !saving

  return (
    <ModalShell title={isEdit ? 'Edit Template' : 'Create Flow Template'} onClose={onCancel}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={modalLabelStyle}>Stage</label>
          <select value={stage} onChange={e => setStage(e.target.value)} style={modalInputStyle}>
            {STAGE_ORDER.filter(s => s !== 'converted').map(s => (
              <option key={s} value={s}>{humanizeStage(s)}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div>
            <label style={modalLabelStyle}>Day</label>
            <input type="number" min={0} value={day} onChange={e => setDay(e.target.value)} style={modalInputStyle} />
          </div>
          <div>
            <label style={modalLabelStyle}>Channel</label>
            <select value={channel} onChange={e => setChannel(e.target.value)} style={modalInputStyle}>
              <option value="whatsapp">WhatsApp</option>
              <option value="voice">Voice</option>
            </select>
          </div>
          <div>
            <label style={modalLabelStyle}>Variant</label>
            <select value={variant} onChange={e => setVariant(e.target.value)} style={modalInputStyle}>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </select>
          </div>
        </div>

        <div>
          <label style={modalLabelStyle}>Template name <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
          <input value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="e.g. onetouch_d1_intro" style={modalInputStyle} />
        </div>

        <div>
          <label style={modalLabelStyle}>Message content</label>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Hi {{1}}, ..."
            rows={4}
            style={{ ...modalInputStyle, minHeight: 96, padding: '10px 12px', resize: 'vertical', lineHeight: 1.5 }}
          />
          <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>Use {'{{1}}'} for the lead&apos;s name. New templates start as <strong style={{ color: 'var(--text-secondary)' }}>Pending</strong>.</p>
        </div>

        {error && <div style={{ fontSize: 13, color: '#ef4444', background: 'rgba(239,68,68,0.12)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
          <button type="button" onClick={onCancel} style={{ ...flowGhostButtonStyle, minHeight: 40 }}>Cancel</button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => onSave({ id: template?.id, stage, day: Number(day), channel, variant, templateName: templateName.trim(), content: content.trim() })}
            style={{ ...flowButtonStyle('var(--button-bg)', 'var(--text-button)'), minHeight: 40, opacity: canSave ? 1 : 0.5, cursor: canSave ? 'pointer' : 'not-allowed' }}
          >
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create template'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

function FlowSettingsModal({
  stageStats,
  templates,
  onClose,
  onAddTemplate,
}: {
  stageStats: StageStats[]
  templates: TemplateInfo[]
  onClose: () => void
  onAddTemplate: (stageId: string) => void
}) {
  const nameMap = new Map(stageStats.map(s => [s.id, s.name]))
  return (
    <ModalShell title="Flow Settings" onClose={onClose} width={560}>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
        Each stage runs follow-ups on the channels and cadence below. Add or manage templates per stage.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {STAGE_ORDER.filter(s => s !== 'converted').map(sid => {
          const cfg = STAGE_CONFIG[sid]
          const count = templates.filter(t => t.stage === sid).length
          return (
            <div key={sid} style={{ border: '1px solid var(--border-primary)', borderRadius: 12, padding: 14, background: 'var(--bg-tertiary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span style={{ width: 32, height: 32, borderRadius: 8, background: cfg?.bg, color: cfg?.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{cfg?.icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>{nameMap.get(sid) || humanizeStage(sid)}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{cfg?.timing || 'No schedule'}</div>
                  </div>
                </div>
                <button type="button" onClick={() => onAddTemplate(sid)} style={{ ...flowButtonStyle('var(--button-bg)', 'var(--text-button)'), minHeight: 32, fontSize: 12, padding: '0 10px', flexShrink: 0 }}>
                  <MdAdd size={15} /> Add
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                {(cfg?.channels.length ? cfg.channels : ['whatsapp']).map(ch => (
                  <span key={ch} style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', color: 'var(--text-secondary)' }}>
                    {ch === 'whatsapp' ? '💬 WhatsApp' : '📞 Voice'}
                  </span>
                ))}
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>{count} template{count === 1 ? '' : 's'}</span>
              </div>
            </div>
          )
        })}
      </div>
    </ModalShell>
  )
}
