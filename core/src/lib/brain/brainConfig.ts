// ─────────────────────────────────────────────────────────────────────────────
// getBrainConfig() - the Brain's per-brand CONTENT, resolved once.
//
// The Brain (voice orb, briefing API, summaries, eval tabs) is shared
// FUNCTIONALITY; what it says, asks, and looks like is brand CONTENT. Each
// brand may supply a `brain` block in its config (brands/<id>/config.ts); this
// helper merges that block over neutral business defaults so a brand with NO
// block still gets a fully working Brain - English-only, accent-colored orb,
// generic persona built from the brand name, no campaign/sales vocabulary.
// ─────────────────────────────────────────────────────────────────────────────

import { getBrandConfig } from '@/configs';
import type { BrandConfig, CoreCommunication } from '@/configs/types';

type BrainBlock = NonNullable<BrandConfig['brain']>;

export type BrainLanguage = { id: string; label: string; promptRule: string };

export interface ResolvedBrainConfig {
  persona: string;
  vocabularyRule: string;
  quickQuestions: string[];
  thinkingSteps: { briefing: string[]; question: string[] };
  languages: BrainLanguage[];
  voiceId: string;
  orbPalette: BrainBlock['orbPalette']; // undefined → orb derives from the accent color
  summaryPrompt: string;
  reflectionPersona: string;
  evalJourneys: 'pop' | 'business' | 'none';
  communications: CoreCommunication[];
  voiceAgent: NonNullable<BrainBlock['voiceAgent']>;
}

// The one shared default voice (Monika Sogam). Env ELEVENLABS_VOICE_ID and a
// brand's brain.voiceId both take precedence at the call site.
export const DEFAULT_BRAIN_VOICE_ID = '2zRM7PkgwBPiau2jvVXc';

export function getBrainConfig(): ResolvedBrainConfig {
  const brand = getBrandConfig();
  const b: Partial<BrainBlock> = brand.brain || {};

  return {
    persona: b.persona ?? '',
    vocabularyRule:
      b.vocabularyRule ??
      `Vocabulary: speak in the plain language of ${brand.name}'s business - customers, conversations, enquiries, follow-ups. No CRM jargon, no internal system terms.`,
    quickQuestions: b.quickQuestions ?? [
      'What needs my attention today?',
      'What came in today?',
      'How are conversations going?',
      'Anything at risk right now?',
    ],
    thinkingSteps: b.thinkingSteps ?? {
      briefing: [
        'reading today…',
        'checking conversations…',
        'checking what came in…',
        'checking what’s waiting…',
        'putting it into words…',
      ],
      question: ['listening…', 'reading the latest signals…', 'putting it into words…'],
    },
    languages: b.languages ?? [
      { id: 'en', label: 'EN', promptRule: 'Speak in natural conversational English.' },
    ],
    voiceId: b.voiceId ?? DEFAULT_BRAIN_VOICE_ID,
    orbPalette: b.orbPalette,
    summaryPrompt:
      b.summaryPrompt ??
      `You are summarizing a customer conversation for the ${brand.name} team. Write 3-5 SHORT plain sentences: who they are and what they came in for (from what THEY said), what was discussed or resolved, where it stands, and the next step for the team if any. Plain prose only - NO markdown, NO asterisks, NO headings, NO meta-commentary. NEVER say there is nothing to summarize; summarize whatever happened. Be specific - use actual details from the conversation, not generic phrases like "shows interest".`,
    reflectionPersona: b.reflectionPersona ?? `the ${brand.name} assistant`,
    evalJourneys: b.evalJourneys ?? 'none',
    communications: b.communications ?? [],
    voiceAgent: b.voiceAgent ?? {},
  };
}
