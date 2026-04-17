/**
 * Unified PROXe Agent Engine - Channel-agnostic orchestrator
 * Wires together: knowledge search, prompt builder, Claude client, intent extraction, follow-ups, summarizer
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { AgentInput, AgentOutput, KnowledgeResult, StreamChunk } from './types';
import { searchKnowledgeBase } from './knowledgeSearch';
import { buildPrompt } from './promptBuilder';
import { generateResponse, generateResponseWithTools, isConfigured, getErrorMessage } from './claudeClient';
import type { ToolDefinition, ToolHandler } from './claudeClient';
import { extractIntent, isBookingIntent, extractPainPoint, detectObjection } from './intentExtractor';
import { generateFollowUps } from './followUpGenerator';
import { generateSummary } from './summarizer';
import {
  getAvailableSlots,
  createCalendarEvent,
  storeBooking,
  checkExistingBooking,
} from '@/lib/services/bookingManager';
import { getBrandConfig, getCurrentBrandId } from '@/configs';
import { crawlBusiness } from '@/lib/services/businessCrawler';

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
  // If existing booking found, include it as context but still allow rescheduling
  const finalMessage = existingBookingMessage
    ? `[EXISTING BOOKING INFO: ${existingBookingMessage} - If the customer provides a new date/time, they want to reschedule. Cancel old and book new immediately. Do NOT ask "should I cancel?" repeatedly - if they give a time, that IS the confirmation.]\n\nUser's message: ${input.message}`
    : input.message;

  // Build admin notes context
  let crossChannelContext = '';
  if (input.adminNotes && input.adminNotes.length > 0) {
    const recentNotes = input.adminNotes.slice(-10);
    crossChannelContext += 'ADMIN NOTES (from team - use these to guide your approach):\n';
    crossChannelContext += recentNotes.map(n => `- ${n.text}`).join('\n');
  }

  // Fetch form data from unified_context if available
  let formData: Record<string, any> | null = null;
  if (input.userProfile.phone) {
    try {
      const normalizedPhone = input.userProfile.phone.replace(/\D/g, '').slice(-10);
      const { data: leadCtx } = await supabase
        .from('all_leads')
        .select('unified_context')
        .eq('customer_phone_normalized', normalizedPhone)
        .maybeSingle();
      formData = leadCtx?.unified_context?.form_data || null;
    } catch { /* non-critical */ }
  }

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
    crossChannelContext: crossChannelContext || undefined,
    formData,
  });

  // 5. Detect human handoff requests before AI generation
  const wantsHuman = detectHumanHandoffRequest(input.message);

  // 6. Generate response (with retry + graceful fallback)
  let rawResponse: string;

  try {
    if (input.channel === 'whatsapp') {
      // WhatsApp always gets tool-enabled response (even with existing booking - for rescheduling)
      const { tools, toolHandlers } = buildBookingTools(input, supabase);
      rawResponse = await generateResponseWithTools(systemPrompt, userPrompt, {
        tools,
        toolHandlers,
        maxToolRounds: 3,
      }, 512);
    } else {
      // All other channels keep existing behavior
      rawResponse = await generateResponse(systemPrompt, userPrompt);
    }
  } catch (firstError: any) {
    console.error('[Engine] AI generation failed (attempt 1):', firstError?.message || firstError);

    // Retry once with reduced complexity
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));

      if (input.channel === 'whatsapp') {
        const { tools, toolHandlers } = buildBookingTools(input, supabase);
        rawResponse = await generateResponseWithTools(systemPrompt, userPrompt, {
          tools,
          toolHandlers,
          maxToolRounds: 2, // Reduced rounds for retry
        }, 512);
      } else {
        rawResponse = await generateResponse(systemPrompt, userPrompt, 512);
      }
    } catch (retryError: any) {
      console.error('[Engine] AI generation failed (attempt 2):', retryError?.message || retryError);

      // Flag this lead for human follow-up
      await flagForHumanFollowup(supabase, input, 'AI generation failed after retry');

      // Return a warm, human-sounding fallback - NEVER expose technical errors
      rawResponse = "Hey! Let me connect you with the team directly. They'll reach out to you shortly.";
    }
  }

  // If user explicitly asked for a human, flag for follow-up regardless of AI response
  if (wantsHuman) {
    await flagForHumanFollowup(supabase, input, 'Customer requested human agent');
  }

  const cleanedResponse = cleanResponse(rawResponse, input.channel);

  // 7. Schedule flow tasks (non-blocking - fires after response is ready)
  scheduleFlowTasks(supabase, input, cleanedResponse).catch(err => {
    console.error('[Engine] Flow task scheduling failed:', err?.message);
  });

  // 8. Generate follow-ups (skip for channels that don't support buttons)
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

    // Build admin notes context
    let crossChannelContext = '';
    if (input.adminNotes && input.adminNotes.length > 0) {
      const recentNotes = input.adminNotes.slice(-10);
      crossChannelContext += 'ADMIN NOTES (from team - use these to guide your approach):\n';
      crossChannelContext += recentNotes.map(n => `- ${n.text}`).join('\n');
    }

    // Fetch form data from unified_context if available
    let formData: Record<string, any> | null = null;
    if (input.userProfile.phone) {
      try {
        const normalizedPhone = input.userProfile.phone.replace(/\D/g, '').slice(-10);
        const { data: leadCtx } = await supabase
          .from('all_leads')
          .select('unified_context')
          .eq('customer_phone_normalized', normalizedPhone)
          .maybeSingle();
        formData = leadCtx?.unified_context?.form_data || null;
      } catch { /* non-critical */ }
    }

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
      crossChannelContext: crossChannelContext || undefined,
      formData,
    });

    // 5. Generate response with tools (same as WhatsApp - enables booking flow)
    const { tools, toolHandlers } = buildBookingTools(input, supabase);
    let rawResponse: string;

    try {
      rawResponse = await generateResponseWithTools(systemPrompt, userPrompt, {
        tools,
        toolHandlers,
        maxToolRounds: 3,
      }, 768);
    } catch (firstError: any) {
      console.error('[Engine] Web AI generation failed (attempt 1):', firstError?.message || firstError);
      try {
        await new Promise(resolve => setTimeout(resolve, 2000));
        rawResponse = await generateResponseWithTools(systemPrompt, userPrompt, {
          tools,
          toolHandlers,
          maxToolRounds: 2,
        }, 512);
      } catch (retryError: any) {
        console.error('[Engine] Web AI generation failed (attempt 2):', retryError?.message || retryError);
        rawResponse = "Hey! Let me connect you with the team directly. They'll reach out to you shortly.";
      }
    }

    const cleanedResponse = cleanResponse(rawResponse);

    // Yield the cleaned response as a single chunk
    yield { type: 'chunk', text: cleanedResponse };

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

    // Schedule flow tasks (non-blocking - fires after response sent to client)
    scheduleFlowTasks(supabase, input, cleanedResponse).catch(err => {
      console.error('[Engine] Flow task scheduling failed:', err?.message);
    });

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
    .replace(/\[BUTTONS:[^\]]*\]/gi, '')
    .trim();

  // Hard guard: never emit em/en dashes in user-facing responses.
  cleaned = cleaned.replace(/[—–]/g, '-');

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

