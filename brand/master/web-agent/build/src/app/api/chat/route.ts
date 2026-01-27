import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseClient, getSupabaseServiceClient } from '@/lib/supabase';
import { buildPrompt } from '@/lib/promptBuilder';
import { addUserInput, upsertSummary, checkExistingBooking, fetchSummary, logMessage, ensureAllLeads, updateSessionProfile, updateMasterProfile } from '@/lib/chatSessions';
import { MasterConfig } from '@/configs/brand.config';

export const runtime = 'nodejs'; // Use Node.js runtime for streaming support

const BRAND = 'master';

// Initialize Supabase client
const MasterSupabase = getSupabaseClient();

// Initialize Claude API
const claudeApiKey = process.env.CLAUDE_API_KEY;

console.log('[Chat API] Initializing Claude API:', {
  hasApiKey: Boolean(claudeApiKey),
  apiKeyPrefix: claudeApiKey ? claudeApiKey.substring(0, 10) + '...' : 'none',
  apiKeyLength: claudeApiKey?.length || 0,
});

const anthropic = claudeApiKey ? new Anthropic({ apiKey: claudeApiKey }) : null;

// Search knowledge base
async function searchKnowledgeBase(query: string, limit: number = 3) {
  try {
    const supabaseClient = MasterSupabase;
    if (!supabaseClient) {
      return [];
    }

    const searchTable = async (table: string, columns: string[], searchTerm: string, perColumnLimit: number = 2) => {
      const allResults = [];
      for (const column of columns) {
        try {
          const result = await Promise.race([
            supabaseClient!.from(table)
              .select('*')
              .eq('brand', BRAND)
              .ilike(column, `%${searchTerm}%`)
              .limit(perColumnLimit),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
          ]) as any;
          
          if (!result.error && result.data) {
            allResults.push(...result.data);
          }
        } catch (error) {
          // Continue with other columns
        }
      }
      return Array.from(new Map(allResults.map((item: any) => [item.id, item])).values());
    };

    const queryPromises = [
      searchTable('knowledge_base', ['content', 'title', 'description', 'category'], query, 3).catch(() => []),
      searchTable('system_prompts', ['content', 'title', 'description'], query, 2).catch(() => []),
      searchTable('agents', ['agent_name', 'what_it_does', 'pain_point_mapped_to'], query, 2).catch(() => []),
      searchTable('conversation_states', ['state_name', 'description', 'notes'], query, 2).catch(() => []),
      searchTable('cta_triggers', ['cta_text', 'trigger_condition', 'use_case'], query, 2).catch(() => []),
      searchTable('model_context', ['key', 'value', 'category'], query, 3).catch(() => []),
      searchTable('chatbot_responses', ['question', 'query', 'user_message', 'keywords'], query, 2).catch(() => [])
    ];

    const results = await Promise.allSettled(queryPromises);
    const allResults: any[] = [];
    const tableNames = ['knowledge_base', 'system_prompts', 'agents', 'conversation_states', 'cta_triggers', 'model_context', 'chatbot_responses'];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value && Array.isArray(result.value)) {
        result.value.forEach((item: any) => {
          let content = '';
          const metadata: any = { table: tableNames[index], brand: item.brand || BRAND };

          switch (tableNames[index]) {
            case 'knowledge_base':
              content = item.content || item.description || item.title || '';
              break;
            case 'system_prompts':
              content = `${item.title || item.prompt_type || 'System Prompt'}: ${item.content}`;
              break;
            case 'agents':
              content = `Agent: ${item.agent_name}\nWhat it does: ${item.what_it_does || ''}`;
              break;
            case 'conversation_states':
              content = `State: ${item.state_name} (${item.state_key})\n${item.description || ''}`;
              break;
            case 'cta_triggers':
              content = `CTA: ${item.cta_text}\nTrigger: ${item.trigger_condition}`;
              break;
            case 'model_context':
              content = `[${item.category}] ${item.key}: ${item.value}`;
              break;
            case 'chatbot_responses':
              content = item.response || item.answer || item.content || '';
              break;
          }

          if (content.trim()) {
            allResults.push({ id: item.id, content: content.trim(), metadata });
          }
        });
      }
    });

    const priorityOrder: Record<string, number> = { 'knowledge_base': 4, 'system_prompts': 3, 'agents': 2, 'conversation_states': 1, 'cta_triggers': 1, 'model_context': 0, 'chatbot_responses': 1 };
    const sortedResults = allResults.sort((a, b) => (priorityOrder[b.metadata.table] || 0) - (priorityOrder[a.metadata.table] || 0));
    
    return sortedResults.slice(0, limit * 3);
  } catch (error) {
    return [];
  }
}

// Generate follow-up suggestion
async function generateFollowUpSuggestion(userMessage: string, assistantMessage: string, messageCount: number = 0) {
  if (anthropic) {
    return await generateFollowUpWithClaude(userMessage, assistantMessage, messageCount);
  }
  return null;
}

