/**
 * Log-call CHAT — one turn of the post-call conversation with PROXe.
 *
 * The human logged a call; instead of a static suggestion + button grid, they
 * talk to PROXe. Each turn: rebuild the lead's context server-side, one LLM
 * call, return prose + tap chips + (once agreed) a validated decision PLAN the
 * client renders as a Confirm card. This route NEVER executes anything, only the
 * commit route (../log-call) does, and it re-validates.
 *
 * Trailer pattern (mirrors brain/route.ts): the model appends
 *   FOLLOWUPS: a | b | c
 *   PLAN: { ...json... }
 * both stripped + validated here. Bad output degrades to plain prose.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient, type CallOutcome } from '@/lib/services'
import { canAccessLeadId } from '@/lib/services/leadAccess'
import { getBrandConfig } from '@/configs'
import { generateResponse } from '@/lib/agent-core'
import { buildCallContextSnapshot, fetchRecentConversation } from '@/lib/services/logCallContext'
import { parsePlanTrailer, validatePlan, scrubDashes, MOVE_STAGES, CLOSE_STAGES } from '@/lib/logcall/decisionPlan'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const VALID_OUTCOMES: CallOutcome[] = ['Connected', 'No Answer', 'Busy', 'Voicemail']
const CHAT_MODEL = 'claude-sonnet-4-6'

function systemPrompt(brandName: string, persona: string, snapshot: any, outcome: string, notes: string, aiPlan: any, recent: any[], todayIST: string): string {
  const DATA = {
    lead: snapshot,
    call: { outcome, notes: notes || null },
    ai_suggested: aiPlan ? { action: aiPlan.action, reason: aiPlan.reason, next_steps: aiPlan.next_steps } : null,
    recent_messages: recent,
    today_ist: todayIST,
  }
  return `You are PROXe${persona ? persona : ''}, the AI teammate inside ${brandName}'s dashboard. A human just logged a call with this lead. Be their sharp, PREDICTIVE sales colleague: read the call notes, work out the best next moves yourself, and lay them out ready to confirm in one click. Do not interrogate them for things they already told you.

DATA (the only facts you may use, never invent anything outside it):
${JSON.stringify(DATA, null, 2)}

EVERY post-call decision has THREE parts. On your opening turn, address the ones that apply, in this order:
1. THE MESSAGE to the lead: recommend what to send them now (a template). You do NOT send it yourself, so just name what fits and tell them to tap "Send a thank-you" to pick the template. One short line.
2. THE FOLLOW-UP for the lead / system: what the SYSTEM does next for the customer. If the notes mention a demo or call that is booked, scheduled, or agreed for a time (even one the human booked themselves, e.g. "booked demo 4pm"), you MUST include a "book" step at that exact time. It records the booking and sets the customer's reminders. Never use "move" or "none" for a booked time. If there is no booking, a "sequence" cadence can be the follow-up instead.
3. THE NEXT STEP for the human handling it: a reminder task so they do not drop it (task).

WHAT YOU CAN SET UP (become confirmable actions in the PLAN):
- book: schedule/reschedule a demo or call, with reminders. date and/or time.
- task: a reminder for the HUMAN (they get pinged). date/time + short note.
- sequence: hand to an AI cadence (ghost, engaged, reengage).
- move: move to a stage (${MOVE_STAGES.join(', ')}).
- close: close the lead (${CLOSE_STAGES.join(', ')}).
- none: go with the AI's suggested plan.

BE PREDICTIVE, NOT INQUISITIVE:
- Read the call notes and extract everything the human said: times, what was agreed, what they want. If the notes say "booked demo 4pm, remind me an hour before", immediately propose book 16:00 AND a human reminder at 15:00. Never ask for what they already told you.
- Your OPENING message states the plan you have built (name the message to send, the booking/follow-up, and the human reminder), then you output the PLAN so they can one-click confirm.
- Only ask a question when a CRITICAL detail is genuinely missing from the notes AND cannot be sensibly defaulted. Then ask ONE specific thing with tappable answers, and hold the PLAN until you have it.
- If they change something later, adjust and re-propose.

RULES:
- The call already HAPPENED. Speak as if it is done. A booked/rescheduled/already-scheduled demo or call is ALWAYS "book" (never "move").
- The thank-you/message SEND is a separate template picker in the UI. Recommend it in prose, but NEVER put a message in the PLAN.
- Keep it tight and practical, no markdown headings. NEVER use em dashes or en dashes; use a comma or period.
- Resolve relative dates ("tomorrow", "Friday") from today_ist (${todayIST}). Times are 24h HH:MM.

OUTPUT FORMAT (plain text, in this order):
1. Your message to the human (state the plan; name the message-to-send if one fits).
2. "FOLLOWUPS: a | b | c" ONLY if you asked a specific question, giving 2 or 3 direct tappable ANSWERS. Omit it whenever you output a PLAN.
3. "PLAN: {json}" whenever you have a confirmable plan (on the opening turn you usually do), where json is:
   {"summary":"one line of what will happen","reason":"why (short)","steps":[{"action":"book|task|sequence|move|close|none","detail":{"date":"YYYY-MM-DD","time":"HH:MM","stage":"...","sequence":"...","note":"..."}}]}
   Include only the detail fields each action needs. Up to 3 steps. Output the PLAN only when the human can just confirm, never while still asking.`
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!getBrandConfig().features?.logCallChat) {
      return NextResponse.json({ error: 'Log-call chat is not enabled for this brand' }, { status: 403 })
    }

    const supabase = getServiceClient() || authClient
    const leadId = params.id
    if (user?.id && !(await canAccessLeadId(supabase, user.id, leadId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const outcome = body?.outcome as CallOutcome | undefined
    const notes = (body?.notes || '').toString().trim()
    const aiPlan = body?.ai_proposed_plan || null
    const history: Array<{ role: string; content: string }> = Array.isArray(body?.history) ? body.history.slice(-10) : []
    if (outcome && !VALID_OUTCOMES.includes(outcome)) {
      return NextResponse.json({ error: 'Invalid outcome' }, { status: 400 })
    }
    // Empty history = the OPENING turn (PROXe proposes proactively from the
    // notes). A non-empty history must end with a user turn.
    if (history.length > 0 && history[history.length - 1].role !== 'user') {
      return NextResponse.json({ error: 'history must end with a user turn' }, { status: 400 })
    }

    const [snapshot, recent] = await Promise.all([
      buildCallContextSnapshot(supabase, leadId),
      fetchRecentConversation(supabase, leadId, 8),
    ])

    const brand = getBrandConfig()
    const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    const system = systemPrompt(brand.name, brand.brain?.persona || '', snapshot, outcome || 'Connected', notes, aiPlan, recent, todayIST)

    // Flatten the transcript into the user prompt (same as brain/route.ts). On
    // the opening turn (no history), seed a proactive instruction so PROXe lays
    // out the plan from the call notes instead of waiting to be asked.
    const transcript = history.length
      ? history.map((h) => `${h.role === 'assistant' ? 'PROXe' : 'Human'}: ${String(h.content).slice(0, 2000)}`).join('\n')
      : 'Human: I just logged this call. Read my notes and lay out the plan (message to send, the follow-up, and my reminder). Do not ask me for what I already noted.'

    const raw = await generateResponse(system, transcript, 800, CHAT_MODEL, 'brain')

    // Strip PLAN first (greedy FOLLOWUPS regex would eat it), then FOLLOWUPS.
    const { text: afterPlan, plan: rawPlan } = parsePlanTrailer(raw)
    let answer = afterPlan
    let chips: string[] = []
    const fm = answer.match(/FOLLOWUPS:\s*(.+)\s*$/is)
    if (fm) {
      chips = fm[1].split('|').map((s) => scrubDashes(s.trim())).filter(Boolean).slice(0, 3)
      answer = answer.slice(0, fm.index).trim()
    }
    answer = scrubDashes(answer) || 'What would you like to do with this lead?'
    const plan = validatePlan(rawPlan)

    return NextResponse.json({ answer, chips, plan, context_snapshot: snapshot })
  } catch (error) {
    console.error('[log-call/chat] failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Chat failed' },
      { status: 500 },
    )
  }
}
