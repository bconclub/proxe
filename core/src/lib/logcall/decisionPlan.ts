// Log-call chat DECISION PLAN — the trust boundary between PROXe's chat output
// and the commit route that actually executes. Modeled on lib/brain/actions.ts:
// the model emits a trailing "PLAN: {...}" line; the server strips it, validates
// every step against whitelists, and only a validated plan can reach Confirm.
//
// A plan can bundle several steps (the founder's "two-way" case: update a
// booking AND set a human follow-up). Nothing here executes; execution is the
// existing commit route (log-call/route.ts), which re-validates.

import { LEAD_STAGE_VALUES } from '@/configs/lead-stages'
import { resolveBookingDate } from '@/lib/services'

export type DecisionAction = 'none' | 'book' | 'sequence' | 'task' | 'move' | 'close' | 'message'
export type SequenceKey = 'ghost' | 'engaged' | 'reengage'

export interface DecisionDetail {
  stage?: string
  sequence?: SequenceKey
  date?: string
  time?: string
  note?: string
  // action: message — an APPROVED WhatsApp template (open text can't be sent
  // outside the 24h window). param_names are the template's named body vars,
  // resolved from the lead server-side at send time.
  template?: string
  param_names?: string[]
}
export interface DecisionStep {
  action: DecisionAction
  detail: DecisionDetail
}
export interface DecisionPlan {
  summary: string
  steps: DecisionStep[]
  reason?: string
}

// Stages a human may MOVE a lead to (curated subset) vs CLOSE stages. Both are
// cross-checked against the canonical taxonomy so a rename there can't leave a
// dead value here.
export const MOVE_STAGES = ['Engaged', 'High Intent', 'Demo Taken', 'Proposal Sent', 'Nurture']
  .filter((s) => LEAD_STAGE_VALUES.includes(s))
export const CLOSE_STAGES = ['Closed Won', 'Closed Lost']
  .filter((s) => LEAD_STAGE_VALUES.includes(s))
export const SEQUENCES: Array<{ key: SequenceKey; label: string }> = [
  { key: 'ghost', label: 'Ghost, gentle nudges (day 1, 3, 7)' },
  { key: 'engaged', label: 'Engaged, follow-ups (day 1, 3, 5)' },
  { key: 'reengage', label: 'Re-engage, light touch in 2 days' },
]

const ACTIONS: DecisionAction[] = ['none', 'book', 'sequence', 'task', 'move', 'close', 'message']
const SEQ_KEYS: SequenceKey[] = ['ghost', 'engaged', 'reengage']
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/

// Founder rule: no em/en dashes in any user-visible generated text. Applied to
// every model-authored string before it leaves the server.
export function scrubDashes(s: string): string {
  return String(s || '').replace(/\s*[—–]\s*/g, ', ')
}

// Strip the trailing "PLAN: {...}" line. Run BEFORE the FOLLOWUPS regex (that
// one is greedy across newlines and would swallow this).
export function parsePlanTrailer(raw: string): { text: string; plan: any | null } {
  const m = raw.match(/\n?PLAN:\s*(\{[\s\S]*\})\s*$/)
  if (!m) return { text: raw, plan: null }
  const text = raw.slice(0, m.index).trimEnd()
  try {
    return { text, plan: JSON.parse(m[1]) }
  } catch {
    return { text, plan: null }
  }
}

function validateStep(raw: any): DecisionStep | null {
  if (!raw || typeof raw !== 'object') return null
  const action = String(raw.action || '').trim() as DecisionAction
  if (!ACTIONS.includes(action)) return null
  const rd = raw.detail && typeof raw.detail === 'object' ? raw.detail : {}
  const detail: DecisionDetail = {}

  if (action === 'move') {
    if (!MOVE_STAGES.includes(rd.stage)) return null
    detail.stage = rd.stage
  } else if (action === 'close') {
    if (!CLOSE_STAGES.includes(rd.stage)) return null
    detail.stage = rd.stage
  } else if (action === 'sequence') {
    if (!SEQ_KEYS.includes(rd.sequence)) return null
    detail.sequence = rd.sequence
  } else if (action === 'book' || action === 'task') {
    // Needs at least a date or a time; both are range-checked through the same
    // resolver the commit route uses, so a garbage date is caught here.
    const date = typeof rd.date === 'string' ? rd.date.trim().slice(0, 40) : ''
    const time = typeof rd.time === 'string' && TIME_RE.test(rd.time.trim()) ? rd.time.trim() : ''
    if (!date && !time) return null
    try {
      const d = resolveBookingDate(date || 'tomorrow', time || null)
      if (isNaN(d.getTime())) return null
    } catch {
      return null
    }
    if (date) detail.date = date
    if (time) detail.time = time
    if (action === 'task' && typeof rd.note === 'string') detail.note = scrubDashes(rd.note).slice(0, 200)
  } else if (action === 'message') {
    const template = typeof rd.template === 'string' ? rd.template.trim().slice(0, 120) : ''
    if (!template) return null
    detail.template = template
    if (Array.isArray(rd.param_names)) detail.param_names = rd.param_names.filter((x: any) => typeof x === 'string').slice(0, 10)
  }
  // action 'none' needs no detail.
  return { action, detail }
}

// Validate a raw steps array into trusted steps: max 3, at most one stage-setter
// (move|close|book all imply a stage). Invalid steps dropped. Used by both the
// chat route (in validatePlan) and the commit route (re-check before executing).
export function validateSteps(rawSteps: any): DecisionStep[] {
  if (!Array.isArray(rawSteps)) return []
  const steps: DecisionStep[] = []
  let stageSetters = 0
  for (const s of rawSteps.slice(0, 3)) {
    const step = validateStep(s)
    if (!step) continue
    if (step.action === 'move' || step.action === 'close' || step.action === 'book') {
      if (stageSetters >= 1) continue // one stage change per plan
      stageSetters++
    }
    steps.push(step)
  }
  return steps
}

// Validate a raw PLAN object into a trusted DecisionPlan, or null (degrade to
// prose). Summary required.
export function validatePlan(raw: any): DecisionPlan | null {
  if (!raw || typeof raw !== 'object') return null
  const steps = validateSteps(raw.steps)
  if (steps.length === 0) return null
  const summary = scrubDashes(typeof raw.summary === 'string' ? raw.summary : '').slice(0, 300)
  if (!summary) return null
  const reason = typeof raw.reason === 'string' ? scrubDashes(raw.reason).slice(0, 300) : undefined
  return { summary, steps, reason }
}

// Deterministic, human-readable label for a step on the confirmation card.
// Never model-authored, so the card can't be gamed by prompt output.
export function describeStep(step: DecisionStep): string {
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
