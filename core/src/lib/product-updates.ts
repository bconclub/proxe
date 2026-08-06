// What's new - the RELEASE notes surfaced in the NotificationCenter.
//
// This is product comms for the people paying for PROXe. It is not a changelog
// and it is not a list of things we got wrong.
//
// THE RULES (founder calls, 2026-08-05 and 2026-08-06):
//
//   1. One entry per RELEASE. A release lands every couple of days, so expect
//      two or three a week - we ship that much. Do NOT collapse a quarter of
//      work into three summary entries; the history is the point.
//   2. Say what they can now DO. Never confess a defect. "Overview numbers were
//      wrong above 2000 leads" is our problem; "your totals stay accurate
//      however long your list gets" is their capability. Same shipped work, and
//      only one of them belongs in front of a client.
//   3. Work out what the release was actually solving and lead with that. The
//      title carries the theme, the highlights carry the specifics.
//   4. The version is the release marker, taken from the app version that was
//      running when it shipped. Releases before 2026-07-08 predate the
//      versioning scheme and carry a date only.
//
// Brand gating lives on the HIGHLIGHT, not the release, so one release can
// carry a line only Windchasers sees and a line only Lokazen sees. A release
// whose every highlight is gated away is hidden entirely for that brand - which
// is how brand-specific work (scholarships, Gigs, War Room) stays with the
// brand that paid for it and never leaks into another dashboard.
//
//   brands omitted or ['*']  → every brand sees this line
//   brands: ['lokazen']      → only that brand's dashboard sees it

export type ReleaseHighlight = {
  text: string
  /** omit / ['*'] = all brands; else specific brand slugs */
  brands?: string[]
}

export type Release = {
  id: string           // stable unique id, e.g. 'r-2026-08-05'
  version?: string     // app version it shipped at; omitted pre-versioning
  title: string        // the theme - what this release is for
  detail?: string      // one line of framing under the title
  date: string         // ISO date
  highlights: ReleaseHighlight[]
}

const WC = ['windchasers']
const LZ = ['lokazen']
const BC = ['bcon']
const POP = ['pop']
const PX = ['proxe']

