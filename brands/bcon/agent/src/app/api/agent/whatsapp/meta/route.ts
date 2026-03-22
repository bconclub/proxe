/**
 * Meta Cloud API WhatsApp Webhook
 * GET  /api/agent/whatsapp/meta - Webhook verification (hub.challenge)
 * POST /api/agent/whatsapp/meta - Incoming messages from Meta
 *
 * Bridges Meta's webhook format into the PROXe unified agent engine.
 * Each brand deployment has its own Meta app, phone number, and env vars.
 *
 * Required env vars:
 *   META_WHATSAPP_VERIFY_TOKEN      - custom string set in Meta Developer Console
 *   META_WHATSAPP_ACCESS_TOKEN      - permanent Graph API token
 *   META_WHATSAPP_PHONE_NUMBER_ID   - WhatsApp Business phone number ID
 */

import { NextRequest, NextResponse } from 'next/server';
import { process as processMessage } from '@/lib/agent-core/engine';
import { AgentInput } from '@/lib/agent-core/types';
import {
  getServiceClient,
  getClient,
  ensureOrUpdateLead,
  ensureSession,
  addUserInput,
  logMessage,
  fetchCustomerContext,
  fetchSummary,
  normalizePhone,
} from '@/lib/services';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// ─── Deduplication ────────────────────────────────────────────────────────────
// In-memory set of recently processed WhatsApp message IDs to prevent duplicates
// (Meta can send the same webhook multiple times)
const processedMessageIds = new Set<string>();
const MESSAGE_DEDUP_TTL_MS = 60_000; // 1 minute TTL

function isMessageAlreadyProcessed(messageId: string): boolean {
  if (processedMessageIds.has(messageId)) {
    return true;
  }
  processedMessageIds.add(messageId);
  // Clean up after TTL
  setTimeout(() => processedMessageIds.delete(messageId), MESSAGE_DEDUP_TTL_MS);
  return false;
}

// ─── Meta Graph API helpers ───────────────────────────────────────────────────

