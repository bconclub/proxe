'use client'

/**
 * LogCallChat — the post-call decision, as a chat with PROXe (replaces the
 * static LogCallDecisionHub when features.logCallChat is on).
 *
 * Turn 0 is free: it reads the AI's suggestion from `propose` (no LLM chat call)
 * and renders PROXe's opening message + an "Accept the plan" card + tap chips.
 * The human types or taps; each turn hits log-call/chat and returns prose + new
 * chips + (once agreed) a validated PLAN rendered as a Confirm card. Nothing
 * fires until Confirm, which commits the whole bundle to log-call. Same props as
 * LogCallDecisionHub so the modal swap is one line.
 */

import { useEffect, useRef, useState } from 'react'
import { MdClose, MdSmartToy, MdPerson, MdSend, MdCheck, MdAutorenew } from 'react-icons/md'

interface Props {
  leadId: string
  leadName: string
  outcome: string
  notes: string
  onCancel: () => void
  onDone: () => void
}

// Local mirrors of lib/logcall/decisionPlan types + describeStep, so this client
// bundle never imports the server module (which pulls the note orchestrator).
type DecisionStep = { action: 'none' | 'book' | 'sequence' | 'task' | 'move' | 'close'; detail: Record<string, any> }
type DecisionPlan = { summary: string; steps: DecisionStep[]; reason?: string }
type ChatMsg = { role: 'user' | 'assistant'; content: string; chips?: string[]; plan?: DecisionPlan | null }

function describeStep(step: DecisionStep): string {
  const d = step.detail || {}
  const when = [d.date, d.time].filter(Boolean).join(' ')
  switch (step.action) {
    case 'book': return `Update booking to ${when || 'the scheduled time'}, with reminders`
    case 'task': return `Remind you${when ? ` on ${when}` : ''}${d.note ? `: ${d.note}` : ''}`
    case 'sequence': return `Hand back to the AI on the ${d.sequence} sequence`
    case 'move': return `Move the lead to ${d.stage}`
    case 'close': return `Close the lead as ${d.stage}`
    case 'none': return 'Go with the AI plan'
    default: return step.action
  }
}

const ACCENT = '#22c55e' // bcon accent is near-white, use an explicit color like the old hub

