/**
 * PROXe Autonomous Task Worker - Sequence Engine
 *
 * PM2 runs this every 5 minutes via cron_restart.
 * Processes flow tasks created by engine.ts (nudge, booking reminders, push-to-book)
 * AND scans for conditions (follow-ups, cold lead re-engagement).
 * Executes via WhatsApp with 24h window detection + template fallback.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const WA_TOKEN = process.env.META_WHATSAPP_ACCESS_TOKEN;
const WA_PHONE_ID = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
const WA_TEMPLATE_NAME = process.env.WA_TEMPLATE_NAME || 'bcon_followup';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || null;
const TELEGRAM_ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID || null;
const APPROVAL_MODE = process.env.APPROVAL_MODE || 'approve'; // 'notify' or 'approve'

// File to persist Telegram getUpdates offset across runs
const TELEGRAM_OFFSET_FILE = path.join(__dirname, '.telegram_offset');

async function main() {
  console.log(`[TaskWorker] Run started at ${new Date().toISOString()}`);

  try {
    // Process any Telegram approve/reject replies before processing new tasks
    await pollTelegramApprovals();

    await createBookingReminderTasks();
    await createFollowUpTasks();
    await createColdLeadTasks();

    // Log task counts before processing
    const { data: taskCounts } = await supabase
      .from('agent_tasks')
      .select('status')
      .in('status', ['pending', 'queued']);
    const pendingCount = (taskCounts || []).filter(t => t.status === 'pending').length;
    const queuedCount = (taskCounts || []).filter(t => t.status === 'queued').length;
    console.log(`[TaskWorker] Tasks: ${pendingCount} pending (will fire), ${queuedCount} queued (needs approval)`);

    await processPendingTasks();
    console.log(`[TaskWorker] Run complete`);
  } catch (err) {
    console.error('[TaskWorker] Fatal error:', err.message);
  }
}

// ============================================
// 1. BOOKING REMINDERS (from whatsapp_sessions)
// ============================================
async function createBookingReminderTasks() {
  const now = new Date();

  const { data: sessions } = await supabase
    .from('whatsapp_sessions')
    .select('id, customer_name, booking_date, booking_time, reminder_24h_sent, reminder_1h_sent, reminder_30m_sent, customer_phone_normalized, lead_id, external_session_id')
    .not('booking_date', 'is', null)
    .not('booking_time', 'is', null);

  if (!sessions || sessions.length === 0) return;

  for (const session of sessions) {
    try {
      const bookingDateTime = new Date(`${session.booking_date}T${session.booking_time}`);
      if (bookingDateTime < now) continue;

      const hoursUntil = (bookingDateTime - now) / (1000 * 60 * 60);

      // Resolve phone: session field → lead lookup → session ID parse
      let phone = session.customer_phone_normalized;
      if (!phone && session.lead_id) {
        const { data: lead } = await supabase
          .from('all_leads')
          .select('customer_phone_normalized, phone')
          .eq('id', session.lead_id)
          .maybeSingle();
        phone = lead?.customer_phone_normalized || lead?.phone?.replace(/\D/g, '').slice(-10) || null;
      }
      if (!phone && session.external_session_id) {
        // Parse phone from session ID format: wa_meta_9876543210
        const match = session.external_session_id.match(/wa_meta_(\d+)/);
        if (match) phone = match[1];
      }
      if (!phone) {
        console.log(`[BookingReminder] No phone for session ${session.id}, skipping`);
        continue;
      }
      const name = session.customer_name || 'there';

      if (hoursUntil <= 25 && hoursUntil > 23 && !session.reminder_24h_sent) {
        await createTaskIfNotExists({
          taskType: 'reminder_24h',
          leadId: session.lead_id || null,
          leadPhone: phone,
          leadName: name,
          scheduledAt: new Date(bookingDateTime.getTime() - 24 * 60 * 60 * 1000).toISOString(),
          metadata: { booking_date: session.booking_date, booking_time: session.booking_time, session_id: session.id }
        });
      }

      if (hoursUntil <= 2 && hoursUntil > 0.5 && !session.reminder_1h_sent) {
        await createTaskIfNotExists({
          taskType: 'reminder_1h',
          leadId: session.lead_id || null,
          leadPhone: phone,
          leadName: name,
          scheduledAt: new Date(bookingDateTime.getTime() - 1 * 60 * 60 * 1000).toISOString(),
          metadata: { booking_date: session.booking_date, booking_time: session.booking_time, session_id: session.id }
        });
      }

      if (hoursUntil <= 0.75 && hoursUntil > 0.25 && !session.reminder_30m_sent) {
        await createTaskIfNotExists({
          taskType: 'reminder_30m',
          leadId: session.lead_id || null,
          leadPhone: phone,
          leadName: name,
          scheduledAt: new Date(bookingDateTime.getTime() - 30 * 60 * 1000).toISOString(),
          metadata: { booking_date: session.booking_date, booking_time: session.booking_time, session_id: session.id }
        });
      }
    } catch (err) {
      console.error(`[BookingReminder] Error for session ${session.id}:`, err.message);
    }
  }
}

// ============================================
// 2. FOLLOW-UP SILENT LEADS (24h no reply)
// ============================================
async function createFollowUpTasks() {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const { data: leads } = await supabase
    .from('all_leads')
    .select('id, customer_name, customer_phone_normalized, last_interaction_at, lead_stage, lead_score')
    .in('brand', ['bcon', 'default'])
    .not('customer_phone_normalized', 'is', null)
    .not('lead_stage', 'in', '("Converted","Closed Won","Closed Lost","Cold")')
    .lt('last_interaction_at', twentyFourHoursAgo)
    .gt('last_interaction_at', fortyEightHoursAgo);

  if (!leads || leads.length === 0) return;

  for (const lead of leads) {
    try {
      const { data: lastMsg } = await supabase
        .from('conversations')
        .select('sender, created_at')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (lastMsg && lastMsg.sender === 'agent') {
        // Schedule 24h from their last interaction, not NOW
        const scheduledAt = new Date(new Date(lead.last_interaction_at).getTime() + 24 * 60 * 60 * 1000).toISOString();
        await createTaskIfNotExists({
          taskType: 'follow_up_24h',
          leadId: lead.id,
          leadPhone: lead.customer_phone_normalized,
          leadName: lead.customer_name || 'Lead',
          scheduledAt,
          metadata: { lead_stage: lead.lead_stage, lead_score: lead.lead_score },
          initialStatus: 'queued',
        });
      }
    } catch (err) {
      console.error(`[FollowUp] Error for lead ${lead.id}:`, err.message);
    }
  }
}

// ============================================
// 3. RE-ENGAGE COLD LEADS (7d+ inactive)
// ============================================
async function createColdLeadTasks() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data: leads } = await supabase
    .from('all_leads')
    .select('id, customer_name, customer_phone_normalized, last_interaction_at, lead_stage, lead_score')
    .in('brand', ['bcon', 'default'])
    .not('customer_phone_normalized', 'is', null)
    .not('lead_stage', 'in', '("Converted","Closed Won","Closed Lost")')
    .lt('last_interaction_at', sevenDaysAgo)
    .gt('last_interaction_at', fourteenDaysAgo);

  if (!leads || leads.length === 0) return;

  for (const lead of leads) {
    try {
      // Schedule 7 days from their last interaction, not NOW
      const scheduledAt = new Date(new Date(lead.last_interaction_at).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await createTaskIfNotExists({
        taskType: 're_engage',
        leadId: lead.id,
        leadPhone: lead.customer_phone_normalized,
        leadName: lead.customer_name || 'Lead',
        scheduledAt,
        metadata: {
          lead_stage: lead.lead_stage,
          days_inactive: Math.floor((Date.now() - new Date(lead.last_interaction_at).getTime()) / (1000 * 60 * 60 * 24))
        },
        initialStatus: 'queued',
      });
    } catch (err) {
      console.error(`[ColdLead] Error for lead ${lead.id}:`, err.message);
    }
  }
}

// ============================================
// 4. PROCESS PENDING TASKS
// ============================================
async function processPendingTasks() {
  const now = new Date().toISOString();

  const { data: tasks } = await supabase
    .from('agent_tasks')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(20);

  if (!tasks || tasks.length === 0) {
    console.log('[ProcessTasks] No pending tasks');
    return;
  }

  console.log(`[ProcessTasks] Processing ${tasks.length} tasks`);

  for (const task of tasks) {
    try {
      // Quiet hours: 9 PM – 9 AM IST - reschedule to 9 AM IST next morning
      const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const hourIST = nowIST.getHours();
      if (hourIST >= 21 || hourIST < 9) {
        const nextMorning = new Date(nowIST);
        if (hourIST >= 21) nextMorning.setDate(nextMorning.getDate() + 1);
        nextMorning.setHours(9, 0, 0, 0);
        // Convert back to UTC for storage
        const offsetMs = nextMorning.getTime() - new Date().getTime() + (new Date().getTime() - nowIST.getTime());
        const scheduledUtc = new Date(Date.now() + (nextMorning.getTime() - nowIST.getTime()));
        await supabase.from('agent_tasks').update({
          scheduled_at: scheduledUtc.toISOString(),
        }).eq('id', task.id);
        console.log(`[ProcessTasks] Quiet hours - rescheduled to 9 AM IST: ${task.task_type} for ${task.lead_name}`);
        continue;
      }

      const result = await executeTask(task);

      // If task was skipped (e.g. lead already responded), mark completed with note
      if (result && result.skipped) {
        await supabase.from('agent_tasks').update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          error_message: result.reason || 'Skipped - condition no longer applies',
        }).eq('id', task.id);
        console.log(`[ProcessTasks] Skipped: ${task.task_type} for ${task.lead_name} - ${result.reason}`);
        continue;
      }

      // If approval mode blocked the send, park the task
      if (result && result.awaiting_approval) {
        await supabase.from('agent_tasks').update({
          status: 'awaiting_approval',
          error_message: result.message_preview || null,
        }).eq('id', task.id);
        console.log(`[ProcessTasks] Awaiting approval: ${task.task_type} for ${task.lead_name}`);
        continue;
      }

      await supabase.from('agent_tasks').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        error_message: null
      }).eq('id', task.id);
      console.log(`[ProcessTasks] Completed: ${task.task_type} for ${task.lead_name}`);
    } catch (err) {
      const status = err.is24hWindow ? 'failed_24h_window' : 'failed';
      await supabase.from('agent_tasks').update({
        status,
        completed_at: new Date().toISOString(),
        error_message: err.message
      }).eq('id', task.id);
      console.error(`[ProcessTasks] Failed: ${task.task_type} for ${task.lead_name}: ${err.message}`);
    }
  }
}

// ============================================
// TASK EXECUTION - Route by type
// ============================================
async function executeTask(task) {
  let phone = task.lead_phone?.replace(/\D/g, '');

  // Always re-resolve phone from the lead record - task.lead_phone can be stale
  // (e.g. inherited from a parent task, or lead record was merged/overwritten)
  if (task.lead_id) {
    const { data: freshLead } = await supabase
      .from('all_leads')
      .select('customer_phone_normalized')
      .eq('id', task.lead_id)
      .maybeSingle();

    if (freshLead?.customer_phone_normalized) {
      const freshPhone = freshLead.customer_phone_normalized.replace(/\D/g, '');
      if (freshPhone && freshPhone !== phone) {
        console.warn(`[executeTask] Phone mismatch for ${task.lead_name}: task=${phone} lead=${freshPhone} - using lead phone`);
        phone = freshPhone;
      }
    }
  }

  if (!phone) throw new Error('No phone number');

  const waPhone = phone.length === 10 ? `91${phone}` : phone;

  switch (task.task_type) {
    // ── Inbound lead outreach ──
    case 'first_outreach':
      return await executeFirstOutreach(task, waPhone);

    // ── Flow tasks (created by engine.ts) ──
    case 'nudge_waiting':
      return await executeNudgeWaiting(task, waPhone);
    case 'booking_reminder_24h':
      return await executeSendMessage(task, waPhone,
        `Hey ${task.lead_name}! Just a reminder, you have a call with BCON Club tomorrow at ${task.metadata?.booking_time}. Looking forward to it!`);
    case 'booking_reminder_1h':
      return await executeSendMessage(task, waPhone,
        `Just a heads up ${task.lead_name}, your call is in about an hour at ${task.metadata?.booking_time}. Talk soon!`);
    case 'booking_reminder_30m':
      return await executeSendMessage(task, waPhone,
        `${task.lead_name}, your call starts in 30 minutes. Talk soon!`);
    case 'post_call_followup':
      return await executePostBookingFollowup(task, waPhone);
    case 'missed_call_followup':
      return await executeSendMessage(task, waPhone,
        `Hey ${task.lead_name}! We tried reaching you for your scheduled call but couldn't connect. No worries. When's a good time to reschedule?`);
    case 'push_to_book':
      return await executePushToBook(task, waPhone);

    // ── Legacy tasks (created by worker scan) ──
    case 'reminder_24h': {
      const sessionId = task.metadata?.session_id;
      const result = await executeSendMessage(task, waPhone,
        `Hey ${task.lead_name}! Just a reminder - you have a call with BCON Club tomorrow at ${task.metadata?.booking_time}. Looking forward to connecting!`);
      if (sessionId) await supabase.from('whatsapp_sessions').update({ reminder_24h_sent: true }).eq('id', sessionId);
      return result;
    }
    case 'reminder_1h': {
      const sessionId = task.metadata?.session_id;
      const result = await executeSendMessage(task, waPhone,
        `Hi ${task.lead_name}! Your call with BCON Club is in about an hour at ${task.metadata?.booking_time}. Ready to discuss how AI can grow your business!`);
      if (sessionId) await supabase.from('whatsapp_sessions').update({ reminder_1h_sent: true }).eq('id', sessionId);
      return result;
    }
    case 'reminder_30m': {
      const sessionId = task.metadata?.session_id;
      const result = await executeSendMessage(task, waPhone,
        `${task.lead_name}, your BCON Club call is in 30 minutes at ${task.metadata?.booking_time}. See you soon!`);
      if (sessionId) await supabase.from('whatsapp_sessions').update({ reminder_30m_sent: true }).eq('id', sessionId);
      return result;
    }
    case 'follow_up_24h':
      return await executeSendMessage(task, waPhone,
        `Hey ${task.lead_name}! Just checking in. Did you get a chance to think about what we discussed? Happy to answer any questions about setting up AI for your business.`);
    case 'follow_up_day1':
      return await executeSequenceStep(task, waPhone,
        `${task.lead_name}, following up on our call. Let me know if you have any questions.`);
    case 'follow_up_day3':
      return await executeSequenceStep(task, waPhone,
        `${task.lead_name}, just checking in. Would love to help get things moving for your business.`);
    case 'follow_up_day5':
      return await executeSequenceStep(task, waPhone,
        `${task.lead_name}, haven't heard back. Still interested in growing your business faster? Last chance to grab that free Brand Audit.`);
    case 're_engage':
      if (task.metadata?.sequence) {
        return await executeSequenceStep(task, waPhone,
          `${task.lead_name}, looks like the timing might not be right. No worries. Whenever you're ready, just reply here and we'll pick it up.`);
      }
      return await executeSendMessage(task, waPhone,
        `Hi ${task.lead_name}! It's been a while since we connected. We've been building some exciting AI solutions for businesses like yours. Would love to catch up. What's a good time this week?`);
    case 'post_booking_confirmation':
      return await executeSendMessage(task, waPhone,
        `Great news ${task.lead_name}! Your call with BCON Club is confirmed for ${task.metadata?.booking_date} at ${task.metadata?.booking_time}. We'll discuss how to set up an AI system for your business. See you then!`);

    case 'human_callback':
      return await executeHumanCallback(task, waPhone);

    default:
      throw new Error(`Unknown task type: ${task.task_type}`);
  }
}

// ============================================
// SMART EXECUTORS
// ============================================

/**
 * Nudge waiting: check if lead responded since task was created.
 * If yes → skip. If no → send contextual nudge.
 */
