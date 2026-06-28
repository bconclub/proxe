'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  MdNotifications,
  MdMessage,
  MdBarChart,
  MdDescription,
  MdCheckCircle,
  MdScheduleSend,
  MdSchedule,
  MdWhatsapp,
  MdPhoneInTalk,
  MdLanguage,
} from 'react-icons/md'
import { useRouter } from 'next/navigation'
import LeadDetailsModal from '@/components/dashboard/LeadDetailsModal'

// --- Types ---

interface AgentTask {
  id: string
  brand: string
  lead_id: string | null
  lead_name: string | null
  lead_phone: string | null
  task_type: string
  task_description: string
  status: string
  scheduled_at: string | null
  completed_at: string | null
  error_message: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

interface Stats {
  completedToday: number
  failedToday: number
  pendingCount: number
  queuedCount: number
  firingNextHour: number
  successRate: number
}

// --- Type badge colors ---

const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  reminder: { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' },
  booking_reminder: { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' },
  nudge: { bg: 'rgba(249,115,22,0.15)', color: '#f97316' },
  follow: { bg: 'rgba(34,197,94,0.15)', color: '#22c55e' },
  push_to_book: { bg: 'rgba(168,85,247,0.15)', color: '#a855f7' },
  re_engage: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
  post_booking: { bg: 'rgba(34,197,94,0.15)', color: '#22c55e' },
}

function getTypeColor(type: string): { bg: string; color: string } {
  const key = Object.keys(TYPE_COLORS).find((k) => type.includes(k))
  return key ? TYPE_COLORS[key] : { bg: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }
}

// --- Helpers ---

function taskTypeIcon(type: string) {
  if (type.includes('reminder') || type.includes('booking_reminder')) return <MdNotifications size={16} />
  if (type.includes('nudge')) return <MdScheduleSend size={16} />
  if (type.includes('follow') || type.includes('post_booking')) return <MdMessage size={16} />
  if (type.includes('push_to_book')) return <MdBarChart size={16} />
  if (type.includes('re_engage')) return <MdMessage size={16} />
  return <MdDescription size={16} />
}

function channelIcon(metadata: Record<string, unknown>) {
  const channel = (metadata?.channel as string) || 'whatsapp'
  if (channel === 'voice') return <MdPhoneInTalk size={13} style={{ opacity: 0.5 }} />
  if (channel === 'web') return <MdLanguage size={13} style={{ opacity: 0.5 }} />
  return <MdWhatsapp size={13} style={{ opacity: 0.5 }} />
}

/** Parse raw error JSON into a short human-readable message */
function cleanErrorMessage(raw: string | null): string {
  if (!raw) return 'Unknown error'
  if (raw.includes('132001') || raw.includes('template name')) return 'Template not found - needs setup in Meta'
  if (raw.includes('131047') || raw.includes('Re-engagement')) return '24h window expired'
  if (raw.includes('24h_window')) return '24h window expired'
  if (raw.includes('No phone')) return 'No phone number on lead'
  if (raw.startsWith('Skipped')) return raw
  if (raw.length > 60) return raw.substring(0, 57) + '...'
  return raw
}

function statusPill(status: string, errorMessage?: string | null) {
  const styles: Record<string, { bg: string; color: string; label: string }> = {
    completed: { bg: 'rgba(34,197,94,0.12)', color: '#22c55e', label: 'Completed' },
    failed: { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', label: 'Failed' },
    failed_24h_window: { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', label: 'Window Expired' },
    pending: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', label: 'Pending' },
    queued: { bg: 'rgba(168,85,247,0.12)', color: '#a855f7', label: 'Awaiting Approval' },
    in_queue: { bg: 'rgba(107,114,128,0.12)', color: '#9ca3af', label: 'Queued' },
  }
  const s = styles[status] || styles.pending
  const tooltip = (status === 'failed' || status === 'failed_24h_window') && errorMessage
    ? cleanErrorMessage(errorMessage)
    : undefined
  return (
    <span
      title={tooltip}
      style={{ background: s.bg, color: s.color, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, cursor: tooltip ? 'help' : undefined }}
    >
      {s.label}
    </span>
  )
}

function typeBadge(type: string) {
  const style = getTypeColor(type)
  const label = type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  return (
    <span
      style={{
        fontSize: 11,
        color: style.color,
        background: style.bg,
        padding: '2px 8px',
        borderRadius: 4,
        fontWeight: 500,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  )
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

/** Build a short context line for a task card based on type, status, and metadata */
function getContextLine(task: AgentTask): string | null {
  const meta = task.metadata || {}
  const type = task.task_type

  // Completed: show what was sent (first 50 chars)
  if (task.status === 'completed') {
    const sent = (meta.completed_action as string) || (meta.message_sent as string) || task.task_description
    if (sent) return sent.length > 50 ? sent.substring(0, 47) + '...' : sent
  }

  // Failed: show parsed error
  if (task.status === 'failed' || task.status === 'failed_24h_window') {
    return cleanErrorMessage(task.error_message)
  }

  // Type-specific context for pending/queued
  if (type.includes('re_engage')) {
    const days = meta.days_inactive as number
    const stage = (meta.lead_stage as string) || (meta.stage as string)
    if (days || stage) return `Inactive ${days || '?'} days${stage ? `, stage: ${stage}` : ''}`
  }

  if (type.includes('nudge')) {
    const question = (meta.last_question as string) || (meta.last_unanswered as string)
    if (question) return `Last question: ${question.length > 40 ? question.substring(0, 37) + '...' : question}`
  }

  if (type === 'push_to_book') {
    const msgCount = meta.message_count as number
    if (msgCount) return `${msgCount} messages, no booking`
  }

  if (type.includes('booking_reminder')) {
    const time = (meta.booking_time as string)
    if (time) return `Call at ${time}`
  }

  return null
}

function isWithin24Hours(scheduledAt: string | null): boolean {
  if (!scheduledAt) return false
  const diff = new Date(scheduledAt).getTime() - Date.now()
  return diff > 0 && diff <= 24 * 60 * 60 * 1000
}

// --- Live Countdown Timer ---

function CountdownTimer({ scheduledAt }: { scheduledAt: string | null }) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  if (!scheduledAt) return null

  const diff = new Date(scheduledAt).getTime() - now
  if (diff <= 0) return <span style={{ color: '#ef4444', fontWeight: 600, fontSize: 11 }}>Overdue</span>

  const totalSecs = Math.floor(diff / 1000)
  const hrs = Math.floor(totalSecs / 3600)
  const mins = Math.floor((totalSecs % 3600) / 60)
  const secs = totalSecs % 60

  let text: string
  let color: string

  if (hrs > 0) {
    text = `Sends in ${hrs}h ${mins}m`
    color = '#22c55e'
  } else if (mins >= 5) {
    text = `Sends in ${mins}m`
    color = '#f59e0b'
  } else {
    text = `Sends in ${mins}m ${secs}s`
    color = '#ef4444'
  }

  return (
    <span
      style={{
        color,
        fontSize: 11,
        fontWeight: 600,
        animation: mins < 5 && hrs === 0 ? 'taskPulse 1.5s ease-in-out infinite' : undefined,
      }}
    >
      {text}
    </span>
  )
}

// --- Queue Task Card (shared between Next 24h and Upcoming columns) ---

function QueueTaskCard({ task, onAction, onLeadClick }: { task: AgentTask; onAction?: (taskId: string, action: string, scheduledAt?: string) => void; onLeadClick?: (task: AgentTask) => void }) {
  const isQueued = task.status === 'queued'
  const isPending = task.status === 'pending'
  const [showReschedule, setShowReschedule] = useState(false)
  const [rescheduleTime, setRescheduleTime] = useState('')
  const contextLine = getContextLine(task)

  const btnStyle = (bg: string, color: string): React.CSSProperties => ({
    fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 4,
    border: 'none', cursor: 'pointer', background: bg, color,
  })

  return (
    <div
      style={{
        padding: '12px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        opacity: isQueued ? 0.7 : 1,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1, minWidth: 0 }}>
          {channelIcon(task.metadata)}
          <span
            onClick={() => onLeadClick?.(task)}
            style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'rgba(255,255,255,0.2)', textUnderlineOffset: 2 }}
          >
            {task.lead_name || 'Unknown lead'}
          </span>
          {task.lead_phone && (
            <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>({task.lead_phone})</span>
          )}
        </div>
        {typeBadge(task.task_type)}
      </div>
      <div style={{ color: 'var(--text-secondary)', fontSize: 12, lineHeight: '16px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {task.task_description}
      </div>
      {contextLine && (
        <div style={{ color: 'var(--text-secondary)', fontSize: 11, opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {contextLine}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {/* Action buttons for pending/queued tasks */}
        {(isPending || isQueued) && onAction ? (
          <div style={{ display: 'flex', gap: 4 }}>
            <button style={btnStyle('rgba(34,197,94,0.15)', '#22c55e')} onClick={() => onAction(task.id, 'send_now')}>
              Send Now
            </button>
            <button style={btnStyle('rgba(59,130,246,0.15)', '#3b82f6')} onClick={() => setShowReschedule(!showReschedule)}>
              Reschedule
            </button>
            <button style={btnStyle('rgba(239,68,68,0.15)', '#ef4444')} onClick={() => onAction(task.id, 'cancel')}>
              Cancel
            </button>
          </div>
        ) : <div />}
        <div>
          {isQueued ? (
            <span style={{ fontSize: 11, fontWeight: 600, color: '#a855f7', background: 'rgba(168,85,247,0.12)', padding: '1px 8px', borderRadius: 4 }}>
              Awaiting Approval
            </span>
          ) : (
            <CountdownTimer scheduledAt={task.scheduled_at} />
          )}
        </div>
      </div>
      {showReschedule && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', paddingTop: 4 }}>
          <input
            type="datetime-local"
            value={rescheduleTime}
            onChange={(e) => setRescheduleTime(e.target.value)}
            style={{
              fontSize: 12, padding: '4px 8px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.15)',
              background: 'var(--bg-secondary)', color: 'var(--text-primary)', flex: 1,
            }}
          />
          <button
            style={btnStyle('rgba(59,130,246,0.25)', '#3b82f6')}
            onClick={() => { if (rescheduleTime && onAction) { onAction(task.id, 'reschedule', new Date(rescheduleTime).toISOString()); setShowReschedule(false); } }}
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  )
}

// --- Stat Card ---

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div
      style={{
        flex: '1 1 0',
        minWidth: 120,
        background: 'var(--bg-secondary, rgba(255,255,255,0.02))',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8,
        padding: '16px 18px',
      }}
    >
      <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 4 }}>{label}</div>
      <div style={{ color, fontSize: 28, fontWeight: 700, lineHeight: 1 }}>{value}</div>
    </div>
  )
}

// --- Main Page ---

export default function TasksPage() {
  const router = useRouter()
  const [tasks, setTasks] = useState<AgentTask[]>([])
  const [stats, setStats] = useState<Stats>({ completedToday: 0, failedToday: 0, pendingCount: 0, queuedCount: 0, firingNextHour: 0, successRate: 100 })
  const [loading, setLoading] = useState(true)
  const [selectedLead, setSelectedLead] = useState<any>(null)
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false)
  const [completedFilter, setCompletedFilter] = useState<'all' | 'completed' | 'failed'>('all')
  const [next24hFilter, setNext24hFilter] = useState<'all' | 'pending' | 'queued'>('all')
  const [upcomingFilter, setUpcomingFilter] = useState<'all' | 'reminders' | 'nudges' | 'follow_ups'>('all')

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/tasks')
      const data = await res.json()
      setTasks(data.tasks || [])
      if (data.stats) setStats(data.stats)
    } catch (err) {
      console.error('Failed to fetch tasks:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleTaskAction = useCallback(async (taskId: string, action: string, scheduledAt?: string) => {
    try {
      const res = await fetch(`/api/dashboard/tasks/${taskId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, scheduled_at: scheduledAt }),
      })
      const data = await res.json()
      if (data.success) {
        fetchTasks()
      } else {
        console.error('Task action failed:', data.error)
      }
    } catch (err) {
      console.error('Task action error:', err)
    }
  }, [fetchTasks])

  const handleLeadClick = useCallback(async (task: AgentTask) => {
    if (task.lead_id) {
      try {
        const res = await fetch(`/api/dashboard/leads/${task.lead_id}`)
        if (res.ok) {
          const lead = await res.json()
          setSelectedLead({
            id: lead.id,
            name: lead.customer_name || lead.name || task.lead_name || 'Unknown',
            email: lead.email || '',
            phone: lead.customer_phone_normalized || lead.phone || task.lead_phone || '',
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
        }
      } catch (err) {
        console.error('Failed to fetch lead:', err)
      }
    } else if (task.lead_phone) {
      router.push(`/dashboard/inbox?phone=${encodeURIComponent(task.lead_phone)}`)
    }
  }, [router])

  const updateLeadStatus = useCallback(async (leadId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/dashboard/leads/${leadId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok && selectedLead?.id === leadId) {
        setSelectedLead({ ...selectedLead, status: newStatus })
      }
    } catch (err) {
      console.error('Failed to update lead status:', err)
    }
  }, [selectedLead])

  useEffect(() => {
    fetchTasks()
    const interval = setInterval(fetchTasks, 30000)
    return () => clearInterval(interval)
  }, [fetchTasks])

  // Column 1: Completed / Failed / Failed 24h window
  const completedTasks = tasks
    .filter((t) => t.status === 'completed' || t.status === 'failed' || t.status === 'failed_24h_window')
    .filter((t) => {
      if (completedFilter === 'completed') return t.status === 'completed'
      if (completedFilter === 'failed') return t.status === 'failed' || t.status === 'failed_24h_window'
      return true
    })
    .sort((a, b) => new Date(b.completed_at || b.created_at).getTime() - new Date(a.completed_at || a.created_at).getTime())

  // Column 2: Next 24 hours (pending within 24h) + queued (regardless of time)
  const next24hTasks = tasks
    .filter((t) => (t.status === 'pending' && isWithin24Hours(t.scheduled_at)) || t.status === 'queued')
    .filter((t) => {
      if (next24hFilter === 'pending') return t.status === 'pending'
      if (next24hFilter === 'queued') return t.status === 'queued'
      return true
    })
    .sort((a, b) => new Date(a.scheduled_at || a.created_at).getTime() - new Date(b.scheduled_at || b.created_at).getTime())

  // Column 3: Upcoming (pending tasks beyond 24h)
  const upcomingTasks = tasks
    .filter((t) => t.status === 'pending' && !isWithin24Hours(t.scheduled_at))
    .filter((t) => {
      if (upcomingFilter === 'reminders') return t.task_type.includes('reminder') || t.task_type.includes('booking_reminder')
      if (upcomingFilter === 'nudges') return t.task_type.includes('nudge') || t.task_type.includes('push_to_book')
      if (upcomingFilter === 'follow_ups') return t.task_type.includes('follow') || t.task_type.includes('re_engage') || t.task_type.includes('post_booking')
      return true
    })
    .sort((a, b) => new Date(a.scheduled_at || a.created_at).getTime() - new Date(b.scheduled_at || b.created_at).getTime())

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Loading tasks...</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, height: '100%' }}>
      <style>{`@keyframes taskPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>

      <h1 style={{ color: 'var(--text-primary)', fontSize: 18, fontWeight: 700, margin: 0 }}>Tasks</h1>

      {/* Stats Row */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatCard label="Completed Today" value={stats.completedToday} color="#22c55e" />
        <StatCard label="Pending" value={stats.pendingCount} color="#f59e0b" />
        <StatCard label="Queued" value={stats.queuedCount} color="#a855f7" />
        <StatCard label="Firing Next Hour" value={stats.firingNextHour} color="#9ca3af" />
        <StatCard label="Success Rate" value={`${stats.successRate}%`} color="var(--text-primary)" />
      </div>

      {/* 3-Column Layout */}
      <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>

        {/* Column 1 — Completed */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14, marginBottom: 8 }}>
            Completed
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
            {([['all', 'All'], ['completed', 'Completed'], ['failed', 'Failed']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setCompletedFilter(key)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
                  fontSize: 12, fontWeight: completedFilter === key ? 700 : 400,
                  color: completedFilter === key ? 'var(--text-primary)' : 'var(--text-muted)',
                  borderBottom: completedFilter === key ? '2px solid var(--text-primary)' : '2px solid transparent',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            style={{
              background: 'var(--bg-secondary, rgba(255,255,255,0.02))',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
              flex: 1,
              overflow: 'auto',
            }}
          >
            {completedTasks.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center', padding: '40px 0', opacity: 0.5 }}>
                No completed tasks
              </div>
            ) : (
              completedTasks.map((task) => (
                <div
                  key={task.id}
                  style={{
                    display: 'flex',
                    gap: 12,
                    padding: '12px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    alignItems: 'flex-start',
                  }}
                >
                  <div style={{ color: 'var(--text-secondary)', fontSize: 11, minWidth: 60, paddingTop: 2, flexShrink: 0 }}>
                    <div>{formatTime(task.completed_at || task.created_at)}</div>
                    <div style={{ opacity: 0.6 }}>{formatDate(task.completed_at || task.created_at)}</div>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', paddingTop: 1, flexShrink: 0 }}>
                    {taskTypeIcon(task.task_type)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: 'var(--text-primary)', fontSize: 13, lineHeight: '18px' }}>
                      {task.task_description}
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                      {channelIcon(task.metadata)}
                      {task.lead_name && (
                        <span
                          onClick={() => handleLeadClick(task)}
                          style={{ color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'rgba(255,255,255,0.15)', textUnderlineOffset: 2 }}
                        >
                          {task.lead_name} {task.lead_phone ? `(${task.lead_phone})` : ''}
                        </span>
                      )}
                    </div>
                    {(() => { const ctx = getContextLine(task); return ctx ? <div style={{ color: 'var(--text-secondary)', fontSize: 11, opacity: 0.6, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ctx}</div> : null })()}
                  </div>
                  <div style={{ flexShrink: 0 }}>{statusPill(task.status, task.error_message)}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Column 2 — Next 24 Hours */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14, marginBottom: 8 }}>
            Next 24 Hours
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
            {([['all', 'All'], ['pending', 'Pending'], ['queued', 'Awaiting Approval']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setNext24hFilter(key)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
                  fontSize: 12, fontWeight: next24hFilter === key ? 700 : 400,
                  color: next24hFilter === key ? 'var(--text-primary)' : 'var(--text-muted)',
                  borderBottom: next24hFilter === key ? '2px solid var(--text-primary)' : '2px solid transparent',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            style={{
              background: 'var(--bg-secondary, rgba(255,255,255,0.02))',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
              flex: 1,
              overflow: 'auto',
            }}
          >
            {next24hTasks.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 16px', gap: 8 }}>
                <MdCheckCircle size={28} style={{ color: 'rgba(34,197,94,0.4)' }} />
                <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No tasks in the next 24 hours</span>
              </div>
            ) : (
              next24hTasks.map((task) => <QueueTaskCard key={task.id} task={task} onAction={handleTaskAction} onLeadClick={handleLeadClick} />)
            )}
          </div>
        </div>

        {/* Column 3 — Upcoming */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14, marginBottom: 8 }}>
            Upcoming
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
            {([['all', 'All'], ['reminders', 'Reminders'], ['nudges', 'Nudges'], ['follow_ups', 'Follow-ups']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setUpcomingFilter(key)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
                  fontSize: 12, fontWeight: upcomingFilter === key ? 700 : 400,
                  color: upcomingFilter === key ? 'var(--text-primary)' : 'var(--text-muted)',
                  borderBottom: upcomingFilter === key ? '2px solid var(--text-primary)' : '2px solid transparent',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            style={{
              background: 'var(--bg-secondary, rgba(255,255,255,0.02))',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
              flex: 1,
              overflow: 'auto',
            }}
          >
            {upcomingTasks.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 16px', gap: 8 }}>
                <MdSchedule size={28} style={{ color: 'rgba(245,158,11,0.4)' }} />
                <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No upcoming tasks</span>
              </div>
            ) : (
              upcomingTasks.map((task) => <QueueTaskCard key={task.id} task={task} onAction={handleTaskAction} onLeadClick={handleLeadClick} />)
            )}
          </div>
        </div>

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
