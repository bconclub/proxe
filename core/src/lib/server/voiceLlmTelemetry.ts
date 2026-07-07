import { getJson, setJsonWithTtl } from './redis';

// Per-turn latency for the V1/V2 custom-LLM bridge (Vapi/ElevenLabs -> Groq).
// Separate, small store from voice_sessions telemetry — keyed by call id, one
// list of turn timings, short TTL since it's only for the dashboard bench.
const TTL_SECONDS = 60 * 60 * 24; // 1 day

export interface LlmTurnRecord {
  at: string;
  groqMs: number;
  provider: 'vapi' | 'elevenlabs';
  model: string;
}

function key(callId: string): string {
  return `voice:llm-turns:${callId}`;
}

export async function recordLlmTurn(callId: string, turn: LlmTurnRecord): Promise<void> {
  if (!callId) return;
  const existing = (await getJson<LlmTurnRecord[]>(key(callId))) || [];
  existing.push(turn);
  await setJsonWithTtl(key(callId), existing.slice(-50), TTL_SECONDS);
}

export async function getLlmTurns(callId: string): Promise<LlmTurnRecord[]> {
  return (await getJson<LlmTurnRecord[]>(key(callId))) || [];
}
