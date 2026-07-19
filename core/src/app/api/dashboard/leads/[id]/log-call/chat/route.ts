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
- message: send the lead a short WhatsApp message right now. detail.text = the exact message. Use this for a warm thank-you after a call ("Thanks for your time on the call, looking forward to the demo"). Keep it 1 to 2 sentences, friendly, no placeholders.
- book: update/schedule a demo or call, with reminders. Needs a date and/or time.
- task: a follow-up reminder for the HUMAN (they get pinged). Needs a date and/or time, plus a short note.
- sequence: hand the lead back to the AI on a cadence (one of: ghost, engaged, reengage).
- move: move the lead to a stage, one of: ${MOVE_STAGES.join(', ')}.
- close: close the lead, one of: ${CLOSE_STAGES.join(', ')}.
- none: go with the AI's suggested plan as-is.

HOW TO TALK:
- The call already HAPPENED (the human just logged it). Never say "a call happened or a callback is planned". Speak as if the call is done.
- Open with ONE or TWO short sentences: where this lead stands and the single best next move. Do not list internal steps, stages, or scores.
- Default instinct after a connected call: offer to send a quick thank-you message now (the message action), especially if a demo is booked. Draft the actual text and let them confirm.
- If the human tells you something new (for example "I already booked it, demo tomorrow 4pm"), take it as truth and work from there.
- Ask for a missing detail (a date, a time, which stage) in plain words instead of guessing.
- You can BUNDLE actions when it helps: for example send a thank-you AND set the human a reminder. That is encouraged.
- Keep every message tight and practical. No markdown headings.
- NEVER use em dashes or en dashes. Use a comma or a period.
- Dates: resolve relative words ("tomorrow", "Friday") to a real date based on today_ist (${todayIST}). Times are 24h HH:MM.

OUTPUT FORMAT (plain text, in this order):
1. Your message to the human.
2. Then a line "FOLLOWUPS: a | b | c" with 2 or 3 short things the HUMAN might tap next (under 6 words each). Omit if nothing fits.
3. Then, ONLY once the action is fully agreed and every needed detail is known, a final line "PLAN: {json}" where json is:
   {"summary":"one line of what will happen","reason":"why (short)","steps":[{"action":"message|book|task|sequence|move|close|none","detail":{"text":"the message to send","date":"YYYY-MM-DD","time":"HH:MM","stage":"...","sequence":"...","note":"..."}}]}
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