async function executeNudgeWaiting(task, waPhone) {
  if (task.lead_id) {
    const { data: recentMsg } = await supabase
      .from('conversations')
      .select('id')
      .eq('lead_id', task.lead_id)
      .eq('sender', 'customer')
      .gt('created_at', task.created_at)
      .limit(1);

    if (recentMsg && recentMsg.length > 0) {
      return { skipped: true, reason: 'Lead responded' };
    }
  }

  const lastQuestion = (task.metadata?.last_question || '').toLowerCase();
  let message;

  if (lastQuestion.includes('time') || lastQuestion.includes('when') || lastQuestion.includes('day')) {
    message = `Hey ${task.lead_name}, just circling back. Did you figure out a good time?`;
  } else if (lastQuestion.includes('business') || lastQuestion.includes('do')) {
    message = `Hey ${task.lead_name}! Still curious about your business. Would love to hear more when you get a sec.`;
  } else if (lastQuestion.includes('help') || lastQuestion.includes('need')) {
    message = `Hey ${task.lead_name}, just following up. Let me know how I can help!`;
  } else {
    message = `Hey ${task.lead_name}, just following up on our chat. Let me know if you have any questions!`;
  }

  return await executeSendMessage(task, waPhone, message);
}

/**
 * Human callback: admin scheduled a follow-up from a note.
 * Check if lead responded since task was created - if so, skip.
 */
