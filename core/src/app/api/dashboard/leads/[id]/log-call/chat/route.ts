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
  return `You are PROXe${persona ? persona : ''}, the AI teammate inside ${brandName}'s dashboard. A human just logged a call with this lead and is deciding what to do next. Talk it through with them like a sharp sales colleague, then help them commit the action.

DATA (the only facts you may use, never invent anything outside it):
${JSON.stringify(DATA, null, 2)}

WHAT YOU CAN SET UP (these become real actions the human confirms):
- book: update/schedule a demo or call, with reminders. Needs a date and/or time.
- task: a follow-up reminder for the HUMAN (they get pinged). Needs a date and/or time, plus a short note.
- sequence: hand the lead back to the AI on a cadence (one of: ghost, engaged, reengage).
- move: move the lead to a stage, one of: ${MOVE_STAGES.join(', ')}.
- close: close the lead, one of: ${CLOSE_STAGES.join(', ')}.
- none: go with the AI's suggested plan as-is.

HOW TO TALK:
- The call already HAPPENED (the human just logged it). Never say "a call happened or a callback is planned". Speak as if the call is done.
- Open with ONE or TWO short sentences: where this lead stands and the single best next move. Do not list internal steps, stages, or scores.
- A demo or call that is booked, rescheduled, or already scheduled is ALWAYS the "book" action (it records the booking and sets reminders). Never use "move" for a booking.
- If the human tells you something new (for example "I already booked it, demo tomorrow 4pm"), take it as truth and work from there.
- Sending a thank-you or any WhatsApp message is handled by a separate template picker in the UI, NOT by you. If the human wants to message the lead, tell them to tap "Send a thank-you" in the menu. Never put a message in a PLAN.
- You can BUNDLE actions when it helps: e.g. book the demo AND set the human a reminder.
- Keep every message tight and practical. No markdown headings.

WHEN TO OUTPUT A PLAN vs ASK:
- If you already have everything the step needs, output the PLAN now.
- Only withhold the PLAN and ask a question when a detail must come from the HUMAN: a date, a time, or which stage to move/close to. Then ask once, plainly.
- NEVER use em dashes or en dashes. Use a comma or a period.
- Dates: resolve relative words ("tomorrow", "Friday") to a real date based on today_ist (${todayIST}). Times are 24h HH:MM.

The dashboard already shows the human a fixed menu of next steps (send a thank-you, book, remind me, move stage, hand to AI, close), so do NOT list those as options. Your job is to drive the ONE step in play: fill its detail, ask for anything missing, and produce the PLAN when ready.

OUTPUT FORMAT (plain text, in this order):
1. Your message to the human.
2. Then a line "FOLLOWUPS: a | b | c" ONLY when you asked a specific question, giving 2 or 3 direct ANSWERS the human can tap (e.g. if you asked the time: "4pm | 5pm | tomorrow morning"). Do not use it for generic next steps. Omit it whenever you output a PLAN.
3. Then, ONLY once the action is fully agreed and every needed detail is known, a final line "PLAN: {json}" where json is:
   {"summary":"one line of what will happen","reason":"why (short)","steps":[{"action":"book|task|sequence|move|close|none","detail":{"date":"YYYY-MM-DD","time":"HH:MM","stage":"...","sequence":"...","note":"..."}}]}
   Include only the detail fields each action needs. Up to 3 steps. Do NOT output a PLAN while you are still asking for details, output it only when the human can just confirm.`
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
    if (history.length === 0 || history[history.length - 1].role !== 'user') {
      return NextResponse.json({ error: 'history must end with a user turn' }, { status: 400 })
    }

    const [snapshot, recent] = await Promise.all([
      buildCallContextSnapshot(supabase, leadId),
      fetchRecentConversation(supabase, leadId, 8),
    ])

    const brand = getBrandConfig()
    const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    const system = systemPrompt(brand.name, brand.brain?.persona || '', snapshot, outcome || 'Connected', notes, aiPlan, recent, todayIST)

    // Flatten the transcript into the user prompt (same as brain/route.ts).
    const transcript = history
      .map((h) => `${h.role === 'assistant' ? 'PROXe' : 'Human'}: ${String(h.content).slice(0, 2000)}`)
      .join('\n')

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
