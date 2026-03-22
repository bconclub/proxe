'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  MdNotifications,
  MdMessage,
  MdBarChart,
  MdDescription,
  MdCheckCircle,
  MdScheduleSend,
  MdWhatsapp,
  MdPhoneInTalk,
  MdLanguage,
  MdHourglassEmpty,
} from 'react-icons/md'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

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

type FilterTab = 'all' | 'reminders' | 'nudges' | 'follow_ups' | 'other' | 'completed' | 'failed'

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

function matchesFilter(task: AgentTask, filter: FilterTab): boolean {
  if (filter === 'all') return true
  if (filter === 'completed') return task.status === 'completed'
  if (filter === 'failed') return task.status === 'failed' || task.status === 'failed_24h_window'
  if (filter === 'reminders') return task.task_type.includes('reminder') || task.task_type.includes('booking_reminder')
  if (filter === 'nudges') return task.task_type.includes('nudge') || task.task_type.includes('push_to_book')
  if (filter === 'follow_ups') return task.task_type.includes('follow') || task.task_type.includes('re_engage') || task.task_type.includes('post_booking')
  return (
    !task.task_type.includes('reminder') &&
    !task.task_type.includes('nudge') &&
    !task.task_type.includes('follow') &&
    !task.task_type.includes('re_engage') &&
    !task.task_type.includes('push_to_book') &&
    !task.task_type.includes('post_booking')
  )
}

