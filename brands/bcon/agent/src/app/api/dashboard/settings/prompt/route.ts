import { NextRequest, NextResponse } from 'next/server';
import { getAgentPrompts, saveAgentPrompts, type AgentPromptDoc } from '@/lib/promptConfig';
import { getDefaultBrandPrompt } from '@/lib/agent-core/promptBuilder';
import { getCurrentBrandId } from '@/configs';

export const dynamic = 'force-dynamic';

/**
 * GET → the agent prompts for the Configure editor.
 * Returns the saved override per channel, plus the hardcoded brand-file default
 * as `defaults` so the UI can show "current" and offer "reset to default".
 */
export async function GET() {
  const brand = getCurrentBrandId();
  const saved = (await getAgentPrompts()) || {};
  const defaults = {
    system: getDefaultBrandPrompt(brand, undefined),
    web: getDefaultBrandPrompt(brand, 'web'),
    voice: getDefaultBrandPrompt(brand, 'voice'),
  };
  return NextResponse.json({
    brand,
    prompts: {
      system: saved.system ?? '',
      web: saved.web ?? '',
      voice: saved.voice ?? '',
    },
    defaults,
    updatedAt: saved.updatedAt ?? null,
  });
}

/** PUT → save the per-channel prompt overrides. Empty string = clear that channel (falls back to the brand file). */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const doc: AgentPromptDoc = {
      system: typeof body.system === 'string' ? body.system : '',
      web: typeof body.web === 'string' ? body.web : '',
      voice: typeof body.voice === 'string' ? body.voice : '',
    };
    const ok = await saveAgentPrompts(doc);
    if (!ok) return NextResponse.json({ error: 'Failed to save (no service client?)' }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Bad request' }, { status: 400 });
  }
}
