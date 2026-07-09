// ─────────────────────────────────────────────────────────────────────────────
// Voice-prompt pack (generic). core/src/lib/server/voicePromptConfig.ts and the
// voice routes import `@brand/prompts/voice-langs` — every brand pack must ship
// this module or non-pop builds fail. This brand runs voice:false, so these
// English-only defaults exist for compile-compat and as a sane starting point
// if voice is ever switched on. Same exported surface as pop's pack.
// ─────────────────────────────────────────────────────────────────────────────

import { brandConfig } from '../config';

export type VoiceLang = 'pa' | 'hi' | 'en';

export interface VoicePrompt {
  lang: VoiceLang;
  label: string;
  native: string;
  opening: string;
  body: string;
  closing: string;
  firstMessage: string;
  prompt: string;
}

const CLOSE_DIRECTIVE =
  'CLOSE — say these lines exactly, in this order, as your final turn, then end the call. Do not shorten, do not say "Goodbye":';

/** Stitch a body + closing into the full system prompt for a language. */
export function composePrompt(_lang: VoiceLang, body: string, closing: string): string {
  const c = (closing || '').trim();
  if (!c) return body.trim();
  return `${body.trim()}\n\n${CLOSE_DIRECTIVE}\n${c}`;
}

const OPENING = `Hi, I'm calling from ${brandConfig.name}. Do you have a quick minute?`;
const BODY = `You are ${brandConfig.name}'s voice assistant on a short, polite outbound call. Ask the caller's name, what they need help with, and whether they'd like a follow-up. Keep every turn to one or two short sentences. Never repeat your opening. If the caller is busy or uninterested, thank them and end the call.`;
const CLOSING = `Thank you for your time. ${brandConfig.name} will follow up shortly.`;

function mk(lang: VoiceLang, label: string, native: string): VoicePrompt {
  return {
    lang, label, native,
    opening: OPENING,
    body: BODY,
    closing: CLOSING,
    firstMessage: OPENING,
    prompt: composePrompt(lang, BODY, CLOSING),
  };
}

// English-only content; pa/hi keys exist to satisfy the shared Record shape
// (the language pickers are config-gated off for this brand).
export const POP_VOICE_PROMPTS: Record<VoiceLang, VoicePrompt> = {
  en: mk('en', 'English', 'English'),
  hi: mk('hi', 'Hindi', 'हिंदी'),
  pa: mk('pa', 'Punjabi', 'ਪੰਜਾਬੀ'),
};

export const VOICE_ASR_LANG: Record<VoiceLang, string> = {
  pa: 'pa-IN', hi: 'hi-IN', en: 'en-IN',
};

export function isVoiceLang(v: unknown): v is VoiceLang {
  return v === 'pa' || v === 'hi' || v === 'en';
}

export function popVoicePrompt(lang?: string | null): VoicePrompt {
  return POP_VOICE_PROMPTS[isVoiceLang(lang) ? lang : 'en'];
}

/** Name-aware greeting: generic pack keeps the prompt as-is. */
export function withKnownName(vp: VoicePrompt, _name?: string | null): VoicePrompt {
  return vp;
}
