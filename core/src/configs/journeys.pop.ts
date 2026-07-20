// POP (Pulse of Punjab) - voter-native message map for the Brain's Eval tab.
// The default journeys.ts is BCON's business lead-gen ladder (book-a-call,
// demo, pricing) - none of that applies to citizen grievance outreach. This is
// the same display shape, rewritten for the voter loop: capture the grievance,
// acknowledge it, keep the citizen in the loop, invite volunteering. No booking
// pushes anywhere. Bodies are free-form/AI (POP has no approved Meta templates
// yet) - template chips appear once templates are approved on POP's WABA.
import type { Journey, JourneyStep } from './journeys'

export const POP_TEMPLATE_BUTTONS: Record<string, string[]> = {
  pop_welcome_v1: ['Raise a Grievance', 'Get Campaign Updates', 'Volunteer'],
  pop_grievance_logged_v1: ['Add More Detail', 'Get Updates'],
  pop_status_update_v1: ['Tell Us More', 'Volunteer'],
  pop_reengage_v1: ['Raise a Grievance', 'STOP'],
}

const POP_BODIES: Record<string, string> = {
  pop_welcome_v1: `Sat sri akal {{customer_name}} ji! Congress di 'Sab di sunenge' team vallon dhanvaad.\n\nTuhadi gall sunni hai - {{constituency}} vich sab ton vadda masla ki hai?`,
  pop_grievance_logged_v1: `{{customer_name}} ji, tuhadi gall note kar layi hai - {{grievance_text}}.\n\nAsi eh sahi bande tak pahunchavange te tuhanu update dinde rahange.`,
  pop_status_update_v1: `{{customer_name}} ji, tuhade {{grievance_category}} de masle bare update: tuhadi awaaz {{constituency}} di report vich shamil ho gayi hai. Sab di sunenge - tuhade naal haan.`,
  pop_reengage_v1: `Sat sri akal {{customer_name}} ji. {{constituency}} vich hor vi awaazan uth rahiyan ne. Je tuhada koi masla hai - chhota ya vadda - saanu zaroor dasso.`,
}

export function popBodyFor(template: string | null): string | null {
  if (!template) return null
  return POP_BODIES[template] || null
}

/** Sample citizen every preview fills with (voter fixture, not a business). */
export const POP_SAMPLE: Record<string, string> = {
  customer_name: 'Gurpreet',
  constituency: 'Bathinda Urban',
  grievance_category: 'Water',
  grievance_text: 'no clean drinking water in the mohalla for 2 weeks',
  language: 'Punjabi',
}
export const POP_VAR_LABEL: Record<string, string> = {
  customer_name: 'name', constituency: 'constituency',
  grievance_category: 'issue', grievance_text: 'grievance', language: 'language',
}

export const POP_OUTCOMES: Array<{ id: string; label: string }> = [
  { id: 'ghost', label: 'Never replies' },
  { id: 'nudge', label: 'Goes quiet mid-chat' },
  { id: 'engaged', label: 'Talks, no grievance yet' },
  { id: 'rnr', label: 'Call rings, no answer' },
  { id: 'demo', label: 'Grievance logged' },
  { id: 'booked', label: 'Wants to volunteer' },
  { id: 'longtail', label: 'Fades out slowly' },
]

/** Voter journeys - ids intentionally match the default set so the Eval
 * simulator's routing logic works unchanged. */