async function executeHumanCallback(task, waPhone) {
  if (task.lead_id) {
    const { data: recentMsg } = await supabase
      .from('conversations')
      .select('id')
      .eq('lead_id', task.lead_id)
      .eq('sender', 'customer')
      .gt('created_at', task.created_at)
      .limit(1);

    if (recentMsg && recentMsg.length > 0) {
      return { skipped: true, reason: 'Lead responded since callback was scheduled' };
    }
  }

  return await executeSendMessage(task, waPhone,
    `Hey ${task.lead_name}, following up as promised. Got a few minutes to chat?`);
}

/**
 * First outreach: new inbound lead from Facebook/Google/website/form.
 * Always uses template since these leads have never messaged us - no 24h window.
 * After sending, schedules a nudge_waiting task 2 hours later.
 */
async function executeFirstOutreach(task, waPhone) {
  // Telegram approval gate - check before sending template to lead
  const gateResult = await approvalGate(task, waPhone, null, true);
  if (gateResult?.awaiting_approval) return gateResult;

  // Always send template directly - new leads have no 24h window
  const templateName = 'bcon_proxe_first_outreach';
  await sendWhatsAppTemplate(waPhone, {
    ...task,
    task_type: 'first_outreach',
  });

  // Log to conversations
  if (task.lead_id) {
    await supabase.from('conversations').insert({
      lead_id: task.lead_id,
      channel: 'whatsapp',
      sender: 'agent',
      content: `[Template: ${templateName}] First outreach to ${task.lead_name}`,
      message_type: 'text',
      metadata: { task_type: task.task_type, task_id: task.id, autonomous: true, template: templateName }
    }).then(({ error }) => {
      if (error) console.error('[FirstOutreach] Conversation log error:', error.message);
    });
  }

  // Schedule nudge_waiting 2 hours later
  // Use waPhone (already re-resolved by executeTask) - don't inherit potentially stale task.lead_phone
  const resolvedPhone = waPhone.replace(/\D/g, '').slice(-10);
  const { error } = await supabase.from('agent_tasks').insert({
    task_type: 'nudge_waiting',
    task_description: `Nudge: waiting for reply after first outreach to ${task.lead_name}`,
    lead_id: task.lead_id || null,
    lead_phone: resolvedPhone,
    lead_name: task.lead_name,
    status: 'pending',
    scheduled_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    metadata: {
      source: task.metadata?.source || 'inbound',
      campaign: task.metadata?.campaign || null,
      sequence: 'first_outreach',
      step: 1,
      total_steps: 4,
      last_question: 'What\'s the biggest challenge in your business right now?',
      prev_task_id: task.id,
    },
    created_at: new Date().toISOString(),
  });
  if (error) console.error(`[FirstOutreach] Failed to create nudge:`, error.message);
  else console.log(`[FirstOutreach] Nudge scheduled for ${task.lead_name} in 2h`);

  return null;
}