// ─── Human Handoff Detection ────────────────────────────────────────────────

const HUMAN_HANDOFF_PATTERNS = [
  /\btalk\s+to\s+(?:a\s+)?(?:human|person|real\s+person|someone|agent|representative|rep)\b/i,
  /\bspeak\s+(?:to|with)\s+(?:a\s+)?(?:human|person|real\s+person|someone|agent|representative|rep)\b/i,
  /\bconnect\s+(?:me\s+)?(?:to|with)\s+(?:a\s+)?(?:human|person|someone|agent|representative|rep)\b/i,
  /\breal\s+(?:human|person)\b/i,
  /\bnot\s+(?:a\s+)?(?:bot|ai|robot|automated)\b/i,
  /\bstop\s+(?:the\s+)?(?:bot|ai)\b/i,
  /\bhuman\s+(?:support|help|assistance|agent)\b/i,
  /\bactual\s+(?:person|human)\b/i,
  /\bneed\s+(?:a\s+)?(?:human|person|someone\s+real)\b/i,
  /\bwant\s+(?:a\s+)?(?:human|person|someone\s+real)\b/i,
];

function detectHumanHandoffRequest(message: string): boolean {
  return HUMAN_HANDOFF_PATTERNS.some(pattern => pattern.test(message));
}

/**
 * Flag a lead for human follow-up.
 * Sets needs_human_followup = true on all_leads and logs the reason.
 */
async function flagForHumanFollowup(
  supabase: SupabaseClient,
  input: AgentInput,
  reason: string
): Promise<void> {
  try {
    const phone = input.userProfile.phone;
    if (!phone) return;

    const normalizedPhone = phone.replace(/\D/g, '').slice(-10);

    // Fetch the lead
    const { data: lead } = await supabase
      .from('all_leads')
      .select('id, metadata')
      .eq('customer_phone_normalized', normalizedPhone)
      .maybeSingle();

    if (!lead) return;

    // Set flag on all_leads
    await supabase
      .from('all_leads')
      .update({
        needs_human_followup: true,
        metadata: {
          ...(lead.metadata || {}),
          human_followup_reason: reason,
          human_followup_at: new Date().toISOString(),
        },
      })
      .eq('id', lead.id);

    console.log(`[Engine] Flagged lead ${lead.id} for human follow-up: ${reason}`);
  } catch (err) {
    console.error('[Engine] Failed to flag for human follow-up:', err);
  }
}

// ─── WhatsApp Booking Tools ──────────────────────────────────────────────────

