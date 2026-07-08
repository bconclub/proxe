// Leader API auth — the Pulse Punjab leader app authenticates with its own
// key (x-api-key: LEADER_API_KEY) so it can be rotated independently of the
// machine-intake INBOUND_API_KEY. POP-only, like d2d/log.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentBrandId } from '@/configs';

// The leader app is a separate browser origin (pulse-punjab.vercel.app), so
// every leader route needs CORS. Read-only aggregates + a soft API-key gate —
// wildcard origin is fine (no cookies; the key rides in a custom header).
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
  'Access-Control-Max-Age': '86400',
};

/** NextResponse.json with CORS headers attached. Use for ALL leader responses. */
export function corsJson(data: any, init?: { status?: number }): NextResponse {
  return NextResponse.json(data, { status: init?.status || 200, headers: CORS_HEADERS });
}

/** Preflight handler — re-export as `OPTIONS` from each leader route. */
export function leaderOptions(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/** Returns an error response to send, or null when the request is authorized. */
export function leaderAuthGate(req: NextRequest): NextResponse | null {
  if (getCurrentBrandId() !== 'pop') {
    return corsJson({ error: 'not found' }, { status: 404 });
  }
  const expected = process.env.LEADER_API_KEY;
  if (!expected || req.headers.get('x-api-key') !== expected) {
    return corsJson({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}
