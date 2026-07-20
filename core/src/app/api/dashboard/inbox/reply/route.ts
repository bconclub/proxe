/**
 * POST /api/dashboard/inbox/reply
 *
 * Sends a reply from the dashboard inbox to a customer.
 * Supports two modes:
 *   1. "generate" - AI generates a response using the agent engine, returns it for review
 *   2. "send"     - Sends a message (manual or AI-generated) to the customer via their channel
 *
 * For WhatsApp: Uses Meta Cloud API (must be within 24h of last customer message).
 * For Web: Logs the message to the conversations table (customer sees it on next poll/reconnect).
 *
 * Request body:
 *   { leadId, channel, action: 'generate' | 'send', message?, conversationHistory? }
 */

import { NextRequest, NextResponse } from 'next/server'
import { TEMPLATE_BODIES } from '@/configs/template-bodies'
import { TEMPLATE_BUTTONS } from '@/configs/journeys';
import { process as processMessage } from '@/lib/agent-core/engine';
import { AgentInput } from '@/lib/agent-core/types';
import {
  getServiceClient,
  getClient,
  fetchCustomerContext,
  fetchSummary,
  logMessage,
} from '@/lib/services';
import { createClient } from '@/lib/supabase/server';
import { getWhatsAppCreds } from '@/lib/services/whatsappCreds';
import { assignOwnerOnTouch } from '@/lib/services/leadOwnership';
import { canAccessLeadId } from '@/lib/services/leadAccess';

export const dynamic = 'force-dynamic';

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Send a text message via Meta WhatsApp Cloud API.
 * Returns Meta's wamid on success so the caller can persist it as
 * metadata.wa_message_id - the key delivered/read receipts match on. A human
 * reply with no wamid never gets a receipt.
 */
async function sendWhatsAppMessage(to: string, message: string): Promise<{ ok: boolean; messageId?: string }> {
  const creds = await getWhatsAppCreds();
  if (!creds) {
    console.error('[inbox/reply] No WhatsApp credentials (no dashboard connection, no META_WHATSAPP_* env)');
    return { ok: false };
  }
  const { phoneNumberId, accessToken } = creds;

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
      console.error('[inbox/reply] WhatsApp API error:', res.status, err);
      return { ok: false };
    }

    const respBody = await res.json().catch(() => null);
    return { ok: true, messageId: respBody?.messages?.[0]?.id };
  } catch (err) {
    console.error('[inbox/reply] Failed to send WhatsApp message:', err);
    return { ok: false };
  }
}

/**
 * Send an approved WhatsApp template via Meta Cloud API.
 * Templates bypass the 24-hour conversation window - this is the legitimate
 * way to re-engage a lead whose last message is older than 24h.
 */
