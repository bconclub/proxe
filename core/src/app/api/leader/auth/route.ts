// LEADER AUTH — the login-gate endpoint. OPEN (no key): the leader app POSTs
// the passcode a leader typed; if it matches LEADER_PASSCODE we return a
// short-lived session token. The secret never ships in the public bundle.
//
// Rate-limited by obscurity + a constant-time compare; pair with a strong
// passcode. CORS-enabled like the rest of the leader API.

import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getCurrentBrandId } from '@/configs';
import { corsJson, leaderOptions, signLeaderToken } from '@/lib/server/leaderAuth';

export const dynamic = 'force-dynamic';
export const OPTIONS = leaderOptions;

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  try { return timingSafeEqual(ab, bb); } catch { return false; }
}

export async function POST(req: NextRequest) {
  if (getCurrentBrandId() !== 'pop') return corsJson({ error: 'not found' }, { status: 404 });

  const passcode = process.env.LEADER_PASSCODE;
  const keySecret = process.env.LEADER_API_KEY;
  if (!passcode || !keySecret) {
    return corsJson({ error: 'leader auth not configured' }, { status: 503 });
  }

  const body = await req.json().catch(() => ({} as any));
  const given = typeof body?.passcode === 'string' ? body.passcode : '';
  if (!given || !safeEqual(given, passcode)) {
    return corsJson({ ok: false, error: 'invalid passcode' }, { status: 401 });
  }

  return corsJson({ ok: true, token: signLeaderToken(), expiresInMs: 12 * 60 * 60 * 1000 });
}
