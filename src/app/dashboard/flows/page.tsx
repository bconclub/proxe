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
} from 'react-icons/md'

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

interface JourneyStage {
  id: string
  name: string
  icon: React.ReactNode
  description: string
  timing: string
  channels: ('whatsapp' | 'voice')[]
  tone: 'soft' | 'normal' | 'aggressive' | 'very_aggressive'
  condition: string
  color: string
}

// --- Journey Stage Definitions ---

const JOURNEY_STAGES: JourneyStage[] = [
  {
    id: 'one_touch',
    name: 'One Touch',
    icon: <MdTouchApp size={22} />,
    description: 'Initial contact, low engagement',
    timing: 'Day 3, Day 7, Day 30, Day 90',
    channels: ['whatsapp'],
    tone: 'soft',
    condition: 'response_count < 2',
    color: '#3b82f6',
  },
  {
    id: 'low_touch',
    name: 'Low Touch',
    icon: <MdMessage size={22} />,
    description: 'Early engagement building',
    timing: 'Day 3, Day 7',
    channels: ['whatsapp'],
    tone: 'normal',
    condition: 'response_count 2-5',
    color: '#06b6d4',
  },
  {
    id: 'engaged',
    name: 'Engaged',
    icon: <MdChat size={22} />,
    description: 'Active conversation flow',
    timing: 'Day 1, Day 3',
    channels: ['whatsapp'],
    tone: 'normal',
    condition: '5+ messages exchanged',
    color: '#22c55e',
  },
  {
    id: 'high_intent',
    name: 'High Intent',
    icon: <MdTrendingUp size={22} />,
    description: 'Strong buying signals detected',
    timing: '24h + Voice call (+4h)',
    channels: ['whatsapp', 'voice'],
    tone: 'aggressive',
    condition: 'lead_score 61-80',
    color: '#f59e0b',
  },
  {
    id: 'booking_made',
    name: 'Booking Made',
    icon: <MdEvent size={22} />,
    description: 'Call scheduled and confirmed',
    timing: '24h reminder + 30m reminder',
    channels: ['whatsapp', 'voice'],
    tone: 'aggressive',
    condition: 'booking confirmed',
    color: '#8b5cf6',
  },
  {
    id: 'no_show',
    name: 'No Show',
    icon: <MdPhoneMissed size={22} />,
    description: 'Missed scheduled appointment',
    timing: '30m, Day 1, Day 3, Day 7',
    channels: ['whatsapp', 'voice'],
    tone: 'aggressive',
    condition: 'booking missed',
    color: '#ef4444',
  },
  {
    id: 'demo_taken',
    name: 'Demo Taken',
    icon: <MdVideocam size={22} />,
    description: 'Product demo completed',
    timing: 'Day 1, Day 3, Day 5 + Voice (Day 2)',
    channels: ['whatsapp', 'voice'],
    tone: 'aggressive',
    condition: 'demo completed',
    color: '#ec4899',
  },
  {
    id: 'proposal_sent',
    name: 'Proposal Sent',
    icon: <MdDescription size={22} />,
    description: 'Pricing/proposal delivered',
    timing: 'Day 1, Voice (+4h), Day 3, Day 5',
    channels: ['whatsapp', 'voice'],
    tone: 'very_aggressive',
    condition: 'proposal delivered',
    color: '#f97316',
  },
  {
    id: 'converted',
    name: 'Converted / Closed Lost',
    icon: <MdCheckCircle size={22} />,
    description: 'Final stage - deal outcome',
    timing: 'No follow-up',
    channels: [],
    tone: 'normal',
    condition: 'deal closed',
    color: '#10b981',
  },
]

// --- Helpers ---

function getToneColor(tone: string): { bg: string; color: string; label: string } {
  switch (tone) {
    case 'soft':
      return { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6', label: 'Soft' }
    case 'normal':
      return { bg: 'rgba(34,197,94,0.15)', color: '#22c55e', label: 'Normal' }
    case 'aggressive':
      return { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', label: 'Aggressive' }
    case 'very_aggressive':
      return { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', label: 'Very Aggressive' }
    default:
      return { bg: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)', label: 'Normal' }
  }
}

function ChannelBadge({ channel }: { channel: 'whatsapp' | 'voice' }) {
  if (channel === 'whatsapp') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          background: 'rgba(34,197,94,0.12)',
          color: '#22c55e',
          fontSize: 10,
          fontWeight: 600,
          padding: '2px 8px',
          borderRadius: 4,
        }}
      >
        <MdWhatsapp size={11} />
        WhatsApp
      </span>
    )
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        background: 'rgba(139,92,246,0.12)',
        color: '#8b5cf6',
        fontSize: 10,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 4,
      }}
    >
      <MdPhoneInTalk size={11} />
      Voice
    </span>
  )
}

function TonePill({ tone }: { tone: string }) {
  const style = getToneColor(tone)
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

// --- Components ---

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
      </div>
    </div>
  )
}

function JourneyStageCard({
  stage,
  count,
  isLast,
}: {
  stage: JourneyStage
  count: number
  isLast: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      {/* Stage Card */}
      <div
        style={{
          width: '100%',
          background: 'var(--bg-secondary, rgba(255,255,255,0.02))',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          padding: '18px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          transition: 'border-color 0.2s, transform 0.1s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = stage.color
          e.currentTarget.style.transform = 'translateY(-2px)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
          e.currentTarget.style.transform = 'translateY(0)'
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
            {stage.icon}
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
        </div>

        {/* Description */}
        <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: '18px' }}>{stage.description}</div>

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
  const [loading, setLoading] = useState(true)

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

      // Calculate stuck stages (stages with leads silent 7+ days)
      const stuckRes = await fetch('/api/dashboard/leads?stuck=true&days=7')
      const stuckData = await stuckRes.json()
      const stuckStagesCount = stuckData.stuck_stages?.length || 0

      setStageCounts(counts)
      setStats({
        pendingCount: tasksData.stats?.pendingCount || 0,
        completedToday: tasksData.stats?.completedToday || 0,
        stuckStages: stuckStagesCount,
      })
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 600, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ color: 'var(--text-primary)', fontSize: 22, fontWeight: 700, margin: '0 0 6px 0' }}>
          Customer Journey
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0 }}>
          Visual flow of leads through engagement stages
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
          label="Stuck Stages"
          value={stats.stuckStages}
          icon={<MdWarning size={22} />}
          color="#ef4444"
        />
      </div>

      {/* Journey Flow */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: '0 0 20px 0' }}>
        {JOURNEY_STAGES.map((stage, index) => (
          <JourneyStageCard
            key={stage.id}
            stage={stage}
            count={getStageCount(stage.id)}
            isLast={index === JOURNEY_STAGES.length - 1}
          />
        ))}
      </div>
    </div>
  )
}
