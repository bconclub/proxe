/**
 * Meta Cloud API WhatsApp Webhook
 * GET  /api/agent/whatsapp/meta — Webhook verification (hub.challenge)
 * POST /api/agent/whatsapp/meta — Incoming messages from Meta
 *
 * Bridges Meta's webhook format into the PROXe unified agent engine.
 * Each brand deployment has its own Meta app, phone number, and env vars.
 *
 * Required env vars:
 *   META_WHATSAPP_VERIFY_TOKEN      — custom string set in Meta Developer Console
 *   META_WHATSAPP_ACCESS_TOKEN      — permanent Graph API token
 *   META_WHATSAPP_PHONE_NUMBER_ID   — WhatsApp Business phone number ID
 */

import { NextRequest, NextResponse } from 'next/server';
import { process as processMessage } from '@/lib/agent-core/engine';
import { AgentInput } from '@/lib/agent-core/types';
import {
  getServiceClient,
  getClient,
  ensureOrUpdateLead,
  logMessage,
  fetchCustomerContext,
  fetchSummary,
  normalizePhone,
} from '@/lib/services';

export const dynamic = 'force-dynamic';

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// ─── Meta Graph API helpers ───────────────────────────────────────────────────

/** Send a text reply back to the customer via Meta Graph API */
async function sendWhatsAppReply(to: string, message: string): Promise<boolean> {
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    console.error('[meta/webhook] Missing META_WHATSAPP_PHONE_NUMBER_ID or META_WHATSAPP_ACCESS_TOKEN');
    return false;
  }

  try {
    const res = await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body: message },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[meta/webhook] Graph API error:', res.status, err);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[meta/webhook] Failed to send reply:', err);
    return false;
  }
}

/** Mark a message as "read" so the customer sees blue ticks */
async function markAsRead(messageId: string): Promise<void> {
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) return;

  fetch(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    }),
  }).catch((err) => console.error('[meta/webhook] markAsRead failed:', err));
}

// ─── GET — Webhook Verification ───────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const verifyToken = process.env.META_WHATSAPP_VERIFY_TOKEN || 'bcon-proxe-verify';

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[meta/webhook] Verification successful');
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn('[meta/webhook] Verification failed', { mode, tokenMatch: token === verifyToken });
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

// ─── POST — Incoming Messages ─────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Always respond 200 quickly — Meta retries on non-2xx
  // We process the message synchronously here since Meta gives us ~30s
  try {
    const body = await request.json();

    // Validate this is a WhatsApp webhook
    if (body.object !== 'whatsapp_business_account') {
      return NextResponse.json({ status: 'ignored' }, { status: 200 });
    }

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value) {
      return NextResponse.json({ status: 'no_value' }, { status: 200 });
    }

    // Skip status updates (delivered, read, etc.)
    if (value.statuses && !value.messages) {
      return NextResponse.json({ status: 'status_update' }, { status: 200 });
    }

    const messages = value.messages;
    if (!messages || messages.length === 0) {
      return NextResponse.json({ status: 'no_messages' }, { status: 200 });
    }

    const contacts = value.contacts || [];
    const brand = process.env.NEXT_PUBLIC_BRAND || 'bcon';

    // Process each message (usually just one)
    for (const msg of messages) {
      // Only handle text messages for now
      if (msg.type !== 'text') {
        console.log(`[meta/webhook] Skipping non-text message type: ${msg.type}`);
        continue;
      }

      const customerPhone = msg.from; // e.g. "919876543210"
      const messageText = msg.text?.body;
      const whatsappMessageId = msg.id;
      const timestamp = msg.timestamp;
      const customerName =
        contacts.find((c: any) => c.wa_id === msg.from)?.profile?.name || 'WhatsApp User';

      if (!messageText) continue;

      console.log(`[meta/webhook] Message from ${customerPhone}: "${messageText.substring(0, 50)}..."`);

      // Mark message as read (fire and forget)
      markAsRead(whatsappMessageId);

      // Process the message and send reply
      await handleIncomingMessage({
        customerPhone,
        customerName,
        messageText,
        whatsappMessageId,
        timestamp,
        brand,
      });
    }

    return NextResponse.json({ status: 'processed' }, { status: 200 });
  } catch (error) {
    console.error('[meta/webhook] Error:', error);
    // Still return 200 to prevent Meta from retrying
    return NextResponse.json({ status: 'error' }, { status: 200 });
  }
}

// ─── Core message processing ──────────────────────────────────────────────────