function buildHourlyChart(tasks: AgentTask[]): { hour: string; count: number }[] {
  const now = new Date()
  const hours: { hour: string; count: number }[] = []
  for (let i = 23; i >= 0; i--) {
    const h = new Date(now.getTime() - i * 60 * 60 * 1000)
    const label = h.toLocaleTimeString('en-IN', { hour: '2-digit', hour12: true })
    const start = new Date(h)
    start.setMinutes(0, 0, 0)
    const end = new Date(start.getTime() + 60 * 60 * 1000)
    const count = tasks.filter(
      (t) => t.status === 'completed' && t.completed_at && new Date(t.completed_at) >= start && new Date(t.completed_at) < end
    ).length
    hours.push({ hour: label, count })
  }
  return hours
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

// --- Queue Task Card (shared between both sections) ---

function QueueTaskCard({ task, onAction }: { task: AgentTask; onAction?: (taskId: string, action: string, scheduledAt?: string) => void }) {
  const isQueued = task.status === 'queued'
  const isPending = task.status === 'pending'
  const [showReschedule, setShowReschedule] = useState(false)
  const [rescheduleTime, setRescheduleTime] = useState('')

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
          <span style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
  const [tasks, setTasks] = useState<AgentTask[]>([])
  const [stats, setStats] = useState<Stats>({ completedToday: 0, failedToday: 0, pendingCount: 0, queuedCount: 0, firingNextHour: 0, successRate: 100 })
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterTab>('all')

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
        fetchTasks() // refresh
      } else {
        console.error('Task action failed:', data.error)
      }
    } catch (err) {
      console.error('Task action error:', err)
    }
  }, [fetchTasks])

  useEffect(() => {
    fetchTasks()
    const interval = setInterval(fetchTasks, 30000)
    return () => clearInterval(interval)
  }, [fetchTasks])

  const timelineTasks = tasks
    .filter((t) => (t.status === 'completed' || t.status === 'failed' || t.status === 'failed_24h_window') && matchesFilter(t, filter))
    .sort((a, b) => new Date(b.completed_at || b.created_at).getTime() - new Date(a.completed_at || a.created_at).getTime())

  const thirtyMinsFromNow = Date.now() + 30 * 60 * 1000
  const upNextTasks = tasks
    .filter((t) => t.status === 'pending' && t.scheduled_at && new Date(t.scheduled_at).getTime() <= thirtyMinsFromNow)
    .sort((a, b) => new Date(a.scheduled_at || a.created_at).getTime() - new Date(b.scheduled_at || b.created_at).getTime())

  const upcomingTasks = tasks
    .filter((t) => t.status === 'pending' && (!t.scheduled_at || new Date(t.scheduled_at).getTime() > thirtyMinsFromNow))
    .sort((a, b) => new Date(a.scheduled_at || a.created_at).getTime() - new Date(b.scheduled_at || b.created_at).getTime())

  const awaitingApprovalTasks = tasks
    .filter((t) => t.status === 'queued')
    .sort((a, b) => new Date(a.scheduled_at || a.created_at).getTime() - new Date(b.scheduled_at || b.created_at).getTime())

  const hourlyData = buildHourlyChart(tasks)

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Loading tasks...</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
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

      {/* Main Area */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {/* Left - Activity Timeline */}
        <div style={{ flex: '3 1 400px', minWidth: 0 }}>
          {/* Filter Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {(['all', 'reminders', 'nudges', 'follow_ups', 'other', 'completed', 'failed'] as FilterTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: filter === tab ? 'rgba(255,255,255,0.1)' : 'transparent',
                  color: filter === tab ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {tab === 'follow_ups' ? 'Follow-ups' : tab}
              </button>
            ))}
          </div>

          {/* Timeline */}
          <div
            style={{
              background: 'var(--bg-secondary, rgba(255,255,255,0.02))',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
              maxHeight: 500,
              overflow: 'auto',
            }}
          >
            {timelineTasks.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center', padding: '40px 0', opacity: 0.5 }}>
                No tasks to show
              </div>
            ) : (
              timelineTasks.map((task) => (
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
                        <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                          {task.lead_name} {task.lead_phone ? `(${task.lead_phone})` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0 }}>{statusPill(task.status, task.error_message)}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right - Queue */}
        <div style={{ flex: '2 1 280px', minWidth: 0 }}>
          {/* Up Next (within 30 minutes) */}
          <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14, marginBottom: 12 }}>
            Up Next
            {upNextTasks.length > 0 && (
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginLeft: 6 }}>
                ({upNextTasks.length})
              </span>
            )}
          </div>
          <div
            style={{
              background: 'var(--bg-secondary, rgba(255,255,255,0.02))',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
              maxHeight: 280,
              overflow: 'auto',
              marginBottom: 16,
            }}
          >
            {upNextTasks.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px 16px', gap: 6 }}>
                <MdCheckCircle size={24} style={{ color: 'rgba(34,197,94,0.4)' }} />
                <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Nothing firing soon</span>
              </div>
            ) : (
              upNextTasks.map((task) => <QueueTaskCard key={task.id} task={task} onAction={handleTaskAction} />)
            )}
          </div>

          {/* Upcoming (beyond 30 minutes) */}
          {upcomingTasks.length > 0 && (
            <>
              <div style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: 13, marginBottom: 12 }}>
                Upcoming
                <span style={{ fontSize: 12, fontWeight: 500, marginLeft: 6 }}>
                  ({upcomingTasks.length})
                </span>
              </div>
              <div
                style={{
                  background: 'var(--bg-secondary, rgba(255,255,255,0.02))',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8,
                  maxHeight: 200,
                  overflow: 'auto',
                  marginBottom: 16,
                  opacity: 0.7,
                }}
              >
                {upcomingTasks.map((task) => <QueueTaskCard key={task.id} task={task} onAction={handleTaskAction} />)}
              </div>
            </>
          )}

          {/* Awaiting Approval */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#a855f7', fontWeight: 600, fontSize: 14, marginBottom: 12 }}>
            <MdHourglassEmpty size={16} />
            Awaiting Approval
            {awaitingApprovalTasks.length > 0 && (
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>
                ({awaitingApprovalTasks.length})
              </span>
            )}
          </div>
          <div
            style={{
              background: 'var(--bg-secondary, rgba(255,255,255,0.02))',
              border: '1px solid rgba(168,85,247,0.15)',
              borderRadius: 8,
              maxHeight: 280,
              overflow: 'auto',
            }}
          >
            {awaitingApprovalTasks.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px 16px', gap: 6 }}>
                <MdCheckCircle size={24} style={{ color: 'rgba(168,85,247,0.3)' }} />
                <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Nothing queued</span>
              </div>
            ) : (
              awaitingApprovalTasks.map((task) => <QueueTaskCard key={task.id} task={task} onAction={handleTaskAction} />)
            )}
          </div>
        </div>
      </div>

      {/* Task Rate Chart */}
      <div
        style={{
          background: 'var(--bg-secondary, rgba(255,255,255,0.02))',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8,
          padding: '16px 20px',
        }}
      >
        <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 12 }}>Tasks Completed (Last 24h)</div>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={hourlyData}>
            <XAxis
              dataKey="hour"
              tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval={3}
            />
            <YAxis hide allowDecimals={false} />
            <Tooltip
              contentStyle={{
                background: '#1a1a1a',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6,
                fontSize: 12,
                color: '#fff',
              }}
            />
            <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={16}>
              {hourlyData.map((_, i) => (
                <Cell key={i} fill="rgba(255,255,255,0.2)" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