function buildBookingTools(
  input: AgentInput,
  supabase: SupabaseClient
): { tools: ToolDefinition[]; toolHandlers: Record<string, ToolHandler> } {

  // Track bookings completed in this tool session to prevent re-detection loops
  const bookingsCompletedThisSession = new Set<string>();

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
      description: 'Book a consultation call. Use ONLY after: (1) confirming date and time with the user, (2) having the user name, (3) verifying slot is available via check_availability. Email is optional. You MUST generate a specific call title based on the conversation context.',
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
            description: 'Email address (required for web users, optional for WhatsApp users)',
          },
          phone: {
            type: 'string',
            description: 'Phone number of the person booking',
          },
          title: {
            type: 'string',
            description: 'AI-generated call title based on discussion. Format: "[Topic/Solution] - [Brand Name]". Examples: "AI Lead Qualification for Meta Ads - Acme Corp", "Online Customer Acquisition - Fresh Foods". Never use generic titles.',
          },
          course_interest: {
            type: 'string',
            enum: ['pilot', 'helicopter', 'drone', 'cabin', 'general'],
            description: 'Which training program they are interested in',
          },
        },
        required: ['date', 'time', 'name', 'phone', 'title'],
      },
    },
    {
      name: 'update_lead_profile',
      description: 'Save lead profile details whenever the user shares personal or business information. Call IMMEDIATELY when the user mentions their name, email, city, company/brand, business type, or website URL. Can be called multiple times as new details emerge. Only include fields explicitly shared - never guess.',
      input_schema: {
        type: 'object',
        properties: {
          full_name: {
            type: 'string',
            description: 'User\'s full name if shared (e.g. "Rajesh Kumar")',
          },
          email: {
            type: 'string',
            description: 'User\'s email address if shared',
          },
          city: {
            type: 'string',
            description: 'City the user is based in (e.g. "Hyderabad")',
          },
          company: {
            type: 'string',
            description: 'User\'s company or brand name (e.g. "Door2Shine")',
          },
          business_type: {
            type: 'string',
            description: 'What kind of business they run (e.g. "doorstep car wash")',
          },
          website_url: {
            type: 'string',
            description: 'User\'s website URL if shared (e.g. "https://door2shine.com" or "door2shine.com")',
          },
          notes: {
            type: 'string',
            description: 'Any other notable detail (e.g. "has 3 employees", "launched 2 months ago")',
          },
        },
        required: [],
      },
    },
  ];

  const toolHandlers: Record<string, ToolHandler> = {
    check_availability: async (toolInput: Record<string, any>) => {
      const { date } = toolInput;

      // Validate date is not in the past (compare YYYY-MM-DD strings - timezone-safe)
      const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      if (date < todayIST) {
        return JSON.stringify({
          error: 'The requested date is in the past. Please ask the user for a future date.',
        });
      }

      // No Sunday bookings - use Date.UTC to avoid IST/UTC day-of-week mismatch
      const [year, month, day] = date.split('-').map(Number);
      const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
      if (dayOfWeek === 0) {
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
      const { date, time, name, email, phone, course_interest, title } = toolInput;

      const bookingPhone = phone || input.userProfile.phone || '';
      const bookingName = name || input.userProfile.name || 'Web Visitor';
      const bookingEmail = email || input.userProfile.email || '';
      const bookingTitle = title || `AI Strategy Call - ${bookingName}`;

      // Need at least phone or email to identify the booking
      if (!bookingPhone && !bookingEmail) {
        return JSON.stringify({
          success: false,
          error: 'Need either phone number or email to book. Ask the user for their email address.',
        });
      }

      // If we already completed a booking in this session, don't re-book
      const bookingKey = `${date}|${time}`;
      if (bookingsCompletedThisSession.has(bookingKey)) {
        return JSON.stringify({
          success: true,
          already_booked: true,
          message: `Booking already confirmed for ${bookingName} on ${date} at ${time}. Do NOT call book_consultation again. Confirm to the user and stop.`,
        });
      }

      // Check for existing booking (only if we haven't booked anything this session)
      if (bookingsCompletedThisSession.size === 0) {
        const existing = await checkExistingBooking(bookingPhone, bookingEmail || null, supabase);
        if (existing.exists) {
          return JSON.stringify({
            success: false,
            error: `User already has a booking on ${existing.bookingDate} at ${existing.bookingTime}. Inform them about it.`,
          });
        }
      }

      // Create Google Calendar event (now includes Meet link)
      let calendarResult: { eventId: string; eventLink: string; hasAttendees: boolean; meetLink: string | null } | null = null;
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
          title: bookingTitle,
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
            title: bookingTitle,
            meetLink: calendarResult?.meetLink || undefined,
          },
          input.channel || 'whatsapp',
          supabase,
        );
      } catch (storeError: any) {
        console.error('[Engine] Booking storage failed:', storeError);
        return JSON.stringify({
          success: false,
          error: 'Failed to save booking. Ask the user to try again.',
        });
      }

      // Mark this booking as completed to prevent re-detection loops
      bookingsCompletedThisSession.add(bookingKey);

      // Create booking reminder flow tasks (Flow B + C)
      try {
        const bookingDT = parseBookingDateTime(date, time);
        if (bookingDT) {
          const lookupPhone = (bookingPhone || '').replace(/\D/g, '').slice(-10);
          const { data: taskLead } = await supabase
            .from('all_leads')
            .select('id, customer_phone_normalized')
            .eq('customer_phone_normalized', lookupPhone)
            .maybeSingle();
          const taskLeadId = taskLead?.id || null;
          // Always use the phone from the lead record, never from session/input
          const taskPhone = taskLead?.customer_phone_normalized || lookupPhone;

          const reminders = [
            { type: 'booking_reminder_24h', offset: -24 * 60 * 60 * 1000, desc: 'Booking reminder: 24 hours before call' },
            { type: 'booking_reminder_30m', offset: -30 * 60 * 1000, desc: 'Booking reminder: 30 minutes before call' },
          ];

          for (const r of reminders) {
            const scheduledTime = new Date(bookingDT.getTime() + r.offset);
            if (scheduledTime.getTime() > Date.now()) {
              supabase.from('agent_tasks').insert({
                task_type: r.type,
                task_description: `${r.desc} for ${bookingName}`,
                lead_id: taskLeadId,
                lead_phone: taskPhone,
                lead_name: bookingName,
                scheduled_at: scheduledTime.toISOString(),
                status: 'pending',
                metadata: {
                  booking_date: date,
                  booking_time: time,
                  session_id: input.sessionId,
                  channel: input.channel || 'whatsapp',
                  meet_link: calendarResult?.meetLink || null,
                  title: bookingTitle,
                  created_by: 'engine',
                },
                created_at: new Date().toISOString(),
              }).then(({ error: taskErr }) => {
                if (taskErr) console.error(`[Engine] Failed to create ${r.type}:`, taskErr.message);
                else console.log(`[Engine] Created ${r.type} for ${bookingName} at ${scheduledTime.toISOString()}`);
              });
            }
          }

          // Cancel any pending/queued/awaiting_approval nurture tasks - lead already booked
          const nurtureTypesToCancel = [
            'push_to_book',
            'nudge_waiting',
            'follow_up_day1',
            'follow_up_day3',
            'follow_up_day5',
            're_engage',
          ];
          const cancelStatuses = ['pending', 'queued', 'awaiting_approval'];
          const cancelUpdate = { status: 'cancelled', completed_at: new Date().toISOString() };

          // Cancel by lead_id
          if (taskLeadId) {
            const { error: cancelErr, count: cancelledCount } = await supabase
              .from('agent_tasks')
              .update(cancelUpdate)
              .eq('lead_id', taskLeadId)
              .in('task_type', nurtureTypesToCancel)
              .in('status', cancelStatuses);

            if (cancelErr) {
              console.error('[Engine] Failed to cancel nurture tasks by lead_id:', cancelErr.message);
            } else if (cancelledCount) {
              console.log(`[Engine] Cancelled ${cancelledCount} nurture tasks for ${bookingName} by lead_id (lead booked)`);
            }
          }

          // Also cancel by lead_phone as fallback (tasks may have been created with phone but no lead_id)
          if (taskPhone) {
            const { error: cancelErr2, count: cancelledCount2 } = await supabase
              .from('agent_tasks')
              .update(cancelUpdate)
              .eq('lead_phone', taskPhone)
              .in('task_type', nurtureTypesToCancel)
              .in('status', cancelStatuses);

            if (cancelErr2) {
              console.error('[Engine] Failed to cancel nurture tasks by phone:', cancelErr2.message);
            } else if (cancelledCount2) {
              console.log(`[Engine] Cancelled ${cancelledCount2} nurture tasks for ${bookingName} by phone (lead booked)`);
            }
          }
        }
      } catch (flowErr: any) {
        console.error('[Engine] Booking flow task creation failed:', flowErr?.message);
      }

      // NOTE: No separate WhatsApp confirmation - Claude's response IS the only message

      return JSON.stringify({
        success: true,
        date,
        time,
        name: bookingName,
        title: bookingTitle,
        google_event_created: !!calendarResult,
        meet_link: calendarResult?.meetLink || null,
        message: `Booking confirmed for ${bookingName} on ${date} at ${time}. STOP - do NOT call any more tools. Send ONE confirmation message to the user and end your turn.`,
      });
    },

    update_lead_profile: async (toolInput: Record<string, any>) => {
      const { full_name, email, city, company, business_type, website_url, notes } = toolInput;

      if (!full_name && !email && !city && !company && !business_type && !website_url && !notes) {
        return JSON.stringify({ success: false, error: 'No profile data provided.' });
      }

      const phone = input.userProfile.phone;
      const channelKey = input.channel === 'web' ? 'web' : 'whatsapp';

      try {
        let lead: any = null;

        // Find lead by phone (WhatsApp) or session (web)
        if (phone) {
          const normalizedPhone = phone.replace(/\D/g, '').slice(-10);
          const { data } = await supabase
            .from('all_leads')
            .select('id, unified_context, email, customer_name')
            .eq('customer_phone_normalized', normalizedPhone)
            .maybeSingle();
          lead = data;
        }

        // For web: try finding lead by session
        if (!lead && input.sessionId) {
          const sessionTable = channelKey === 'web' ? 'web_sessions' : 'whatsapp_sessions';
          const { data: session } = await supabase
            .from(sessionTable)
            .select('lead_id')
            .eq('external_session_id', input.sessionId)
            .maybeSingle();

          if (session?.lead_id) {
            const { data } = await supabase
              .from('all_leads')
              .select('id, unified_context, email, customer_name')
              .eq('id', session.lead_id)
              .maybeSingle();
            lead = data;
          }
        }

        if (!lead) {
          // Still save to session even if no lead found
          console.log('[Engine] No lead found for profile update, saving to session only');
          return JSON.stringify({ success: true, updated: ['saved to session context'] });
        }

        // Build top-level updates
        const leadUpdates: Record<string, any> = {};
        if (email) leadUpdates.email = email.trim().toLowerCase();
        if (full_name) leadUpdates.customer_name = full_name.trim();

        // Build unified_context.[channel].profile
        const existingCtx = lead.unified_context || {};
        const existingChannel = existingCtx[channelKey] || {};
        const existingProfile = existingChannel.profile || {};

        const profile: Record<string, any> = { ...existingProfile };
        if (full_name) profile.full_name = full_name.trim();
        if (email) profile.email = email.trim().toLowerCase();
        if (city) profile.city = city.trim();
        if (company) profile.company = company.trim();
        if (business_type) profile.business_type = business_type.trim();
        if (notes) {
          profile.notes = existingProfile.notes
            ? `${existingProfile.notes}; ${notes.trim()}`
            : notes.trim();
        }

        // Save website_url at top level of unified_context (shared across channels)
        const updatedCtx = { ...existingCtx };
        if (website_url) {
          let url = website_url.trim();
          if (url && !url.startsWith('http')) url = `https://${url}`;
          updatedCtx.website_url = url;
        }

        leadUpdates.unified_context = {
          ...updatedCtx,
          [channelKey]: { ...existingChannel, profile },
        };

        await supabase
          .from('all_leads')
          .update(leadUpdates)
          .eq('id', lead.id);

        // Also update session table
        const sessionTable = channelKey === 'web' ? 'web_sessions' : 'whatsapp_sessions';
        const sessionUpdates: Record<string, any> = {};
        if (email) sessionUpdates.customer_email = email.trim().toLowerCase();
        if (full_name) sessionUpdates.customer_name = full_name.trim();

        const { data: session } = await supabase
          .from(sessionTable)
          .select('id, channel_data')
          .eq('external_session_id', input.sessionId)
          .maybeSingle();

        if (session) {
          const existingData = session.channel_data || {};
          sessionUpdates.channel_data = {
            ...existingData,
            ...(city ? { city: city.trim() } : {}),
            ...(company ? { company: company.trim() } : {}),
            ...(business_type ? { business_type: business_type.trim() } : {}),
          };
          await supabase
            .from(sessionTable)
            .update(sessionUpdates)
            .eq('id', session.id);
        }

        const saved: string[] = [];
        if (full_name) saved.push(`name: ${full_name}`);
        if (email) saved.push(`email: ${email}`);
        if (city) saved.push(`city: ${city}`);
        if (company) saved.push(`company: ${company}`);
        if (business_type) saved.push(`type: ${business_type}`);
        if (website_url) saved.push(`website: ${website_url}`);
        if (notes) saved.push(`notes: ${notes}`);

        console.log(`[Engine] Lead profile updated: ${saved.join(', ')}`);
        return JSON.stringify({ success: true, updated: saved });
      } catch (err: any) {
        console.error('[Engine] update_lead_profile failed:', err);
        return JSON.stringify({ success: false, error: 'Failed to save profile.' });
      }
    },
  };

  return { tools, toolHandlers };
}

