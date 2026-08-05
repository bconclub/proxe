// Curated "what we shipped" updates surfaced in the NotificationCenter.
//
// Add the NEWEST entry at the TOP. Each shows once per viewer (dismiss = seen,
// tracked in localStorage), pinned above lead activity. Keep titles short and
// human. This is product comms, not a version number.
//
//   brands omitted or ['*']  → common: every brand sees it
//   brands: ['lokazen']      → only that brand's dashboard sees it
//
// The drawer renders this array IN ORDER - it does not sort. Keep it strictly
// newest-first, across brands, or entries surface out of sequence.
//
// Rule of thumb for what belongs here: if a person using the dashboard would
// notice the difference, it goes in. That includes fixes, not just features -
// "the numbers were wrong above 2000 leads" matters more to them than any new
// button. Groundwork that ships inert (no UI wired yet) does NOT go in.
export type ProductUpdate = {
  id: string          // stable unique id, e.g. '2026-07-05-scrollbars'
  title: string       // short headline
  detail?: string     // optional one-liner
  date: string        // ISO date, e.g. '2026-07-05'
  version?: string    // release it shipped in, e.g. '0.2', shown as a chip
  brands?: string[]   // omit / ['*'] = all brands; else specific slugs
}

// Newest first. Only the newest UNSEEN entry visible to the current brand shows.
//
// Versioning starts fresh at 0.1 with the mobile release (2026-07-10). Every
// commit that writes core/ auto-bumps the patch (pre-commit hook →
// scripts/bump-version.js): 0.1.1, 0.1.2, … carry at 100 → 0.2.0. Entries
// older than 0.1 predate the scheme and carry no version chip.
export const PRODUCT_UPDATES: ProductUpdate[] = [
  {
    id: '2026-08-05-leads-uncapped',
    title: 'The leads page shows every lead now, not the newest 1000',
    detail: 'Older leads were invisible - the Webinar tab read "none yet" while holding 191 registrations, and OWNER came up empty. The full list now loads, tabs no longer overlap, and the counts add up to the table total.',
    date: '2026-08-05',
    version: '0.3',
  },
  {
    id: '2026-08-04-live-notifications',
    title: 'You now hear it when a lead or a message lands',
    detail: 'The bell moved to the sidebar, so it is there on every page, with a live Activity feed. New leads and incoming messages ping a sound while your tab is open. Turn any of it off in Configure → Notifications & Sounds.',
    date: '2026-08-04',
    version: '0.3',
  },
  {
    id: '2026-08-04-jump-to-latest',
    title: 'Jump back to the latest message',
    detail: 'Scrolled up in a long chat? A button now drops you straight to the bottom, in every chat across the dashboard and the widget.',
    date: '2026-08-04',
    version: '0.3',
  },
  {
    id: '2026-08-04-scholarships',
    title: 'Scholarship applications land on the lead',
    detail: 'Applications from the site used to have nowhere to go. Each one now attaches to the lead you are already working, matched on phone, with the track they picked filled in.',
    date: '2026-08-04',
    version: '0.3',
    brands: ['windchasers'],
  },
  {
    id: '2026-08-04-telegram-briefs',
    title: 'A daily brief in Telegram',
    detail: 'New leads and where they came from, how many were touched, calls logged and booked today, and who needs a human - each name a link straight into the inbox.',
    date: '2026-08-04',
    version: '0.3',
    brands: ['windchasers'],
  },
  {
    id: '2026-08-01-metrics-truncation',
    title: 'Overview numbers were wrong above 2000 leads',
    detail: 'Total Leads sat pinned at 2000, and everything computed from it - engaged, warm, follow-up due, booked, the funnel, channel splits - was wrong with it. All of it now reads your real total.',
    date: '2026-08-01',
    version: '0.3',
  },
  {
    id: '2026-07-30-ad-attribution',
    title: 'See which ad a lead came from',
    detail: 'WhatsApp leads from click-to-WhatsApp ads used to look organic. The ad, its headline and the campaign now show on the lead, so you can tell what is actually working.',
    date: '2026-07-30',
    version: '0.3',
    brands: ['windchasers'],
  },
  {
    id: '2026-07-29-human-takeover',
    title: 'The agent stays quiet for 24h once you reply by hand',
    detail: 'It used to talk over you: a teammate answered, the customer said "Ok", and the bot cut in with something unrelated. Once a human replies in a thread, the agent holds off for a day.',
    date: '2026-07-29',
    version: '0.2',
  },
  {
    id: '2026-07-29-real-booking-slots',
    title: 'Bookings offer real slots, in the real window',
    detail: 'The agent used to invent times like "11:48 AM" and only ever offered 3, 4 and 5 PM. Callbacks now run 11 AM to 6 PM, always at least 90 minutes out, and every time offered is one you can actually take.',
    date: '2026-07-29',
    version: '0.2',
  },
  {
    id: '2026-07-29-offline-events',
    title: 'Offline events, grouped and on schedule',
    detail: 'More than one event can run at a time, leads are grouped by the event they registered for, newest first, and reminders go out with directions instead of silently skipping.',
    date: '2026-07-29',
    version: '0.2',
    brands: ['windchasers'],
  },
  {
    id: '2026-07-29-payments-visible',
    title: 'The agent knows who has paid',
    detail: 'Someone would pay on the website, ask about it, and be told "I do not have visibility into payment status". Payments now reach the agent, so it can answer.',
    date: '2026-07-29',
    version: '0.2',
    brands: ['lokazen'],
  },
  {
    id: '2026-07-29-no-call-pushing',
    title: 'The agent stops pushing for a call',
    detail: 'It was turning every exchange into a booking attempt, three messages running. It now offers a call only when someone asks, and never re-offers after a no.',
    date: '2026-07-29',
    version: '0.2',
    brands: ['lokazen'],
  },
  {
    id: '2026-07-28-agent-memory',
    title: 'The agent stops asking what you already told it',
    detail: 'On long chats it only ever saw the first 20 messages, so past 20 turns it re-asked budget, floor and size it had already been given. It now reads the recent conversation plus every detail captured on the lead.',
    date: '2026-07-28',
    version: '0.2',
  },
  {
    id: '2026-07-28-mobile-bubbles',
    title: 'Chat bubbles no longer get cut off on your phone',
    detail: 'Message bubbles were a fixed width wider than a phone screen, so text ran off both edges in the inbox. They now fit the screen they are on.',
    date: '2026-07-28',
    version: '0.2',
  },
  {
    id: '2026-07-28-maps-links',
    title: 'Shared map pins are read properly',
    detail: 'An owner would send a Google Maps link and the agent would keep asking where the property was. It now resolves the pin to a real place name and confirms it back.',
    date: '2026-07-28',
    version: '0.2',
    brands: ['lokazen'],
  },
  {
    id: '2026-07-22-accept-invite',
    title: 'Team invites no longer hang on "Verifying invitation..."',
    detail: 'New teammates could get stuck on a spinner forever, with no error to explain it. Accepting an invite works, and tells you when something is wrong.',
    date: '2026-07-22',
    version: '0.2',
  },
  {
    id: '2026-07-20-log-call-chat',
    title: 'Log a call, then plan the next move with PROXe',
    detail: 'After you log a call, PROXe reads your notes and lays out the next steps to confirm in one tap: the message to send, the follow-up, and your reminder.',
    date: '2026-07-20',
    version: '0.2',
  },
  {
    id: '2026-07-19-campaigns',
    title: 'Campaigns, built in a chat',
    detail: 'Tell PROXe who to reach and it pulls the audience, matches a WhatsApp template, and drafts the campaign with you. Find it in the sidebar.',
    date: '2026-07-19',
    version: '0.2',
  },
  {
    id: '2026-07-17-report-issue',
    title: 'See something broken? Report it in one click',
    detail: 'New Report Issue button in the sidebar. Paste a screenshot, tell us what went wrong, done. Every report reaches the team and fixes ship in updates.',
    date: '2026-07-17',
    version: '0.2',
  },
  {
    id: '2026-07-10-mobile',
    title: 'PROXe is live on mobile',
    detail: 'The whole dashboard now works on your phone. WhatsApp-style chats, tap-friendly leads, pipeline, events. Open it on mobile and go.',
    date: '2026-07-10',
    version: '0.1',
  },
  {
    id: '2026-07-10-brain-quick-actions',
    title: 'Quick Action Brain on your desktop',
    detail: 'The Brain now attaches actions to its answers: place a call, open a page, jump to a lead, straight from the reply.',
    date: '2026-07-10',
  },
  {
    id: '2026-07-09-the-brain',
    title: 'The Brain',
    detail: 'Tap the corner orb for a spoken catch-up and ask back by voice.',
    date: '2026-07-09',
  },
  {
    id: '2026-07-05-evals',
    title: 'Evals are live for WhatsApp and call testing',
    detail: 'Test conversations and calls against real journeys from the Eval bench.',
    date: '2026-07-05',
  },
]