/**
 * Post-booking follow-up: check if booking happened and send check-in.
 * Also starts post_call sequence if from admin note.
 */
async function executePostBookingFollowup(task, waPhone) {
  const result = await executeSendMessage(task, waPhone,
    `Hey ${task.lead_name}! How did the call go? Anything else you need from us?`);
  // If this is a post_call sequence step 0, schedule next step
  if (task.metadata?.sequence === 'post_call') {
    const phone10 = waPhone.replace(/\D/g, '').slice(-10);
    await scheduleNextSequenceStep(task, 'follow_up_day1', 1, 24 * 60 * 60 * 1000, 'post_call', phone10);
  }
  return result;
}

/**
 * Execute a sequence step: check if lead responded → cancel remaining if yes, send if no.
 */
async function executeSequenceStep(task, waPhone, message) {
  const sequence = task.metadata?.sequence;
  const step = task.metadata?.step || 0;

  // Smart check: did the lead respond since the sequence started?
  if (task.lead_id) {
    const { data: recentMsg } = await supabase
      .from('conversations')
      .select('id')
      .eq('lead_id', task.lead_id)
      .eq('sender', 'customer')
      .gt('created_at', task.created_at)
      .limit(1);

    if (recentMsg && recentMsg.length > 0) {
      // Lead responded - cancel all remaining sequence tasks
      if (sequence) await cancelSequenceTasks(task.lead_id, sequence);
      return { skipped: true, reason: `Lead responded - cancelled ${sequence} sequence` };
    }
  }

  // Send the message
  const result = await executeSendMessage(task, waPhone, message);

  // Schedule next step based on current task type - pass resolved phone so child tasks get the correct number
  const phone10 = waPhone.replace(/\D/g, '').slice(-10);
  if (task.task_type === 'follow_up_day1') {
    await scheduleNextSequenceStep(task, 'follow_up_day3', 2, 2 * 24 * 60 * 60 * 1000, sequence, phone10);
  } else if (task.task_type === 'follow_up_day3') {
    await scheduleNextSequenceStep(task, 'follow_up_day5', 3, 2 * 24 * 60 * 60 * 1000, sequence, phone10);
  } else if (task.task_type === 'follow_up_day5') {
    // Escalate: mark lead as Cold
    if (task.lead_id) {
      await supabase.from('all_leads').update({ lead_stage: 'Cold' }).eq('id', task.lead_id);
      console.log(`[Sequence] Lead ${task.lead_name} marked as Cold`);
    }
    await scheduleNextSequenceStep(task, 're_engage', 4, 2 * 24 * 60 * 60 * 1000, sequence, phone10);
  } else if (task.task_type === 're_engage' && step === 4) {
    // Final step - mark as Closed Lost
    if (task.lead_id) {
      await supabase.from('all_leads').update({ lead_stage: 'Closed Lost', stage_override: true }).eq('id', task.lead_id);
      console.log(`[Sequence] Lead ${task.lead_name} marked as Closed Lost - sequence complete`);
    }
  }

  return result;
}