// Generate follow-up with Claude
async function generateFollowUpWithClaude(userMessage: string, assistantMessage: string, messageCount: number = 0) {
  if (!anthropic) return null;

  try {
    const lowerMessage = userMessage.toLowerCase();
    const lowerResponse = assistantMessage.toLowerCase();

    // Master specific button generation
    if (BRAND === 'master') {
      const brandPrompt = `You create one short, direct follow-up call-to-action button label for {{BRAND_NAME}} aviation training chatbot.

{{BRAND_NAME}} is an honest, transparent aviation training academy offering:
- Commercial Pilot License (CPL) training
- Helicopter Pilot Training
- Cabin Crew Training
- Drone Pilot Training
- DGCA Ground Classes

AVAILABLE BUTTON TYPES (create contextual variations):
- Information: "Get Course Details", "Check Eligibility", "Learn More"
- Exploration: "Explore Training Options", "See Programs"
- Booking: "Book a Demo Session", "Book 1:1 Consultation", "Schedule Call"
- Next Steps: "Get Cost Breakdown", "Financing Options", "Course Timeline"

BUTTON GENERATION RULES:
- First user message (messageCount = 1): Generate 1 button that's most relevant to their question
- Subsequent messages: Generate 1 button for the next logical step
- 3-7 words. Title case. No emojis.
- Be contextual - match the conversation flow
- NEVER repeat what was just explained
- NEVER suggest something they already understood
- If user asked about costs → suggest "Get Cost Breakdown" or "Financing Options"
- If user asked about programs → suggest "Book 1:1 Consultation" or "Explore Training Options"
- If user is qualified → prioritize booking buttons

TONE:
- Direct, honest, professional
- Aviation career advisor voice
- No sales-y language

If no relevant follow-up is appropriate, respond with only: SKIP
Output ONLY the button label text. No quotes. No explanation.`;

      // Use environment variable for model, fallback to claude-haiku-4-5-20251001
      const model = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
      
      const followUpResponse = await anthropic.messages.create({
        model: model,
        max_tokens: 60,
        system: brandPrompt,
        messages: [{
          role: 'user',
          content: `User's question: ${userMessage}\n\nAssistant's reply: ${assistantMessage}\n\nMessage count: ${messageCount}\n\nGenerate ONE contextual follow-up button label that helps continue the conversation. Make sure it's NOT repetitive of what was just discussed.`,
        }],
      });

      const suggestion = followUpResponse?.content?.[0]?.type === 'text'
        ? followUpResponse.content[0].text.trim()
        : '';

      const normalized = suggestion.split('\n').map(part => part.trim()).filter(Boolean)[0] || '';

      if (!normalized || normalized.toUpperCase() === 'SKIP') {
        return null;
      }

      return normalized.replace(/["']/g, '').trim();
    }

    // Fallback for other brands (PROXe logic)
    const brandPrompt = `You create one short, direct follow-up call-to-action label for the PROXe chatbot.

PROXe is an AI Operating System for business. It automates 24/7 customer interactions (WhatsApp, website, calls, content, dashboard). Users are Indian SMB owners (₹1-10Cr revenue) drowning in repetitive work.

AVAILABLE ACTIONS (you can reference these or create contextual variations):
- Deploy PROXe
- Book PROXe Demo
- Industries Served
- Get PROXe Pricing
- Schedule a Call

TONE & STYLE:
- Direct. No corporate speak. Real talk.
- Built from trenches. "I've lived this problem" energy.
- Human × AI. Not hype. Practical.
- Action-focused. What's the next real step?

IMPORTANT RULES:
- 3-7 words. Title case. Optional emoji (use sparingly, only if it adds clarity).
- Prefer to align with the available actions above, but adapt wording to context
- NEVER repeat what was just explained
- NEVER suggest something they already understood
- NEVER use: "Learn more", "Explore", "Discover", "Innovative", "Revolutionary"
- NEVER suggest "sign up" or "join" - we book demos, not memberships

If no relevant follow-up is appropriate or context doesn't warrant action, respond with only: SKIP
Output ONLY the label text. No quotes. No explanation.`;

    // Use environment variable for model, fallback to claude-haiku-4-5-20251001
    const model = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
    
    const followUpResponse = await anthropic.messages.create({
      model: model,
      max_tokens: 60,
      system: brandPrompt,
      messages: [{
        role: 'user',
        content: `Here is the user's latest question:\n${userMessage}\n\nHere is the assistant's reply:\n${assistantMessage}\n\nProvide a single follow-up button label that would help continue the conversation. Make sure it's NOT repetitive of what was just discussed.`,
      }],
    });

    const suggestion = followUpResponse?.content?.[0]?.type === 'text'
      ? followUpResponse.content[0].text.trim()
      : '';

    const normalized = suggestion.split('\n').map(part => part.trim()).filter(Boolean)[0] || '';

    if (!normalized || normalized.toUpperCase() === 'SKIP') {
      return null;
    }

    return normalized.replace(/["']/g, '').trim();
  } catch (error) {
    return null;
  }
}

// Helper function to check if two buttons are similar (e.g., "Book a Call" vs "Schedule a Call")
function areSimilarBookingButtons(button1: string, button2: string): boolean {
  const lower1 = button1.toLowerCase().trim();
  const lower2 = button2.toLowerCase().trim();
  
  // Exact match
  if (lower1 === lower2) return true;
  
  // Check if both contain booking-related keywords
  const bookingKeywords = ['call', 'demo', 'book', 'schedule', 'meeting', 'appointment'];
  const hasBooking1 = bookingKeywords.some(keyword => lower1.includes(keyword));
  const hasBooking2 = bookingKeywords.some(keyword => lower2.includes(keyword));
  
  // If both are booking-related, they're similar
  if (hasBooking1 && hasBooking2) {
    // Check if they have the same core action (call or demo)
    const hasCall1 = lower1.includes('call');
    const hasCall2 = lower2.includes('call');
    const hasDemo1 = lower1.includes('demo');
    const hasDemo2 = lower2.includes('demo');
    
    // If both mention "call" or both mention "demo", they're similar
    if ((hasCall1 && hasCall2) || (hasDemo1 && hasDemo2)) {
      return true;
    }
  }
  
  return false;
}

// Helper function to check if a button is similar to any in a list
function isSimilarToAny(newButton: string, existingButtons: string[]): boolean {
  return existingButtons.some(existing => areSimilarBookingButtons(newButton, existing));
}

// Handle OPTIONS for CORS preflight
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function POST(request: NextRequest) {
  console.log('=== /api/chat POST REQUEST RECEIVED ===');
  try {
    const body = await request.json();
    console.log('[Chat API] Request body received:', {
      hasMessage: !!body.message,
      messageLength: body.message?.length || 0,
      messageCount: body.messageCount || 0,
      hasMetadata: !!body.metadata,
      hasSessionId: !!(body.metadata?.session?.externalId || body.metadata?.session?.externalSessionId)
    });
    let { message, messageCount = 0, usedButtons = [], metadata = {} } = body;
    const brand = BRAND;

    const sessionMetadata = metadata.session || {};
    const memoryMetadata = metadata.memory || {};
    const userProfile = sessionMetadata.user || {};
    const externalSessionId = sessionMetadata.externalId || sessionMetadata.externalSessionId || sessionMetadata.sessionId || null;
    const summary: string = typeof memoryMetadata.summary === 'string' ? memoryMetadata.summary : '';
    const recentHistory: { role: 'user' | 'assistant'; content: string }[] = Array.isArray(memoryMetadata.recentHistory)
      ? memoryMetadata.recentHistory
          .filter(
            (entry: any) =>
              entry &&
              (entry.role === 'user' || entry.role === 'assistant') &&
              typeof entry.content === 'string'
          )
          .map((entry: any) => ({
            role: entry.role,
            content: entry.content,
          }))
      : [];

    if (!message || message.trim() === '') {
      return Response.json({ error: 'Message is required' }, { status: 400 });
    }

    const inputReceivedAt = Date.now(); // Track when user message was received

    // Track every interaction: Save user input to web_sessions and update message count
    if (externalSessionId) {
      // Update message count and last_message_at
      addUserInput(externalSessionId, message, undefined, 'master' as 'master').catch(err => {
        console.error('[Chat API] Failed to save user input:', err);
      });

      // Extract user profile data from message and button clicks
      const lowerMessage = message.toLowerCase();
      const profileUpdates: any = {};
      
      // Track button clicks
      if (usedButtons && usedButtons.length > 0) {
        profileUpdates.button_clicks = usedButtons;
      }
      
      // Track questions asked
      const questions: string[] = [];
      if (lowerMessage.includes('cost') || lowerMessage.includes('price') || lowerMessage.includes('fee')) {
        questions.push('cost');
      }
      if (lowerMessage.includes('eligibility') || lowerMessage.includes('qualification') || lowerMessage.includes('requirements')) {
        questions.push('eligibility');
      }
      if (lowerMessage.includes('timeline') || lowerMessage.includes('duration') || lowerMessage.includes('how long')) {
        questions.push('timeline');
      }
      if (lowerMessage.includes('course') || lowerMessage.includes('program') || lowerMessage.includes('training')) {
        questions.push('course');
      }
      if (questions.length > 0) {
        profileUpdates.questions_asked = questions;
      }

      // Track user type, course interest, timeline from message
      if (lowerMessage.includes('student') || lowerMessage.includes('myself')) {
        profileUpdates.user_type = 'student';
      } else if (lowerMessage.includes('parent') || lowerMessage.includes('child') || lowerMessage.includes('son') || lowerMessage.includes('daughter')) {
        profileUpdates.user_type = 'parent';
      } else if (lowerMessage.includes('professional') || lowerMessage.includes('career change')) {
        profileUpdates.user_type = 'professional';
      }

      if (lowerMessage.includes('pilot') && !lowerMessage.includes('helicopter')) {
        profileUpdates.course_interest = 'pilot';
      } else if (lowerMessage.includes('helicopter')) {
        profileUpdates.course_interest = 'helicopter';
      } else if (lowerMessage.includes('drone')) {
        profileUpdates.course_interest = 'drone';
      } else if (lowerMessage.includes('cabin crew') || lowerMessage.includes('flight attendant')) {
        profileUpdates.course_interest = 'cabin';
      }

      if (lowerMessage.includes('asap') || lowerMessage.includes('immediately') || lowerMessage.includes('soon')) {
        profileUpdates.timeline = 'asap';
      } else if (lowerMessage.includes('1-3') || lowerMessage.includes('1 to 3') || lowerMessage.includes('few months')) {
        profileUpdates.timeline = '1-3mo';
      } else if (lowerMessage.includes('6+') || lowerMessage.includes('6 months') || lowerMessage.includes('half year')) {
        profileUpdates.timeline = '6+mo';
      } else if (lowerMessage.includes('1 year') || lowerMessage.includes('1yr')) {
        profileUpdates.timeline = '1yr+';
      }

      // Update Master profile if we have any data
      if (Object.keys(profileUpdates).length > 0) {
        updateMasterProfile(externalSessionId, profileUpdates, 'master').catch(err => {
          console.error('[Chat API] Failed to update Master profile:', err);
        });
      }
    }

    // Check if booking is already scheduled
    const isBookingAlreadyScheduled = message.includes('[Booking already scheduled]');
    if (isBookingAlreadyScheduled) {
      // Remove the prefix for processing
      message = message.replace('[Booking already scheduled]', '').trim();
    }

    // Check if we have any AI provider available
    if (!anthropic) {
      return Response.json(
        { 
          error: 'No AI provider configured. Please set CLAUDE_API_KEY in environment variables.' 
        },
        { status: 500 }
      );
    }

    const normalizedBrand = BRAND;

    // Check if this is a booking attempt and if user already has a booking
    const containsBookingKeywords = (text: string): boolean => {
      const lowerText = text.toLowerCase().trim();
      return lowerText.includes('call') || 
             lowerText.includes('demo') || 
             lowerText.includes('book') ||
             lowerText.includes('schedule') ||
             lowerText.includes('meeting') ||
             lowerText.includes('appointment');
    };

    const isBookingAttempt = containsBookingKeywords(message);
    let existingBookingMessage = null;

    if (isBookingAttempt && (userProfile.email || userProfile.phone)) {
      try {
        const existingBooking = await checkExistingBooking(
          userProfile.phone || null,
          userProfile.email || null,
          normalizedBrand as 'master'
        );

        if (existingBooking?.exists && existingBooking.bookingDate && existingBooking.bookingTime) {
          // Format date and time
          const date = new Date(existingBooking.bookingDate);
          const formattedDate = date.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
          const formattedTime = existingBooking.bookingTime;
          existingBookingMessage = `You already have a booking scheduled for ${formattedDate} at ${formattedTime}.`;
        }
      } catch (bookingCheckError) {
        // Log error but don't crash - allow booking to proceed
        console.error('[Chat API] Error checking existing booking:', bookingCheckError);
      }
    }

    // Search knowledge base (prioritizes knowledge_base table for program details, costs, timelines)
    const relevantDocs = await searchKnowledgeBase(message, 3);

    // Format context
    let knowledgeContext = '';
    if (relevantDocs.length > 0) {
      knowledgeContext = relevantDocs
        .map((doc, index) => `${index + 1}. ${doc.content}`)
        .join('\n');
    } else {
      knowledgeContext = 'No relevant snippets found.';
    }

    // Check if this is the third message (before using it)
    const isThirdMessage = messageCount === 3;

    // If user already has a booking, modify the message to inform them
    const finalMessage = existingBookingMessage 
      ? `${existingBookingMessage}\n\nUser's message: ${message}`
      : message;

    const { systemPrompt, userPrompt } = buildPrompt({
      brand: normalizedBrand,
      userName: typeof userProfile?.name === 'string' ? userProfile.name : undefined,
      summary,
      history: recentHistory,
      knowledgeBase: knowledgeContext,
      message: finalMessage,
      bookingAlreadyScheduled: isBookingAlreadyScheduled || !!existingBookingMessage,
    });

    const additionalGuidance = isThirdMessage
      ? '\n\nGuidance: This is the third user interaction. Encourage them to schedule a call in a single sentence.'
      : '';
    const finalUserPrompt = `${userPrompt}${additionalGuidance}`;

    // Use streaming for all brands
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        console.log('=== STREAM START FUNCTION EXECUTING ===');
        try {
          let rawResponse = '';
          let cleanedResponse = '';

          // Use Claude for streaming
          if (!anthropic) {
            console.error('[Chat API] Claude API not configured');
            throw new Error('Claude API is not configured. Please set CLAUDE_API_KEY in environment variables.');
          }

          // Use environment variable for model, fallback to claude-haiku-4-5-20251001
          const model = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
          
          console.log('[Chat API] Starting Claude stream', {
            hasApiKey: Boolean(claudeApiKey),
            model: model,
            messageLength: finalUserPrompt.length,
          });

          // Retry logic for overloaded errors
          const maxRetries = 3;
          let lastError: any = null;
          let anthropicStream;
          
          for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
              if (attempt > 0) {
                const retryDelay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff, max 10s
                console.log(`[Chat API] Retry attempt ${attempt}/${maxRetries} after ${retryDelay}ms`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
              }
              
    // Use environment variable for model, fallback to claude-haiku-4-5-20251001
    const model = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
              
              anthropicStream = await anthropic.messages.stream({
                model: model,
                max_tokens: 768,
                system: systemPrompt,
                messages: [{
                  role: 'user',
                  content: finalUserPrompt,
                }],
              });
              console.log('[Chat API] Stream created successfully');
              break; // Success, exit retry loop
            } catch (streamError: any) {
              lastError = streamError;
              const errorType = streamError?.error?.type;
              const isOverloaded = errorType === 'overloaded_error' || 
                                   streamError?.message?.includes('overloaded');
              
              console.error(`[Chat API] Stream creation failed (attempt ${attempt + 1}/${maxRetries + 1}):`, {
                error: streamError,
                message: streamError?.message,
                type: streamError?.type,
                errorType: errorType,
                isOverloaded: isOverloaded,
                status: streamError?.status,
              });
              
              // Only retry on overloaded errors, not on other errors
              if (!isOverloaded || attempt >= maxRetries) {
                throw streamError;
              }
            }
          }
          
          if (!anthropicStream) {
            throw lastError || new Error('Failed to create stream after retries');
          }

          try {
            let chunkCount = 0;
            for await (const chunk of anthropicStream) {
              chunkCount++;
              try {
                // Process content block deltas with text
                if (chunk.type === 'content_block_delta' && 'delta' in chunk && chunk.delta && chunk.delta.type === 'text_delta') {
                  const text = chunk.delta.text || '';
                  console.log('[Chat API] Processing text delta:', { 
                    textType: typeof text,
                    textLength: text?.length,
                    textPreview: typeof text === 'string' ? text.substring(0, 50) : text,
                    deltaType: chunk.delta?.type
                  });
                  
                  if (text && typeof text === 'string') {
                    rawResponse += text;
                    const sseData = `data: ${JSON.stringify({ type: 'chunk', text: text })}\n\n`;
                    controller.enqueue(encoder.encode(sseData));
                  }
                }
              } catch (chunkError) {
                console.error('[Chat API] Error processing chunk:', chunkError);
                // If it's an error chunk, re-throw it
                if (chunkError instanceof Error && chunkError.message.includes('"type":"error"')) {
                  throw chunkError;
                }
                // Otherwise continue processing other chunks
              }
            }
            console.log('[Chat API] Stream completed', { chunkCount, responseLength: rawResponse.length });
          } catch (streamError: any) {
            console.error('[Chat API] Stream processing error:', {
              error: streamError,
              message: streamError?.message,
              type: streamError?.type,
              status: streamError?.status,
              errorType: streamError?.error?.type,
              errorMessage: streamError?.error?.message,
              errorObject: streamError?.error,
              headers: streamError?.headers,
              retryAfter: streamError?.headers?.get?.('retry-after'),
              stack: streamError?.stack,
            });
            
            // If the error message contains JSON with error info, extract it
            if (streamError?.message && streamError.message.includes('"type":"error"')) {
              try {
                const parsed = JSON.parse(streamError.message);
                if (parsed.error) {
                  streamError.error = parsed.error;
                }
              } catch (e) {
                // Not JSON, continue
              }
            }
            
            // Check if this is an overloaded error that happened during iteration
            // (not during creation, so retry logic didn't catch it)
            const errorType = streamError?.error?.type || 
                             (streamError?.message?.includes('"type":"error"') ? 
                               JSON.parse(streamError.message)?.error?.type : null);
            
            if (errorType === 'overloaded_error') {
              // This error happened during stream iteration, not creation
              // We can't retry the stream at this point, but we can show a helpful message
              const retryAfter = streamError?.headers?.get?.('retry-after');
              const retrySeconds = retryAfter ? parseInt(retryAfter, 10) : 6;
              throw { ...streamError, retrySeconds, isOverloaded: true };
            }
            
            throw streamError; // Re-throw to be caught by outer catch
          }

          // Clean response
          cleanedResponse = rawResponse
            .replace(/^(Hi there!|Hello!|Hey!|Hi!)\s*/gi, '')
            .replace(/^(Hi|Hello|Hey),?\s*/gi, '')
            .trim();

          // Update session profile with client-provided data (if any)
          // This ensures profile data is saved to database and lead_id is created/updated
          if (externalSessionId && (userProfile?.userName || userProfile?.email || userProfile?.phone)) {
            console.log('[Chat API] Updating session profile with client data:', {
              hasName: !!userProfile?.userName,
              hasEmail: !!userProfile?.email,
              hasPhone: !!userProfile?.phone,
              name: userProfile?.userName,
              email: userProfile?.email,
              phone: userProfile?.phone
            });
            
            try {
              await updateSessionProfile(
                externalSessionId,
                {
                  userName: userProfile?.userName,
                  email: userProfile?.email,
                  phone: userProfile?.phone,
                  websiteUrl: userProfile?.websiteUrl
                },
                brand as 'master'
              );
              console.log('[Chat API] updateSessionProfile completed successfully');
            } catch (err) {
              console.error('[Chat API] Failed to update session profile:', err);
            }
          }

          // Fetch lead_id now (after profile may have been updated)
          // Also try to ensure lead exists if we have profile data
          let leadId: string | null = null;
          if (externalSessionId) {
            try {
              const supabase = getSupabaseClient();
              if (!supabase) {
                console.error('[Chat API] Supabase client not available');
              } else {
                // First, try to get lead_id from web_sessions
                const { data: session, error: sessionError } = await supabase
                  .from('web_sessions')
                  .select('lead_id, customer_name, customer_email, customer_phone')
                  .eq('external_session_id', externalSessionId)
                  .single();
                
                if (sessionError) {
                  console.error('[Chat API] Error fetching session:', sessionError);
                } else {
                  leadId = session?.lead_id || null;
                  
                  console.log('[Chat API] Fetched session data:', {
                    leadId,
                    hasPhone: !!session?.customer_phone,
                    hasEmail: !!session?.customer_email,
                    hasName: !!session?.customer_name,
                    phone: session?.customer_phone,
                    email: session?.customer_email,
                    name: session?.customer_name
                  });
                  
                  // If no lead_id but we have profile data, try to ensure/create the lead
                  // Use database data first, fallback to client profile data
                  const profileName = session?.customer_name || userProfile?.userName || null;
                  const profileEmail = session?.customer_email || userProfile?.email || null;
                  const profilePhone = session?.customer_phone || userProfile?.phone || null;
                  
                  if (!leadId && profilePhone) {
                    console.log('[Chat API] No lead_id found, attempting to ensure lead exists with phone:', profilePhone);
                    
                    const createdLeadId = await ensureAllLeads(
                      profileName,
                      profileEmail,
                      profilePhone,
                      brand as 'master',
                      externalSessionId
                    );
                    
                    console.log('[Chat API] ensureAllLeads result:', createdLeadId);
                    
                    if (createdLeadId) {
                      // Update web_sessions with the new lead_id
                      const { error: updateError } = await supabase
                        .from('web_sessions')
                        .update({ lead_id: createdLeadId })
                        .eq('external_session_id', externalSessionId);
                      
                      if (updateError) {
                        console.error('[Chat API] Failed to update web_sessions with lead_id:', updateError);
                      } else {
                        leadId = createdLeadId;
                        console.log('[Chat API] Created/ensured lead and updated web_sessions:', leadId);
                      }
                    } else {
                      console.log('[Chat API] Could not create lead - ensureAllLeads returned null', {
                        phone: profilePhone,
                        normalizedPhone: profilePhone ? profilePhone.replace(/\D/g, '').slice(-10) : null
                      });
                    }
                  } else if (!leadId && !profilePhone) {
                    console.log('[Chat API] Cannot create lead - phone number is required but missing', {
                      hasName: !!profileName,
                      hasEmail: !!profileEmail,
                      hasPhone: !!profilePhone
                    });
                  } else if (leadId) {
                    console.log('[Chat API] Using existing lead_id:', leadId);
                  }
                }
              }
            } catch (err) {
              console.error('[Chat API] Error fetching/ensuring lead_id:', err);
            }
          }

          // Log customer message to conversations table (immediately after lead_id is available)
          console.log('[Chat API] Checking if lead_id exists for customer message logging...', {
            hasLeadId: !!leadId,
            leadId: leadId || 'NULL',
            messageLength: message?.length || 0
          });
          
          if (leadId) {
            console.log('[Chat API] ✓ Lead ID exists:', leadId);
            console.log('[Chat API] Customer message:', message);
            console.log('[Chat API] About to call logMessage() for customer message to "conversations" table...');
            
            try {
              console.log('=== BEFORE CUSTOMER LOG ===');
              const customerLogResult = await logMessage(leadId, 'web', 'customer', message, 'text', {
                input_received_at: inputReceivedAt
              });
              console.log('=== AFTER CUSTOMER LOG ===');
              
              console.log('[Chat API] Insert result (customer):', customerLogResult ? '✓ Success' : '✗ Failed', {
                messageId: customerLogResult?.id || null,
                leadId,
                hasResult: !!customerLogResult,
                result: customerLogResult
              });
            } catch (err: any) {
              console.error('[Chat API] ✗ Exception while logging customer message:', {
                error: err,
                errorMessage: err?.message,
                errorStack: err?.stack,
                leadId,
                messagePreview: message?.substring(0, 100)
              });
            }
          } else {
            console.log('[Chat API] ✗ No lead_id available, skipping customer message logging', {
              externalSessionId,
              hasSupabaseClient: !!getSupabaseClient(),
              message: message?.substring(0, 50)
            });
          }

          // Log AI response to conversations table (after response is generated)
          console.log('[Chat API] Checking if lead_id and response exist for AI response logging...', {
            hasLeadId: !!leadId,
            leadId: leadId || 'NULL',
            hasResponse: !!cleanedResponse,
            responseLength: cleanedResponse?.length || 0
          });
          
          if (leadId && cleanedResponse) {
            const outputSentAt = Date.now();
            
            console.log('[Chat API] ✓ Lead ID exists:', leadId);
            console.log('[Chat API] AI response (preview):', cleanedResponse.substring(0, 100) + '...');
            console.log('[Chat API] About to call logMessage() for agent response to "conversations" table...');
            
            try {
              console.log('=== BEFORE AGENT LOG ===');
              const agentLogResult = await logMessage(leadId, 'web', 'agent', cleanedResponse, 'text', {
                output_sent_at: outputSentAt,
                input_received_at: inputReceivedAt,
                input_to_output_gap_ms: outputSentAt - inputReceivedAt
              });
              console.log('=== AFTER AGENT LOG ===');
              
              console.log('[Chat API] Insert result (agent):', agentLogResult ? '✓ Success' : '✗ Failed', {
                messageId: agentLogResult?.id || null,
                leadId,
                hasResult: !!agentLogResult,
                result: agentLogResult
              });
            } catch (err: any) {
              console.error('[Chat API] ✗ Exception while logging agent message:', {
                error: err,
                errorMessage: err?.message,
                errorStack: err?.stack,
                leadId,
                responsePreview: cleanedResponse?.substring(0, 100)
              });
            }
          } else {
            console.log('[Chat API] ✗ No lead_id or response available, skipping AI response logging', {
              hasLeadId: !!leadId,
              hasResponse: !!cleanedResponse,
              responseLength: cleanedResponse?.length || 0,
              leadId: leadId || 'NULL'
            });
          }

          // Generate follow-ups based on 3-2-1 button structure
          const lowerMessage = message.toLowerCase();
          const isFirstMessage = messageCount === 1 || messageCount === 0;
          
          // Check if user already has a booking scheduled
          let hasExistingBooking = false;
          let existingBookingDetails = null;
          if (userProfile.email || userProfile.phone) {
            try {
              const existingBooking = await checkExistingBooking(
                userProfile.phone || null,
                userProfile.email || null,
                normalizedBrand as 'master'
              );
              
              if (existingBooking?.exists && existingBooking.bookingDate && existingBooking.bookingTime) {
                hasExistingBooking = true;
                existingBookingDetails = existingBooking;
              }
            } catch (bookingCheckError) {
              // Log error but don't crash - allow buttons to be generated
              console.error('[Chat API] Error checking existing booking for button filtering:', bookingCheckError);
            }
          }
          
          // Get brand config
          const brandConfig = MasterConfig;
          const exploreButtons = brandConfig.exploreButtons || [];
          
          // Helper function to check if a button is booking-related
          const isBookingButton = (button: string): boolean => {
            const lowerButton = button.toLowerCase();
            const bookingKeywords = ['book', 'schedule', 'call', 'demo', 'meeting', 'appointment'];
            return bookingKeywords.some(keyword => lowerButton.includes(keyword));
          };
          
          let followUpsArray: string[] = [];
          
          // Track used buttons (normalize to lowercase for comparison)
          const usedButtonsLower = (usedButtons || []).map((b: string) => b.toLowerCase());
          
          // Check if user clicked "Explore Training Options" - show 4 program buttons
          const isExploreTrainingClick = lowerMessage.includes('explore training options') || 
                                         lowerMessage.includes('explore training');
          
          if (isExploreTrainingClick && exploreButtons.length > 0) {
            // Show all 4 program buttons
            followUpsArray = exploreButtons;
          }
          // If user has existing booking, filter out booking buttons
          else if (hasExistingBooking) {
            const bookingActionButtons = ['Reschedule Call', 'View Booking Details'];
            
            // First message: 2 buttons (non-booking + booking actions)
            if (isFirstMessage) {
              const nonBookingButtons = ['Get Course Details', 'Check Eligibility', 'Financing Options'];
              followUpsArray = [...nonBookingButtons, ...bookingActionButtons].slice(0, 2);
            } 
            // Subsequent messages: 1 button
            else {
              const availableButtons = [
                'Get Course Details',
                'Check Eligibility',
                'Financing Options',
                ...bookingActionButtons
              ];
              
              const unusedButtons = availableButtons.filter(btn => {
                const lowerBtn = btn.toLowerCase();
                return !usedButtonsLower.includes(lowerBtn) && !isSimilarToAny(btn, usedButtons);
              });
              
              const buttonsToChooseFrom = unusedButtons.length > 0 ? unusedButtons : availableButtons;
              if (buttonsToChooseFrom.length > 0) {
                const randomIndex = Math.floor(Math.random() * buttonsToChooseFrom.length);
                followUpsArray = [buttonsToChooseFrom[randomIndex]];
              } else {
                followUpsArray = ['Reschedule Call'];
              }
            }
          } 
          // Normal flow: 3-2-1 button structure
          else {
            // First message: Generate 2 contextual buttons using Claude
            if (isFirstMessage) {
              try {
                const generatedButtons = await generateFollowUpSuggestion(message, cleanedResponse, messageCount);
                
                if (generatedButtons) {
                  // Claude returns a single button, we need 2 for first message
                  // Generate second button based on context
                  const lowerResponse = cleanedResponse.toLowerCase();
                  
                  // Default button pool for first message
                  const firstMessagePool = [
                    'Explore Training Options',
                    'Book a Demo Session',
                    'Get Cost Breakdown',
                    'Check Eligibility',
                    'Learn More'
                  ];
                  
                  // Filter out the generated button and used buttons
                  const availableButtons = firstMessagePool.filter(btn => {
                    const lowerBtn = btn.toLowerCase();
                    return lowerBtn !== generatedButtons.toLowerCase() && 
                           !usedButtonsLower.includes(lowerBtn) &&
                           !isSimilarToAny(btn, [generatedButtons, ...usedButtons]);
                  });
                  
                  // Select second button
                  const secondButton = availableButtons.length > 0 
                    ? availableButtons[Math.floor(Math.random() * availableButtons.length)]
                    : 'Book a Demo Session';
                  
                  followUpsArray = [generatedButtons, secondButton].filter(Boolean);
                } else {
                  // Fallback: use contextual buttons
                  const lowerResponse = cleanedResponse.toLowerCase();
                  const contextualPool = [
                    'Explore Training Options',
                    'Book a Demo Session',
                    'Get Cost Breakdown',
                    'Check Eligibility'
                  ];
                  followUpsArray = contextualPool.slice(0, 2);
                }
              } catch (error) {
                console.error('[Chat API] Error generating first message buttons:', error);
                // Fallback
                followUpsArray = ['Explore Training Options', 'Book a Demo Session'];
              }
            } 
            // Subsequent messages: Generate 1 contextual button
            else {
              const lowerResponse = cleanedResponse.toLowerCase();
              
              // Check context for smart button generation
              const isAskingCost = lowerMessage.includes('cost') || 
                                  lowerMessage.includes('price') || 
                                  lowerMessage.includes('fee') ||
                                  lowerMessage.includes('investment') ||
                                  lowerResponse.includes('₹') ||
                                  lowerResponse.includes('lakh');
              
              const isInterestedInCourse = lowerMessage.includes('pilot') || 
                                          lowerMessage.includes('helicopter') ||
                                          lowerMessage.includes('cabin crew') ||
                                          lowerMessage.includes('drone') ||
                                          lowerResponse.includes('program');
              
              // Build contextual button pool
              let contextualButtons: string[] = [];
              
              if (isAskingCost) {
                contextualButtons = ['Get Cost Breakdown', 'Financing Options', 'Talk to Counselor'];
              } else if (isInterestedInCourse) {
                contextualButtons = ['Book 1:1 Consultation', 'Book Demo Online', 'Get Course Timeline'];
              } else {
                contextualButtons = [
                  'Book a Demo Session',
                  'Get Cost Breakdown',
                  'Check Eligibility',
                  'Explore Training Options',
                  'Talk to Counselor'
                ];
              }
              
              // Filter out used buttons
              const unusedButtons = contextualButtons.filter(btn => {
                const lowerBtn = btn.toLowerCase();
                return !usedButtonsLower.includes(lowerBtn) && !isSimilarToAny(btn, usedButtons);
              });
              
              const buttonsToChooseFrom = unusedButtons.length > 0 ? unusedButtons : contextualButtons;
              
              // Try to generate with Claude first
              try {
                const generatedButton = await generateFollowUpSuggestion(message, cleanedResponse, messageCount);
                if (generatedButton && !usedButtonsLower.includes(generatedButton.toLowerCase())) {
                  followUpsArray = [generatedButton];
                } else if (buttonsToChooseFrom.length > 0) {
                  // Use contextual button if Claude didn't generate or it's already used
                  const randomIndex = Math.floor(Math.random() * buttonsToChooseFrom.length);
                  followUpsArray = [buttonsToChooseFrom[randomIndex]];
                } else {
                  followUpsArray = ['Book a Demo Session'];
                }
              } catch (error) {
                console.error('[Chat API] Error generating follow-up button:', error);
                // Fallback to contextual selection
                if (buttonsToChooseFrom.length > 0) {
                  const randomIndex = Math.floor(Math.random() * buttonsToChooseFrom.length);
                  followUpsArray = [buttonsToChooseFrom[randomIndex]];
                } else {
                  followUpsArray = ['Book a Demo Session'];
                }
              }
            }
          }
          
          // Final fallback: ensure we always have at least 1 follow-up button
          if (followUpsArray.length === 0 || !followUpsArray[0]) {
            followUpsArray = hasExistingBooking ? ['Reschedule Call'] : ['Book a Demo Session'];
          }

          // Send follow-ups and done
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'followUps', followUps: followUpsArray })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
          
          // Generate and save conversation summary (async, don't wait)
          // For Master: Generate summary every 5 messages
          const shouldGenerateSummary = BRAND === 'master' 
            ? (messageCount % 5 === 0 || messageCount === 1) // Every 5 messages or first message
            : true; // For other brands, generate every time
          
          if (externalSessionId && cleanedResponse && shouldGenerateSummary) {
            // Strip HTML from cleanedResponse before using it
            const strippedResponse = cleanedResponse.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
            
            // Build conversation history for summarization
            const conversationHistory = [
              ...recentHistory,
              { role: 'user' as const, content: message },
              { role: 'assistant' as const, content: strippedResponse }
            ];

            // Call the summarize API to get proper AI-generated summary
            (async () => {
              try {
                // Fetch the latest summary from Supabase to ensure we have the full context
                let latestSummary = summary || '';
                if (externalSessionId) {
                  try {
                    const summaryData = await fetchSummary(externalSessionId, brand as '{{BRAND_NAME}}');
                    if (summaryData?.summary) {
                      latestSummary = summaryData.summary;
                    }
                  } catch (fetchError) {
                    console.warn('[Chat API] Failed to fetch summary from Supabase, using client summary:', fetchError);
                    // Fall back to client-provided summary if fetch fails
                  }
                }

                const summarizeResponse = await fetch(`${request.nextUrl.origin}/api/chat/summarize`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    summary: latestSummary,
                    history: conversationHistory,
                    brand: brand,
                  }),
                });

                if (!summarizeResponse.ok) {
                  throw new Error(`Summarize API returned ${summarizeResponse.status}`);
                }

                const summarizeData = await summarizeResponse.json();
                const aiGeneratedSummary = summarizeData.summary || latestSummary || '';

                // Get IST timestamp (UTC+5:30)
                let lastMessageAt: string;
                try {
                  const now = new Date();
                  const formatter = new Intl.DateTimeFormat('en-US', {
                    timeZone: 'Asia/Kolkata',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                  });
                  const parts = formatter.formatToParts(now);
                  const year = parts.find(p => p.type === 'year')?.value || '2024';
                  const month = parts.find(p => p.type === 'month')?.value || '01';
                  const day = parts.find(p => p.type === 'day')?.value || '01';
                  const hours = parts.find(p => p.type === 'hour')?.value || '00';
                  const minutes = parts.find(p => p.type === 'minute')?.value || '00';
                  const seconds = parts.find(p => p.type === 'second')?.value || '00';
                  const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
                  lastMessageAt = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}+05:30`;
                } catch (error) {
                  // Fallback to UTC if IST conversion fails
                  lastMessageAt = new Date().toISOString();
                }

                // Save the AI-generated summary
                await upsertSummary(externalSessionId, aiGeneratedSummary, lastMessageAt, brand as '{{BRAND_NAME}}');
              } catch (summarizeError) {
                console.error('[Chat API] Failed to generate summary via summarize API:', summarizeError);
                // Fallback: save a basic summary if summarize API fails
                // Try to get latest summary from Supabase for fallback
                let fallbackSummary = summary || `${message}\n\n${strippedResponse}`;
                if (externalSessionId) {
                  try {
                    const summaryData = await fetchSummary(externalSessionId, brand as '{{BRAND_NAME}}');
                    if (summaryData?.summary) {
                      fallbackSummary = `${summaryData.summary}\n\n${message}\n\n${strippedResponse}`;
                    }
                  } catch (fetchError) {
                    // Use the basic fallback if fetch fails
                  }
                }
                const lastMessageAt = new Date().toISOString();
                upsertSummary(externalSessionId, fallbackSummary, lastMessageAt, brand as '{{BRAND_NAME}}').catch(err => {
                  console.error('[Chat API] Failed to save fallback summary:', err);
                });
              }
            })();
          }
          
          controller.close();
        } catch (error: any) {
          console.error('[Chat API] Stream error:', {
            error,
            message: error?.message,
            type: error?.type,
            status: error?.status,
            statusCode: error?.status_code,
            errorType: error?.error?.type,
            stack: error?.stack,
          });
          
          // Extract error details - Claude API error structure is nested
          let claudeErrorType = error?.error?.type;
          let claudeErrorMessage = error?.error?.message;
          const errorMessage = error?.message || error?.toString() || 'Unknown error occurred';
          
          // Try to parse error message if it's JSON (Claude sometimes returns JSON string)
          if (!claudeErrorType && errorMessage && errorMessage.includes('"type":"error"')) {
            try {
              const parsed = JSON.parse(errorMessage);
              if (parsed.error) {
                claudeErrorType = parsed.error.type;
                claudeErrorMessage = parsed.error.message;
              }
            } catch (e) {
              // Not JSON, continue with original error message
            }
          }
          
          const errorType = claudeErrorType || error?.type || error?.status_code || 'unknown_error';
          const retryAfter = error?.headers?.get?.('retry-after');
          
          // Handle specific error types
          let userFriendlyMessage = claudeErrorMessage || errorMessage;
          
          if (errorType === 'overloaded_error' || errorMessage.toLowerCase().includes('overloaded') || error?.isOverloaded) {
            // Use retrySeconds from error object if available (from stream iteration error)
            const retrySeconds = error?.retrySeconds || (retryAfter ? parseInt(retryAfter, 10) : 6);
            userFriendlyMessage = `The service is currently overloaded. Please try again in ${retrySeconds} seconds.`;
          } else if (errorType === 'rate_limit_error' || errorMessage.toLowerCase().includes('rate_limit') || errorMessage.toLowerCase().includes('rate limit') || error?.status_code === 429) {
            userFriendlyMessage = 'Rate limit exceeded. Please wait a moment and try again.';
          } else if (errorMessage.toLowerCase().includes('api key') || errorMessage.toLowerCase().includes('authentication') || error?.status_code === 401) {
            userFriendlyMessage = 'Authentication error. Please check API configuration.';
          } else if (errorMessage.toLowerCase().includes('network') || errorMessage.toLowerCase().includes('fetch')) {
            userFriendlyMessage = 'Network error. Please check your connection and try again.';
          } else if (error?.status_code === 500 || error?.status_code === 503) {
            userFriendlyMessage = 'The service is currently unavailable. Please try again in a moment.';
          } else {
            // For development, show more details
            if (process.env.NODE_ENV !== 'production') {
              userFriendlyMessage = `Error: ${claudeErrorMessage || errorMessage}`;
            }
          }
          
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'error', 
              error: userFriendlyMessage 
            })}\n\n`));
          } catch (encodeError) {
            console.error('[Chat API] Failed to encode error:', encodeError);
          }
          
          try {
            controller.close();
          } catch (closeError) {
            console.error('[Chat API] Failed to close stream:', closeError);
          }
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        // CORS headers for iframe embedding
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });

  } catch (error: any) {
    return Response.json(
      { error: 'Error processing request', message: error.message },
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      }
    );
  }
}
