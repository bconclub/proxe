'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  MdNotifications,
  MdMessage,
  MdBarChart,
  MdDescription,
  MdCheckCircle,
  MdError,
  MdSchedule,
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
  successRate: number
}

type FilterTab = 'all' | 'reminders' | 'follow_ups' | 'scoring' | 'other'

// --- Helpers ---

function taskTypeIcon(type: string) {
  if (type.includes('reminder')) return <MdNotifications size={16} />
  if (type.includes('follow')) return <MdMessage size={16} />
  if (type.includes('scor')) return <MdBarChart size={16} />
  return <MdDescription size={16} />
}

function statusPill(status: string) {
  const styles: Record<string, { bg: string; color: string; label: string }> = {
    completed: { bg: 'rgba(34,197,94,0.12)', color: '#22c55e', label: 'Completed' },
    failed: { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', label: 'Failed' },
    pending: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', label: 'Pending' },
    in_queue: { bg: 'rgba(107,114,128,0.12)', color: '#9ca3af', label: 'Queued' },
  }
  const s = styles[status] || styles.pending
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4 }}>
      {s.label}
    </span>
  )
}

function typeBadge(type: string) {
  const label = type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  return (
    <span style={{ fontSize: 11, color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4 }}>
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

function firesIn(scheduledAt: string | null): string {
  if (!scheduledAt) return ''
  const diff = new Date(scheduledAt).getTime() - Date.now()
  if (diff <= 0) return 'Overdue'
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `Fires in ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `Fires in ${hrs}h ${mins % 60}m`
  return `Fires at ${formatTime(scheduledAt)}`
}

function matchesFilter(task: AgentTask, filter: FilterTab): boolean {
  if (filter === 'all') return true
  if (filter === 'reminders') return task.task_type.includes('reminder')
  if (filter === 'follow_ups') return task.task_type.includes('follow')
  if (filter === 'scoring') return task.task_type.includes('scor') || task.task_type.includes('summary')
  // 'other'
  return !task.task_type.includes('reminder') && !task.task_type.includes('follow') && !task.task_type.includes('scor') && !task.task_type.includes('summary')
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

// --- Stat Card ---

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div
      style={{
        flex: '1 1 0',
        minWidth: 140,
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
  const [stats, setStats] = useState<Stats>({ completedToday: 0, failedToday: 0, pendingCount: 0, queuedCount: 0, successRate: 100 })
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

  useEffect(() => {
    fetchTasks()
    const interval = setInterval(fetchTasks, 30000) // refresh every 30s
    return () => clearInterval(interval)
  }, [fetchTasks])

  // Split into timeline (completed/failed) and upcoming (pending/in_queue)
  const timelineTasks = tasks
    .filter((t) => (t.status === 'completed' || t.status === 'failed') && matchesFilter(t, filter))
    .sort((a, b) => new Date(b.completed_at || b.created_at).getTime() - new Date(a.completed_at || a.created_at).getTime())

  const upcomingTasks = tasks
    .filter((t) => t.status === 'pending' || t.status === 'in_queue')
    .sort((a, b) => new Date(a.scheduled_at || a.created_at).getTime() - new Date(b.scheduled_at || b.created_at).getTime())

  const hourlyData = buildHourlyChart(tasks)

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Loading tasks…</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <h1 style={{ color: 'var(--text-primary)', fontSize: 18, fontWeight: 700, margin: 0 }}>Tasks</h1>

      {/* Stats Row */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatCard label="Completed Today" value={stats.completedToday} color="#22c55e" />
        <StatCard label="Pending" value={stats.pendingCount} color="#f59e0b" />
        <StatCard label="In Queue" value={stats.queuedCount} color="#9ca3af" />
        <StatCard label="Success Rate" value={`${stats.successRate}%`} color="var(--text-primary)" />
      </div>

      {/* Main Area */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {/* Left — Activity Timeline */}
        <div style={{ flex: '3 1 400px', minWidth: 0 }}>
          {/* Filter Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {(['all', 'reminders', 'follow_ups', 'scoring', 'other'] as FilterTab[]).map((tab) => (
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
                  {/* Timestamp */}
                  <div style={{ color: 'var(--text-secondary)', fontSize: 11, minWidth: 60, paddingTop: 2, flexShrink: 0 }}>
                    <div>{formatTime(task.completed_at || task.created_at)}</div>
                    <div style={{ opacity: 0.6 }}>{formatDate(task.completed_at || task.created_at)}</div>
                  </div>
                  {/* Icon */}
                  <div style={{ color: 'var(--text-secondary)', paddingTop: 1, flexShrink: 0 }}>
                    {taskTypeIcon(task.task_type)}
                  </div>
                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: 'var(--text-primary)', fontSize: 13, lineHeight: '18px' }}>
                      {task.task_description}
                    </div>
                    {task.lead_name && (
                      <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                        {task.lead_name} {task.lead_phone ? `(${task.lead_phone})` : ''}
                      </span>
                    )}
                    {task.status === 'failed' && task.error_message && (
                      <div style={{ color: '#ef4444', fontSize: 11, marginTop: 4 }}>
                        {task.error_message}
                      </div>
                    )}
                  </div>
                  {/* Status */}
                  <div style={{ flexShrink: 0 }}>{statusPill(task.status)}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right — Upcoming Queue */}
        <div style={{ flex: '2 1 280px', minWidth: 0 }}>
          <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14, marginBottom: 12 }}>
            Upcoming Queue
          </div>
          <div
            style={{
              background: 'var(--bg-secondary, rgba(255,255,255,0.02))',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
              maxHeight: 500,
              overflow: 'auto',
            }}
          >
            {upcomingTasks.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 16px', gap: 8 }}>
                <MdCheckCircle size={28} style={{ color: 'rgba(34,197,94,0.4)' }} />
                <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No tasks in queue</span>
              </div>
            ) : (
              upcomingTasks.map((task) => (
                <div
                  key={task.id}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-primary)', fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {task.task_description}
                    </span>
                    {typeBadge(task.task_type)}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                      {task.lead_name || 'Unknown lead'}
                    </span>
                    <span style={{ color: '#f59e0b', fontSize: 11, fontWeight: 500 }}>
                      {firesIn(task.scheduled_at)}
                    </span>
                  </div>
                </div>
              ))
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
