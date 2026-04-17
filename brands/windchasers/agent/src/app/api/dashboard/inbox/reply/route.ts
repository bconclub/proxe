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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { leadId, channel, action, message, conversationHistory } = body;

    if (!leadId || !channel || !action) {
      return NextResponse.json(
        { error: 'Missing required fields: leadId, channel, action' },
        { status: 400 },
      );
    }

    if (action !== 'generate' && action !== 'send') {
      return NextResponse.json(
        { error: 'action must be "generate" or "send"' },
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

      return NextResponse.json({
        success: true,
        message: 'Message sent successfully',
        channel,
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
