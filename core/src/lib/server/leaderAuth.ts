// Leader API auth — the Pulse Punjab leader app authenticates with its own
// key (x-api-key: LEADER_API_KEY) so it can be rotated independently of the
// machine-intake INBOUND_API_KEY. POP-only, like d2d/log.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentBrandId } from '@/configs';

/** Returns an error response to send, or null when the request is authorized. */
export function leaderAuthGate(req: NextRequest): NextResponse | null {
  if (getCurrentBrandId() !== 'pop') {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const expected = process.env.LEADER_API_KEY;
  if (!expected || req.headers.get('x-api-key') !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}
