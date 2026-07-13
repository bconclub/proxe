// Per-brand automation shown on the dashboard Flows tab: which event-fired
// TRIGGERS and multi-step SEQUENCES run, and which Meta template each fires.
// FlowsAutomation renders this (brand-neutral component); the data is chosen by
// BRAND_ID below so each brand shows ITS own templates, not another brand's.
import { MdWavingHand, MdNotificationsActive, MdPhoneMissed, MdCallReceived, MdAssignment, MdEventAvailable, MdVideocam } from 'react-icons/md'
import { BRAND_ID } from '@/configs'

export type Source = { label: string; template: string | null; desc: string }
export type Trigger = { id: string; icon: any; event: string; when: string; template: string | null; desc: string; sources?: Source[] }
export type Step = { label: string; delay: string; template: string }
export type Sequence = { id: string; segment: string; who: string; stop: string; gated?: boolean; steps: Step[] }

// ── BCON ─────────────────────────────────────────────────────────────────────
const BCON_TRIGGERS: Trigger[] = [
  { id: 'welcome', icon: MdWavingHand, event: 'New lead arrives', when: 'Immediately', template: 'bcon_proxe_first_outreach', desc: 'The welcome / first outreach a fresh lead receives.' },
  { id: 'r24', icon: MdNotificationsActive, event: 'Booking — 1 day before', when: '24h before the call', template: 'bcon_proxe_booking_reminder_24h', desc: '“Your call is tomorrow at …”' },
  { id: 'r1', icon: MdNotificationsActive, event: 'Booking — 1 hour before', when: '1h before', template: 'bcon_proxe_booking_reminder_1h', desc: '“Your call starts in 1 hour.”' },
  { id: 'r30', icon: MdNotificationsActive, event: 'Booking — 30 min before', when: '30m before', template: 'bcon_proxe_booking_reminder_30m', desc: '“Your call starts in 30 minutes.”' },
  { id: 'missed', icon: MdPhoneMissed, event: 'Voice call — no answer', when: '30 min after', template: null, desc: 'Kicks off the “No response” sequence below (missed_call_followup).' },
  { id: 'callback', icon: MdCallReceived, event: 'Callback requested', when: 'On request', template: null, desc: 'Acknowledge and schedule the callback.' },
]

const BCON_SEQUENCES: Sequence[] = [
  {
    id: 'rnr', segment: 'No response / cold', gated: true,
    who: 'Lead came in (or the call rang with no response) and isn’t replying.',
    stop: 'Stops the moment they reply on WhatsApp · capped at 2 re-engagement sends',
    steps: [
      { label: 'Missed-call follow-up', delay: '30 min after', template: 'bcon_service_rnr_1_v1' },
      { label: 'Day 1', delay: '+1 day', template: 'bcon_service_rnr_2_v1' },
      { label: 'Day 3', delay: '+3 days', template: 'bcon_service_rnr_2_v1' },
      { label: 'Day 5', delay: '+5 days', template: 'bcon_service_rnr_2_v1' },
      { label: 'Re-engage', delay: 'final', template: 'bcon_proxe_reengagement_noengage' },
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

// ── WINDCHASERS ──────────────────────────────────────────────────────────────
const WINDCHASERS_TRIGGERS: Trigger[] = [
  {
    id: 'welcome', icon: MdWavingHand, event: 'New lead arrives', when: 'Immediately', template: null,
    desc: 'The first WhatsApp a fresh lead gets — the copy is chosen by where they came from.',
    sources: [
      { label: 'Student / general', template: 'windchasers_generic_welcome_v3', desc: 'Website forms, general ads, non-pilot enquiries.' },
      { label: 'Pilot track', template: 'windchasers_pilot_welcome_v3', desc: 'CPL / PPL / DGCA / flying interest.' },
      { label: 'Cabin crew', template: 'windchasers_cabin_crew_welcome_v1', desc: 'Cabin-crew ads / enquiries.' },
      { label: 'Parent', template: 'windchasers_pilot_parents_welcome_v1', desc: 'A parent enquiring for their child.' },
    ],
  },
  { id: 'pat', icon: MdAssignment, event: 'Pilot Aptitude Test completed', when: 'Immediately', template: 'windchasers_pat_result_v2', desc: 'Sends the PAT score + tier and next step.' },
  {
    id: 'demo', icon: MdEventAvailable, event: 'Demo booked', when: 'On booking', template: null,
    desc: 'Confirms the demo — online or in-facility.',
    sources: [
      { label: 'Online demo', template: 'windchasers_demo_online_v2', desc: 'Confirmation + Add-to-Calendar; Meet link follows before the session.' },
      { label: 'Offline demo', template: 'windchasers_demo_offline_v2', desc: 'In-facility confirmation with date/time.' },
    ],
  },
  {
    id: 'webinar', icon: MdVideocam, event: 'Webinar registration', when: 'On register', template: null,
    desc: 'Confirms a webinar registration (Zoom → Pabbly → lead). Create these in Meta to switch them on.',
    sources: [
      { label: 'Student / aspirant', template: 'windchasers_webinar_confirm_v1', desc: '“You’re registered for …”.' },
      { label: 'Parent', template: 'windchasers_webinar_confirm_parents_v1', desc: 'Parent-voiced webinar confirmation.' },
    ],
  },
  { id: 'missed', icon: MdPhoneMissed, event: 'Voice call — no answer', when: '30 min after', template: null, desc: 'Kicks off the “No response / cold” sequence below.' },
]

const WINDCHASERS_SEQUENCES: Sequence[] = [
  {
    id: 'rnr', segment: 'No response / cold',
    who: 'Lead came in (or the call rang with no response) and isn’t replying. Pilot-track leads get the rnr_pilot_* variants of the same steps.',
    stop: 'Stops the moment they reply on WhatsApp · capped at 2 re-engagement sends.',
    steps: [
      { label: 'First re-attempt', delay: '30 min after', template: 'rnr_generic_1_v1' },
      { label: 'Tried again', delay: '+1 day', template: 'rnr_generic_2_v1' },
    ],
  },
]

// ── Active export (by brand) ─────────────────────────────────────────────────
export const TRIGGERS: Trigger[] = BRAND_ID === 'windchasers' ? WINDCHASERS_TRIGGERS : BCON_TRIGGERS
export const SEQUENCES: Sequence[] = BRAND_ID === 'windchasers' ? WINDCHASERS_SEQUENCES : BCON_SEQUENCES
