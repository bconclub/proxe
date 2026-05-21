/**
 * POST /api/agent/web/chat - SSE streaming chat route
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
import { extractProfileFromConversation, mergeProfile } from '@/lib/agent-core/conversationIntelligence';
import {
  getServiceClient,
  getClient,
  ensureSession,
  updateLeadProfile,
  addUserInput,
  logMessage,
  upsertSummary,
  isLikelyRealPersonName,
} from '@/lib/services';
import { BRAND_ID } from '@/configs';

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

    // Capture this request's origin so post-process self-callbacks (scoring
    // webhook) hit the *current* server in dev as well as prod, instead of
    // the static NEXT_PUBLIC_APP_URL which always points at the deployed URL.
    const requestOrigin = new URL(request.url).origin;

    // Extract session & memory from metadata (matches web-agent format)
    const session = metadata.session || {};
    const memory = metadata.memory || {};
    const externalSessionId = session.externalId || `web_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const userProfile = session.user || {};

    // Skip all DB writes for deploy health-check sessions (deploy_ready_*)
    // These are synthetic pings that create noise in sessions + conversations tables.
    const isHealthCheck = externalSessionId.startsWith('deploy_ready');

    // Get Supabase client
    const supabase = getServiceClient() || getClient();
    if (!supabase) {
      return new Response(
        JSON.stringify({ error: 'Database connection unavailable' }),
        { status: 503, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      );
    }

    // Ensure session exists (skip for health checks)
    if (!isHealthCheck) {
      await ensureSession(externalSessionId, 'web', supabase);
    }

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

          // ── Post-streaming: business logic ─────────────────────────────
          // MUST be awaited. On Vercel serverless the lambda is terminated
          // as soon as the Response stream closes, so any unawaited
          // postProcess promise is silently killed mid-flight — that's why
          // web_sessions / conversations were never being persisted.
          // The client has already received the 'done' SSE event and
          // rendered the AI response, so this extra await only delays the
          // connection close (typically < 1s for the DB writes; the slow
          // summary generation is internally fire-and-forget).
          // Skip all DB writes for health-check sessions
          if (!isHealthCheck) {
            try {
              await postProcess(
                externalSessionId,
                message,
                fullResponse,
                userProfile,
                agentInput,
                supabase,
                responseTimeMs,
                requestOrigin,
                messageCount,
              );
            } catch (err) {
              console.error('[agent/web/chat] Post-processing error:', err);
            }
          }

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
  requestOrigin?: string,
  messageCount: number = 0,
): Promise<void> {
  try {
    // 1. Check for existing lead from session first
    let leadId: string | null = null;
    let isNewLead = false;
    
    const { data: sessionData } = await supabase
      .from('web_sessions')
      .select('lead_id')
      .eq('external_session_id', externalSessionId)
      .maybeSingle();
    
    if (sessionData?.lead_id) {
      leadId = sessionData.lead_id;
    }

    // 2. Only create/update lead if phone OR email is provided (name alone is not enough)
    if (!leadId && (userProfile.email || userProfile.phone)) {
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
      isNewLead = true;
      
      // 2b. Backfill previous anonymous conversations for this session with the new lead_id.
      // These rows were logged before the visitor provided phone/email; they carry
      // session_id in their JSONB metadata column. Use .filter() for explicit JSON
      // path matching (more reliable than .eq() with arrow operators in Supabase JS).
      // NOTE: Do NOT chain .select({ head: true }) after .update() — it converts
      // the request to a HEAD which prevents the update from executing.
      if (leadId) {
        const { error: backfillError } = await supabase
          .from('conversations')
          .update({ lead_id: leadId })
          .filter('metadata->>session_id', 'eq', externalSessionId)
          .is('lead_id', null);

        if (backfillError) {
          console.error('[agent/web/chat] Failed to backfill conversations:', backfillError);
        } else {
          console.log('[agent/web/chat] Backfilled conversations with new lead_id:', leadId);
        }
      }
    }

    // 3. Log user input to session
    await addUserInput(
      externalSessionId,
      userMessage,
      'web',
      undefined,
      {},
      supabase,
    );

    // 4. Log messages to conversations table (always log with session_id in metadata)
    // Log customer message
    await logMessage(
      leadId,  // leadId can be null, message will be stored with session_id in metadata
      'web',
      'customer',
      userMessage,
      'text',
      { 
        session_id: externalSessionId,
        ...(leadId ? {} : { anonymous: true }),
      },
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
          ...(leadId ? {} : { anonymous: true }),
        },
        supabase,
      );
    }

    // 4. Generate and save conversation summary (every 3rd message to save tokens)
    const shouldSummarize = messageCount % 3 === 0 || messageCount <= 1;
    if (assistantResponse && shouldSummarize) {
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

    // 5. AI profile extraction — picks up user_type, course_interest, timeline,
    //    education, city from the conversation (catches phrasing the keyword
    //    extractor misses). Runs every 2nd message, fire-and-forget.
    if (leadId && messageCount >= 2 && messageCount % 2 === 0) {
      (async () => {
        try {
          const history = [
            ...agentInput.conversationHistory,
            { role: 'user' as const, content: userMessage },
            { role: 'assistant' as const, content: assistantResponse },
          ];
          const profile = await extractProfileFromConversation(history);
          if (!profile || Object.keys(profile).length === 0) return;

          const brandId = BRAND_ID;
          const { data: ctxRow } = await supabase
            .from('all_leads')
            .select('unified_context, customer_name')
            .eq('id', leadId)
            .maybeSingle();
          const ctx = ctxRow?.unified_context || {};
          const existingBrandCtx = ctx[brandId] || ctx.windchasers || ctx.bcon || {};
          const mergedBrandCtx = mergeProfile(existingBrandCtx, profile);

          // Auto-promote profile.full_name → customer_name when the stored
          // name is garbled (fails the real-person check). Common cause: web
          // chat session that started anonymous and got a junk display name
          // from the form, but the customer later typed their real name in
          // chat.
          const storedName = ctxRow?.customer_name as string | null | undefined;
          const promote =
            profile.full_name && !isLikelyRealPersonName(storedName);

          const update: Record<string, any> = {
            unified_context: { ...ctx, [brandId]: mergedBrandCtx },
          };
          if (promote) update.customer_name = profile.full_name;

          await supabase.from('all_leads').update(update).eq('id', leadId);

          if (promote) {
            console.log(
              `[agent/web/chat/ai-intent] lead=${leadId} promoted customer_name "${storedName}" → "${profile.full_name}"`,
            );
          }
          console.log(`[agent/web/chat/ai-intent] lead=${leadId} extracted=${JSON.stringify(profile)}`);
        } catch (err) {
          console.error('[agent/web/chat/ai-intent] failed:', err);
        }
      })();
    }

    // 6. Trigger AI scoring for this lead (awaited — unawaited fetch gets killed
    // when the Vercel serverless function exits after the stream closes).
    if (leadId) {
      const appUrl = requestOrigin || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4002';
      try {
        const scoreRes = await fetch(`${appUrl}/api/webhooks/message-created`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lead_id: leadId }),
        });
        if (!scoreRes.ok) {
          console.error('[agent/web/chat] Scoring webhook returned', scoreRes.status);
        }
      } catch (scoringError) {
        console.error('[agent/web/chat] Scoring webhook failed:', scoringError);
      }
    }
  } catch (error) {
    console.error('[agent/web/chat] Post-processing failed:', error);
  }
}
