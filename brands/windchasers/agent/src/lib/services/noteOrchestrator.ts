/**
 * services/noteOrchestrator.ts
 *
 * Shared note classification + action pipeline. Used by:
 *   - /api/dashboard/leads/[id]/admin-notes  (free-text note from CRM user)
 *   - /api/dashboard/leads/[id]/log-call     (call outcome + optional notes)
 *
 * Pipeline:
 *   1. Combine outcome + text into a single classifier input
 *   2. Call Claude Haiku to classify into one of 14 categories
 *   3. Run the matching orchestration (cancel tasks, create sequences,
 *      update stage/score, send WhatsApp, etc.)
 *   4. Invalidate cached lead summary so the new state surfaces
 *   5. Return a step-by-step `actions_taken` array for the UI
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendWhatsAppText } from './whatsappSender';

// ─── Types ──────────────────────────────────────────────────────────────────

export type CallOutcome = 'Connected' | 'No Answer' | 'Busy' | 'Voicemail';

export interface NoteClassification {
  category: string;
  booking_date: string | null;
  booking_time: string | null;
  name: string | null;
  send_message: string | null;
  summary: string | null;
}

export interface ClassifyAndActInput {
  leadId: string;
  text: string;
  outcome?: CallOutcome;
  createdBy?: string;
  supabase: SupabaseClient;
}

export interface OrchestratorResult {
  actions: string[];
  actions_taken: string[];
  classification: { category: string; summary: string | null };
  new_stage: string | null;
  new_score: number | null;
  summary_refreshed: boolean;
}

// ─── Classifier prompt ──────────────────────────────────────────────────────

const CLASSIFY_SYSTEM_PROMPT = `You are a sales admin assistant. Given an admin note about a lead, extract:
1) category (one of: POST_CALL, BOOKING_MADE, NOT_POTENTIAL, HOT_LEAD, WARM_LATER, RNR, NOT_INTERESTED, CONVERTED, DEMO_TAKEN, PROPOSAL_SENT, MEETING_REQUEST, SEND_MESSAGE, NAME_UPDATE, INFO_ONLY)
2) any booking details if mentioned (date, time)
3) any name if mentioned
4) if a direct message should be sent (note starts with "send:", "message:", "tell them")

Respond in JSON only: {"category": "...", "booking_date": "...", "booking_time": "...", "name": "...", "send_message": "...", "summary": "..."}

Category guide:
- POST_CALL: "spoke to", "just called", "had a call", "after the call" — a call happened
- BOOKING_MADE: "booked", "demo booked", "call scheduled", "meeting set" — a booking was made with date/time
- NOT_POTENTIAL: "not potential", "not a fit", "waste of time", "no budget", "too small" — lead is not worth pursuing
- HOT_LEAD: "hot lead", "very interested", "wants to start", "ready to go", "priority", "close this week" — high intent
- WARM_LATER: "maybe later", "check back later", "not now but maybe", "low potential", "follow up later" — warm but not now
- RNR: "no show", "didn't show", "no answer", "didn't pick up", "rnr", "rang no response", "not responding", "not replying", "no response", "voicemail", "busy" — couldn't reach them
- NOT_INTERESTED: "not interested", "dead lead" — explicit disinterest
- CONVERTED: "converted", "signed", "closed won", "deal done" — deal closed
- DEMO_TAKEN: "demo done", "demo taken", "showed the demo", "demo complete", "they saw the demo" — a demo was given
- PROPOSAL_SENT: "proposal sent", "sent proposal", "shared proposal", "sent the deck", "sent pricing" — proposal or pricing was sent
- MEETING_REQUEST: "asked for a meet", "wants a call", "send them time", "schedule a call", "asked for google meet" — they want to meet
- SEND_MESSAGE: note starts with "send:", "message:", "tell them" — direct message to send (extract the message text after the prefix into send_message)
- NAME_UPDATE: "it's [name]", "name is [name]", "his/her name is [name]" — name correction
- INFO_ONLY: general notes, observations, no action needed

When a call outcome is prefixed in square brackets (e.g. "[No Answer]", "[Voicemail]", "[Busy]"), treat it as a strong signal — if outcome is No Answer/Voicemail/Busy with no contrary info in the text, classify as RNR.

For booking_date: use relative terms as-is ("tomorrow", "next Monday", "March 28"). For booking_time: extract the time ("4 pm", "10:30 am"). If not mentioned, use null.
For name: extract the actual name mentioned, or null if none.
For send_message: extract the exact message text to send (everything after "send:" /"message:" /"tell them"), or null.

Example: note "spoke to him have a demo booked for tomorrow 4 pm" → {"category": "BOOKING_MADE", "booking_date": "tomorrow", "booking_time": "4 pm", "name": null, "send_message": null, "summary": "Demo booked for tomorrow 4pm after call"}
Example: note "[No Answer] tried calling twice" → {"category": "RNR", "booking_date": null, "booking_time": null, "name": null, "send_message": null, "summary": "Called twice, no answer"}
Example: note "send: Hey, just checking in!" → {"category": "SEND_MESSAGE", "booking_date": null, "booking_time": null, "name": null, "send_message": "Hey, just checking in!", "summary": "Direct message to send to lead"}`;

// ─── Classifier ─────────────────────────────────────────────────────────────

const EMPTY_CLASSIFICATION: NoteClassification = {
  category: 'INFO_ONLY',
  booking_date: null,
  booking_time: null,
  name: null,
  send_message: null,
  summary: null,
};

/**
 * Classify a note via Claude Haiku. Falls back to INFO_ONLY on any error.
 * If `outcome` is one of the no-live-contact outcomes AND text is short/empty,
 * we shortcut to RNR without burning a Haiku call.
 */