// ─── Flow Task Scheduling ──────────────────────────────────────────────────

/**
 * Parse "3:00 PM" style time + "2026-03-20" date into a Date (IST)
 */
function parseBookingDateTime(date: string, time: string): Date | null {
  const match = time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;
  let hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && hours !== 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  return new Date(`${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00+05:30`);
}

/**
 * Create a flow task in agent_tasks with dedup.
 * Checks for ANY existing task with same task_type + lead_id in the last 7 days,
 * regardless of status (pending, completed, failed, queued, etc.).
 */
async function createFlowTask(
  supabase: SupabaseClient,
  params: {
    taskType: string;
    leadId: string;
    leadPhone: string;
    leadName: string;
    scheduledAt: string;
    taskDescription: string;
    metadata: Record<string, any>;
  }
): Promise<void> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Check for ANY existing task with same type + lead in last 7 days (regardless of status)
  const { data: existingTask } = await supabase
    .from('agent_tasks')
    .select('id')
    .eq('task_type', params.taskType)
    .eq('lead_id', params.leadId)
    .gte('created_at', sevenDaysAgo)
    .limit(1);

  if (existingTask && existingTask.length > 0) return;

  const { error } = await supabase.from('agent_tasks').insert({
    task_type: params.taskType,
    task_description: params.taskDescription,
    lead_id: params.leadId,
    lead_phone: params.leadPhone,
    lead_name: params.leadName,
    scheduled_at: params.scheduledAt,
    status: 'pending',
    metadata: params.metadata,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error(`[Engine] Failed to create ${params.taskType}:`, error.message);
  } else {
    console.log(`[Engine] Created ${params.taskType} for ${params.leadName}`);
  }
}

