/**
 * POST /api/agent/whatsapp/respond — AI response for WhatsApp
 *
 * Phase 3 of the Unified Agent Architecture.
 * NEW route — WhatsApp currently has NO AI responses. This enables it.
 *
 * Uses agent-core engine.process() (non-streaming) to generate AI responses
 * with full knowledge base search and cross-channel context awareness.
 *
 * Request: { phone, name?, message, conversationHistory?, sessionId? }
 * Response: { success, response, followUps, intent }
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
  ensureOrUpdateLead,
} from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Verify API key
    const apiKey = request.headers.get('x-api-key');
    if (apiKey !== process.env.WHATSAPP_API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      phone,
      name,
      message,
      conversationHistory = [],
      sessionId,
    } = body;

    if (!phone || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: phone and message' },
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

    // Fetch cross-channel context for this customer
    const customerContext = await fetchCustomerContext(phone, name, supabase);

    // Fetch existing summary if we have a session
    let existingSummary = '';
    if (sessionId) {
      const summaryResult = await fetchSummary(sessionId, 'whatsapp', supabase);
      if (summaryResult) {
        existingSummary = summaryResult.summary;
      }
    }
    // Also try web summary from cross-channel context
    if (!existingSummary && customerContext?.webSummary) {
      existingSummary = customerContext.webSummary.summary;
    }

    // Build AgentInput for WhatsApp channel
    const agentInput: AgentInput = {
      channel: 'whatsapp',
      message,
      messageCount: conversationHistory.length + 1,
      sessionId: sessionId || `whatsapp_${Date.now()}`,
      userProfile: {
        name: name || undefined,
        phone,
      },
      conversationHistory: conversationHistory.map((msg: any) => ({
        role: msg.role === 'user' ? 'user' as const : 'assistant' as const,
        content: msg.content,
      })),
      summary: existingSummary,
      usedButtons: [],
    };

    // Generate AI response (non-streaming for WhatsApp)
    const aiStartTime = Date.now();
    const result = await processMessage(agentInput, supabase);
    const responseTimeMs = Date.now() - aiStartTime;

    // Log messages to conversations table if we have a lead
    const responseMetadata = {
      session_id: sessionId,
      ai_generated: true,
      input_to_output_gap_ms: responseTimeMs,
    };

    if (customerContext?.leadId) {
      // Log customer message
      await logMessage(
        customerContext.leadId,
        'whatsapp',
        'customer',
        message,
        'text',
        { session_id: sessionId },
        supabase,
      );

      // Log AI response (with response time for dashboard metrics)
      if (result.response) {
        await logMessage(
          customerContext.leadId,
          'whatsapp',
          'agent',
          result.response,
          'text',
          responseMetadata,
          supabase,
        );
      }
    } else if (phone) {
      // Try to create a lead for logging
      const leadId = await ensureOrUpdateLead(
        name || null,
        null,
        phone,
        'whatsapp',
        sessionId,
        supabase,
      );

      if (leadId) {
        await logMessage(leadId, 'whatsapp', 'customer', message, 'text', {}, supabase);
        if (result.response) {
          await logMessage(leadId, 'whatsapp', 'agent', result.response, 'text', responseMetadata, supabase);
        }
      }
    }

    return NextResponse.json({
      success: true,
      response: result.response,
      followUps: result.followUps,
      intent: result.intent,
      hasContext: !!customerContext,
      context: customerContext ? {
        hasWebHistory: !!customerContext.webSummary,
        hasWhatsAppHistory: !!customerContext.whatsappSummary,
        hasBooking: !!customerContext.bookingDate,
        firstTouchpoint: customerContext.firstTouchpoint,
      } : null,
    });
  } catch (error: any) {
    console.error('[agent/whatsapp/respond] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate response' },
      { status: 500 },
    );
  }
}
