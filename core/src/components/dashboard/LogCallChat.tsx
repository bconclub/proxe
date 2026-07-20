'use client'

/**
 * LogCallChat — the post-call decision, as a chat with PROXe (replaces the
 * static LogCallDecisionHub when features.logCallChat is on).
 *
 * Predictable by design: PROXe opens with one clean line and a RECOMMENDED next
 * step, and a FIXED menu of the same steps is always present. PROXe drives
 * book/remind/move/close/sequence conversationally. "Send a thank-you" is a
 * TEMPLATE picker (open WhatsApp text can't be sent outside the 24h window):
 * it lists the brand's approved templates that match the call outcome, or says
 * none is available. Nothing fires until Confirm. Same props as the old hub.
 */

import { useEffect, useRef, useState } from 'react'
import {
  MdClose, MdSend, MdCheck, MdAutorenew, MdPerson,
  MdOutlineWavingHand, MdEventAvailable, MdNotificationsActive,
  MdSwapHoriz, MdRepeat, MdBlock, MdWhatsapp,
} from 'react-icons/md'
import ProxeMark from '@/components/ProxeMark'

interface Props {
  leadId: string
  leadName: string
  outcome: string
  notes: string
  onCancel: () => void
  onDone: () => void
}

type StepAction = 'none' | 'book' | 'sequence' | 'task' | 'move' | 'close' | 'message'
type DecisionStep = { action: StepAction; detail: Record<string, any> }
type DecisionPlan = { summary: string; steps: DecisionStep[]; reason?: string }
type TemplateOpt = { name: string; preview: string; param_names: string[] }
type Usage = { tokens: number; input?: number; output?: number; cost_inr: number }
type ChatMsg = { role: 'user' | 'assistant'; content: string; chips?: string[]; plan?: DecisionPlan | null; templateOptions?: TemplateOpt[]; usage?: Usage }

function describeStep(step: DecisionStep): string {
  const d = step.detail || {}
  const when = [d.date, d.time].filter(Boolean).join(' ')
  switch (step.action) {
    case 'book': return `Update booking to ${when || 'the scheduled time'}, with reminders`
    case 'task': return `Remind you${when ? ` on ${when}` : ''}${d.note ? `: ${d.note}` : ''}`
    case 'sequence': return `Hand back to the AI on the ${d.sequence} sequence`
    case 'move': return `Move the lead to ${d.stage}`
    case 'close': return `Close the lead as ${d.stage}`
    case 'message': return `Send the "${d.template}" template now`
    case 'none': return 'Go with the AI plan'
    default: return step.action
  }
}

// The FIXED next-step menu (trimmed to the four that matter: message opens the
// template picker; book/task/close are conversational). Every menu key that a
// proposed plan touches gets highlighted, so "send thank-you + book + remind"
// all light up together. `rec` maps an AI-proposed action to a highlight.
const NEXT_STEPS: Array<{ key: string; label: string; icon: React.ReactNode; prompt?: string; rec: string[] }> = [
  { key: 'message', label: 'Send a thank-you', icon: <MdOutlineWavingHand size={15} />, rec: ['post_call', 'message', 'none'] },
  { key: 'book', label: 'Book / reschedule', icon: <MdEventAvailable size={15} />, prompt: 'Help me book or reschedule a demo for this lead.', rec: ['book'] },
  { key: 'task', label: 'Remind me', icon: <MdNotificationsActive size={15} />, prompt: 'Set me a follow-up reminder for this lead.', rec: [] },
  { key: 'close', label: 'Close lead', icon: <MdBlock size={15} />, prompt: 'Close this lead.', rec: ['close'] },
]
// Plan step action → the menu key it lights up.
const STEP_TO_KEY: Record<string, string> = { book: 'book', task: 'task', close: 'close', message: 'message' }