// ─── Lead Temperature Evaluation (keyword-based, zero token cost) ────────────

const HOT_PATTERNS = [
  /\bhow\s+much\b/i, /\bcost\b/i, /\bpricing\b/i, /\bbudget\b/i, /\brate\b/i, /\bprice\b/i,
  /\basap\b/i, /\bimmediately\b/i, /\bthis\s+week\b/i, /\burgent\b/i, /\bright\s+now\b/i,
  /\blet'?s\s+do\s+it\b/i, /\bsign\s+me\s+up\b/i, /\bready\s+to\s+start\b/i, /\bwhen\s+can\s+we\s+begin\b/i,
  /\bother\s+options\b/i, /\bcomparing\b/i, /\balternative\b/i,
  /\bmy\s+partner\b/i, /\bmy\s+boss\b/i, /\bwe\s+decided\b/i,
];

const WARM_PATTERNS = [
  /\bhow\s+does\s+it\s+work\b/i, /\bwhat\s+do\s+you\s+offer\b/i, /\btell\s+me\s+more\b/i,
  /\bteam\s+(?:of|size)\b/i, /\brevenue\b/i, /\bclients?\b/i, /\bemployees?\b/i,
];

const COOL_PATTERNS = [
  /^(?:ok|hmm|sure|maybe|ya|yea|k|okay)\.?$/i,
  /\bi'?ll\s+think\s+about\s+it\b/i, /\bnot\s+sure\b/i, /\bmaybe\s+later\b/i, /\blater\b/i,
];

