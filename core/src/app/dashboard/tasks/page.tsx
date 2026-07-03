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
  MdAccessTime,
  MdFormatListBulleted,
  MdCalendarToday,
  MdExpandMore,
  MdFilterList,
  MdWarningAmber,
  MdCancel,
  MdPerson,
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

// --- Board view helpers (redesigned page) ---

type BoardTask = {
  id: string; lead_id: string | null; lead_name: string | null; task_type: string
  status: string; scheduled_at: string | null; channel?: string; preview?: string
  actor?: { label: string; kind: 'human' | 'proxe' }; reason?: string
  sequence_label?: string | null; action?: string
}

function chanIcon(channel?: string) {
  if (channel === 'voice') return <MdPhoneInTalk size={13} style={{ color: '#8b5cf6' }} />
  if (channel === 'web') return <MdLanguage size={13} style={{ color: '#3b82f6' }} />
  return <MdWhatsapp size={13} style={{ color: '#22c55e' }} />
}

function fmtCountdown(ms: number | null): string {
  if (ms == null) return '—'
  const m = Math.round(ms / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60), rm = m % 60
  return rm ? `${h}h ${rm}m` : `${h}h`
}

const boardBtn = (bg: string, color: string): React.CSSProperties => ({
  fontSize: 11, fontWeight: 600, padding: '4px 11px', borderRadius: 6,
  border: 'none', cursor: 'pointer', background: bg, color, whiteSpace: 'nowrap',
})

function KpiCard({ label, value, sub, subColor, icon, accent }: { label: string; value: string; sub?: string; subColor?: string; icon: React.ReactNode; accent: string }) {
  return (
    <div style={{ flex: '1 1 0', minWidth: 170, background: 'var(--bg-secondary, rgba(255,255,255,0.02))', border: '1px solid var(--border-primary, rgba(255,255,255,0.08))', borderRadius: 12, padding: '16px 18px', display: 'flex', gap: 13, alignItems: 'center' }}>
      <div style={{ width: 44, height: 44, borderRadius: '50%', background: `${accent}26`, color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginBottom: 3, fontWeight: 500 }}>{label}</div>
        <div style={{ color: 'var(--text-primary)', fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ color: subColor || 'var(--text-muted)', fontSize: 11, marginTop: 4, fontWeight: subColor ? 600 : 400 }}>{sub}</div>}
      </div>
    </div>
  )
}

// --- Header pill control (visual / non-functional) ---

function HeaderPill({ icon, label, caret }: { icon?: React.ReactNode; label: string; caret?: boolean }) {
  return (
    <button
      style={{
        display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500,
        padding: '7px 12px', borderRadius: 8, cursor: 'pointer',
        background: 'var(--bg-secondary, rgba(255,255,255,0.02))',
        border: '1px solid var(--border-primary, rgba(255,255,255,0.08))',
        color: 'var(--text-secondary)', whiteSpace: 'nowrap',
      }}
    >
      {icon}
      <span>{label}</span>
      {caret && <MdExpandMore size={16} style={{ opacity: 0.7 }} />}
    </button>
  )
}

// --- "View all" inline link ---

