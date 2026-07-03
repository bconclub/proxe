/**
 * Stage Test Bench — fire any follow-up STAGE's real message to the test phone
 * so we can read exactly how it lands before a real lead ever sees it.
 *
 * Sends as a free-form interactive message (body + quick-reply buttons) via the
 * 24h window — no Meta template approval needed — so we can iterate copy freely.
 * Every send goes ONLY to TEST_NUMBER and threads into that number's own chat
 * (stamped test_mode so the inbox shows the TEST badge). Real leads never touched.
 *
 * GET  -> list the stages + rendered previews (single source for the Brain UI).
 * POST { stage } -> render + send that stage to the test phone.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendWhatsAppInteractiveButtons, sendWhatsAppText, logSystemWhatsApp } from '@/lib/services/whatsappSender'

export const dynamic = 'force-dynamic'

// The test phone (its lead is "Thanzeel"); ALL bench sends land here.
const TEST_NUMBER = '919731660933'

// A realistic engaged lead — we "know" their name, interest and stated pain —
// so the previews read like the real thing. Tune freely; this is the test fixture.
const SAMPLE = { name: 'Shiv', business: 'a laundry business', service_interest: 'AI customer acquisition', pain_point: 'getting consistent leads' }

// Engaged journey, beautiful + context-aware. Bodies mirror / improve on the
// worker's engaged templates (followup_engaged, reengagement_engaged) and lean
// on what we know (their words, business, pain) instead of a generic line.
type Stage = { id: string; label: string; when: string; body: string; buttons: string[] }
const STAGES: Stage[] = [
  {
    id: 'engaged_nudge',
    label: 'Nudge while waiting',
    when: 'right after the chat',
    body: `Hi ${SAMPLE.name}, loved digging into ${SAMPLE.service_interest} for ${SAMPLE.business}. Whenever you're ready, I'll map out exactly how it would work for you. Want to pick it back up?`,
    buttons: ["Yes, let's go", 'A quick question'],
  },
  {
    id: 'engaged_push',
    label: 'Push to book',
    when: 'next day',
    body: `Hi ${SAMPLE.name}, the fastest way to see this in action is a short AI Brand Audit, we map ${SAMPLE.service_interest} to ${SAMPLE.business} live. Want me to find a time?`,
    buttons: ['Book a call', 'Not yet'],
  },
  {
    id: 'reengage_engaged',
    label: 'Re-engage (we know them)',
    when: 'gone quiet a while',
    body: `Hi ${SAMPLE.name}, you mentioned ${SAMPLE.pain_point} was the real challenge. We've been solving exactly that for businesses like yours lately, worth a quick chat?`,
    buttons: ["Yes, let's talk", 'Tell me more'],
  },
]

function clean(s: string): string {
  return s.replace(/\s*[—–]\s*/g, ' - ')
}

export async function GET() {
  return NextResponse.json({
    testNumber: TEST_NUMBER,
    sample: SAMPLE,
    stages: STAGES.map((s) => ({ ...s, body: clean(s.body) })),
  })
}

export async function POST(req: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let payload: any = {}
  try { payload = (await req.json()) || {} } catch { /* noop */ }

  // Two modes, both ONLY to the test number:
  //  { stage }                       -> a predefined engaged-journey stage
  //  { body, buttons?, label? }      -> ANY custom step (the Eval simulator
  //                                     fires each journey step through this)
  let stage: Stage | null = STAGES.find((s) => s.id === (payload.stage || '')) || null
  if (!stage && typeof payload.body === 'string' && payload.body.trim()) {
    stage = {
      id: 'custom',
      label: String(payload.label || 'Journey step').slice(0, 60),
      when: 'manual test',
      body: String(payload.body).slice(0, 1024),
      buttons: Array.isArray(payload.buttons) ? payload.buttons.map((b: any) => String(b).slice(0, 20)).slice(0, 3) : [],
    }
  }
  if (!stage) return NextResponse.json({ error: 'Unknown stage' }, { status: 400 })

  const body = clean(stage.body)
  // Buttons → interactive message; none → plain text (interactive requires 1-3).
  const res: { success: boolean; error?: string; messageId?: string } = stage.buttons.length > 0
    ? await sendWhatsAppInteractiveButtons(TEST_NUMBER, body, stage.buttons, { footerText: `TEST · ${stage.label}` })
    : await sendWhatsAppText(TEST_NUMBER, body)

  // Thread it into the test number's own chat, flagged as a test send so the
  // inbox shows the TEST badge (never logged against a real lead).
  if (res.success) {
    await logSystemWhatsApp(TEST_NUMBER, body, 'text', {
      kind: 'stage_test',
      stage: stage.id,
      stage_label: stage.label,
      quick_reply_buttons: stage.buttons,
      test_mode: true,
      test_recipient: TEST_NUMBER,
      wa_message_id: res.messageId || undefined,
    })
  }

  return NextResponse.json({
    success: res.success,
    error: res.error || null,
    rendered: body,
    buttons: stage.buttons,
    sentTo: TEST_NUMBER,
  })
}