// Short chip labels + icons for the confirm card (compact, not a sentence).
const STEP_ICON: Record<string, React.ReactNode> = {
  book: <MdEventAvailable size={14} />,
  task: <MdNotificationsActive size={14} />,
  close: <MdBlock size={14} />,
  sequence: <MdRepeat size={14} />,
  move: <MdSwapHoriz size={14} />,
  message: <MdOutlineWavingHand size={14} />,
}
// Human date + time for the chips: relative day (Today/Tomorrow) or "Mon, 20
// Jul", and 12-hour time with AM/PM. Never a raw ISO string.
function fmtWhen(dateStr?: string, timeStr?: string): string {
  let dayLabel = ''
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, mo, da] = dateStr.split('-').map(Number)
    const dt = new Date(y, mo - 1, da)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const diff = Math.round((dt.getTime() - today.getTime()) / 86400000)
    dayLabel = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday'
      : dt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
  } else if (dateStr) {
    dayLabel = dateStr
  }
  let timeLabel = ''
  if (timeStr && /^\d{1,2}:\d{2}/.test(timeStr)) {
    const [h, m] = timeStr.split(':').map(Number)
    const ap = h >= 12 ? 'PM' : 'AM'
    timeLabel = `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${ap}`
  }
  return [dayLabel, timeLabel].filter(Boolean).join(', ')
}
function stepChipLabel(step: DecisionStep): string {
  const d = step.detail || {}
  const when = fmtWhen(d.date, d.time)
  switch (step.action) {
    case 'book': return `Book ${when || 'the slot'}, with reminders`
    case 'task': return `Remind you ${when || 'later'}`
    case 'close': return `Close: ${d.stage}`
    case 'sequence': return `AI ${d.sequence} sequence`
    case 'move': return `Move to ${d.stage}`
    case 'message': return `Template: ${d.template}`
    default: return step.action
  }
}

// Which approved templates fit the call outcome. Connected → a post-call
// thank-you; a missed call → an R&R / missed-call template.
function matchTemplates(templates: any[], outcome: string): TemplateOpt[] {
  const connected = outcome === 'Connected'
  const kw = connected
    ? ['thank', 'post_call', 'postcall', 'post-call']
    : ['rnr', 'r_r', 'missed', 'callback', 'no_answer', 'noanswer']
  return (templates || [])
    .filter((t) => String(t.status).toUpperCase() === 'APPROVED')
    .filter((t) => kw.some((k) => String(t.name).toLowerCase().includes(k)))
    .map((t) => {
      const body = (t.components || []).find((c: any) => c.type === 'BODY')?.text || ''
      const param_names = (body.match(/\{\{([^}]+)\}\}/g) || []).map((x: string) => x.replace(/[{}]/g, '').trim())
      return { name: t.name, preview: body.replace(/\s+/g, ' ').slice(0, 90), param_names }
    })
}

// Auto-pick the RIGHT post-call template for THIS call, by name keyword:
//   demo booked on the call → the demo-confirmed thank-you (…demo_booked…)
//   lead closed             → the opt-out message (…optout…)
//   missed call             → the callback message (…callback…)
//   else (interested)       → the general thank-you (…thankyou / …thank…)
// Returns the matched templates reordered best-first, so the top is the
// suggested send and the rest stay as one-tap overrides. Falls back gracefully
// when the preferred one isn't approved (keeps whatever matched).
function rankPostCall(matches: TemplateOpt[], outcome: string, steps: DecisionStep[]): TemplateOpt[] {
  const has = (a: StepAction) => (steps || []).some((s) => s.action === a)
  const prefer =
    outcome !== 'Connected' ? ['callback'] :
    has('book') ? ['demo_booked', 'demo'] :
    has('close') ? ['optout', 'opt_out', 'opt-out'] :
    ['thankyou', 'thank']
  const rank = (name: string) => {
    const n = name.toLowerCase()
    for (let i = 0; i < prefer.length; i++) if (n.includes(prefer[i])) return i
    // gentle fallback: a plain thank-you outranks any other leftover match
    return n.includes('thank') ? prefer.length : prefer.length + 1
  }
  return [...matches].sort((a, b) => rank(a.name) - rank(b.name))
}

