/**
 * POST /api/agent/web/chat — SSE streaming chat route
 *
 * Phase 3 of the Unified Agent Architecture.
 * Replaces web-agent's 1500-line monolithic /api/chat route.
 * Wires agent-core (AI) + services (business logic) together.
 *
 * Request: { message, messageCount, usedButtons, metadata: { session, memory } }
 * Response: SSE stream → { type: chunk|followUps|done|error }
 */

import { NextRequest } from 'next/server';
import { processStream } from '@/lib/agent-core/engine';
import { generateSummary } from '@/lib/agent-core/summarizer';
import { AgentInput } from '@/lib/agent-core/types';
import {
  getServiceClient,
  getClient,
  ensureSession,
  updateLeadProfile,
  addUserInput,
  logMessage,
  upsertSummary,
} from '@/lib/services';

export const dynamic = 'force-dynamic';

// ─── CORS ───────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// ─── SSE Streaming Chat ─────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      message,
      messageCount = 0,
      usedButtons = [],
      metadata = {},
    } = body;

    if (!message) {
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      );
    }

    // Extract session & memory from metadata (matches web-agent format)
    const session = metadata.session || {};
    const memory = metadata.memory || {};
    const externalSessionId = session.externalId || `web_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const userProfile = session.user || {};

    // Get Supabase client
    const supabase = getServiceClient() || getClient();
    if (!supabase) {
      return new Response(
        JSON.stringify({ error: 'Database connection unavailable' }),
        { status: 503, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      );
    }

    // Ensure session exists
    await ensureSession(externalSessionId, 'web', supabase);

    // Build AgentInput
    const agentInput: AgentInput = {
      channel: 'web',
      message,
      messageCount,
      sessionId: externalSessionId,
      userProfile: {
        name: userProfile.name,
        email: userProfile.email,
        phone: userProfile.phone,
      },
      conversationHistory: memory.recentHistory || [],
      summary: memory.summary || '',
      usedButtons,
    };

    // Create SSE stream
    const encoder = new TextEncoder();
    const requestStartTime = Date.now();
    const stream = new ReadableStream({
      async start(controller) {
        let fullResponse = '';

        try {
          // Stream AI response
          for await (const chunk of processStream(agentInput, supabase)) {
            const sseData = `data: ${JSON.stringify(chunk)}\n\n`;
            controller.enqueue(encoder.encode(sseData));

            // Accumulate full response text
            if (chunk.type === 'chunk' && chunk.text) {
              fullResponse += chunk.text;
            }
          }

          const responseTimeMs = Date.now() - requestStartTime;

          // ── Post-streaming: business logic (fire-and-forget) ──────────

          // Run all post-processing in parallel, don't block the stream
          postProcess(
            externalSessionId,
            message,
            fullResponse,
            userProfile,
            agentInput,
            supabase,
            responseTimeMs,
          ).catch(err => console.error('[agent/web/chat] Post-processing error:', err));

        } catch (error: any) {
          console.error('[agent/web/chat] Streaming error:', error);
          const errorChunk = `data: ${JSON.stringify({ type: 'error', error: error.message || 'Streaming failed' })}\n\n`;
          controller.enqueue(encoder.encode(errorChunk));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        ...CORS_HEADERS,
      },
    });
  } catch (error: any) {
    console.error('[agent/web/chat] Route error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    );
  }
}

// ─── Post-Processing (non-blocking) ─────────────────────────────────────────

async function postProcess(
  externalSessionId: string,
  userMessage: string,
  assistantResponse: string,
  userProfile: { name?: string; email?: string; phone?: string },
  agentInput: AgentInput,
  supabase: any,
  responseTimeMs?: number,
): Promise<void> {
  try {
    // 1. Update session profile + create/link lead
    let leadId: string | null = null;
    if (userProfile.name || userProfile.email || userProfile.phone) {
      leadId = await updateLeadProfile(
        externalSessionId,
        {
          userName: userProfile.name,
          email: userProfile.email,
          phone: userProfile.phone,
        },
        'web',
        supabase,
      );
    }

    // 2. Log user input to session
    await addUserInput(
      externalSessionId,
      userMessage,
      'web',
      undefined,
      {},
      supabase,
    );

    // 3. Log messages to conversations table (if we have a lead)
    if (leadId) {
      // Log customer message
      await logMessage(
        leadId,
        'web',
        'customer',
        userMessage,
        'text',
        { session_id: externalSessionId },
        supabase,
      );

      // Log agent response (with response time for dashboard metrics)
      if (assistantResponse) {
        await logMessage(
          leadId,
          'web',
          'agent',
          assistantResponse,
          'text',
          {
            session_id: externalSessionId,
            ai_generated: true,
            ...(responseTimeMs ? { input_to_output_gap_ms: responseTimeMs } : {}),
          },
          supabase,
        );
      }
    }

    // 4. Generate and save conversation summary
    if (assistantResponse) {
      try {
        const updatedHistory = [
          ...agentInput.conversationHistory,
          { role: 'user' as const, content: userMessage },
          { role: 'assistant' as const, content: assistantResponse },
        ];

        const summary = await generateSummary(
          agentInput.summary || '',
          updatedHistory.slice(-6), // Last 3 exchanges
        );

        if (summary) {
          await upsertSummary(
            externalSessionId,
            summary,
            new Date().toISOString(),
            'web',
            supabase,
          );
        }
      } catch (summaryError) {
        console.error('[agent/web/chat] Summary generation failed:', summaryError);
      }
    }
  } catch (error) {
    console.error('[agent/web/chat] Post-processing failed:', error);
  }
}
