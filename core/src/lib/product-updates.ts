// Curated "what we shipped" updates surfaced in the NotificationCenter.
//
// Add the NEWEST entry at the TOP. Each shows once per viewer (dismiss = seen,
// tracked in localStorage), pinned above lead activity. Keep titles short and
// human. This is product comms, not a version number.
//
//   brands omitted or ['*']  → common: every brand sees it
//   brands: ['lokazen']      → only that brand's dashboard sees it
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