function ViewAll({ label = 'View all' }: { label?: string }) {
  return (
    <span style={{ color: 'var(--accent-primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>{label}</span>
  )
}

// --- Featured "UP NEXT" card ---

function UpNextCard({ t, onAction, onLead }: { t: BoardTask; onAction: (id: string, a: string, s?: string) => void; onLead: (t: BoardTask) => void }) {
  const [reSched, setReSched] = useState(false)
  const [reTime, setReTime] = useState('')
  const fireTime = t.scheduled_at ? formatTime(t.scheduled_at) : ''
  const fireMs = t.scheduled_at ? Math.max(0, new Date(t.scheduled_at).getTime() - Date.now()) : null
  return (
    <div style={{
      margin: 14, padding: '14px 16px', borderRadius: 12,
      border: '1px solid var(--accent-primary)', background: 'var(--accent-subtle, rgba(255,255,255,0.04))',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--accent-primary)', background: 'var(--accent-subtle, rgba(255,255,255,0.06))', border: '1px solid var(--accent-primary)', padding: '2px 8px', borderRadius: 999 }}>UP NEXT</span>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ color: '#3b82f6', fontSize: 13, fontWeight: 700 }}>Firing in {fmtCountdown(fireMs)}</div>
          {fireTime && <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>at {fireTime}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
        {chanIcon(t.channel)}
        <span onClick={() => onLead(t)} style={{ color: 'var(--text-primary)', fontSize: 15, fontWeight: 700, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.lead_name || 'Unknown'}</span>
        {typeBadge(t.task_type)}
      </div>
      {t.preview && <div style={{ color: 'var(--text-secondary)', fontSize: 12.5, lineHeight: '17px', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{t.preview}</div>}
      <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
        <button style={{ fontSize: 12, fontWeight: 600, padding: '7px 16px', borderRadius: 7, border: 'none', cursor: 'pointer', background: '#3b82f6', color: '#fff' }} onClick={() => onAction(t.id, 'send_now')}>Send now</button>
        <button style={{ fontSize: 12, fontWeight: 600, padding: '7px 14px', borderRadius: 7, cursor: 'pointer', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-primary, rgba(255,255,255,0.15))' }} onClick={() => setReSched(v => !v)}>Reschedule</button>
        <button style={{ fontSize: 12, fontWeight: 600, padding: '7px 14px', borderRadius: 7, cursor: 'pointer', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-primary, rgba(255,255,255,0.15))' }} onClick={() => onAction(t.id, 'skip')}>Skip</button>
        <button style={{ marginLeft: 'auto', fontSize: 16, fontWeight: 700, padding: '2px 8px', borderRadius: 6, cursor: 'pointer', background: 'transparent', color: 'var(--text-muted)', border: 'none', lineHeight: 1 }} title="More">⋮</button>
      </div>
      {reSched && (
        <div style={{ display: 'flex', gap: 6, paddingTop: 2 }}>
          <input type="datetime-local" value={reTime} onChange={e => setReTime(e.target.value)} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border-primary, rgba(255,255,255,0.15))', background: 'var(--bg-secondary)', color: 'var(--text-primary)', flex: 1 }} />
          <button style={boardBtn('rgba(59,130,246,0.25)', '#3b82f6')} onClick={() => { if (reTime) { onAction(t.id, 'reschedule', new Date(reTime).toISOString()); setReSched(false) } }}>Confirm</button>
        </div>
      )}
    </div>
  )
}

// --- Compact next-to-fire row (non-featured) ---

function FireRow({ t, onAction, onLead }: { t: BoardTask; onAction: (id: string, a: string, s?: string) => void; onLead: (t: BoardTask) => void }) {
  const [reSched, setReSched] = useState(false)
  const [reTime, setReTime] = useState('')
  const inlineBtn: React.CSSProperties = { fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 5, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border-primary, rgba(255,255,255,0.12))', color: 'var(--text-secondary)' }
  return (
    <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border-primary, rgba(255,255,255,0.05))', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 9, alignItems: 'center', minWidth: 0 }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600, minWidth: 50, flexShrink: 0 }}>{formatTime(t.scheduled_at)}</span>
        {chanIcon(t.channel)}
        <div style={{ minWidth: 0, flex: 1 }}>
          <span onClick={() => onLead(t)} style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{t.lead_name || 'Unknown'}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 7 }}>{t.task_type.replace(/_/g, ' ')}</span>
          {t.preview && <div style={{ color: 'var(--text-secondary)', fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.8 }}>{t.preview}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 5, alignItems: 'center', paddingLeft: 59 }}>
        <button style={{ ...inlineBtn, color: '#22c55e', borderColor: 'rgba(34,197,94,0.4)' }} onClick={() => onAction(t.id, 'send_now')}>Send now</button>
        <button style={inlineBtn} onClick={() => setReSched(v => !v)}>Reschedule</button>
        <button style={inlineBtn} onClick={() => onAction(t.id, 'skip')}>Skip</button>
        <button style={{ ...inlineBtn, border: 'none', fontSize: 14, padding: '2px 6px' }} title="More">⋮</button>
      </div>
      {reSched && (
        <div style={{ display: 'flex', gap: 6, paddingTop: 2, paddingLeft: 59 }}>
          <input type="datetime-local" value={reTime} onChange={e => setReTime(e.target.value)} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border-primary, rgba(255,255,255,0.15))', background: 'var(--bg-secondary)', color: 'var(--text-primary)', flex: 1 }} />
          <button style={boardBtn('rgba(59,130,246,0.25)', '#3b82f6')} onClick={() => { if (reTime) { onAction(t.id, 'reschedule', new Date(reTime).toISOString()); setReSched(false) } }}>Confirm</button>
        </div>
      )}
    </div>
  )
}

function FireCard({ t, onAction, onLead }: { t: BoardTask; onAction: (id: string, a: string, s?: string) => void; onLead: (t: BoardTask) => void }) {
  const [reSched, setReSched] = useState(false)
  const [reTime, setReTime] = useState('')
  return (
    <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
          {chanIcon(t.channel)}
          <span onClick={() => onLead(t)} style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.lead_name || 'Unknown'}</span>
        </div>
        {typeBadge(t.task_type)}
      </div>
      {t.preview && <div style={{ color: 'var(--text-secondary)', fontSize: 12, lineHeight: '16px', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{t.preview}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button style={boardBtn('rgba(34,197,94,0.15)', '#22c55e')} onClick={() => onAction(t.id, 'send_now')}>Send now</button>
          <button style={boardBtn('rgba(59,130,246,0.15)', '#3b82f6')} onClick={() => setReSched(v => !v)}>Reschedule</button>
          <button style={boardBtn('rgba(148,163,184,0.15)', '#94a3b8')} onClick={() => onAction(t.id, 'skip')}>Skip</button>
        </div>
        <CountdownTimer scheduledAt={t.scheduled_at} />
      </div>
      {reSched && (
        <div style={{ display: 'flex', gap: 6, paddingTop: 4 }}>
          <input type="datetime-local" value={reTime} onChange={e => setReTime(e.target.value)} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', flex: 1 }} />
          <button style={boardBtn('rgba(59,130,246,0.25)', '#3b82f6')} onClick={() => { if (reTime) { onAction(t.id, 'reschedule', new Date(reTime).toISOString()); setReSched(false) } }}>Confirm</button>
        </div>
      )}
    </div>
  )
}

/** Compact "Nm ago" relative time from an ISO string. */
function timeAgo(iso?: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) return 'now'
  const m = Math.round(diff / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function AttnCard({ t, onAction, onLead }: { t: BoardTask; onAction: (id: string, a: string, s?: string) => void; onLead: (t: BoardTask) => void }) {
  // action key -> { button label, action verb, status-line text, status icon + color }
  const ACTIONS: Record<string, { label: string; act: string; statusLine: string; icon: React.ReactNode; iconColor: string }> = {
    approve: { label: 'Approve', act: 'send_now', statusLine: 'Awaiting approval', icon: <MdNotifications size={16} />, iconColor: '#f59e0b' },
    retry: { label: 'Retry', act: 'retry', statusLine: 'Delivery failed', icon: <MdCancel size={16} />, iconColor: '#ef4444' },
    fix_template: { label: 'Fix', act: 'fix_template', statusLine: 'Template missing', icon: <MdWarningAmber size={16} />, iconColor: '#ef4444' },
    update_contact: { label: 'Update', act: 'update_contact', statusLine: 'Contact not synced', icon: <MdPerson size={16} />, iconColor: '#f59e0b' },
  }
  const a = ACTIONS[t.action || 'approve'] || ACTIONS.approve
  const btnPrimary: React.CSSProperties = {
    fontSize: 11.5, fontWeight: 600, padding: '5px 14px', borderRadius: 6, cursor: 'pointer',
    background: 'var(--accent-subtle, rgba(255,255,255,0.06))', color: 'var(--accent-primary)',
    border: '1px solid var(--accent-primary)', whiteSpace: 'nowrap',
  }
  return (
    <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-primary, rgba(255,255,255,0.05))', display: 'flex', gap: 11, alignItems: 'flex-start' }}>
      <div style={{ width: 30, height: 30, borderRadius: '50%', background: `${a.iconColor}26`, color: a.iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{a.icon}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        {/* Top line: lead + time on the left, action button pinned top-right so
            the card stays short (no dedicated button row below). */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            <span onClick={() => onLead(t)} style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.lead_name || 'Unknown'}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>{timeAgo(t.scheduled_at)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <button style={btnPrimary} onClick={() => a.act === 'update_contact' ? onLead(t) : a.act === 'fix_template' ? onLead(t) : onAction(t.id, a.act)} title={a.act === 'fix_template' ? 'Fix this template in Meta WhatsApp Manager' : undefined}>{a.label}</button>
            {/* Small dismiss control — drop the task without sending (skip). */}
            <button
              onClick={() => onAction(t.id, 'skip')}
              title="Remove this task (dismiss without sending)"
              aria-label="Remove task"
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 17, lineHeight: 1, padding: '2px 4px', borderRadius: 4 }}
            >
              ×
            </button>
          </div>
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 3, textTransform: 'capitalize' }}>{t.task_type.replace(/_/g, ' ')}</div>
        <div style={{ color: a.iconColor, fontSize: 11.5, fontWeight: 500, marginTop: 2 }}>{a.statusLine}</div>
      </div>
    </div>
  )
}

function UpcomingGroup({ title, items, onLead }: { title: string; items: BoardTask[]; onLead: (t: BoardTask) => void }) {
  if (!items.length) return null
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', padding: '10px 16px 5px' }}>
        <MdAccessTime size={13} style={{ opacity: 0.7 }} />
        <span>{title}</span>
        <span style={{ opacity: 0.6 }}>· {items.length}</span>
      </div>
      {items.map(t => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 16px', borderBottom: '1px solid var(--border-primary, rgba(255,255,255,0.04))' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600, minWidth: 50, flexShrink: 0 }}>{formatTime(t.scheduled_at)}</span>
          {chanIcon(t.channel)}
          <div style={{ flex: 1, minWidth: 0 }}>
            <span onClick={() => onLead(t)} style={{ color: 'var(--text-primary)', fontSize: 12.5, cursor: 'pointer', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.lead_name || 'Unknown'}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'capitalize' }}>{t.task_type.replace(/_/g, ' ')}</span>
          </div>
          <span style={{ fontSize: 10.5, fontWeight: 600, color: '#22c55e', background: 'rgba(34,197,94,0.12)', padding: '2px 8px', borderRadius: 999, flexShrink: 0 }}>Scheduled</span>
        </div>
      ))}
    </div>
  )
}

const colBox: React.CSSProperties = {
  background: 'var(--bg-secondary, rgba(255,255,255,0.02))',
  border: '1px solid var(--border-primary, rgba(255,255,255,0.08))', borderRadius: 12, flex: 1, overflow: 'auto',
}

/** Panel header: bold title + count + right-aligned "View all" link. */
function PanelHead({ title, count, viewAll }: { title: string; count?: number | string; viewAll?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
      <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 14 }}>
        {title}
        {count != null && <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 12, marginLeft: 6 }}>· {count}</span>}
      </div>
      {viewAll && <ViewAll label={viewAll} />}
    </div>
  )
}

