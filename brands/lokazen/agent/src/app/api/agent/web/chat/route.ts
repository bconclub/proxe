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
import { detectLokazenAudience } from '@/lib/agent-core/lokazenAudience';
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

const LOKAZEN_SCOUT_ONBOARDING_URL =
  process.env.NEXT_PUBLIC_LOKAZEN_SCOUT_ONBOARDING_URL || 'https://lokazen.in/scout';

function isLokazenScoutNotYetCloseout(params: {
  brand?: string;
  audience: 'brand' | 'owner' | 'scout' | null;
  message: string;
  usedButtons: string[];
  history: AgentInput['conversationHistory'];
}): boolean {
  if (params.brand !== 'lokazen' || params.audience !== 'scout') return false;
  const answer = params.message.toLowerCase().trim();
  const buttons = params.usedButtons.map((button) => button.toLowerCase().trim());
  const lastAssistant = [...params.history]
    .reverse()
    .find((item) => item.role === 'assistant')?.content?.toLowerCase() || '';

  return (answer.includes('not yet') || buttons.some((button) => button.includes('not yet'))) &&
    lastAssistant.includes('do you already know any vacant commercial properties');
}

function buildScoutNotYetCloseout(): string {
  return `No problem. Once you spot a property, just submit it through the Scout app with a photo and location. You'll get paid after verification.\n\nYou can onboard here: ${LOKAZEN_SCOUT_ONBOARDING_URL}\n\nYou can also reply here if you want more information.`;
}

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
      brand: bodyBrand,
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
    const pageContext = metadata.pageContext || session.pageContext || '';
    const externalSessionId = session.externalId || `web_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const requestUserProfile = session.user || {};

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

    const storedUserProfile = isHealthCheck
      ? {}
      : await fetchStoredWebProfile(externalSessionId, supabase);
    const userProfile = {
      name: requestUserProfile.name || storedUserProfile.name,
      email: requestUserProfile.email || storedUserProfile.email,
      phone: requestUserProfile.phone || storedUserProfile.phone,
    };

    // Server-authoritative history — mirror the WhatsApp pipeline. Web previously
    // trusted a browser-side ref capped at 6 turns (memory.recentHistory), which
    // gave the booking flow amnesia: it re-asked for name/email/date already
    // given and drifted on the agreed slot. Every web message is already logged
    // to `conversations` in postProcess, so rebuild the real window from the DB
    // each turn instead. Web visitors are usually anonymous (no lead_id), so we
    // key on metadata->>session_id (always stamped) rather than lead_id like
    // WhatsApp does. Falls back to the client-sent history only when the DB read
    // is empty (e.g. the very first turn, before anything is persisted).
    const dbHistory = isHealthCheck
      ? []
      : await fetchWebHistory(externalSessionId, supabase);
    const conversationHistory = dbHistory.length > 0
      ? dbHistory
      : (memory.recentHistory || []);

    // Scopes KB retrieval to the active Lokazen flow (brand/owner/scout) so,
    // e.g., a brand's pricing question never surfaces Scout payout content.
    const resolvedBrand = bodyBrand || BRAND_ID || undefined;
    const pageAudience = String(pageContext).toLowerCase().includes('scout') || metadata.lokazenAudience === 'scout'
      ? 'scout'
      : null;
    const lokazenAudience = resolvedBrand === 'lokazen'
      ? (pageAudience || detectLokazenAudience(message, conversationHistory, usedButtons))
      : null;

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
      conversationHistory,
      summary: memory.summary || '',
      usedButtons,
      brand: resolvedBrand,
      lokazenAudience,
    };

    const deterministicResponse = isLokazenScoutNotYetCloseout({
      brand: resolvedBrand,
      audience: lokazenAudience,
      message,
      usedButtons,
      history: conversationHistory,
    })
      ? buildScoutNotYetCloseout()
      : null;

    // Create SSE stream
    const encoder = new TextEncoder();
    const requestStartTime = Date.now();
    const stream = new ReadableStream({
      async start(controller) {
        let fullResponse = '';

        try {
          if (deterministicResponse) {
            fullResponse = deterministicResponse;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chunk', text: deterministicResponse })}\n\n`));
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
          } else {
            // Stream AI response
            for await (const chunk of processStream(agentInput, supabase)) {
              const sseData = `data: ${JSON.stringify(chunk)}\n\n`;
              controller.enqueue(encoder.encode(sseData));

              // Accumulate full response text
              if (chunk.type === 'chunk' && chunk.text) {
                fullResponse += chunk.text;
              }
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
                usedButtons,
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

// ─── Server-Authoritative History (parity with WhatsApp) ────────────────────

/**
 * Rebuild the conversation window from the `conversations` table, keyed on the
 * web session id stored in metadata. This is the web counterpart to the
 * WhatsApp webhook's fetchRecentHistory — except web is keyed on
 * metadata->>session_id (anonymous visitors have no lead_id) and ordered
 * DESCENDING + reversed so we get the genuinely most-recent turns (WhatsApp's
 * ascending+limit grabs the oldest N, a latent bug for long chats).
 *
 * Rows are logged in postProcess AFTER the stream closes, so at request time
 * this returns all PRIOR turns; the current user message is passed separately
 * as AgentInput.message.
 */
async function fetchWebHistory(
  sessionId: string,
  supabase: any,
  limit: number = 24,
): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  try {
    const { data, error } = await supabase
      .from('conversations')
      .select('sender, content')
      .eq('channel', 'web')
      .filter('metadata->>session_id', 'eq', sessionId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    return data
      .reverse()
      .map((row: any) => ({
        role: row.sender === 'customer' ? ('user' as const) : ('assistant' as const),
        content: row.content,
      }))
      .filter((m: { content: string }) => !!m.content);
  } catch (err) {
    console.error('[agent/web/chat] fetchWebHistory failed:', err);
    return [];
  }
}

// ─── Post-Processing (non-blocking) ─────────────────────────────────────────

async function fetchStoredWebProfile(
  sessionId: string,
  supabase: any,
): Promise<{ name?: string | null; email?: string | null; phone?: string | null }> {
  try {
    const { data: sessionData } = await supabase
      .from('web_sessions')
      .select('customer_name, customer_email, customer_phone, lead_id')
      .eq('external_session_id', sessionId)
      .maybeSingle();

    let leadProfile: { name?: string | null; email?: string | null; phone?: string | null } = {};
    if (sessionData?.lead_id) {
      const { data: leadData } = await supabase
        .from('all_leads')
        .select('customer_name, email, phone')
        .eq('id', sessionData.lead_id)
        .maybeSingle();

      leadProfile = {
        name: leadData?.customer_name ?? null,
        email: leadData?.email ?? null,
        phone: leadData?.phone ?? null,
      };
    }

    return {
      name: sessionData?.customer_name || leadProfile.name || null,
      email: sessionData?.customer_email || leadProfile.email || null,
      phone: sessionData?.customer_phone || leadProfile.phone || null,
    };
  } catch (err) {
    console.error('[agent/web/chat] fetchStoredWebProfile failed:', err);
    return {};
  }
}

type LokazenContextPatch = Record<string, string | boolean | number>;

function compactAnswer(value: unknown): string {
  return String(value || '')
    .replace(/\[BTN\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function lowerText(value: unknown): string {
  return compactAnswer(value).toLowerCase();
}

function isActionButtonAnswer(answer: string): boolean {
  const normalized = lowerText(answer);
  return [
    'find commercial space',
    'list my property',
    'talk to loka',
    'talk to the team',
    'talk to an expert',
    'start this plan',
  ].includes(normalized);
}

function setIfUseful(patch: LokazenContextPatch, key: string, answer: string) {
  const cleaned = compactAnswer(answer);
  if (!cleaned || isActionButtonAnswer(cleaned)) return;
  patch[key] = cleaned;
}

function extractEmailAddress(value: string): string | null {
  const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : null;
}

/** Splits a free-text "name and phone" answer into its two parts. */
function parseNameAndPhone(answer: string): { name: string | null; phone: string | null } {
  const phoneMatch = answer.match(/(?:\+?91[\s-]?)?[6-9]\d{9}/);
  const phone = phoneMatch ? phoneMatch[0].replace(/\D/g, '').slice(-10) : null;
  const name = compactAnswer(answer.replace(phoneMatch ? phoneMatch[0] : '', '').replace(/[,-]/g, ' ')) || null;
  return { name, phone };
}

function latestAssistantPrompt(history: AgentInput['conversationHistory']): string {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i]?.role === 'assistant') return history[i].content || '';
  }
  return '';
}

function buildLokazenContextPatch(
  userMessage: string,
  agentInput: AgentInput,
  usedButtons: string[],
): LokazenContextPatch {
  const answer = compactAnswer(userMessage);
  const answerLower = answer.toLowerCase();
  const previousAssistant = lowerText(latestAssistantPrompt(agentInput.conversationHistory));
  const buttons = usedButtons.map(lowerText);
  const patch: LokazenContextPatch = {};

  const audience = detectLokazenAudience(userMessage, agentInput.conversationHistory, usedButtons);
  if (audience === 'owner') {
    patch.user_type = 'owner';
    patch.lead_type = 'property_owner';
  } else if (audience === 'brand') {
    patch.user_type = 'brand';
    patch.lead_type = 'brand';
  } else if (audience === 'scout') {
    patch.user_type = 'scout';
    patch.lead_type = 'scout';
  }

  if (previousAssistant.includes("what's your brand name") || previousAssistant.includes('what is your brand name')) {
    if (patch.user_type !== 'owner') {
      patch.user_type = 'brand';
      patch.lead_type = 'brand';
      setIfUseful(patch, 'brand_name', answer);
    }
  } else if (previousAssistant.includes('what kind of brand')) {
    patch.user_type = 'brand';
    patch.lead_type = 'brand';
    setIfUseful(patch, 'brand_category', answer);
  } else if (previousAssistant.includes('how many outlets')) {
    patch.user_type = 'brand';
    patch.lead_type = 'brand';
    setIfUseful(patch, 'current_outlets', answer);
  } else if (previousAssistant.includes('first outlet') || previousAssistant.includes('expansion')) {
    patch.user_type = 'brand';
    patch.lead_type = 'brand';
    setIfUseful(patch, 'expansion_intent', answer);
  } else if (previousAssistant.includes('which part of bangalore')) {
    patch.user_type = 'brand';
    patch.lead_type = 'brand';
    setIfUseful(patch, 'target_zones', answer);
  } else if (previousAssistant.includes('which areas')) {
    patch.user_type = 'brand';
    patch.lead_type = 'brand';
    setIfUseful(patch, 'target_zones', answer);
  } else if (previousAssistant.includes('what size range')) {
    patch.user_type = 'brand';
    patch.lead_type = 'brand';
    setIfUseful(patch, 'required_size_sqft', answer);
  } else if (previousAssistant.includes('rent budget') || previousAssistant.includes('budget range')) {
    patch.user_type = 'brand';
    patch.lead_type = 'brand';
    setIfUseful(patch, 'budget_monthly_rent', answer);
  } else if (previousAssistant.includes('preferred format') || previousAssistant.includes('high-street') || previousAssistant.includes('mall') || previousAssistant.includes('standalone') || previousAssistant.includes('food-court') || previousAssistant.includes('kiosk')) {
    patch.user_type = 'brand';
    patch.lead_type = 'brand';
    setIfUseful(patch, 'preferred_format', answer);
  } else if (previousAssistant.includes('when do you need the space')) {
    patch.user_type = 'brand';
    patch.lead_type = 'brand';
    setIfUseful(patch, 'timeline', answer);
  } else if (previousAssistant.includes('which area is the property')) {
    patch.user_type = 'owner';
    patch.lead_type = 'property_owner';
    setIfUseful(patch, 'property_zone', answer);
  } else if (previousAssistant.includes('what type of property')) {
    patch.user_type = 'owner';
    patch.lead_type = 'property_owner';
    setIfUseful(patch, 'property_type', answer);
  } else if (previousAssistant.includes('what size is the space')) {
    patch.user_type = 'owner';
    patch.lead_type = 'property_owner';
    setIfUseful(patch, 'property_size_sqft', answer);
  } else if (previousAssistant.includes('how big is the space')) {
    patch.user_type = 'owner';
    patch.lead_type = 'property_owner';
    setIfUseful(patch, 'property_size_sqft', answer);
  } else if (previousAssistant.includes('monthly rent') || previousAssistant.includes('asking rent')) {
    patch.user_type = 'owner';
    patch.lead_type = 'property_owner';
    setIfUseful(patch, 'asking_rent_monthly', answer);
  } else if (previousAssistant.includes('which floor')) {
    patch.user_type = 'owner';
    patch.lead_type = 'property_owner';
    setIfUseful(patch, 'floor', answer);
  } else if (previousAssistant.includes('when is it available')) {
    patch.user_type = 'owner';
    patch.lead_type = 'property_owner';
    setIfUseful(patch, 'availability_date', answer);
  } else if (previousAssistant.includes('frontage')) {
    patch.user_type = 'owner';
    patch.lead_type = 'property_owner';
    setIfUseful(patch, 'frontage_ft', answer);
  } else if (previousAssistant.includes('amenities') || previousAssistant.includes('parking')) {
    patch.user_type = 'owner';
    patch.lead_type = 'property_owner';
    setIfUseful(patch, 'amenities', answer);
  } else if (previousAssistant.includes('photos')) {
    patch.user_type = 'owner';
    patch.lead_type = 'property_owner';
    setIfUseful(patch, 'photos_received', answer);
  } else if (previousAssistant.includes('google maps link') || previousAssistant.includes('full address')) {
    patch.user_type = 'owner';
    patch.lead_type = 'property_owner';
    if (/https?:\/\/\S+/i.test(answer)) {
      setIfUseful(patch, 'google_maps_url', answer);
    } else {
      setIfUseful(patch, 'property_address', answer);
    }
  } else if (previousAssistant.includes('which area in bangalore can you cover')) {
    patch.user_type = 'scout';
    patch.lead_type = 'scout';
    setIfUseful(patch, 'scout_area_covered', answer);
  } else if (previousAssistant.includes('do you already know any vacant commercial properties')) {
    patch.user_type = 'scout';
    patch.lead_type = 'scout';
    if (buttons.some((b) => b.includes('yes')) || answerLower === 'yes') {
      patch.scout_knows_properties = 'yes';
    } else if (buttons.some((b) => b.includes('not yet')) || answerLower.includes('not yet')) {
      patch.scout_knows_properties = 'not_yet';
    } else {
      setIfUseful(patch, 'scout_knows_properties', answer);
    }
  } else if (previousAssistant.includes("what's your name and phone number")) {
    patch.user_type = 'scout';
    patch.lead_type = 'scout';
    const { name, phone } = parseNameAndPhone(answer);
    if (name) setIfUseful(patch, 'scout_name', name);
    if (phone) setIfUseful(patch, 'scout_phone', phone);
  } else if (previousAssistant.includes('would you like the team to help you get started')) {
    patch.user_type = 'scout';
    patch.lead_type = 'scout';
    if (buttons.some((b) => b.includes('talk to team'))) {
      patch.scout_next_action = 'talk_to_team';
    } else {
      setIfUseful(patch, 'scout_next_action', answer);
    }
  }

  if (buttons.some((b) => b.includes('starter'))) patch.selected_plan = 'Starter';
  if (buttons.some((b) => b.includes('professional'))) patch.selected_plan = 'Professional';
  if (buttons.some((b) => b.includes('premium'))) patch.selected_plan = 'Premium';

  if (Object.keys(patch).length > 0) {
    patch.last_profile_capture_at = new Date().toISOString();
  }

  return patch;
}

async function updateLokazenLeadContext(
  leadId: string,
  userMessage: string,
  agentInput: AgentInput,
  usedButtons: string[],
  supabase: any,
) {
  const patch = buildLokazenContextPatch(userMessage, agentInput, usedButtons);
  if (Object.keys(patch).length === 0) return;

  const { data: ctxRow, error } = await supabase
    .from('all_leads')
    .select('unified_context')
    .eq('id', leadId)
    .maybeSingle();

  if (error) {
    console.error('[agent/web/chat/lokazen-context] read failed:', error);
    return;
  }

  const ctx = ctxRow?.unified_context || {};
  const existingLokazen = ctx.lokazen || {};
  const nextLokazen = { ...existingLokazen, ...patch };

  const { error: updateError } = await supabase
    .from('all_leads')
    .update({ unified_context: { ...ctx, lokazen: nextLokazen } })
    .eq('id', leadId);

  if (updateError) {
    console.error('[agent/web/chat/lokazen-context] update failed:', updateError);
    return;
  }

  console.log(`[agent/web/chat/lokazen-context] lead=${leadId} captured=${JSON.stringify(patch)}`);
}

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
  usedButtons: string[] = [],
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

    // 2. Create lead on every web chat. Lokazen's conversations table has lead_id NOT NULL
    // so any insert with null lead_id fails → nothing appears in the inbox.
    // Creating an anonymous lead immediately on turn 1 fixes this; the lead gets
    // enriched with name/phone as the qualification flow progresses.
    if (!leadId) {
      leadId = await updateLeadProfile(
        externalSessionId,
        {
          userName: userProfile.name || undefined,
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

    const messageEmail = extractEmailAddress(userMessage);
    if (messageEmail) {
      await supabase
        .from('web_sessions')
        .update({ customer_email: messageEmail })
        .eq('external_session_id', externalSessionId);

      if (leadId) {
        const { data: leadEmailRow } = await supabase
          .from('all_leads')
          .select('email')
          .eq('id', leadId)
          .maybeSingle();

        if (!leadEmailRow?.email) {
          await supabase
            .from('all_leads')
            .update({ email: messageEmail })
            .eq('id', leadId);
        }
      }
    }

    if (leadId && BRAND_ID === 'lokazen') {
      await updateLokazenLeadContext(
        leadId,
        userMessage,
        agentInput,
        usedButtons,
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
    // Lokazen uses deterministic CRE capture above; this generic extractor is
    // aviation-shaped and can overwrite owner/brand with unrelated values.
    if (leadId && BRAND_ID !== 'lokazen' && messageCount >= 2 && messageCount % 2 === 0) {
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
    } else if (!leadId && externalSessionId && (messageCount % 2 === 0 || messageCount <= 2)) {
      // ANONYMOUS web session (no phone/email yet → no all_leads row). The profile
      // block above is gated on leadId and never runs here, so a name the visitor
      // typed in chat ("I'm Vivan") was never persisted — the inbox then shows
      // "Anonymous Web Visitor" even though we know their name. Capture just the
      // NAME onto web_sessions.customer_name so the inbox can show it. Fire-and-forget.
      (async () => {
        try {
          const history = [
            ...agentInput.conversationHistory,
            { role: 'user' as const, content: userMessage },
            { role: 'assistant' as const, content: assistantResponse },
          ];
          const profile = await extractProfileFromConversation(history);
          const fullName = profile?.full_name;
          if (fullName && isLikelyRealPersonName(fullName)) {
            await supabase
              .from('web_sessions')
              .update({ customer_name: fullName })
              .eq('external_session_id', externalSessionId)
              .is('customer_name', null); // don't overwrite a name we already captured
            console.log(`[agent/web/chat] anon session ${externalSessionId} name captured: "${fullName}"`);
          }
        } catch (err) {
          console.error('[agent/web/chat] anon name capture failed:', err);
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
