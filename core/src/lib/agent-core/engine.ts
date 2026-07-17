/**
 * Unified PROXe Agent Engine - Channel-agnostic orchestrator
 * Wires together: knowledge search, prompt builder, Claude client, intent extraction, follow-ups, summarizer
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { AgentInput, AgentOutput, KnowledgeResult, StreamChunk } from './types';
import { searchKnowledgeBase } from './knowledgeSearch';
import { buildPrompt } from './promptBuilder';
import { getPromptOverride } from '../promptConfig';
import { generateResponse, generateResponseWithTools, streamResponse, isConfigured, getErrorMessage, getReasoningModel } from './claudeClient';
import type { ToolDefinition, ToolHandler } from './claudeClient';
import { extractIntent, isBookingIntent, isBookingFlowStep, extractPainPoint, detectObjection } from './intentExtractor';
import { generateFollowUps } from './followUpGenerator';
import { generateSummary } from './summarizer';
import {
  getAvailableSlots,
  isAllowedBookingTime,
  createCalendarEvent,
  cancelBooking,
  storeBooking,
  checkExistingBooking,
  normalizeBookingSessionType,
} from '@/lib/services/bookingManager';
import { getBrandConfig, getCurrentBrandId } from '@/configs';
import { stripBookedTimeSlots } from '@/lib/services/quickReplyMap';
import { crawlBusiness } from '@/lib/services/businessCrawler';
import { notifySlackBooking, notifySlackLead } from '@/lib/services/slackNotifier';
import { slackBotConfigured, slackPostMessage, leadAlertBlocks } from '@/lib/services/slackApi';

// `process` is SHADOWED in this module by the exported `async function process`
// below — so a bare `process.env.X` reads `.env` off the FUNCTION (undefined)
// and THROWS "Cannot read properties of undefined (reading 'X')". That silently
// killed flagForHumanFollowup at the NEXT_PUBLIC_APP_URL read → the Slack "needs
// a human" ping NEVER fired (and the Telegram alert too). Read env off
// globalThis, which the local function name cannot shadow.
const ENV: Record<string, string | undefined> = ((globalThis as any).process?.env) ?? {};

/**
 * Lokazen has three separate audiences (brand/owner/scout) that must never
 * cross-contaminate — a brand's pricing question should never surface Scout
 * payout content, and vice versa. Only Scout currently has KB content, so
 * for any other (or undetermined) audience we skip the KB search entirely
 * rather than risk a leak; extend the 'scout' branch pattern here if
 * brand/owner KB content is added later.
 */
