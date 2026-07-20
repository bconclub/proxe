// The INTENSITY LADDER - POP's central shared model.
//
// ~3 crore people, ~2 crore voters; each person climbs a ladder of engagement
// intensity. Every artifact (War Room, Pulse Punjab leader app, D2D, MyVoice,
// Listen) reads/writes the SAME person in all_leads and gauges flow on this
// one number.
//
// ENFORCEMENT lives in the database (migration 026): a BEFORE INSERT/UPDATE
// trigger on all_leads derives the tier from lean/action_intent/
// engagement_type/lead_stage/constituency/booth + d2d_workers membership, with
// ratchet semantics (climbs, never silently falls; 'opposed' caps derived at
// 1). This file is the shared DISPLAY vocabulary only - labels, colors,
// helpers - so every surface names and colors the tiers identically.

export type IntensityTier = 0 | 1 | 2 | 3 | 4

export interface IntensityTierDef {
  tier: IntensityTier
  key: string
  label: string
  /** short description of what qualifies a person for this tier */
  means: string
  color: string
}

export const INTENSITY_TIERS: IntensityTierDef[] = [
  { tier: 0, key: 'contact', label: 'Contact', means: 'Row exists - nothing placeable yet', color: '#7A8AA0' },
  { tier: 1, key: 'voter', label: 'Voter', means: 'Placeable: seat/booth known, a lean, or vote intent', color: '#3B82F6' },
  { tier: 2, key: 'supporter', label: 'Supporter', means: 'Leans supporter (or leaning + will act)', color: '#22C55E' },
  { tier: 3, key: 'volunteer', label: 'Volunteer', means: 'Raised their hand to work', color: '#F59E0B' },
  { tier: 4, key: 'cadre', label: 'Cadre', means: 'Active registered field worker (d2d_workers)', color: '#F06C18' },
]

export const tierDef = (t: number): IntensityTierDef =>
  INTENSITY_TIERS[Math.max(0, Math.min(4, Math.round(t)))] || INTENSITY_TIERS[0]

export const tierLabel = (t: number): string => tierDef(t).label
export const tierColor = (t: number): string => tierDef(t).color