/**
 * Schedule the next step in a sequence.
 */
async function scheduleNextSequenceStep(task, nextType, nextStep, delayMs, sequence, resolvedPhone) {
  const phone = resolvedPhone || task.lead_phone;
  const { error } = await supabase.from('agent_tasks').insert({
    task_type: nextType,
    task_description: `Sequence step ${nextStep}/4: ${nextType} for ${task.lead_name}`,
    lead_id: task.lead_id || null,
    lead_phone: phone,
    lead_name: task.lead_name,
    status: 'pending',
    scheduled_at: new Date(Date.now() + delayMs).toISOString(),
    metadata: { ...task.metadata, sequence: sequence || 'post_call', step: nextStep, total_steps: 4, prev_task_id: task.id },
    created_at: new Date().toISOString(),
  });
  if (error) console.error(`[Sequence] Failed to create ${nextType}:`, error.message);
  else console.log(`[Sequence] Created ${nextType} (step ${nextStep}) for ${task.lead_name}`);
}

/**
 * Cancel all pending sequence tasks for a lead.
 */
async function cancelSequenceTasks(leadId, sequence) {
  const { data: tasks, error } = await supabase
    .from('agent_tasks')
    .select('id, task_type')
    .eq('lead_id', leadId)
    .eq('status', 'pending')
    .filter('metadata->>sequence', 'eq', sequence);

  if (error || !tasks || tasks.length === 0) return;

  for (const t of tasks) {
    await supabase.from('agent_tasks').update({
      status: 'cancelled',
      completed_at: new Date().toISOString(),
      error_message: 'Lead responded - sequence cancelled',
    }).eq('id', t.id);
  }
  console.log(`[Sequence] Cancelled ${tasks.length} remaining ${sequence} tasks for lead ${leadId}`);
}

/**
 * Push to book: check if lead booked since task was created.
 * If yes → skip. If no → nudge toward booking.
 */
async function executePushToBook(task, waPhone) {
  if (task.lead_id) {
    // Check if any booking reminder tasks exist for this lead (means they booked)
    const { data: bookingTasks } = await supabase
      .from('agent_tasks')
      .select('id')
      .eq('lead_id', task.lead_id)
      .in('task_type', ['booking_reminder_24h', 'booking_reminder_1h', 'booking_reminder_30m'])
      .gt('created_at', task.created_at)
      .limit(1);

    if (bookingTasks && bookingTasks.length > 0) {
      return { skipped: true, reason: 'Lead booked since task was created' };
    }
  }

  return await executeSendMessage(task, waPhone,
    `Hey ${task.lead_name}! We had a great chat earlier. Would love to set up a quick AI Brand Audit for your business. Basically we map out exactly where AI plugs in for you. When works this week?`);
}

// ============================================
// TELEGRAM APPROVAL GATE
// ============================================

/**
 * Send a message via Telegram Bot API.
 * Optional reply_markup for inline keyboards.
 */