export const POP_JOURNEYS: Journey[] = [
  {
    id: 'entry',
    title: 'Entry - the first message per source',
    trigger: 'A citizen reaches out (or we reach them)',
    who: 'Every new person, exactly once. The source decides the welcome.',
    stop: 'One send. Their reply routes them to a loop below.',
    tone: '#8B5CF6',
    steps: [
      { label: 'Pulse app / landing page', delay: 'instant', template: 'pop_welcome_v1', note: 'Grievance form on the landing page creates the person; welcome asks for their biggest issue.' },
      { label: 'Web chat', delay: 'after first message', template: null, freeform: `Sat sri akal! Main 'Sab di sunenge' team di AI haan. Tuhadi gall sunan layi haan - pind, shehar, te sab ton vadda masla dasso.`, note: 'Widget welcome - grievance-first, never sales.' },
      { label: 'WhatsApp direct', delay: 'instant', template: null, freeform: `Sat sri akal ji! Congress di 'Sab di sunenge' muhim vich tuhada swagat hai. Tuhade ilaqe vich sab ton vadda masla ki hai? Assi sun rahe haan.`, note: 'Quick replies: Raise a Grievance · Top Grievances · Updates · Volunteer.' },
      { label: 'QR / missed call', delay: 'instant', template: 'pop_welcome_v1', note: 'QR scan or missed-call number → WhatsApp welcome fires.' },
      { label: 'Outbound voice call', delay: 'no message', template: null, note: 'V1/V2/V3 voice agents capture the grievance on the call; it logs straight to the person’s record.' },
    ],
  },
  {
    id: 'ghost',
    title: 'Ghost - never replied',
    trigger: 'Welcome sent, zero replies',
    who: 'Citizens who went silent from the start.',
    stop: 'Any reply exits the ladder. STOP unsubscribes.',
    tone: '#94a3b8',
    steps: [
      { label: 'Day 1', delay: '+24h', template: null, freeform: `Sat sri akal {{customer_name}} ji - kal tuhanu message kita si. Je tuhade ilaqe vich koi masla hai (paani, bijli, sadkan, rozgar), ikk line vich dasso. Assi sunange.` },
      { label: 'Day 3', delay: '+3 days', template: null, freeform: `{{customer_name}} ji, {{constituency}} de lok apni awaaz record karva rahe ne. Tuhada vi haq hai - koi vi masla hove, saanu dasso.`, note: 'Last direct ask.' },
      { label: 'Day 30', delay: '+30 days', template: 'pop_reengage_v1', note: 'Gentle monthly re-engage only - never spam a citizen.' },
    ],
  },
  {
    id: 'rnr',
    title: 'RNR - call rang, no response',
    trigger: 'Outbound voice call not answered / busy / cut',
    who: 'People the voice agent tried to reach.',
    stop: 'Stops the moment they reply or pick up a later call.',
    tone: '#f59e0b',
    steps: [
      { label: 'Missed-call follow-up', delay: '+30 min', template: null, freeform: `Sat sri akal {{customer_name}} ji - assi tuhanu call kita si, 'Sab di sunenge' team vallon. Tuhadi gall sunni hai. Jadon time hove, is number te message karo ya missed call dio.` },
      { label: 'Day 1 retry', delay: '+1 day', template: null, note: 'One voice retry at their active hour. No message fires.' },
      { label: 'Day 3', delay: '+3 days', template: null, freeform: `{{customer_name}} ji, tuhade ilaqe di awaaz zaroori hai. WhatsApp te vi apna masla dass sakde ho - ikk message kaafi hai.` },
    ],
  },
  {
    id: 'demo',
    title: 'Grievance logged - the loop',
    trigger: 'A grievance is captured (chat, call, or landing page)',
    who: 'Every citizen whose issue is on record.',
    stop: 'Loop closes when the grievance is acknowledged/resolved; updates continue.',
    tone: '#22c55e',
    steps: [
      { label: 'Acknowledge', delay: 'instant', template: 'pop_grievance_logged_v1', note: 'The promise: noted + will reach the right person.' },
      { label: 'Status update', delay: '+7 days', template: 'pop_status_update_v1', note: 'Keeps the citizen in the loop - the core trust builder.' },
      { label: 'Constituency roundup', delay: 'monthly', template: null, freeform: `{{constituency}} update: tuhade ilaqe de sab ton vadde masle - paani, sadkan, rozgar - assembly report vich pahunch gaye ne. Tuhadi awaaz ginti vich hai.`, note: 'Aggregate update, no promises.' },
    ],
  },
  {
    id: 'engaged',
    title: 'Talking, grievance not yet captured',
    trigger: 'Chatting, but no concrete issue stated yet',
    who: 'Citizens mid-conversation who haven’t named their masla.',
    stop: 'Stops as soon as a grievance is logged.',
    tone: '#3b82f6',
    steps: [
      { label: 'Gentle probe', delay: 'in-chat', template: null, freeform: `Tusi dasso {{customer_name}} ji - tuhade pind/mohalle vich sab ton vadda masla ki hai? Paani, bijli, sadkan, school, hospital, rozgar - kujh vi.` },
      { label: 'Next-day nudge', delay: 'next day', template: null, freeform: `{{customer_name}} ji, kal gall adhuri reh gayi si. Tuhada masla ikk line vich dass dio - assi note kar lavange te aggey pahunchavange.` },
    ],
  },
  {
    id: 'booked',
    title: 'Volunteer path',
    trigger: 'Citizen says yes to volunteering / supporting',
    who: 'Supporters who raised their hand.',
    stop: 'Hands off to the local team; updates continue.',
    tone: '#ef4444',
    steps: [
      { label: 'Thank + confirm', delay: 'instant', template: null, freeform: `Bahut vadhiya {{customer_name}} ji! Tuhade warga saath hi muhim di taqat hai. Tuhada naam {{constituency}} di volunteer list vich jud gaya hai.` },
      { label: 'Local team connect', delay: '+1 day', template: null, note: 'Constituency karyakarta gets the volunteer’s details; personal contact from the local team.' },
      { label: 'Mobilization ping', delay: 'event-driven', template: null, freeform: `{{customer_name}} ji - is hafte {{constituency}} vich milni hai. Aa sakde ho? Tuhadi hazri nal farak painda hai.`, note: 'Only for rally/canvass events in their constituency.' },
    ],
  },
  {
    id: 'nudge',
    title: 'Live-chat nudge - tiered by what we know',
    trigger: 'The AI asked a question, the citizen went quiet',
    who: 'Mid-conversation ghosts.',
    stop: 'Reply kills the nudge.',
    tone: '#a855f7',
    steps: [
      { label: 'Tier 1 - know nothing', delay: 'they only said hi', template: null, freeform: `Sat sri akal {{customer_name}} ji - gall adhuri reh gayi. Tuhade ilaqe vich ki chal riha hai? Assi sunan layi haan.` },
      { label: 'Tier 2 - know the area', delay: 'constituency known', template: null, freeform: `{{customer_name}} ji, {{constituency}} ton hor vi awaazan aa rahiyan ne. Tuhada masla vi record karva lao - ikk minute lagda hai.` },
      { label: 'Tier 3 - know the issue', delay: 'grievance category known', template: null, freeform: `{{customer_name}} ji, tusi {{grievance_category}} di gall kiti si. Thoda detail vich dasso - assi note karke aggey pahunchavange.` },
    ],
  },
  {
    id: 'longtail',
    title: 'Long-tail - stay in the loop',
    trigger: 'No grievance after the first touches',
    who: 'Slow-drip constituency updates so no one goes fully cold.',
    stop: 'Stops on any reply. STOP unsubscribes.',
    tone: '#38bdf8',
    steps: [
      { label: 'Day 7', delay: '+7 days', template: null, freeform: `{{constituency}} vich is hafte: lok paani te sadkan de masle sab ton vadh utha rahe ne. Tuhada vi koi masla hai? Sab di sunenge.` },
      { label: 'Day 30', delay: '+30 days', template: 'pop_reengage_v1' },
      { label: 'Day 90', delay: '+90 days', template: 'pop_reengage_v1', note: 'Final drip - after this only election-period updates.' },
    ],
  },
]

export const POP_GATES: Array<{ label: string; detail: string }> = [
  { label: 'Approval gate', detail: 'Sends wait for approval unless the task type is auto-approved.' },
  { label: 'Quiet hours', detail: '9pm-9am IST: nothing fires, reschedules to morning.' },
  { label: '24h window', detail: "Outside Meta's 24h session: template required; inside: free-form allowed." },
  { label: 'Reply kill-switch', detail: 'Any citizen reply cancels pending ladder steps.' },
  { label: 'STOP / unsubscribe', detail: 'STOP parks the person; monthly re-engage only.' },
  { label: 'No double-enrolment', detail: 'A new loop cancels the previous pending one first.' },
  { label: 'Respect gate', detail: 'No promises, no party attacks, never asks caste/religion - hard rules in every prompt.' },
]
