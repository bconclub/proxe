// Lokazen (Loka) - commercial-real-estate message map for the Brain's Eval tab.
// The default journeys.ts is BCON's SaaS lead-gen ladder (book-a-demo, pricing,
// "AI Lead Machine") - none of that is Lokazen. Lokazen matches BRANDS looking
// for space with OWNERS listing property, plus SCOUTS who submit inventory. The
// product outcome isn't a "demo" - it's a listed property / captured requirement
// and a SITE VISIT. Same display shape as the other brands, rewritten for the
// CRE loop. Bodies are free-form (Loka replies conversationally; Lokazen has no
// approved proactive Meta templates yet) - template chips appear once its WABA
// templates are wired. Quick-reply buttons come from the live widget config.
import type { Journey, JourneyStep } from './journeys'

// No approved proactive templates yet - buttons ride on the free-form steps
// (JourneyStep.buttons) instead of a template map. Kept for shape parity.
export const LOKAZEN_TEMPLATE_BUTTONS: Record<string, string[]> = {}

export function lokazenBodyFor(_template: string | null): string | null {
  return null // every Lokazen step is free-form; nothing to look up
}

/** Sample lead every preview fills with - a Bangalore brand hunting retail space
 *  (also stands in for the owner side via property_type/size/rent). */
export const LOKAZEN_SAMPLE: Record<string, string> = {
  customer_name: 'Rahul',
  brand_name: "Rahul's Cafe",
  space_type: 'retail space',
  area: 'Indiranagar',
  property_type: 'Retail',
  property_size: '1,200 sq ft',
  rent: '₹1.8L/mo',
  site_visit_time: 'tomorrow, 4:00 PM',
}
export const LOKAZEN_VAR_LABEL: Record<string, string> = {
  customer_name: 'name', brand_name: 'brand', space_type: 'need', area: 'area',
  property_type: 'type', property_size: 'size', rent: 'rent', site_visit_time: 'time',
}

export const LOKAZEN_OUTCOMES: Array<{ id: string; label: string }> = [
  { id: 'ghost', label: 'Never replies' },
  { id: 'nudge', label: 'Goes quiet mid-chat' },
  { id: 'engaged', label: 'Chats, no site visit' },
  { id: 'rnr', label: 'Callback, no answer' },
  { id: 'demo', label: 'Property listed / requirement logged' },
  { id: 'booked', label: 'Books a site visit' },
  { id: 'longtail', label: 'Fades out slowly' },
]

/** Lokazen journeys - ids match the default set so the Eval simulator's routing
 *  (entry → outcome, plus the nudge overlay) works unchanged. */
