/**
 * Agent-prompt config - brand divergence as DATA, not code.
 *
 * The agent's system prompt (per channel) is editable from the dashboard
 * Configure section and stored per-brand in dashboard_settings (key/value, jsonb)
 * - each brand has its own Supabase, so the row is automatically brand-scoped.
 *
 * promptBuilder reads the override via getPromptOverride(); when the row is empty
 * it falls back to the hardcoded brand prompt file, so behaviour is unchanged
 * until someone saves an override. No migration: dashboard_settings already
 * exists as a key/value store (same pattern as token_usage / widget_style).
 */

import { getServiceClient } from './services/supabase';

export const AGENT_PROMPT_KEY = 'agent_prompt';

export type PromptChannel = 'system' | 'web' | 'voice';

export interface AgentPromptDoc {
  /** Default/base system prompt (whatsapp + fallback). */
  system?: string;
  /** Web-chat override. */
  web?: string;
  /** Voice override. */
  voice?: string;
  updatedAt?: string;
}

/** Read the saved agent-prompt overrides for the current brand (null if none). */
export async function getAgentPrompts(): Promise<AgentPromptDoc | null> {
  const supabase = getServiceClient();
  if (!supabase) return null;
  try {
    const { data } = await supabase
      .from('dashboard_settings')
      .select('value')
      .eq('key', AGENT_PROMPT_KEY)
      .maybeSingle();
    return (data?.value as AgentPromptDoc) || null;
  } catch {
    return null;
  }
}

/**
 * Resolve the prompt override for a channel: the channel-specific text if set,
 * else the base `system` text, else null (→ caller falls back to the file prompt).
 */
export async function getPromptOverride(channel?: string): Promise<string | null> {
  const doc = await getAgentPrompts();
  if (!doc) return null;
  if (channel === 'web' && doc.web?.trim()) return doc.web;
  if (channel === 'voice' && doc.voice?.trim()) return doc.voice;
  return doc.system?.trim() ? doc.system : null;
}

/** Persist agent-prompt overrides for the current brand (dashboard Configure). */
export async function saveAgentPrompts(doc: AgentPromptDoc): Promise<boolean> {
  const supabase = getServiceClient();
  if (!supabase) return false;
  try {
    const value: AgentPromptDoc = { ...doc, updatedAt: new Date().toISOString() };
    const { error } = await supabase
      .from('dashboard_settings')
      .upsert({ key: AGENT_PROMPT_KEY, value }, { onConflict: 'key' });
    return !error;
  } catch {
    return false;
  }
}