interface IncomingMessage {
  customerPhone: string;
  customerName: string;
  messageText: string;
  whatsappMessageId: string;
  timestamp: string;
  brand: string;
}

async function handleIncomingMessage(msg: IncomingMessage): Promise<void> {
  const {
    customerPhone,
    customerName,
    messageText,
    whatsappMessageId,
    timestamp,
    brand,
  } = msg;

  const supabase = getServiceClient() || getClient();
  if (!supabase) {
    console.error('[meta/webhook] No Supabase client available');
    await sendWhatsAppReply(customerPhone, "Sorry, I'm having a technical issue right now. Please try again shortly.");
    return;
  }

  try {
    // 1. Create/update lead
    const sessionId = `wa_meta_${normalizePhone(customerPhone)}`;
    const leadId = await ensureOrUpdateLead(
      customerName,
      null,           // no email from WhatsApp
      customerPhone,
      'whatsapp',
      sessionId,
      supabase,
    );

    if (!leadId) {
      console.error('[meta/webhook] Failed to create/update lead');
      await sendWhatsAppReply(customerPhone, "Sorry, I'm having a technical issue. Please try again shortly.");
      return;
    }

    // 2. Log customer message
    await logMessage(
      leadId,
      'whatsapp',
      'customer',
      messageText,
      'text',
      {
        whatsapp_message_id: whatsappMessageId,
        timestamp,
        session_id: sessionId,
        source: 'meta_cloud_api',
      },
      supabase,
    );

    // 3. Fetch cross-channel context
    const customerContext = await fetchCustomerContext(customerPhone, customerName, supabase);

    // 4. Fetch existing summary
    let existingSummary = '';
    const summaryResult = await fetchSummary(sessionId, 'whatsapp', supabase);
    if (summaryResult) {
      existingSummary = summaryResult.summary;
    }
    if (!existingSummary && customerContext?.webSummary) {
      existingSummary = customerContext.webSummary.summary;
    }

    // 5. Fetch recent conversation history for context
    const conversationHistory = await fetchRecentHistory(leadId, supabase);

    // 6. Build AgentInput and generate AI response
    const agentInput: AgentInput = {
      channel: 'whatsapp',
      message: messageText,
      messageCount: conversationHistory.length + 1,
      sessionId,
      userProfile: {
        name: customerName,
        phone: customerPhone,
      },
      conversationHistory,
      summary: existingSummary,
      usedButtons: [],
    };

    const result = await processMessage(agentInput, supabase);

    if (!result.response) {
      console.error('[meta/webhook] Empty AI response');
      await sendWhatsAppReply(customerPhone, "Sorry, I couldn't process that. Could you rephrase?");
      return;
    }

    // 7. Log AI response
    await logMessage(
      leadId,
      'whatsapp',
      'agent',
      result.response,
      'text',
      {
        session_id: sessionId,
        ai_generated: true,
        intent: result.intent,
        source: 'meta_cloud_api',
      },
      supabase,
    );

    // 8. Update lead context
    await supabase
      .from('all_leads')
      .update({
        last_touchpoint: 'whatsapp',
        last_interaction_at: new Date().toISOString(),
      })
      .eq('id', leadId);

    // 9. Send reply via Meta Graph API
    const sent = await sendWhatsAppReply(customerPhone, result.response);
    if (!sent) {
      console.error('[meta/webhook] Failed to send reply to', customerPhone);
    }

    // 10. Fire-and-forget: trigger AI scoring
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    fetch(`${appUrl}/api/webhooks/message-created`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId }),
    }).catch((err) => console.error('[meta/webhook] Scoring trigger failed:', err));

    console.log(`[meta/webhook] Reply sent to ${customerPhone} (lead: ${leadId})`);
  } catch (error) {
    console.error('[meta/webhook] handleIncomingMessage error:', error);
    await sendWhatsAppReply(
      customerPhone,
      "Sorry, something went wrong on our end. Please try again in a moment.",
    ).catch(() => {});
  }
}

/** Fetch recent conversation messages for AI context window */
async function fetchRecentHistory(
  leadId: string,
  supabase: any,
  limit: number = 20,
): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  try {
    const { data, error } = await supabase
      .from('conversations')
      .select('sender, content')
      .eq('lead_id', leadId)
      .eq('channel', 'whatsapp')
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error || !data) return [];

    return data.map((row: any) => ({
      role: row.sender === 'customer' ? 'user' as const : 'assistant' as const,
      content: row.content,
    }));
  } catch {
    return [];
  }
}