export const LOKAZEN_JOURNEYS: Journey[] = [
  {
    id: 'entry',
    title: 'Entry - the first message per source',
    trigger: 'A brand, owner, or scout reaches out',
    who: 'Everyone, exactly once. The source decides the welcome.',
    stop: 'One send. Their reply routes them to a loop below.',
    tone: '#8B5CF6',
    steps: [
      { label: 'Website - find space', delay: 'instant', template: null,
        freeform: `Hi {{customer_name}}, Loka here from Lokazen. Got your enquiry for {{space_type}} in {{area}}. I'll line up matching options - quick things first: preferred size, budget, and move-in timeline?`,
        buttons: ['Share requirements', 'Book a Site Visit', 'Talk to Lokazen team'],
        note: 'Filled from the site "Find Commercial Space" form - space type + area + budget.' },
      { label: 'Website - list a property', delay: 'instant', template: null,
        freeform: `Hi {{customer_name}}, Loka here from Lokazen. Thanks for listing your {{property_type}} in {{area}}. To get it in front of the right brands, confirm the size, expected rent, and floor - a photo and the map location help too.`,
        buttons: ['Add property details', 'Share photos', 'Talk to Lokazen team'],
        note: 'From the site "List My Property" owner form - captures type/size/rent/floor/map.' },
      { label: 'Web chat (Loka)', delay: 'after first tap', template: null,
        freeform: `Hi, I'm Loka, Lokazen's commercial real-estate assistant. Looking for space, or have a property to list? Tell me what you need.`,
        buttons: ['Find Commercial Space', 'List My Property', 'Talk to Lokazen team'],
        note: 'Widget greeting - space-seeker vs owner split from the first tap.' },
      { label: 'WhatsApp direct', delay: 'instant', template: null,
        freeform: `Hi {{customer_name}}, Loka here from Lokazen - Bangalore commercial real estate. Are you looking for space, or listing a property? Tell me a bit and I'll take it from there.`,
        buttons: ['I need space', 'I have a property'],
        note: 'Quick-reply greeting; the answer routes them into the brand or owner loop.' },
      { label: 'Scout submission', delay: 'instant', template: null,
        freeform: `Hi {{customer_name}}, Loka here - thanks for the scout submission! Logged the {{property_type}} in {{area}}. Send the size, rent, floor, photos and the map location and I'll get it listed. You'll get updates as it moves.`,
        buttons: ['Add details', 'Share photos', 'Talk to Lokazen team'],
        note: 'Scouts submit inventory/leads - a scout is NEVER pushed a site-visit booking; support routes to the team.' },
    ],
  },
  {
    id: 'ghost',
    title: 'Ghost - never replied',
    trigger: 'Welcome sent, zero replies',
    who: 'Leads that went silent from the start.',
    stop: 'Any reply exits the ladder. STOP unsubscribes.',
    tone: '#94a3b8',
    steps: [
      { label: 'Day 1', delay: '+24h', template: null,
        freeform: `Hi {{customer_name}}, Loka from Lokazen. Still after {{space_type}} in {{area}}? Tell me your size and budget and I'll send a couple of matches.` },
      { label: 'Day 3', delay: '+3 days', template: null,
        freeform: `{{customer_name}}, a few good {{property_type}} options in {{area}} just came up. Want me to share them? Just say yes.`,
        note: 'Last direct nudge.' },
      { label: 'Day 14', delay: '+14 days', template: null,
        freeform: `Hi {{customer_name}}, keeping your requirement on file. Whenever you're ready to look at spaces in {{area}}, message me here.`,
        note: 'Soft close - stays on file, no more chasing.' },
    ],
  },
  {
    id: 'rnr',
    title: 'Callback - requested, not reached',
    trigger: 'A logged call note classifies callback / no-answer / busy',
    who: 'Leads the team tried to call and could not reach.',
    stop: 'Stops the moment they reply. Cancels any prior ladder first (no double-enrolment).',
    tone: '#f59e0b',
    steps: [
      { label: 'Missed-call follow-up', delay: '+30 min', template: null,
        freeform: `Hi {{customer_name}}, Loka here - the Lokazen team tried to reach you about {{space_type}} in {{area}}. What's a good time to call, or shall we carry on here on WhatsApp?` },
      { label: 'Day 1', delay: '+1 day', template: null,
        freeform: `{{customer_name}}, still keen to line up a site visit in {{area}}? Reply here and I'll set it up.` },
      { label: 'Day 3', delay: '+3 days', template: null,
        freeform: `Hi {{customer_name}}, no rush - whenever you want to see spaces in {{area}}, I'm one message away.` },
    ],
  },
  {
    id: 'demo',
    title: 'Listed / requirement logged - the match loop',
    trigger: 'An owner property is listed, or a brand requirement is captured',
    who: 'Leads with real inventory or a real requirement on record.',
    stop: 'Loop runs until a site visit is booked; match updates continue.',
    tone: '#22c55e',
    steps: [
      { label: 'Confirm on record', delay: 'instant', template: null,
        freeform: `Done, {{customer_name}} - your {{property_type}} in {{area}} ({{property_size}}, {{rent}}) is on Lokazen. I'll ping you as brands show interest. (Space-seekers: your requirement is logged the same way.)` },
      { label: 'Match found', delay: '+2 days', template: null,
        freeform: `{{customer_name}}, good news - there's active demand for {{property_type}} space in {{area}} that fits. Want me to set up a site visit?`,
        buttons: ['Yes, arrange visit', 'Not now'] },
      { label: 'Weekly roundup', delay: 'weekly', template: null,
        freeform: `{{area}} update: demand for {{property_type}} space is active this week. You're in the mix - I'll flag any serious match.`,
        note: 'Keeps owners/requirements warm without over-messaging.' },
    ],
  },
  {
    id: 'engaged',
    title: 'Engaged, no site visit',
    trigger: 'Chatting well, no site visit booked yet',
    who: 'Replying leads that stall before seeing a space.',
    stop: 'Stops as soon as they book a visit.',
    tone: '#3b82f6',
    steps: [
      { label: 'Nudge while matching', delay: 'after the chat', template: null,
        freeform: `{{customer_name}}, I've got a couple of {{property_type}} options in {{area}} that fit. Want to lock a site visit to see them?`,
        buttons: ['Book a Site Visit', 'Send me details first'] },
      { label: 'Push to visit', delay: 'next day', template: null,
        freeform: `{{customer_name}}, the {{area}} space I mentioned is getting interest. Shall I hold a slot for a site visit this week?`,
        buttons: ['Book a Site Visit', 'Request a Callback'] },
    ],
  },
  {
    id: 'booked',
    title: 'Booked - the site-visit path',
    trigger: 'A site visit gets scheduled',
    who: 'Every lead with a visit on the calendar.',
    stop: 'Runs to the visit; a no-show reroutes to the callback loop.',
    tone: '#ef4444',
    steps: [
      { label: 'Confirm', delay: 'instant', template: null,
        freeform: `You're set, {{customer_name}} - site visit for the {{property_type}} in {{area}} on {{site_visit_time}}. I'll share the exact address and map pin before then.` },
      { label: 'Reminder', delay: '24h before', template: null,
        freeform: `Hi {{customer_name}}, reminder: your Lokazen site visit in {{area}} is tomorrow at {{site_visit_time}}. Want the map pin now?` },
      { label: 'Reminder', delay: '1h before', template: null,
        freeform: `{{customer_name}}, your site visit is in about an hour - {{site_visit_time}}, {{area}}. Here's the location and the contact on site.` },
      { label: 'Post-visit follow-up', delay: 'after the visit', template: null,
        freeform: `How was the {{area}} space, {{customer_name}}? If it works I'll move on terms; if not, I've got other {{property_type}} options.`,
        buttons: ['I liked it', 'Show more options'] },
      { label: 'Visit missed', delay: 'no-show', template: null,
        note: 'Routes into the callback loop above.' },
    ],
  },
  {
    id: 'nudge',
    title: 'Live-chat nudge - tiered by what we know',
    trigger: 'Loka asked a question, the lead went quiet (hot 1h · warm 2h · cool 3h)',
    who: 'Mid-conversation ghosts. Read receipt gates it: read → nudge 30 min after; not read → reschedule to their active hour.',
    stop: 'Reply kills the nudge.',
    tone: '#a855f7',
    steps: [
      { label: 'Tier 1 - know nothing', delay: 'they only said hi', template: null,
        freeform: `Hi {{customer_name}}, you pinged earlier but we didn't finish. Are you after space, or listing a property? I'll take it from there.` },
      { label: 'Tier 2 - know the need', delay: 'need / area known', template: null,
        freeform: `{{customer_name}}, you mentioned {{space_type}} in {{area}}. Want me to pull up matching options? Takes a minute.` },
      { label: 'Tier 3 - full details', delay: 'type + area known', template: null,
        freeform: `{{customer_name}}, I've got your {{property_type}} requirement for {{area}}. Ready to see a shortlist or book a site visit?`,
        buttons: ['See shortlist', 'Book a Site Visit'] },
    ],
  },
  {
    id: 'longtail',
    title: 'Long-tail nurture',
    trigger: 'No site visit after the first touches',
    who: 'Slow-drip so they never go fully cold.',
    stop: 'Stops on any reply or a booked visit. STOP unsubscribes.',
    tone: '#38bdf8',
    steps: [
      { label: 'Day 7', delay: '+7 days', template: null,
        freeform: `{{area}} this week: new {{property_type}} spaces listed and rents on the move. Want me to send what fits your budget?` },
      { label: 'Day 30', delay: '+30 days', template: null,
        freeform: `Hi {{customer_name}}, still holding your {{area}} requirement. New options come up often - say the word and I'll share.` },
      { label: 'Day 90', delay: '+90 days', template: null,
        freeform: `{{customer_name}}, checking in - if commercial space in {{area}} is still on your radar, I'm here. Otherwise I'll keep your details on file.`,
        note: 'Final drip - then only on-demand.' },
    ],
  },
]

export const LOKAZEN_GATES: Array<{ label: string; detail: string }> = [
  { label: 'Approval gate', detail: 'Sends wait for approval unless the task type is auto-approved.' },
  { label: 'Quiet hours', detail: '9pm-9am IST: nothing fires, reschedules to morning.' },
  { label: '24h window', detail: "Outside Meta's 24h session: template required; inside: free-form allowed." },
  { label: 'Reply kill-switch', detail: 'Any customer reply cancels pending ladder steps.' },
  { label: 'STOP / unsubscribe', detail: 'STOP parks the lead; monthly re-engage only.' },
  { label: 'No double-enrolment', detail: 'A new ladder cancels the previous pending one first.' },
  { label: 'Scout gate', detail: 'Scouts never get a site-visit/booking push - submissions route to the team as inventory/support.' },
]