export default function LogCallChat({ leadId, leadName, outcome, notes, onCancel, onDone }: Props) {
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)   // turn 0 (propose)
  const [busy, setBusy] = useState(false)        // a chat turn in flight
  const [error, setError] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<Record<string, any> | null>(null)
  const [aiPlan, setAiPlan] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Turn 0: read the suggestion, no LLM chat call.
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
        setSnapshot(d.context_snapshot || null)
        setAiPlan(d.ai_proposed_plan || null)
        const plan = d.ai_proposed_plan
        const opening = plan?.reason
          ? `${plan.reason}${Array.isArray(plan.next_steps) && plan.next_steps.length ? `\n\nNext: ${plan.next_steps.join('. ')}.` : ''}`
          : `Call logged for ${leadName}. What do you want to do next?`
        setMessages([{
          role: 'assistant',
          content: opening,
          chips: ['Sounds good', 'I already booked it', 'Remind me to follow up', 'Move the stage'],
          // The opening is confirmable as-is: accept the AI plan.
          plan: { summary: 'Go with the AI plan', steps: [{ action: 'none', detail: {} }] },
        }])
      } catch (e: any) {
        if (alive) setMessages([{ role: 'assistant', content: `Call logged for ${leadName}. What do you want to do next?`, chips: ['Book a demo', 'Remind me to follow up', 'Move the stage'] }])
      } finally { if (alive) setLoading(false) }
    })()
    return () => { alive = false }
  }, [leadId, outcome, notes, leadName])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  // The newest assistant plan is the only confirmable one.
  const activePlan = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return messages[i].plan || null
    }
    return null
  })()

  const send = async (text: string) => {
    const q = text.trim()
    if (!q || busy) return
    setError(null)
    setInput('')
    const next: ChatMsg[] = [...messages, { role: 'user', content: q }]
    setMessages(next)
    setBusy(true)
    try {
      const history = next.map((m) => ({ role: m.role, content: m.content }))
      const r = await fetch(`/api/dashboard/leads/${leadId}/log-call/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome, notes: notes.trim() || undefined, history, ai_proposed_plan: aiPlan }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || `Chat failed (${r.status})`)
      if (d.context_snapshot) setSnapshot(d.context_snapshot)
      setMessages((cur) => [...cur, { role: 'assistant', content: d.answer, chips: d.chips || [], plan: d.plan || null }])
    } catch (e: any) {
      setError(e?.message || 'Chat failed')
      setMessages((cur) => cur.slice(0, -1))
      setInput(q)
    }
    setBusy(false)
  }

  const confirm = async () => {
    if (!activePlan || saving) return
    setSaving(true); setError(null)
    try {
      const chat_transcript = messages.map((m) => ({ role: m.role, content: m.content }))
      const decision_reason = [...messages].reverse().find((m) => m.role === 'user')?.content || null
      const r = await fetch(`/api/dashboard/leads/${leadId}/log-call`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outcome, notes: notes.trim() || undefined,
          decisions: activePlan.steps, decision_reason,
          ai_proposed_plan: aiPlan, context_snapshot: snapshot, chat_transcript,
        }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Failed (${r.status})`)
      onDone()
    } catch (e: any) {
      setError(e?.message || 'Failed to save'); setSaving(false)
    }
  }

  const chip = (label: string, val: any) => (val === null || val === undefined || val === '' ? null : (
    <span key={label} className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>{label}: <span style={{ color: 'var(--text-primary)' }}>{String(val)}</span></span>
  ))

  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="flex flex-col" style={{ width: '100%', maxWidth: 540, height: 'min(680px, 88vh)', background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 14, overflow: 'hidden' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>Call logged for {leadName}</div>
            {snapshot && (
              <div className="flex flex-wrap gap-1 mt-1">
                {chip('stage', snapshot.stage)}
                {chip('temp', snapshot.temperature)}
                {chip('score', snapshot.score)}
                {chip('days', snapshot.days_since_first_touch)}
              </div>
            )}
          </div>
          <button onClick={onCancel} className="p-1 rounded shrink-0" style={{ color: 'var(--text-secondary)' }} aria-label="Cancel"><MdClose size={18} /></button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <MdAutorenew className="animate-spin" size={14} /> Reading the context…
            </div>
          ) : messages.map((m, i) => {
            const isLastAssistant = m.role === 'assistant' && i === messages.length - 1
            return (
              <div key={i} className={m.role === 'user' ? 'flex justify-end gap-2' : 'flex gap-2'}>
                {m.role === 'assistant' && <span className="flex h-7 w-7 items-center justify-center rounded-full shrink-0 mt-0.5" style={{ background: 'var(--bg-hover)', color: ACCENT }}><MdSmartToy size={15} /></span>}
                <div className={m.role === 'user' ? 'max-w-[80%]' : 'max-w-[85%] min-w-0 flex-1'}>
                  <div className="rounded-2xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-line" style={{ background: m.role === 'user' ? `color-mix(in srgb, ${ACCENT} 15%, var(--bg-primary))` : 'var(--bg-primary)', border: m.role === 'assistant' ? '1px solid var(--border-primary)' : 'none', color: 'var(--text-primary)' }}>
                    {m.content}
                  </div>
                  {/* Confirm card: only the newest assistant plan */}
                  {m.role === 'assistant' && isLastAssistant && m.plan && (
                    <div className="mt-2 rounded-xl border p-3" style={{ borderColor: ACCENT, background: `color-mix(in srgb, ${ACCENT} 8%, var(--bg-primary))` }}>
                      <div className="text-[12px] font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>{m.plan.summary}</div>
                      <ul className="space-y-0.5 mb-2.5">
                        {m.plan.steps.map((s, j) => (
                          <li key={j} className="text-[12px] flex items-start gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                            <span style={{ color: ACCENT }}>•</span> {describeStep(s)}
                          </li>
                        ))}
                      </ul>
                      <button onClick={confirm} disabled={saving} className="w-full text-[12.5px] font-bold px-3 py-2 rounded-lg text-white disabled:opacity-40 flex items-center justify-center gap-1.5" style={{ background: ACCENT }}>
                        <MdCheck size={15} /> {saving ? 'Saving…' : 'Confirm'}
                      </button>
                    </div>
                  )}
                  {/* Chips: only under the newest assistant turn */}
                  {m.role === 'assistant' && isLastAssistant && (m.chips?.length || 0) > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {m.chips!.map((c) => (
                        <button key={c} onClick={() => send(c)} disabled={busy} className="text-[11.5px] px-2.5 py-1 rounded-full border transition-colors hover:opacity-80 disabled:opacity-40" style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)', background: 'var(--bg-primary)' }}>{c}</button>
                      ))}
                    </div>
                  )}
                </div>
                {m.role === 'user' && <span className="flex h-7 w-7 items-center justify-center rounded-full shrink-0 mt-0.5" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}><MdPerson size={15} /></span>}
              </div>
            )
          })}
          {busy && (
            <div className="flex items-center gap-2 text-xs pl-9" style={{ color: 'var(--text-muted)' }}>
              <span className="inline-block h-2 w-2 rounded-full animate-pulse" style={{ background: ACCENT }} /> PROXe is thinking…
            </div>
          )}
        </div>

        {/* Input */}
        <div className="px-3 py-2.5" style={{ borderTop: '1px solid var(--border-primary)' }}>
          {error && <div className="text-xs mb-1.5" style={{ color: '#ef4444' }}>{error}</div>}
          <form onSubmit={(e) => { e.preventDefault(); send(input) }} className="flex items-center gap-2 rounded-xl border px-3 py-1.5" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Tell PROXe what happened, or tap an option…" disabled={busy || loading} className="flex-1 text-[13px] bg-transparent outline-none min-w-0" style={{ color: 'var(--text-primary)' }} />
            <button type="submit" disabled={busy || loading || !input.trim()} className="p-1.5 rounded-lg shrink-0" style={{ color: input.trim() && !busy ? ACCENT : 'var(--text-muted)' }}><MdSend size={17} /></button>
          </form>
        </div>
      </div>
    </div>
  )
}
