// Canonical course/interest labels - ONE clean name per track, no abbreviated
// variations ("Cabin" → "Cabin Crew", "Heli" → "Helicopter", "Flight" → "Pilot").
// Used at intake (leads/inbound, facebook-lead) AND display/filter (LeadsTable),
// so old rows stored with the short names normalize on the fly too.
export const COURSE_OPTIONS = ['Pilot', 'DGCA', 'Helicopter', 'Cabin Crew', 'Flight School'] as const

export function normalizeCourse(raw: string | null | undefined): string {
  const s = String(raw ?? '').toLowerCase().trim()
  if (!s) return ''
  if (/cabin|air\s*hostess|flight\s*attendant/.test(s)) return 'Cabin Crew'
  if (/heli|chpl/.test(s)) return 'Helicopter'
  if (/dgca|ground/.test(s)) return 'DGCA'
  // Flight-school (study/train abroad) - MUST come before the generic pilot rule
  // below, since "flight school" contains "flight" and would otherwise → 'Pilot'.
  if (/flight\s*school|flying\s*school|study\s*abroad|train\s*abroad/.test(s)) return 'Flight School'
  if (/pilot|cpl|ppl|flight|flying|\bfly\b/.test(s)) return 'Pilot'
  // Unknown value - return trimmed as-is rather than dropping it.
  return String(raw ?? '').trim()
}