const COLD_PATTERNS = [
  /\bnot\s+interested\b/i, /\bstop\b/i, /\bdon'?t\s+contact\b/i,
  /\bunsubscribe\b/i, /\bremove\s+me\b/i, /\bno\s+thanks\b/i, /\bleave\s+me\s+alone\b/i,
];

/**
 * Evaluate lead temperature from a customer message + context.
 * Returns { temperature, reason } based on keyword matching.
 */
function evaluateLeadTemperature(
  message: string,
  messageCount: number,
  lastResponseTimeSec: number | null,
): { temperature: 'hot' | 'warm' | 'cool' | 'cold'; reason: string } {
  const msg = message.trim();

  // Check cold first (opt-outs take priority)
  for (const p of COLD_PATTERNS) {
    if (p.test(msg)) return { temperature: 'cold', reason: `Opt-out signal: "${msg.substring(0, 40)}"` };
  }

  // Check hot signals
  for (const p of HOT_PATTERNS) {
    if (p.test(msg)) return { temperature: 'hot', reason: `Buying/urgency signal: "${msg.substring(0, 40)}"` };
  }

  // Check cool signals (short vague answers)
  for (const p of COOL_PATTERNS) {
    if (p.test(msg)) return { temperature: 'cool', reason: `Vague/short reply: "${msg.substring(0, 40)}"` };
  }

  // Slow reply (over 1 hour) → cool
  if (lastResponseTimeSec !== null && lastResponseTimeSec > 3600) {
    return { temperature: 'cool', reason: `Slow reply (${Math.round(lastResponseTimeSec / 60)} min)` };
  }

  // Check warm signals
  for (const p of WARM_PATTERNS) {
    if (p.test(msg)) return { temperature: 'warm', reason: `Feature/detail question: "${msg.substring(0, 40)}"` };
  }

  // Multiple messages in session → warm
  if (messageCount >= 3) {
    return { temperature: 'warm', reason: `Active engagement (${messageCount} messages)` };
  }

  // Fast reply (under 5 minutes) → warm
  if (lastResponseTimeSec !== null && lastResponseTimeSec < 300) {
    return { temperature: 'warm', reason: `Fast reply (${Math.round(lastResponseTimeSec / 60)} min)` };
  }

  return { temperature: 'warm', reason: 'Default - active conversation' };
}

/**
 * Update lead temperature and history in unified_context.
 */
async function updateLeadTemperature(
  supabase: SupabaseClient,
  leadId: string,
  message: string,
  messageCount: number,
  existingContext: Record<string, any>,
): Promise<void> {
  try {
    // Get last response time for this lead
    const lastResponseTimes = existingContext.response_patterns?.last_5_response_times || [];
    const lastResponseTimeSec = lastResponseTimes.length > 0 ? lastResponseTimes[lastResponseTimes.length - 1] : null;

    const { temperature, reason } = evaluateLeadTemperature(message, messageCount, lastResponseTimeSec);

    // Build temperature history (keep last 20 entries)
    const history = [...(existingContext.temperature_history || [])];
    history.push({ temperature, timestamp: new Date().toISOString(), reason });
    const trimmedHistory = history.slice(-20);

    // Detect objections
    const objection = detectObjection(message);
    let objections = existingContext.objections || [];
    if (objection) {
      objections = [...objections, { type: objection.type, message: message.substring(0, 100), timestamp: new Date().toISOString() }];
      objections = objections.slice(-10);
    }

    await supabase
      .from('all_leads')
      .update({
        unified_context: {
          ...existingContext,
          lead_temperature: temperature,
          temperature_history: trimmedHistory,
          objections,
        },
      })
      .eq('id', leadId);

    console.log(`[Engine] Temperature for ${leadId}: ${temperature} (${reason})${objection ? `, objection: ${objection.type}` : ''}`);
  } catch (err: any) {
    console.error('[Engine] Failed to update lead temperature:', err?.message);
  }
}

