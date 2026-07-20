import { getJson, setJsonWithTtl, getRedisClient } from './redis';

// Per-call telemetry for V3 (the self-hosted Sarvam→Groq→ElevenLabs pipeline).
// The pipeline POSTs one record per call at hangup (api/agent/voice/v3-telemetry);
// the Brain → Calls eval reads them back. Same Redis store as the V1/V2
// custom-LLM bridge telemetry, longer TTL since these ARE the call history for
// V3 (no provider API to re-fetch from, unlike Vapi/ElevenLabs).
const TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const INDEX_KEY = 'voice:v3-calls';
const MAX_INDEXED = 100;

export interface V3TurnRecord {
  total: number;      // ms, user-stop → bot-speaking (real perceived latency)
  stt?: number;       // ms TTFB per stage
  llm?: number;
  tts?: number;
  endpoint?: number;  // ms - our VAD turn-taking wait (silence before we finalize)
  transport?: number | null; // ms - Vobiz carrier + network leg (residual), null if unmeasured
}

export interface V3CallRecord {
  callId: string;
  to: string | null;
  language?: string | null; // dialed starting language (pa/hi/en)
  transcript?: Array<{ role: string; content: string }>; // user/assistant turns
  startedAt: string;
  endedAt: string;
  durationSec: number;
  turns: V3TurnRecord[];
  usage: { llmInTokens: number; llmOutTokens: number; ttsChars: number };
  cost: { stt: number; llm: number; tts: number; total: number };
  connector: { stt: string; model: string; tts: string };
}

function key(callId: string): string {
  return `voice:v3-call:${callId}`;
}

export async function recordV3Call(record: V3CallRecord): Promise<void> {
  if (!record?.callId) return;
  await setJsonWithTtl(key(record.callId), record, TTL_SECONDS);
  const index = (await getJson<string[]>(INDEX_KEY)) || [];
  const next = [record.callId, ...index.filter((id) => id !== record.callId)].slice(0, MAX_INDEXED);
  await setJsonWithTtl(INDEX_KEY, next, TTL_SECONDS);
}

export async function listV3Calls(limit = 50): Promise<V3CallRecord[]> {
  const client = await getRedisClient();
  if (!client) return [];
  const index = (await getJson<string[]>(INDEX_KEY)) || [];
  const out: V3CallRecord[] = [];
  for (const id of index.slice(0, limit)) {
    const rec = await getJson<V3CallRecord>(key(id));
    if (rec) out.push(rec);
  }
  return out;
}
