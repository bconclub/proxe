'use client'

/**
 * LogCallDecisionHub — the human decision point after a call, as a centered modal.
 *
 * 1. On open it asks the API what it WOULD do (read-only `propose`), showing
 *    the lead context + the AI's proposed plan.
 * 2. The human confirms the plan or picks a different action (update/cancel
 *    booking, move lead, put in a sequence, add a reminder task).
 * 3. On confirm it commits to ../log-call with the full decision, which saves
 *    the learning record and marks the lead human-owned.
 *
 * Nothing fires until the human confirms. BCON accent is near-white, so the
 * primary button uses an explicit colour.
 */

import { useEffect, useState } from 'react'
import {
  MdClose, MdCheck, MdLightbulbOutline, MdEventAvailable,
  MdSwapHoriz, MdRepeat, MdNotificationsActive, MdBlock, MdAutorenew, MdErrorOutline,
} from 'react-icons/md'

interface Props {
  leadId: string
  leadName: string
  outcome: string
  notes: string
  onCancel: () => void
  onDone: () => void
}

type Plan = { category: string; action: string; reason: string; next_steps: string[] }
type HubAction = 'book' | 'move' | 'sequence' | 'task' | 'close' | 'none'

const MOVE_STAGES = ['Engaged', 'High Intent', 'Demo Taken', 'Proposal Sent', 'Nurture']
const CLOSE_STAGES = ['Converted', 'Closed Lost']
const SEQUENCES: Array<{ key: 'ghost' | 'engaged' | 'reengage'; label: string }> = [
  { key: 'ghost', label: 'Ghost — gentle nudges (day 1, 3, 7)' },
  { key: 'engaged', label: 'Engaged — follow-ups (day 1, 3, 5)' },
  { key: 'reengage', label: 'Re-engage — light touch in 2 days' },
]

const ACTIONS: Array<{ key: HubAction; label: string; desc: string; icon: React.ReactNode }> = [
  { key: 'book', label: 'Update booking', desc: 'Set / reschedule a demo + reminders', icon: <MdEventAvailable size={16} /> },
  { key: 'sequence', label: 'Put in a sequence', desc: 'Hand back to the AI on a cadence', icon: <MdRepeat size={16} /> },
  { key: 'task', label: 'Add a task for me', desc: 'Pick a time, it reminds you', icon: <MdNotificationsActive size={16} /> },
  { key: 'move', label: 'Move lead', desc: 'Push to another stage', icon: <MdSwapHoriz size={16} /> },
  { key: 'close', label: 'Close lead', desc: 'Won or lost', icon: <MdBlock size={16} /> },
]