function resolveKbScope(brandId: string, audience: AgentInput['lokazenAudience']): { skip: boolean; category: string | null } {
  if (brandId !== 'lokazen') return { skip: false, category: null };
  if (audience === 'scout') return { skip: false, category: 'scout' };
  return { skip: true, category: null };
}

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

  // 2. Search knowledge base (audience-scoped for Lokazen — see resolveKbScope)
  const kbScope = resolveKbScope(brandId, input.lokazenAudience);
  const relevantDocs = kbScope.skip ? [] : await searchKnowledgeBase(supabase, input.message, 3, kbScope.category);
  const knowledgeContext = formatKnowledgeContext(relevantDocs);

  // 3. Check for existing booking
  const existingBookingMessage = await checkBooking(supabase, input);

  // 4. Build prompt (brand-aware)
  // If existing booking found, include it as context but still allow rescheduling
  const finalMessage = existingBookingMessage
    ? `[EXISTING BOOKING INFO (internal — do not echo verbatim to the customer): ${existingBookingMessage}

RULES for this turn:
- Trust the "Current IST" time in your system prompt. NEVER tell the customer the team "will call you at {time}" if that time has ALREADY PASSED — repeating a past slot as if it's still coming is the #1 mistake to avoid here.
- If the booking time has ALREADY PASSED (the info above says PASSED): take ownership warmly. Apologise that the team hasn't connected yet, do NOT repeat the old time as if it's still upcoming. Then give a concrete next step — offer the next available slot, OR tell them you'll have the team call them back shortly. If they want a call now, say you're getting the team to reach out and that you've flagged it as priority. Do not keep sending the same "booked for {time}" line.
- If the booking is UPCOMING: acknowledge briefly and reassure ("All set — the team will reach out at {time}."). Don't over-repeat it.
- If they give a different date/time, that's a reschedule — cancel old + book new immediately, without asking "should I cancel?".
- Read the customer's tone. If they're frustrated or repeating themselves, respond to THAT directly — never send the same booking line twice in a row.]

User's message: ${input.message}`
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

  const promptOverride = await getPromptOverride(input.channel);
  let { systemPrompt, userPrompt } = buildPrompt({
    channel: input.channel,
    userName: input.userProfile.name,
    userEmail: input.userProfile.email,
    userPhone: input.userProfile.phone,
    summary: input.summary,
    history: input.conversationHistory,
    knowledgeBase: knowledgeContext,
    message: finalMessage,
    bookingAlreadyScheduled: !!existingBookingMessage,
    messageCount: input.messageCount,
    brand: brandId,
    crossChannelContext: crossChannelContext || undefined,
    promptOverride,
    formData,
  });
  // Lock the model to the resolved Lokazen audience so it can't drift into the
  // wrong flow (e.g. answering a scout's "money debited" with brand/CRE copy,
  // or offering a scout a call). No-op for non-lokazen brands / unknown audience.
  systemPrompt += lokazenAudienceDirective(input, brandId);

  // 5. Detect human handoff requests before AI generation
  const wantsHuman = detectHumanHandoffRequest(input.message);

  // 5b. Scout support issues — a scout reporting an app/upload/KYC/payout problem
  // must become a SUPPORT REQUEST (Slack ping to the team), deterministically,
  // not left to the model. Scoped to scout audience so a brand/owner mentioning
  // "photo" or "location" is never caught. These leads can't book a call, so the
  // only escalation path is a support request.
  const scoutSupportIssue =
    input.lokazenAudience === 'scout' &&
    (/\b(can'?t|cannot|can not|unable|not able|couldn'?t|won'?t|isn'?t|doesn'?t|didn'?t|no|not)\b[^.?!]*\b(upload|uploaded|uploading|photo|picture|image|pic|location|gps|submit|submitted|kyc|verif|verified|login|log ?in|sign ?in|app|payout|paid|payment|money|reward)\b|\b(kyc|payout|payment|verification)\b[^.?!]*\b(stuck|pending|fail|failed|error|not|missing|issue|problem|delay)\b|\b(problem|issue|trouble|error|not working|doesn'?t work|stuck|help me)\b/i
      .test(input.message || '') ||
    // Money / payment complaints — scouts get PAID, so any "debited / deducted /
    // charged / refund / not credited / amount cut / kindly check my payment"
    // line is a support issue even without a negation word. Scout-scoped, so a
    // brand/owner asking about fees is never caught here.
    /\b(debited|deducted|charged|refunded?|not credited|credited|chargeback)\b|\b(money|amount|paisa|rupees?|rs\.?|₹|payment|payout|balance)\b[^.?!]*\b(debited|deducted|cut|gone|missing|stuck|check|not received|didn'?t (get|receive)|haven'?t (got|received)|pending|deducted)\b|\b(didn'?t|not|haven'?t|never)\b[^.?!]*\b(get|got|receive|received|credited|paid)\b[^.?!]*\b(money|amount|payment|payout|refund)\b/i
      .test(input.message || ''));

  // 5c. Payment / transaction failures apply to ANY Lokazen audience — owners and
  // brands PAY Lokazen, scouts get PAID BY Lokazen, so "money debited but payment
  // failed", "amount deducted", "refund not received" is a SUPPORT issue for all
  // three, never a reason to book a call. Complaint-shaped only (see isPaymentComplaint),
  // so "what's the fee?" / "how do I pay?" never fires.
  const paymentSupportIssue = brandId === 'lokazen' && isPaymentComplaint(input.message || '');
  const supportEscalation = scoutSupportIssue || paymentSupportIssue;
  // A payment problem must never become a booking — tell the model plainly and
  // forbid the "your transaction was successful" hallucination.
  if (paymentSupportIssue) systemPrompt += paymentSupportDirective();

  // When the person asks for the team / a human, hand off CLEANLY — the team has
  // been pinged (flagForHumanFollowup below). Do NOT negotiate a call time back
  // and forth (it loops and never books). Confirm the handoff and stop.
  if (wantsHuman) {
    systemPrompt += `\n\nTEAM HANDOFF (the person asked to reach the team/a human): Our team has ALREADY been notified with this conversation. Reply in ONE short line that you've passed their details to the team and someone will reach out shortly to confirm a time. Do NOT ask "what day/time works", do NOT propose slots, do NOT try to book the call yourself — the team confirms the time directly. Never loop on times.`;
  }

  // 5d. Bare greeting — a plain "Hey" is a fresh hello, not the customer
  // re-opening yesterday's payout/support thread. Append LAST so it wins over
  // any prior-topic pull. Handoff/payment directives above are gated on the
  // CURRENT message, so they don't fire on "Hey" — this just stops the model
  // from re-litigating history it shouldn't assume.
  if (isBareGreeting(input.message)) systemPrompt += greetingDirective(input.userProfile.name);

  // 5e. Never fabricate payout/submission/verification status (Lokazen). Kills
  // the invented "your submission is in the queue for verification" line.
  if (brandId === 'lokazen') systemPrompt += statusHonestyDirective();
  if (brandId === 'lokazen') systemPrompt += callbackDirective();

  // 6. Generate response (with retry + graceful fallback)
  let rawResponse: string;

  // Wire booking tools when:
  //   - Current message has booking intent, OR
  //   - User already has a booking (could be rescheduling), OR
  //   - Any of the last 6 CUSTOMER messages had booking intent — this keeps
  //     tools available across multi-turn booking flows (user said "yes book me"
  //     3 turns ago, now sharing email; tools must still be wired so the LLM
  //     can call check_availability + book_consultation).
  //
  // IMPORTANT: only check role==='user' messages. Agent templates ("Demo
  // Session Booked", "your online demo session is confirmed") contain
  // booking keywords by definition — if we counted those, every customer
  // reply right after a demo confirmation would force-wire booking tools,
  // which confused Claude when the customer was actually asking about
  // something unrelated (e.g. "Join Pilot Community" tap → no reply).
  const recentBookingDiscussion = (input.conversationHistory || [])
    .slice(-6)
    .some((m) => m.role === 'user' && isBookingIntent(m.content));
  // Keep tools wired mid-flow: if the LAST assistant turn was a booking step
  // (asked for date/time/email, offered slots, confirming-before-lock), this
  // reply continues that flow even if the original "book me" scrolled away.
  const lastAssistantTurn = (input.conversationHistory || [])
    .slice(-4)
    .reverse()
    .find((m) => m.role === 'assistant');
  const midBookingFlow = !!lastAssistantTurn && isBookingFlowStep(lastAssistantTurn.content);
  // Scouts can NEVER book a call — so we never even WIRE the booking tools for
  // them. Previously the tools were offered and the handler hard-refused with
  // scoutBookingBlock(), which the model surfaced as a dumb "Sorry, I cannot
  // book a call" AFTER walking the user down the booking path. Cutting the
  // tools off here means the flow never starts.
  const isScout = input.lokazenAudience === 'scout';
  // A payment/transaction complaint (any audience) is support, not sales — never
  // wire booking tools for it, so the model can't pivot the person into a call.
  const lokazenBookingAction = !isScout && !supportEscalation && brandId === 'lokazen' && isLokazenBookingAction(input);
  // POP is citizen grievance outreach — there is nothing to book. Same cutoff
  // pattern as scouts: never wire the tools, so a booking flow can't even start
  // if a citizen's message happens to trip isBookingIntent().
  const isVoterBrand = brandId === 'pop';
  const needsBookingTools = !isScout && !isVoterBrand && !supportEscalation && (input.channel === 'whatsapp' || lokazenBookingAction) &&
    (isBookingIntent(input.message) || !!existingBookingMessage || recentBookingDiscussion || midBookingFlow || lokazenBookingAction);

  // We capture this OUTSIDE try/catch so the post-generation hallucination
  // check below can read it. The set is populated by the book_consultation
  // tool handler when (and only when) the tool actually runs.
  let bookingsCompletedThisSession: Set<string> | null = null;
  // Populated by check_availability so we can strip any booked slot the LLM
  // still tries to offer as a tappable button (see stripBookedTimeSlots).
  let availabilityRef: { current: { date: string; availableTimes: string[] } | null } | null = null;

  try {
    if (needsBookingTools) {
      const bt = buildBookingTools(input, supabase);
      bookingsCompletedThisSession = bt.bookingsCompletedThisSession;
      availabilityRef = bt.availabilityRef;
      rawResponse = await generateResponseWithTools(systemPrompt, userPrompt, {
        tools: bt.tools,
        toolHandlers: bt.toolHandlers,
        maxToolRounds: 3,
      }, 512);
    } else {
      // Non-booking WhatsApp messages and all other channels: simple response
      rawResponse = await generateResponse(systemPrompt, userPrompt, 512);
    }
  } catch (firstError: any) {
    console.error('[Engine] AI generation failed (attempt 1):', firstError?.message || firstError);

    // Retry once with reduced complexity
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));

      if (needsBookingTools) {
        const bt = buildBookingTools(input, supabase);
        bookingsCompletedThisSession = bt.bookingsCompletedThisSession;
        availabilityRef = bt.availabilityRef;
        rawResponse = await generateResponseWithTools(systemPrompt, userPrompt, {
          tools: bt.tools,
          toolHandlers: bt.toolHandlers,
          maxToolRounds: 2,
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

  // ── HALLUCINATED BOOKING GUARD ─────────────────────────────────────────
  // If the response claims a booking was made but book_consultation never
  // fired (Claude sometimes types through a flow without invoking the tool),
  // overwrite the response with a "let me try again" line and flag the lead.
  // We deliberately do NOT silently keep the false claim — the customer would
  // expect a calendar invite that never arrives.
  // Fire whenever NO booking actually completed this turn and there is no
  // pre-existing booking to legitimately confirm. This now also covers the
  // case where booking tools were never wired (Claude free-typed a "Done."
  // confirmation, or printed the tool args as JSON) — previously the guard was
  // gated on needsBookingTools and silently let those false claims through.
  const noBookingThisTurn = !bookingsCompletedThisSession || bookingsCompletedThisSession.size === 0;
  if (input.channel === 'whatsapp' && noBookingThisTurn && !existingBookingMessage) {
    // Match the CURRENT confirmation wording too. The booking copy changed to
    // "Your booking is recorded …" / "You're all set …" — the old regex only
    // caught "is locked" / "booking confirmed", so failed bookings were sailing
    // through with a false "recorded" claim and nothing saved.
    const claimsBooked = /(\b(done\.|is locked|booking confirmed|booking is recorded|recorded for|you'?re all set|all set,? |looking forward to (chatting|seeing|meeting)|see you (tomorrow|today|on)|calendar invite on its way|booked,?\b|your (call|visit|callback) is (set|booked|scheduled|confirmed)|(call|callback|visit) is set for|team will (confirm|call|connect)|will confirm and call you|will call you then|call you at|flag (this|it|these|that|your details) to (the|our) team|noted[,.]? .*call you)\b|\bat \d{1,2}(:\d{2})?\s*(am|pm)\s+works\b)/i
      .test(rawResponse);
    // DETERMINISTIC SAFETY NET (never silent): if the customer's message THIS turn
    // is a bare time-slot pick ("3 PM" / "3:00 PM" / "15:00") in reply to a booking
    // prompt, a booking was expected. If none registered, we MUST act regardless of
    // what the model typed — even an honest "I couldn't book" would otherwise leave
    // the team unaware. Gated on a booking context so a stray "5 pm" never fires.
    const msgTrim = String(input.message || '').trim();
    const isBareSlot = /^(1[0-2]|[1-9])(:[0-5]\d)?\s*(a\.?m\.?|p\.?m\.?)$/i.test(msgTrim)
      || /^(1[01]|1[3-9]|2[0-3]):[0-5]\d$/.test(msgTrim);
    const lastAsst = (input.conversationHistory || []).slice(-3).reverse().find((m) => m.role === 'assistant');
    const inBookingCtx = !!lastAsst && /\b(\d\s*(am|pm)|what time|which .*work|\bslot\b|book|call ?back|schedule|\bcall you\b)\b/i.test(String(lastAsst.content || ''));
    // If the model is still COLLECTING info (asking for email/name/number) the
    // flow isn't done — that's not a failed booking, so don't force the net.
    const responseAsksForInfo = /\?\s*$/.test(rawResponse.trim())
      || /\b(e-?mail|your name|best (number|time)|reach you (on|at)|what('?s| is) your|share your)\b/i.test(rawResponse);
    const userPickedSlot = isBareSlot && inBookingCtx && !responseAsksForInfo;
    if (claimsBooked || userPickedSlot) {
      // Before giving up: go back through the conversation, pull the date + time
      // the user actually agreed, and register it. A failed/never-called booking
      // should not lose the call — recover it instead of only apologising.
      const recovered = await recoverLostBooking(input, rawResponse, supabase);
      if (recovered) {
        console.log(`[Engine] FALSE BOOKING CLAIM RECOVERED from conversation: ${recovered.dateISO} ${recovered.timeDisplay}`);
        rawResponse = `You're booked for ${recovered.timeDisplay} ${recovered.dateLabel}. The team will call you then.`;
      } else {
        console.error('[Engine] FALSE BOOKING CLAIM — could not recover a slot from the conversation. Overwriting + flagging lead.');
        await flagForHumanFollowup(supabase, input, 'BOOKING FAILED — the customer tried to book a call but it did not save. Please call them to confirm a time.');
        rawResponse = "I could not lock that slot just now, but I have passed your details to our team. They will reach out to confirm your time shortly.";
      }
    }
  }

  // ── DUPLICATE CONFIRMATION GUARD ───────────────────────────────────────
  // A booking confirmation already exists for this lead (existingBookingMessage)
  // and the model is repeating "booking is recorded" WITHOUT making a new
  // booking this turn — e.g. the customer just said "okay". Re-announcing the
  // booking a second time reads as broken ("recorded… recorded again"). Replace
  // the repeat with a brief acknowledgement so it's only ever confirmed once.
  if (input.channel === 'whatsapp' && noBookingThisTurn && existingBookingMessage) {
    const repeatsBooking = /\b(is locked|booking confirmed|booking is recorded|recorded for|you'?re all set|all set,? )\b/i
      .test(rawResponse);
    if (repeatsBooking) {
      console.log('[Engine] Suppressing duplicate booking confirmation (already confirmed earlier, no new booking this turn).');
      rawResponse = "You're all set — our team will reach out to confirm. Anything else I can help with?";
    }
  }

  // If user explicitly asked for a human, flag for follow-up regardless of AI response
  if (wantsHuman) {
    await flagForHumanFollowup(supabase, input, 'Customer requested human agent');
  } else if (paymentSupportIssue) {
    // Payment/transaction problem (any audience) — raise a support request so the
    // team gets the number + the exact complaint and can check the transaction.
    await flagForHumanFollowup(supabase, input, `Payment/transaction issue: "${(input.message || '').slice(0, 160)}"`);
  } else if (scoutSupportIssue) {
    // Scout hit a problem — raise a support request so the team gets pinged with
    // the number + the issue. (No call for scouts; support goes this way.)
    await flagForHumanFollowup(supabase, input, `Scout reported an issue: "${(input.message || '').slice(0, 160)}"`);
  }

  // Deterministic safety net: never let a booked slot survive as a tappable
  // button (the LLM occasionally offers the prompt's example 3/4/5 menu instead
  // of the tool's filtered list). Uses the open times check_availability saw.
  if (availabilityRef?.current) {
    rawResponse = stripBookedTimeSlots(rawResponse, availabilityRef.current.availableTimes);
  }

  let cleanedResponse = cleanResponse(rawResponse, input.channel) || rawResponse.trim();
  cleanedResponse = suppressKnownContactReask(cleanedResponse, input, brandId);
  cleanedResponse = advanceLokazenBookingAfterEmail(cleanedResponse, input, brandId);
  // Set when the reply below is only the generic "nothing useful → flagged to the
  // team" fallback (anti-repeat / empty-AI guard), not a real answer. The caller
  // uses it to stay silent when a human is already handling the lead.
  let lowValueEscalation = false;

  // ANTI-REPEAT GUARD (deterministic): the model sometimes re-sends a
  // near-identical line turn after turn — e.g. the same "the team handles
  // payouts... your submission is in the queue for verification" to both "Hey"
  // and "Yes". That reads as broken and re-asserts status we don't know. If this
  // reply is ~the same as any of the last few things we sent, don't parrot it —
  // hand to a human once and stop. Compares against the last 3 assistant turns.
  if (input.channel === 'whatsapp' && cleanedResponse && !needsBookingTools) {
    const recentAssistant = (input.conversationHistory || [])
      .filter((m) => m.role === 'assistant')
      .slice(-3)
      .map((m) => m.content);
    if (recentAssistant.some((prev) => isNearDuplicate(cleanedResponse, prev))) {
      console.warn(`[Engine] ANTI-REPEAT: near-duplicate of a recent reply for "${(input.message || '').slice(0, 60)}" — suppressing the parrot, escalating to a human.`);
      await flagForHumanFollowup(supabase, input, `Repeat-reply guard: "${(input.message || '').slice(0, 120)}"`).catch(() => {});
      cleanedResponse = await composeTeamHandoffLine(supabase, input, brandId);
      lowValueEscalation = true;
    }
  }

  // EMPTY-RESPONSE GUARD: never hand the WhatsApp route an empty reply — it would
  // send the generic "Give me a moment, I'll have someone from the team get in
  // touch" holding line, which repeats turn after turn and reads as broken (the
  // scout kept asking "when will they connect" and got the same robotic line).
  // If the model produced nothing usable, ESCALATE to a human (Slack ping + task
  // via flagForHumanFollowup) and give ONE warm, specific line instead.
  if (!cleanedResponse || !cleanedResponse.trim()) {
    console.warn(`[Engine] Empty response for "${(input.message || '').slice(0, 80)}" — escalating to a human instead of the generic holding line.`);
    await flagForHumanFollowup(supabase, input, `Empty AI response to: "${(input.message || '').slice(0, 120)}"`).catch(() => {});
    cleanedResponse = await composeTeamHandoffLine(supabase, input, brandId);
    lowValueEscalation = true;
  }

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
    escalated: lowValueEscalation,
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
    const brandId = input.brand || getCurrentBrandId();
    const brandConfig = getBrandConfig(brandId);

    // 1. Extract intent — determines which DB calls to make
    const intent = extractIntent(input.message, input.usedButtons);
    // Booking intent: current message OR a CUSTOMER message in the last 6 turns
    // had booking intent. Same scope-down as process() — agent templates
    // contain booking keywords ("demo session confirmed") and would otherwise
    // false-trigger booking-tool mode for follow-up customer messages.
    const recentBookingDiscussion = (input.conversationHistory || [])
      .slice(-6)
      .some((m) => m.role === 'user' && isBookingIntent(m.content));
    const lastAssistantTurn = (input.conversationHistory || [])
      .slice(-4)
      .reverse()
      .find((m) => m.role === 'assistant');
    const midBookingFlow = !!lastAssistantTurn && isBookingFlowStep(lastAssistantTurn.content);
    // Scouts never book — keep booking intent (and thus the booking tools) off
    // entirely for them, same as the WhatsApp path above.
    const isScout = input.lokazenAudience === 'scout';
    // Payment/transaction complaint (any audience) is support, not sales — keep
    // booking off, same as the WhatsApp path. The web path has no escalation block
    // of its own, so raise the support request here too — otherwise the directive
    // makes the reply CLAIM "I've raised a request" while nothing actually fires.
    const paymentSupportIssue = brandId === 'lokazen' && isPaymentComplaint(input.message || '');
    if (paymentSupportIssue) {
      await flagForHumanFollowup(supabase, input, `Payment/transaction issue: "${(input.message || '').slice(0, 160)}"`);
    }
    const lokazenBookingAction = !isScout && !paymentSupportIssue && brandId === 'lokazen' && isLokazenBookingAction(input);
    const hasBookingIntent = !isScout && !paymentSupportIssue &&
      (isBookingIntent(input.message) || recentBookingDiscussion || midBookingFlow || lokazenBookingAction);

    // 2. Parallelize DB calls: KB search always runs (audience-scoped for
    //    Lokazen — see resolveKbScope); booking check only when needed
    const kbScope = resolveKbScope(brandId, input.lokazenAudience);
    const [relevantDocs, existingBookingMessage] = await Promise.all([
      kbScope.skip ? Promise.resolve([]) : searchKnowledgeBase(supabase, input.message, 3, kbScope.category),
      hasBookingIntent ? checkBooking(supabase, input) : Promise.resolve(null),
    ]);
    const knowledgeContext = formatKnowledgeContext(relevantDocs);

    // 3. Build prompt (brand-aware)
    const finalMessage = existingBookingMessage
      ? `[EXISTING BOOKING INFO (internal — do not echo verbatim to the customer): ${existingBookingMessage}

RULES for this turn:
- The customer JUST booked. They know when. Do NOT restate the specific date or time back to them unless they explicitly ask "when is my session?" or similar.
- Acknowledge the booking briefly ("Great, your demo is confirmed." or "All set."), then ask what they need help with.
- If they give a different date/time in this message, that's a reschedule — cancel old + book new immediately, without asking "should I cancel?".]

User's message: ${input.message}`
      : input.message;

    let crossChannelContext = '';
    if (input.adminNotes && input.adminNotes.length > 0) {
      const recentNotes = input.adminNotes.slice(-10);
      crossChannelContext += 'ADMIN NOTES (from team - use these to guide your approach):\n';
      crossChannelContext += recentNotes.map(n => `- ${n.text}`).join('\n');
    }

    // Form data is only needed for booking context
    let formData: Record<string, any> | null = null;
    if (hasBookingIntent && input.userProfile.phone) {
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

    const promptOverride = await getPromptOverride(input.channel);
    let { systemPrompt, userPrompt } = buildPrompt({
      channel: input.channel,
      userName: input.userProfile.name,
      userEmail: input.userProfile.email,
      userPhone: input.userProfile.phone,
      summary: input.summary,
      history: input.conversationHistory,
      knowledgeBase: knowledgeContext,
      message: finalMessage,
      bookingAlreadyScheduled: !!existingBookingMessage,
      messageCount: input.messageCount,
      brand: brandId,
      crossChannelContext: crossChannelContext || undefined,
      promptOverride,
      formData,
    });
    // Lock the model to the resolved audience (see the WhatsApp path above).
    systemPrompt += lokazenAudienceDirective(input, brandId);
    // Payment problem → force the support path, ban the "transaction successful"
    // hallucination (same as the WhatsApp path).
    if (paymentSupportIssue) systemPrompt += paymentSupportDirective();
    // Bare greeting → plain hello back, don't re-open the prior topic (see the
    // WhatsApp path). Appended last so it wins.
    if (isBareGreeting(input.message)) systemPrompt += greetingDirective(input.userProfile.name);
    // Never fabricate payout/submission/verification status (see WhatsApp path).
    if (brandId === 'lokazen') systemPrompt += statusHonestyDirective();
  if (brandId === 'lokazen') systemPrompt += callbackDirective();

    // 4. Generate response — true streaming for conversational messages,
    //    tool-loop for booking messages (tools need a complete back-and-forth)
    let finalResponse = '';

    if (!hasBookingIntent && brandId !== 'lokazen') {
      // True SSE streaming: first Claude token reaches client in ~300-600ms.
      // Greeting strips and em-dash replacements are handled by sanitizeAssistantText
      // in the client after the stream completes.
      for await (const textChunk of streamResponse(systemPrompt, userPrompt, 512)) {
        finalResponse += textChunk;
        yield { type: 'chunk', text: textChunk };
      }
    } else if (!hasBookingIntent) {
      const rawResponse = await generateResponse(systemPrompt, userPrompt, 512, getReasoningModel());
      finalResponse = suppressKnownContactReask(cleanResponse(rawResponse, input.channel), input, brandId);
      finalResponse = advanceLokazenBookingAfterEmail(finalResponse, input, brandId);
      yield { type: 'chunk', text: finalResponse };
    } else {
      // Booking flow: needs tool loop (check_availability → book_consultation)
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
          rawResponse = "Let me connect you with the team directly. They'll reach out shortly.";
        }
      }

      finalResponse = suppressKnownContactReask(cleanResponse(rawResponse), input, brandId);
      finalResponse = advanceLokazenBookingAfterEmail(finalResponse, input, brandId);

      // EMPTY-RESPONSE GUARD: in the tool loop the model sometimes spends its
      // turn on tool calls (update_lead_profile etc.) and returns no visible
      // text, or text that is ONLY [BTN:] markers — the widget then shows an
      // empty bubble and the flow dies (seen live on "Start this plan").
      // Substitute the deterministic next booking question so the flow
      // always moves forward.
      const visibleText = finalResponse.replace(/\[BTN:[^\]]*\]/gi, '').trim();
      if (!visibleText) {
        console.error('[Engine] Empty booking-flow response - substituting deterministic follow-up question.');
        const profileName = input.userProfile?.name?.trim();
        const hasContact = !!(input.userProfile?.email || input.userProfile?.phone);
        finalResponse = !profileName
          ? "Great. Who am I speaking with, and what is the best number or email to reach you?"
          : !hasContact
            ? `Thanks ${profileName.split(' ')[0]}. What is the best number or email to reach you?`
            : 'Great. What day and time works best for a quick call?';
      }
      yield { type: 'chunk', text: finalResponse };
    }

    // 5. Signal completion immediately so the client can show buttons right away.
    //    Follow-ups are generated after and arrive as a late SSE event.
    yield { type: 'done' };

    const followUps = await generateFollowUps({
      channel: input.channel,
      userMessage: input.message,
      assistantMessage: finalResponse,
      messageCount: input.messageCount,
      usedButtons: input.usedButtons || [],
      hasExistingBooking: !!existingBookingMessage,
      exploreButtons: brandConfig.exploreButtons || [],
      brand: brandId,
    });

    yield { type: 'followUps', followUps };

    // Schedule flow tasks (non-blocking — fires after response is sent)
    scheduleFlowTasks(supabase, input, finalResponse).catch(err => {
      console.error('[Engine] Flow task scheduling failed:', err?.message);
    });

  } catch (error: any) {
    // Log the REAL error server-side; getErrorMessage() returns a graceful,
    // visitor-safe string so nothing sensitive or ugly reaches the chat widget.
    console.error('[Engine] processStream error:', error?.message || error);
    yield { type: 'error', error: getErrorMessage(error) };
  }
}

// --- Helper functions ---

function formatKnowledgeContext(docs: KnowledgeResult[]): string {
  if (docs.length === 0) return 'No relevant snippets found.';
  return docs.map((doc, i) => `${i + 1}. ${doc.content}`).join('\n');
}

function suppressKnownContactReask(response: string, input: AgentInput, brandId: string): string {
  if (brandId !== 'lokazen') return response;

  const hasKnownName = Boolean(input.userProfile.name?.trim());
  const hasKnownPhone = Boolean(input.userProfile.phone?.trim());
  if (!hasKnownName && !hasKnownPhone) return response;

  const asksForKnownContact =
    /\bwho should (?:the |our |lokazen )*team contact\b/i.test(response) ||
    /\bshare your name and phone\b/i.test(response) ||
    /\bshare (?:the )?(?:owner )?name and phone\b/i.test(response);
  const asksForPhone =
    /\bwhat(?:'s| is) your phone number\b/i.test(response) ||
    /\byour phone number\b/i.test(response) ||
    /\bshare your phone\b/i.test(response) ||
    /\bbest number to reach you\b/i.test(response) ||
    /\bnumber to reach you\b/i.test(response);

  const recentHistoryText = (input.conversationHistory || [])
    .slice(-6)
    .map((entry) => entry.content)
    .join('\n');
  const isPropertyContactContext =
    asksForKnownContact ||
    /\bwho should (?:the |our |lokazen )*team contact\b/i.test(recentHistoryText) ||
    /\bgoogle maps (?:link |location )?or full address\b/i.test(recentHistoryText) ||
    /\bfull address\b/i.test(recentHistoryText);

  if (!(hasKnownPhone && (asksForKnownContact || asksForPhone) && isPropertyContactContext)) {
    return response;
  }

  return 'What would you like to do next?\n[BTN: Submit Property][BTN: Talk to Team]';
}

/**
 * A hard, per-turn audience lock appended to the Lokazen system prompt. The
 * base prompt carries brand/owner/scout GUIDANCE, but nothing tells the model
 * which flow THIS conversation is in — so it would infer (and drift), e.g.
 * answering a scout's "money debited" with brand/CRE copy, or offering a scout
 * a call. This states the resolved audience outright. No-op for non-lokazen
 * brands or when the audience is unknown (null) — then the base guidance +
 * "ask one question if unsure" rule still applies.
 */
function lokazenAudienceDirective(input: AgentInput, brandId: string): string {
  if (brandId !== 'lokazen' || !input.lokazenAudience) return '';

  if (input.lokazenAudience === 'scout') {
    return `\n\n=================================================================================
CURRENT CONVERSATION AUDIENCE: SCOUT (LOCKED — overrides any inferred flow)
=================================================================================
This person is a Lokazen SCOUT (a gig worker who spots empty "To Let" shops and gets PAID after verification). Apply the SCOUT rules ONLY — never the Brand or Owner flow.
- NEVER offer, suggest, or attempt a call, consultation, demo, or site visit. There is nothing to book for a scout. Never ask "what day/time works for a call" or say "I'll connect you with the team for a call".
- NEVER answer with brand / commercial-real-estate / space-finding / pricing content. That is a different audience.
- If they report ANY problem — money debited / deducted / charged, payment or payout not received, refund, amount cut, "kindly check", KYC stuck, verification, app not working, login, upload / photo / location — treat it as SCOUT SUPPORT: acknowledge briefly, confirm their phone number, and say plainly: "I've raised a support request with the Lokazen team with your number and details, and they'll help you shortly." Do NOT invent troubleshooting steps and do NOT claim the issue is fixed.`;
  }

  const label = input.lokazenAudience === 'brand'
    ? 'BRAND (looking for commercial space)'
    : 'PROPERTY OWNER (listing a space)';
  return `\n\n=================================================================================
CURRENT CONVERSATION AUDIENCE: ${label} (LOCKED)
=================================================================================
Apply the ${input.lokazenAudience.toUpperCase()} flow for this conversation. Do not switch this person into the Scout flow.`;
}

/**
 * Complaint-shaped detector for a payment/transaction problem — money debited but
 * payment failed, amount deducted, double charged, refund not received, etc. Kept
 * deliberately complaint-shaped (needs a fail/debited/deducted/reversed signal, not
 * just the word "payment") so a pricing QUESTION ("what's the fee?", "how do I
 * pay?") never trips it. Applies to every Lokazen audience — owners/brands pay
 * Lokazen, scouts are paid by Lokazen, so all three can hit a payment problem.
 */
function isPaymentComplaint(message: string): boolean {
  return /\b(payment|transaction|txn|amount|money|paisa|rupees?|rs\.?|₹)\b[^.?!]*\b(fail|failed|failing|declin\w*|debited|deducted|cut|reversed|stuck|pending|not received|didn'?t (get|receive)|haven'?t (got|received)|not credited|gone|missing)\b|\b(debited|deducted|chargeback|double.?charged|charged twice|reversed)\b|\bpayment (shows?|is|got|marked|failed)\b|\brefund\b[^.?!]*\b(not|didn'?t|haven'?t|pending|stuck|failed)\b|\b(not|didn'?t|haven'?t)\b[^.?!]*\brefund/i
    .test(message);
}

/**
 * Appended to the system prompt when a payment/transaction problem is detected.
 * Forces the SUPPORT path (no call booking) and bans the "your transaction was
 * successful" hallucination we saw live.
 */
function paymentSupportDirective(): string {
  return `\n\n=================================================================================
PAYMENT / TRANSACTION PROBLEM (LOCKED — this turn is SUPPORT, not sales)
=================================================================================
This person reported a payment or transaction problem (money debited but payment failed, amount deducted, double charged, refund not received, etc.). Handle it as SUPPORT:
- Do NOT offer, suggest, or start a call/consultation/site-visit booking. Never ask "what day/time works for a call". There is nothing to book here.
- Acknowledge the specific issue in one line, confirm the phone number we should use, then say plainly: "I've raised a support request with the Lokazen team with your number and details — they'll check this and get back to you shortly."
- Do NOT claim the payment succeeded, was reversed, or is fixed. Do NOT invent a resolution, a reference number, or a timeline. You are only raising the request.`;
}

/**
 * A message that is ONLY a greeting/opener with no real content — "hey", "hi",
 * "hello", "good morning", "namaste", maybe with a name, "there", or an emoji.
 * After a heavy prior thread (a payment/support issue, a booking), a bare "Hey"
 * is NOT the customer re-raising that topic — it's a fresh hello. We must greet
 * back and let them lead, never re-litigate yesterday's issue or assume urgency.
 */
function isBareGreeting(message: string): boolean {
  const m = (message || '')
    .replace(/[\p{Extended_Pictographic}‍️]/gu, '') // drop emoji
    .replace(/[!.,…?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (!m || m.length > 40) return false;
  return /^(?:hi+|hey+|he+llo+|hii+|helo+|yo+|hola|namaste|namaskar|salaam|assalam(?:u)?\s?alaikum|good\s+(?:morning|afternoon|evening|day)|g'?day|gm|heya|hiya|greetings|sup|wa?ssup|what'?s\s+up)(?:\s+(?:there|team|guys|folks|sir|maam|ma'?am|bro|boss|everyone|all))*$/i.test(m);
}

/**
 * Appended to the system prompt when the customer's latest message is a bare
 * greeting. Overrides the model's pull toward the prior heavy topic so a plain
 * "Hey" gets a plain hello back, not "the team is looking into your payout".
 */
function greetingDirective(name?: string): string {
  const first = name?.trim() ? name.trim().split(/\s+/)[0] : '';
  return `\n\n=================================================================================
BARE GREETING (LOCKED — the customer only said hello)
=================================================================================
The customer's latest message is JUST a greeting — nothing else. Treat it as a fresh hello, NOT a continuation of any earlier topic.
- Reply with ONE short, warm greeting and an open question like "how can I help?" / "what can I do for you today?"${first ? ` Open with their first name (${first}).` : ''}
- Do NOT bring up payments, payouts, submissions, verification, bookings, site visits, or "the team is looking into it" — unless THEY raise it in THIS message. They didn't.
- Do NOT assume anything is important, urgent, or unresolved. Let them tell you what they need. Keep it light and let them lead.`;
}

/**
 * Appended for Lokazen. The model kept fabricating status it has no way to know
 * ("your submission is in the queue for verification", "the team gets back the
 * same day", "they have your number") and re-sending it verbatim. We have NO
 * payout/submission/verification system to read, so any such claim is invented.
 */
function statusHonestyDirective(): string {
  return `\n\n=================================================================================
DO NOT INVENT STATUS (LOCKED)
=================================================================================
You have NO access to any payout, payment, submission, verification, application, KYC, or order system. You do NOT know the live status, queue position, or timeline of any of these — ever.
- NEVER assert or imply a status you cannot see: e.g. "your submission is in the queue for verification", "the team usually gets back the same day", "they have your number", "it's being processed", "you'll hear back by <time>". These are fabrications — do not say them.
- If they ask about status and the team is already handling it: say honestly you don't have the live status in front of you, confirm it's been passed to the Lokazen team, and ask if there's anything specific to add. ONE short line.
- Do NOT re-send a reassurance you already gave. If you've said it once, either add something real or hand it to the team — never repeat the same line.`;
}

/**
 * Appended for Lokazen. Fixes the earlier chaos where the agent invented random
 * slots ("3/4/5 PM") and self-claimed "Booked" (nothing persisted → loop). The
 * real rule: booking window is 11 AM–6 PM IST and every offered time must be at
 * least 90 minutes out. The agent offers valid times but does NOT self-lock —
 * the team confirms and attends. Current time is injected so slots are valid.
 */
function callbackDirective(): string {
  const now = new Date();
  const opts: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true };
  const istNow = now.toLocaleTimeString('en-IN', opts);
  const earliest = new Date(now.getTime() + 90 * 60_000).toLocaleTimeString('en-IN', opts);
  const istHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }).format(now));
  const todayNote = istHour >= 16
    ? `It's late — the earliest valid time (${earliest}) may be past 6 PM. If so, offer times TOMORROW, 11 AM–6 PM.`
    : `Offer 2–3 concrete times today between ${earliest} and 6:00 PM.`;
  return `\n\n=================================================================================
LOKAZEN CALL / SITE-VISIT TIMING (LOCKED)
=================================================================================
The booking window is FIXED: 11:00 AM to 6:00 PM IST, and every time you offer must be at least 90 minutes from now. It is currently ${istNow} IST, so the earliest time you may offer is ${earliest} IST.
- ${todayNote}
- NEVER offer a time outside 11:00 AM–6:00 PM IST, and never sooner than 90 minutes from now.
- You do NOT self-lock bookings. Once they pick a time, confirm it in ONE line and say the Lokazen team will confirm and be there — do NOT say "Booked/locked/set" as if the system confirmed it, and do NOT re-open scheduling afterwards.
- If they only want a phone callback, no slot is needed — say the team will call them, once, and stop.`;
}

/** Normalize for near-duplicate detection: lowercase, collapse to word tokens. */
function normalizeForCompare(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * True when `a` is essentially the same message as `b` — identical after
 * normalization, or ≥80% token overlap (Jaccard). Catches the "same payout line
 * sent to both 'Hey' and 'Yes'" parrot loop.
 */
function isNearDuplicate(a: string, b: string): boolean {
  const na = normalizeForCompare(a);
  const nb = normalizeForCompare(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ta = new Set(na.split(' '));
  const tb = new Set(nb.split(' '));
  if (ta.size < 4 || tb.size < 4) return false; // too short to judge
  let inter = 0;
  ta.forEach((t) => { if (tb.has(t)) inter++; });
  const union = ta.size + tb.size - inter;
  return union > 0 && inter / union >= 0.8;
}

/**
 * A warm, CONTEXTUAL "the team is on it" line for the escalation fallbacks
 * (empty AI reply / anti-repeat). Replaces the fixed canned strings that fired
 * verbatim turn after turn ("Thanks for bearing with me — I've flagged this to
 * our team…" sent to both "Any updates??" and "call me back"). It:
 *   - greets by first name,
 *   - names what they're actually about (their property area/type, pulled from
 *     the lead's stored context — e.g. "your Jainagar property"),
 *   - offers a callback,
 *   - and picks a phrasing that ISN'T a near-duplicate of what we just said, so
 *     a second/third escalation never parrots the first.
 */
async function composeTeamHandoffLine(
  supabase: SupabaseClient,
  input: AgentInput,
  brandId: string,
): Promise<string> {
  const first = input.userProfile.name?.trim()?.split(/\s+/)[0] || '';
  const hi = first ? `Hi ${first}, ` : '';

  // Best-effort: what are they about? Area/type from their stored context.
  let about = '';
  try {
    const digits = (input.userProfile.phone || '').replace(/\D/g, '').slice(-10);
    if (digits) {
      const { data: lead } = await supabase
        .from('all_leads').select('unified_context')
        .eq('customer_phone_normalized', digits).maybeSingle();
      const lkz = (lead as any)?.unified_context?.[brandId] || {};
      const area = String(lkz.property_zone || lkz.property_area || lkz.area || lkz.locality || '').trim();
      const type = String(lkz.property_type || '').trim();
      about = area ? `your ${area} property` : type ? `your ${type.toLowerCase()} requirement` : '';
    }
  } catch { /* non-critical — fall back to a generic reference */ }
  const on = about ? ` on ${about}` : '';
  const ref = about || 'this';

  // Three phrasings so repeats never read identically; pick the first that
  // isn't a near-duplicate of a recent assistant turn.
  const lines = [
    `${hi}our team is already working on ${ref}. Want someone from the team to call you back?`,
    `${hi}the team has your number and details${on} — I'll make sure they call you back. What time works best for you?`,
    `${hi}I've passed this to the team${on} and they have your number; they'll reach out directly. Anything you'd like me to add for them?`,
  ];
  const recent = (input.conversationHistory || [])
    .filter((m) => m.role === 'assistant').slice(-4).map((m) => m.content);
  return lines.find((l) => !recent.some((r) => isNearDuplicate(l, r))) || lines[0];
}

function isLokazenBookingAction(input: AgentInput): boolean {
  const current = (input.message || '').toLowerCase();
  const buttons = (input.usedButtons || []).map((b) => String(b).toLowerCase());
  const text = [current, ...buttons].join(' ');
  const lastAssistant = (input.conversationHistory || [])
    .slice(-4)
    .reverse()
    .find((m) => m.role === 'assistant')?.content || '';

  return (
    /\b(start this plan|talk to (?:the |lokazen )?team|book a call|schedule a call|site visit)\b/i.test(text) ||
    isBookingFlowStep(lastAssistant)
  );
}

function advanceLokazenBookingAfterEmail(response: string, input: AgentInput, brandId: string): string {
  if (brandId !== 'lokazen') return response;
  // Scouts never book — never rewrite a scout's reply into "what day/time works
  // for a call". Their "team will reach out" line is the support-request
  // confirmation, not a booking punt.
  if (input.lokazenAudience === 'scout') return response;

  const userMessage = input.message || '';
  const emailProvided = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userMessage.trim());
  if (!emailProvided) return response;

  const lastAssistant = (input.conversationHistory || [])
    .slice(-4)
    .reverse()
    .find((m) => m.role === 'assistant')?.content || '';
  const askedForEmail = /\b(best|your|what'?s the best)\s+email\b/i.test(lastAssistant) ||
    /\bemail\b[^.?!]*\b(reach|send|invite|calendar)\b/i.test(lastAssistant) ||
    /\b(reach|send|invite|calendar)\b[^.?!]*\bemail\b/i.test(lastAssistant);
  if (!askedForEmail) return response;

  const puntsToTeam = /\b(team|we|lokazen)\b[^.?!]*(reach out|call you|schedule|confirm)/i.test(response) ||
    /\bwill reach out\b/i.test(response);
  const asksForSlot = /\b(date|day|time|slot|when works|what works)\b/i.test(response);

  if (!puntsToTeam || asksForSlot) return response;

  const name = input.userProfile.name?.trim();
  const greeting = name ? `Got it, ${name.split(/\s+/)[0]}.` : 'Got it.';
  return `${greeting} What day and time works best for a quick Lokazen call?`;
}

function stripCapturedDetailWrapper(raw: string): string {
  const text = raw.trim();
  const lines = text.split(/\r?\n/);
  const separatorIndex = lines.findIndex((line, index) => {
    if (index === 0) return false;
    const trimmed = line.trim();
    return /^-{2,}$/.test(trimmed) || /^—{2,}$/.test(trimmed) || /^–{2,}$/.test(trimmed);
  });

  if (separatorIndex < 0 || separatorIndex > 5) {
    return raw;
  }

  const prefix = lines.slice(0, separatorIndex).join('\n');
  const hasUserLabel = /^\s*(?:User|Customer|Lead)\s*:/im.test(prefix);
  const hasQuestion = /\?\s*(?:\n|$)/.test(prefix);
  const remaining = lines.slice(separatorIndex + 1).join('\n').trim();

  if (hasUserLabel && hasQuestion && remaining) {
    return remaining;
  }

  return raw;
}

function cleanResponse(raw: string, channel?: string): string {
  let cleaned = raw
    .replace(/^\s*(?:User|Customer|Lead)\s*:\s*[^\n]+\n-{2,}\s*/i, '')
    .replace(/^(Hi there!|Hello!|Hey!|Hi!)\s*/gi, '')
    .replace(/^(Hi|Hello|Hey),?\s*/gi, '')
    .replace(/\[BUTTONS:[^\]]*\]/gi, '')
    // Tool-call leak guard: when Claude fails to actually invoke a tool
    // and instead types the call signature as text (e.g. "Let me check
    // today's slots for you. check_availability(2026-05-21)"), the
    // customer sees raw function syntax on WhatsApp. Strip every known
    // tool name followed by an arg list — and any "Let me check ..."
    // preamble that's left dangling without a tool result. Add new tool
    // names here whenever buildBookingTools / future engines gain one.
    .replace(/\b(check_availability|book_consultation)\s*\([^)]*\)\.?/gi, '')
    .replace(/\b(check_availability|book_consultation)\b/gi, '')
    // Tool-arg JSON leak guard: Claude sometimes prints the book_consultation
    // arguments as a raw JSON blob instead of invoking the tool, e.g.
    // '{ "date": "2026-06-01", "time": "3:00 PM", "session_type": "online", ... }'.
    // Strip any {...} object carrying booking-arg keys so the customer never
    // sees raw JSON in the chat.
    .replace(/\{[^{}]*"(?:session_type|first_name|course_interest)"[^{}]*\}/gi, '')
    .replace(/\{[^{}]*"date"\s*:\s*"?\d{4}-\d{2}-\d{2}[^{}]*\}/gi, '')
    // Bare tool-arg leak: sometimes the args print as plain lines rather than
    // JSON, e.g. a trailing "2026-05-31\nonline". Strip a standalone ISO-date
    // line and a standalone session-type line so they never reach the customer.
    .replace(/^[ \t]*\d{4}-\d{2}-\d{2}[ \t]*$/gim, '')
    .replace(/^[ \t]*(?:online|offline)[ \t]*$/gim, '')
    .replace(/\[?\s*(?:calling|checking)\s+(?:for\s+)?\d{4}-\d{2}-\d{2}\s*\]?\.?/gi, '')
    .replace(/Let me check (today's|tomorrow's|the) (slots|availability|times?|calendar)( for you)?\.?\s*$/gi, '')
    // Internal-narration leak guard: the model sometimes verbalises its own
    // flow instructions before the actual reply, e.g.
    //   'User selected "Immediately". moving to Step 8.\n--\nHow we work: ...'
    // Strip step-narration lines and any leftover '--' separator lines so the
    // customer never sees the prompt's internals.
    .replace(/^[ \t]*(?:the\s+)?user (?:selected|said|chose|clicked)[^\n]*$/gim, '')
    .replace(/^[ \t]*[^\n]*\bmov(?:e|ing) (?:on\s+)?to step\s*\d+[^\n]*$/gim, '')
    .replace(/^[ \t]*(?:proceeding|continuing|going)\s+to step\s*\d+[^\n]*$/gim, '')
    .replace(/^[ \t]*(?:step\s+\d+[a-z]?\s*:)?[ \t]*-{2,}[ \t]*$/gim, '')
    .trim();

  cleaned = stripCapturedDetailWrapper(cleaned).trim();

  // Hard guard: never emit em/en dashes in user-facing responses.
  // Replace with a sentence break ('. ') rather than a hyphen — using '-'
  // produced glued-together output like "Happy to help-what aspect..." when
  // the model wrote "Happy to help — what aspect...". The post-processor
  // also normalises any accidental " - " spacing left over from old training
  // habits into a proper sentence break, then collapses any double spaces /
  // ". ." artefacts the regexes might leave behind.
  cleaned = cleaned
    .replace(/\s*[—–]\s*/g, '. ')
    .replace(/\.[ \t]*\./g, '.')
    // Collapse runs of spaces/tabs only — do NOT touch newlines, or multi-
    // paragraph replies (\n\n between paragraphs) get flattened into one block.
    .replace(/[ \t]{2,}/g, ' ')
    // Tidy spaces left hanging at line ends after the strips above.
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');

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

/** "5:00 PM" or "17:00" → "17:00" (24h). */
function bookingTo24(s: string): string {
  const ampm = (s || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const p = ampm[3].toUpperCase();
    if (p === 'PM' && h !== 12) h += 12;
    if (p === 'AM' && h === 12) h = 0;
    return `${h.toString().padStart(2, '0')}:${ampm[2]}`;
  }
  const hm = (s || '').trim().match(/^(\d{1,2}):(\d{2})/);
  return hm ? `${hm[1].padStart(2, '0')}:${hm[2]}` : (s || '').trim();
}
/** "17:00" → "5:00 PM". */
function bookingTo12(hhmm: string): string {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return hhmm;
  const h = parseInt(m[1], 10);
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
}

async function checkBooking(supabase: SupabaseClient, input: AgentInput): Promise<string | null> {
  // NOT gated on booking-intent: a customer with a booking who is frustrated
  // ("call now", "it's 6:30") rarely uses booking keywords, yet the agent must
  // still know their slot — and crucially whether it has already passed.
  const phone = input.userProfile.phone;
  if (!phone) return null;

  try {
    const normalizedPhone = phone.replace(/\D/g, '').slice(-10);
    const { data } = await supabase
      .from('all_leads')
      .select('unified_context')
      .eq('customer_phone_normalized', normalizedPhone)
      .maybeSingle();

    // Look across ALL channels (web-only missed every WhatsApp/voice booking).
    const uc = data?.unified_context || {};
    let bDate: string | null = null;
    let bTime: string | null = null;
    for (const ch of ['web', 'whatsapp', 'voice', 'social']) {
      const c = uc[ch] || {};
      const d = c.booking_date || c?.booking?.date;
      const t = c.booking_time || c?.booking?.time;
      if (d && t) { bDate = String(d); bTime = String(t); break; }
    }
    if (!bDate || !bTime) return null;

    // Compare the booked moment against NOW, both as IST wall-clock strings.
    const t24 = bookingTo24(bTime);
    const nowDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const nowHM = new Date().toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
    const isPast = `${bDate}T${t24}` < `${nowDate}T${nowHM}`;
    const isToday = bDate === nowDate;
    const whenLabel = isToday
      ? 'today'
      : new Date(bDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const display = bookingTo12(t24);
    const nowDisplay = bookingTo12(nowHM);

    if (isPast) {
      return `The customer's booking was for ${whenLabel} at ${display}, but that time has ALREADY PASSED — it is now ${nowDisplay} IST. The scheduled call has not happened. Do NOT promise a call at ${display}; apologise and offer the next slot or a team callback.`;
    }
    return `The customer has an UPCOMING booking for ${whenLabel} at ${display} (it is now ${nowDisplay} IST).`;
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
  // "talk to the team" / "connect with the team" / "talk to Lokazen team" — a
  // team handoff. Route it to a real human handoff (Slack ping) instead of the
  // AI trying to negotiate a booking time (which loops). The team confirms.
  /\b(?:talk|speak|chat)\s+(?:to|with)\s+(?:(?:the|lokazen|your)\s+){0,2}team\b/i,
  /\bconnect\s+(?:me\s+)?(?:to|with)\s+(?:(?:the|lokazen|your)\s+){0,2}team\b/i,
  /\b(?:reach|contact|get\s+me\s+to)\s+(?:(?:the|lokazen|your)\s+){0,2}team\b/i,
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
// Minimal HTML escape for Telegram's parse_mode=HTML.
function escapeHtmlTg(text: string | null | undefined): string {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Ping the team's Telegram group (TELEGRAM_ADMIN_CHAT_ID) via the brand's bot.
 * No-op — returns {sent:false} — for any brand that hasn't set both env vars, so
 * this never throws or bleeds a message to the wrong brand's group.
 */
async function sendTelegramAlert(text: string): Promise<{ sent: boolean; error?: string }> {
  const token = ENV.TELEGRAM_BOT_TOKEN;
  const chatId = ENV.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !chatId) return { sent: false };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    if (!res.ok) return { sent: false, error: `${res.status} ${await res.text()}` };
    return { sent: true };
  } catch (e: any) {
    return { sent: false, error: e?.message || String(e) };
  }
}

async function flagForHumanFollowup(
  supabase: SupabaseClient,
  input: AgentInput,
  reason: string
): Promise<void> {
  try {
    const phone = input.userProfile.phone;
    if (!phone) return;

    const normalizedPhone = phone.replace(/\D/g, '').slice(-10);

    // Fetch the lead (customer_name + unified_context so the Slack alert can
    // name the BUSINESS, e.g. "NG Ventures", not just the person — the team
    // identifies a lead by its business/brand, not the contact's first name).
    const { data: lead } = await supabase
      .from('all_leads')
      .select('id, customer_name, metadata, unified_context')
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

    // Slack "needs a human" alert (no-op unless SLACK_WEBHOOK_URL is set).
    let brandLabel = 'PROXe';
    try { brandLabel = getBrandConfig()?.name || getCurrentBrandId() || 'PROXe'; } catch { /* keep default */ }
    const audienceLabel =
      input.lokazenAudience === 'brand' ? 'Brand'
      : input.lokazenAudience === 'owner' ? 'Property Owner'
      : input.lokazenAudience === 'scout' ? 'Scout'
      : null;
    // Scouts can't book a call — their escalations are SUPPORT requests, so the
    // channel reads "Scout support request" (with the number + issue) rather than
    // a generic lead follow-up.
    const isScout = input.lokazenAudience === 'scout';
    const appUrl = ENV.NEXT_PUBLIC_APP_URL || 'https://proxe.lokazen.in';
    const title = isScout ? 'Scout support request' : 'Needs human follow-up';

    // Show just the lead's own name (e.g. "Arbaaz Khan") — nothing else. An
    // earlier version prepended a guessed "business name" which mis-attached an
    // unrelated value to the contact and duplicated the @mention handle. The
    // @mention (SLACK_MENTION_USER_ID) is the ping; the name is just the lead.
    const displayName = input.userProfile.name || (lead as any).customer_name || null;
    let slackResult: { success: boolean; skipped?: boolean; error?: string };
    if (slackBotConfigured()) {
      // INTERACTIVE app: post via bot token so the message carries Resolved /
      // Reopen buttons AND a thread the team can reply in (→ WhatsApp the lead).
      const blocks = leadAlertBlocks({
        brandLabel, leadId: lead.id, title,
        name: displayName, leadType: audienceLabel,
        phone: input.userProfile.phone || null, detail: reason,
        footer: isScout ? 'scout support · reach out on the number above' : 'needs human',
        dashboardUrl: `${appUrl}/dashboard/inbox?lead=${lead.id}`, reply: true,
      });
      const posted = await slackPostMessage({ text: `${title} · ${brandLabel}: ${displayName || input.userProfile.phone || 'Lead'}`, blocks });
      slackResult = { success: posted.ok, skipped: false, error: posted.error };
      // Store the Slack thread ts on the lead so a reply in that thread maps back
      // to this customer's WhatsApp (see /api/integrations/slack/events).
      if (posted.ok && posted.ts) {
        await supabase.from('all_leads').update({
          metadata: { ...(lead.metadata || {}), human_followup_reason: reason, human_followup_at: new Date().toISOString(), slack_channel: posted.channel, slack_ts: posted.ts },
        }).eq('id', lead.id).then(() => {}, () => {});
      }
    } else {
      // Fallback: incoming webhook (one-way, URL buttons only).
      slackResult = await notifySlackLead({
        brandLabel, title,
        name: displayName,
        phone: input.userProfile.phone || null,
        email: input.userProfile.email || null,
        leadType: audienceLabel,
        source: input.channel || null,
        detail: reason,
        leadUrl: `${appUrl}/dashboard/inbox?lead=${lead.id}`,
        footer: isScout ? 'scout support · reach out on the number above' : 'needs human',
        actions: [{ text: 'View lead in dashboard', url: `${appUrl}/dashboard/inbox?lead=${lead.id}`, style: 'primary' }],
      });
    }
    // notifySlackLead soft-fails SILENTLY (no log at all) when SLACK_WEBHOOK_URL
    // isn't set — the AI tells the person "I've raised a support request" and
    // the DB flag is real, but the team never actually gets pinged, with zero
    // trace of that gap anywhere. Log the real outcome so a missing/broken
    // webhook is visible instead of assumed from the conversational claim.
    if (slackResult.skipped) {
      console.warn(`[Engine] Slack alert SKIPPED for lead ${lead.id} (SLACK_WEBHOOK_URL not set) — "${reason}" was NOT sent to the team.`);
    } else if (!slackResult.success) {
      console.error(`[Engine] Slack alert FAILED for lead ${lead.id}: ${slackResult.error || 'unknown error'} — "${reason}" was NOT sent to the team.`);
    } else {
      console.log(`[Engine] Slack alert sent for lead ${lead.id}: "${reason}"`);
    }

    // Telegram team-group alert (no-op unless TELEGRAM_BOT_TOKEN + _ADMIN_CHAT_ID
    // are set for this brand). Mirrors the Slack ping so the team gets pinged on
    // their Telegram group and a human can jump in — e.g. a booking the agent
    // couldn't lock ("passed to our team"). Fire-and-soft-fail.
    const tgText =
      `🔔 <b>${escapeHtmlTg(title)}</b> · ${escapeHtmlTg(brandLabel)}\n` +
      `${escapeHtmlTg(displayName || 'Lead')} · ${escapeHtmlTg(input.userProfile.phone || '')}\n` +
      `${escapeHtmlTg(reason)}\n` +
      `${appUrl}/dashboard/inbox?lead=${lead.id}`;
    const tg = await sendTelegramAlert(tgText);
    if (tg.sent) console.log(`[Engine] Telegram alert sent for lead ${lead.id}: "${reason}"`);
    else if (tg.error) console.error(`[Engine] Telegram alert FAILED for lead ${lead.id}: ${tg.error}`);

    // Create a real TASK so the handoff/support request is visible + actionable
    // on the Tasks page, not just a Slack ping + a flag. De-duped: skip if this
    // lead already has an open human-followup task. (No-op / soft-fail if the
    // brand's Supabase lacks the agent_tasks table — see migration 002.)
    try {
      let brandId2 = 'lokazen';
      try { brandId2 = getCurrentBrandId() || 'lokazen'; } catch { /* keep default */ }
      const taskType = isScout ? 'scout_support' : 'human_followup';
      const { data: openTask } = await supabase
        .from('agent_tasks')
        .select('id')
        .eq('lead_id', lead.id)
        .eq('task_type', taskType)
        .in('status', ['pending', 'queued', 'awaiting_approval'])
        .limit(1);
      if (!openTask || openTask.length === 0) {
        const { error: taskErr } = await supabase.from('agent_tasks').insert({
          brand: brandId2,
          lead_id: lead.id,
          lead_name: input.userProfile.name || null,
          lead_phone: input.userProfile.phone || null,
          task_type: taskType,
          task_description: reason,
          status: 'pending',
          metadata: { audience: audienceLabel, channel: input.channel || null, source: 'flagForHumanFollowup' },
          created_at: new Date().toISOString(),
        });
        if (taskErr) console.warn(`[Engine] Could not create ${taskType} task for lead ${lead.id}: ${taskErr.message}`);
        else console.log(`[Engine] Created ${taskType} task for lead ${lead.id}`);
      }
    } catch (taskEx: any) {
      console.warn('[Engine] Task creation for human follow-up failed:', taskEx?.message || taskEx);
    }
  } catch (err) {
    console.error('[Engine] Failed to flag for human follow-up:', err);
  }
}

// ─── WhatsApp Booking Tools ──────────────────────────────────────────────────

function buildBookingTools(
  input: AgentInput,
  supabase: SupabaseClient
): {
  tools: ToolDefinition[];
  toolHandlers: Record<string, ToolHandler>;
  /** Exposed so callers can detect "agent claimed booking without firing tool" hallucinations after generation. */
  bookingsCompletedThisSession: Set<string>;
  /**
   * The result of the LAST check_availability call this turn. Lets the caller
   * deterministically strip any time-slot button the LLM offers that is NOT
   * actually open (the model sometimes parrots the prompt's example menu of
   * 3:00/4:00/5:00 instead of the tool's filtered list).
   */
  availabilityRef: { current: { date: string; availableTimes: string[] } | null };
} {

  // Track bookings completed in this tool session to prevent re-detection loops
  const bookingsCompletedThisSession = new Set<string>();
  // Last check_availability snapshot (date + display times that are actually open).
  const availabilityRef: { current: { date: string; availableTimes: string[] } | null } = { current: null };

  const tools: ToolDefinition[] = [
    {
      name: 'check_availability',
      description: 'Check available consultation time slots for a specific date. Returns only future slots. For "today", any slot earlier than now + 60 minutes is automatically filtered out by the server, so never propose those yourself. If the tool returns an empty list for today, ask the user about tomorrow or another upcoming date rather than silently switching the date.',
      input_schema: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'The date to check in YYYY-MM-DD format. Must be today or a future date.',
          },
          session_type: {
            type: 'string',
            enum: ['online', 'offline'],
            description: 'Session format. Online slots are Monday-Saturday at 3:00 PM, 4:00 PM, or 5:00 PM only. Offline slots run Monday-Saturday from 11:00 AM to 7:00 PM. Default to online unless the user explicitly asks for an offline/facility/campus visit.',
          },
        },
        required: ['date'],
      },
    },
    {
      name: 'book_consultation',
      description: 'Book a consultation call. Use ONLY after: (1) confirming date and time with the user, (2) having the user name, (3) verifying the exact slot is available via check_availability for the same session_type. Email is optional. You MUST generate a specific call title based on the conversation context.',
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
            description: 'Phone number of the person booking. Optional: web users usually book with an email instead — provide whichever contact you have (phone OR email), not necessarily both.',
          },
          title: {
            type: 'string',
            description: 'AI-generated call title based on discussion. Format: "[Topic/Solution] - [Brand Name]". Examples: "AI Lead Qualification for Meta Ads - Acme Corp", "Online Customer Acquisition - Fresh Foods". Never use generic titles.',
          },
          course_interest: {
            type: 'string',
            enum: ['pilot', 'helicopter', 'cabin', 'general'],
            description: 'Which training program they are interested in',
          },
          session_type: {
            type: 'string',
            enum: ['online', 'offline'],
            description: 'Use online unless the user explicitly asks for offline, in-person, campus, or facility visit.',
          },
        },
        required: ['date', 'time', 'name', 'title'],
      },
    },
    {
      name: 'cancel_booking',
      description: "Cancel / remove this lead's EXISTING booked session. Call when the customer asks to cancel, says they can't make it, wants to undo a booking, or clearly declines a session that was already booked. Deletes the calendar event and stops the reminder messages. Do NOT use this to book — only to cancel.",
      input_schema: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Short reason for cancelling, if the user gave one' },
        },
        required: [],
      },
    },
    {
      name: 'update_lead_profile',
      description: 'Save lead profile details whenever the user shares personal, business, OR commercial-property information. Call IMMEDIATELY when the user mentions their name, email, city, company/brand, business type, website URL — and (Lokazen) whenever a property OWNER shares any listing detail (property type, size in sqft, rent, floor, deposit/advance/lock-in terms, availability, area/locality, or a Google Maps link) or a BRAND shares their space requirement. Capture these even mid-conversation and across several messages — call it each time a new detail appears. Only include fields explicitly shared - never guess.',
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
          property_type: {
            type: 'string',
            description: 'Lokazen only: kind of commercial property the OWNER is listing (e.g. "shop", "showroom", "office", "cloud kitchen").',
          },
          property_size_sqft: {
            type: 'string',
            description: 'Lokazen: property/space size in sq ft (e.g. "950").',
          },
          monthly_rent: {
            type: 'string',
            description: 'Lokazen: monthly rent the owner is asking OR the brand\'s rent budget (e.g. "1.5 lakh", "₹90k").',
          },
          floor: {
            type: 'string',
            description: 'Lokazen: which floor the space is on (e.g. "ground", "1st + 2nd").',
          },
          deposit_or_terms: {
            type: 'string',
            description: 'Lokazen: deposit / advance / lock-in / other commercial terms (e.g. "6 months advance, 3-year lock-in, no bargain").',
          },
          availability: {
            type: 'string',
            description: 'Lokazen: when the space is available / possession timing.',
          },
          area_locality: {
            type: 'string',
            description: 'Lokazen: area / locality / micro-market of the property or requirement (e.g. "BH Road, Nelamangala").',
          },
          maps_url: {
            type: 'string',
            description: 'Lokazen: a Google Maps link the user shared for the property.',
          },
        },
        required: [],
      },
    },
  ];

  // Scouts can NEVER book a call — there is nothing to schedule for a scout, and
  // their issues go through a support request, not a call. Hard-refuse both
  // booking tools regardless of what the model attempts.
  const scoutBookingBlock = () =>
    JSON.stringify({
      error: 'This is a Scout conversation. Scouts cannot book a call — do NOT offer or book one. If the scout has a problem, raise a support request for the team instead.',
    });

  const toolHandlers: Record<string, ToolHandler> = {
    check_availability: async (toolInput: Record<string, any>) => {
      if (input.lokazenAudience === 'scout') return scoutBookingBlock();
      const { date } = toolInput;
      const sessionType = normalizeBookingSessionType(toolInput.session_type);

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

      const slots = await getAvailableSlots(date, sessionType);
      let availableSlots = slots.filter(s => s.available);

      // For TODAY: drop any slot earlier than (now + 60 min) so we never
      // offer a slot that feels rushed or operationally unrealistic.
      // The slot's `time24` is the start time in IST 24h ("HH:MM").
      const isToday = date === todayIST;
      if (isToday) {
        const nowHHMM_IST = new Date().toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: 'Asia/Kolkata',
        });
        const [nowH, nowM] = nowHHMM_IST.split(':').map(Number);
        const nowPlus60Mins = nowH * 60 + nowM + 60;
        availableSlots = availableSlots.filter((s) => {
          const [sh, sm] = s.time24.split(':').map(Number);
          return sh * 60 + sm >= nowPlus60Mins;
        });
      }

      if (availableSlots.length === 0) {
        availabilityRef.current = { date, availableTimes: [] };
        return JSON.stringify({
          available_slots: [],
          message: isToday
            ? 'No more slots available today. Ask the user if they would like tomorrow or another upcoming date — do NOT silently switch the date for them.'
            : `No slots available on ${date}. Suggest the user try a different date.`,
        });
      }

      // Record what's actually open for THIS date so the caller can strip any
      // booked slot the LLM still tries to offer as a button.
      availabilityRef.current = {
        date,
        availableTimes: availableSlots.map(s => s.time),
      };

      return JSON.stringify({
        date,
        session_type: sessionType,
        booking_window: sessionType === 'offline'
          ? 'Offline sessions are available Monday-Saturday, 11:00 AM-7:00 PM IST.'
          : 'Online sessions are Monday-Saturday at 3:00 PM, 4:00 PM, or 5:00 PM IST.',
        available_slots: availableSlots.map(s => ({
          time: s.time,
          time24: s.time24,
        })),
        total_available: availableSlots.length,
      });
    },

    book_consultation: async (toolInput: Record<string, any>) => {
      if (input.lokazenAudience === 'scout') return scoutBookingBlock();
      const { date, time, name, email, phone, course_interest, title } = toolInput;
      const sessionType = normalizeBookingSessionType(toolInput.session_type);

      const bookingPhone = phone || input.userProfile.phone || '';
      const bookingName = name || input.userProfile.name || 'Web Visitor';
      const bookingEmail = email || input.userProfile.email || '';
      const bookingTitle = title || `AI Strategy Call - ${bookingName}`;

      // Need at least phone or email to identify the booking
      if (!bookingPhone && !bookingEmail) {
        return JSON.stringify({
          success: false,
          error: 'Cannot lock the slot without a phone number or email address. Use the KNOWN CONTACT block in the system prompt to identify which contact fields are still missing for this user, then ask for ONLY those fields.',
        });
      }

      if (!isAllowedBookingTime(time, sessionType)) {
        return JSON.stringify({
          success: false,
          error: sessionType === 'offline'
            ? 'That time is outside offline booking hours. Offline sessions are Monday-Saturday, 11:00 AM-7:00 PM IST. Check availability again and offer only returned slots.'
            : 'That time is outside online booking hours. Online sessions are Monday-Saturday at 3:00 PM, 4:00 PM, or 5:00 PM IST. Check availability again and offer only returned slots.',
        });
      }

      const currentSlots = await getAvailableSlots(date, sessionType);
      const normSlot = (t: string) => String(t || '').trim().toLowerCase().replace(/\s+/g, '');
      const requestedSlot = currentSlots.find(
        (slot) => slot.time === time || slot.time24 === time
          || normSlot(slot.time) === normSlot(time) || normSlot(slot.time24) === normSlot(time),
      );
      // Only block a GENUINE conflict: the slot was found AND is already taken.
      // A slot we could not match (e.g. the model sent "3 PM" while the list has
      // "3:00 PM") already passed isAllowedBookingTime above, so it is a legit
      // slot — let it through and register the booking instead of failing, which
      // is what left leads unbooked and looping on the same slot forever.
      if (requestedSlot && !requestedSlot.available) {
        return JSON.stringify({
          success: false,
          error: 'That exact slot is already taken. Check availability again and offer only the returned open slots.',
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
          sessionType,
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
            sessionType,
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

      // Slack notification (no-op unless SLACK_WEBHOOK_URL is set for this
      // deployment). Awaited on purpose — we're still inside the tool handler,
      // so Vercel won't drop it, and it soft-fails so Slack never blocks a
      // booking. Lead type comes from the resolved Lokazen audience.
      try {
        const audienceLabel =
          input.lokazenAudience === 'brand' ? 'Brand'
          : input.lokazenAudience === 'owner' ? 'Property Owner'
          : input.lokazenAudience === 'scout' ? 'Scout'
          : null;
        let brandLabel = 'PROXe';
        try { brandLabel = getBrandConfig()?.name || getCurrentBrandId() || 'PROXe'; } catch { /* keep default */ }
        await notifySlackBooking({
          brandLabel,
          name: bookingName,
          phone: bookingPhone,
          email: bookingEmail || null,
          leadType: audienceLabel,
          dateTime: `${date} · ${time}`,
          title: bookingTitle,
          channel: input.channel || null,
          summary: input.summary || null,
        });
      } catch (slackErr: any) {
        console.error('[Engine] Slack booking notify failed:', slackErr?.message || slackErr);
      }

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

      // Canonical human date label (IST) so the confirmation matches the booked
      // date exactly — the model must echo THIS, never restate a day from memory.
      const dateLabel = (() => {
        try {
          const d = new Date(`${date}T12:00:00+05:30`);
          return isNaN(d.getTime())
            ? date
            : d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });
        } catch {
          return date;
        }
      })();

      return JSON.stringify({
        success: true,
        date,
        date_label: dateLabel,
        time,
        name: bookingName,
        title: bookingTitle,
        session_type: sessionType,
        google_event_created: !!calendarResult,
        meet_link: calendarResult?.meetLink || null,
        message: `Booking confirmed for ${bookingName} on ${dateLabel} at ${time}. Send EXACTLY ONE confirmation to the user using this exact date ("${dateLabel}") and time — do NOT restate a different day. STOP: do not call any more tools, and do not repeat this confirmation in any later message.`,
      });
    },

    cancel_booking: async () => {
      const phone = input.userProfile.phone || '';
      const norm = phone.replace(/\D/g, '').slice(-10);
      if (!norm) {
        return JSON.stringify({ success: false, error: 'No phone on file to identify the booking.' });
      }
      const { data: lead } = await supabase
        .from('all_leads')
        .select('id')
        .eq('customer_phone_normalized', norm)
        .maybeSingle();
      if (!lead) {
        return JSON.stringify({ success: false, error: 'No matching lead found to cancel.' });
      }
      try {
        const res = await cancelBooking(lead.id, supabase);
        if (!res.ok) return JSON.stringify({ success: false, error: res.error || 'Cancel failed' });
        return JSON.stringify({
          success: true,
          message: 'Booking cancelled — calendar event removed and reminders stopped. Tell the user their session is cancelled and offer to rebook whenever they like. Do NOT claim a new booking.',
        });
      } catch (e: any) {
        return JSON.stringify({ success: false, error: e?.message || 'Cancel failed' });
      }
    },

    update_lead_profile: async (toolInput: Record<string, any>) => {
      const { full_name, email, city, company, business_type, website_url, notes } = toolInput;
      // Lokazen commercial-property details (owner listings / brand requirements).
      const { property_type, property_size_sqft, monthly_rent, floor, deposit_or_terms, availability, area_locality, maps_url } = toolInput;
      const hasPropertyDetail = !!(property_type || property_size_sqft || monthly_rent || floor || deposit_or_terms || availability || area_locality || maps_url);

      if (!full_name && !email && !city && !company && !business_type && !website_url && !notes && !hasPropertyDetail) {
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

        // Lokazen: store commercial-property details in the brand namespace using
        // the SAME field names the inbound-form path writes, so an owner who TYPES
        // their details in chat gets the same structured capture (and the same
        // modal display) a form submission gets. Free-text was previously lost —
        // the agent replied but nothing landed in the structured fields.
        if (hasPropertyDetail) {
          const brandKey = getCurrentBrandId();
          const brandCtx = { ...(updatedCtx[brandKey] || {}) };
          if (property_type) brandCtx.property_type = String(property_type).trim();
          if (property_size_sqft) brandCtx.property_size_sqft = String(property_size_sqft).trim();
          if (monthly_rent) brandCtx.asking_rent_monthly = String(monthly_rent).trim();
          if (floor) brandCtx.floor = String(floor).trim();
          if (deposit_or_terms) brandCtx.deposit = String(deposit_or_terms).trim();
          if (availability) brandCtx.availability_date = String(availability).trim();
          if (area_locality) brandCtx.property_zone = String(area_locality).trim();
          if (maps_url) brandCtx.google_maps_url = String(maps_url).trim();
          // Tag the audience so the lead is filed as owner/brand (not left
          // untyped) the moment property details are captured. A listing detail
          // (floor / asking rent / deposit / property_type) with no explicit
          // brand-requirement audience = OWNER. This is what surfaces the
          // "Property Owner" badge and files them correctly — previously the
          // details landed but user_type stayed blank, so the lead read as
          // "unknown" and the agent kept treating it as a fresh conversation.
          if (!brandCtx.user_type) {
            const resolved = input.lokazenAudience === 'brand' ? 'brand'
              : input.lokazenAudience === 'owner' ? 'owner'
              : (floor || deposit_or_terms || property_type || monthly_rent || area_locality || maps_url) ? 'owner'
              : null;
            if (resolved) {
              brandCtx.user_type = resolved;
              brandCtx.lead_type = resolved === 'owner' ? 'property_owner' : resolved;
            }
          }
          updatedCtx[brandKey] = brandCtx;
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
        if (property_type) saved.push(`property: ${property_type}`);
        if (property_size_sqft) saved.push(`size: ${property_size_sqft} sqft`);
        if (monthly_rent) saved.push(`rent: ${monthly_rent}`);
        if (floor) saved.push(`floor: ${floor}`);
        if (deposit_or_terms) saved.push(`terms: ${deposit_or_terms}`);
        if (availability) saved.push(`available: ${availability}`);
        if (area_locality) saved.push(`area: ${area_locality}`);
        if (maps_url) saved.push(`maps: ${maps_url}`);

        console.log(`[Engine] Lead profile updated: ${saved.join(', ')}`);
        return JSON.stringify({ success: true, updated: saved });
      } catch (err: any) {
        console.error('[Engine] update_lead_profile failed:', err);
        return JSON.stringify({ success: false, error: 'Failed to save profile.' });
      }
    },
  };

  return { tools, toolHandlers, bookingsCompletedThisSession, availabilityRef };
}

