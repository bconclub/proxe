// Curated "what we shipped" updates surfaced in the NotificationCenter.
//
// Add the NEWEST entry at the TOP. Each shows once per viewer (dismiss = seen,
// tracked in localStorage), pinned above lead activity. Keep titles short and
// human — this is product comms, not a version number.
//
//   brands omitted or ['*']  → common: every brand sees it
//   brands: ['lokazen']      → only that brand's dashboard sees it
export type ProductUpdate = {
  id: string          // stable unique id, e.g. '2026-07-05-scrollbars'
  title: string       // short headline
  detail?: string     // optional one-liner
  date: string        // ISO date, e.g. '2026-07-05'
  brands?: string[]   // omit / ['*'] = all brands; else specific slugs
}

// Newest first. Only the newest UNSEEN entry visible to the current brand shows.
export const PRODUCT_UPDATES: ProductUpdate[] = [
  {
    id: '2026-07-05-native-scrollbars',
    title: 'Native, theme-matched scrollbars',
    detail: 'Cleaner scrolling across the dashboard.',
    date: '2026-07-05',
  },
]