/** Bottom-of-panel link, e.g. "View full schedule →". */
function PanelFootLink({ label }: { label: string }) {
  return (
    <div style={{ padding: '10px 16px', textAlign: 'center', borderTop: '1px solid var(--border-primary, rgba(255,255,255,0.05))' }}>
      <span style={{ color: 'var(--accent-primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{label}</span>
    </div>
  )
}

/** Activity-table status pill with colored dot/icon. */
function activityStatusPill(status: string) {
  const map: Record<string, { color: string; label: string }> = {
    completed: { color: '#22c55e', label: 'Completed' },
    sent: { color: '#3b82f6', label: 'Sent' },
    failed: { color: '#ef4444', label: 'Failed' },
    failed_24h_window: { color: '#ef4444', label: 'Failed' },
    recovered: { color: '#f59e0b', label: 'Recovered' },
  }
  const s = map[status] || { color: '#9ca3af', label: status }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: s.color, background: `${s.color}1f`, padding: '2px 9px', borderRadius: 999 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
      {s.label}
    </span>
  )
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 16px', gap: 8 }}>
      {icon}
      <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{text}</span>
    </div>
  )
}

// --- Main Page ---

export default function TasksPage() {
  const router = useRouter()
  const [tasks, setTasks] = useState<AgentTask[]>([])
  const [board, setBoard] = useState<any>(null)
  const [stats, setStats] = useState<Stats>({ completedToday: 0, failedToday: 0, pendingCount: 0, queuedCount: 0, firingNextHour: 0, successRate: 100 })
  const [loading, setLoading] = useState(true)
  const [selectedLead, setSelectedLead] = useState<any>(null)
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false)
  const [completedFilter, setCompletedFilter] = useState<'all' | 'completed' | 'failed'>('all')
  const [next24hFilter, setNext24hFilter] = useState<'all' | 'pending' | 'queued'>('all')
  const [upcomingFilter, setUpcomingFilter] = useState<'all' | 'reminders' | 'nudges' | 'follow_ups'>('all')

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/tasks', { cache: 'no-store' })
      const data = await res.json()
      setTasks(data.tasks || [])
      setBoard(data.board || null)
      if (data.stats) setStats(data.stats)
    } catch (err) {
      console.error('Failed to fetch tasks:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleTaskAction = useCallback(async (taskId: string, action: string, scheduledAt?: string) => {
    // Optimistic UI: react to the click INSTANTLY so it never feels like nothing
    // happened. Approve → the card leaves "Needs Attention" and shows under "Next
    // to Fire" (queued to fire on the worker's next run); skip → it just drops.
    // The refetch below reconciles with the server + the worker's actual result.
    setBoard((prev: any) => {
      if (!prev) return prev
      const card = prev.needsAttention?.find((t: any) => t.id === taskId)
      if (!card) return prev
      const needsAttention = prev.needsAttention.filter((t: any) => t.id !== taskId)
      if (action === 'send_now') {
        return { ...prev, needsAttention, nextToFire: [{ ...card, status: 'pending' }, ...(prev.nextToFire || [])] }
      }
      return { ...prev, needsAttention }
    })
    try {
      const res = await fetch(`/api/dashboard/tasks/${taskId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, scheduled_at: scheduledAt }),
        cache: 'no-store',
      })
      const data = await res.json()
      if (!data.success) console.error('Task action failed:', data.error)
    } catch (err) {
      console.error('Task action error:', err)
    } finally {
      fetchTasks() // reconcile with the server (and the worker's result)
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
  // Board payload (KPIs + buckets + previews) from the tasks API.
  const b = board || { kpis: {}, nextToFire: [], needsAttention: [], upcoming: {}, activity: [] }
  const up = b.upcoming || {}
  const onLead = (t: BoardTask) => handleLeadClick({ lead_id: t.lead_id, lead_name: t.lead_name, lead_phone: null } as any)
  void tasks; void stats; void completedFilter; void next24hFilter; void upcomingFilter
  void setCompletedFilter; void setNext24hFilter; void setUpcomingFilter

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Loading tasks...</span>
      </div>
    )
  }

  const nextFireTime = b.kpis?.nextFiresInMs != null ? formatTime(new Date(Date.now() + b.kpis.nextFiresInMs).toISOString()) : null
  const upcomingTotal = (up.soon?.length || 0) + (up.today?.length || 0) + (up.tomorrow?.length || 0) + (up.later?.length || 0)

  return (
    // Lock the page to one viewport (the dashboard <main> is scrollable + has
    // py-6, so subtract 3rem). Each panel below scrolls internally — no page scroll.
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: 'calc(100vh - 3rem)', overflow: 'hidden' }}>
      <style>{`@keyframes taskPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ color: 'var(--text-primary)', fontSize: 24, fontWeight: 700, margin: 0 }}>Tasks</h1>
          <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>Automated follow-ups and queued actions</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <HeaderPill icon={<MdCalendarToday size={14} />} label="Today" />
          <HeaderPill label="Last 7 days" caret />
          <HeaderPill icon={<MdFilterList size={15} />} label="Filters" />
        </div>
      </div>

      {/* KPI Row — five cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <KpiCard label="Next fire" value={b.kpis?.nextFiresInMs != null ? fmtCountdown(b.kpis.nextFiresInMs) : '—'} sub={nextFireTime ? `at ${nextFireTime}` : 'Nothing queued'} icon={<MdAccessTime size={20} />} accent="#3b82f6" />
        <KpiCard label="Completed today" value={String(b.kpis?.completedToday ?? stats.completedToday ?? 0)} sub="Today" icon={<MdCheckCircle size={20} />} accent="#22c55e" />
        <KpiCard label="Queued" value={String(b.kpis?.queued ?? stats.queuedCount ?? 0)} sub="Scheduled actions" icon={<MdFormatListBulleted size={20} />} accent="#3b82f6" />
        <KpiCard label="Awaiting approval" value={String(b.kpis?.awaitingApproval ?? 0)} sub="Needs your review" icon={<MdNotifications size={20} />} accent="#f59e0b" />
        <KpiCard label="Automation success" value={`${b.kpis?.successRate7d ?? 100}%`} sub="Last 7 days" icon={<MdBarChart size={20} />} accent="#a855f7" />
      </div>

      {/* Main: Left (Next to Fire) + Right (split) */}
      <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>

        {/* Col 1: Next to Fire — full length (left) */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <PanelHead title="Next to Fire" viewAll="View all" />
          <div style={{ ...colBox, display: 'flex', flexDirection: 'column' }}>
            {b.nextToFire.length === 0
              ? <Empty icon={<MdCheckCircle size={28} style={{ color: 'rgba(34,197,94,0.4)' }} />} text="Nothing approved to fire" />
              : (<>
                  <div style={{ flex: 1, overflow: 'auto' }}>
                    {b.nextToFire.map((t: BoardTask, i: number) =>
                      i === 0
                        ? <UpNextCard key={t.id} t={t} onAction={handleTaskAction} onLead={onLead} />
                        : <FireRow key={t.id} t={t} onAction={handleTaskAction} onLead={onLead} />
                    )}
                  </div>
                  <PanelFootLink label="View full schedule →" />
                </>)}
          </div>
        </div>

        {/* Col 2: Needs Attention — full length, internal scroll */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <PanelHead title="Needs Attention" count={b.needsAttention.length} viewAll="View all" />
          <div style={{ ...colBox, display: 'flex', flexDirection: 'column' }}>
            {b.needsAttention.length === 0
              ? <Empty icon={<MdCheckCircle size={28} style={{ color: 'rgba(34,197,94,0.4)' }} />} text="All clear" />
              : (<>
                  <div style={{ flex: 1, overflow: 'auto' }}>
                    {b.needsAttention.map((t: BoardTask) => <AttnCard key={t.id} t={t} onAction={handleTaskAction} onLead={onLead} />)}
                  </div>
                  <PanelFootLink label="View all issues →" />
                </>)}
          </div>
        </div>

        {/* Col 3: right — Upcoming Queue (top) over Recent Activity (bottom).
            Each scrolls internally so nothing pushes the page past one viewport. */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>

          {/* Upcoming Queue — top */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <PanelHead title="Upcoming Queue" count={upcomingTotal} viewAll="View all" />
            <div style={{ ...colBox, display: 'flex', flexDirection: 'column' }}>
              {upcomingTotal === 0
                ? <Empty icon={<MdSchedule size={28} style={{ color: 'rgba(245,158,11,0.4)' }} />} text="No upcoming tasks" />
                : (<>
                    <div style={{ flex: 1, overflow: 'auto' }}>
                      <UpcomingGroup title="Next hour" items={up.soon || []} onLead={onLead} />
                      <UpcomingGroup title="Later today" items={up.today || []} onLead={onLead} />
                      <UpcomingGroup title="Tomorrow" items={up.tomorrow || []} onLead={onLead} />
                      <UpcomingGroup title="Later" items={up.later || []} onLead={onLead} />
                    </div>
                    <PanelFootLink label="View full schedule →" />
                  </>)}
            </div>
          </div>

          {/* Recent Activity — bottom (compact feed; fits the narrow column) */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <PanelHead title="Recent Activity" viewAll="View all logs →" />
            <div style={{ ...colBox, display: 'flex', flexDirection: 'column' }}>
              {b.activity.length === 0
                ? <Empty icon={<MdScheduleSend size={24} style={{ opacity: 0.4 }} />} text="No recent activity" />
                : (
                  <div style={{ flex: 1, overflow: 'auto' }}>
                    {b.activity.map((a: any) => (
                      <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 14px', borderBottom: '1px solid var(--border-primary, rgba(255,255,255,0.05))' }}>
                        {chanIcon(a.channel)}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                            <span onClick={() => onLead(a)} style={{ color: 'var(--text-primary)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.lead_name || 'Unknown'}</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: 10.5, flexShrink: 0, whiteSpace: 'nowrap' }}>{formatTime(a.at)}</span>
                          </div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }} title={a.outcome}>{a.outcome}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                            {activityStatusPill(a.status)}
                            <span style={{ fontSize: 10, color: a.actor?.kind === 'human' ? '#f59e0b' : '#8b5cf6', fontWeight: 600 }}>{a.actor?.label || 'Automation'}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </div>
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
