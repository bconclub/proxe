import { getJson, setJsonWithTtl } from './redis';

const VOICE_TELEMETRY_TTL_SECONDS = 60 * 60 * 24 * 2;

export interface VoiceTelemetrySnapshot {
  callId: string;
  status: string | null;
  direction: 'inbound' | 'outbound' | null;
  leadId?: string | null;
  durationSeconds?: number;
  endedReason?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  provider: 'vapi' | 'elevenlabs' | 'sarvam';
  updatedAt: string;
  trace?: {
    appApiMs?: number | null;
    providerStartMs?: number | null;
    vobizDialMs?: number | null;
    groqMs?: number | null;
    groqCacheHit?: boolean | null;
    notes?: string[];
  } | null;
  performance?: {
    transcriberMs: number | null;
    modelMs: number | null;
    voiceMs: number | null;
    endpointingMs: number | null;
    transportMs: number | null;
    turnAvgMs: number | null;
    turnBestMs: number | null;
    turnWorstMs: number | null;
  } | null;
}

function telemetryKey(callId: string): string {
  return `voice:telemetry:${callId}`;
}

type VapiPerfInput = {
  endpointingLatencyAverage?: number | null;
  modelLatencyAverage?: number | null;
  voiceLatencyAverage?: number | null;
  transcriberLatencyAverage?: number | null;
  fromTransportLatencyAverage?: number | null;
  toTransportLatencyAverage?: number | null;
  turnLatencies?: Array<{ totalLatency?: number | null; latency?: number | null; modelLatency?: number | null; voiceLatency?: number | null; transcriberLatency?: number | null; endpointingLatency?: number | null; isTurnTakingChunk?: boolean | null; isInterruption?: boolean | null; }>;
} | null | undefined;

export function extractVapiPerformance(perf: VapiPerfInput): VoiceTelemetrySnapshot['performance'] {
  if (!perf) return null;

  const turns = (perf.turnLatencies || [])
    .filter((turn) => !turn?.isTurnTakingChunk && !turn?.isInterruption)
    .map((turn) => Number(turn?.totalLatency ?? turn?.latency ?? 0))
    .filter((value) => Number.isFinite(value) && value > 0 && value <= 8000);

  const turnAvgMs = turns.length ? Math.round(turns.reduce((sum, value) => sum + value, 0) / turns.length) : null;
  const turnBestMs = turns.length ? Math.round(Math.min(...turns)) : null;
  const turnWorstMs = turns.length ? Math.round(Math.max(...turns)) : null;

  const fromTransport = Number(perf.fromTransportLatencyAverage || 0);
  const toTransport = Number(perf.toTransportLatencyAverage || 0);

  return {
    transcriberMs: perf.transcriberLatencyAverage ?? null,
    modelMs: perf.modelLatencyAverage ?? null,
    voiceMs: perf.voiceLatencyAverage ?? null,
    endpointingMs: perf.endpointingLatencyAverage ?? null,
    transportMs: fromTransport || toTransport ? Math.round(fromTransport + toTransport) : null,
    turnAvgMs,
    turnBestMs,
    turnWorstMs,
  };
}

export async function writeVoiceTelemetry(snapshot: VoiceTelemetrySnapshot): Promise<void> {
  await setJsonWithTtl(telemetryKey(snapshot.callId), snapshot, VOICE_TELEMETRY_TTL_SECONDS);
}

export async function getVoiceTelemetry(callId: string): Promise<VoiceTelemetrySnapshot | null> {
  return getJson<VoiceTelemetrySnapshot>(telemetryKey(callId));
}

export async function getVoiceTelemetryBulk(callIds: string[]): Promise<Map<string, VoiceTelemetrySnapshot>> {
  const uniqueIds = Array.from(new Set(callIds.filter(Boolean)));
  const rows = await Promise.all(uniqueIds.map(async (callId) => [callId, await getVoiceTelemetry(callId)] as const));
  return new Map(rows.filter((entry): entry is readonly [string, VoiceTelemetrySnapshot] => Boolean(entry[1])));
}
