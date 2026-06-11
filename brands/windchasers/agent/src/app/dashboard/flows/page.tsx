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
  MdSearch,
  MdSettings,
  MdFilterList,
  MdCalendarToday,
  MdRefresh,
  MdClose,
  MdMoreVert,
  MdKeyboardArrowDown,
  MdGroups,
  MdInventory2,
  MdAutoGraph,
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
  stage: string
  day: number
  channel: string
  status: string
  variant: string
  templateName: string
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
    const stagesActive = stageStats.filter(s => s.leadCount > 0).length
    const templatesLive = templates.filter(t => t.status === 'approved').length
    const stageMap = new Map(stageStats.map(stage => [stage.id, stage]))
    const selectedStageId = expandedStage || 'low_touch'
    const selectedStage = stageMap.get(selectedStageId) || stageStats[0] || {
      id: 'low_touch',
      name: 'Low Touch',
      leadCount: 0,
      coverage: 0,
    }
    const selectedConfig = STAGE_CONFIG[selectedStage.id] || STAGE_CONFIG.low_touch
    const funnelGroups = [
      { id: 'top', label: 'TOP', color: '#2563eb', stageIds: ['one_touch', 'low_touch', 'engaged'] },
      { id: 'mid', label: 'MID', color: '#f59e0b', stageIds: ['high_intent', 'booking_made', 'no_show'] },
      { id: 'bottom', label: 'BOTTOM', color: '#10b981', stageIds: ['demo_taken', 'proposal_sent', 'converted'] },
    ]

    return (
      <div style={{ padding: '0 0 32px', minHeight: '100%', color: 'var(--text-primary)' }}>
        <section style={{ display: 'flex', justifyContent: 'space-between', gap: 24, alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 30, lineHeight: 1.1, fontWeight: 800, letterSpacing: 0, color: '#0f172a' }}>
              Flows
            </h1>
            <p style={{ margin: '10px 0 0', color: '#64748b', fontSize: 14 }}>
              Orchestrate every stage of your lead journey with templates, nudges and follow-ups.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <label
                style={{
                  width: 380,
                  height: 42,
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  background: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '0 14px',
                  color: '#94a3b8',
                  boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
                }}
              >
                <MdSearch size={20} />
                <input
                  aria-label="Search leads, stages, templates"
                  placeholder="Search leads, stages, templates..."
                  style={{ border: 0, outline: 0, flex: 1, fontSize: 14, color: '#0f172a', background: 'transparent' }}
                />
                <span style={{ color: '#94a3b8', fontSize: 12 }}>Ctrl K</span>
              </label>
              <button type="button" style={flowButtonStyle('#2563eb', '#fff')}>
                <MdAdd size={18} /> Create Flow
              </button>
              <button type="button" style={flowGhostButtonStyle}>
                <MdSettings size={17} /> Flow Settings
              </button>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button type="button" style={flowGhostButtonStyle}>
                <MdCalendarToday size={17} /> May 1 - May 31, 2024 <MdKeyboardArrowDown size={18} />
              </button>
              <button type="button" onClick={() => { fetchFlows(); fetchStageStats() }} style={{ ...flowGhostButtonStyle, width: 42, padding: 0, justifyContent: 'center' }} aria-label="Refresh flows">
                <MdRefresh size={18} />
              </button>
            </div>
          </div>
        </section>

        <section style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
          <button type="button" style={flowFilterButtonStyle}>All Funnels <MdKeyboardArrowDown size={18} /></button>
          {funnelGroups.map(group => (
            <button key={group.id} type="button" style={flowPillButtonStyle}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: group.color }} />
              {group.label}
            </button>
          ))}
          <button type="button" style={{ ...flowFilterButtonStyle, width: 42, padding: 0, justifyContent: 'center' }} aria-label="Filter flows">
            <MdFilterList size={18} />
          </button>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(180px, 1fr))', gap: 16, marginBottom: 22 }}>
          <FlowKpiCard label="Total Leads" value={totalLeads} delta="12% vs Apr 1 - Apr 30" color="#2563eb" icon={<MdGroups size={26} />} />
          <FlowKpiCard label="Avg Coverage" value={`${avgCoverage}%`} delta="4pp vs Apr 1 - Apr 30" color={avgCoverage >= 50 ? '#f59e0b' : '#ef4444'} icon={<CoverageRing value={avgCoverage} color={avgCoverage >= 50 ? '#f59e0b' : '#ef4444'} size={54} />} />
          <FlowKpiCard label="Stages Active" value={`${stagesActive}/9`} delta="1 vs Apr 1 - Apr 30" color="#8b5cf6" icon={<MdAutoGraph size={26} />} />
          <FlowKpiCard label="Templates Live" value={templatesLive} delta="2 vs Apr 1 - Apr 30" color="#0f9f9a" icon={<MdInventory2 size={25} />} />
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 18, alignItems: 'start' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', border: '1px solid #dbeafe', borderRadius: 12, overflow: 'hidden', background: '#fff', marginBottom: 16 }}>
              {funnelGroups.map(group => (
                <FunnelBand
                  key={group.id}
                  label={group.label}
                  color={group.color}
                  stageIds={group.stageIds}
                  stageMap={stageMap}
                />
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(240px, 1fr))', gap: 10 }}>
              {funnelGroups.map(group => (
                <div key={group.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff', overflow: 'hidden', boxShadow: '0 12px 30px rgba(15,23,42,0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #e2e8f0', background: `${group.color}08` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: group.color, fontSize: 13 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: group.color }} />
                      {group.label}
                    </div>
                    <span style={{ fontSize: 12, color: '#475569' }}>
                      {group.stageIds.reduce((sum, id) => sum + (stageMap.get(id)?.leadCount || 0), 0)} leads
                    </span>
                  </div>

                  <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 420 }}>
                    {group.stageIds.map(stageId => {
                      const stage = stageMap.get(stageId) || { id: stageId, name: stageId.replace(/_/g, ' '), leadCount: 0, coverage: 0 }
                      return (
                        <FlowStageCard
                          key={stageId}
                          stageId={stageId}
                          stage={stage}
                          config={STAGE_CONFIG[stageId]}
                          selected={selectedStage.id === stageId}
                          onSelect={() => setExpandedStage(stageId)}
                        />
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <FlowDetailPanel
            stage={selectedStage}
            config={selectedConfig}
            templates={templates}
            getSlotStatus={getSlotStatus}
            onClose={() => setExpandedStage(null)}
          />
        </section>
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

const flowButtonStyle = (background: string, color: string): React.CSSProperties => ({
  minHeight: 42,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  border: '1px solid transparent',
  borderRadius: 10,
  padding: '0 18px',
  background,
  color,
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: background === '#2563eb' ? '0 10px 22px rgba(37,99,235,0.22)' : 'none',
})

const flowGhostButtonStyle: React.CSSProperties = {
  minHeight: 42,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: '0 16px',
  background: '#fff',
  color: '#0f172a',
  fontSize: 14,
  fontWeight: 650,
  cursor: 'pointer',
  boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
}

const flowFilterButtonStyle: React.CSSProperties = {
  ...flowGhostButtonStyle,
  minHeight: 38,
  padding: '0 14px',
  fontSize: 13,
  color: '#0f172a',
}

const flowPillButtonStyle: React.CSSProperties = {
  minHeight: 38,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  border: '1px solid #e2e8f0',
  borderRadius: 9,
  padding: '0 14px',
  background: '#fff',
  color: '#0f172a',
  fontSize: 12,
  fontWeight: 800,
  cursor: 'pointer',
}

function FlowKpiCard({
  label,
  value,
  delta,
  color,
  icon,
}: {
  label: string
  value: string | number
  delta: string
  color: string
  icon: React.ReactNode
}) {
  return (
    <article style={{ minHeight: 112, border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff', padding: 18, boxShadow: '0 12px 30px rgba(15,23,42,0.04)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <p style={{ margin: 0, color: '#475569', fontSize: 14, fontWeight: 650 }}>{label}</p>
          <div style={{ marginTop: 8, fontSize: 31, lineHeight: 1, fontWeight: 850, letterSpacing: 0, color }}>
            {value}
          </div>
        </div>
        <div style={{ width: 50, height: 50, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${color}18`, color }}>
          {icon}
        </div>
      </div>
      <div style={{ marginTop: 12, fontSize: 12, color: delta.includes('4pp') ? '#ef4444' : '#64748b', display: 'flex', alignItems: 'center', gap: 5 }}>
        <MdTrendingUp size={14} />
        {delta}
      </div>
    </article>
  )
}

function FunnelBand({
  label,
  color,
  stageIds,
  stageMap,
}: {
  label: string
  color: string
  stageIds: string[]
  stageMap: Map<string, StageStats>
}) {
  const count = stageIds.reduce((sum, id) => sum + (stageMap.get(id)?.leadCount || 0), 0)
  const values = stageIds.map(id => stageMap.get(id)?.leadCount || 0)

  return (
    <div style={{ minHeight: 104, padding: '16px 20px 10px', background: `linear-gradient(90deg, ${color}14 0%, #fff 100%)`, borderRight: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color, fontWeight: 850, fontSize: 13 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
        {label}
      </div>
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <strong style={{ fontSize: 29, lineHeight: 1, color: '#0f172a' }}>{count}</strong>
        <span style={{ color: '#64748b', fontSize: 13 }}>lead{count === 1 ? '' : 's'}</span>
      </div>
      <MiniSparkline values={values} color={color} />
    </div>
  )
}

function MiniSparkline({ values, color }: { values: number[]; color: string }) {
  const safe = values.length > 0 ? values : [0, 0, 0]
  const max = Math.max(...safe, 1)
  const width = 260
  const height = 42
  const points = safe.map((value, index) => {
    const x = safe.length === 1 ? width / 2 : (index / (safe.length - 1)) * width
    const y = height - 8 - (value / max) * 26
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true" style={{ display: 'block', marginTop: 4 }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="0" y1={height - 8} x2={width} y2={height - 8} stroke={`${color}33`} strokeWidth="1" />
    </svg>
  )
}

function FlowStageCard({
  stageId,
  stage,
  config,
  selected,
  onSelect,
}: {
  stageId: string
  stage: StageStats
  config: (typeof STAGE_CONFIG)[string]
  selected: boolean
  onSelect: () => void
}) {
  const accent = config?.color || '#2563eb'

  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        width: '100%',
        textAlign: 'left',
        border: selected ? `2px solid #2563eb` : '1px solid #e2e8f0',
        borderRadius: 10,
        background: selected ? '#eff6ff' : '#fff',
        padding: 14,
        cursor: 'pointer',
        boxShadow: selected ? '0 10px 24px rgba(37,99,235,0.12)' : '0 6px 18px rgba(15,23,42,0.03)',
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: config?.bg || `${accent}16`, color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {config?.icon || <MdTimeline size={22} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <h3 style={{ margin: 0, fontSize: 16, color: '#0f172a', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {stage.name}
            </h3>
            <MdMoreVert size={18} color="#64748b" />
          </div>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ borderRadius: 999, padding: '3px 8px', color: accent, background: `${accent}16`, fontSize: 12, fontWeight: 800 }}>
              {stage.leadCount} lead{stage.leadCount === 1 ? '' : 's'}
            </span>
            <span style={{ color: '#64748b', fontSize: 12 }}>{config?.timing || 'No schedule'}</span>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: stage.coverage > 0 ? '#f97316' : '#ef4444', fontSize: 12, fontWeight: 800 }}>{stage.coverage}%</span>
        <div style={{ flex: 1, height: 4, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(100, Math.max(0, stage.coverage))}%`, height: '100%', background: stage.coverage >= 80 ? '#22c55e' : stage.coverage >= 50 ? '#f59e0b' : '#ef4444' }} />
        </div>
      </div>
      <span style={{ display: 'none' }}>{stageId}</span>
    </button>
  )
}

function FlowDetailPanel({
  stage,
  config,
  templates,
  getSlotStatus,
  onClose,
}: {
  stage: StageStats
  config: (typeof STAGE_CONFIG)[string]
  templates: TemplateInfo[]
  getSlotStatus: (stageId: string, day: number, channel: string) => string
  onClose: () => void
}) {
  const stageTemplates = templates.filter(template => template.stage === stage.id)
  const approved = stageTemplates.filter(template => template.status === 'approved').length
  const pending = stageTemplates.filter(template => template.status === 'pending').length
  const rejected = stageTemplates.filter(template => template.status === 'rejected').length
  const emptySlots = Math.max(0, (config?.days.length || 0) * (config?.channels.length || 0) - stageTemplates.length)
  const totalSlots = Math.max(1, approved + pending + rejected + emptySlots)

  return (
    <aside style={{ position: 'sticky', top: 16, border: '1px solid #e2e8f0', borderRadius: 14, background: '#fff', boxShadow: '0 18px 40px rgba(15,23,42,0.08)', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 20, color: '#0f172a', fontWeight: 850 }}>{stage.name}</h2>
            <span style={{ color: '#2563eb', background: '#dbeafe', borderRadius: 999, padding: '4px 9px', fontSize: 12, fontWeight: 800 }}>
              {stage.leadCount} leads
            </span>
          </div>
          <p style={{ margin: '12px 0 0', color: '#475569', fontSize: 13 }}>{config?.timing || 'No schedule'}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close selected flow" style={{ border: 0, background: 'transparent', color: '#64748b', cursor: 'pointer', padding: 4 }}>
          <MdClose size={20} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: 26, borderBottom: '1px solid #e2e8f0', marginTop: 24 }}>
        {['Overview', 'Templates', 'Performance', 'Activity'].map((tab, index) => (
          <button key={tab} type="button" style={{ border: 0, background: 'transparent', padding: '0 0 12px', color: index === 0 ? '#2563eb' : '#475569', borderBottom: index === 0 ? '3px solid #2563eb' : '3px solid transparent', fontSize: 13, fontWeight: 750, cursor: 'pointer' }}>
            {tab}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 148px', gap: 12, marginTop: 14 }}>
        <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 14, color: '#0f172a' }}>Channels</h3>
          {(config?.channels.length ? config.channels : ['whatsapp']).map(channel => (
            <div key={channel} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: channel === 'whatsapp' ? '#22c55e' : '#ef476f', fontSize: 20 }}>{channel === 'whatsapp' ? 'W' : 'V'}</span>
                <span style={{ color: '#475569', fontSize: 13, textTransform: 'capitalize' }}>{channel}</span>
              </div>
              <span style={{ borderRadius: 999, padding: '4px 9px', background: '#dcfce7', color: '#16a34a', fontSize: 12, fontWeight: 800 }}>Active</span>
            </div>
          ))}
        </section>

        <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, textAlign: 'center' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, color: '#0f172a', textAlign: 'left' }}>Coverage</h3>
          <CoverageRing value={stage.coverage} color={stage.coverage >= 80 ? '#22c55e' : '#f59e0b'} size={92} showLabel />
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, alignItems: 'center', color: '#16a34a', fontSize: 12, marginTop: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e' }} />
            Good
          </div>
        </section>
      </div>

      <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginTop: 12 }}>
        <h3 style={{ margin: 0, fontSize: 14, color: '#0f172a' }}>Lead Progress</h3>
        <p style={{ margin: '8px 0 12px', color: '#475569', fontSize: 12 }}>{stage.leadCount} leads in this stage</p>
        <SegmentedProgress approved={approved} pending={pending} rejected={rejected} empty={emptySlots} total={totalSlots} />
      </section>

      <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginTop: 12 }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 14, color: '#0f172a' }}>Template Schedule</h3>
        <ScheduleMatrix stageId={stage.id} config={config} getSlotStatus={getSlotStatus} />
        <button type="button" style={{ ...flowGhostButtonStyle, width: '100%', marginTop: 14, color: '#2563eb', minHeight: 36 }}>
          View Full Templates
        </button>
      </section>
    </aside>
  )
}

function CoverageRing({ value, color, size = 54, showLabel = false }: { value: number; color: string; size?: number; showLabel?: boolean }) {
  const stroke = Math.max(6, Math.round(size * 0.12))
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(100, Math.max(0, value)) / 100) * circumference

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={`${value}% coverage`}>
      <circle cx={size / 2} cy={size / 2} r={radius} stroke="#e5e7eb" strokeWidth={stroke} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      {showLabel && (
        <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 18, fontWeight: 850, fill: '#0f172a' }}>
          {value}%
        </text>
      )}
    </svg>
  )
}

function SegmentedProgress({ approved, pending, rejected, empty, total }: { approved: number; pending: number; rejected: number; empty: number; total: number }) {
  const segments = [
    { label: 'Approved', value: approved, color: '#22c55e' },
    { label: 'Pending', value: pending, color: '#f59e0b' },
    { label: 'Rejected', value: rejected, color: '#ef4444' },
    { label: 'Empty', value: empty, color: '#94a3b8' },
  ]

  return (
    <>
      <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', background: '#e2e8f0' }}>
        {segments.map(segment => (
          <div key={segment.label} style={{ width: `${Math.max(0, (segment.value / total) * 100)}%`, background: segment.color }} />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 12 }}>
        {segments.map(segment => (
          <div key={segment.label} style={{ fontSize: 11, color: '#475569' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 750, color: '#334155' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: segment.color }} />
              {segment.label}
            </div>
            <div style={{ marginTop: 3 }}>{segment.value} ({Math.round((segment.value / total) * 100)}%)</div>
          </div>
        ))}
      </div>
    </>
  )
}

function ScheduleMatrix({
  stageId,
  config,
  getSlotStatus,
}: {
  stageId: string
  config: (typeof STAGE_CONFIG)[string]
  getSlotStatus: (stageId: string, day: number, channel: string) => string
}) {
  const days = config?.days.length ? config.days.slice(0, 4) : [1]
  const channels = config?.channels.length ? config.channels : ['whatsapp']

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `88px repeat(${days.length}, 1fr)`, gap: 8, alignItems: 'stretch' }}>
      <div />
      {days.map(day => (
        <div key={day} style={{ textAlign: 'center', fontSize: 12, color: '#0f172a', fontWeight: 800 }}>Day {day}</div>
      ))}
      {channels.map(channel => (
        <React.Fragment key={channel}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#475569', fontSize: 12 }}>
            <span style={{ color: channel === 'whatsapp' ? '#22c55e' : '#ef476f', fontWeight: 900 }}>{channel === 'whatsapp' ? 'W' : 'V'}</span>
            {channel === 'whatsapp' ? 'WhatsApp' : 'Voice'}
          </div>
          {days.map(day => {
            const status = getSlotStatus(stageId, day, channel)
            const palette: Record<string, { bg: string; color: string; icon: React.ReactNode; label: string }> = {
              approved: { bg: '#dcfce7', color: '#16a34a', icon: <MdCheckCircle size={16} />, label: 'Approved' },
              pending: { bg: '#ffedd5', color: '#f97316', icon: <MdAccessTime size={16} />, label: 'Pending' },
              rejected: { bg: '#fee2e2', color: '#ef4444', icon: <MdRemoveCircleOutline size={16} />, label: 'Rejected' },
              empty: { bg: '#f1f5f9', color: '#64748b', icon: <MdCircle size={16} />, label: 'Empty' },
            }
            const item = palette[status] || palette.empty
            return (
              <div key={`${channel}-${day}`} style={{ minHeight: 62, borderRadius: 9, background: item.bg, color: item.color, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 11, fontWeight: 750 }}>
                {item.icon}
                {item.label}
              </div>
            )
          })}
        </React.Fragment>
      ))}
    </div>
  )
}
