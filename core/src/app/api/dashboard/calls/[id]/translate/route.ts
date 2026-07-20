import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/services';
import Anthropic from '@anthropic-ai/sdk';
import { resolveModel } from '@/lib/agent-core';

// Translate a call's transcript turns to English on demand. Grievance calls are
// in Punjabi/Hindi; dashboard staff read English - listening (recording) and
// reading (transcript) are different needs. Cached back onto the transcript rows'
// metadata (content_en) so a second open is instant and free.

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const callId = params.id;
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getServiceClient() || authClient;

  // The transcript turns for this call (channel voice, matched by call_id).
  const { data: rows, error } = await supabase
    .from('conversations')
    .select('id, sender, content, metadata, created_at')
    .eq('metadata->>call_id', callId)
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const turns = (rows || []).filter((r: any) => r.content && r.content !== '(call recording)' && !r.metadata?.summary);
  if (!turns.length) return NextResponse.json({ turns: [] });

  // Already translated? Serve the cache.
  const allCached = turns.every((t: any) => typeof t.metadata?.content_en === 'string');
  if (allCached) {
    return NextResponse.json({ turns: turns.map((t: any) => ({ sender: t.sender, content_en: t.metadata.content_en })), cached: true });
  }

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'CLAUDE_API_KEY not set' }, { status: 500 });
  const anthropic = new Anthropic({ apiKey });
  const model = resolveModel(process.env.CLAUDE_MODEL);

  // One call: translate every turn, return a JSON array aligned to the input.
  const numbered = turns.map((t: any, i: number) => `${i}. [${t.sender}] ${t.content}`).join('\n');
  let englishByIndex: string[] = [];
  try {
    const resp = await (anthropic.messages.create as any)({
      model,
      max_tokens: 2000,
      system: 'You translate call-transcript turns (Punjabi/Hindi, Gurmukhi or Devanagari) into natural English. Return ONLY a JSON array of strings - the English of each numbered line, in order, same length as the input. No commentary.',
      messages: [{ role: 'user', content: `Translate each line to English:\n\n${numbered}\n\nReturn a JSON array of ${turns.length} English strings.` }],
    });
    const text = (resp.content || []).map((b: any) => b.text || '').join('').trim();
    const jsonStart = text.indexOf('[');
    const jsonEnd = text.lastIndexOf(']');
    englishByIndex = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  } catch (e: any) {
    return NextResponse.json({ error: 'Translation failed: ' + (e?.message || 'unknown') }, { status: 502 });
  }

  // Persist each translation onto its row's metadata (best-effort cache).
  await Promise.all(turns.map((t: any, i: number) => {
    const en = englishByIndex[i];
    if (typeof en !== 'string') return Promise.resolve();
    return supabase.from('conversations').update({ metadata: { ...(t.metadata || {}), content_en: en } }).eq('id', t.id);
  }));

  return NextResponse.json({
    turns: turns.map((t: any, i: number) => ({ sender: t.sender, content_en: englishByIndex[i] || '' })),
  });
}
