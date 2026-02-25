/**
 * Unified PROXe Agent Engine — Channel-agnostic orchestrator
 * Wires together: knowledge search, prompt builder, Claude client, intent extraction, follow-ups, summarizer
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { AgentInput, AgentOutput, KnowledgeResult, StreamChunk } from './types';
import { searchKnowledgeBase } from './knowledgeSearch';
import { buildPrompt } from './promptBuilder';
import { streamResponse, generateResponse, isConfigured, getErrorMessage } from './claudeClient';
import { extractIntent, isBookingIntent } from './intentExtractor';
import { generateFollowUps } from './followUpGenerator';
import { generateSummary } from './summarizer';

/**
 * Process a message and return a complete response (for WhatsApp, voice, etc.)
 */
export async function process(
  input: AgentInput,
  supabase: SupabaseClient
): Promise<AgentOutput> {
  if (!isConfigured()) {
    throw new Error('No AI provider configured. Please set CLAUDE_API_KEY.');
  }

  // 1. Extract intent from message
  const intent = extractIntent(input.message, input.usedButtons);

  // 2. Search knowledge base
  const relevantDocs = await searchKnowledgeBase(supabase, input.message, 3);
  const knowledgeContext = formatKnowledgeContext(relevantDocs);

  // 3. Check for existing booking
  const existingBookingMessage = await checkBooking(supabase, input);

  // 4. Build prompt
  const finalMessage = existingBookingMessage
    ? `${existingBookingMessage}\n\nUser's message: ${input.message}`
    : input.message;

  const { systemPrompt, userPrompt } = buildPrompt({
    channel: input.channel,
    userName: input.userProfile.name,
    summary: input.summary,
    history: input.conversationHistory,
    knowledgeBase: knowledgeContext,
    message: finalMessage,
    bookingAlreadyScheduled: !!existingBookingMessage,
    messageCount: input.messageCount,
  });

  // 5. Generate response (non-streaming for non-web channels)
  const rawResponse = await generateResponse(systemPrompt, userPrompt);
  const cleanedResponse = cleanResponse(rawResponse, input.channel);

  // 6. Generate follow-ups (skip for channels that don't support buttons)
  let followUps: string[] = [];
  if (input.channel === 'web') {
    followUps = await generateFollowUps({
      channel: input.channel,
      userMessage: input.message,
      assistantMessage: cleanedResponse,
      messageCount: input.messageCount,
      usedButtons: input.usedButtons || [],
      hasExistingBooking: !!existingBookingMessage,
      exploreButtons: ['Pilot Training', 'Helicopter Training', 'Drone Training', 'Cabin Crew'],
    });
  }

  return {
    response: cleanedResponse,
    followUps,
    intent,
    leadId: null,
  };
}

/**
 * Process a message with streaming (for web chat SSE)
 * Returns an AsyncGenerator of StreamChunks
 */
export async function* processStream(
  input: AgentInput,
  supabase: SupabaseClient
): AsyncGenerator<StreamChunk> {
  if (!isConfigured()) {
    yield { type: 'error', error: 'No AI provider configured.' };
    return;
  }

  try {
    // 1. Extract intent
    const intent = extractIntent(input.message, input.usedButtons);

    // 2. Search knowledge base
    const relevantDocs = await searchKnowledgeBase(supabase, input.message, 3);
    const knowledgeContext = formatKnowledgeContext(relevantDocs);

    // 3. Check for existing booking
    const existingBookingMessage = await checkBooking(supabase, input);

    // 4. Build prompt
    const finalMessage = existingBookingMessage
      ? `${existingBookingMessage}\n\nUser's message: ${input.message}`
      : input.message;

    const { systemPrompt, userPrompt } = buildPrompt({
      channel: input.channel,
      userName: input.userProfile.name,
      summary: input.summary,
      history: input.conversationHistory,
      knowledgeBase: knowledgeContext,
      message: finalMessage,
      bookingAlreadyScheduled: !!existingBookingMessage,
      messageCount: input.messageCount,
    });

    // 5. Stream response
    let rawResponse = '';
    for await (const text of streamResponse(systemPrompt, userPrompt)) {
      rawResponse += text;
      yield { type: 'chunk', text };
    }

    const cleanedResponse = cleanResponse(rawResponse);

    // 6. Generate follow-ups
    const followUps = await generateFollowUps({
      channel: input.channel,
      userMessage: input.message,
      assistantMessage: cleanedResponse,
      messageCount: input.messageCount,
      usedButtons: input.usedButtons || [],
      hasExistingBooking: !!existingBookingMessage,
      exploreButtons: ['Pilot Training', 'Helicopter Training', 'Drone Training', 'Cabin Crew'],
    });

    yield { type: 'followUps', followUps };
    yield { type: 'done' };

  } catch (error: any) {
    yield { type: 'error', error: getErrorMessage(error) };
  }
}

// --- Helper functions ---

function formatKnowledgeContext(docs: KnowledgeResult[]): string {
  if (docs.length === 0) return 'No relevant snippets found.';
  return docs.map((doc, i) => `${i + 1}. ${doc.content}`).join('\n');
}

function cleanResponse(raw: string, channel?: string): string {
  let cleaned = raw
    .replace(/^(Hi there!|Hello!|Hey!|Hi!)\s*/gi, '')
    .replace(/^(Hi|Hello|Hey),?\s*/gi, '')
    .trim();

  // Strip HTML tags for non-web channels
  if (channel && channel !== 'web') {
    cleaned = cleaned
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  return cleaned;
}

async function checkBooking(supabase: SupabaseClient, input: AgentInput): Promise<string | null> {
  if (!isBookingIntent(input.message)) return null;
  if (!input.userProfile.email && !input.userProfile.phone) return null;

  try {
    // Check for existing booking in web_sessions or all_leads
    const phone = input.userProfile.phone;
    const email = input.userProfile.email;

    if (phone) {
      const normalizedPhone = phone.replace(/\D/g, '').slice(-10);
      const { data } = await supabase
        .from('all_leads')
        .select('unified_context')
        .eq('customer_phone_normalized', normalizedPhone)
        .maybeSingle();

      if (data?.unified_context?.web?.booking_date && data?.unified_context?.web?.booking_time) {
        const date = new Date(data.unified_context.web.booking_date);
        const formattedDate = date.toLocaleDateString('en-US', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
        return `You already have a booking scheduled for ${formattedDate} at ${data.unified_context.web.booking_time}.`;
      }
    }
  } catch (error) {
    console.error('[Engine] Error checking booking:', error);
  }

  return null;
}

export { isConfigured, getErrorMessage };