/** Send a text reply back to the customer via Meta Graph API. Returns the WA message ID on success. */
async function sendWhatsAppReply(to: string, message: string): Promise<string | null> {
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    console.error('[meta/webhook] Missing META_WHATSAPP_PHONE_NUMBER_ID or META_WHATSAPP_ACCESS_TOKEN');
    return null;
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
      return null;
    }

    const data = await res.json();
    return data?.messages?.[0]?.id || null;
  } catch (err) {
    console.error('[meta/webhook] Failed to send reply:', err);
    return null;
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

// ─── GET - Webhook Verification ───────────────────────────────────────────────

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

// ─── POST - Incoming Messages ─────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Always respond 200 quickly - Meta retries on non-2xx
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

    // Handle status updates (delivered, read receipts)
    if (value.statuses && !value.messages) {
      await handleStatusUpdates(value.statuses);
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

      // ── Deduplication: skip if this exact message was already processed ──
      if (isMessageAlreadyProcessed(whatsappMessageId)) {
        console.log(`[meta/webhook] DUPLICATE skipped: ${whatsappMessageId} from ${customerPhone}`);
        continue;
      }

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

// ─── Channel Performance Tracking ─────────────────────────────────────────────

async function updateChannelPerformance(
  supabase: any,
  leadId: string,
  channel: string,
  event: 'sent' | 'read' | 'response',
  responseTimeSec?: number,
): Promise<void> {
  try {
    const { data: lead } = await supabase
      .from('all_leads')
      .select('unified_context')
      .eq('id', leadId)
      .maybeSingle();
    if (!lead) return;

    const ctx = lead.unified_context || {};
    const perf = ctx.channel_performance || {};
    const ch = perf[channel] || {
      messages_sent: 0,
      messages_read: 0,
      responses_received: 0,
      avg_response_time: null,
      last_successful_contact: null,
    };

    if (event === 'sent') {
      ch.messages_sent = (ch.messages_sent || 0) + 1;
    } else if (event === 'read') {
      ch.messages_read = (ch.messages_read || 0) + 1;
    } else if (event === 'response') {
      ch.responses_received = (ch.responses_received || 0) + 1;
      ch.last_successful_contact = new Date().toISOString();
      if (responseTimeSec != null && responseTimeSec > 0) {
        const prevAvg = ch.avg_response_time || responseTimeSec;
        const prevCount = Math.max((ch.responses_received || 1) - 1, 1);
        ch.avg_response_time = Math.round((prevAvg * prevCount + responseTimeSec) / (prevCount + 1));
      }
    }

    await supabase
      .from('all_leads')
      .update({
        unified_context: {
          ...ctx,
          channel_performance: { ...perf, [channel]: ch },
        },
      })
      .eq('id', leadId);
  } catch (err) {
    console.error(`[meta/channelPerf] Failed to update ${channel}/${event} for ${leadId}:`, err);
  }
}

// ─── Read Receipt / Delivery Status Handling ──────────────────────────────────

async function handleStatusUpdates(statuses: any[]): Promise<void> {
  const supabase = getServiceClient() || getClient();
  if (!supabase) return;

  for (const status of statuses) {
    const waMessageId = status.id;
    const statusType = status.status; // 'delivered', 'read', 'sent', 'failed'
    const timestamp = status.timestamp;
    const recipientId = status.recipient_id;

    if (!waMessageId || !statusType) continue;
    if (statusType !== 'delivered' && statusType !== 'read') continue;

    try {
      // Find the conversation record by WA message ID stored in metadata
      const { data: msg } = await supabase
        .from('conversations')
        .select('id, lead_id, metadata')
        .filter('metadata->>wa_message_id', 'eq', waMessageId)
        .limit(1)
        .maybeSingle();

      if (!msg) {
        console.log(`[meta/status] No conversation found for wa_message_id ${waMessageId}`);
        continue;
      }

      const statusTime = timestamp
        ? new Date(parseInt(timestamp) * 1000).toISOString()
        : new Date().toISOString();

      if (statusType === 'read') {
        // Update conversation record with read_at
        await supabase
          .from('conversations')
          .update({
            read_at: statusTime,
            metadata: { ...msg.metadata, read_at: statusTime },
          })
          .eq('id', msg.id);

        // Also update lead's unified_context.last_read_at
        if (msg.lead_id) {
          const { data: lead } = await supabase
            .from('all_leads')
            .select('unified_context')
            .eq('id', msg.lead_id)
            .maybeSingle();

          if (lead) {
            await supabase
              .from('all_leads')
              .update({
                unified_context: {
                  ...(lead.unified_context || {}),
                  last_read_at: new Date().toISOString(),
                },
              })
              .eq('id', msg.lead_id);
          }
        }

        // Track channel performance: message was read
        if (msg.lead_id) {
          updateChannelPerformance(supabase, msg.lead_id, 'whatsapp', 'read');
        }

        console.log(`[meta/status] READ receipt: msg ${msg.id} read at ${statusTime}`);
      } else if (statusType === 'delivered') {
        // Update conversation record with delivered_at
        await supabase
          .from('conversations')
          .update({
            delivered_at: statusTime,
            metadata: { ...msg.metadata, delivered_at: statusTime },
          })
          .eq('id', msg.id);

        console.log(`[meta/status] DELIVERED receipt: msg ${msg.id} at ${statusTime}`);
      }
    } catch (err) {
      console.error(`[meta/status] Error processing ${statusType} for ${waMessageId}:`, err);
    }
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
    await sendWhatsAppReply(customerPhone, "Hey! Give me just a moment, I'll get the team to reach out to you directly.");
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
      await sendWhatsAppReply(customerPhone, "Hey! Give me just a moment, I'll get the team to reach out to you directly.");
      return;
    }

    // 1b. DB-level dedup: check if agent already responded in the last 10 seconds
    const { data: recentAgentMsg } = await supabase
      .from('conversations')
      .select('created_at')
      .eq('lead_id', leadId)
      .eq('channel', 'whatsapp')
      .eq('sender', 'agent')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentAgentMsg?.created_at) {
      const agentMsgAge = Date.now() - new Date(recentAgentMsg.created_at).getTime();
      if (agentMsgAge < 10_000) { // 10 seconds
        console.log(`[meta/webhook] DEDUP: Agent responded ${agentMsgAge}ms ago for lead ${leadId}, skipping`);
        return;
      }
    }

    // 1c. Content-based dedup: catch retries after server restart or on different serverless instances
    // (in-memory Set is lost on restart; this catches cross-instance duplicates)
    const { data: recentDuplicateMsg } = await supabase
      .from('conversations')
      .select('id')
      .eq('lead_id', leadId)
      .eq('channel', 'whatsapp')
      .eq('sender', 'customer')
      .eq('content', messageText)
      .gte('created_at', new Date(Date.now() - 30_000).toISOString())
      .limit(1)
      .maybeSingle();

    if (recentDuplicateMsg) {
      console.log(`[meta/webhook] CONTENT-DEDUP: Identical message from lead ${leadId} within 30s, skipping`);
      return;
    }

    // 2. Ensure whatsapp session exists and increment message_count
    await ensureSession(sessionId, 'whatsapp', supabase);
    await addUserInput(
      sessionId,
      messageText,
      'whatsapp',
      undefined,
      { source: 'meta_cloud_api', whatsapp_message_id: whatsappMessageId },
      supabase,
    );

    // 3. Log customer message to conversations table
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

    // Track channel performance: customer responded on WhatsApp
    updateChannelPerformance(supabase, leadId, 'whatsapp', 'response').catch(() => {});

    // 4. Fetch cross-channel context
    const customerContext = await fetchCustomerContext(customerPhone, customerName, supabase);

    // 5. Fetch existing summary
    let existingSummary = '';
    const summaryResult = await fetchSummary(sessionId, 'whatsapp', supabase);
    if (summaryResult) {
      existingSummary = summaryResult.summary;
    }
    if (!existingSummary && customerContext?.webSummary) {
      existingSummary = customerContext.webSummary.summary;
    }

    // 6. Fetch recent conversation history for context
    const conversationHistory = await fetchRecentHistory(leadId, supabase);

    // messageCount = number of USER messages in this conversation
    // conversationHistory includes the message we just logged above, so count user messages directly
    const userMessageCount = conversationHistory.filter(m => m.role === 'user').length;
    console.log(`[meta/webhook] lead=${leadId} messageCount=${userMessageCount} historyLen=${conversationHistory.length}`);

    // 7. Build AgentInput and generate AI response
    const agentInput: AgentInput = {
      channel: 'whatsapp',
      message: messageText,
      messageCount: userMessageCount,
      sessionId,
      userProfile: {
        name: customerName,
        phone: customerPhone,
      },
      conversationHistory,
      summary: existingSummary,
      usedButtons: [],
    };

    const aiStartTime = Date.now();
    const result = await processMessage(agentInput, supabase);
    const responseTimeMs = Date.now() - aiStartTime;

    if (!result.response) {
      console.error('[meta/webhook] Empty AI response');
      await sendWhatsAppReply(customerPhone, "Hey! Let me connect you with the team, they'll sort this out for you.");
      return;
    }

    // 8. Send reply via Meta Graph API (send first to get WA message ID)
    const waReplyId = await sendWhatsAppReply(customerPhone, result.response);
    if (!waReplyId) {
      console.error('[meta/webhook] Failed to send reply to', customerPhone);
    } else {
      // Track channel performance: agent message sent on WhatsApp
      updateChannelPerformance(supabase, leadId, 'whatsapp', 'sent').catch(() => {});
    }

    // 9. Log AI response (with response time + WA message ID for read receipt tracking)
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
        input_to_output_gap_ms: responseTimeMs,
        wa_message_id: waReplyId || undefined,
      },
      supabase,
    );

    // 10. Update lead context
    await supabase
      .from('all_leads')
      .update({
        last_touchpoint: 'whatsapp',
        last_interaction_at: new Date().toISOString(),
      })
      .eq('id', leadId);

    // 11. Link lead_id + phone to whatsapp session
    const normalizedSessionPhone = normalizePhone(customerPhone);
    await supabase
      .from('whatsapp_sessions')
      .update({
        lead_id: leadId,
        customer_phone: customerPhone,
        customer_phone_normalized: normalizedSessionPhone,
        customer_name: customerName !== 'WhatsApp User' ? customerName : undefined,
      })
      .eq('external_session_id', sessionId);

    // 12. Fire-and-forget: trigger AI scoring
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
      "Hey! Let me connect you with the team directly. They'll reach out to you shortly.",
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
