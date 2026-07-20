import { NextRequest, NextResponse } from 'next/server';
import { recordLlmTurn } from '@/lib/server/voiceLlmTelemetry';

// Custom-LLM bridge for V1 (Vapi) and V2 (ElevenLabs). Both platforms support
// pointing their assistant/agent at an external "custom LLM" URL instead of
// their own built-in model - they POST an OpenAI-compatible chat-completions
// body (messages + stream) here, and expect an OpenAI-compatible response
// (streamed as SSE chunks when stream:true) back. This is what makes it
// possible to (a) control the actual system prompt from OUR repo instead of
// each platform's dashboard, and (b) run inference through Groq instead of
// each platform's default model.
//
// The one fixed system prompt for the POP grievance-call persona. Every
// incoming request's own system message (if any, from the Vapi/ElevenLabs
// dashboard config) is REPLACED with this - this file is the single source
// of truth for the persona now, not the provider dashboards.
const SYSTEM_PROMPT = `IDENTITY
You are the AI voice of the Congress "Sab di sunenge" team in Punjab, calling citizens to listen to their grievances. Speak Romanized Punjabi (Pinglish) by default to maintain natural text-to-speech pronunciation; switch to Hindi or English text only if the caller does. Warm, respectful, brief. One question per turn. Listen fully, never interrupt, never rush.

OPENING (say this first, do not skip)
"Sat sri akal, main Congress di 'Sab di sunenge' team vallon AI awaaz haan. Do minute tuhadi gall sunni hai. Ki main aage vadh sakdi haan?"

THEN ASK IN ORDER - one short question per turn. Get the NAME first, then the details:
1. NAME - "Pehlaan, tuhada naam ki hai?" Greet them warmly by name and use it naturally through the call. If they decline, carry on without pushing. NEVER invent, assume, or guess a name - only use the exact name the caller actually states. If you didn't clearly hear it, ask once more; if still unclear, continue the call respectfully without using a name rather than making one up.
2. AREA - "Tusi kede ilaqe, pind ya shehar ton gal kar rahe ho?" Once they answer, acknowledge it and state their constituency back to them cleanly.
3. GRIEVANCE - "Hun tuhada sab ton vadda masla keda lagda hai jide bare gall karni chahunde ho?" Let them speak fully, do not lead them. Reflect it back in exactly one short line to confirm you understood.
4. PRIORITY - "Ki eh tuhade layi sab ton zaroori masla hai?"
5. SUPPORT - "Ki tusi Congress di team naal support ya volunteer karna chahunge?"
6. CLOSE - Say ALL THREE parts sequentially in your final turn. Do NOT shorten, do NOT change the phrasing, and do NOT use "Alvida":
   (a) Acknowledge: "Tuhadi gall main note kar layi hai, te main eh sahi bande tak pahunchavaangi."
   (b) Reassure: "Tuhadi awaaz mayne rakhdi hai - asi eh zaroor sunange te tuhade naal rahaange."
   (c) Thank: "Bahut bahut thanvaad Ji."
   ONLY after speaking all three parts do you end the call interaction.

CAPTURED SILENTLY (never say aloud - logged automatically in the background):
constituency + district, grievance category (jobs, water, power, roads, drugs, farm_debt, health, education, other), salience (1 low / 2 medium / 3 top), action_intent (vote, volunteer, rally, share, none), and lean (supporter, leaning, undecided, opposed) - infer lean from tone, NEVER ask it. A citizen who agrees to support or volunteer is a supporter; a grievance by itself never means opposed.

PACING (most important - the caller must never be talked over)
- Ask ONE question, then STOP and WAIT in silence until the caller has completely finished answering.
- Do NOT ask the next question, do NOT fill the pause, do NOT answer for them, and do NOT move on until they have actually responded.
- Speak only when it is clearly your turn. If unsure whether they are done, wait.

HARD RULES
- Make NO promises, policy commitments, or guarantees of action.
- NEVER attack opponents or name other political parties.
- NEVER ask about or record caste, religion, or community. If offered, do not store it, move on immediately.
- Keep every single turn to one short question or one short reflection.
- If the person is hostile, abusive, or wants to end: thank them once politely and terminate the call immediately.
- You listen and log only - do not argue, debate, or persuade.

ENDING
End the call ONLY AFTER you have spoken the full three-part close (acknowledge + reassure + thank). NEVER end on a bare thank-you, never say "Alvida", and never cut the closing short. Never read out fields, categories, numbers, or labels - capture happens automatically in the background.`;

