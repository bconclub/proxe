import { NextRequest, NextResponse } from 'next/server';
import { getCurrentBrandId } from '@/configs';
import {
  getEditableVoicePrompts, saveVoicePromptDoc, getVoicePromptDoc,
  type VoicePromptDoc,
} from '@/lib/server/voicePromptConfig';

export const dynamic = 'force-dynamic';

// The ONE core place for the grievance call prompts (Configure → Voice Prompts).
// GET → each language's current opening/body/closing (override merged over the
// file default) plus the default for a "reset" affordance. PUT → save overrides.

export async function GET() {
  const langs = await getEditableVoicePrompts();
  const doc = await getVoicePromptDoc();
  return NextResponse.json({ brand: getCurrentBrandId(), langs, updatedAt: doc?.updatedAt ?? null });
}

/** PUT → save per-language overrides. Empty field = clear (falls back to file default). */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const clean = (o: any): { opening: string; body: string; closing: string } => ({
      opening: typeof o?.opening === 'string' ? o.opening : '',
      body: typeof o?.body === 'string' ? o.body : '',
      closing: typeof o?.closing === 'string' ? o.closing : '',
    });
    const doc: VoicePromptDoc = {
      pa: clean(body.pa),
      hi: clean(body.hi),
      en: clean(body.en),
    };
    const ok = await saveVoicePromptDoc(doc);
    if (!ok) return NextResponse.json({ error: 'Failed to save (no service client?)' }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Bad request' }, { status: 400 });
  }
}
