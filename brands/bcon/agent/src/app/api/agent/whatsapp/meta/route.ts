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
import {
  extractProfileFromConversation,
  mergeProfile,
  isLikelyRealPersonName,
  cleanDisplayName,
} from '@/lib/agent-core/conversationIntelligence';
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
  sendWhatsAppInteractiveButtons,
  findQuickReplyFor,
  extractButtonsFromLLMResponse,
  type AttributionSignal,
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

/**
 * Send either an interactive quick-reply button message (when 1-3 button labels
 * are supplied) or a plain text reply. Mirrors the Windchasers webhook: reuses
 * the shared sendWhatsAppInteractiveButtons sender and falls back to plain text
 * if the interactive send fails. Returns the WA message ID on success.
 */
async function sendReplyMaybeButtons(
  to: string,
  message: string,
  buttons?: string[],
): Promise<string | null> {
  if (buttons && buttons.length > 0) {
    const result = await sendWhatsAppInteractiveButtons(to, message, buttons);
    if (result.success) {
      return result.messageId || null;
    }
    console.error(
      '[meta/webhook] Interactive send failed for', to,
      '- falling back to text:', result.error,
    );
    return sendWhatsAppReply(to, message);
  }
  return sendWhatsAppReply(to, message);
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
    // Lowercase — env NEXT_PUBLIC_BRAND may be "BCON"; mixed case splits leads into dupes.
    const brand = String(process.env.NEXT_PUBLIC_BRAND || 'bcon').toLowerCase();

    // Process each message (usually just one)
    for (const msg of messages) {
      // Resolve the inbound text. Plain text messages carry it in text.body.
      // When a customer TAPS a quick-reply button, Meta echoes the label back as
      // a button / interactive message — we extract that label so it flows
      // through as the next "message", and flag it so we don't re-fire another
      // quick-reply menu on it (that would loop).
      let messageText: string | undefined;
      let isCustomerButtonTap = false;
      if (msg.type === 'text') {
        messageText = msg.text?.body;
      } else if (msg.type === 'button') {
        messageText = msg.button?.text || msg.button?.payload;
        isCustomerButtonTap = true;
      } else if (msg.type === 'interactive') {
        const inter = msg.interactive || {};
        messageText = inter.button_reply?.title || inter.list_reply?.title;
        isCustomerButtonTap = true;
      } else {
        console.log(`[meta/webhook] Skipping unsupported message type: ${msg.type}`);
        continue;
      }

      const customerPhone = msg.from; // e.g. "919876543210"
      const whatsappMessageId = msg.id;
      const timestamp = msg.timestamp;
      // Sanitize the WhatsApp display name before greeting/DB write — Meta
      // profile names are often decorative/garbled ("♥╣firru╠♥") or a business
      // name. Clean it and only keep it if it looks like a real person; else
      // fall back to 'WhatsApp User' (which is not persisted as customer_name).
      const rawProfileName = contacts.find((c: any) => c.wa_id === msg.from)?.profile?.name || '';
      const cleanedProfileName = cleanDisplayName(rawProfileName);
      const customerName =
        cleanedProfileName && isLikelyRealPersonName(cleanedProfileName)
          ? cleanedProfileName
          : 'WhatsApp User';

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
        isCustomerButtonTap,
        // Click-to-WhatsApp ad referral (present only on the first message from
        // an ad click). Carries the marketing source for attribution.
        referral: msg.referral || null,
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
    if (!['sent', 'delivered', 'read', 'failed'].includes(statusType)) continue;

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
        // NOTE: read_at/delivered_at live in metadata only — there are no such
        // TOP-LEVEL columns on `conversations`. Including them made Supabase return
        // a silent 42703 error (not thrown, not checked) so the receipt NEVER
        // persisted. A read implies delivered, so stamp both. (read implies delivered)
        const { error } = await supabase
          .from('conversations')
          .update({
            metadata: { ...msg.metadata, delivery_status: 'read', read_at: statusTime, delivered_at: msg.metadata?.delivered_at || statusTime },
          })
          .eq('id', msg.id);
        if (error) console.error('[meta/status] read persist error:', error.message);

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

        if (msg.lead_id) {
          updateChannelPerformance(supabase, msg.lead_id, 'whatsapp', 'read');
        }

        console.log(`[meta/status] READ receipt: msg ${msg.id} read at ${statusTime}`);
      } else if (statusType === 'delivered') {
        // delivered_at lives in metadata only (no top-level column — see read branch).
        const { error } = await supabase
          .from('conversations')
          .update({
            metadata: { ...msg.metadata, delivery_status: 'delivered', delivered_at: statusTime },
          })
          .eq('id', msg.id);
        if (error) console.error('[meta/status] delivered persist error:', error.message);

        console.log(`[meta/status] DELIVERED receipt: msg ${msg.id} at ${statusTime}`);
      } else if (statusType === 'sent') {
        await supabase
          .from('conversations')
          .update({
            metadata: { ...msg.metadata, delivery_status: 'sent' },
          })
          .eq('id', msg.id);

        console.log(`[meta/status] SENT receipt: msg ${msg.id}`);
      } else if (statusType === 'failed') {
        const errorMsg = status.errors?.[0]?.message || status.errors?.[0]?.title || 'unknown error';
        await supabase
          .from('conversations')
          .update({
            metadata: { ...msg.metadata, delivery_status: 'failed', delivery_error: errorMsg },
          })
          .eq('id', msg.id);

        console.log(`[meta/status] FAILED receipt: msg ${msg.id} error: ${errorMsg}`);
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
  /** True when this inbound is the customer tapping a quick-reply button (label echo). */
  isCustomerButtonTap?: boolean;
  /**
   * Click-to-WhatsApp ad referral (Meta sends this on the FIRST message after
   * an ad click): { source_url, source_id, source_type, headline, body,
   * ctwa_clid, ... }. Absent for organic conversations.
   */
  referral?: any;
}

async function handleIncomingMessage(msg: IncomingMessage): Promise<void> {
  const {
    customerPhone,
    customerName,
    messageText,
    whatsappMessageId,
    timestamp,
    brand,
    isCustomerButtonTap,
    referral,
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

    // Click-to-WhatsApp ad → real marketing source. Organic WhatsApp → no
    // signal (resolves to Direct). Set once on the lead; never overwritten.
    let attributionSignal: AttributionSignal | undefined;
    if (referral && (referral.source_url || referral.source_id || referral.source_type)) {
      const isAd = String(referral.source_type || '').toLowerCase() === 'ad';
      attributionSignal = {
        // Meta is the platform behind both ad and post CTWA entry points.
        utmSource: 'meta',
        formType: 'whatsapp_clickthrough',
        utm: {
          source: 'meta',
          medium: isAd ? 'paid_social' : 'social',
          campaign: referral.headline || referral.source_id || null,
          content: referral.body || null,
        },
        pageUrl: referral.source_url || null,
        referrer: referral.source_url || null,
      };
    }

    const leadId = await ensureOrUpdateLead(
      customerName,
      null,           // no email from WhatsApp
      customerPhone,
      'whatsapp',
      sessionId,
      supabase,
      attributionSignal,
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

    // 6b. QUICK-REPLY SHORT-CIRCUIT (deterministic, no LLM).
    // For SHORT inbound messages (<= 4 words) that match a keyword trigger, send
    // a pre-defined interactive button message instead of calling Claude —
    // faster + deterministic. Skipped for button TAPS (the echoed label would
    // otherwise re-fire a menu and loop). The customer message is already logged
    // above; here we send + log the quick reply and return early.
    if (!isCustomerButtonTap) {
      const quickReply = findQuickReplyFor(messageText);
      // Don't re-fire the canned greeting menu for an established conversation.
      // A returning customer who says "hello" mid-thread should get a
      // context-aware LLM reply (using history), NOT the cold "Hey! I'm BCON's
      // AI…" intro again. Other triggers (pricing/services) may still short-
      // circuit. userMessageCount includes the message we just logged, so a
      // brand-new conversation is === 1.
      const suppressGreetingReplay =
        quickReply?.triggerKey === 'greeting' && userMessageCount > 1;
      if (quickReply && !suppressGreetingReplay) {
        console.log(`[meta/webhook] quick-reply trigger=${quickReply.triggerKey} lead=${leadId}`);
        const waReplyId = await sendReplyMaybeButtons(
          customerPhone,
          quickReply.body,
          quickReply.buttons,
        );
        if (waReplyId) {
          updateChannelPerformance(supabase, leadId, 'whatsapp', 'sent').catch(() => {});
        }
        await logMessage(
          leadId,
          'whatsapp',
          'agent',
          quickReply.body,
          'text',
          {
            session_id: sessionId,
            quick_reply_trigger: quickReply.triggerKey,
            quick_reply_buttons: quickReply.buttons,
            source: 'meta_cloud_api',
            wa_message_id: waReplyId || undefined,
          },
          supabase,
        );
        return;
      }
    }

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

    // 8. Send reply via Meta Graph API (send first to get WA message ID).
    // Strip any [BTN: X] markers Claude may have appended (the prompt teaches it
    // to emit these when 2-3 distinct options apply). If found, route as an
    // interactive button message; otherwise plain text.
    const { text: cleanedText, buttons: llmButtons } = extractButtonsFromLLMResponse(result.response);
    const responseTextToSend = cleanedText || result.response;
    if (llmButtons.length > 0) {
      console.log(`[meta/webhook] LLM emitted ${llmButtons.length} buttons: [${llmButtons.join(',')}] lead=${leadId}`);
    }
    const waReplyId = await sendReplyMaybeButtons(
      customerPhone,
      responseTextToSend,
      llmButtons.length > 0 ? llmButtons : undefined,
    );
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
      responseTextToSend,
      'text',
      {
        session_id: sessionId,
        ai_generated: true,
        intent: result.intent,
        source: 'meta_cloud_api',
        input_to_output_gap_ms: responseTimeMs,
        wa_message_id: waReplyId || undefined,
        ...(llmButtons.length > 0 ? { quick_reply_buttons: llmButtons, quick_reply_trigger: 'llm_extracted' } : {}),
      },
      supabase,
    );

    // 10. Update lead context + persist extracted intent fields to brand-specific context
    const { data: leadCtxRow } = await supabase
      .from('all_leads')
      .select('unified_context')
      .eq('id', leadId)
      .maybeSingle();

    const existingCtx = leadCtxRow?.unified_context || {};
    const existingBrandCtx = existingCtx[brand] || existingCtx.bcon || existingCtx.windchasers || {};

    const intentUpdate: Record<string, string> = {};
    if (result.intent?.userType) intentUpdate.user_type = result.intent.userType;
    if (result.intent?.courseInterest) intentUpdate.course_interest = result.intent.courseInterest;
    if (result.intent?.timeline) {
      intentUpdate.timeline = result.intent.timeline;
      intentUpdate.plan_to_fly = result.intent.timeline;
    }

    const leadUpdate: Record<string, any> = {
      last_touchpoint: 'whatsapp',
      last_interaction_at: new Date().toISOString(),
      // PROXe just auto-replied → stamp it as the last actor for the leads-table
      // "Last Touch" badge (@proxe). A later human touch overwrites this.
      unified_context: {
        ...existingCtx,
        ...(Object.keys(intentUpdate).length > 0
          ? { [brand]: { ...existingBrandCtx, ...intentUpdate } }
          : {}),
        last_actor: { type: 'proxe', at: new Date().toISOString() },
      },
    };

    await supabase
      .from('all_leads')
      .update(leadUpdate)
      .eq('id', leadId);

    // 10b. AI profile extraction — richer B2B profile (business_type,
    //      service_interest, pain_point, lead_volume, user_type) that the
    //      keyword intent extractor misses, plus real-name promotion. Runs on
    //      every 2nd user message. Awaited (webhook handler, no streaming).
    if (userMessageCount >= 2 && userMessageCount % 2 === 0) {
      try {
        const profile = await extractProfileFromConversation(conversationHistory);
        if (profile && Object.keys(profile).length > 0) {
          const { data: ctxRow2 } = await supabase
            .from('all_leads')
            .select('unified_context, customer_name')
            .eq('id', leadId)
            .maybeSingle();
          const ctx2 = ctxRow2?.unified_context || {};
          const brandCtx2 = ctx2[brand] || ctx2.bcon || {};
          const mergedBrandCtx = mergeProfile(brandCtx2, profile);

          // Promote the name the user STATED in chat → customer_name. The stored
          // name is usually the WhatsApp push name (e.g. "SAF"), which looks like
          // a real name, so the old guard (!isLikelyRealPersonName(stored)) wrongly
          // blocked the override. Instead: promote when the EXTRACTED name is a
          // real person's name and genuinely differs from the stored one — but not
          // when it's just a shorter/longer form (so we never drop a fuller name).
          const storedName = ctxRow2?.customer_name as string | null | undefined;
          const sL = String(storedName || '').trim().toLowerCase();
          const fL = String(profile.full_name || '').trim().toLowerCase();
          const promote =
            !!profile.full_name &&
            isLikelyRealPersonName(profile.full_name) &&
            sL !== fL &&
            !sL.includes(fL) &&
            !fL.includes(sL);

          const update2: Record<string, any> = {
            unified_context: { ...ctx2, [brand]: mergedBrandCtx },
          };
          if (promote) update2.customer_name = profile.full_name;

          await supabase.from('all_leads').update(update2).eq('id', leadId);
          if (promote) {
            console.log(
              `[meta/webhook/ai-intent] lead=${leadId} promoted customer_name "${storedName}" → "${profile.full_name}"`,
            );
          }
          console.log(`[meta/webhook/ai-intent] lead=${leadId} extracted=${JSON.stringify(profile)}`);
        }
      } catch (err) {
        console.error('[meta/webhook/ai-intent] failed:', err);
      }
    }

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