/**
 * Calculate and store response patterns for a lead.
 * Looks at all customer messages and the preceding agent messages to compute:
 * - avg_response_time_seconds (rolling average)
 * - active_hours (hours when they usually message)
 * - preferred_day_parts ("morning" / "afternoon" / "evening")
 * - last_5_response_times (array of last 5 response times in seconds)
 */
async function updateResponsePatterns(
  supabase: SupabaseClient,
  leadId: string,
  existingContext: Record<string, any>,
): Promise<void> {
  try {
    // Fetch recent conversation messages (both agent and customer) ordered by time
    const { data: messages } = await supabase
      .from('conversations')
      .select('sender, created_at')
      .eq('lead_id', leadId)
      .eq('channel', 'whatsapp')
      .in('sender', ['agent', 'customer'])
      .order('created_at', { ascending: true })
      .limit(100);

    if (!messages || messages.length < 2) return;

    // Calculate response times: time between last agent message and next customer message
    const responseTimes: number[] = [];
    const customerHours: number[] = [];

    for (let i = 1; i < messages.length; i++) {
      const prev = messages[i - 1];
      const curr = messages[i];

      // Track customer message hours
      if (curr.sender === 'customer') {
        const hour = new Date(curr.created_at).getHours();
        customerHours.push(hour);
      }

      // Response time = customer message after an agent message
      if (prev.sender === 'agent' && curr.sender === 'customer') {
        const agentTime = new Date(prev.created_at).getTime();
        const customerTime = new Date(curr.created_at).getTime();
        const diffSeconds = Math.floor((customerTime - agentTime) / 1000);
        if (diffSeconds > 0 && diffSeconds < 7 * 24 * 3600) {
          responseTimes.push(diffSeconds);
        }
      }
    }

    // Need at least 1 response time or 3 messages to build a pattern
    if (responseTimes.length === 0 && customerHours.length < 3) return;

    // Calculate active hours (deduplicated, sorted)
    const hourCounts: Record<number, number> = {};
    for (const h of customerHours) {
      hourCounts[h] = (hourCounts[h] || 0) + 1;
    }
    const activeHours = Object.entries(hourCounts)
      .filter(([_, count]) => count >= 1)
      .map(([hour]) => parseInt(hour))
      .sort((a, b) => a - b);

    // Determine preferred day part based on most common hours
    let morningCount = 0, afternoonCount = 0, eveningCount = 0;
    for (const h of customerHours) {
      if (h >= 6 && h < 12) morningCount++;
      else if (h >= 12 && h < 17) afternoonCount++;
      else if (h >= 17 && h < 22) eveningCount++;
    }
    let preferredDayParts = 'morning';
    if (afternoonCount >= morningCount && afternoonCount >= eveningCount) preferredDayParts = 'afternoon';
    if (eveningCount >= morningCount && eveningCount >= afternoonCount) preferredDayParts = 'evening';

    // Last 5 response times
    const last5 = responseTimes.slice(-5);

    // Average response time
    const avgResponseTime = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : null;

    const responsePatterns: Record<string, any> = {
      ...(existingContext.response_patterns || {}),
      avg_response_time_seconds: avgResponseTime,
      active_hours: activeHours,
      preferred_day_parts: preferredDayParts,
      last_5_response_times: last5,
      updated_at: new Date().toISOString(),
    };

    await supabase
      .from('all_leads')
      .update({
        unified_context: {
          ...existingContext,
          response_patterns: responsePatterns,
        },
      })
      .eq('id', leadId);

    console.log(`[Engine] Response patterns for ${leadId}: avg=${avgResponseTime}s, active_hours=[${activeHours}], preferred=${preferredDayParts}`);
  } catch (err: any) {
    console.error('[Engine] Failed to update response patterns:', err?.message);
  }
}

/**
 * Analyze conversation state after every AI response and schedule flow tasks.
 * Called non-blocking from process() and processStream().
 *
 * Flow A: nudge_waiting - AI asked a question, lead hasn't responded (2h timer)
 * Flow D: push_to_book - 5+ messages exchanged, no booking yet (4h timer)
 * Flows B/C (booking reminders) are created in the book_consultation tool handler.
 */
