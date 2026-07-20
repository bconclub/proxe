import { NextRequest, NextResponse } from 'next/server';
import { resolveVoicePrompt } from '@/lib/server/voicePromptConfig';
import { withKnownName } from '@brand/prompts/voice-langs';

export const dynamic = 'force-dynamic';

// GET /api/agent/voice/prompt?lang=pa|hi|en
// The V3 pipeline (Sarvam, on the VPS) fetches its per-language prompt from here
// at call start, so the dashboard-edited prompt applies to V3 too - one core
// place across both engines. Protected with the same key the pipeline already
// uses to ship telemetry (x-v3-key). Returns the composed system prompt + the
// opening + closing so the pipeline can greet, run, and close on the live copy.
export async function GET(req: NextRequest) {
  const expected = process.env.V3_TELEMETRY_KEY;
  if (!expected || req.headers.get('x-v3-key') !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const lang = req.nextUrl.searchParams.get('lang');
  const name = req.nextUrl.searchParams.get('name');
  // Name-aware: if the caller is known, greet by name + skip the name question.
  const vp = withKnownName(await resolveVoicePrompt(lang), name);
  return NextResponse.json({
    lang: vp.lang,
    opening: vp.opening,
    prompt: vp.prompt,   // composed system prompt (body + closing)
    closing: vp.closing,
  });
}