export async function classifyNote(text: string, outcome?: CallOutcome): Promise<NoteClassification> {
  // Shortcut for empty no-contact outcomes — no need to call Haiku
  const trimmed = (text || '').trim();
  const noLiveContact = outcome === 'No Answer' || outcome === 'Busy' || outcome === 'Voicemail';
  if (noLiveContact && trimmed.length < 8) {
    return { ...EMPTY_CLASSIFICATION, category: 'RNR', summary: outcome || 'No live contact' };
  }

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    console.error('[noteOrchestrator] CLAUDE_API_KEY not set, falling back to INFO_ONLY');
    return EMPTY_CLASSIFICATION;
  }

  // Prefix outcome so the classifier has the strongest signal
  const classifierInput = outcome ? `[${outcome}] ${trimmed}` : trimmed;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        system: CLASSIFY_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: classifierInput }],
      }),
    });

    if (!response.ok) {
      console.error('[noteOrchestrator] Claude API error:', response.status, await response.text());
      return EMPTY_CLASSIFICATION;
    }

    const data = await response.json();
    const responseText = data.content?.[0]?.text || '{}';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[noteOrchestrator] Could not parse Claude response:', responseText);
      return EMPTY_CLASSIFICATION;
    }
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      category: parsed.category || 'INFO_ONLY',
      booking_date: parsed.booking_date || null,
      booking_time: parsed.booking_time || null,
      name: parsed.name || null,
      send_message: parsed.send_message || null,
      summary: parsed.summary || null,
    };
  } catch (err) {
    console.error('[noteOrchestrator] Classification failed:', err);
    return EMPTY_CLASSIFICATION;
  }
}

// ─── Booking date resolver ──────────────────────────────────────────────────

/** Resolve a relative date string ("tomorrow", "next Monday", etc.) to absolute Date in IST. */
export function resolveBookingDate(dateStr: string, timeStr: string | null): Date {
  const now = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const nowIST = new Date(now.getTime() + istOffsetMs);
  const lower = dateStr.toLowerCase().trim();

  let targetIST = new Date(nowIST);

  if (lower === 'today') {
    // keep today
  } else if (lower === 'tomorrow') {
    targetIST.setUTCDate(targetIST.getUTCDate() + 1);
  } else if (lower.startsWith('next ')) {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const targetDay = dayNames.indexOf(lower.replace('next ', '').trim());
    if (targetDay >= 0) {
      const currentDay = targetIST.getUTCDay();
      let daysAhead = targetDay - currentDay;
      if (daysAhead <= 0) daysAhead += 7;
      targetIST.setUTCDate(targetIST.getUTCDate() + daysAhead);
    } else {
      targetIST.setUTCDate(targetIST.getUTCDate() + 1);
    }
  } else if (/in\s*(\d+)\s*days?/.test(lower)) {
    const m = lower.match(/in\s*(\d+)\s*days?/);
    if (m) targetIST.setUTCDate(targetIST.getUTCDate() + parseInt(m[1]));
  } else {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      targetIST = new Date(parsed.getTime() + istOffsetMs);
    } else {
      targetIST.setUTCDate(targetIST.getUTCDate() + 1);
    }
  }

  let hour = 10, minutes = 0;
  if (timeStr) {
    const timeMatch = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (timeMatch) {
      hour = parseInt(timeMatch[1]);
      minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const ampm = timeMatch[3]?.toLowerCase();
      if (ampm === 'am' && hour === 12) hour = 0;
      else if (ampm === 'pm' && hour !== 12) hour += 12;
      else if (!ampm && hour >= 1 && hour <= 8) hour += 12;
    }
  }

  targetIST.setUTCHours(hour, minutes, 0, 0);
  return new Date(targetIST.getTime() - istOffsetMs);
}

