// Brand-private (NOT in the shared manifest). The FULL message-permutation map
// for the Brain's Eval tab: every path a lead can take and every message each
// path fires, mirroring the worker's real routing (task-worker.js
// resolveTaskTemplate / noteOrchestrator ladders / buildTieredNudge).
// KEEP IN SYNC with task-worker.js TEMPLATE_BUTTONS + the ladders there.
import { TEMPLATE_BODIES } from './template-bodies'

/** Mirror of the worker's TEMPLATE_BUTTONS (task-worker.js). */
export const TEMPLATE_BUTTONS: Record<string, string[]> = {
  bcon_proxe_followup_engaged: ["Yes, let's go"],
  bcon_proxe_followup_noengage: ['Yes, tell me more', 'Just exploring'],
  bcon_proxe_booking_reminder_24h: ["Yes, I'll be there", 'No, I need to reschedule'],
  bcon_proxe_booking_reminder_30m: ["I'm ready!"],
  bcon_proxe_reengagement_engaged: ["Yes, let's talk"],
  bcon_proxe_reengagement_noengage: ['Yes Lets Talk'],
  bcon_lead_machine_meta_welcome_v1_: ['Yes, Book a Demo', 'Tell me more in chat'],
  bcon_welcome_web_v1: ['Book a Call', 'Tell Me More'],
  bcon_onetouch_d1_v1: ['Getting more leads', 'Managing follow-ups', 'Creating content', 'Ads not working', 'Website not converting', 'No time for marketing', 'Something else'],
  bcon_onetouch_d3_v1: ['Book a Call', 'Not Needed Now', 'STOP'],
  bcon_onetouch_d7_v1: ['Lets Talk', 'Not Needed Now', 'STOP'],
  bcon_onetouch_d30_v1: ['Book a call', 'Call back in 1 month', 'Not needed', 'STOP'],
  bcon_lowtouch_d1_v1: ['Yes, Book a Call', 'Follow Up Later'],
  bcon_lowtouch_d3_v1: ['Yes, Book a Call', 'Not a Priority now', 'STOP'],
  bcon_lowtouch_d7_v1: ['Yes, Book a Call', 'Not a Priority now', 'STOP'],
}

// Bodies the agent configs don't carry (worker/Meta-side) — shown honestly.
const EXTRA_BODIES: Record<string, string> = {
  bcon_welcome_web_v1: `Hey {{customer_name}}, got your enquiry about {{service_interest}} for {{brand_name}}.\n\n{{probe_question}}, Lets get on call to discuss this.`,
}

export function bodyFor(template: string | null): string | null {
  if (!template) return null
  return TEMPLATE_BODIES[template] || EXTRA_BODIES[template] || null
}

export type JourneyStep = {
  label: string
  delay: string
  template: string | null      // Meta template name, or null when free-form/AI
  freeform?: string            // free-form body (worker-composed), when no template
  note?: string                // gate / behaviour note
}

export type Journey = {
  id: string
  title: string
  trigger: string              // what puts a lead on this path
  who: string
  stop: string
  tone: string                 // accent color for the UI
  steps: JourneyStep[]
}

/**
 * Every path through the system. Step timings and template routing mirror the
 * worker + noteOrchestrator. This is DISPLAY truth for Eval — the send-time
 * truth lives in task-worker.js.
 */
