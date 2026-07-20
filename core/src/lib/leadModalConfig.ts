/**
 * Lead-detail modal config - choose which tabs a brand shows, from the dashboard.
 *
 * Brand divergence as DATA: which tabs appear in the lead-detail modal (and a few
 * label overrides) is editable at Configure → Lead Modal and stored per-brand in
 * dashboard_settings (key/value jsonb - no migration). The modal reads this and
 * defaults every tab ON, so behaviour is unchanged until a brand turns one off.
 */

import { getServiceClient } from './services/supabase';

export const LEAD_MODAL_KEY = 'lead_modal';

export type LeadModalTab = 'summary' | 'activity' | 'notes' | 'breakdown' | 'interaction' | 'attribution';

export const LEAD_MODAL_TABS: { key: LeadModalTab; label: string; hint: string }[] = [
  { key: 'summary', label: 'Summary', hint: 'Lead overview + AI summary' },
  { key: 'activity', label: 'Activity', hint: 'Timeline of interactions' },
  { key: 'notes', label: 'Notes', hint: 'Human notes' },
  { key: 'breakdown', label: 'Score Breakdown', hint: 'Why the lead scored what it did' },
  { key: 'interaction', label: 'Interaction', hint: 'Full conversation log' },
  { key: 'attribution', label: 'Attribution', hint: 'Source / first-touch / UTM' },
];

export interface LeadModalConfig {
  /** Per-tab visibility. Missing/true = shown. */
  tabs?: Partial<Record<LeadModalTab, boolean>>;
  updatedAt?: string;
}

/** True if a tab should render. Defaults ON (only an explicit `false` hides it). */
export function isTabEnabled(cfg: LeadModalConfig | null | undefined, tab: LeadModalTab): boolean {
  return cfg?.tabs?.[tab] !== false;
}

export async function getLeadModalConfig(): Promise<LeadModalConfig | null> {
  const supabase = getServiceClient();
  if (!supabase) return null;
  try {
    const { data } = await supabase
      .from('dashboard_settings')
      .select('value')
      .eq('key', LEAD_MODAL_KEY)
      .maybeSingle();
    return (data?.value as LeadModalConfig) || null;
  } catch {
    return null;
  }
}

export async function saveLeadModalConfig(cfg: LeadModalConfig): Promise<boolean> {
  const supabase = getServiceClient();
  if (!supabase) return false;
  try {
    const value: LeadModalConfig = { ...cfg, updatedAt: new Date().toISOString() };
    const { error } = await supabase
      .from('dashboard_settings')
      .upsert({ key: LEAD_MODAL_KEY, value }, { onConflict: 'key' });
    return !error;
  } catch {
    return false;
  }
}
