// Leader API auth — the Pulse Punjab leader app authenticates with its own
// key (x-api-key: LEADER_API_KEY) so it can be rotated independently of the
// machine-intake INBOUND_API_KEY. POP-only, like d2d/log.

import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { getCurrentBrandId } from '@/configs';

// ── Session tokens ──
// The leader app is a PUBLIC browser bundle, so it must NOT carry a secret key.
// Instead the leader types a passcode (LEADER_PASSCODE) into a login screen;
// the app exchanges it at POST /api/leader/auth for a short-lived signed token
// (HMAC over an expiry, keyed by LEADER_API_KEY as the server-side secret). The
// leader GET routes accept that token — no secret ever ships in the bundle.
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12h

function tokenSecret(): string {
  return process.env.LEADER_API_KEY || '';
}

/** Mint a signed session token valid for TOKEN_TTL_MS. */
export function signLeaderToken(): string {
  const exp = String(Date.now() + TOKEN_TTL_MS);
  const sig = createHmac('sha256', tokenSecret()).update(exp).digest('hex');
  return `${exp}.${sig}`;
}

/** True when the token is well-formed, unexpired, and correctly signed. */
export function verifyLeaderToken(token: string | null | undefined): boolean {
  if (!token || !tokenSecret()) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig) return false;
  if (Number(exp) < Date.now()) return false;
  const expected = createHmac('sha256', tokenSecret()).update(exp).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

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

/**
 * Returns an error response to send, or null when the request is authorized.
 * Accepts EITHER the server key (x-api-key, for server-to-server callers) OR a
 * valid session token (Authorization: Bearer, for the login-gated app).
 */
export function leaderAuthGate(req: NextRequest): NextResponse | null {
  if (getCurrentBrandId() !== 'pop') {
    return corsJson({ error: 'not found' }, { status: 404 });
  }
  const expected = process.env.LEADER_API_KEY;
  const keyOk = !!expected && req.headers.get('x-api-key') === expected;
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const tokenOk = verifyLeaderToken(bearer);
  if (!keyOk && !tokenOk) {
    return corsJson({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}
