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
import { extractProfileFromConversation, mergeProfile } from '@/lib/agent-core/conversationIntelligence';
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
  isLikelyRealPersonName,
  sendWhatsAppInteractiveButtons,
  findQuickReplyFor,
  extractButtonsFromLLMResponse,
  updateLeadProfile,
} from '@/lib/services';
import {
  isMetaFormClickThrough,
  META_FORM_CLICKTHROUGH_SOURCE,
  META_FORM_CLICKTHROUGH_LABEL,
  META_FORM_CLICKTHROUGH_FIRST_TOUCH,
  META_FORM_CLICKTHROUGH_FIRST_TOUCH_LABEL,
} from '@/lib/services/attribution';
import { BRAND_ID } from '@/configs';

export const dynamic = 'force-dynamic';
// 60s (was 30s): long multi-part questions + tool calls were exceeding 30s and
// getting killed mid-generation, producing the empty-response fallback. The
// extra headroom also covers the single empty-response retry below.
export const maxDuration = 60;

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
    const brand = BRAND_ID;

    // Process each message (usually just one). We accept:
    //   - 'text'        → normal typed message
    //   - 'button'      → tap on a template Quick Reply (e.g. "Book a Demo Class")
    //   - 'interactive' → tap on an interactive button or list (button_reply / list_reply)
    // For button/interactive types we extract the visible label and treat it as
    // a text message — the agent then handles it via normal conversation flow.
    for (const msg of messages) {
      const customerPhone = msg.from;
      const whatsappMessageId = msg.id;
      const timestamp = msg.timestamp;

      let messageText: string | undefined;
      let triggerKind: 'text' | 'button' | 'interactive_button' | 'interactive_list' = 'text';

      if (msg.type === 'text') {
        messageText = msg.text?.body;
      } else if (msg.type === 'button') {
        // Template Quick Reply tap: { button: { payload, text } }
        messageText = msg.button?.text || msg.button?.payload;
        triggerKind = 'button';
      } else if (msg.type === 'interactive') {
        const inter = msg.interactive || {};
        if (inter.type === 'button_reply') {
          messageText = inter.button_reply?.title;
          triggerKind = 'interactive_button';
        } else if (inter.type === 'list_reply') {
          messageText = inter.list_reply?.title;
          triggerKind = 'interactive_list';
        }
      } else {
        console.log(`[meta/webhook] Skipping unsupported message type: ${msg.type}`);
        continue;
      }

      if (!messageText) {
        console.log(`[meta/webhook] No text payload for type=${msg.type}, skipping`);
        continue;
      }

      // Pull profile name from WhatsApp contact metadata. Only trust it if
      // it looks like a real person name — otherwise leave blank so we
      // don't store "WhatsApp User" or other placeholders on the lead.
      const rawWaName = contacts.find((c: any) => c.wa_id === msg.from)?.profile?.name || '';
      const customerName = isLikelyRealPersonName(rawWaName) ? rawWaName.trim() : '';

      // ── Deduplication: skip if this exact message was already processed ──
      if (isMessageAlreadyProcessed(whatsappMessageId)) {
        console.log(`[meta/webhook] DUPLICATE skipped: ${whatsappMessageId} from ${customerPhone}`);
        continue;
      }

      console.log(`[meta/webhook] ${triggerKind} from ${customerPhone}: "${messageText.substring(0, 50)}..."`);

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
        triggerKind,
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
        await supabase
          .from('conversations')
          .update({
            read_at: statusTime,
            metadata: { ...msg.metadata, delivery_status: 'read', read_at: statusTime },
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

        if (msg.lead_id) {
          updateChannelPerformance(supabase, msg.lead_id, 'whatsapp', 'read');
        }

        console.log(`[meta/status] READ receipt: msg ${msg.id} read at ${statusTime}`);
      } else if (statusType === 'delivered') {
        await supabase
          .from('conversations')
          .update({
            delivered_at: statusTime,
            metadata: { ...msg.metadata, delivery_status: 'delivered', delivered_at: statusTime },
          })
          .eq('id', msg.id);

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
  triggerKind?: 'text' | 'button' | 'interactive_button' | 'interactive_list';
}

/**
 * Send a WA reply AND log it to conversations. Always logs — even if the Graph
 * API send fails — so the dashboard reflects what we *tried* to say. When
 * isFallback=true, also flips the lead's needs_human_followup flag so the
 * dashboard surfaces it for a human to pick up.
 */
async function sendAndLogReply(
  supabase: any,
  leadId: string,
  customerPhone: string,
  message: string,
  opts: {
    intent?: any;
    responseTimeMs?: number;
    sessionId?: string;
    isFallback?: boolean;
    fallbackReason?: string;
    /** When present (1-3 labels), send as interactive button message instead of plain text */
    buttons?: string[];
    /** When set, records which quick-reply trigger matched (e.g. 'cpl', 'ppl', or 'llm_extracted') */
    quickReplyTrigger?: string;
  } = {},
): Promise<string | null> {
  // Belt-and-suspenders: strip em/en dashes from EVERY outbound message, even
  // hardcoded / quick-reply ones that bypass the engine's cleanResponse. The
  // customer must never see an em dash.
  message = message.replace(/\s*[—–]\s*/g, ', ').replace(/,\s*,/g, ',').trim();
  let waReplyId: string | null = null;

  if (opts.buttons && opts.buttons.length > 0) {
    // Interactive (quick-reply buttons) path
    const result = await sendWhatsAppInteractiveButtons(customerPhone, message, opts.buttons);
    if (!result.success) {
      console.error('[meta/webhook] Interactive send failed for', customerPhone, '— falling back to text:', result.error);
      // Fall back to text-only send so the customer at least gets the message
      waReplyId = await sendWhatsAppReply(customerPhone, message);
    } else {
      waReplyId = result.messageId || null;
    }
  } else {
    waReplyId = await sendWhatsAppReply(customerPhone, message);
  }

  if (!waReplyId) {
    console.error('[meta/webhook] Graph API send failed for', customerPhone, '— still logging to DB');
  } else {
    updateChannelPerformance(supabase, leadId, 'whatsapp', 'sent').catch(() => {});
  }

  await logMessage(
    leadId,
    'whatsapp',
    'agent',
    message,
    opts.buttons && opts.buttons.length > 0 ? 'interactive' : 'text',
    {
      session_id: opts.sessionId,
      ai_generated: !opts.isFallback,
      is_fallback: !!opts.isFallback,
      fallback_reason: opts.fallbackReason,
      intent: opts.intent,
      source: 'meta_cloud_api',
      input_to_output_gap_ms: opts.responseTimeMs,
      wa_message_id: waReplyId || undefined,
      send_succeeded: !!waReplyId,
      // Mirror the buttons into metadata so the inbox renders them as
      // tappable chips below the message (existing template_buttons UI path).
      template_buttons: opts.buttons || undefined,
      quick_reply_trigger: opts.quickReplyTrigger || undefined,
    },
    supabase,
  ).catch((err: any) => console.error('[meta/webhook] logMessage for agent failed:', err?.message || err));

  if (opts.isFallback) {
    await supabase
      .from('all_leads')
      .update({ needs_human_followup: true })
      .eq('id', leadId)
      .then(
        () => {},
        (err: any) => console.error('[meta/webhook] needs_human_followup flag failed:', err?.message || err),
      );
  }

  return waReplyId;
}

/** Parse a Meta lead-form prefill ("key: value" per line) into a field map. */
function parseFormPrefill(text: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of (text || '').split(/\n+/)) {
    const m = line.match(/^\s*([A-Za-z0-9_'’?\- ]+?)\s*:\s*(.+?)\s*$/);
    if (!m) continue;
    const key = m[1].trim().toLowerCase().replace(/\?+/g, '').replace(/_+$/, '').replace(/[\s-]+/g, '_');
    const val = m[2].trim();
    if (key && val) fields[key] = val;
  }
  return fields;
}

/**
 * Meta-form click-through handler: (1) stamps the click-through attribution and
 * (2) captures the form fields (NAME, EMAIL, CITY, timeline, age, education) onto
 * the lead. The form data only arrives in the prefill message, so without this
 * the lead model shows the WhatsApp account name and no email/city. Idempotent —
 * never clobbers an existing real marketing source, and only fills empty fields.
 */
async function tagMetaFormClickThrough(leadId: string, messageText: string, supabase: any): Promise<void> {
  try {
    const { data } = await supabase
      .from('all_leads')
      .select('unified_context, customer_name, email')
      .eq('id', leadId)
      .maybeSingle();
    const uc = data?.unified_context || {};

    // 1. Attribution (only if no real marketing source yet).
    const existing = String(uc?.attribution?.source || '').toLowerCase().trim();
    if (!existing || existing === 'direct') {
      uc.attribution = {
        ...(uc.attribution || {}),
        source: META_FORM_CLICKTHROUGH_SOURCE,
        source_label: META_FORM_CLICKTHROUGH_LABEL,
        first_touch: META_FORM_CLICKTHROUGH_FIRST_TOUCH,
        first_touch_label: META_FORM_CLICKTHROUGH_FIRST_TOUCH_LABEL,
        captured_at: new Date().toISOString(),
      };
    }

    // 2. Capture form profile fields from the prefill.
    const f = parseFormPrefill(messageText);
    const formName = f.full_name || f.name || f.first_name || null;
    const formEmail = (f.email || '').trim() || null;
    const formCity = f.city || null;
    const formAge = f.what_is_your_age || f.age || null;
    const formTimeline = f.when_are_you_looking_to_start || f.when_are_you_planning_to_start_the_flight_training || null;
    const formEducation = f.have_you_completed_class_12_with_physics_and_maths || null;

    // Differentiate PARENT vs STUDENT form from the field set (the Meta form
    // name itself isn't in the message). Parent forms ask about "your child";
    // student forms ask the person's own age / 12th completion.
    const isParentForm = Object.keys(f).some((k) => k.includes('child'));
    const isStudentForm = !isParentForm && !!(f.what_is_your_age || formEducation || f.when_are_you_looking_to_start);
    const userType = isParentForm ? 'Parent' : isStudentForm ? 'Student' : null;

    // Merge form fields into the brand profile (this is what the leads table /
    // lead modal read for city/age/type/etc.) + keep the raw fields for reference.
    uc.raw_form_fields = { ...(uc.raw_form_fields || {}), ...f };
    uc[BRAND_ID] = {
      ...(uc[BRAND_ID] || {}),
      ...(formCity ? { city: formCity } : {}),
      ...(formAge ? { age: formAge } : {}),
      ...(formTimeline ? { timeline: formTimeline } : {}),
      ...(formEducation ? { completed_12_pcm: formEducation } : {}),
      ...(userType ? { user_type: userType } : {}),
    };

    const update: Record<string, any> = { unified_context: uc };
    // Prefer the FORM name over the WhatsApp account display name.
    if (formName && isLikelyRealPersonName(formName)) update.customer_name = formName;
    // Fill email only if the lead doesn't already have one.
    if (formEmail && !data?.email) update.email = formEmail;

    await supabase.from('all_leads').update(update).eq('id', leadId);
  } catch (err: any) {
    console.error('[meta/webhook] tagMetaFormClickThrough failed:', err?.message || err);
  }
}

async function handleIncomingMessage(msg: IncomingMessage): Promise<void> {
  const {
    customerPhone,
    customerName,
    messageText,
    whatsappMessageId,
    timestamp,
    brand,
    triggerKind = 'text',
  } = msg;

  const supabase = getServiceClient() || getClient();
  if (!supabase) {
    console.error('[meta/webhook] No Supabase client available');
    await sendWhatsAppReply(customerPhone, "Hey! Give me just a moment, I'll get the team to reach out to you directly.");
    return;
  }

  // Hoisted so the outer catch can log the fallback against the lead.
  const sessionId = `wa_meta_${normalizePhone(customerPhone)}`;
  let leadId: string | null = null;

  try {
    // 1. Create/update lead
    leadId = await ensureOrUpdateLead(
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

    // Meta lead-form "Chat on WhatsApp" click-through: the first inbound message
    // is the form prefill. These carry no UTM/marketing channel, so they'd default
    // to 'Direct'. Stamp a distinct source (once) so attribution reflects the form.
    if (isMetaFormClickThrough(messageText)) {
      await tagMetaFormClickThrough(leadId, messageText, supabase);
    }

    // 1b–4. Parallelize: dedup checks + session creation + cross-channel context
    const dedupCutoff30s = new Date(Date.now() - 30_000).toISOString();
    const [
      { data: recentAgentMsg },
      { data: recentDuplicateMsg },
      ,                          // ensureSession returns void
      customerContext,
    ] = await Promise.all([
      // Dedup: has agent replied in last 10s?
      supabase
        .from('conversations')
        .select('created_at')
        .eq('lead_id', leadId)
        .eq('channel', 'whatsapp')
        .eq('sender', 'agent')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Dedup: identical customer message in last 30s?
      supabase
        .from('conversations')
        .select('id')
        .eq('lead_id', leadId)
        .eq('channel', 'whatsapp')
        .eq('sender', 'customer')
        .eq('content', messageText)
        .gte('created_at', dedupCutoff30s)
        .limit(1)
        .maybeSingle(),
      // Ensure whatsapp session exists
      ensureSession(sessionId, 'whatsapp', supabase),
      // Fetch cross-channel context (only needs phone, no leadId dependency)
      fetchCustomerContext(customerPhone, customerName, supabase),
    ]);

    if (recentAgentMsg?.created_at) {
      const agentMsgAge = Date.now() - new Date(recentAgentMsg.created_at).getTime();
      if (agentMsgAge < 3_000) {
        console.log(`[meta/webhook] DEDUP: Agent responded ${agentMsgAge}ms ago for lead ${leadId}, skipping`);
        return;
      }
    }

    if (recentDuplicateMsg) {
      console.log(`[meta/webhook] CONTENT-DEDUP: Identical message from lead ${leadId} within 30s, skipping`);
      return;
    }

    // 2–6. Parallelize: log inputs + fetch history + fetch summary (session now guaranteed to exist)
    const [, , conversationHistory, summaryResult] = await Promise.all([
      addUserInput(
        sessionId,
        messageText,
        'whatsapp',
        undefined,
        { source: 'meta_cloud_api', whatsapp_message_id: whatsappMessageId },
        supabase,
      ),
      logMessage(
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
          trigger_kind: triggerKind,
        },
        supabase,
      ),
      fetchRecentHistory(leadId, supabase),
      fetchSummary(sessionId, 'whatsapp', supabase),
    ]);

    // Track channel performance (fire and forget)
    updateChannelPerformance(supabase, leadId, 'whatsapp', 'response').catch(() => {});

    // Resolve summary: session summary → web summary fallback
    let existingSummary = '';
    if (summaryResult) {
      existingSummary = summaryResult.summary;
    }
    if (!existingSummary && customerContext?.webSummary) {
      existingSummary = customerContext.webSummary.summary;
    }

    // messageCount = number of USER messages in this conversation
    // conversationHistory includes the message we just logged above, so count user messages directly
    const userMessageCount = conversationHistory.filter(m => m.role === 'user').length;
    console.log(`[meta/webhook] lead=${leadId} messageCount=${userMessageCount} historyLen=${conversationHistory.length}`);

    // 7a. QUICK-REPLY FAST PATH — short customer messages matching a known
    // keyword (CPL / PPL / helicopter / cost / demo / etc.) get a pre-defined
    // interactive button reply instantly, no Claude call. Skips on button
    // taps themselves (triggerKind=button/interactive_*) because those ARE
    // a button reply — generating ANOTHER button menu would loop.
    const isCustomerButtonTap = triggerKind === 'button'
      || triggerKind === 'interactive_button'
      || triggerKind === 'interactive_list';

    // 7-pre. FORM / AD LEAD FIRST RESPONSE — DETERMINISTIC, never the LLM.
    // These leads came from a pilot-training ad, so we must NOT describe the
    // academy or list programs (helicopter / cabin crew / type rating). The LLM
    // kept doing exactly that despite prompt rules, so we hard-intercept the
    // first reply: greet by name and PROBE with tappable buttons. Fires only on
    // the first inbound (the form prefill), which is detected reliably.
    if (!isCustomerButtonTap && userMessageCount <= 1 && isMetaFormClickThrough(messageText)) {
      const ff = parseFormPrefill(messageText);
      const cleanFormName = [ff.full_name, ff.name, ff.first_name].find(n => n && isLikelyRealPersonName(n)) || '';
      const firstName = (cleanFormName || customerName || 'there').split(' ')[0];
      const isParent = Object.keys(ff).some((k) => k.includes('child'));
      const body = isParent
        ? `Hi ${firstName}! Great that you're exploring pilot training for your child. To point you the right way, what would you like to understand first?`
        : `Hi ${firstName}! Great that you're looking into pilot training. To point you the right way, what would you like to sort out first?`;
      console.log(`[meta/webhook] FORM-LEAD deterministic first-response lead=${leadId} parent=${isParent}`);
      await sendAndLogReply(supabase, leadId, customerPhone, body, {
        sessionId,
        buttons: ['How to start', 'Timeline', 'Cost'],
        quickReplyTrigger: 'form_lead_welcome',
      });
      return;
    }

    if (!isCustomerButtonTap) {
      const quickReply = findQuickReplyFor(messageText);
      if (quickReply) {
        console.log(`[meta/webhook] quick-reply trigger=${quickReply.triggerKey} lead=${leadId}`);
        await sendAndLogReply(
          supabase,
          leadId,
          customerPhone,
          quickReply.body,
          {
            sessionId,
            buttons: quickReply.buttons,
            quickReplyTrigger: quickReply.triggerKey,
          },
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

    // FINAL DEDUP CHECK — race protection.
    // If the customer fires multiple webhook events in quick succession (e.g.
    // double-tap on a Quick Reply button), the parallel-Promise dedup above
    // can let both invocations through because neither has finished logging
    // when the other queried. By the time we get HERE we've finished writing
    // our customer row, so re-query for any agent message logged in the last
    // 5 seconds. If a sibling invocation already replied, skip ours.
    {
      const fiveSecAgo = new Date(Date.now() - 5_000).toISOString();
      const { data: siblingAgent } = await supabase
        .from('conversations')
        .select('id, created_at')
        .eq('lead_id', leadId)
        .eq('channel', 'whatsapp')
        .eq('sender', 'agent')
        .gte('created_at', fiveSecAgo)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (siblingAgent?.id) {
        console.log(`[meta/webhook] PRE-AI DEDUP: sibling agent reply ${siblingAgent.id} written in last 5s for lead ${leadId}, skipping`);
        return;
      }
    }

    const aiStartTime = Date.now();
    let result = await processMessage(agentInput, supabase);

    // Empty responses are usually a transient LLM hiccup (especially on long,
    // multi-part questions). Retry ONCE before giving up — a single retry recovers
    // the large majority of these, so the lead gets a real answer instead of the
    // dead-end "someone will get in touch" that nothing follows up on.
    if (!result.response) {
      console.warn('[meta/webhook] Empty AI response — retrying once before fallback');
      try {
        result = await processMessage(agentInput, supabase);
      } catch (retryErr: any) {
        console.error('[meta/webhook] Retry threw:', retryErr?.message || retryErr);
      }
    }
    const responseTimeMs = Date.now() - aiStartTime;

    if (!result.response) {
      console.error('[meta/webhook] Empty AI response after retry — sending fallback');
      await sendAndLogReply(
        supabase,
        leadId,
        customerPhone,
        "Hey! Give me a moment, I'll have someone from the team get in touch with you shortly.",
        {
          isFallback: true,
          fallbackReason: 'empty_ai_response',
          sessionId,
          responseTimeMs,
        },
      );
      return;
    }

    // 8 + 9. Send reply via Meta Graph API and log to conversations (atomic helper).
    // Strip any [BTN: X] markers Claude may have appended (prompt teaches it to
    // emit these when 2-3 distinct options apply). If found, route as
    // interactive button message. If not, plain text.
    const { text: cleanedText, buttons: llmButtons } = extractButtonsFromLLMResponse(result.response);
    const responseTextToSend = cleanedText || result.response;
    if (llmButtons.length > 0) {
      console.log(`[meta/webhook] LLM emitted ${llmButtons.length} buttons: [${llmButtons.join(',')}] lead=${leadId}`);
    }
    await sendAndLogReply(
      supabase,
      leadId,
      customerPhone,
      responseTextToSend,
      {
        intent: result.intent,
        responseTimeMs,
        sessionId,
        buttons: llmButtons.length > 0 ? llmButtons : undefined,
        quickReplyTrigger: llmButtons.length > 0 ? 'llm_extracted' : undefined,
      },
    );

    // 10. Update lead context — merge extracted intent into brand namespace
    //
    //   user_type      = student / parent / professional
    //   course_interest = DGCA / Flight / Heli / Cabin / Drone (mapped from intent)
    //   timeline       = asap / 1-3mo / 6+mo / 1yr+
    //
    // The dashboard's TYPE / COURSE columns read from unified_context[brand],
    // so without this step they stay empty for every WhatsApp lead.
    const courseMap: Record<string, string> = {
      pilot: 'DGCA',         // generic "pilot training" → DGCA (most common path)
      dgca: 'DGCA',
      cpl: 'DGCA',
      flight: 'Flight',
      flying: 'Flight',
      helicopter: 'Heli',
      heli: 'Heli',
      drone: 'Drone',
      cabin: 'Cabin',
    };
    const intentUpdate: Record<string, string> = {};
    if (result.intent?.userType) intentUpdate.user_type = result.intent.userType;
    if (result.intent?.courseInterest) {
      const raw = String(result.intent.courseInterest).toLowerCase();
      intentUpdate.course_interest = courseMap[raw] || result.intent.courseInterest;
    }
    if (result.intent?.timeline) {
      intentUpdate.timeline = result.intent.timeline;
      intentUpdate.plan_to_fly = result.intent.timeline;
    }

    const { data: leadCtxRow } = await supabase
      .from('all_leads')
      .select('unified_context')
      .eq('id', leadId)
      .maybeSingle();
    const existingCtxV2 = leadCtxRow?.unified_context || {};
    const existingBrandCtxV2 = existingCtxV2[brand] || existingCtxV2.bcon || existingCtxV2.windchasers || {};

    // Stamp the PROXe agent as the last actor so the LeadsTable's LAST TOUCH
    // column can render '@proxe' beneath the channel, distinguishing AI
    // replies from human-operator messages.
    const lastActorStamp = {
      type: 'proxe' as const,
      at: new Date().toISOString(),
    };

    const leadUpdate: Record<string, any> = {
      last_touchpoint: 'whatsapp',
      last_interaction_at: new Date().toISOString(),
    };
    // Always set unified_context (last_actor needs to land even when there
    // are no intent updates). Merge over existing context to preserve
    // attribution, web/whatsapp profile blocks, etc.
    leadUpdate.unified_context = {
      ...existingCtxV2,
      last_actor: lastActorStamp,
      ...(Object.keys(intentUpdate).length > 0
        ? { [brand]: { ...existingBrandCtxV2, ...intentUpdate } }
        : {}),
    };

    await supabase
      .from('all_leads')
      .update(leadUpdate)
      .eq('id', leadId);

    // 11. Link lead_id + phone to whatsapp session record (keyed by phone)
    const normalizedSessionPhone = normalizePhone(customerPhone);
    if (normalizedSessionPhone) {
      await supabase
        .from('whatsapp_sessions')
        .update({
          lead_id: leadId,
          customer_phone: customerPhone,
          customer_name: customerName || undefined,
        })
        .eq('customer_phone_normalized', normalizedSessionPhone)
        .eq('brand', brand);
    }

    // 11b. Capture an email the customer typed in chat — independent of booking.
    // Email used to be persisted ONLY when book_consultation fired, so a customer
    // who shared their email but didn't complete a booking had it dropped (it never
    // showed on the lead). Detect any email in the message and persist it right away
    // to the session + all_leads.email via updateLeadProfile.
    const emailMatch = messageText.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
    if (emailMatch) {
      const capturedEmail = emailMatch[0].toLowerCase();
      try {
        await updateLeadProfile(sessionId, { email: capturedEmail }, 'whatsapp', supabase);
        console.log(`[meta/webhook] captured email from chat lead=${leadId} email=${capturedEmail}`);
      } catch (err) {
        console.error('[meta/webhook] email capture failed:', err);
      }
    }

    // 12. AI-based profile extraction from the full conversation
    //
    // Runs every 2nd customer message (so it learns more as the chat progresses
    // without burning Haiku on every single ping). Picks up casual phrasing the
    // keyword extractor misses ("I wanna fly planes", "my son is in 12th", etc.)
    // Fire-and-forget — never block the response.
    const customerMsgCount = userMessageCount; // we computed this earlier
    if (customerMsgCount >= 2 && customerMsgCount % 2 === 0) {
      (async () => {
        try {
          const profile = await extractProfileFromConversation(conversationHistory);
          if (!profile || Object.keys(profile).length === 0) return;

          const { data: ctxRow } = await supabase
            .from('all_leads')
            .select('unified_context, customer_name')
            .eq('id', leadId)
            .maybeSingle();
          const ctx = ctxRow?.unified_context || {};
          const existingBrandCtx = ctx[brand] || ctx.windchasers || ctx.bcon || {};
          const mergedBrandCtx = mergeProfile(existingBrandCtx, profile);

          // Decide whether to promote profile.full_name → customer_name.
          // Only do it when the stored name is clearly garbled (fails the
          // real-person check). We never overwrite an already-good name.
          const storedName = ctxRow?.customer_name as string | null | undefined;
          const promote =
            profile.full_name &&
            !isLikelyRealPersonName(storedName);

          const update: Record<string, any> = {
            unified_context: { ...ctx, [brand]: mergedBrandCtx },
          };
          if (promote) update.customer_name = profile.full_name;

          await supabase.from('all_leads').update(update).eq('id', leadId);

          if (promote) {
            console.log(
              `[meta/webhook/ai-intent] lead=${leadId} promoted customer_name "${storedName}" → "${profile.full_name}"`,
            );
          }
          console.log(`[meta/webhook/ai-intent] lead=${leadId} extracted=${JSON.stringify(profile)}`);
        } catch (err) {
          console.error('[meta/webhook/ai-intent] Extraction failed:', err);
        }
      })();
    }

    // 13. Fire-and-forget: trigger AI scoring
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    fetch(`${appUrl}/api/webhooks/message-created`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId }),
    }).catch((err) => console.error('[meta/webhook] Scoring trigger failed:', err));

    console.log(`[meta/webhook] Reply sent to ${customerPhone} (lead: ${leadId})`);
  } catch (error: any) {
    console.error('[meta/webhook] handleIncomingMessage error:', error?.message || error);
    const fallbackMsg = "Hey! Give me a moment, I'll have someone from the team get in touch with you shortly.";
    if (leadId) {
      // We know the lead — send + log fallback, flag for human follow-up.
      await sendAndLogReply(supabase, leadId, customerPhone, fallbackMsg, {
        isFallback: true,
        fallbackReason: 'engine_exception',
        sessionId,
      }).catch(() => {});
    } else {
      // No leadId yet — best-effort send only (can't log without leadId).
      await sendWhatsAppReply(customerPhone, fallbackMsg).catch(() => {});
    }
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
