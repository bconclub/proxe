/**
 * POST /api/chat — Backward-compatibility proxy
 *
 * Phase 4 of the Unified Agent Architecture.
 * Proxies requests from the old /api/chat endpoint to the new
 * /api/agent/web/chat endpoint (Phase 3).
 *
 * This allows the widget and any external integrations still hitting
 * the old endpoint to continue working during the transition.
 */

import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const url = new URL('/api/agent/web/chat', request.url);

  return fetch(url.toString(), {
    method: 'POST',
    headers: request.headers,
    body,
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