// Newest release first - the drawer renders this array in order, it does not
// sort. Only unseen releases visible to the brand raise the badge.
export const RELEASES: Release[] = [
  {
    id: 'r-2026-08-05',
    version: '0.3.31',
    title: 'Your whole book, on one page',
    detail: 'However long your list gets, the leads page holds all of it and the numbers keep up.',
    date: '2026-08-05',
    highlights: [
      { text: 'The leads page holds every lead you have, with tab counts that add up to the table.' },
      { text: 'Overview totals stay accurate however long your list gets.' },
      { text: 'Segments and source breakdowns read from your real list, not a sample of it.' },
      { text: 'The sidebar starts open, so Notifications and Report Issue are one glance away.' },
    ],
  },
  {
    id: 'r-2026-08-04',
    version: '0.3.23',
    title: 'Hear it the moment it lands',
    detail: 'A live feed in the sidebar, so nobody has to sit on the Overview waiting for something to happen.',
    date: '2026-08-04',
    highlights: [
      { text: 'New leads and incoming messages arrive in a live feed, stacked by person, with a sound you can switch off.' },
      { text: 'The bell lives in the sidebar now, so it is on every page.' },
      { text: 'Jump straight back to the latest message in any chat.' },
      { text: 'A daily brief in Telegram: what came in and from where, what was touched, and who is still waiting on a human.', brands: WC },
      { text: 'Scholarship applications arrive on the lead they belong to, with the track they picked.', brands: WC },
    ],
  },
  {
    id: 'r-2026-08-03',
    version: '0.3.14',
    title: 'PROXe sells PROXe',
    detail: 'A brand pack of our own, so the product can demo itself.',
    date: '2026-08-03',
    highlights: [
      { text: 'The PROXe brand runs on its own prompts, theme and assets.', brands: PX },
      { text: 'The widget greeting comes from the brand pack, with three ways in.', brands: PX },
      { text: 'A fresh Supabase can be brought up from a bootstrap pack with verification built in.', brands: PX },
    ],
  },
  {
    id: 'r-2026-07-30',
    version: '0.3.4',
    title: 'Wings of Freedom, and the ads behind it',
    detail: 'The agent knows the event it is talking about, and you can see which ad brought the lead.',
    date: '2026-07-30',
    highlights: [
      { text: 'See which ad a lead came from, down to the headline, so you can tell what is working.', brands: WC },
      { text: 'The agent carries the Wings of Freedom context and answers on it directly.', brands: WC },
      { text: 'Each event gets its own WhatsApp group link, sent as a proper template.', brands: WC },
      { text: 'Scholarship applicants show in the Offline Events tab and are told what happens next.', brands: WC },
    ],
  },
  {
    id: 'r-2026-07-29',
    version: '0.2.98',
    title: 'The agent hands over like a teammate',
    detail: 'It steps back when a human steps in, and only books time you can actually take.',
    date: '2026-07-29',
    highlights: [
      { text: 'Reply by hand and the agent stays out of that conversation for a day.' },
      { text: 'Callbacks are offered in real slots, inside the hours you actually work.' },
      { text: 'The agent knows who has paid, so it can answer when they ask.', brands: LZ },
      { text: 'It sends brands to the onboarding page instead of pushing for a call.', brands: LZ },
      { text: 'Run several offline events at once, with leads grouped by the one they registered for.', brands: WC },
    ],
  },
  {
    id: 'r-2026-07-28',
    version: '0.2.92',
    title: 'The agent remembers',
    detail: 'However long the conversation runs, it keeps hold of what it was told.',
    date: '2026-07-28',
    highlights: [
      { text: 'The agent carries the whole conversation, so it stops asking for what you already gave it.' },
      { text: 'Every detail captured on a lead is available to the agent, not just the recent chat.' },
      { text: 'Chat threads fit the screen on a phone.' },
      { text: 'A shared map pin resolves to a real place instead of another question.', brands: LZ },
    ],
  },
  {
    id: 'r-2026-07-24',
    version: '0.2.85',
    title: 'Nudges that arrive with directions',
    date: '2026-07-24',
    highlights: [
      { text: 'Offline event reminders go out on schedule, with directions, and nudge anyone who has not registered.', brands: WC },
    ],
  },
  {
    id: 'r-2026-07-22',
    version: '0.2.82',
    title: 'Getting your team in',
    date: '2026-07-22',
    highlights: [
      { text: 'Team invites go through cleanly, with a clear message if one cannot be accepted.' },
    ],
  },
  {
    id: 'r-2026-07-21',
    version: '0.2.81',
    title: 'Offline events get their own lane',
    date: '2026-07-21',
    highlights: [
      { text: 'Offline Event leads are their own segment, with demo classes tagged.', brands: WC },
      { text: 'Demo class and offline event leads get their own confirmations, not the generic welcome.', brands: WC },
    ],
  },
  {
    id: 'r-2026-07-20',
    version: '0.2.79',
    title: 'Log a call, decide the next move',
    detail: 'The call is where the intent shows up, so that is where PROXe picks up the thread.',
    date: '2026-07-20',
    highlights: [
      { text: 'Log a call and it opens a chat with PROXe: the message to send, the follow-up, the reminder, each confirmed in one tap.' },
      { text: 'Send a thank-you from a compliant template picker.' },
      { text: 'Every knowledge source and prompt on one graph, so you can see what the agent actually knows.' },
      { text: 'The cabin crew agent carries the real course details.', brands: WC },
    ],
  },
  {
    id: 'r-2026-07-18',
    version: '0.2.63',
    title: 'Campaigns, built in a chat',
    detail: 'Tell PROXe who to reach and it does the assembly.',
    date: '2026-07-18',
    highlights: [
      { text: 'It pulls the audience, matches a WhatsApp template, and drafts the campaign with you.' },
      { text: 'Configure WhatsApp Templates becomes a full overview of your WhatsApp setup.' },
      { text: 'Live campaign analytics: sent, delivered, read, clicked.', brands: WC },
      { text: 'Day-of webinar sends scheduled automatically, split by audience.', brands: WC },
      { text: 'Webinar attendance shows in the inbox and on the lead.', brands: WC },
      { text: 'Campaigns segment by audience and never lump brands, owners and scouts together.', brands: LZ },
      { text: 'Brand and property details open in a modal that leads with the requirement.', brands: LZ },
      { text: '"Know online results" shows real web results for a brand, not just click-outs.', brands: LZ },
    ],
  },
  {
    id: 'r-2026-07-17',
    version: '0.2.43',
    title: 'The pipeline on one screen',
    detail: 'One viewport, one funnel, and a way back to the leads behind every number.',
    date: '2026-07-17',
    highlights: [
      { text: 'The pipeline is a single-screen funnel with your own key event and reasons on Lost.' },
      { text: 'Click any stage and the Leads list filters to it.' },
      { text: 'Report an issue from the sidebar, screenshot and all, and track it under Configure.' },
      { text: 'Switch the Engine Overview funnel by program.', brands: WC },
    ],
  },
  {
    id: 'r-2026-07-14',
    version: '0.2.2',
    title: 'Follow-ups that actually send',
    date: '2026-07-14',
    highlights: [
      { text: 'Template variables are filled from what the lead actually said.' },
      { text: 'Day 1, 3 and 5 retries send through the approved template ladder.', brands: BC },
      { text: 'Tasks are born from real interactions instead of background scanners.', brands: BC },
      { text: 'Brands see how it works and what it costs on demand, with matches held until a plan is picked.', brands: LZ },
      { text: 'Owners and brands each get their own welcome, with the captured brief attached.', brands: LZ },
    ],
  },
  {
    id: 'r-2026-07-13',
    version: '0.1.91',
    title: 'Who owns which lead',
    detail: 'First touch sticks, and everyone sees their own book.',
    date: '2026-07-13',
    highlights: [
      { text: 'Per-user lead access: sticky first-touch ownership, restricted by lead type, with a Humans overview.' },
      { text: 'Convert a lead and the conversion date is tracked.' },
      { text: 'Team alerts carry a clickable lead name, a colour for the lead type, and a real mention.' },
    ],
  },
  {
    id: 'r-2026-07-12',
    version: '0.1.64',
    title: 'Connect WhatsApp yourself',
    date: '2026-07-12',
    highlights: [
      { text: 'Connect WhatsApp from the dashboard through Meta Embedded Signup.' },
      { text: 'Replies sent by a human are badged as Manual, and the agent knows a person has taken over.' },
      { text: 'The Brain answers out loud, streams word by word, and tells you what to fix if voice is off.' },
      { text: 'Cabin Crew leads become their own segment.', brands: WC },
    ],
  },
  {
    id: 'r-2026-07-10',
    version: '0.1.43',
    title: 'PROXe on your phone',
    detail: 'The whole dashboard, built for the device you actually carry.',
    date: '2026-07-10',
    highlights: [
      { text: 'Every page works at phone width: WhatsApp-style chats, leads, pipeline and events.' },
      { text: 'Activity Sources on every brand, and home cards you can move.' },
      { text: 'Webinars end to end: registration intake, a Webinar tab, confirmations by audience, and reminders.', brands: WC },
      { text: 'The agent knows which webinar is running and asks parent or student before sharing the link.', brands: WC },
      { text: 'Support and handoff requests become real tasks.', brands: LZ },
    ],
  },
  {
    id: 'r-2026-07-09',
    version: '0.1.0',
    title: 'The Brain, on every brand',
    detail: 'A spoken catch-up that follows you around the dashboard.',
    date: '2026-07-09',
    highlights: [
      { text: 'The Brain and Configure are on every brand, with your own content behind them.' },
      { text: 'A docked orb that survives page changes: tap to talk, ask back by voice, drag it where you want.' },
      { text: 'The Brain attaches actions to its answers: place a call, open a page, jump to a lead.' },
      { text: 'Photos sent on WhatsApp are captured and shown on the lead.', brands: LZ },
    ],
  },
  {
    id: 'r-2026-07-08',
    version: '0.1.0',
    title: 'A campaign, not a sales funnel',
    detail: 'The dashboard speaks the language of the ground, and the War Room reads the state of it.',
    date: '2026-07-08',
    highlights: [
      { text: 'People, grievances and intensity replace sales vocabulary throughout.', brands: POP },
      { text: 'War Room: a real Punjab map, activity heatmap, ranked channel mix and a booth priority queue.', brands: POP },
      { text: 'PROXe Listen: a signal inbox from real sources, heat score, trending phrases and mood by region.', brands: POP },
      { text: 'Grievance routing from raised to routed to resolved, with ground-team assignment.', brands: POP },
      { text: 'A campaign calendar with confirmed and tentative events.', brands: POP },
      { text: 'The leader app runs on live data: act on grievances, mobilise the frontline.', brands: POP },
      { text: 'Voice in Punjabi, Hindi and English, with the engine used shown on every call.', brands: POP },
    ],
  },
  {
    id: 'r-2026-07-06',
    title: 'Gigs',
    detail: 'Scouts and connectors are their own kind of relationship, counted separately.',
    date: '2026-07-06',
    highlights: [
      { text: 'A Gigs segment beside Leads, with Connector as a second gig type, kept out of lead counts.', brands: LZ },
      { text: 'The Gigs Engine Overview shows the scout lifecycle.', brands: LZ },
      { text: 'Scout drip runs on approved templates without an extra setup step.', brands: LZ },
    ],
  },
  {
    id: 'r-2026-07-04',
    title: 'Calls you can actually read',
    detail: 'Every finished call lands in the dashboard with its recording and transcript.',
    date: '2026-07-04',
    highlights: [
      { text: 'Transcript and recording land on the Calls page, pulled from the source of truth.', brands: POP },
      { text: 'Read a Punjabi or Hindi call in English with a toggle, while the audio stays original.', brands: POP },
      { text: 'Grievance details are extracted after the call and land on the person.', brands: POP },
      { text: 'Outbound grievance calls work without a name, because constituents are often unknown.', brands: POP },
    ],
  },
  {
    id: 'r-2026-07-02',
    title: 'Alerts where your team already is',
    date: '2026-07-02',
    highlights: [
      { text: 'New lead and needs-a-human alerts arrive in Slack, formatted to read at a glance.' },
      { text: 'Plans render as rich cards in the widget and click out to the landing page.', brands: LZ },
      { text: 'Property photo galleries and full detail from the onboarding forms.', brands: LZ },
      { text: 'The chat runs on a stronger model while helpers stay fast.', brands: LZ },
    ],
  },
  {
    id: 'r-2026-07-01',
    title: 'A new voice for the agent',
    date: '2026-07-01',
    highlights: [
      { text: 'A rewritten WhatsApp greeting with buttons, and the approved cadence templates wired in.', brands: BC },
      { text: 'The full Meta form submission on the lead card, expandable.', brands: BC },
      { text: 'Planned follow-ups shown as a timeline in the lead panel.', brands: BC },
      { text: 'Click a knowledge item to read all of it.', brands: BC },
      { text: 'Team member names are editable, including your own.', brands: BC },
    ],
  },
  {
    id: 'r-2026-06-30',
    title: 'Loka knows commercial real estate',
    detail: 'The dashboard and the agent both speak in property terms.',
    date: '2026-06-30',
    highlights: [
      { text: 'Property type, size and location on the leads table and the detail view.', brands: LZ },
      { text: 'A guided menu on the first WhatsApp message, with buttons instead of a blank prompt.', brands: LZ },
      { text: 'A qualification flow with real guardrails, grounded in the configuration brief.', brands: LZ },
      { text: 'An Add Lead form that changes shape for a brand or an owner.', brands: LZ },
    ],
  },
  {
    id: 'r-2026-06-28',
    title: 'Lokazen is live',
    date: '2026-06-28',
    highlights: [
      { text: 'The Lokazen brand goes up on PROXe, with a seeded book of leads and conversations to work against.', brands: LZ },
    ],
  },
  {
    id: 'r-2026-06-04',
    title: 'Meta form leads arrive complete',
    detail: 'The form already asked. The lead should not have to be asked again.',
    date: '2026-06-04',
    highlights: [
      { text: 'Name, email and city captured straight from the Meta form onto the lead.', brands: WC },
      { text: 'Parent or student typed from the form fields, and broken out in the snapshot.', brands: WC },
      { text: 'Meta form and click-through are told apart as sources, and plain Google reads as Google Organic.', brands: WC },
      { text: 'A redesigned form card in the inbox with the fields in order.', brands: WC },
    ],
  },
  {
    id: 'r-2026-05-21',
    title: 'One lead, one record',
    date: '2026-05-21',
    highlights: [
      { text: 'Merge two leads into one and keep the stronger record.', brands: WC },
      { text: 'Real names are promoted from the chat when the stored one is garbled, and spoofed characters can be stripped.', brands: WC },
      { text: 'The inbox tells customer, agent and template messages apart at a glance.', brands: WC },
      { text: "Today's snapshot covers today, 7, 14 or 28 days.", brands: WC },
    ],
  },
  {
    id: 'r-2026-05-19',
    title: 'Your team, on the dashboard',
    date: '2026-05-19',
    highlights: [
      { text: 'Invite, manage and deactivate users, with real invitation emails and sign out.', brands: WC },
      { text: 'A WhatsApp template picker in the inbox reply bar.', brands: WC },
      { text: 'Quick-reply buttons on WhatsApp, and slot times that respect the clock.', brands: WC },
    ],
  },
  {
    id: 'r-2026-05-18',
    title: 'Know where every lead came from',
    detail: 'Source, first touch and last touch, on every lead you already had.',
    date: '2026-05-18',
    highlights: [
      { text: 'A full attribution model: source, first touch, last touch, and the landing page behind it.', brands: WC },
      { text: 'Existing leads backfilled, so the history is not blank.', brands: WC },
      { text: 'Last touch names who acted, you or PROXe.', brands: WC },
      { text: 'A step-by-step call orchestrator that turns a note into the next action.', brands: WC },
      { text: 'Course, timeline and lead type extracted from the conversation itself.', brands: WC },
    ],
  },
]