async function sendTelegram(chatId, text, replyMarkup) {
  if (!TELEGRAM_BOT_TOKEN) return;
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const payload = { chat_id: chatId, text, parse_mode: 'HTML' };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Telegram API error: ${res.status} ${errBody}`);
  }
}

/**
 * Acknowledge a Telegram callback query (removes the "loading" spinner on the button).
 */
async function answerCallbackQuery(callbackQueryId, text) {
  if (!TELEGRAM_BOT_TOKEN) return;
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  }).catch(() => {});
}

/**
 * Resolve service_interest and pain_point from lead record / task metadata.
 */
function resolveLeadContext(task, lead) {
  const ctx = lead?.unified_context || {};
  const formData = ctx.form_data || ctx.whatsapp?.profile || ctx.web?.profile || {};
  const serviceInterest =
    formData.business_type || formData.service ||
    task.metadata?.service_interest || task.metadata?.business_type ||
    task.metadata?.campaign || 'business growth';
  const painPoint =
    task.metadata?.pain_point || formData.pain_point || serviceInterest;
  return { serviceInterest, painPoint };
}

/**
 * Determine if a lead is "engaged" (3+ responses) or "noengage".
 */
function isEngaged(lead) {
  return (lead?.response_count || 0) >= 3;
}

/**
 * Build a human-readable template preview showing template name and parameters.
 */
function getTemplatePreview(task, lead) {
  const leadName = task.lead_name || 'there';
  const taskType = task.task_type || '';
  const { serviceInterest, painPoint } = resolveLeadContext(task, lead);
  const bookingTime = task.metadata?.booking_time || 'your scheduled time';
  const engaged = isEngaged(lead);

  if (taskType === 'booking_reminder_24h' || taskType === 'reminder_24h') {
    return {
      name: 'bcon_proxe_booking_reminder_24h',
      params: [
        { label: 'Name', value: leadName },
        { label: 'Time', value: bookingTime },
        { label: 'Service', value: serviceInterest },
      ],
    };
  } else if (taskType === 'booking_reminder_30m' || taskType === 'reminder_30m' || taskType === 'booking_reminder_1h' || taskType === 'reminder_1h') {
    return {
      name: 'bcon_proxe_booking_reminder_30m',
      params: [
        { label: 'Name', value: leadName },
        { label: 'Service', value: serviceInterest },
        { label: 'Time', value: bookingTime },
      ],
    };
  } else if (taskType === 're_engage') {
    if (engaged) {
      return {
        name: 'bcon_proxe_reengagement_engaged',
        params: [
          { label: 'Name', value: leadName },
          { label: 'Pain Point', value: painPoint },
        ],
      };
    }
    return { name: 'bcon_proxe_reengagement_noengage', params: [{ label: 'Name', value: leadName }] };
  } else if (taskType === 'first_outreach') {
    return { name: 'bcon_proxe_first_outreach', params: [{ label: 'Name', value: leadName }] };
  } else if (taskType === 'post_call_followup') {
    return { name: 'bcon_proxe_post_call_followup', params: [{ label: 'Name', value: leadName }] };
  } else if (taskType === 'nudge_waiting' || taskType === 'push_to_book' || taskType.startsWith('follow_up_day') || taskType === 'missed_call_followup' || taskType === 'human_callback' || taskType === 'follow_up_24h') {
    if (engaged) {
      return {
        name: 'bcon_proxe_followup_engaged',
        params: [
          { label: 'Name', value: leadName },
          { label: 'Service', value: serviceInterest },
        ],
      };
    }
    return {
      name: 'bcon_proxe_followup_noengage',
      params: [
        { label: 'Name', value: leadName },
        { label: 'Service', value: serviceInterest },
      ],
    };
  } else {
    return { name: 'bcon_proxe_rnr', params: [{ label: 'Name', value: leadName }] };
  }
}

/**
 * Telegram approval gate - runs before any message is sent to a lead.
 *
 * 'approve' mode: sends preview to Telegram, blocks the send, returns awaiting_approval.
 * 'notify' mode: sends heads-up to Telegram, lets the send proceed.
 * If Telegram is not configured, lets the send proceed silently.
 */
async function approvalGate(task, waPhone, message, isTemplate) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_ADMIN_CHAT_ID) return null;

  const phone10 = waPhone.replace(/\D/g, '').slice(-10);
  let msgPreview;
  if (isTemplate) {
    // Fetch lead record for context-aware template preview
    let lead = null;
    if (task.lead_id) {
      const { data } = await supabase.from('all_leads')
        .select('id, response_count, unified_context')
        .eq('id', task.lead_id).maybeSingle();
      lead = data;
    }
    const tplInfo = getTemplatePreview(task, lead);
    msgPreview = `Template: ${tplInfo.name}\n${tplInfo.params.map(p => `${p.label}: ${p.value}`).join('\n')}`;
  } else {
    msgPreview = message;
  }
  const scheduledAt = task.scheduled_at
    ? new Date(task.scheduled_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    : 'now';

  if (APPROVAL_MODE === 'approve') {
    const body =
      `<b>PROXE APPROVAL NEEDED</b>\n\n` +
      `Lead: ${task.lead_name} (${phone10})\n` +
      `Type: ${task.task_type}\n` +
      `Scheduled: ${scheduledAt}\n\n` +
      `Message that will be sent:\n<i>${escapeHtml(msgPreview)}</i>`;
    const keyboard = {
      inline_keyboard: [[
        { text: 'Approve', callback_data: `approve_${task.id}` },
        { text: 'Reject', callback_data: `reject_${task.id}` },
      ]],
    };
    try {
      await sendTelegram(TELEGRAM_ADMIN_CHAT_ID, body, keyboard);
      console.log(`[TelegramGate] Approval request sent for ${task.task_type} → ${task.lead_name}`);
    } catch (err) {
      console.error(`[TelegramGate] Failed to send approval request:`, err.message);
    }
    return { awaiting_approval: true, message_preview: msgPreview };
  }

  // 'notify' mode - send heads-up to Telegram, don't block
  const body =
    `<b>PROXE TASK FIRING</b>\n\n` +
    `Lead: ${task.lead_name} (${phone10})\n` +
    `Type: ${task.task_type}\n` +
    `Scheduled: ${scheduledAt}\n\n` +
    `Message:\n<i>${escapeHtml(msgPreview)}</i>\n\n` +
    `Status: SENT`;
  try {
    await sendTelegram(TELEGRAM_ADMIN_CHAT_ID, body);
  } catch (err) {
    console.error(`[TelegramGate] Failed to notify:`, err.message);
  }
  return null;
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Poll Telegram for inline keyboard button presses (callback_query updates).
 * Uses getUpdates with offset to only fetch new updates since last check.
 * Persists offset to a file so it survives process restarts.
 */
async function pollTelegramApprovals() {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_ADMIN_CHAT_ID) return;

  let offset = 0;
  try {
    if (fs.existsSync(TELEGRAM_OFFSET_FILE)) {
      offset = parseInt(fs.readFileSync(TELEGRAM_OFFSET_FILE, 'utf8').trim(), 10) || 0;
    }
  } catch (_) {}

  let updates;
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offset, timeout: 0, limit: 50, allowed_updates: ['callback_query'] }),
    });
    if (!res.ok) {
      console.error(`[TelegramPoll] getUpdates failed: ${res.status}`);
      return;
    }
    const data = await res.json();
    updates = data.result || [];
  } catch (err) {
    console.error(`[TelegramPoll] Error fetching updates:`, err.message);
    return;
  }

  if (updates.length === 0) return;

  let maxUpdateId = offset;
  let processed = 0;

  for (const update of updates) {
    if (update.update_id >= maxUpdateId) maxUpdateId = update.update_id + 1;

    const callback = update.callback_query;
    if (!callback) continue;

    const chatId = String(callback.message?.chat?.id || '');
    const callbackData = callback.data || '';

    // Only process button presses from the admin chat
    if (chatId !== String(TELEGRAM_ADMIN_CHAT_ID)) continue;

    const approveMatch = callbackData.match(/^approve_([a-f0-9-]+)/i);
    const rejectMatch = callbackData.match(/^reject_([a-f0-9-]+)/i);

    if (approveMatch) {
      await answerCallbackQuery(callback.id, 'Approving...');
      await handleTelegramApprove(approveMatch[1], chatId);
      processed++;
    } else if (rejectMatch) {
      await answerCallbackQuery(callback.id, 'Rejecting...');
      await handleTelegramReject(rejectMatch[1], chatId);
      processed++;
    }
  }

  // Persist offset
  try {
    fs.writeFileSync(TELEGRAM_OFFSET_FILE, String(maxUpdateId));
  } catch (err) {
    console.error(`[TelegramPoll] Failed to save offset:`, err.message);
  }

  if (processed > 0) {
    console.log(`[TelegramPoll] Processed ${processed} approval commands`);
  }
}

/**
 * Handle /approve_{task_id}: fetch task, send the WhatsApp message, mark completed.
 */
async function handleTelegramApprove(taskId, chatId) {
  const { data: task, error } = await supabase
    .from('agent_tasks')
    .select('*')
    .eq('id', taskId)
    .maybeSingle();

  if (error || !task) {
    await sendTelegram(chatId, `Task ${taskId} not found.`).catch(() => {});
    return;
  }

  if (task.status !== 'awaiting_approval') {
    await sendTelegram(chatId, `Task already ${task.status}.`).catch(() => {});
    return;
  }

  try {
    // Re-resolve phone (same logic as executeTask)
    let phone = task.lead_phone?.replace(/\D/g, '');
    if (task.lead_id) {
      const { data: freshLead } = await supabase
        .from('all_leads')
        .select('customer_phone_normalized')
        .eq('id', task.lead_id)
        .maybeSingle();
      if (freshLead?.customer_phone_normalized) {
        phone = freshLead.customer_phone_normalized.replace(/\D/g, '');
      }
    }
    if (!phone) throw new Error('No phone number');
    const waPhone = phone.length === 10 ? `91${phone}` : phone;

    // Send the actual WhatsApp message (stored in error_message as message_preview)
    const message = task.error_message || `Hey ${task.lead_name}, following up!`;
    const within24h = task.lead_id ? await isWithin24hWindow(task.lead_id) : true;

    if (within24h) {
      await sendWhatsApp(waPhone, message);
    } else {
      await sendWhatsAppTemplate(waPhone, task);
    }

    // Log to conversations
    if (task.lead_id) {
      await supabase.from('conversations').insert({
        lead_id: task.lead_id,
        channel: 'whatsapp',
        sender: 'agent',
        content: message,
        message_type: 'text',
        metadata: { task_type: task.task_type, task_id: task.id, autonomous: true, approved_via: 'telegram' },
      });
    }

    await supabase.from('agent_tasks').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      error_message: null,
    }).eq('id', taskId);

    await sendTelegram(chatId, `Approved. Sent to ${task.lead_name}.`).catch(() => {});
    console.log(`[TelegramApprove] Sent ${task.task_type} to ${task.lead_name}`);
  } catch (err) {
    await supabase.from('agent_tasks').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: err.message,
    }).eq('id', taskId);
    await sendTelegram(chatId, `Approved but send failed: ${err.message}`).catch(() => {});
    console.error(`[TelegramApprove] Send failed for ${task.lead_name}:`, err.message);
  }
}

/**
 * Handle /reject_{task_id}: cancel the task.
 */
async function handleTelegramReject(taskId, chatId) {
  const { data: task, error } = await supabase
    .from('agent_tasks')
    .select('id, status, lead_name, task_type')
    .eq('id', taskId)
    .maybeSingle();

  if (error || !task) {
    await sendTelegram(chatId, `Task ${taskId} not found.`).catch(() => {});
    return;
  }

  if (task.status !== 'awaiting_approval') {
    await sendTelegram(chatId, `Task already ${task.status}.`).catch(() => {});
    return;
  }

  await supabase.from('agent_tasks').update({
    status: 'cancelled',
    completed_at: new Date().toISOString(),
    error_message: 'Rejected via Telegram',
  }).eq('id', taskId);

  await sendTelegram(chatId, `Rejected. ${task.task_type} for ${task.lead_name} cancelled.`).catch(() => {});
  console.log(`[TelegramReject] Cancelled ${task.task_type} for ${task.lead_name}`);
}

// ============================================
// MESSAGE SENDING (with 24h window check + approval gate)
// ============================================

/**
 * Send a message via WhatsApp. Checks 24h window first.
 * Falls back to template message if outside window.
 * Runs through Telegram approval gate before sending.
 */
async function executeSendMessage(task, waPhone, message) {
  const within24h = task.lead_id ? await isWithin24hWindow(task.lead_id) : true;

  // Telegram approval gate - check before sending anything to the lead
  const gateResult = await approvalGate(task, waPhone, message, !within24h);
  if (gateResult?.awaiting_approval) return gateResult;

  if (within24h) {
    await sendWhatsApp(waPhone, message);
  } else {
    const templateUsed = await sendWhatsAppTemplate(waPhone, task);
    message = `[Template: ${templateUsed}] Sent to ${task.lead_name}`;
  }

  // Log to conversations
  if (task.lead_id) {
    await supabase.from('conversations').insert({
      lead_id: task.lead_id,
      channel: 'whatsapp',
      sender: 'agent',
      content: message,
      message_type: 'text',
      metadata: { task_type: task.task_type, task_id: task.id, autonomous: true }
    }).then(({ error }) => {
      if (error) console.error('[executeTask] Conversation log error:', error.message);
    });
  }

  return null;
}

/**
 * Check if lead's last customer message was within 24 hours.
 */
async function isWithin24hWindow(leadId) {
  const { data: lastCustomerMsg } = await supabase
    .from('conversations')
    .select('created_at')
    .eq('lead_id', leadId)
    .eq('sender', 'customer')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lastCustomerMsg) return false;

  const hoursSince = (Date.now() - new Date(lastCustomerMsg.created_at).getTime()) / (1000 * 60 * 60);
  return hoursSince < 24;
}

// ============================================
// WHATSAPP SEND - Free-form (Meta Cloud API v21.0)
// ============================================
async function sendWhatsApp(phone, message) {
  const url = `https://graph.facebook.com/v21.0/${WA_PHONE_ID}/messages`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WA_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'text',
      text: { body: message }
    })
  });

  if (!res.ok) {
    const errBody = await res.text();
    if (errBody.includes('131047') || errBody.includes('Re-engagement message')) {
      const err = new Error(`24h_window expired for ${phone}`);
      err.is24hWindow = true;
      throw err;
    }
    throw new Error(`WhatsApp API error: ${res.status} ${errBody}`);
  }

  console.log(`[WhatsApp] Sent to ${phone}: ${message.substring(0, 50)}...`);
}

