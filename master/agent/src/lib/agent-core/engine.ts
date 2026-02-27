/**
 * Unified PROXe Agent Engine — Channel-agnostic orchestrator
 * Wires together: knowledge search, prompt builder, Claude client, intent extraction, follow-ups, summarizer
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { AgentInput, AgentOutput, KnowledgeResult, StreamChunk } from './types';
import { searchKnowledgeBase } from './knowledgeSearch';
import { buildPrompt } from './promptBuilder';
import { streamResponse, generateResponse, generateResponseWithTools, isConfigured, getErrorMessage } from './claudeClient';
import type { ToolDefinition, ToolHandler } from './claudeClient';
import { extractIntent, isBookingIntent } from './intentExtractor';
import { generateFollowUps } from './followUpGenerator';
import { generateSummary } from './summarizer';
import {
  getAvailableSlots,
  createCalendarEvent,
  storeBooking,
  checkExistingBooking,
} from '@/lib/services/bookingManager';
import { getBrandConfig, getCurrentBrandId } from '@/configs';

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

  const brandId = getCurrentBrandId();
  const brandConfig = getBrandConfig(brandId);

  // 1. Extract intent from message
  const intent = extractIntent(input.message, input.usedButtons);

  // 2. Search knowledge base
  const relevantDocs = await searchKnowledgeBase(supabase, input.message, 3);
  const knowledgeContext = formatKnowledgeContext(relevantDocs);

  // 3. Check for existing booking
  const existingBookingMessage = await checkBooking(supabase, input);

  // 4. Build prompt (brand-aware)
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
    brand: brandId,
  });

  // 5. Generate response
  let rawResponse: string;

  if (input.channel === 'whatsapp' && !existingBookingMessage) {
    // WhatsApp gets tool-enabled response for booking capability
    const { tools, toolHandlers } = buildBookingTools(input, supabase);
    rawResponse = await generateResponseWithTools(systemPrompt, userPrompt, {
      tools,
      toolHandlers,
      maxToolRounds: 5,
    }, 1024);
  } else {
    // All other channels keep existing behavior
    rawResponse = await generateResponse(systemPrompt, userPrompt);
  }

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
      exploreButtons: brandConfig.exploreButtons || [],
      brand: brandId,
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
    const brandId = getCurrentBrandId();
    const brandConfig = getBrandConfig(brandId);

    // 1. Extract intent
    const intent = extractIntent(input.message, input.usedButtons);

    // 2. Search knowledge base
    const relevantDocs = await searchKnowledgeBase(supabase, input.message, 3);
    const knowledgeContext = formatKnowledgeContext(relevantDocs);

    // 3. Check for existing booking
    const existingBookingMessage = await checkBooking(supabase, input);

    // 4. Build prompt (brand-aware)
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
      brand: brandId,
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
      exploreButtons: brandConfig.exploreButtons || [],
      brand: brandId,
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

// ─── WhatsApp Booking Tools ──────────────────────────────────────────────────

function buildBookingTools(
  input: AgentInput,
  supabase: SupabaseClient
): { tools: ToolDefinition[]; toolHandlers: Record<string, ToolHandler> } {

  const tools: ToolDefinition[] = [
    {
      name: 'check_availability',
      description: 'Check available consultation time slots for a specific date. Returns available times. Use this when the user wants to book and you need to show them open slots.',
      input_schema: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'The date to check in YYYY-MM-DD format. Must be today or a future date.',
          },
        },
        required: ['date'],
      },
    },
    {
      name: 'book_consultation',
      description: 'Book a consultation call. Use ONLY after: (1) confirming date and time with the user, (2) having the user name, (3) verifying slot is available via check_availability. Email is optional.',
      input_schema: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Booking date in YYYY-MM-DD format',
          },
          time: {
            type: 'string',
            description: 'Booking time in "H:MM AM/PM" format (e.g., "3:00 PM")',
          },
          name: {
            type: 'string',
            description: 'Full name of the person booking',
          },
          email: {
            type: 'string',
            description: 'Email address (optional for WhatsApp users)',
          },
          phone: {
            type: 'string',
            description: 'Phone number of the person booking',
          },
          course_interest: {
            type: 'string',
            enum: ['pilot', 'helicopter', 'drone', 'cabin', 'general'],
            description: 'Which training program they are interested in',
          },
        },
        required: ['date', 'time', 'name', 'phone'],
      },
    },
  ];

  const toolHandlers: Record<string, ToolHandler> = {
    check_availability: async (toolInput: Record<string, any>) => {
      const { date } = toolInput;

      // Validate date is not in the past
      const requestedDate = new Date(date + 'T00:00:00+05:30');
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (requestedDate < today) {
        return JSON.stringify({
          error: 'The requested date is in the past. Please ask the user for a future date.',
        });
      }

      // No Sunday bookings
      if (requestedDate.getDay() === 0) {
        return JSON.stringify({
          available_slots: [],
          message: 'No slots available on Sundays. Available Monday through Saturday.',
        });
      }

      const slots = await getAvailableSlots(date);
      const availableSlots = slots.filter(s => s.available);

      if (availableSlots.length === 0) {
        return JSON.stringify({
          available_slots: [],
          message: `No slots available on ${date}. Suggest the user try a different date.`,
        });
      }

      return JSON.stringify({
        date,
        available_slots: availableSlots.map(s => ({
          time: s.time,
          time24: s.time24,
        })),
        total_available: availableSlots.length,
      });
    },

    book_consultation: async (toolInput: Record<string, any>) => {
      const { date, time, name, email, phone, course_interest } = toolInput;

      const bookingPhone = phone || input.userProfile.phone;
      const bookingName = name || input.userProfile.name || 'WhatsApp User';
      const bookingEmail = email || input.userProfile.email || '';

      if (!bookingPhone) {
        return JSON.stringify({
          success: false,
          error: 'Phone number is required. Ask the user for their phone number.',
        });
      }

      // Check for existing booking
      const existing = await checkExistingBooking(bookingPhone, bookingEmail || null, supabase);
      if (existing.exists) {
        return JSON.stringify({
          success: false,
          error: `User already has a booking on ${existing.bookingDate} at ${existing.bookingTime}. Inform them about it.`,
        });
      }

      // Create Google Calendar event
      let calendarResult: { eventId: string; eventLink: string; hasAttendees: boolean } | null = null;
      try {
        calendarResult = await createCalendarEvent({
          date,
          time,
          name: bookingName,
          email: bookingEmail || undefined,
          phone: bookingPhone,
          courseInterest: course_interest,
          sessionType: 'online',
          conversationSummary: input.summary || undefined,
        });
      } catch (calendarError: any) {
        console.error('[Engine] Calendar event creation failed:', calendarError);
      }

      // Store booking in session + all_leads
      try {
        await storeBooking(
          input.sessionId,
          {
            date,
            time,
            googleEventId: calendarResult?.eventId,
            status: 'Call Booked',
            name: bookingName,
            email: bookingEmail || undefined,
            phone: bookingPhone,
            courseInterest: course_interest,
            sessionType: 'online',
            conversationSummary: input.summary || undefined,
          },
          'whatsapp',
          supabase,
        );
      } catch (storeError: any) {
        console.error('[Engine] Booking storage failed:', storeError);
        return JSON.stringify({
          success: false,
          error: 'Failed to save booking. Ask the user to try again.',
        });
      }

      return JSON.stringify({
        success: true,
        date,
        time,
        name: bookingName,
        google_event_created: !!calendarResult,
        message: `Booking confirmed for ${bookingName} on ${date} at ${time}.`,
      });
    },
  };

  return { tools, toolHandlers };
}

export { isConfigured, getErrorMessage };
