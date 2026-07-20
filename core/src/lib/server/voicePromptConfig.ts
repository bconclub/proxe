/**
 * Voice-prompt config - the ONE core place for the grievance call prompts.
 *
 * Per-language (pa/hi/en) opening / body / closing, editable from the dashboard
 * (Configure → Voice Prompts) and stored per-brand in dashboard_settings (jsonb,
 * key `voice_prompts`). Read by BOTH engines:
 *   - V1  (Vapi test-call)  - server-side, via resolveVoicePrompt()
 *   - V3  (Sarvam pipeline) - over HTTP, via /api/agent/voice/prompt
 *
 * When a field is blank/unsaved it falls back to the file defaults in
 * brands/pop/prompts/voice-langs.ts, so behaviour is unchanged until someone
 * saves an override. No migration - dashboard_settings already exists (same
 * key/value pattern as agent_prompt / widget_style).
 */

import { getServiceClient } from '../services/supabase';
import {
  POP_VOICE_PROMPTS, composePrompt, isVoiceLang,
  type VoiceLang, type VoicePrompt,
} from '@brand/prompts/voice-langs';

export const VOICE_PROMPT_KEY = 'voice_prompts';

export interface VoicePromptFields {
  opening?: string;
  body?: string;
  closing?: string;
}
export interface VoicePromptDoc {
  pa?: VoicePromptFields;
  hi?: VoicePromptFields;
  en?: VoicePromptFields;
  updatedAt?: string;
}

/** Raw saved overrides for the current brand (null if none). */
export async function getVoicePromptDoc(): Promise<VoicePromptDoc | null> {
  const supabase = getServiceClient();
  if (!supabase) return null;
  try {
    const { data } = await supabase
      .from('dashboard_settings')
      .select('value')
      .eq('key', VOICE_PROMPT_KEY)
      .maybeSingle();
    return (data?.value as VoicePromptDoc) || null;
  } catch {
    return null;
  }
}

/** Persist overrides for the current brand (dashboard Configure). */
export async function saveVoicePromptDoc(doc: VoicePromptDoc): Promise<boolean> {
  const supabase = getServiceClient();
  if (!supabase) return false;
  try {
    const value: VoicePromptDoc = { ...doc, updatedAt: new Date().toISOString() };
    const { error } = await supabase
      .from('dashboard_settings')
      .upsert({ key: VOICE_PROMPT_KEY, value }, { onConflict: 'key' });
    return !error;
  } catch {
    return false;
  }
}

/**
 * The effective prompt for a language: each field is the saved override if
 * non-blank, else the file default. `prompt` is the composed system prompt
 * (body + closing) the model actually receives; `firstMessage` is the opening.
 */
export async function resolveVoicePrompt(lang?: string | null): Promise<VoicePrompt> {
  const key: VoiceLang = isVoiceLang(lang) ? lang : 'pa';
  const def = POP_VOICE_PROMPTS[key];
  const doc = await getVoicePromptDoc();
  const ov = doc?.[key] || {};
  const pick = (o: string | undefined, d: string) => (o && o.trim() ? o : d);
  const opening = pick(ov.opening, def.opening);
  const body = pick(ov.body, def.body);
  const closing = pick(ov.closing, def.closing);
  return {
    ...def,
    opening,
    body,
    closing,
    firstMessage: opening,
    prompt: composePrompt(key, body, closing),
  };
}

/** All three languages as editable fields (override merged over default) - for the editor. */
export async function getEditableVoicePrompts(): Promise<
  Record<VoiceLang, { opening: string; body: string; closing: string; default: VoicePromptFields }>
> {
  const doc = await getVoicePromptDoc();
  const out = {} as Record<VoiceLang, { opening: string; body: string; closing: string; default: VoicePromptFields }>;
  (['pa', 'hi', 'en'] as VoiceLang[]).forEach((k) => {
    const def = POP_VOICE_PROMPTS[k];
    const ov = doc?.[k] || {};
    out[k] = {
      opening: (ov.opening ?? def.opening),
      body: (ov.body ?? def.body),
      closing: (ov.closing ?? def.closing),
      default: { opening: def.opening, body: def.body, closing: def.closing },
    };
  });
  return out;
}