async function scheduleFlowTasks(
  supabase: SupabaseClient,
  input: AgentInput,
  aiResponse: string,
): Promise<void> {
  const phone = input.userProfile.phone;
  if (!phone) return;

  const normalizedPhone = phone.replace(/\D/g, '').slice(-10);
  if (!normalizedPhone || normalizedPhone.length < 10) return;

  const { data: lead } = await supabase
    .from('all_leads')
    .select('id, customer_name, customer_phone_normalized, unified_context')
    .eq('customer_phone_normalized', normalizedPhone)
    .maybeSingle();

  if (!lead) return;

  const leadId = lead.id;
  const leadName = lead.customer_name || input.userProfile.name || 'Lead';
  // Always use the phone from the lead record - never from session metadata or input
  const leadPhone = lead.customer_phone_normalized || normalizedPhone;

  // ── Response Pattern Tracking ──────────────────────────────────────────────
  await updateResponsePatterns(supabase, leadId, lead.unified_context || {});

  // ── Lead Temperature + Objection Detection ─────────────────────────────────
  // Re-fetch context since updateResponsePatterns may have changed it
  const { data: freshLead } = await supabase
    .from('all_leads')
    .select('unified_context')
    .eq('id', leadId)
    .maybeSingle();
  const freshCtx = freshLead?.unified_context || lead.unified_context || {};
  await updateLeadTemperature(supabase, leadId, input.message, input.messageCount, freshCtx);

  // Pain point extraction from customer message
  const painMatch = extractPainPoint(input.message);
  if (painMatch) {
    const existingPainPoint = lead.unified_context?.pain_point;
    const existingSpecificity = lead.unified_context?.pain_point_specificity || 0;
    // Only overwrite if new match is more specific (or no existing)
    if (!existingPainPoint || painMatch.specificity >= existingSpecificity) {
      const ctx = lead.unified_context || {};
      supabase
        .from('all_leads')
        .update({
          unified_context: {
            ...ctx,
            pain_point: painMatch.painPoint,
            pain_point_specificity: painMatch.specificity,
          },
        })
        .eq('id', leadId)
        .then(({ error: ppErr }) => {
          if (ppErr) console.error('[Engine] Failed to update pain_point:', ppErr.message);
          else console.log(`[Engine] Pain point for ${leadName}: "${painMatch.painPoint}" (specificity: ${painMatch.specificity})`);
        });
    }
  }

  // Flow A: If AI response ends with a question, schedule a nudge
  if (aiResponse.includes('?')) {
    // Extract the last question from the AI response (last sentence containing '?')
    const sentences = aiResponse.split(/(?<=[.!?])\s+/);
    const lastQuestion = sentences.filter(s => s.includes('?')).pop() || aiResponse;
    const lastQuestionTrimmed = lastQuestion.substring(0, 200);

    // Temperature-adjusted nudge timer: hot=1h, warm=2h, cool=3h
    const temperature = freshCtx.lead_temperature || 'warm';
    const tempMult = temperature === 'hot' ? 0.5 : temperature === 'cool' ? 1.5 : 1.0;
    const nudgeDelayMs = Math.round(2 * 60 * 60 * 1000 * tempMult);
    const nudgeTimingReason = temperature !== 'warm'
      ? `${temperature} lead: nudge in ${Math.round(nudgeDelayMs / (60 * 60 * 1000))}h (adjusted from 2h)`
      : 'Initial 2h nudge timer, will adjust based on read receipts';

    await createFlowTask(supabase, {
      taskType: 'nudge_waiting',
      leadId,
      leadPhone,
      leadName,
      scheduledAt: new Date(Date.now() + nudgeDelayMs).toISOString(),
      taskDescription: `Nudge: waiting for reply on ${input.channel} - "${lastQuestion.substring(0, 80)}..."`,
      metadata: {
        last_question: lastQuestionTrimmed,
        channel: input.channel,
        session_id: input.sessionId,
        created_by: 'engine',
        lead_temperature: temperature,
        timing_reason: nudgeTimingReason,
      },
    });
  }

  // Business crawl: trigger on 3rd message (first real engagement)
  if (input.messageCount === 3) {
    crawlBusiness(leadId, supabase).catch(err => {
      console.error('[Engine] Business crawl failed:', err?.message);
    });
  }

  // Flow D: 5+ messages but no booking - nudge toward booking
  // Cool leads: don't push to book, just nurture. Cold leads: skip entirely.
  const temperature = freshCtx.lead_temperature || 'warm';
  if (input.messageCount >= 5 && temperature !== 'cool' && temperature !== 'cold') {
    const sessionTable = input.channel === 'web' ? 'web_sessions' : 'whatsapp_sessions';
    const { data: session } = await supabase
      .from(sessionTable)
      .select('booking_status')
      .eq('external_session_id', input.sessionId)
      .maybeSingle();

    const hasBooking = session?.booking_status && session.booking_status !== 'none';
    if (!hasBooking) {
      // Temperature-adjusted push-to-book: hot=2h, warm=4h
      const ptbMult = temperature === 'hot' ? 0.5 : 1.0;
      const ptbDelayMs = Math.round(4 * 60 * 60 * 1000 * ptbMult);
      await createFlowTask(supabase, {
        taskType: 'push_to_book',
        leadId,
        leadPhone,
        leadName,
        scheduledAt: new Date(Date.now() + ptbDelayMs).toISOString(),
        taskDescription: `Lead engaged (${input.messageCount} msgs on ${input.channel}) but no booking yet`,
        metadata: {
          message_count: input.messageCount,
          channel: input.channel,
          session_id: input.sessionId,
          created_by: 'engine',
          lead_temperature: temperature,
          timing_reason: `${temperature} lead: push-to-book in ${Math.round(ptbDelayMs / (60 * 60 * 1000))}h`,
        },
      });
    }
  }
}

export { isConfigured, getErrorMessage };