// ─── Flow Task Scheduling ──────────────────────────────────────────────────

/**
 * Booking recovery. The model confirmed a booking but book_consultation never
 * persisted one (tool not called, or an old-format failure). Rather than lose
 * the call, re-read the conversation, pull the date + time the user actually
 * agreed, and register it via storeBooking + a team Slack ping. Conservative by
 * design: only acts when BOTH an allowed online time AND a concrete date can be
 * read with confidence (the model's own confirmation line first, then recent
 * history); otherwise returns null and the caller escalates to a human. Online
 * slots only (3/4/5 PM) — the offline window is never auto-recovered.
 */
async function recoverLostBooking(
  input: AgentInput,
  rawResponse: string,
  supabase: SupabaseClient,
): Promise<{ dateISO: string; timeDisplay: string; dateLabel: string } | null> {
  const bookingPhone = input.userProfile?.phone || '';
  if (!bookingPhone) return null; // need a lead to attach the booking to

  // Search the model's confirmation first (it states the agreed slot), then the
  // most recent turns (user taps like "3:00 PM" / "Tomorrow").
  const corpus: string[] = [
    rawResponse || '',
    input.message || '',
    ...(input.conversationHistory || []).slice(-10).reverse().map((m) => m.content || ''),
  ];

  // TIME — online slots are 3/4/5 PM only (15:00 / 16:00 / 17:00).
  const readTime = (s: string): string | null => {
    const m = s.match(/\b([3-5])\s*(?::\s*0?0)?\s*p\.?\s*m\.?/i) || s.match(/\b(15|16|17)\s*:\s*00\b/);
    if (!m) return null;
    const h = Number(m[1]);
    return `${h >= 15 ? h : h + 12}:00`;
  };
  let time24: string | null = null;
  for (const s of corpus) { const t = readTime(s); if (t) { time24 = t; break; } }
  if (!time24 || !isAllowedBookingTime(time24, 'online')) return null;

  // DATE — resolve today / tomorrow / weekday / explicit ISO in IST.
  const now = new Date();
  const istToday = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const [ty, tm, tdd] = istToday.split('-').map(Number);
  const baseUTC = Date.UTC(ty, tm - 1, tdd, 12, 0, 0);
  const isoAt = (o: number) => new Date(baseUTC + o * 86400000).toISOString().slice(0, 10);
  const dowAt = (o: number) => new Date(baseUTC + o * 86400000).getUTCDay();
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  const readDate = (s: string): string | null => {
    const iso = s.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
    if (iso) return iso[0];
    const low = s.toLowerCase();
    if (/\btomorrow\b/.test(low)) { let o = 1; while (dowAt(o) === 0) o++; return isoAt(o); }
    if (/\btoday\b/.test(low)) return isoAt(0);
    for (let i = 1; i < 7; i++) { // skip index 0 (sunday, closed)
      if (new RegExp(`\\b${days[i]}\\b`).test(low)) {
        for (let o = 1; o <= 7; o++) { if (dowAt(o) === i) return isoAt(o); }
      }
    }
    return null;
  };
  let dateISO: string | null = null;
  for (const s of corpus) { const d = readDate(s); if (d) { dateISO = d; break; } }
  if (!dateISO) return null;

  // Never register a Sunday (closed).
  const [dy, dm, dd] = dateISO.split('-').map(Number);
  const dow = new Date(Date.UTC(dy, dm - 1, dd, 12)).getUTCDay();
  if (dow === 0) return null;

  const hour = Number(time24.split(':')[0]);
  const timeDisplay = `${((hour + 11) % 12) + 1}:00 PM`; // 15 -> "3:00 PM"
  const dateLabel = dateISO === isoAt(0) ? 'today'
    : dateISO === isoAt(1) ? 'tomorrow'
    : `on ${new Date(Date.UTC(dy, dm - 1, dd, 12)).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })}`;

  // Persist. storeBooking resolves the lead by phone and throws on a failed save.
  try {
    await storeBooking(
      input.sessionId,
      {
        date: dateISO,
        time: timeDisplay,
        status: 'Call Booked',
        name: input.userProfile?.name || 'Lead',
        phone: bookingPhone,
        email: input.userProfile?.email || undefined,
        sessionType: 'online',
        conversationSummary: input.summary || undefined,
        title: `Callback - ${input.userProfile?.name || 'Lead'}`,
      },
      input.channel || 'whatsapp',
      supabase,
    );
  } catch (e: any) {
    console.error('[Engine] Booking recovery persist failed:', e?.message || e);
    return null;
  }

  // Ping the team so a human calls at the agreed time.
  try {
    const audienceLabel = input.lokazenAudience === 'brand' ? 'Brand'
      : input.lokazenAudience === 'owner' ? 'Property Owner' : null;
    let brandLabel = 'PROXe';
    try { brandLabel = getBrandConfig()?.name || getCurrentBrandId() || 'PROXe'; } catch { /* keep default */ }
    await notifySlackBooking({
      brandLabel,
      name: input.userProfile?.name || 'Lead',
      phone: bookingPhone,
      email: input.userProfile?.email || null,
      leadType: audienceLabel,
      dateTime: `${dateISO} · ${timeDisplay}`,
      title: 'Recovered callback (auto-booked from chat)',
      channel: input.channel || null,
      summary: input.summary || null,
    });
  } catch (e: any) {
    console.error('[Engine] Booking recovery Slack notify failed:', e?.message || e);
  }

  console.log(`[Engine] Booking RECOVERED: ${dateISO} ${timeDisplay} phone=${bookingPhone}`);
  return { dateISO, timeDisplay, dateLabel };
}

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
    // Re-read the LATEST context right before writing. The engine captured
    // `existingContext` at the start of the turn; if book_consultation saved a
    // booking into unified_context.<channel> mid-turn, spreading the stale
    // snapshot here would wipe it. Always merge onto the fresh DB copy.
    const { data: freshRow } = await supabase
      .from('all_leads')
      .select('unified_context')
      .eq('id', leadId)
      .maybeSingle();
    const freshCtx = freshRow?.unified_context || existingContext || {};

    // Get last response time for this lead
    const lastResponseTimes = freshCtx.response_patterns?.last_5_response_times || [];
    const lastResponseTimeSec = lastResponseTimes.length > 0 ? lastResponseTimes[lastResponseTimes.length - 1] : null;

    const { temperature, reason } = evaluateLeadTemperature(message, messageCount, lastResponseTimeSec);

    // Build temperature history (keep last 20 entries)
    const history = [...(freshCtx.temperature_history || [])];
    history.push({ temperature, timestamp: new Date().toISOString(), reason });
    const trimmedHistory = history.slice(-20);

    // Detect objections
    const objection = detectObjection(message);
    let objections = freshCtx.objections || [];
    if (objection) {
      objections = [...objections, { type: objection.type, message: message.substring(0, 100), timestamp: new Date().toISOString() }];
      objections = objections.slice(-10);
    }

    await supabase
      .from('all_leads')
      .update({
        unified_context: {
          ...freshCtx,
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

    // Re-read latest context before writing so we don't clobber a booking (or
    // any other field) saved into unified_context after the engine's snapshot.
    const { data: freshRow } = await supabase
      .from('all_leads')
      .select('unified_context')
      .eq('id', leadId)
      .maybeSingle();
    const freshCtx = freshRow?.unified_context || existingContext || {};

    const responsePatterns: Record<string, any> = {
      ...(freshCtx.response_patterns || {}),
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
          ...freshCtx,
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

    // A web visitor who closed the tab can't be nudged "on web" — when we have
    // their phone, the nudge goes out on WhatsApp instead.
    const nudgeChannel = input.channel === 'web' && leadPhone ? 'whatsapp' : input.channel;

    await createFlowTask(supabase, {
      taskType: 'nudge_waiting',
      leadId,
      leadPhone,
      leadName,
      scheduledAt: new Date(Date.now() + nudgeDelayMs).toISOString(),
      taskDescription: `Nudge: waiting for reply on ${nudgeChannel} - "${lastQuestion.substring(0, 80)}..."`,
      metadata: {
        last_question: lastQuestionTrimmed,
        channel: nudgeChannel,
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