// ─── Main orchestrator ──────────────────────────────────────────────────────

/**
 * Classify a note and run the matching orchestration. Returns a step-by-step
 * action report for the UI. Idempotent at the routing layer (callers handle
 * dedup before invoking this).
 */
export async function classifyAndAct(input: ClassifyAndActInput): Promise<OrchestratorResult> {
  const { leadId, text, outcome, supabase } = input;
  const trimmedNote = (text || '').trim();

  const actions: string[] = [];
  const actionsTaken: string[] = [];
  let newStage: string | null = null;
  let newScore: number | null = null;
  let summaryRefreshed = false;

  // Fetch lead for orchestration context
  const { data: lead, error: leadError } = await supabase
    .from('all_leads')
    .select('unified_context, customer_name, customer_phone_normalized, phone')
    .eq('id', leadId)
    .single();

  if (leadError || !lead) {
    return {
      actions,
      actions_taken: ['Lead not found'],
      classification: { category: 'INFO_ONLY', summary: null },
      new_stage: null,
      new_score: null,
      summary_refreshed: false,
    };
  }

  const leadPhone = lead.customer_phone_normalized || lead.phone?.replace(/\D/g, '').slice(-10) || null;
  const leadName = lead.customer_name || 'Lead';
  const now = new Date();

  console.log(`[noteOrchestrator] Step 1: Classify "${trimmedNote.substring(0, 80)}" outcome=${outcome ?? 'none'} lead=${leadId}`);
  const classification = await classifyNote(trimmedNote, outcome);
  console.log(`[noteOrchestrator] Step 2: Classification:`, JSON.stringify(classification));
  actions.push(`ai_category:${classification.category}`);

  // ── BOOKING_MADE ─────────────────────────────────────────────────────────
  if (classification.category === 'BOOKING_MADE') {
    const { data: cancelledTasks } = await supabase
      .from('agent_tasks')
      .update({ status: 'cancelled', completed_at: now.toISOString(), error_message: 'Cancelled: booking made via note' })
      .eq('lead_id', leadId)
      .in('task_type', ['follow_up_day1', 'follow_up_day3', 'follow_up_day5', 're_engage', 'nudge_waiting', 'push_to_book', 'missed_call_followup', 'human_callback', 'post_call_followup', 'follow_up_24h'])
      .in('status', ['pending', 'queued', 'in_queue', 'awaiting_approval'])
      .select('id');
    const cancelCount = cancelledTasks?.length || 0;
    if (cancelCount > 0) {
      actions.push(`cancelled_${cancelCount}_followup_tasks`);
      actionsTaken.push(`Cancelled ${cancelCount} pending follow-up tasks`);
    }

    const bookingAt = resolveBookingDate(
      classification.booking_date || 'tomorrow',
      classification.booking_time,
    );
    const bookingTimeDisplay = classification.booking_time || 'scheduled time';

    const reminder24h = new Date(bookingAt.getTime() - 24 * 60 * 60 * 1000);
    if (reminder24h > now) {
      await supabase.from('agent_tasks').insert({
        task_type: 'booking_reminder_24h',
        task_description: `24h reminder: ${leadName} booking at ${bookingTimeDisplay}`,
        lead_id: leadId,
        lead_phone: leadPhone,
        lead_name: leadName,
        status: 'pending',
        scheduled_at: reminder24h.toISOString(),
        metadata: { source: 'note_orchestrator', booking_time: bookingTimeDisplay, sequence: 'booking' },
        created_at: now.toISOString(),
      });
      actions.push('booking_reminder_24h_created');
      actionsTaken.push(`Created 24h booking reminder for ${classification.booking_date || 'tomorrow'} ${bookingTimeDisplay}`);
    }

    const reminder30m = new Date(bookingAt.getTime() - 30 * 60 * 1000);
    if (reminder30m > now) {
      await supabase.from('agent_tasks').insert({
        task_type: 'booking_reminder_30m',
        task_description: `30min reminder: ${leadName} booking at ${bookingTimeDisplay}`,
        lead_id: leadId,
        lead_phone: leadPhone,
        lead_name: leadName,
        status: 'pending',
        scheduled_at: reminder30m.toISOString(),
        metadata: { source: 'note_orchestrator', booking_time: bookingTimeDisplay, sequence: 'booking' },
        created_at: now.toISOString(),
      });
      actions.push('booking_reminder_30m_created');
      actionsTaken.push(`Created 30min booking reminder`);
    }

    newStage = 'Booking Made';
    newScore = 80;
    await supabase
      .from('all_leads')
      .update({ lead_stage: newStage, stage_override: true, lead_score: newScore })
      .eq('id', leadId);
    actions.push('stage_updated:Booking Made,score_80');
    actionsTaken.push(`Stage changed to Booking Made`);
    actionsTaken.push(`Score updated to 80`);
  }

  // ── POST_CALL ────────────────────────────────────────────────────────────
  if (classification.category === 'POST_CALL') {
    await supabase
      .from('all_leads')
      .update({ last_touchpoint: 'voice', last_interaction_at: now.toISOString() })
      .eq('id', leadId);
    actionsTaken.push(`Marked last touchpoint as voice call`);
    await supabase.from('agent_tasks').insert({
      task_type: 'post_call_followup',
      task_description: `Post-call follow-up: ${trimmedNote}`,
      lead_id: leadId,
      lead_phone: leadPhone,
      lead_name: leadName,
      status: 'pending',
      scheduled_at: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      metadata: { source: 'note_orchestrator', sequence: 'post_call', step: 0 },
      created_at: now.toISOString(),
    });
    actions.push('post_call_followup_created');
    actionsTaken.push(`Created post-call follow-up task (1 hour)`);
  }

  // ── NOT_POTENTIAL ────────────────────────────────────────────────────────
  if (classification.category === 'NOT_POTENTIAL') {
    const { data: cancelledTasks } = await supabase
      .from('agent_tasks')
      .update({ status: 'cancelled', completed_at: now.toISOString(), error_message: `Cancelled: not potential — "${trimmedNote.substring(0, 50)}"` })
      .eq('lead_id', leadId)
      .in('status', ['pending', 'queued', 'in_queue', 'awaiting_approval'])
      .select('id');
    const cancelCount = cancelledTasks?.length || 0;
    if (cancelCount > 0) actionsTaken.push(`Cancelled ${cancelCount} pending tasks`);

    newStage = 'Closed Lost';
    newScore = 0;
    await supabase
      .from('all_leads')
      .update({ lead_stage: newStage, stage_override: true, lead_score: newScore })
      .eq('id', leadId);
    actionsTaken.push(`Stage changed to Closed Lost`);
    actionsTaken.push(`Score updated to 0`);

    await supabase.from('agent_tasks').insert({
      task_type: 're_engage',
      task_description: `Quarterly check-in for ${leadName} (marked not potential)`,
      lead_id: leadId,
      lead_phone: leadPhone,
      lead_name: leadName,
      status: 'pending',
      scheduled_at: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      metadata: { source: 'note_orchestrator', trigger: 'not_potential', quarterly: true },
      created_at: now.toISOString(),
    });
    actions.push(`not_potential:cancelled_${cancelCount}_tasks,stage_Closed_Lost,score_0,re_engage_90d`);
    actionsTaken.push(`Scheduled 90-day re-engagement check-in`);
  }

  // ── HOT_LEAD ─────────────────────────────────────────────────────────────
  if (classification.category === 'HOT_LEAD') {
    const { data: freshCtx } = await supabase
      .from('all_leads')
      .select('unified_context')
      .eq('id', leadId)
      .single();
    if (freshCtx) {
      await supabase
        .from('all_leads')
        .update({ unified_context: { ...(freshCtx.unified_context || {}), lead_temperature: 'hot' } })
        .eq('id', leadId);
    }
    actionsTaken.push(`Temperature set to hot`);

    newStage = 'High Intent';
    newScore = 85;
    await supabase
      .from('all_leads')
      .update({ lead_stage: newStage, stage_override: true, lead_score: newScore })
      .eq('id', leadId);
    actionsTaken.push(`Stage changed to High Intent`);
    actionsTaken.push(`Score updated to 85`);

    const { data: bookingTasks } = await supabase
      .from('agent_tasks')
      .select('id')
      .eq('lead_id', leadId)
      .in('task_type', ['booking_reminder_24h', 'booking_reminder_30m'])
      .in('status', ['pending', 'completed'])
      .limit(1);
    const hasBooking = bookingTasks && bookingTasks.length > 0;

    if (hasBooking) {
      await supabase.from('agent_tasks').insert({
        task_type: 'human_callback',
        task_description: `PREP: High-potential lead ${leadName} has a booking. Review before call.`,
        lead_id: leadId,
        lead_phone: leadPhone,
        lead_name: leadName,
        status: 'pending',
        scheduled_at: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
        metadata: { source: 'note_orchestrator', trigger: 'high_potential', prep: true },
        created_at: now.toISOString(),
      });
      actions.push('high_potential:temp_hot,stage_High_Intent,score_85,prep_task_created');
      actionsTaken.push(`Created prep task — review before existing booking`);
    } else {
      await supabase.from('agent_tasks').insert({
        task_type: 'push_to_book',
        task_description: `Push to book: high-potential lead ${leadName}`,
        lead_id: leadId,
        lead_phone: leadPhone,
        lead_name: leadName,
        status: 'pending',
        scheduled_at: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
        metadata: { source: 'note_orchestrator', trigger: 'high_potential' },
        created_at: now.toISOString(),
      });
      actions.push('high_potential:temp_hot,stage_High_Intent,score_85,push_to_book_1h');
      actionsTaken.push(`Created push-to-book task (1 hour)`);
    }
  }

  // ── WARM_LATER ───────────────────────────────────────────────────────────
  if (classification.category === 'WARM_LATER') {
    const { data: cancelledTasks } = await supabase
      .from('agent_tasks')
      .update({ status: 'cancelled', completed_at: now.toISOString(), error_message: `Cancelled: warm later — "${trimmedNote.substring(0, 50)}"` })
      .eq('lead_id', leadId)
      .in('status', ['pending', 'queued', 'in_queue', 'awaiting_approval'])
      .select('id');
    const cancelCount = cancelledTasks?.length || 0;
    if (cancelCount > 0) actionsTaken.push(`Cancelled ${cancelCount} pending tasks`);

    newStage = 'Nurture';
    await supabase
      .from('all_leads')
      .update({ lead_stage: newStage, stage_override: true })
      .eq('id', leadId);
    actionsTaken.push(`Stage changed to Nurture`);

    await supabase.from('agent_tasks').insert({
      task_type: 're_engage',
      task_description: `90-day check-in for ${leadName} (warm later)`,
      lead_id: leadId,
      lead_phone: leadPhone,
      lead_name: leadName,
      status: 'pending',
      scheduled_at: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      metadata: { source: 'note_orchestrator', trigger: 'warm_later', quarterly: true },
      created_at: now.toISOString(),
    });
    actions.push(`warm_later:cancelled_${cancelCount}_tasks,stage_Nurture,re_engage_90d`);
    actionsTaken.push(`Scheduled 90-day check-in`);
  }

  // ── RNR (Rang/Rang No Response) ──────────────────────────────────────────
  if (classification.category === 'RNR') {
    await supabase
      .from('all_leads')
      .update({ last_touchpoint: 'voice', last_interaction_at: now.toISOString() })
      .eq('id', leadId);
    actionsTaken.push(`Marked last touchpoint as voice call`);

    await supabase
      .from('agent_tasks')
      .update({ status: 'cancelled', completed_at: now.toISOString() })
      .eq('lead_id', leadId)
      .in('task_type', ['booking_reminder_24h', 'booking_reminder_30m'])
      .in('status', ['pending', 'queued']);

    await supabase.from('agent_tasks').insert({
      task_type: 'missed_call_followup',
      task_description: `Missed call follow-up: ${trimmedNote || outcome || 'no answer'}`,
      lead_id: leadId,
      lead_phone: leadPhone,
      lead_name: leadName,
      status: 'pending',
      scheduled_at: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
      metadata: { source: 'note_orchestrator', sequence: 'no_show', step: 0, timing_reason: 'RNR — follow-up in 30 min', outcome: outcome || null },
      created_at: now.toISOString(),
    });
    actions.push('missed_call_followup_created');
    actionsTaken.push(`Created missed-call follow-up (30 min)`);

    const rnrSequence = [
      { type: 'follow_up_day1', offsetMs: 1 * 24 * 60 * 60 * 1000, step: 1 },
      { type: 'follow_up_day3', offsetMs: 3 * 24 * 60 * 60 * 1000, step: 2 },
      { type: 'follow_up_day5', offsetMs: 5 * 24 * 60 * 60 * 1000, step: 3 },
      { type: 're_engage', offsetMs: 7 * 24 * 60 * 60 * 1000, step: 4 },
    ];
    for (const s of rnrSequence) {
      await supabase.from('agent_tasks').insert({
        task_type: s.type,
        task_description: `Sequence step ${s.step}/4: ${s.type} for ${leadName} (RNR)`,
        lead_id: leadId,
        lead_phone: leadPhone,
        lead_name: leadName,
        status: 'pending',
        scheduled_at: new Date(now.getTime() + s.offsetMs).toISOString(),
        metadata: { source: 'note_orchestrator', sequence: 'rnr', step: s.step, total_steps: 4 },
        created_at: now.toISOString(),
      });
    }
    newStage = 'In Sequence';
    await supabase
      .from('all_leads')
      .update({ lead_stage: newStage })
      .eq('id', leadId);
    actions.push('sequence_created:rnr:4_steps');
    actionsTaken.push(`Created 4-step follow-up sequence (day 1, 3, 5, 7)`);
    actionsTaken.push(`Stage changed to In Sequence`);
  }

  // ── NOT_INTERESTED ───────────────────────────────────────────────────────
  if (classification.category === 'NOT_INTERESTED') {
    newStage = 'Closed Lost';
    await supabase
      .from('all_leads')
      .update({ lead_stage: newStage, stage_override: true })
      .eq('id', leadId);
    actions.push('stage_updated:Closed Lost');
    actionsTaken.push(`Stage changed to Closed Lost`);
  }

  // ── CONVERTED ────────────────────────────────────────────────────────────
  if (classification.category === 'CONVERTED') {
    newStage = 'Converted';
    await supabase
      .from('all_leads')
      .update({ lead_stage: newStage, stage_override: true })
      .eq('id', leadId);
    actions.push('stage_updated:Converted');
    actionsTaken.push(`Stage changed to Converted`);
  }

  // ── DEMO_TAKEN ───────────────────────────────────────────────────────────
  if (classification.category === 'DEMO_TAKEN') {
    const { data: cancelledTasks } = await supabase
      .from('agent_tasks')
      .update({ status: 'cancelled', completed_at: now.toISOString(), error_message: 'Cancelled: demo taken via note' })
      .eq('lead_id', leadId)
      .in('task_type', ['follow_up_day1', 'follow_up_day3', 'follow_up_day5', 'nudge_waiting', 'push_to_book', 'follow_up_24h'])
      .in('status', ['pending', 'queued', 'in_queue', 'awaiting_approval'])
      .select('id');
    const cancelCount = cancelledTasks?.length || 0;
    if (cancelCount > 0) {
      actions.push(`cancelled_${cancelCount}_followup_tasks`);
      actionsTaken.push(`Cancelled ${cancelCount} pending follow-up tasks`);
    }

    newStage = 'Demo Taken';
    newScore = 72;
    await supabase
      .from('all_leads')
      .update({ lead_stage: newStage, stage_override: true, lead_score: newScore })
      .eq('id', leadId);
    actionsTaken.push(`Stage changed to Demo Taken`);
    actionsTaken.push(`Score updated to 72`);

    const demoSequence = [
      { type: 'follow_up_day1', offsetMs: 1 * 24 * 60 * 60 * 1000, step: 1 },
      { type: 'try_voice_call', offsetMs: 2 * 24 * 60 * 60 * 1000, step: 2 },
      { type: 'follow_up_day3', offsetMs: 3 * 24 * 60 * 60 * 1000, step: 3 },
      { type: 'follow_up_day5', offsetMs: 5 * 24 * 60 * 60 * 1000, step: 4 },
    ];
    for (const s of demoSequence) {
      await supabase.from('agent_tasks').insert({
        task_type: s.type,
        task_description: `Post-demo step ${s.step}/4: ${s.type} for ${leadName}`,
        lead_id: leadId,
        lead_phone: leadPhone,
        lead_name: leadName,
        status: 'pending',
        scheduled_at: new Date(now.getTime() + s.offsetMs).toISOString(),
        metadata: { source: 'note_orchestrator', sequence: 'post_demo', step: 0 },
        created_at: now.toISOString(),
      });
    }
    actions.push('sequence_created:post_demo:4_steps');
    actionsTaken.push(`Created 4-step post-demo sequence`);
  }

  // ── PROPOSAL_SENT ────────────────────────────────────────────────────────
  if (classification.category === 'PROPOSAL_SENT') {
    const { data: cancelledTasks } = await supabase
      .from('agent_tasks')
      .update({ status: 'cancelled', completed_at: now.toISOString(), error_message: 'Cancelled: proposal sent via note' })
      .eq('lead_id', leadId)
      .in('task_type', ['follow_up_day1', 'follow_up_day3', 'follow_up_day5', 'nudge_waiting', 'push_to_book', 'follow_up_24h'])
      .in('status', ['pending', 'queued', 'in_queue', 'awaiting_approval'])
      .select('id');
    const cancelCount = cancelledTasks?.length || 0;
    if (cancelCount > 0) {
      actions.push(`cancelled_${cancelCount}_followup_tasks`);
      actionsTaken.push(`Cancelled ${cancelCount} pending follow-up tasks`);
    }

    newStage = 'Proposal Sent';
    newScore = 80;
    await supabase
      .from('all_leads')
      .update({ lead_stage: newStage, stage_override: true, lead_score: newScore })
      .eq('id', leadId);
    actionsTaken.push(`Stage changed to Proposal Sent`);
    actionsTaken.push(`Score updated to 80`);

    const proposalSequence = [
      { type: 'follow_up_day1', offsetMs: 1 * 24 * 60 * 60 * 1000, step: 1 },
      { type: 'try_voice_call', offsetMs: 1 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000, step: 2 },
      { type: 'follow_up_day3', offsetMs: 3 * 24 * 60 * 60 * 1000, step: 3 },
      { type: 'follow_up_day5', offsetMs: 5 * 24 * 60 * 60 * 1000, step: 4 },
    ];
    for (const s of proposalSequence) {
      await supabase.from('agent_tasks').insert({
        task_type: s.type,
        task_description: `Post-proposal step ${s.step}/4: ${s.type} for ${leadName}`,
        lead_id: leadId,
        lead_phone: leadPhone,
        lead_name: leadName,
        status: 'pending',
        scheduled_at: new Date(now.getTime() + s.offsetMs).toISOString(),
        metadata: { source: 'note_orchestrator', sequence: 'post_proposal', step: 0 },
        created_at: now.toISOString(),
      });
    }
    actions.push('sequence_created:post_proposal:4_steps');
    actionsTaken.push(`Created 4-step post-proposal sequence`);
  }

  // ── MEETING_REQUEST ──────────────────────────────────────────────────────
  if (classification.category === 'MEETING_REQUEST') {
    if (leadPhone) {
      const msg = `${leadName}, we'd love to set up a call. What time works best for you this week?`;
      const sendResult = await sendWhatsAppText(leadPhone, msg);
      if (sendResult.success) {
        actions.push('whatsapp_sent:meeting_request');
        actionsTaken.push(`Sent WhatsApp: meeting time request`);
        await supabase.from('conversations').insert({
          lead_id: leadId,
          channel: 'whatsapp',
          sender: 'agent',
          content: msg,
          message_type: 'text',
          metadata: { source: 'note_orchestrator', note: trimmedNote },
        });
      } else {
        actions.push(`whatsapp_failed:${sendResult.error?.substring(0, 50)}`);
        actionsTaken.push(`WhatsApp send failed`);
      }
    }
    await supabase.from('agent_tasks').insert({
      task_type: 'nudge_waiting',
      task_description: `Nudge: asked for meeting time, no response yet (${leadName})`,
      lead_id: leadId,
      lead_phone: leadPhone,
      lead_name: leadName,
      status: 'pending',
      scheduled_at: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
      metadata: { source: 'note_orchestrator', trigger: 'meeting_request' },
      created_at: now.toISOString(),
    });
    actions.push('nudge_waiting_created:2h');
    actionsTaken.push(`Created nudge task if no reply (2 hours)`);
  }

  // ── SEND_MESSAGE ─────────────────────────────────────────────────────────
  if (classification.category === 'SEND_MESSAGE') {
    const directMessage = classification.send_message?.trim();
    if (directMessage && leadPhone) {
      const sendResult = await sendWhatsAppText(leadPhone, directMessage);
      if (sendResult.success) {
        actions.push('whatsapp_sent:direct_message');
        actionsTaken.push(`Sent WhatsApp message to lead`);
        await supabase.from('conversations').insert({
          lead_id: leadId,
          channel: 'whatsapp',
          sender: 'agent',
          content: directMessage,
          message_type: 'text',
          metadata: { source: 'note_orchestrator', direct_send: true },
        });
      } else {
        actions.push(`whatsapp_failed:${sendResult.error?.substring(0, 50)}`);
        actionsTaken.push(`WhatsApp send failed`);
      }
    }
  }

  // ── NAME_UPDATE ──────────────────────────────────────────────────────────
  if (classification.category === 'NAME_UPDATE' && classification.name) {
    const extractedName = classification.name.trim().replace(/\b\w/g, (c: string) => c.toUpperCase());
    if (extractedName.length >= 2) {
      await supabase
        .from('all_leads')
        .update({ customer_name: extractedName })
        .eq('id', leadId);
      actions.push(`name_updated:${extractedName}`);
      actionsTaken.push(`Name updated to ${extractedName}`);
    }
  }

  // ── INFO_ONLY ────────────────────────────────────────────────────────────
  if (classification.category === 'INFO_ONLY') {
    actionsTaken.push(`Note saved — no automated actions needed`);
  }

  // ── Activity feed: log the automation summary ────────────────────────────
  if (actionsTaken.length > 0 && classification.category !== 'INFO_ONLY') {
    const sourceLabel = outcome ? `Call (${outcome})` : 'Note';
    const actionSummary = `PROXe: ${sourceLabel} '${trimmedNote.substring(0, 40)}${trimmedNote.length > 40 ? '...' : ''}' (${classification.category}) → ${actionsTaken.join(', ')}`;
    await supabase.from('activities').insert({
      lead_id: leadId,
      activity_type: 'automation',
      note: actionSummary,
      created_by: 'PROXe AI',
    });
  }

  // ── Record actor (who did this) + invalidate cached summary ──────────────
  // last_actor surfaces in the LAST TOUCH column so the team can see who
  // handled this lead most recently — a specific user or PROXe AI.
  const actorEmail = (input.createdBy || 'system').trim();
  const actorIsSystem = actorEmail === 'system' || actorEmail === 'PROXe AI' || actorEmail.toLowerCase() === 'proxe';
  const actorName = actorIsSystem
    ? null
    : actorEmail.includes('@')
      ? actorEmail.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      : actorEmail;
  const lastActor = {
    type: actorIsSystem ? 'proxe' : 'user',
    email: actorIsSystem ? null : actorEmail,
    name: actorIsSystem ? 'PROXe' : actorName,
    at: now.toISOString(),
    source: outcome ? `call:${outcome}` : 'note',
  };

  const { data: freshLead } = await supabase
    .from('all_leads')
    .select('unified_context')
    .eq('id', leadId)
    .single();

  if (freshLead) {
    const ctx = freshLead.unified_context || {};
    // Wipe the cached summary so the next dashboard view regenerates it with
    // the new state. Always update last_actor.
    const shouldInvalidateSummary = classification.category !== 'INFO_ONLY';
    const { error: summaryErr } = await supabase
      .from('all_leads')
      .update({
        unified_context: {
          ...ctx,
          last_actor: lastActor,
          ...(shouldInvalidateSummary ? { unified_summary: null } : {}),
        },
      })
      .eq('id', leadId);
    if (!summaryErr && shouldInvalidateSummary) {
      summaryRefreshed = true;
      actionsTaken.push(`Summary refresh triggered`);
    }
  }

  console.log(`[noteOrchestrator] Done. Category: ${classification.category}, Actions: ${actionsTaken.length}, Stage: ${newStage}, Score: ${newScore}`);

  return {
    actions,
    actions_taken: actionsTaken,
    classification: { category: classification.category, summary: classification.summary },
    new_stage: newStage,
    new_score: newScore,
    summary_refreshed: summaryRefreshed,
  };
}
