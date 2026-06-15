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

import { NextRequest, NextResponse } from 'next/server';
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

export const dynamic = 'force-dynamic';

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/** Send a text message via Meta WhatsApp Cloud API */
async function sendWhatsAppMessage(to: string, message: string): Promise<boolean> {
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    console.error('[inbox/reply] Missing META_WHATSAPP_PHONE_NUMBER_ID or META_WHATSAPP_ACCESS_TOKEN');
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
      console.error('[inbox/reply] WhatsApp API error:', res.status, err);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[inbox/reply] Failed to send WhatsApp message:', err);
    return false;
  }
}

/**
 * Send an approved WhatsApp template via Meta Cloud API.
 * Templates bypass the 24-hour conversation window — this is the legitimate
 * way to re-engage a lead whose last message is older than 24h.
 */
async function sendWhatsAppTemplate(params: {
  to: string;
  templateName: string;
  languageCode: string;
  bodyParams?: string[];                              // positional
  bodyParamsNamed?: { name: string; value: string }[]; // named
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    return { ok: false, error: 'Missing META_WHATSAPP_PHONE_NUMBER_ID or META_WHATSAPP_ACCESS_TOKEN' };
  }

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
 * Auto-assign lead ownership to the acting user if the lead has no owner yet.
 * Sending a reply = "I'm handling this lead", so the first founder to reply
 * claims it. Never overwrites an existing owner. Non-fatal.
 */
async function claimOwnershipIfUnowned(supabase: any, leadId: string): Promise<void> {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return;
    const { data: row } = await supabase
      .from('all_leads').select('unified_context').eq('id', leadId).maybeSingle();
    const ctx = row?.unified_context || {};
    if (ctx.owner && ctx.owner.id) return; // already owned — don't steal
    const { data: du } = await supabase
      .from('dashboard_users').select('full_name, email').eq('id', user.id).maybeSingle();
    const owner = {
      id: user.id,
      name: du?.full_name || (user.email || 'User').split('@')[0],
      email: du?.email || user.email || null,
      assigned_at: new Date().toISOString(),
      assigned_by: user.email || user.id,
      auto: true,
    };
    await supabase.from('all_leads').update({ unified_context: { ...ctx, owner } }).eq('id', leadId);
  } catch (e: any) {
    console.warn('[inbox/reply] auto-claim ownership failed (non-fatal):', e?.message || e);
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
    const { data: lead, error: leadError } = await (await createClient())
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
        if (!sent) {
          return NextResponse.json(
            { error: 'Failed to send WhatsApp message. Check Meta API credentials.' },
            { status: 502 },
          );
        }
      }

      // Log the message in the conversations table
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
        },
        supabase,
      );

      // First founder to reply claims the lead (if unowned).
      await claimOwnershipIfUnowned(supabase, leadId);

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
        // otherwise — the auto-send for PAT/demo silently fails because of it.
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
      const logBody = (typeof renderedText === 'string' && renderedText.trim())
        ? (isTest ? `[TEST → ${phone}] ${renderedText.trim()}` : renderedText.trim())
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
          template_language: languageCode || 'en',
          template_params: Array.isArray(bodyParamsNamed)
            ? bodyParamsNamed
            : (Array.isArray(bodyParams) ? bodyParams : []),
          meta_message_id: result.messageId || null,
          test_mode: isTest,
          test_recipient: isTest ? phone : undefined,
        },
        supabase,
      );

      if (!isTest) await claimOwnershipIfUnowned(supabase, leadId);

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