export default function LogCallDecisionHub({ leadId, leadName, outcome, notes, onCancel, onDone }: Props) {
  const [loading, setLoading] = useState(true)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [snapshot, setSnapshot] = useState<Record<string, any> | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [action, setAction] = useState<HubAction>('none')
  const [reason, setReason] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [stage, setStage] = useState('')
  const [sequence, setSequence] = useState<'ghost' | 'engaged' | 'reengage'>('engaged')
  const [taskNote, setTaskNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const r = await fetch(`/api/dashboard/leads/${leadId}/log-call/propose`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ outcome, notes: notes.trim() || undefined }),
        })
        const d = await r.json().catch(() => ({}))
        if (!alive) return
        if (!r.ok) { setLoadError(d?.error || `Couldn't read a suggestion (${r.status})`) }
        else if (!d.ai_proposed_plan) { setLoadError('No suggestion returned') }
        else { setPlan(d.ai_proposed_plan); setSnapshot(d.context_snapshot || null) }
      } catch (e: any) {
        if (alive) setLoadError(e?.message || 'Network error reading the suggestion')
      } finally { if (alive) setLoading(false) }
    })()
    return () => { alive = false }
  }, [leadId, outcome, notes])

  const confirm = async () => {
    if (saving) return
    setSaving(true); setSaveError(null)
    try {
      const detail: Record<string, any> = {}
      if (action === 'book') { detail.date = date; detail.time = time }
      else if (action === 'move' || action === 'close') { detail.stage = stage }
      else if (action === 'sequence') { detail.sequence = sequence }
      else if (action === 'task') { detail.date = date; detail.time = time; detail.note = taskNote }
      const r = await fetch(`/api/dashboard/leads/${leadId}/log-call`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome, notes: notes.trim() || undefined, decision: { action, reason: reason.trim() || undefined, detail }, ai_proposed_plan: plan, context_snapshot: snapshot }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Failed (${r.status})`)
      onDone()
    } catch (e: any) { setSaveError(e?.message || 'Failed to save'); console.error('[hub] commit failed', e) }
    finally { setSaving(false) }
  }

  const stageList = action === 'close' ? CLOSE_STAGES : MOVE_STAGES
  const needsStage = action === 'move' || action === 'close'
  const canConfirm = action === 'none'
    || (action === 'book' && (date || time))
    || (needsStage && stage)
    || action === 'sequence'
    || (action === 'task' && (date || time))

  const chip = (label: string, val: any) => (val === null || val === undefined || val === '' ? null : (
    <span key={label} className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>{label}: <span style={{ color: 'var(--text-primary)' }}>{String(val)}</span></span>
  ))

  return (
    <div
      onClick={onCancel}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 520, maxHeight: '88vh', overflowY: 'auto', background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 14, padding: 18 }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Call logged for {leadName} — what next?</span>
          <button onClick={onCancel} className="p-1 rounded" style={{ color: 'var(--text-secondary)' }} aria-label="Cancel"><MdClose size={18} /></button>
        </div>

        {snapshot && (
          <div className="flex flex-wrap gap-1 mb-3">
            {chip('stage', snapshot.stage)}
            {chip('temp', snapshot.temperature)}
            {chip('score', snapshot.score)}
            {chip('interest', snapshot.service_interest)}
            {chip('pain', snapshot.pain_point)}
            {chip('days', snapshot.days_since_first_touch)}
          </div>
        )}

        {/* The AI's proposed plan — always shown (loading / plan / error) */}
        <div className="mb-3">
          <div className="text-[11px] uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>the brain suggests</div>
          {loading ? (
            <div className="flex items-center gap-2 text-xs p-3 rounded" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', color: 'var(--text-secondary)' }}>
              <MdAutorenew className="animate-spin" size={14} /> Reading the context…
            </div>
          ) : plan ? (
            <div className="flex items-start gap-2 p-3 rounded" style={{ background: 'rgba(34,197,94,0.10)', border: '1px solid #0F6E56' }}>
              <MdLightbulbOutline size={18} style={{ color: '#22c55e', marginTop: 1, flexShrink: 0 }} />
              <div className="min-w-0">
                <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{plan.reason}</p>
                {plan.next_steps?.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {plan.next_steps.map((s, i) => (
                      <li key={i} className="text-xs flex items-start gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                        <span style={{ color: '#22c55e' }}>•</span> {s}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 p-3 rounded text-xs" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.4)', color: 'var(--text-secondary)' }}>
              <MdErrorOutline size={16} style={{ color: '#ef4444', marginTop: 1, flexShrink: 0 }} />
              <span>Couldn’t read a suggestion: {loadError || 'unknown'}. You can still pick an action below.</span>
            </div>
          )}
        </div>

        <div className="text-[11px] uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>your decision</div>
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          <button onClick={() => setAction('none')} className="text-left p-2 rounded border" style={{ borderColor: action === 'none' ? '#22c55e' : 'var(--border-primary)', background: action === 'none' ? 'rgba(34,197,94,0.08)' : 'transparent' }}>
            <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--text-primary)' }}><MdCheck size={16} /> Accept the plan</span>
            <span className="block text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>Go with the suggestion above</span>
          </button>
          {ACTIONS.map((a) => (
            <button key={a.key} onClick={() => setAction(a.key)} className="text-left p-2 rounded border" style={{ borderColor: action === a.key ? '#22c55e' : 'var(--border-primary)', background: action === a.key ? 'rgba(34,197,94,0.08)' : 'transparent' }}>
              <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{a.icon} {a.label}</span>
              <span className="block text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>{a.desc}</span>
            </button>
          ))}
        </div>

        {(action === 'book' || action === 'task') && (
          <div className="flex gap-1.5 mb-2">
            <input value={date} onChange={(e) => setDate(e.target.value)} placeholder="date (e.g. jul 15, tomorrow)" className="flex-1 text-xs px-2 py-1.5 rounded border bg-transparent outline-none" style={{ borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }} />
            <input value={time} onChange={(e) => setTime(e.target.value)} placeholder="time (e.g. 3 pm)" className="w-24 text-xs px-2 py-1.5 rounded border bg-transparent outline-none" style={{ borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }} />
          </div>
        )}
        {action === 'task' && (
          <input value={taskNote} onChange={(e) => setTaskNote(e.target.value)} placeholder="what to do (e.g. send pricing for NICU)" className="w-full text-xs px-2 py-1.5 rounded border bg-transparent outline-none mb-2" style={{ borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }} />
        )}
        {needsStage && (
          <select value={stage} onChange={(e) => setStage(e.target.value)} className="w-full text-xs px-2 py-1.5 rounded border bg-transparent outline-none mb-2" style={{ borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}>
            <option value="">pick a stage…</option>
            {stageList.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {action === 'sequence' && (
          <select value={sequence} onChange={(e) => setSequence(e.target.value as any)} className="w-full text-xs px-2 py-1.5 rounded border bg-transparent outline-none mb-2" style={{ borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}>
            {SEQUENCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        )}

        <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="why this decision? (teaches the brain)" rows={2} className="w-full text-xs px-2 py-1.5 rounded border bg-transparent outline-none mb-2 resize-none" style={{ borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }} />

        {saveError && (
          <div className="text-xs mb-2" style={{ color: '#ef4444' }}>{saveError}</div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="text-xs px-3 py-1.5 rounded" style={{ color: 'var(--text-secondary)' }}>Cancel</button>
          <button onClick={confirm} disabled={!canConfirm || saving} className="text-xs px-3 py-1.5 rounded font-medium text-white disabled:opacity-40" style={{ background: '#22c55e' }}>{saving ? 'Saving…' : 'Confirm'}</button>
        </div>
      </div>
    </div>
  )
}