export const JOURNEYS: Journey[] = [
  {
    id: 'entry',
    title: 'Entry — the first message per source',
    trigger: 'A brand-new lead arrives',
    who: 'Everyone, exactly once. The source decides the welcome.',
    stop: 'One send. Their reply routes them to a journey below.',
    tone: '#8B5CF6',
    steps: [
      { label: 'Website form', delay: 'instant', template: 'bcon_welcome_web_v1', note: 'Filled with their selected interest + typed message + company.' },
      { label: 'Web chat', delay: 'after they state a goal', template: 'bcon_welcome_web_v1', note: 'Deferred until the first real message/button so the goal is real (never "General Inquiry").' },
      { label: 'Meta — AI Lead Machine', delay: 'instant (first_outreach task)', template: 'bcon_lead_machine_meta_welcome_v1_' },
      { label: 'WhatsApp direct', delay: 'instant', template: null, freeform: `Hi, welcome to BCON Club. I'm PROXe, BCON's marketing AI.\n\nWe help businesses get more customers using AI. What brings you here?`, note: 'Prompt v4 quick-reply greeting with buttons: Explore Services · More about BCON · Book a call.' },
      { label: 'Voice call in', delay: 'no message', template: null, note: 'Voice sessions log to the timeline; no WhatsApp welcome fires.' },
    ],
  },
  {
    id: 'ghost',
    title: 'Ghost — never replied (ONE_TOUCH)',
    trigger: 'Welcome sent, zero replies',
    who: 'Leads that went silent from the start.',
    stop: 'Any reply exits the ladder. STOP unsubscribes.',
    tone: '#94a3b8',
    steps: [
      { label: 'Day 1', delay: '+24h', template: 'bcon_onetouch_d1_v1' },
      { label: 'Day 3', delay: '+3 days', template: 'bcon_onetouch_d3_v1' },
      { label: 'Day 7', delay: '+7 days', template: 'bcon_onetouch_d7_v1' },
      { label: 'Day 30', delay: '+30 days', template: 'bcon_onetouch_d30_v1', note: 'Polite goodbye - "reach back anytime".' },
      { label: 'Day 90', delay: '+90 days', template: 'bcon_proxe_reengagement_noengage' },
    ],
  },
  {
    id: 'rnr',
    title: 'RNR — call rang, no response',
    trigger: 'A logged call note classifies RNR / no answer / busy / voicemail',
    who: 'Leads the team tried to call and could not reach.',
    stop: 'Stops the moment they reply. Cancels any prior ladder first (no double-enrolment).',
    tone: '#f59e0b',
    steps: [
      { label: 'Missed-call follow-up', delay: '+30 min', template: 'bcon_proxe_followup_noengage' },
      { label: 'Day 1', delay: '+1 day', template: 'bcon_proxe_followup_noengage' },
      { label: 'Day 3', delay: '+3 days', template: 'bcon_proxe_followup_noengage' },
      { label: 'Day 5', delay: '+5 days', template: 'bcon_proxe_reengagement_noengage' },
      { label: 'Re-engage', delay: '+7 days', template: 'bcon_proxe_reengagement_noengage' },
    ],
  },
  {
    id: 'demo',
    title: 'Demo taken / proposal sent (low-touch)',
    trigger: 'A note logs DEMO_TAKEN or PROPOSAL_SENT',
    who: 'Warm leads after a real conversation.',
    stop: 'Stops on reply or booking.',
    tone: '#22c55e',
    steps: [
      { label: 'Day 1', delay: '+1 day', template: 'bcon_lowtouch_d1_v1' },
      { label: 'Day 3', delay: '+3 days', template: 'bcon_lowtouch_d3_v1' },
      { label: 'Day 5-7', delay: '+5 days', template: 'bcon_lowtouch_d7_v1' },
    ],
  },
  {
    id: 'engaged',
    title: 'Engaged, not booked',
    trigger: 'Chatting well, no booking yet',
    who: 'Replying leads that stall before the call.',
    stop: 'Stops as soon as they book.',
    tone: '#3b82f6',
    steps: [
      { label: 'Nudge while waiting', delay: 'after the chat', template: 'bcon_proxe_followup_engaged' },
      { label: 'Push to book', delay: 'next day', template: 'bcon_proxe_followup_engaged' },
    ],
  },
  {
    id: 'booked',
    title: 'Booked — the call path',
    trigger: 'A call gets scheduled',
    who: 'Every booked lead.',
    stop: 'Runs to the call; missed call reroutes to RNR.',
    tone: '#ef4444',
    steps: [
      { label: 'Reminder', delay: '24h before', template: 'bcon_proxe_booking_reminder_24h' },
      { label: 'Reminder', delay: '1h before', template: null, freeform: 'Hi {{customer_name}}! Your call with BCON Club is in about an hour at {{booking_time}}.', note: 'Free-form (inside the 24h window).' },
      { label: 'Reminder', delay: '30m before', template: 'bcon_proxe_booking_reminder_30m' },
      { label: 'Post-call follow-up', delay: 'after the call', template: 'bcon_proxe_post_call_followup', note: 'Then the log-call note routes the next ladder.' },
      { label: 'Call missed', delay: 'no-show', template: null, note: 'Routes into the RNR ladder above.' },
    ],
  },
  {
    id: 'nudge',
    title: 'Live-chat nudge — tiered by what we know',
    trigger: 'PROXe asked a question, the lead went quiet (hot 1h · warm 2h · cool 3h)',
    who: 'Mid-conversation ghosts. Read receipt gates it: read → nudge 30 min after; not read → reschedule to their active hour.',
    stop: 'Reply kills the nudge.',
    tone: '#a855f7',
    steps: [
      { label: 'Tier 1 — know nothing', delay: 'they only said hi', template: null, freeform: `Hey {{customer_name}}, you dropped in earlier but we didn't get to chat. What are you working on right now, more leads, better content, or better ads?` },
      { label: 'Tier 2 — know a detail', delay: 'goal / brand / pain known', template: null, freeform: `Hey {{customer_name}}, you mentioned {{service_interest}} earlier. Want me to show you how we'd fix that with AI? Takes 2 mins.` },
      { label: 'Tier 3 — form lead', delay: 'goal + brand known', template: null, freeform: `Hey {{customer_name}}, saw you reached out about {{service_interest}} for {{brand_name}}. Want me to map out how we'd get you there? I can set up a quick call.` },
    ],
  },
  {
    id: 'longtail',
    title: 'Long-tail nurture',
    trigger: 'No booking after the first touches',
    who: 'Slow-drip so they never go fully cold.',
    stop: 'Stops on any reply or booking.',
    tone: '#38bdf8',
    steps: [
      { label: 'Day 3', delay: '+3 days', template: 'bcon_proxe_followup_noengage' },
      { label: 'Day 7', delay: '+7 days', template: 'bcon_proxe_followup_noengage' },
      { label: 'Day 30', delay: '+30 days', template: 'bcon_proxe_reengagement_noengage' },
      { label: 'Day 90', delay: '+90 days', template: 'bcon_proxe_reengagement_noengage' },
    ],
  },
]

/** Gates every send passes through (shown in Eval + Map). */
export const GATES: Array<{ label: string; detail: string }> = [
  { label: 'Approval gate', detail: 'Sends wait for approval unless the task type is auto-approved.' },
  { label: 'Quiet hours', detail: '9pm-9am IST: nothing fires, reschedules to morning.' },
  { label: '24h window', detail: 'Outside Meta\'s 24h session: template required; inside: free-form allowed.' },
  { label: 'Reply kill-switch', detail: 'Any customer reply cancels pending ladder steps.' },
  { label: 'STOP / unsubscribe', detail: 'STOP parks the lead; monthly re-engage only.' },
  { label: 'No double-enrolment', detail: 'A new ladder cancels the previous pending one first.' },
  { label: 'Dedup guard', detail: 'One lead per phone+brand; chat is the sole lead creator.' },
]
