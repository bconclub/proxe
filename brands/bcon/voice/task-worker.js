/**
 * PROXe Autonomous Task Worker — Sequence Engine
 *
 * PM2 runs this every 5 minutes via cron_restart.
 * Processes flow tasks created by engine.ts (nudge, booking reminders, push-to-book)
 * AND scans for conditions (follow-ups, cold lead re-engagement).
 * Executes via WhatsApp with 24h window detection + template fallback.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const WA_TOKEN = process.env.META_WHATSAPP_ACCESS_TOKEN;
const WA_PHONE_ID = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
const WA_TEMPLATE_NAME = process.env.WA_TEMPLATE_NAME || 'bcon_followup';

async function main() {
  console.log(`[TaskWorker] Run started at ${new Date().toISOString()}`);

  try {
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
      const result = await executeTask(task);

      // If task was skipped (e.g. lead already responded), mark completed with note
      if (result && result.skipped) {
        await supabase.from('agent_tasks').update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          error_message: result.reason || 'Skipped — condition no longer applies',
        }).eq('id', task.id);
        console.log(`[ProcessTasks] Skipped: ${task.task_type} for ${task.lead_name} — ${result.reason}`);
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
// TASK EXECUTION — Route by type
// ============================================
async function executeTask(task) {
  const phone = task.lead_phone?.replace(/\D/g, '');
  if (!phone) throw new Error('No phone number');

  const waPhone = phone.length === 10 ? `91${phone}` : phone;

  switch (task.task_type) {
    // ── Flow tasks (created by engine.ts) ──
    case 'nudge_waiting':
      return await executeNudgeWaiting(task, waPhone);
    case 'booking_reminder_24h':
      return await executeSendMessage(task, waPhone,
        `Hey ${task.lead_name}! Just a reminder — you have a call with BCON Club tomorrow at ${task.metadata?.booking_time}. Looking forward to it!`);
    case 'booking_reminder_1h':
      return await executeSendMessage(task, waPhone,
        `Just a heads up ${task.lead_name}, your call is in about an hour at ${task.metadata?.booking_time}. Talk soon!`);
    case 'booking_reminder_30m':
      return await executeSendMessage(task, waPhone,
        `${task.lead_name}, your call starts in 30 minutes. Talk soon!`);
    case 'post_booking_followup':
      return await executePostBookingFollowup(task, waPhone);
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
        `Hey ${task.lead_name}! Just checking in — did you get a chance to think about what we discussed? Happy to answer any questions about setting up AI for your business.`);
    case 're_engage':
      return await executeSendMessage(task, waPhone,
        `Hi ${task.lead_name}! It's been a while since we connected. We've been building some exciting AI solutions for businesses like yours. Would love to catch up — what's a good time this week?`);
    case 'post_booking_confirmation':
      return await executeSendMessage(task, waPhone,
        `Great news ${task.lead_name}! Your call with BCON Club is confirmed for ${task.metadata?.booking_date} at ${task.metadata?.booking_time}. We'll discuss how to set up an AI system for your business. See you then!`);

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
    message = `Hey ${task.lead_name}, just circling back — did you figure out a good time?`;
  } else if (lastQuestion.includes('business') || lastQuestion.includes('do')) {
    message = `Hey ${task.lead_name}! Still curious about your business — would love to hear more when you get a sec.`;
  } else if (lastQuestion.includes('help') || lastQuestion.includes('need')) {
    message = `Hey ${task.lead_name}, just following up — let me know how I can help!`;
  } else {
    message = `Hey ${task.lead_name}, just following up on our chat — let me know if you have any questions!`;
  }

  return await executeSendMessage(task, waPhone, message);
}

/**
 * Post-booking follow-up: check if booking happened and send check-in.
 */
async function executePostBookingFollowup(task, waPhone) {
  return await executeSendMessage(task, waPhone,
    `Hey ${task.lead_name}! How did the call go? Anything else you need from us?`);
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
    `Hey ${task.lead_name}! We had a great chat earlier. Would love to set up a quick AI Brand Audit for your business — basically we map out exactly where AI plugs in for you. When works this week?`);
}

// ============================================
// MESSAGE SENDING (with 24h window check)
// ============================================

/**
 * Send a message via WhatsApp. Checks 24h window first.
 * Falls back to template message if outside window.
 */
async function executeSendMessage(task, waPhone, message) {
  const within24h = task.lead_id ? await isWithin24hWindow(task.lead_id) : true;

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
// WHATSAPP SEND — Free-form (Meta Cloud API v21.0)
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
// WHATSAPP SEND — Template (outside 24h window)
// Routes to the correct template per task type.
// ============================================
async function sendWhatsAppTemplate(phone, task) {
  const leadName = task.lead_name || 'there';
  const taskType = task.task_type || '';

  // Pick template + parameters based on task type
  let templateName;
  let components;

  if (taskType.includes('booking_reminder') || taskType === 'reminder_24h' || taskType === 'reminder_1h' || taskType === 'reminder_30m') {
    templateName = 'bcon_booking_reminder';
    components = [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: leadName },
          { type: 'text', text: task.metadata?.booking_time || 'your scheduled time' },
        ]
      }
    ];
  } else if (taskType === 're_engage') {
    templateName = 'bcon_reengagement';
    components = [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: leadName },
        ]
      }
    ];
  } else {
    // follow_up_24h, nudge_waiting, push_to_book, and any other type
    templateName = 'bcon_followup';
    components = [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: leadName },
        ]
      }
    ];
  }

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
// Dedup: pending (any age) + completed (last 7 days only)
// ============================================
async function createTaskIfNotExists({ taskType, leadId, leadPhone, leadName, scheduledAt, metadata, initialStatus }) {
  const status = initialStatus || 'pending';
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Check for existing pending/queued task (any age)
  let activeQuery = supabase
    .from('agent_tasks')
    .select('id')
    .eq('task_type', taskType)
    .in('status', ['pending', 'queued'])
    .limit(1);

  if (leadId) activeQuery = activeQuery.eq('lead_id', leadId);
  else activeQuery = activeQuery.eq('lead_phone', leadPhone);

  const { data: activeExists } = await activeQuery;
  if (activeExists && activeExists.length > 0) return;

  // Check for recently completed task (last 7 days only)
  let completedQuery = supabase
    .from('agent_tasks')
    .select('id')
    .eq('task_type', taskType)
    .eq('status', 'completed')
    .gte('completed_at', sevenDaysAgo)
    .limit(1);

  if (leadId) completedQuery = completedQuery.eq('lead_id', leadId);
  else completedQuery = completedQuery.eq('lead_phone', leadPhone);

  const { data: recentCompleted } = await completedQuery;
  if (recentCompleted && recentCompleted.length > 0) return;

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
