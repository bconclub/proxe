// What's new - the RELEASE notes surfaced in the NotificationCenter.
//
// This is product comms for the people paying for PROXe. It is not a changelog,
// and it is not a list of things we got wrong.
//
// THE RULES (founder call, 2026-08-05, after the first pass got this wrong):
//
//   1. One entry per RELEASE, not per change. A release lands every couple of
//      days and carries several highlights. Nobody wants a notification every
//      time we push.
//   2. Say what they can now DO. Never confess a defect. "Overview numbers were
//      wrong above 2000 leads" is our problem; "your totals stay accurate
//      however long your list gets" is their capability. Same fix, and only one
//      of them belongs in front of a client.
//   3. Work out what the release was actually solving and lead with that. The
//      title carries the theme, the highlights carry the specifics.
//   4. The version is the release marker (0.1, 0.2, 0.3 ...). The running build
//      number in the drawer footer is a separate, faster-moving thing - do not
//      try to keep the two in step.
//
// Brand gating lives on the HIGHLIGHT, not the release, so one release can
// carry a line only Windchasers sees and a line only Lokazen sees. A release
// whose every highlight is gated away is hidden entirely for that brand.
//
//   brands omitted or ['*']  → every brand sees this line
//   brands: ['lokazen']      → only that brand's dashboard sees it

export type ReleaseHighlight = {
  text: string
  /** omit / ['*'] = all brands; else specific brand slugs */
  brands?: string[]
}

export type Release = {
  id: string           // stable unique id, e.g. 'r-0-3'
  version: string      // release marker shown as a chip, e.g. '0.3'
  title: string        // the theme - what this release is for
  detail?: string      // one line of framing under the title
  date: string         // ISO date, e.g. '2026-08-05'
  highlights: ReleaseHighlight[]
}

// Newest release first - the drawer renders this array in order, it does not
// sort. Only the newest UNSEEN release visible to the brand raises the badge.
export const RELEASES: Release[] = [
  {
    id: 'r-0-3',
    version: '0.3',
    title: 'Your whole book, and the moment it moves',
    detail: 'Every lead you have in one list, accurate at any size, and a live feed that tells you the moment something needs a human.',
    date: '2026-08-05',
    highlights: [
      { text: 'The leads page holds every lead you have, however many that is, with tab counts that add up to the table.' },
      { text: 'Overview totals stay accurate however long your list gets.' },
      { text: 'A live feed in the sidebar: new leads and incoming messages as they land, stacked by person, with a sound you can switch off.' },
      { text: 'Jump straight back to the latest message in any chat.' },
      { text: 'Scholarship applications arrive on the lead they belong to, with the track they picked.', brands: ['windchasers'] },
      { text: 'A daily brief in Telegram: what came in and from where, what was touched, and who is still waiting on a human.', brands: ['windchasers'] },
      { text: 'See which ad a lead came from, down to the headline, so you can tell what is working.', brands: ['windchasers'] },
    ],
  },
  {
    id: 'r-0-2',
    version: '0.2',
    title: 'The agent hands over like a teammate',
    detail: 'It knows when to step back, remembers what it was told, and books time you can actually take.',
    date: '2026-07-29',
    highlights: [
      { text: 'Reply by hand and the agent stays out of that conversation for a day.' },
      { text: 'Callbacks are offered in real slots, inside the hours you actually work.' },
      { text: 'The agent carries the whole conversation, so it stops asking for what you already gave it.' },
      { text: 'Campaigns, built in a chat: it pulls the audience, matches a WhatsApp template, and drafts it with you.' },
      { text: 'Log a call and PROXe lays out the next move to confirm in one tap.' },
      { text: 'Report an issue from the sidebar, screenshot and all.' },
      { text: 'Run several offline events at once, with leads grouped by the one they registered for.', brands: ['windchasers'] },
      { text: 'The agent knows who has paid, so it can answer when they ask.', brands: ['lokazen'] },
      { text: 'It offers a call when there is a reason to, and lets it go after a no.', brands: ['lokazen'] },
      { text: 'A shared map pin resolves to a real place instead of another question.', brands: ['lokazen'] },
    ],
  },
  {
    id: 'r-0-1',
    version: '0.1',
    title: 'PROXe on your phone',
    detail: 'The whole dashboard, built for the device you actually carry.',
    date: '2026-07-10',
    highlights: [
      { text: 'Every page works on mobile: WhatsApp-style chats, leads, pipeline and events.' },
      { text: 'The Brain: tap the orb for a spoken catch-up, and ask back by voice.' },
      { text: 'Evals for testing conversations and calls against real journeys.' },
    ],
  },
]
