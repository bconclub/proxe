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
  MdCheck,
  MdError,
  MdMoreVert,
} from 'react-icons/md'

import { 
  JOURNEY_STAGES, 
  STAGE_MAP,
  getTemplateSlotsForStage,
  getToneColor,
  getChannelInfo,
  calculateStageCoverage,
  JourneyStageId,
  Channel,
  Variant,
} from '@/lib/constants/flowStages'
import { 
  FollowUpTemplate, 
  getAllTemplates, 
  getTemplateStats,
  getSlotStatus,
} from '@/lib/services/templateLibrary'

// --- Types ---

interface StageCount {
  stage: string
  count: number
}

interface TaskStats {
  pendingCount: number
  completedToday: number
  stuckStages: number
}

interface TemplateMap {
  [stageId: string]: FollowUpTemplate[]
}

interface SlotStatus {
  hasTemplate: boolean
  status: 'empty' | 'pending' | 'approved' | 'rejected' | 'mixed'
  variants: FollowUpTemplate[]
}

// --- Components ---

function StatCard({
  label,
  value,
  icon,
  color,
  subtitle,
}: {
  label: string
  value: string | number
  icon: React.ReactNode
  color: string
  subtitle?: string
}) {
  return (
    <div
      style={{
        flex: '1 1 0',
        minWidth: 180,
        background: 'var(--bg-secondary, rgba(255,255,255,0.02))',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 10,
        padding: '18px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          background: `${color}20`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 4 }}>{label}</div>
        <div style={{ color: 'var(--text-primary)', fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{value}</div>
        {subtitle && <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>{subtitle}</div>}
      </div>
    </div>
  )
}

function ChannelBadge({ channel }: { channel: Channel }) {
  const info = getChannelInfo(channel)
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        background: info.bgColor,
        color: info.color,
        fontSize: 10,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 4,
      }}
    >
      {channel === 'whatsapp' && <MdWhatsapp size={11} />}
      {channel === 'voice' && <MdPhoneInTalk size={11} />}
      {info.label}
    </span>
  )
}

function TonePill({ tone }: { tone: string }) {
  const style = getToneColor(tone as any)
  return (
    <span
      style={{
        background: style.bg,
        color: style.color,
        fontSize: 10,
        fontWeight: 600,
        padding: '3px 10px',
        borderRadius: 12,
        whiteSpace: 'nowrap',
      }}
    >
      {style.label}
    </span>
  )
}

function StatusBadge({ status }: { status: SlotStatus['status'] }) {
  const styles = {
    empty: { bg: 'rgba(156, 163, 175, 0.1)', color: '#9ca3af', icon: null, label: 'Empty' },
    pending: { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', icon: <MdSchedule size={10} />, label: 'Pending' },
    approved: { bg: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', icon: <MdCheck size={10} />, label: 'Approved' },
    rejected: { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', icon: <MdError size={10} />, label: 'Rejected' },
    mixed: { bg: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6', icon: <MdMoreVert size={10} />, label: 'Mixed' },
  }
  
  const s = styles[status]
  
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        background: s.bg,
        color: s.color,
        fontSize: 9,
        fontWeight: 600,
        padding: '2px 6px',
        borderRadius: 4,
        textTransform: 'uppercase',
      }}
    >
      {s.icon}
      {s.label}
    </span>
  )
}

function TemplateSlot({
  stageId,
  day,
  channel,
  templates,
  onAssign,
}: {
  stageId: JourneyStageId
  day: number
  channel: Channel
  templates: FollowUpTemplate[]
  onAssign: () => void
}) {
  const hasTemplate = templates.length > 0
  const approvedCount = templates.filter(t => t.meta_status === 'approved').length
  const status: SlotStatus['status'] = hasTemplate 
    ? approvedCount === templates.length ? 'approved' 
    : approvedCount === 0 ? (templates[0]?.meta_status === 'rejected' ? 'rejected' : 'pending')
    : 'mixed'
    : 'empty'

  return (
    <div
      style={{
        padding: '8px 12px',
        background: hasTemplate ? 'rgba(255,255,255,0.03)' : 'transparent',
        borderRadius: 6,
        border: `1px dashed ${hasTemplate ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)'}`,
        minHeight: 60,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
          Day {day}
        </span>
        <StatusBadge status={status} />
      </div>

      {hasTemplate ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {templates.slice(0, 2).map((t) => (
            <div
              key={t.id}
              style={{
                fontSize: 11,
                color: t.meta_status === 'approved' ? 'var(--text-primary)' : 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span
                style={{
                  fontSize: 9,
                  padding: '1px 4px',
                  borderRadius: 3,
                  background: t.variant === 'A' ? 'rgba(59,130,246,0.2)' : t.variant === 'B' ? 'rgba(34,197,94,0.2)' : 'rgba(139,92,246,0.2)',
                  color: t.variant === 'A' ? '#3b82f6' : t.variant === 'B' ? '#22c55e' : '#8b5cf6',
                }}
              >
                {t.variant}
              </span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.meta_template_name || 'Unnamed'}
              </span>
            </div>
          ))}
          {templates.length > 2 && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              +{templates.length - 2} more
            </span>
          )}
          <button
            onClick={onAssign}
            style={{
              marginTop: 4,
              fontSize: 10,
              color: 'var(--text-secondary)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              padding: 0,
            }}
          >
            Edit
          </button>
        </div>
      ) : (
        <button
          onClick={onAssign}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            padding: '8px',
            background: 'rgba(59,130,246,0.1)',
            color: '#3b82f6',
            border: '1px dashed rgba(59,130,246,0.3)',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 500,
            cursor: 'pointer',
            marginTop: 'auto',
          }}
        >
          <MdAdd size={14} />
          Assign
        </button>
      )}
    </div>
  )
}

function JourneyStageCard({
  stage,
  count,
  isLast,
  templates,
  onAssignTemplate,
  isExpanded,
  onToggle,
}: {
  stage: typeof JOURNEY_STAGES[0]
  count: number
  isLast: boolean
  templates: FollowUpTemplate[]
  onAssignTemplate: (stageId: JourneyStageId, day: number, channel: Channel) => void
  isExpanded: boolean
  onToggle: () => void
}) {
  const stageConfig = STAGE_MAP[stage.id]
  const Icon = stage.icon
  
  // Group templates by day and channel
  const templatesBySlot: Record<string, FollowUpTemplate[]> = {}
  templates.forEach(t => {
    const key = `${t.day}-${t.channel}`
    if (!templatesBySlot[key]) templatesBySlot[key] = []
    templatesBySlot[key].push(t)
  })

  // Get unique days and channels for this stage
  const slots = getTemplateSlotsForStage(stage.id)
  const uniqueDays = [...new Set(slots.map(s => s.day))].sort((a, b) => a - b)
  const uniqueChannels = [...new Set(slots.map(s => s.channel))]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      {/* Stage Card */}
      <div
        style={{
          width: '100%',
          background: 'var(--bg-secondary, rgba(255,255,255,0.02))',
          border: `1px solid ${isExpanded ? stage.color : 'rgba(255,255,255,0.08)'}`,
          borderRadius: 12,
          overflow: 'hidden',
          transition: 'border-color 0.2s, transform 0.1s',
        }}
      >
        {/* Header - Click to expand */}
        <div
          onClick={onToggle}
          style={{
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            cursor: 'pointer',
          }}
        >
          {/* Header: Icon + Name + Count */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: `${stage.color}15`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: stage.color,
                flexShrink: 0,
              }}
            >
              <Icon size={22} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 700, marginBottom: 2 }}>
                {stage.name}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{stage.condition}</div>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: count > 0 ? `${stage.color}20` : 'rgba(255,255,255,0.06)',
                color: count > 0 ? stage.color : 'var(--text-secondary)',
                padding: '6px 14px',
                borderRadius: 20,
                fontSize: 18,
                fontWeight: 700,
                minWidth: 50,
                justifyContent: 'center',
              }}
            >
              {count}
            </div>
            <div style={{ color: 'var(--text-muted)' }}>
              {isExpanded ? <MdExpandLess size={24} /> : <MdExpandMore size={24} />}
            </div>
          </div>

          {/* Description */}
          <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: '18px' }}>
            {stage.description}
          </div>

          {/* Timing */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <MdSchedule size={13} style={{ color: 'var(--text-muted)' }} />
            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{stage.timing}</span>
          </div>

          {/* Channels & Tone */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {stage.channels.length > 0 ? (
                stage.channels.map((ch) => <ChannelBadge key={ch} channel={ch} />)
              ) : (
                <span style={{ color: 'var(--text-muted)', fontSize: 11, fontStyle: 'italic' }}>No follow-up</span>
              )}
            </div>
            <TonePill tone={stage.tone} />
          </div>

          {/* Setup Status */}
          {stage.requiresSetup && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              {templates.length === 0 ? (
                <span style={{ fontSize: 11, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <MdWarning size={12} />
                  Setup Required
                </span>
              ) : (
                <span style={{ fontSize: 11, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <MdCheck size={12} />
                  {templates.length} templates configured
                </span>
              )}
            </div>
          )}
        </div>

        {/* Expanded: Template Grid */}
        {isExpanded && !stage.isTerminal && (
          <div style={{ padding: '0 20px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ padding: '12px 0', fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
              Template Configuration
            </div>
            
            {/* Grid Header */}
            <div style={{ display: 'grid', gridTemplateColumns: `100px repeat(${uniqueDays.length}, 1fr)`, gap: 8, marginBottom: 8 }}>
              <div></div>
              {uniqueDays.map(day => (
                <div key={day} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                  Day {day}
                </div>
              ))}
            </div>

            {/* Grid Rows by Channel */}
            {uniqueChannels.map(channel => (
              <div key={channel} style={{ display: 'grid', gridTemplateColumns: `100px repeat(${uniqueDays.length}, 1fr)`, gap: 8, marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ChannelBadge channel={channel} />
                </div>
                {uniqueDays.map(day => {
                  const slotTemplates = templatesBySlot[`${day}-${channel}`] || []
                  return (
                    <TemplateSlot
                      key={`${day}-${channel}`}
                      stageId={stage.id}
                      day={day}
                      channel={channel}
                      templates={slotTemplates}
                      onAssign={() => onAssignTemplate(stage.id, day, channel)}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Connector Arrow */}
      {!isLast && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '10px 0',
            color: 'rgba(255,255,255,0.15)',
          }}
        >
          <MdArrowDownward size={20} />
        </div>
      )}
    </div>
  )
}

// --- Main Page ---

export default function FlowsPage() {
  const [stageCounts, setStageCounts] = useState<Record<string, number>>({})
  const [stats, setStats] = useState<TaskStats>({
    pendingCount: 0,
    completedToday: 0,
    stuckStages: 0,
  })
  const [templates, setTemplates] = useState<TemplateMap>({})
  const [templateStats, setTemplateStats] = useState<{
    overall: { coverage: number; filledSlots: number; totalSlots: number }
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [expandedStages, setExpandedStages] = useState<Set<JourneyStageId>>(new Set())
  const [lastSync, setLastSync] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      // Fetch stage counts from leads API
      const stagesRes = await fetch('/api/dashboard/leads?group_by=lead_stage')
      const stagesData = await stagesRes.json()

      // Map API stage names to our journey stage IDs
      const counts: Record<string, number> = {}
      if (stagesData.leads) {
        stagesData.leads.forEach((item: StageCount) => {
          const stageKey = item.stage?.toLowerCase().replace(/\s+/g, '_') || 'unknown'
          counts[stageKey] = (counts[stageKey] || 0) + item.count
        })
      }

      // Fetch task stats
      const tasksRes = await fetch('/api/dashboard/tasks')
      const tasksData = await tasksRes.json()

      // Calculate stuck stages
      const stuckRes = await fetch('/api/dashboard/leads?stuck=true&days=7')
      const stuckData = await stuckRes.json()

      // Fetch templates
      const templatesRes = await fetch('/api/dashboard/flows/templates')
      const templatesData = await templatesRes.json()

      // Fetch template stats
      const statsRes = await fetch('/api/dashboard/flows/stats')
      const statsData = await statsRes.json()

      setStageCounts(counts)
      setStats({
        pendingCount: tasksData.stats?.pendingCount || 0,
        completedToday: tasksData.stats?.completedToday || 0,
        stuckStages: stuckData.stuck_stages?.length || 0,
      })
      setTemplates(templatesData.templates || {})
      setTemplateStats(statsData.stats || null)
      setLastSync(statsData.stats?.lastSync || null)
    } catch (err) {
      console.error('Failed to fetch journey data:', err)
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
      if (res.ok) {
        await fetchData()
      }
    } catch (err) {
      console.error('Sync failed:', err)
    } finally {
      setSyncing(false)
    }
  }

  const toggleStage = (stageId: JourneyStageId) => {
    setExpandedStages(prev => {
      const next = new Set(prev)
      if (next.has(stageId)) {
        next.delete(stageId)
      } else {
        next.add(stageId)
      }
      return next
    })
  }

  const handleAssignTemplate = (stageId: JourneyStageId, day: number, channel: Channel) => {
    // TODO: Open template assignment modal
    console.log('Assign template:', { stageId, day, channel })
    alert(`Template assignment for ${stageId} - Day ${day} - ${channel}\n\nThis would open the assignment modal.`)
  }

  // Map stage counts to journey stages
  const getStageCount = (stageId: string): number => {
    const mapping: Record<string, string[]> = {
      one_touch: ['new', 'one_touch'],
      low_touch: ['low_touch'],
      engaged: ['engaged'],
      high_intent: ['high_intent'],
      booking_made: ['booking_made'],
      no_show: ['no_show', 'rnr'],
      demo_taken: ['demo_taken'],
      proposal_sent: ['proposal_sent'],
      converted: ['converted', 'closed_won', 'closed_lost'],
    }
    const keys = mapping[stageId] || [stageId]
    return keys.reduce((sum, key) => sum + (stageCounts[key] || 0), 0)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Loading journey map...</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 800, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ color: 'var(--text-primary)', fontSize: 22, fontWeight: 700, margin: '0 0 6px 0' }}>
          Customer Journey Flows
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0 }}>
          Configure follow-up templates for each journey stage
        </p>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <StatCard
          label="Active Sequences"
          value={stats.pendingCount}
          icon={<MdSchedule size={22} />}
          color="#3b82f6"
        />
        <StatCard
          label="Tasks Sent Today"
          value={stats.completedToday}
          icon={<MdCheckCircle size={22} />}
          color="#22c55e"
        />
        <StatCard
          label="Template Coverage"
          value={`${templateStats?.overall?.coverage || 0}%`}
          icon={<MdInfo size={22} />}
          color="#8b5cf6"
          subtitle={`${templateStats?.overall?.filledSlots || 0}/${templateStats?.overall?.totalSlots || 0} slots`}
        />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
        <button
          onClick={handleSync}
          disabled={syncing}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 16px',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            fontSize: 13,
            cursor: syncing ? 'not-allowed' : 'pointer',
            opacity: syncing ? 0.6 : 1,
          }}
        >
          <MdSync size={16} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
          {syncing ? 'Syncing...' : 'Sync with Meta'}
        </button>
        {lastSync && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>
            Last sync: {new Date(lastSync).toLocaleString()}
          </span>
        )}
      </div>

      {/* Journey Flow */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: '0 0 20px 0' }}>
        {JOURNEY_STAGES.map((stage, index) => (
          <JourneyStageCard
            key={stage.id}
            stage={stage}
            count={getStageCount(stage.id)}
            isLast={index === JOURNEY_STAGES.length - 1}
            templates={templates[stage.id] || []}
            onAssignTemplate={handleAssignTemplate}
            isExpanded={expandedStages.has(stage.id)}
            onToggle={() => toggleStage(stage.id)}
          />
        ))}
      </div>
    </div>
  )
}