// ============================================
// WHATSAPP SEND - Template (outside 24h window)
// Routes to the correct template per task type.
// ============================================
async function sendWhatsAppTemplate(phone, task) {
  // Fetch lead record for context-aware template selection
  let lead = null;
  if (task.lead_id) {
    const { data } = await supabase.from('all_leads')
      .select('id, response_count, unified_context')
      .eq('id', task.lead_id).maybeSingle();
    lead = data;
  }

  const tplInfo = getTemplatePreview(task, lead);
  const templateName = tplInfo.name;

  // Build components from the resolved params
  const components = [
    {
      type: 'body',
      parameters: tplInfo.params.map(p => ({ type: 'text', text: p.value })),
    }
  ];

  const url = `https://graph.facebook.com/v21.0/${WA_PHONE_ID}/messages`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WA_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en' },
        components,
      }
    })
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`WhatsApp Template API error (${templateName}): ${res.status} ${errBody}`);
  }

  console.log(`[WhatsApp] Template sent to ${phone} (${templateName})`);
  return templateName;
}

// ============================================
// HELPER: Create task if not already exists
// Dedup: ANY task with same task_type + lead_id in last 7 days (regardless of status)
// ============================================
async function createTaskIfNotExists({ taskType, leadId, leadPhone, leadName, scheduledAt, metadata, initialStatus }) {
  const status = initialStatus || 'pending';
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Check for ANY existing task with same type + lead in last 7 days (regardless of status)
  let dedupQuery = supabase
    .from('agent_tasks')
    .select('id')
    .eq('task_type', taskType)
    .gte('created_at', sevenDaysAgo)
    .limit(1);

  if (leadId) dedupQuery = dedupQuery.eq('lead_id', leadId);
  else dedupQuery = dedupQuery.eq('lead_phone', leadPhone);

  const { data: existingTask } = await dedupQuery;
  if (existingTask && existingTask.length > 0) return;

  const { error } = await supabase.from('agent_tasks').insert({
    task_type: taskType,
    task_description: `Auto: ${taskType} for ${leadName}`,
    lead_id: leadId || null,
    lead_phone: leadPhone,
    lead_name: leadName,
    scheduled_at: scheduledAt,
    status,
    metadata,
    created_at: new Date().toISOString()
  });

  if (error) {
    console.error(`[CreateTask] Error creating ${taskType} for ${leadName}:`, error.message);
  } else {
    console.log(`[CreateTask] Created ${taskType} (${status}) for ${leadName}, scheduled at ${scheduledAt}`);
  }
}

// Run
main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
