import { NextRequest, NextResponse } from 'next/server';
import {
  addUserInput,
  ensureSession,
  getClient,
  getServiceClient,
  logMessage,
  normalizePhone,
} from '@/lib/services';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

type WebEventMessage = {
  sender: 'customer' | 'agent' | 'system';
  content: string;
  messageType?: string;
  metadata?: Record<string, any>;
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const sessionId = String(body.sessionId || '').trim();
    const messages: WebEventMessage[] = Array.isArray(body.messages) ? body.messages : [];
    const user = body.user || {};

    if (!sessionId || messages.length === 0) {
      return NextResponse.json(
        { error: 'sessionId and messages are required' },
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

    await ensureSession(sessionId, 'web', supabase);

    let leadId: string | null = body.leadId || null;
    if (!leadId) {
      const { data: session } = await supabase
        .from('web_sessions')
        .select('lead_id')
        .eq('external_session_id', sessionId)
        .maybeSingle();
      leadId = session?.lead_id || null;
    }

    // Events are telemetry — they must NOT create a lead. The conversation route
    // (/api/agent/web/chat) is the single, attribution-aware lead creator. If a
    // lead already exists for this phone+brand, link to it; otherwise leave the
    // events anonymous and let the next chat message mint the lead. (Both routes
    // formerly ran find-or-create concurrently -> duplicate leads for the same
    // phone ~0-2s apart: an un-attributed events row + the attributed chat row.)
    if (!leadId && user.phone) {
      const normalizedPhone = normalizePhone(user.phone);
      const brand = process.env.NEXT_PUBLIC_BRAND || 'bcon';
      if (normalizedPhone) {
        const { data: existing } = await supabase
          .from('all_leads')
          .select('id')
          .eq('customer_phone_normalized', normalizedPhone)
          .eq('brand', brand)
          .maybeSingle();
        leadId = existing?.id || null;
      }
    }

    if (leadId) {
      await supabase
        .from('conversations')
        .update({ lead_id: leadId })
        .filter('metadata->>session_id', 'eq', sessionId)
        .is('lead_id', null);
    }

    const logged: any[] = [];
    for (const message of messages) {
      const content = String(message.content || '').trim();
      if (!content || !['customer', 'agent', 'system'].includes(message.sender)) continue;

      if (message.sender === 'customer') {
        await addUserInput(
          sessionId,
          content,
          'web',
          message.metadata?.intent || 'web_event',
          message.metadata || {},
          supabase,
        );
      }

      const row = await logMessage(
        leadId,
        'web',
        message.sender,
        content,
        message.messageType || 'event',
        {
          session_id: sessionId,
          source: 'widget_local_event',
          ...(message.metadata || {}),
          ...(leadId ? {} : { anonymous: true }),
        },
        supabase,
      );
      if (row) logged.push(row);
    }

    if (leadId) {
      const origin = new URL(request.url).origin;
      fetch(`${origin}/api/webhooks/message-created`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: leadId }),
      }).catch((err) => console.error('[agent/web/events] scoring failed:', err));
    }

    return NextResponse.json(
      { success: true, leadId, logged: logged.length },
      { headers: CORS_HEADERS },
    );
  } catch (error: any) {
    console.error('[agent/web/events] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to persist web event' },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