// One-line reason for the auto-pick, shown to the operator.
function postCallReason(outcome: string, steps: DecisionStep[]): string {
  const has = (a: StepAction) => (steps || []).some((s) => s.action === a)
  if (outcome !== 'Connected') return 'a callback message'
  if (has('book')) return 'the demo-confirmed thank-you'
  if (has('close')) return 'the opt-out message'
  return 'a general thank-you'
}

// PROXe's avatar = the canonical PROXe mark (the same infinity logo the Ask
// PROXe dock uses), NOT the brand icon and never a generic robot glyph.
function ProxeAvatar({ size = 28 }: { size?: number }) {
  return (
    <span className="flex items-center justify-center rounded-full shrink-0" style={{ width: size, height: size, background: 'var(--bg-hover)' }}>
      <ProxeMark size={Math.round(size * 0.58)} color="var(--accent-primary)" />
    </span>
  )
}
function UserAvatar({ size = 26 }: { size?: number }) {
  return (
    <span className="flex items-center justify-center rounded-full shrink-0" style={{ width: size, height: size, background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
      <MdPerson size={Math.round(size * 0.6)} />
    </span>
  )
}

const ACCENT = '#22c55e'

export default function LogCallChat({ leadId, leadName, outcome, notes, onCancel, onDone }: Props) {
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<Record<string, any> | null>(null)
  const [aiPlan, setAiPlan] = useState<any>(null)
  const [recKey, setRecKey] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [templates, setTemplates] = useState<any[] | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      let aip: any = null
      try {
        // Snapshot + the recommended step highlight (fast, no LLM).
        const r = await fetch(`/api/dashboard/leads/${leadId}/log-call/propose`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ outcome, notes: notes.trim() || undefined }),
        })
        const d = await r.json().catch(() => ({}))
        if (!alive) return
        setSnapshot(d.context_snapshot || null)
        aip = d.ai_proposed_plan || null
        setAiPlan(aip)
        setRecKey(NEXT_STEPS.find((s) => s.rec.includes(aip?.action || 'post_call'))?.key || 'message')
      } catch { /* fall through to the predictive open */ }
      try {
        // Predictive opening: PROXe reads the call notes and lays out the plan.
        const cr = await fetch(`/api/dashboard/leads/${leadId}/log-call/chat`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ outcome, notes: notes.trim() || undefined, history: [], ai_proposed_plan: aip }),
        })
        const cd = await cr.json().catch(() => ({}))
        if (!alive) return
        if (cr.ok && cd.answer) {
          if (cd.context_snapshot) setSnapshot(cd.context_snapshot)
          setMessages([{ role: 'assistant', content: cd.answer, chips: cd.chips || [], plan: cd.plan || null, usage: cd.usage }])
        } else {
          setMessages([{ role: 'assistant', content: `Call logged for ${leadName}. What do you want to do next?` }])
        }
      } catch {
        if (alive) setMessages([{ role: 'assistant', content: `Call logged for ${leadName}. What do you want to do next?` }])
      } finally { if (alive) setLoading(false) }
    })()
    return () => { alive = false }
  }, [leadId, outcome, notes, leadName])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  const activePlan = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return messages[i].plan || null
    }
    return null
  })()

  // Every menu key the current proposal touches lights up together. From the
  // active plan's steps, plus the recommended step, plus a thank-you whenever a
  // plan exists on a connected call (the message send is always sensible then).
  const highlightKeys = (() => {
    const keys = new Set<string>()
    if (recKey) keys.add(recKey)
    if (activePlan) {
      for (const s of activePlan.steps) { const k = STEP_TO_KEY[s.action]; if (k) keys.add(k) }
      if (outcome === 'Connected') keys.add('message')
    }
    return keys
  })()

  const send = async (text: string) => {
    const q = text.trim()
    if (!q || busy) return
    setError(null); setInput('')
    const next: ChatMsg[] = [...messages, { role: 'user', content: q }]
    setMessages(next); setBusy(true)
    try {
      const history = next.map((m) => ({ role: m.role, content: m.content }))
      const r = await fetch(`/api/dashboard/leads/${leadId}/log-call/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome, notes: notes.trim() || undefined, history, ai_proposed_plan: aiPlan }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || `Chat failed (${r.status})`)
      if (d.context_snapshot) setSnapshot(d.context_snapshot)
      setMessages((cur) => [...cur, { role: 'assistant', content: d.answer, chips: d.chips || [], plan: d.plan || null, usage: d.usage }])
    } catch (e: any) {
      setError(e?.message || 'Chat failed'); setMessages((cur) => cur.slice(0, -1)); setInput(q)
    }
    setBusy(false)
  }

  // "Send a thank-you": load approved templates, match by outcome, and either
  // offer them to pick or say none is available. No LLM, no free text.
  const openThankYou = async () => {
    if (busy) return
    setBusy(true); setError(null)
    try {
      let tpls = templates
      if (!tpls) {
        const r = await fetch('/api/whatsapp/templates')
        const d = await r.json().catch(() => ({}))
        tpls = Array.isArray(d.templates) ? d.templates : []
        setTemplates(tpls)
      }
      const matches = matchTemplates(tpls || [], outcome)
      if (matches.length === 0) {
        const kind = outcome === 'Connected' ? 'post-call thank-you' : 'missed-call'
        setMessages((cur) => [...cur, { role: 'assistant', content: `There's no approved ${kind} template yet, so I can't send one (WhatsApp blocks open messages outside the 24 hour window). Add one from Configure, WhatsApp, then it will show up here.` }])
      } else {
        // Auto-pick the template that fits this call (demo booked / opt-out /
        // callback / general thank-you); confirm-ready, with the rest as overrides.
        const ranked = rankPostCall(matches, outcome, activePlan?.steps || [])
        const top = ranked[0]
        const why = postCallReason(outcome, activePlan?.steps || [])
        setMessages((cur) => [...cur, {
          role: 'assistant',
          content: ranked.length > 1
            ? `Based on this call, I'll send ${why}. Confirm below, or pick another.`
            : `Based on this call, I'll send ${why}. Confirm below.`,
          plan: { summary: `Send the ${top.name} template to ${leadName}`, steps: [{ action: 'message', detail: { template: top.name, param_names: top.param_names } }] },
          templateOptions: ranked.slice(1),
        }])
      }
    } catch (e: any) {
      setError(e?.message || 'Could not load templates')
    }
    setBusy(false)
  }

  const pickTemplate = (t: TemplateOpt) => {
    setMessages((cur) => [...cur, {
      role: 'assistant',
      content: `Ready to send "${t.name}".`,
      plan: { summary: `Send the ${t.name} template to ${leadName}`, steps: [{ action: 'message', detail: { template: t.name, param_names: t.param_names } }] },
    }])
  }

  const confirm = async () => {
    if (!activePlan || saving) return
    setSaving(true); setError(null)
    const messageOnly = activePlan.steps.every((s) => s.action === 'message')
    try {
      const chat_transcript = messages.map((m) => ({ role: m.role, content: m.content }))
      const decision_reason = [...messages].reverse().find((m) => m.role === 'user')?.content || null
      const r = await fetch(`/api/dashboard/leads/${leadId}/log-call`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome, notes: notes.trim() || undefined, decisions: activePlan.steps, decision_reason, ai_proposed_plan: aiPlan, context_snapshot: snapshot, chat_transcript }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || `Failed (${r.status})`)
      if (messageOnly) {
        // A template send is a light touch: keep the modal open so they can
        // continue (book, remind). Show what happened.
        const note = (d.actions_taken || []).find((a: string) => /template/i.test(a)) || 'Template sent.'
        setSaving(false)
        setMessages((cur) => [...cur.map((m) => ({ ...m, plan: null })), { role: 'assistant', content: `${note}. Anything else for this lead?` }])
      } else {
        onDone()
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to save'); setSaving(false)
    }
  }

  const chip = (label: string, val: any) => (val === null || val === undefined || val === '' ? null : (
    <span key={label} className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>{label}: <span style={{ color: 'var(--text-primary)' }}>{String(val)}</span></span>
  ))

  const lastAssistant = messages.reduce((acc, m, i) => (m.role === 'assistant' ? i : acc), -1)

  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="flex flex-col" style={{ width: '100%', maxWidth: 540, height: 'min(680px, 88vh)', background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 14, overflow: 'hidden' }}>
        <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <ProxeAvatar size={30} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>Call logged for {leadName}</div>
            {snapshot && (
              <div className="flex flex-wrap gap-1 mt-1">
                {chip('stage', snapshot.stage)}{chip('temp', snapshot.temperature)}{chip('score', snapshot.score)}{chip('days', snapshot.days_since_first_touch)}
              </div>
            )}
          </div>
          <button onClick={onCancel} className="p-1 rounded shrink-0" style={{ color: 'var(--text-secondary)' }} aria-label="Cancel"><MdClose size={18} /></button>
        </div>

        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
          {/* What the human logged (their input), shown up top. */}
          <div className="flex items-start gap-2 text-[12px] rounded-lg px-2.5 py-2" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
            <span className="font-semibold shrink-0" style={{ color: 'var(--text-primary)' }}>You logged</span>
            <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: 'var(--bg-primary)', color: 'var(--text-muted)' }}>{outcome}</span>
            {notes.trim() && <span className="min-w-0">{notes.trim()}</span>}
          </div>
          {loading ? (
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}><MdAutorenew className="animate-spin" size={14} /> Reading the context…</div>
          ) : messages.map((m, i) => {
            const isLastAssistant = i === lastAssistant
            return (
              <div key={i} className={m.role === 'user' ? 'flex justify-end gap-2' : 'flex gap-2'}>
                {m.role === 'assistant' && <ProxeAvatar size={26} />}
                <div className={m.role === 'user' ? 'max-w-[80%]' : 'max-w-[85%] min-w-0 flex-1'}>
                  <div className="rounded-2xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-line" style={{ background: m.role === 'user' ? `color-mix(in srgb, ${ACCENT} 15%, var(--bg-primary))` : 'var(--bg-primary)', border: m.role === 'assistant' ? '1px solid var(--border-primary)' : 'none', color: 'var(--text-primary)' }}>
                    {m.content}
                  </div>

                  {/* Per-turn token + cost watermark, right corner of the box. */}
                  {m.role === 'assistant' && m.usage && (
                    <div className="text-right text-[9.5px] mt-0.5 pr-1 tabular-nums" style={{ color: 'var(--text-muted)' }} title={`${m.usage.input ?? 0} in / ${m.usage.output ?? 0} out tokens this turn`}>
                      {m.usage.tokens.toLocaleString()} tok · ₹{m.usage.cost_inr < 1 ? m.usage.cost_inr.toFixed(3) : m.usage.cost_inr.toFixed(2)}
                    </div>
                  )}

                  {/* Template picker options */}
                  {m.role === 'assistant' && (m.templateOptions?.length || 0) > 0 && (
                    <div className="space-y-1.5 mt-2">
                      {m.templateOptions!.map((t) => (
                        <button key={t.name} onClick={() => pickTemplate(t)} className="w-full text-left rounded-xl border p-2.5 transition-colors hover:opacity-90" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <MdWhatsapp size={13} style={{ color: '#25D366' }} />
                            <span className="text-[12px] font-semibold font-mono truncate" style={{ color: 'var(--text-primary)' }}>{t.name}</span>
                          </div>
                          <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{t.preview}</div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Confirm card: newest assistant plan, shown as step chips */}
                  {m.role === 'assistant' && isLastAssistant && m.plan && (
                    <div className="mt-2 rounded-xl border p-3" style={{ borderColor: ACCENT, background: `color-mix(in srgb, ${ACCENT} 8%, var(--bg-primary))` }}>
                      <div className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Here is what I will set up</div>
                      <div className="flex flex-wrap gap-1.5 mb-2.5">
                        {outcome === 'Connected' && (
                          <button onClick={openThankYou} className="flex items-center gap-1.5 text-[11.5px] font-medium px-2.5 py-1.5 rounded-lg border transition-colors hover:opacity-90" style={{ borderColor: ACCENT, background: `color-mix(in srgb, ${ACCENT} 12%, transparent)`, color: 'var(--text-primary)' }} title="Pick the template to send">
                            <MdOutlineWavingHand size={14} style={{ color: ACCENT }} /> Send a thank-you
                          </button>
                        )}
                        {m.plan.steps.map((s, j) => (
                          <span key={j} className="flex items-center gap-1.5 text-[11.5px] font-medium px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)' }}>
                            <span style={{ color: ACCENT }}>{STEP_ICON[s.action] || <MdCheck size={14} />}</span> {stepChipLabel(s)}
                          </span>
                        ))}
                      </div>
                      <button onClick={confirm} disabled={saving} className="w-full text-[12.5px] font-bold px-3 py-2 rounded-lg text-white disabled:opacity-40 flex items-center justify-center gap-1.5" style={{ background: ACCENT }}><MdCheck size={15} /> {saving ? 'Saving…' : 'Confirm'}</button>
                    </div>
                  )}

                  {/* Contextual quick-answers */}
                  {m.role === 'assistant' && isLastAssistant && !m.plan && (m.chips?.length || 0) > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {m.chips!.map((c) => (<button key={c} onClick={() => send(c)} disabled={busy} className="text-[11.5px] px-2.5 py-1 rounded-full border transition-colors hover:opacity-80 disabled:opacity-40" style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)', background: 'var(--bg-primary)' }}>{c}</button>))}
                    </div>
                  )}
                </div>
                {m.role === 'user' && <UserAvatar size={26} />}
              </div>
            )
          })}
          {busy && (<div className="flex items-center gap-2 text-xs pl-8" style={{ color: 'var(--text-muted)' }}><span className="inline-block h-2 w-2 rounded-full animate-pulse" style={{ background: ACCENT }} /> Working…</div>)}
        </div>

        {/* Fixed, predictable next-steps menu */}
        <div className="px-3 pt-2" style={{ borderTop: '1px solid var(--border-primary)' }}>
          <div className="text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-muted)' }}>Next steps</div>
          <div className="grid grid-cols-2 gap-1.5">
            {NEXT_STEPS.map((s) => {
              const lit = highlightKeys.has(s.key)
              return (
                <button key={s.key} onClick={() => (s.key === 'message' ? openThankYou() : send(s.prompt!))} disabled={busy || loading}
                  className="flex items-center gap-1.5 text-[11.5px] font-medium px-2.5 py-1.5 rounded-lg border text-left transition-colors hover:opacity-80 disabled:opacity-40"
                  style={{ borderColor: lit ? ACCENT : 'var(--border-primary)', background: lit ? `color-mix(in srgb, ${ACCENT} 10%, var(--bg-primary))` : 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  title={lit ? 'PROXe suggests this' : undefined}>
                  <span style={{ color: lit ? ACCENT : 'var(--text-secondary)' }}>{s.icon}</span>
                  <span className="truncate">{s.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="px-3 py-2.5">
          {error && <div className="text-xs mb-1.5" style={{ color: '#ef4444' }}>{error}</div>}
          <form onSubmit={(e) => { e.preventDefault(); send(input) }} className="flex items-center gap-2 rounded-xl border px-3 py-1.5" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Tell PROXe what happened, or tap a step…" disabled={busy || loading} className="flex-1 text-[13px] bg-transparent outline-none min-w-0" style={{ color: 'var(--text-primary)' }} />
            <button type="submit" disabled={busy || loading || !input.trim()} className="p-1.5 rounded-lg shrink-0" style={{ color: input.trim() && !busy ? ACCENT : 'var(--text-muted)' }}><MdSend size={17} /></button>
          </form>
        </div>
      </div>
    </div>
  )
}
