// ─── LEAD STAGES — the ONE canonical taxonomy ────────────────────────────────
// `all_leads.lead_stage` is the single pipeline field. Every surface that
// shows, filters, or edits a stage MUST read this list:
//   • LeadsTable stage chips + the stage filter dropdown
//   • LeadDetailsModal stage editor
//   • LeadStageSelector
//   • /api/dashboard/leads/[id]/stage (ALLOWED_STAGES)
// The legacy `status` column ("New Lead"/"Follow Up"/"Wrong Enquiry"…) is DEAD
// — null on every lead, written by nothing. Do not resurrect it.
//
// Ordered as the funnel reads left→right; terminal/parking states last.

export interface LeadStageDef {
  value: string
  label: string
  description: string
  /** chip colors (dark-theme rgba pair used across the dashboard) */
  color: string
  bg: string
}

export const LEAD_STAGES: LeadStageDef[] = [
  { value: 'New',           label: 'New',           description: 'Just arrived (score 0-30)',        color: '#9ca3af', bg: 'rgba(107,114,128,0.15)' },
  { value: 'Engaged',       label: 'Engaged',       description: 'Talking, low score (0-30)',        color: '#60a5fa', bg: 'rgba(59,130,246,0.15)' },
  { value: 'Qualified',     label: 'Qualified',     description: 'Score 31-60',                      color: '#a855f7', bg: 'rgba(168,85,247,0.15)' },
  { value: 'High Intent',   label: 'High Intent',   description: 'Score 61-85',                      color: '#f97316', bg: 'rgba(249,115,22,0.15)' },
  { value: 'Demo Taken',    label: 'Demo Taken',    description: 'Saw the product',                  color: '#14b8a6', bg: 'rgba(20,184,166,0.15)' },
  { value: 'Proposal Sent', label: 'Proposal Sent', description: 'Offer in their hands',             color: '#eab308', bg: 'rgba(234,179,8,0.15)' },
  { value: 'Booking Made',  label: 'Booking Made',  description: 'Call/demo scheduled',              color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
  { value: 'In Sequence',   label: 'In Sequence',   description: 'Automated follow-up running',      color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
  { value: 'Nurture',       label: 'Nurture',       description: 'Long-game — check in later',       color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)' },
  { value: 'Closed Won',     label: 'Closed Won',     description: 'Won',                              color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
  { value: 'Closed Lost',   label: 'Closed Lost',   description: 'Lost / disqualified by decision',  color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
  { value: 'Not Qualified', label: 'Not Qualified', description: 'Wrong fit',                        color: '#f43f5e', bg: 'rgba(244,63,94,0.15)' },
  { value: 'Cold',          label: 'Cold',          description: 'No engagement',                    color: '#6b7280', bg: 'rgba(107,114,128,0.15)' },
  { value: 'R&R',           label: 'R&R',           description: 'Rang, no reply',                   color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
]

export const LEAD_STAGE_VALUES = LEAD_STAGES.map((s) => s.value)

/** Chip colors in the shape the dashboard tables already consume. */
export function getStageColor(stage: string | null): { bg: string; text: string; style: { backgroundColor: string; color: string } } {
  const def = LEAD_STAGES.find((s) => s.value === stage) || LEAD_STAGES[0]
  return { bg: '', text: '', style: { backgroundColor: def.bg, color: def.color } }
}
