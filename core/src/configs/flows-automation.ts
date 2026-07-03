// Brand-private (NOT in the shared manifest). This brand's automation: which
// event-fired TRIGGERS and multi-step SEQUENCES run, and which Meta template each
// step fires. FlowsAutomation renders this data, so the component stays
// brand-neutral + shared while each brand defines its own flows here.
import { MdWavingHand, MdNotificationsActive, MdPhoneMissed, MdCallReceived } from 'react-icons/md'

export type Trigger = { id: string; icon: any; event: string; when: string; template: string | null; desc: string }
export type Step = { label: string; delay: string; template: string }
export type Sequence = { id: string; segment: string; who: string; stop: string; gated?: boolean; steps: Step[] }

export const TRIGGERS: Trigger[] = [
  { id: 'welcome', icon: MdWavingHand, event: 'New lead arrives', when: 'Immediately', template: 'bcon_proxe_first_outreach', desc: 'The welcome / first outreach a fresh lead receives.' },
  { id: 'r24', icon: MdNotificationsActive, event: 'Booking — 1 day before', when: '24h before the call', template: 'bcon_proxe_booking_reminder_24h', desc: '“Your call is tomorrow at …”' },
  { id: 'r1', icon: MdNotificationsActive, event: 'Booking — 1 hour before', when: '1h before', template: 'bcon_proxe_booking_reminder_1h', desc: '“Your call starts in 1 hour.”' },
  { id: 'r30', icon: MdNotificationsActive, event: 'Booking — 30 min before', when: '30m before', template: 'bcon_proxe_booking_reminder_30m', desc: '“Your call starts in 30 minutes.”' },
  { id: 'missed', icon: MdPhoneMissed, event: 'Voice call — no answer', when: '30 min after', template: null, desc: 'Kicks off the “No response” sequence below (missed_call_followup).' },
  { id: 'callback', icon: MdCallReceived, event: 'Callback requested', when: 'On request', template: null, desc: 'Acknowledge and schedule the callback.' },
]

export const SEQUENCES: Sequence[] = [
  {
    id: 'rnr', segment: 'No response / cold', gated: true,
    who: 'Lead came in (or the call rang with no response) and isn’t replying.',
    stop: 'Stops the moment they reply on WhatsApp · capped at 2 re-engagement sends · gated until a Meta-approved RNR template is set',
    steps: [
      { label: 'Missed-call follow-up', delay: '30 min after', template: 'bcon_proxe_followup_noengage' },
      { label: 'Day 1', delay: '+1 day', template: 'bcon_proxe_followup_noengage' },
      { label: 'Day 3', delay: '+3 days', template: 'bcon_proxe_followup_noengage' },
      { label: 'Day 5', delay: '+5 days', template: 'bcon_proxe_reengagement_noengage' },
      { label: 'Re-engage', delay: 'final', template: 'bcon_proxe_rnr' },
    ],
  },
  {
    id: 'engaged', segment: 'Engaged, not booked',
    who: 'Interacting well but hasn’t booked the call yet.',
    stop: 'Stops as soon as they book',
    steps: [
      { label: 'Nudge while waiting', delay: 'after the chat', template: 'bcon_proxe_followup_engaged' },
      { label: 'Push to book', delay: 'next day', template: 'bcon_proxe_followup_engaged' },
    ],
  },
  {
    id: 'longtail', segment: 'Long-tail nurture',
    who: 'No booking after the first touches — a slow drip so they don’t go cold.',
    stop: 'Stops on any reply or booking',
    steps: [
      { label: 'Day 3', delay: '+3 days', template: 'bcon_proxe_followup_noengage' },
      { label: 'Day 7', delay: '+7 days', template: 'bcon_proxe_followup_noengage' },
      { label: 'Day 30', delay: '+30 days', template: 'bcon_proxe_reengagement_noengage' },
      { label: 'Day 90', delay: '+90 days', template: 'bcon_proxe_reengagement_noengage' },
    ],
  },
]