async function sendWhatsAppTemplate(params: {
  to: string;
  templateName: string;
  languageCode: string;
  bodyParams?: string[];                              // positional
  bodyParamsNamed?: { name: string; value: string }[]; // named
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const creds = await getWhatsAppCreds();
  if (!creds) {
    return { ok: false, error: 'No WhatsApp credentials (no dashboard connection, no META_WHATSAPP_* env)' };
  }
  const { phoneNumberId, accessToken } = creds;

  // Meta requires EITHER positional or named param objects, never both.
  // Named templates (e.g. windchasers_demo_online with {{customer_name}}) MUST
  // use { type: 'text', parameter_name: '...', text: '...' }. Positional
  // templates use { type: 'text', text: '...' } in order.
  const components: any[] = [];
  if (params.bodyParamsNamed && params.bodyParamsNamed.length > 0) {
    components.push({
      type: 'body',
      parameters: params.bodyParamsNamed.map((p) => ({
        type: 'text',
        parameter_name: p.name,
        text: p.value,
      })),
    });
  } else if (params.bodyParams && params.bodyParams.length > 0) {
    components.push({
      type: 'body',
      parameters: params.bodyParams.map((p) => ({ type: 'text', text: p })),
    });
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: params.to,
    type: 'template',
    template: {
      name: params.templateName,
      language: { code: params.languageCode },
      ...(components.length > 0 ? { components } : {}),
    },
  };

  try {
    const res = await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!res.ok) {
      console.error('[inbox/reply] Template send failed:', res.status, body);
      const errMsg = body?.error?.message || body?.error || `Template send failed (${res.status})`;
      return { ok: false, error: typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg) };
    }
    return { ok: true, messageId: body?.messages?.[0]?.id };
  } catch (err) {
    console.error('[inbox/reply] Template send error:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Reassign lead ownership to the acting user. Sending a reply or template =
 * "I'm handling this lead now", so the sender becomes the owner - even if
 * someone else owned it before (owner follows whoever is actively working it).
 * Resolves the logged-in user from the cookie session; no-ops for system
 * paths. Non-fatal.
 */
async function reassignOwnerToActor(supabase: any, leadId: string): Promise<void> {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    await assignOwnerOnTouch(supabase, leadId, user);
  } catch (e: any) {
    console.warn('[inbox/reply] reassignOwnerToActor failed (non-fatal):', e?.message || e);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      leadId,
      channel,
      action,
      message,
      conversationHistory,
      // Template-send fields (only used when action === 'send_template')
      templateName,
      languageCode,
      bodyParams,           // positional, string[]
      bodyParamsNamed,      // named, [{ name, value }]
      overrideTo,           // when set, route the send here (test mode) instead of the lead's phone
      renderedText,
    } = body;

    if (!leadId || !channel || !action) {
      return NextResponse.json(
        { error: 'Missing required fields: leadId, channel, action' },
        { status: 400 },
      );
    }

    if (action !== 'generate' && action !== 'send' && action !== 'send_template') {
      return NextResponse.json(
        { error: 'action must be "generate", "send", or "send_template"' },
        { status: 400 },
      );
    }

    const supabase = getServiceClient() || getClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Database connection unavailable' },
        { status: 503 },
      );
    }

    // Fetch lead info
    const authClient = await createClient();
    const { data: lead, error: leadError } = await authClient
      .from('all_leads')
      .select('id, customer_name, email, phone')
      .eq('id', leadId)
      .single();

    if (leadError || !lead) {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 },
      );
    }

    // Lead-type access: restricted users can't reply to leads outside their courses.
    const { data: { user: actor } } = await authClient.auth.getUser();
    if (actor?.id && !(await canAccessLeadId(supabase, actor.id, leadId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // ── ACTION: GENERATE ──────────────────────────────────────────────────
    if (action === 'generate') {
      // Use the last customer message from conversationHistory, or a generic prompt
      const lastCustomerMessage = conversationHistory
        ?.filter((m: any) => m.sender === 'customer')
        ?.pop()?.content || 'Hello';

      // Build conversation history for the AI
      const formattedHistory = (conversationHistory || []).map((msg: any) => ({
        role: msg.sender === 'customer' ? 'user' as const : 'assistant' as const,
        content: msg.content,
      }));

      // Fetch cross-channel context for summary
      const customerContext = await fetchCustomerContext(
        lead.phone || '',
        lead.customer_name || '',
        supabase,
      );

      let existingSummary = '';
      if (customerContext?.webSummary) {
        existingSummary = customerContext.webSummary.summary;
      }

      const agentInput: AgentInput = {
        message: lastCustomerMessage,
        channel: channel as 'web' | 'whatsapp',
        sessionId: `inbox_${leadId}_${Date.now()}`,
        messageCount: formattedHistory.length,
        conversationHistory: formattedHistory,
        userProfile: {
          name: lead.customer_name || undefined,
          email: lead.email || undefined,
          phone: lead.phone || undefined,
        },
        summary: existingSummary,
        adminNotes: customerContext?.unifiedContext?.admin_notes || undefined,
      };

      const aiStartTime = Date.now();
      const result = await processMessage(agentInput, supabase);
      const responseTimeMs = Date.now() - aiStartTime;

      return NextResponse.json({
        success: true,
        generatedMessage: result.response || '',
        responseTimeMs,
        intent: result.intent,
      });
    }

    // ── ACTION: SEND ──────────────────────────────────────────────────────
    if (action === 'send') {
      if (!message || !message.trim()) {
        return NextResponse.json(
          { error: 'Message cannot be empty' },
          { status: 400 },
        );
      }
      let waMessageId: string | undefined;

      // Check 24-hour window for WhatsApp
      if (channel === 'whatsapp') {
        // Find last customer message timestamp
        const { data: lastCustomerMsg } = await (await createClient())
          .from('conversations')
          .select('created_at')
          .eq('lead_id', leadId)
          .eq('channel', 'whatsapp')
          .eq('sender', 'customer')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastCustomerMsg?.created_at) {
          const lastMsgTime = new Date(lastCustomerMsg.created_at).getTime();
          const now = Date.now();
          const hoursSinceLastMessage = (now - lastMsgTime) / (1000 * 60 * 60);

          if (hoursSinceLastMessage > 24) {
            return NextResponse.json({
              success: false,
              error: 'WhatsApp 24-hour window has expired. You can only reply within 24 hours of the customer\'s last message.',
              hoursSinceLastMessage: Math.round(hoursSinceLastMessage * 10) / 10,
            }, { status: 400 });
          }
        }

        // Send via Meta Cloud API
        if (!lead.phone) {
          return NextResponse.json(
            { error: 'Lead has no phone number' },
            { status: 400 },
          );
        }

        // Normalize phone: ensure it has country code prefix (no +)
        let phone = lead.phone.replace(/\D/g, '');
        if (phone.startsWith('0')) {
          phone = '91' + phone.substring(1); // Default to India country code
        }

        const sent = await sendWhatsAppMessage(phone, message.trim());
        if (!sent.ok) {
          return NextResponse.json(
            { error: 'Failed to send WhatsApp message. Check Meta API credentials.' },
            { status: 502 },
          );
        }
        waMessageId = sent.messageId;
      }

      // Log the message in the conversations table. wa_message_id lets delivered/
      // read receipts attach to this human reply (same key the bot's replies use).
      await logMessage(
        leadId,
        channel,
        'agent',
        message.trim(),
        'text',
        {
          source: 'dashboard_inbox',
          sent_by: 'founder',
          sent_at: new Date().toISOString(),
          wa_message_id: waMessageId,
          human: true,
        },
        supabase,
      );

      // A human replied → pause the bot briefly so it doesn't talk over the team.
      if (channel === 'whatsapp') {
        const { data: cur } = await supabase.from('all_leads').select('metadata').eq('id', leadId).maybeSingle();
        await supabase.from('all_leads').update({
          metadata: { ...(cur?.metadata || {}), human_takeover_at: new Date().toISOString(), human_takeover_by: 'dashboard' },
        }).eq('id', leadId);
      }

      // Replying = "I'm working this lead now" → become the owner.
      await reassignOwnerToActor(supabase, leadId);

      return NextResponse.json({
        success: true,
        message: 'Message sent successfully',
        channel,
      });
    }

    // ── ACTION: SEND_TEMPLATE ────────────────────────────────────────────
    // Templates are the only sanctioned way to re-open a conversation outside
    // the 24h window, so we DO NOT enforce the 24h check on this path. The
    // template content itself must be approved by Meta upstream.
    if (action === 'send_template') {
      if (channel !== 'whatsapp') {
        return NextResponse.json(
          { error: 'Template sending is only supported on WhatsApp' },
          { status: 400 },
        );
      }
      if (!templateName || typeof templateName !== 'string') {
        return NextResponse.json(
          { error: 'Missing required field: templateName' },
          { status: 400 },
        );
      }
      // Resolve recipient: overrideTo (test mode) takes priority over lead.phone.
      const rawRecipient = (typeof overrideTo === 'string' && overrideTo.trim())
        ? overrideTo.trim()
        : lead.phone;
      if (!rawRecipient) {
        return NextResponse.json(
          { error: 'No recipient phone (lead has no phone and no overrideTo provided)' },
          { status: 400 },
        );
      }

      // Normalize phone: digits only, prepend country code if missing.
      let phone = rawRecipient.replace(/\D/g, '');
      if (phone.startsWith('0')) {
        phone = '91' + phone.substring(1);
      }

      const isTest = !!(typeof overrideTo === 'string' && overrideTo.trim());

      const result = await sendWhatsAppTemplate({
        to: phone,
        templateName,
        // windchasers templates are approved as `en` (not `en_US`). Meta
        // returns a misleading 132001 "template does not exist in en_US"
        // otherwise - the auto-send for PAT/demo silently fails because of it.
        languageCode: languageCode || 'en',
        bodyParams: !Array.isArray(bodyParamsNamed) && Array.isArray(bodyParams)
          ? bodyParams.map(String)
          : undefined,
        bodyParamsNamed: Array.isArray(bodyParamsNamed)
          ? bodyParamsNamed
              .filter((p: any) => p && typeof p.name === 'string')
              .map((p: any) => ({ name: String(p.name), value: String(p.value ?? '') }))
          : undefined,
      });

      if (!result.ok) {
        return NextResponse.json(
          { success: false, error: result.error || 'Template send failed' },
          { status: 502 },
        );
      }

      // Persist the rendered text into the conversation log so the operator
      // sees the actual message they sent (not the template name) in the
      // thread. Falls back to "<template name>" if no rendered text was
      // supplied by the client.
      //
      // Test sends are ALSO logged here so the operator can confirm the
      // send happened. They're tagged with `test_mode: true` + `test_recipient`
      // so the dashboard renders a yellow "TEST" pill on the row, making it
      // obvious this didn't go to the lead.
      // No client-supplied preview? Render the real body ourselves from the
      // brand's template map + the params we just sent - the operator must see
      // the actual message in the thread, never "[Template: name]".
      let selfRendered: string | null = null
      if (TEMPLATE_BODIES[templateName]) {
        selfRendered = TEMPLATE_BODIES[templateName]
        const pairs: { name: string; value: string }[] = Array.isArray(bodyParamsNamed) && bodyParamsNamed.length
          ? bodyParamsNamed
          : []
        for (const p of pairs) {
          selfRendered = selfRendered.replace(new RegExp(`\\{\\{\\s*${p.name}\\s*\\}\\}`, 'g'), p.value || 'there')
        }
      }
      const bestText = (typeof renderedText === 'string' && renderedText.trim()) ? renderedText.trim() : selfRendered
      const logBody = bestText
        ? (isTest ? `[TEST → ${phone}] ${bestText}` : bestText)
        : `[Template: ${templateName}]`;

      await logMessage(
        leadId,
        'whatsapp',
        'agent',
        logBody,
        'text',
        {
          source: 'dashboard_inbox',
          sent_by: 'founder',
          sent_at: new Date().toISOString(),
          template_name: templateName,
          template_buttons: TEMPLATE_BUTTONS[templateName] || undefined,
          template_language: languageCode || 'en',
          template_params: Array.isArray(bodyParamsNamed)
            ? bodyParamsNamed
            : (Array.isArray(bodyParams) ? bodyParams : []),
          meta_message_id: result.messageId || null,
          // read receipts (sent → delivered → read ticks) match on this key -
          // without it template bubbles never tick past sent.
          wa_message_id: result.messageId || undefined,
          whatsapp_message_id: result.messageId || undefined,
          test_mode: isTest,
          test_recipient: isTest ? phone : undefined,
        },
        supabase,
      );

      if (!isTest) await reassignOwnerToActor(supabase, leadId);

      return NextResponse.json({
        success: true,
        message: isTest ? `Test sent to ${phone}` : 'Template sent',
        test_mode: isTest,
        recipient: phone,
        messageId: result.messageId,
        channel: 'whatsapp',
      });
    }
  } catch (error) {
    console.error('[inbox/reply] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
