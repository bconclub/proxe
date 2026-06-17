import { NextRequest, NextResponse } from 'next/server';
import {
  addUserInput,
  ensureSession,
  getClient,
  getServiceClient,
  logMessage,
  updateChannelData,
  updateLeadProfile,
} from '@/lib/services';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

type TranscriptRole = 'user' | 'assistant';

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const sessionId = String(body.sessionId || '').trim();
    const role = body.role as TranscriptRole;
    const transcript = String(body.transcript || '').trim();
    const user = body.user || {};

    if (!sessionId || !transcript || !['user', 'assistant'].includes(role)) {
      return NextResponse.json(
        { error: 'sessionId, role, and transcript are required' },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const supabase = getServiceClient() || getClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Database connection unavailable' },
        { status: 503, headers: CORS_HEADERS },
      );
    }

    await ensureSession(sessionId, 'voice', supabase);

    let leadId: string | null = body.leadId || null;
    if (!leadId && (user.phone || user.email)) {
      leadId = await updateLeadProfile(
        sessionId,
        {
          userName: user.name,
          email: user.email,
          phone: user.phone,
        },
        'voice',
        supabase,
      );
    }

    if (leadId) {
      await supabase
        .from('conversations')
        .update({ lead_id: leadId })
        .filter('metadata->>session_id', 'eq', sessionId)
        .is('lead_id', null);
    }

    const sender = role === 'user' ? 'customer' : 'agent';
    if (sender === 'customer') {
      await addUserInput(
        sessionId,
        transcript,
        'voice',
        'voice_transcript',
        { call_id: body.callId || null },
        supabase,
      );
    }

    const logged = await logMessage(
      leadId,
      'voice',
      sender,
      transcript,
      'voice_transcript',
      {
        session_id: sessionId,
        call_id: body.callId || null,
        source: 'vapi_widget',
        transcript_type: body.transcriptType || 'final',
        ...(leadId ? {} : { anonymous: true }),
      },
      supabase,
    );

    await updateChannelData(
      sessionId,
      'voice',
      {
        last_transcript_at: new Date().toISOString(),
        last_call_id: body.callId || null,
      },
      supabase,
    );

    if (leadId) {
      const origin = new URL(request.url).origin;
      fetch(`${origin}/api/webhooks/message-created`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: leadId }),
      }).catch((err) => console.error('[agent/voice/transcript] scoring failed:', err));
    }

    return NextResponse.json(
      { success: true, leadId, conversationId: logged?.id || null },
      { headers: CORS_HEADERS },
    );
  } catch (error: any) {
    console.error('[agent/voice/transcript] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to persist voice transcript' },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