export const dynamic = 'force-dynamic';

function getGroqModel(): string {
  return process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
}

// Best-effort extraction of a call id from whichever shape the caller sends -
// Vapi and ElevenLabs both pass caller metadata differently, and neither is
// guaranteed present on every request, so telemetry logging is opportunistic.
function extractCallId(body: any, provider: 'vapi' | 'elevenlabs'): string | null {
  if (provider === 'vapi') {
    return body?.call?.id || body?.metadata?.call_id || null;
  }
  return body?.metadata?.conversation_id || body?.call_id || null;
}

async function handle(req: NextRequest, provider: 'vapi' | 'elevenlabs') {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GROQ_API_KEY not configured' }, { status: 500 });
  }

  const body = await req.json().catch(() => ({} as any));
  const callId = extractCallId(body, provider);
  const incomingMessages: any[] = Array.isArray(body?.messages) ? body.messages : [];
  // Replace any system message the platform sent with ours; keep the rest of
  // the conversation history (user/assistant turns) as-is.
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...incomingMessages.filter((m) => m?.role !== 'system'),
  ];

  const stream = body?.stream !== false; // both platforms default to streaming
  const startedAt = Date.now();

  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: getGroqModel(),
      messages,
      stream,
      temperature: body?.temperature ?? 0.7,
      max_tokens: body?.max_tokens ?? 300,
    }),
  });

  if (!groqRes.ok || !groqRes.body) {
    const text = await groqRes.text().catch(() => '');
    console.error(`[custom-llm:${provider}] Groq request failed:`, groqRes.status, text);
    return NextResponse.json({ error: 'upstream LLM error' }, { status: 502 });
  }

  if (!stream) {
    const data = await groqRes.json();
    // MUST be awaited - an un-awaited write here gets silently dropped because
    // Vercel freezes the function right after the response is sent, before a
    // detached background promise resolves (confirmed: this exact bug lost
    // every write until fixed).
    await recordLlmTurn(callId || 'unknown', { at: new Date().toISOString(), groqMs: Date.now() - startedAt, provider, model: getGroqModel() }).catch((e) => {
      console.error(`[custom-llm:${provider}] telemetry write failed:`, e?.message);
    });
    return NextResponse.json(data);
  }

  // Pass Groq's SSE stream straight through - it's already OpenAI-compatible,
  // which is exactly the shape Vapi/ElevenLabs expect back.
  let firstTokenAt: number | null = null;
  const telemetryModel = getGroqModel();
  const passthrough = new TransformStream({
    transform(chunk, controller) {
      if (firstTokenAt === null) firstTokenAt = Date.now();
      controller.enqueue(chunk);
    },
    flush() {
      // Returning the promise lets the stream machinery wait for it before
      // treating the stream as fully closed, instead of a detached write
      // that could get dropped the moment the response finishes.
      return recordLlmTurn(callId || 'unknown', {
        at: new Date().toISOString(),
        groqMs: (firstTokenAt ?? Date.now()) - startedAt,
        provider,
        model: telemetryModel,
      }).catch(() => {});
    },
  });

  return new NextResponse(groqRes.body.pipeThrough(passthrough), {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}

export async function POST(req: NextRequest) {
  // Both platforms hit the same shape; a `provider` query param distinguishes
  // them only for telemetry labeling (?provider=vapi|elevenlabs).
  const provider = req.nextUrl.searchParams.get('provider') === 'elevenlabs' ? 'elevenlabs' : 'vapi';
  try {
    return await handle(req, provider);
  } catch (err: any) {
    console.error(`[custom-llm:${provider}] error:`, err?.message);
    return NextResponse.json({ error: err?.message || 'error' }, { status: 500 });
  }
}
