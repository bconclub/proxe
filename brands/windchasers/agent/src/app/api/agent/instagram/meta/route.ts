/**
 * Meta Instagram Webhook
 * GET  /api/agent/instagram/meta - Webhook verification (hub.challenge)
 * POST /api/agent/instagram/meta - Incoming Instagram webhook events
 *
 * Required env vars:
 *   META_IG_VERIFY_TOKEN - custom string set in Meta Developer Console
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const DEFAULT_VERIFY_TOKEN = 'windchasers-ig-proxe-verify';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const verifyToken = process.env.META_IG_VERIFY_TOKEN || DEFAULT_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    console.log('[instagram/webhook] Verification successful');
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn('[instagram/webhook] Verification failed', {
    mode,
    hasChallenge: Boolean(challenge),
    tokenMatch: token === verifyToken,
  });

  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body?.object !== 'instagram' && body?.object !== 'page') {
      return NextResponse.json({ status: 'ignored' }, { status: 200 });
    }

    const eventCount = Array.isArray(body.entry) ? body.entry.length : 0;
    console.log('[instagram/webhook] Received event batch', {
      object: body.object,
      eventCount,
    });

    return NextResponse.json({ status: 'received', eventCount }, { status: 200 });
  } catch (error) {
    console.error('[instagram/webhook] Error:', error);
    return NextResponse.json({ status: 'error_logged' }, { status: 200 });
  }
}
