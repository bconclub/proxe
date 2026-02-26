/**
 * POST /api/chat/summarize — Backward-compatibility proxy
 *
 * Phase 4 of the Unified Agent Architecture.
 * Proxies requests from the old /api/chat/summarize endpoint to the new
 * /api/agent/summarize endpoint (Phase 3).
 */

import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const url = new URL('/api/agent/summarize', request.url);

  return fetch(url.toString(), {
    method: 'POST',
    headers: request.headers,
    body,
  });
}
