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
const VOBIZ_OUTBOUND_API_URL = process.env.VOBIZ_OUTBOUND_API_URL || null;
const VOBIZ_OUTBOUND_API_KEY = process.env.VOBIZ_OUTBOUND_API_KEY || null;

// ============================================
// HELPERS
// ============================================

/**
 * Format a time string to "H:MM AM/PM" (e.g. "3:00 PM").
 * Handles inputs like "3:00 PM", "15:00", "3pm", raw ISO, etc.
 */
function formatTimeTo12h(raw) {
  if (!raw) return 'your scheduled time';
  const s = raw.trim();
  // Already in "H:MM AM/PM" format
  if (/^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(s)) return s.toUpperCase().replace(/(AM|PM)/, ' $1').replace(/\s+/g, ' ');
  // 24h format "HH:MM"
  const m24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    let h = parseInt(m24[1], 10);
    const min = m24[2];
    const ampm = h >= 12 ? 'PM' : 'AM';
    if (h === 0) h = 12;
    else if (h > 12) h -= 12;
    return `${h}:${min} ${ampm}`;
  }
  // Fallback: return as-is if unrecognised
  return s;
}


// File to persist Telegram getUpdates offset across runs
const TELEGRAM_OFFSET_FILE = path.join(__dirname, '.telegram_offset');
const DAILY_REPORT_FILE = path.join(__dirname, '.last_daily_report');
const WEEKLY_REPORT_FILE = path.join(__dirname, '.last_weekly_report');

// ============================================
// LEAD TEMPERATURE - Timing Multipliers
// ============================================
const TEMPERATURE_MULTIPLIERS = {
  hot:  0.5,  // 50% shorter timers
  warm: 1.0,  // normal
  cool: 1.5,  // 50% longer timers
  cold: null,  // stop sequences, re-engage only
};

// Sequence day gaps per temperature (day1/day3/day5 pattern)
const TEMPERATURE_SEQUENCE_DAYS = {
  hot:  [1, 2, 3],   // day 1/2/3
  warm: [1, 3, 5],   // standard
  cool: [2, 5, 8],   // stretched
  cold: null,
};

/**
 * Fetch lead temperature and objections from unified_context.
 */
async function getLeadTemperatureData(leadId) {
  if (!leadId) return { temperature: 'warm', objections: [], channelPerf: null };
  const { data: lead } = await supabase
    .from('all_leads')
    .select('unified_context')
    .eq('id', leadId)
    .maybeSingle();
  const ctx = lead?.unified_context || {};
  return {
    temperature: ctx.lead_temperature || 'warm',
    objections: ctx.objections || [],
    channelPerf: ctx.channel_performance || null,
  };
}

/**
 * Apply temperature multiplier to a delay.
 */
function applyTemperatureDelay(delayMs, temperature) {
  const mult = TEMPERATURE_MULTIPLIERS[temperature];
  if (mult === null) return delayMs; // cold leads handled separately
  return Math.round(delayMs * mult);
}

/**
 * Get objection-aware message for follow-up.
 * Checks objections and avoids repeating the same angle.
 * Returns { message, message_angle } or null if no objection-specific angle needed.
 */
function getObjectionAwareMessage(leadName, objections, usedAngles) {
  if (!objections || objections.length === 0) return null;

  // Find most recent objection whose angle hasn't been used yet
  const angleMap = {
    price: {
      angle: 'value',
      message: `${leadName}, the businesses using this are seeing 3x return in the first month. It's not a cost, it's an investment that pays for itself. Want me to break down the numbers for your business?`,
    },
    timing: {
      angle: 'timing',
      message: `No rush ${leadName}. When the time is right, we'll be here. Just know that every week without this, you're leaving leads on the table. Whenever you're ready.`,
    },
    trust: {
      angle: 'proof',
      message: `${leadName}, totally get the hesitation. Here's what a business similar to yours achieved: 2x more leads in 30 days, all automated. Happy to show you a live demo anytime.`,
    },
    authority: {
      angle: 'authority',
      message: `${leadName}, that makes sense. Happy to hop on a quick call with your team so everyone's on the same page. When works for a 15-min group chat?`,
    },
    need: {
      angle: 'need',
      message: `${leadName}, fair enough! Quick question though - are you currently tracking how many leads you're missing after hours? Most businesses we talk to don't realize the gap until they see the data. Want a free audit?`,
    },
  };

  const used = new Set(usedAngles || []);

  // Try from most recent objection backward
  for (let i = objections.length - 1; i >= 0; i--) {
    const obj = objections[i];
    const mapped = angleMap[obj.type];
    if (mapped && !used.has(mapped.angle)) {
      return { message: mapped.message, message_angle: mapped.angle };
    }
  }

  return null; // All angles already used
}

// ============================================
// DYNAMIC NEXT-ACTION ENGINE
// Replaces fixed day 1/3/5 sequences with behavior-based decisions
// ============================================

// Angle rotation order by temperature (never repeat same angle twice in a row)
const ANGLE_ROTATION = {
  hot:  ['direct_ask', 'urgency', 'value', 'direct_ask'],
  warm: ['value', 'social_proof', 'direct_ask', 'value'],
  cool: ['value', 'social_proof', 'timing', 'value'],
  cold: ['value'],
};

// Message templates per angle
const ANGLE_MESSAGES = {
  value: (name, painPoint) =>
    painPoint
      ? `${name}, businesses dealing with "${painPoint}" are seeing 3x results after plugging in AI. Want me to show you how it maps to yours?`
      : `${name}, the businesses using our AI system are saving 15+ hours/week and getting 2x more leads. Want me to break down what that'd look like for you?`,
  urgency: (name) =>
    `${name}, we've got a few spots open for our AI Brand Audit this week. It's free and shows exactly where AI fits your business. Want me to lock one in?`,
  social_proof: (name, painPoint) =>
    painPoint
      ? `${name}, a business with the same challenge ("${painPoint}") just automated their entire follow-up. 2x more leads in 30 days. Happy to show you a live demo.`
      : `${name}, we just helped a business automate their sales follow-up. 2x more conversions. Happy to show you how it works.`,
  timing: (name) =>
    `No rush ${name}. When the timing's right, we'll be here. Just know every week without this, you're leaving leads on the table. Whenever you're ready, just reply here.`,
  direct_ask: (name) =>
    `${name}, want to book a quick 15-min call? We'll map out exactly where AI plugs into your business. When works this week?`,
};

/**
 * Get the next message angle, avoiding repeating the last used angle.
 * Returns the angle string from the rotation.
 */
function getNextAngle(temperature, anglesUsed) {
  const rotation = ANGLE_ROTATION[temperature] || ANGLE_ROTATION.warm;
  const lastAngle = anglesUsed?.length > 0 ? anglesUsed[anglesUsed.length - 1] : null;

  // Find the next angle in rotation that isn't the same as last
  for (const angle of rotation) {
    if (angle !== lastAngle) return angle;
  }
  return rotation[0]; // fallback
}

/**
 * Build a message from an angle template.
 */
function buildAngleMessage(leadName, angle, painPoint) {
  const builder = ANGLE_MESSAGES[angle] || ANGLE_MESSAGES.value;
  return builder(leadName, painPoint);
}

/**
 * calculateNextAction - Dynamic next-action engine.
 * Reads all lead context and decides what to do next.
 *
 * Returns: { action, channel, scheduledAt, messageAngle, reason, message }
 */
async function calculateNextAction(leadId, taskMetadata) {
  // Fetch full lead context in one query
  const { data: lead } = await supabase
    .from('all_leads')
    .select('id, customer_name, customer_phone_normalized, unified_context, last_interaction_at, lead_stage')
    .eq('id', leadId)
    .maybeSingle();

  if (!lead) return { action: 'stop', reason: 'Lead not found' };

  const ctx = lead.unified_context || {};
  const temperature = ctx.lead_temperature || 'warm';
  const responsePatterns = ctx.response_patterns || {};
  const channelPerf = ctx.channel_performance || {};
  const objections = ctx.objections || [];
  const painPoint = ctx.pain_point || null;
  const lastReadAt = ctx.last_read_at || null;
  const anglesUsed = taskMetadata?.angles_used || [];
  const channelsTried = taskMetadata?.channels_tried || [];
  const step = (taskMetadata?.step || 0) + 1;
  const sequence = taskMetadata?.sequence || 'dynamic';
  const leadName = lead.customer_name || 'there';

  // Hours since last interaction
  const hoursSinceInteraction = lead.last_interaction_at
    ? (Date.now() - new Date(lead.last_interaction_at).getTime()) / (1000 * 60 * 60)
    : 999;

  // Check if booking exists
  const { data: bookingTasks } = await supabase
    .from('agent_tasks')
    .select('id')
    .eq('lead_id', leadId)
    .in('task_type', ['booking_reminder_24h', 'booking_reminder_30m'])
    .in('status', ['pending', 'completed'])
    .limit(1);
  const hasBooking = bookingTasks && bookingTasks.length > 0;

  // Count follow-ups already sent in this sequence
  const { data: sentTasks } = await supabase
    .from('agent_tasks')
    .select('id')
    .eq('lead_id', leadId)
    .eq('status', 'completed')
    .in('task_type', ['follow_up_day1', 'follow_up_day3', 'follow_up_day5', 'nudge_waiting', 'push_to_book'])
    .filter('metadata->>sequence', 'eq', sequence);
  const followUpCount = sentTasks?.length || 0;

  // Check last WA message read/delivery status
  let lastWaStatus = null;
  const { data: lastMsg } = await supabase
    .from('conversations')
    .select('read_at, delivered_at, metadata')
    .eq('lead_id', leadId)
    .eq('channel', 'whatsapp')
    .eq('sender', 'agent')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastMsg) {
    if (lastMsg.read_at || lastMsg.metadata?.read_at) lastWaStatus = 'read';
    else if (lastMsg.delivered_at || lastMsg.metadata?.delivered_at) lastWaStatus = 'delivered';
    else lastWaStatus = 'not_delivered';
  }

  // ── COLD temperature ──
  if (temperature === 'cold') {
    // Check if cold but reading recent messages (warming back up)
    if (lastReadAt && (Date.now() - new Date(lastReadAt).getTime()) < 48 * 60 * 60 * 1000) {
      // Treat as cool, not cold
      const angle = getNextAngle('cool', anglesUsed);
      const gapMs = 3 * 24 * 60 * 60 * 1000; // 3 days
      const scheduledAt = getScheduledAtForActiveHour(gapMs, responsePatterns);
      return {
        action: 'follow_up',
        channel: 'whatsapp',
        scheduledAt,
        messageAngle: angle,
        message: buildAngleMessage(leadName, angle, painPoint),
        reason: `Cold lead but read recent message (warming up) — treating as cool, ${angle} angle, 3-day gap`,
      };
    }

    // Explicit "not interested" objection → stop completely
    const hasNotInterested = objections.some(o => o.type === 'need');
    if (hasNotInterested) {
      return { action: 'stop', reason: 'Cold lead with explicit not-interested objection — sequence done' };
    }

    // Natural cold → monthly re-engage only
    const scheduledAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return {
      action: 'reengagement',
      channel: 'whatsapp',
      scheduledAt,
      messageAngle: 'value',
      message: buildAngleMessage(leadName, 'value', painPoint),
      reason: 'Cold lead — monthly re-engage only',
    };
  }

  // ── HOT temperature ──
  if (temperature === 'hot') {
    if (hasBooking) {
      return { action: 'stop', reason: 'Hot lead with existing booking — reminders handle it' };
    }

    if (followUpCount < 3) {
      const gapMs = 1 * 60 * 60 * 1000; // 1 hour
      // Channel: whichever they respond fastest on
      const waAvg = channelPerf.whatsapp?.avg_response_time || 9999;
      const voiceAvg = channelPerf.voice?.avg_response_time || 9999;
      const channel = voiceAvg < waAvg && channelPerf.voice?.responses_received > 0 ? 'voice' : 'whatsapp';
      const angle = getNextAngle('hot', anglesUsed);
      const scheduledAt = new Date(Date.now() + gapMs);
      return {
        action: followUpCount === 0 ? 'push_to_book' : 'follow_up',
        channel,
        scheduledAt,
        messageAngle: angle,
        message: buildAngleMessage(leadName, angle, painPoint),
        reason: `Hot lead, ${followUpCount}/3 follow-ups sent, ${angle} angle, 1h gap, via ${channel}`,
      };
    }

    // 3+ follow-ups sent, still no booking → back off
    const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return {
      action: 'follow_up',
      channel: 'whatsapp',
      scheduledAt,
      messageAngle: 'value',
      message: buildAngleMessage(leadName, 'value', painPoint),
      reason: 'Hot lead but 3+ follow-ups sent — daily check-in',
    };
  }

  // ── WARM temperature ──
  if (temperature === 'warm') {
    const gapMs = 24 * 60 * 60 * 1000; // 1 day

    // If objection exists and not yet addressed with matching angle
    if (objections.length > 0) {
      const objAngleMap = { price: 'value', trust: 'social_proof', timing: 'timing', authority: 'direct_ask', need: 'social_proof' };
      for (let i = objections.length - 1; i >= 0; i--) {
        const matchAngle = objAngleMap[objections[i].type];
        if (matchAngle && !anglesUsed.includes(matchAngle)) {
          const scheduledAt = getScheduledAtForActiveHour(gapMs, responsePatterns);
          const channel = lastWaStatus === 'not_delivered' ? 'voice' : 'whatsapp';
          return {
            action: 'follow_up',
            channel,
            scheduledAt,
            messageAngle: matchAngle,
            message: buildAngleMessage(leadName, matchAngle, painPoint),
            reason: `Warm lead, objection "${objections[i].type}" → ${matchAngle} angle, 1-day gap`,
          };
        }
      }
    }

    // Read but no reply → nudge with value angle
    if (lastWaStatus === 'read') {
      const angle = getNextAngle('warm', anglesUsed);
      const scheduledAt = getScheduledAtForActiveHour(gapMs, responsePatterns);
      return {
        action: 'nudge',
        channel: 'whatsapp',
        scheduledAt,
        messageAngle: angle,
        message: buildAngleMessage(leadName, angle, painPoint),
        reason: `Warm lead, read but no reply, ${angle} angle`,
      };
    }

    // Not read → switch channel after 3 same-channel attempts
    if (lastWaStatus === 'not_delivered' || lastWaStatus === 'delivered') {
      const waAttempts = channelsTried.filter(c => c.channel === 'whatsapp').length;
      if (waAttempts >= 3) {
        const scheduledAt = getScheduledAtForActiveHour(gapMs, responsePatterns);
        return {
          action: 'voice_call',
          channel: 'voice',
          scheduledAt,
          messageAngle: 'direct_ask',
          reason: `Warm lead, ${waAttempts} WhatsApp attempts unread — escalating to voice`,
        };
      }
    }

    // Default warm follow-up
    const angle = getNextAngle('warm', anglesUsed);
    const scheduledAt = getScheduledAtForActiveHour(gapMs, responsePatterns);
    return {
      action: 'follow_up',
      channel: 'whatsapp',
      scheduledAt,
      messageAngle: angle,
      message: buildAngleMessage(leadName, angle, painPoint),
      reason: `Warm lead, standard 1-day follow-up, ${angle} angle`,
    };
  }

  // ── COOL temperature ──
  // (temperature === 'cool' or default)
  const coolGapMs = 3 * 24 * 60 * 60 * 1000; // 3 days

  // Timing objection → 2 weeks out
  const hasTimingObjection = objections.some(o => o.type === 'timing');
  if (hasTimingObjection && !anglesUsed.includes('timing')) {
    const scheduledAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    return {
      action: 'follow_up',
      channel: 'whatsapp',
      scheduledAt,
      messageAngle: 'timing',
      message: buildAngleMessage(leadName, 'timing', painPoint),
      reason: 'Cool lead with timing objection — scheduled 2 weeks out',
    };
  }

  // After 2 unanswered attempts → back off to weekly
  const unansweredWa = channelsTried.filter(c => c.channel === 'whatsapp' && c.result !== 'read').length;
  if (unansweredWa >= 2) {
    const weeklyGap = 7 * 24 * 60 * 60 * 1000;
    const angle = getNextAngle('cool', anglesUsed);
    const scheduledAt = getScheduledAtForActiveHour(weeklyGap, responsePatterns);
    return {
      action: 'follow_up',
      channel: 'whatsapp',
      scheduledAt,
      messageAngle: angle,
      message: buildAngleMessage(leadName, angle, painPoint),
      reason: `Cool lead, ${unansweredWa} unanswered — backed off to weekly, ${angle} angle`,
    };
  }

  // Default cool follow-up (never urgency or direct_ask)
  const angle = getNextAngle('cool', anglesUsed);
  const scheduledAt = getScheduledAtForActiveHour(coolGapMs, responsePatterns);
  return {
    action: 'follow_up',
    channel: 'whatsapp',
    scheduledAt,
    messageAngle: angle,
    message: buildAngleMessage(leadName, angle, painPoint),
    reason: `Cool lead, 3-day gap, ${angle} angle (nurture only)`,
  };
}

/**
 * Helper: calculate a scheduled time, snapped to lead's active hours.
 */
function getScheduledAtForActiveHour(delayMs, responsePatterns) {
  let scheduledAt = new Date(Date.now() + delayMs);
  const activeHours = responsePatterns?.active_hours;
  const preferredPart = responsePatterns?.preferred_day_parts;

  if (preferredPart || activeHours?.length) {
    let targetHour = 10;
    if (preferredPart === 'evening') targetHour = 18;
    else if (preferredPart === 'morning') targetHour = 9;
    else if (preferredPart === 'afternoon') targetHour = 14;

    const scheduledIST = new Date(scheduledAt.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    scheduledIST.setHours(targetHour, 0, 0, 0);
    const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    if (scheduledIST <= nowIST) scheduledIST.setDate(scheduledIST.getDate() + 1);
    const offsetMs = scheduledIST.getTime() - nowIST.getTime();
    scheduledAt = new Date(Date.now() + offsetMs);
  }

  return scheduledAt;
}

// ============================================
// ESCALATION CHAIN - Multi-channel fallback
// ============================================
// Step 1: WhatsApp free-form (within 24h)
// Step 2: WhatsApp template (outside 24h)
// Step 3: Voice call (outbound via Vobiz) - after 48h no response
// Step 4: WhatsApp missed call template (if voice no-answer)
// Step 5: WhatsApp different messaging angle (final attempt)
const ESCALATION_LEVELS = {
  WA_FREEFORM: 1,
  WA_TEMPLATE: 2,
  VOICE_CALL: 3,
  WA_MISSED_CALL: 4,
  WA_DIFFERENT_ANGLE: 5,
};

/**
 * Record a channel attempt in escalation state.
 * Returns updated channels_tried array and current_escalation_level.
 */
function recordChannelAttempt(taskMetadata, channel, result) {
  const channelsTried = [...(taskMetadata?.channels_tried || [])];
  channelsTried.push({
    channel,
    attempted_at: new Date().toISOString(),
    result, // 'sent', 'read', 'delivered', 'failed', 'no_answer', 'not_delivered'
  });
  const currentLevel = (taskMetadata?.current_escalation_level || 1) + 1;
  return { channels_tried: channelsTried, current_escalation_level: Math.min(currentLevel, 5) };
}

/**
 * Select the best channel for reaching a lead.
 * Reads channel_performance, channels_tried, read/delivery status.
 * Returns { channel: 'whatsapp'|'voice', reason: string }
 */
async function selectBestChannel(leadId, taskMetadata) {
  const channelsTried = taskMetadata?.channels_tried || [];
  const escalationLevel = taskMetadata?.current_escalation_level || 1;

  // Fetch lead data: channel_performance, response_patterns, last_read_at
  let channelPerf = null;
  let lastReadAt = null;
  let responsePatterns = null;
  if (leadId) {
    const { data: lead } = await supabase
      .from('all_leads')
      .select('unified_context')
      .eq('id', leadId)
      .maybeSingle();
    if (lead?.unified_context) {
      channelPerf = lead.unified_context.channel_performance || null;
      lastReadAt = lead.unified_context.last_read_at || null;
      responsePatterns = lead.unified_context.response_patterns || null;
    }
  }

  // Check last WhatsApp message delivery/read status
  let lastWaStatus = null;
  if (leadId) {
    const { data: lastMsg } = await supabase
      .from('conversations')
      .select('read_at, delivered_at, metadata')
      .eq('lead_id', leadId)
      .eq('channel', 'whatsapp')
      .eq('sender', 'agent')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastMsg) {
      const readAt = lastMsg.read_at || lastMsg.metadata?.read_at;
      const deliveredAt = lastMsg.delivered_at || lastMsg.metadata?.delivered_at;
      if (readAt) lastWaStatus = 'read';
      else if (deliveredAt) lastWaStatus = 'delivered';
      else lastWaStatus = 'not_delivered';
    }
  }

  // Rule 1: If WA messages are being read (last_read_at recent), stay on WhatsApp
  if (lastReadAt) {
    const hoursSinceRead = (Date.now() - new Date(lastReadAt).getTime()) / (1000 * 60 * 60);
    if (hoursSinceRead < 48) {
      return { channel: 'whatsapp', reason: `WhatsApp messages being read (last read ${Math.round(hoursSinceRead)}h ago)` };
    }
  }

  // Rule 2: If messages are not being delivered, escalate to voice
  if (lastWaStatus === 'not_delivered') {
    const waAttempts = channelsTried.filter(c => c.channel === 'whatsapp').length;
    if (waAttempts >= 2) {
      return { channel: 'voice', reason: `WhatsApp not delivered after ${waAttempts} attempts, escalating to voice` };
    }
  }

  // Rule 3: If escalation level >= 3, try voice
  if (escalationLevel >= ESCALATION_LEVELS.VOICE_CALL) {
    // Check if voice was already tried
    const voiceTried = channelsTried.some(c => c.channel === 'voice');
    if (!voiceTried) {
      return { channel: 'voice', reason: `Escalation level ${escalationLevel}, trying voice call` };
    }
  }

  // Rule 4: Check which channel historically gets best responses
  if (channelPerf) {
    const waPerf = channelPerf.whatsapp || {};
    const voicePerf = channelPerf.voice || {};
    const waResponseRate = waPerf.messages_sent > 0
      ? (waPerf.responses_received || 0) / waPerf.messages_sent
      : 0;
    const voiceResponseRate = voicePerf.messages_sent > 0
      ? (voicePerf.responses_received || 0) / voicePerf.messages_sent
      : 0;

    if (voiceResponseRate > waResponseRate && voiceResponseRate > 0.3) {
      return { channel: 'voice', reason: `Voice has better response rate (${Math.round(voiceResponseRate * 100)}% vs ${Math.round(waResponseRate * 100)}% WA)` };
    }
  }

  // Default: WhatsApp
  return { channel: 'whatsapp', reason: 'Default channel (WhatsApp)' };
}

/**
 * Update channel_performance metrics for a lead after an interaction.
 * Tracks per-channel: messages_sent, messages_read, responses_received,
 * avg_response_time, last_successful_contact
 */
async function updateChannelPerformance(leadId, channel, event, responseTimeSec) {
  if (!leadId) return;
  try {
    const { data: lead } = await supabase
      .from('all_leads')
      .select('unified_context')
      .eq('id', leadId)
      .maybeSingle();
    if (!lead) return;

    const ctx = lead.unified_context || {};
    const perf = ctx.channel_performance || {};
    const ch = perf[channel] || {
      messages_sent: 0,
      messages_read: 0,
      responses_received: 0,
      avg_response_time: null,
      last_successful_contact: null,
    };

    if (event === 'sent') {
      ch.messages_sent = (ch.messages_sent || 0) + 1;
    } else if (event === 'read') {
      ch.messages_read = (ch.messages_read || 0) + 1;
    } else if (event === 'response') {
      ch.responses_received = (ch.responses_received || 0) + 1;
      ch.last_successful_contact = new Date().toISOString();
      if (responseTimeSec != null && responseTimeSec > 0) {
        const prevAvg = ch.avg_response_time || responseTimeSec;
        const prevCount = Math.max((ch.responses_received || 1) - 1, 1);
        ch.avg_response_time = Math.round((prevAvg * prevCount + responseTimeSec) / (prevCount + 1));
      }
    }

    await supabase
      .from('all_leads')
      .update({
        unified_context: {
          ...ctx,
          channel_performance: { ...perf, [channel]: ch },
        },
      })
      .eq('id', leadId);
  } catch (err) {
    console.error(`[ChannelPerf] Failed to update ${channel}/${event} for ${leadId}:`, err.message);
  }
}

/**
 * Attempt an outbound voice call via Vobiz API.
 * Returns { success, call_id, duration, status } or throws on failure.
 */
async function attemptOutboundVoiceCall(phone, leadName) {
  if (!VOBIZ_OUTBOUND_API_URL || !VOBIZ_OUTBOUND_API_KEY) {
    return { success: false, reason: 'Vobiz outbound not configured' };
  }

  const waPhone = phone.length === 10 ? `91${phone}` : phone;
  try {
    const res = await fetch(VOBIZ_OUTBOUND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VOBIZ_OUTBOUND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: waPhone,
        caller_name: 'BCON Club',
        lead_name: leadName,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      return { success: false, reason: `Vobiz API error: ${res.status} ${errBody}` };
    }

    const data = await res.json();
    return {
      success: true,
      call_id: data.call_id || data.id || null,
      status: data.status || 'initiated',
    };
  } catch (err) {
    return { success: false, reason: `Vobiz call failed: ${err.message}` };
  }
}

/**
 * Execute a try_voice_call task.
 * 1. Attempt outbound call via Vobiz
 * 2. If Vobiz unavailable/fails, create dashboard notification
 * 3. If no answer, create missed_call_followup task
 */
async function executeVoiceCall(task, waPhone) {
  // Check if lead responded since task was created
  if (task.lead_id) {
    const { data: recentMsg } = await supabase
      .from('conversations')
      .select('id')
      .eq('lead_id', task.lead_id)
      .eq('sender', 'customer')
      .gt('created_at', task.created_at)
      .limit(1);

    if (recentMsg && recentMsg.length > 0) {
      return { skipped: true, reason: 'Lead responded before voice call' };
    }
  }

  const phone10 = waPhone.replace(/\D/g, '').slice(-10);
  const callResult = await attemptOutboundVoiceCall(phone10, task.lead_name);

  // Track channel attempt
  const escalation = recordChannelAttempt(task.metadata, 'voice', callResult.success ? 'sent' : 'failed');

  if (!callResult.success) {
    // Vobiz unavailable or failed → create dashboard notification for manual call
    const timingReason = `Voice call failed: ${callResult.reason}. Flagged for manual call.`;

    // Notify via Telegram
    if (TELEGRAM_BOT_TOKEN && TELEGRAM_ADMIN_CHAT_ID) {
      const body =
        `<b>📞 MANUAL CALL NEEDED</b>\n\n` +
        `Lead: ${task.lead_name} (${phone10})\n` +
        `Reason: ${callResult.reason}\n` +
        `WhatsApp messages not getting through.\n\n` +
        `Please call this lead manually and log the result.`;
      await sendTelegram(TELEGRAM_ADMIN_CHAT_ID, body).catch(() => {});
    }

    // Flag on the lead record
    if (task.lead_id) {
      const { data: lead } = await supabase
        .from('all_leads')
        .select('metadata, unified_context')
        .eq('id', task.lead_id)
        .maybeSingle();

      if (lead) {
        await supabase
          .from('all_leads')
          .update({
            needs_human_followup: true,
            metadata: {
              ...(lead.metadata || {}),
              needs_manual_call: true,
              manual_call_reason: callResult.reason,
              manual_call_flagged_at: new Date().toISOString(),
            },
          })
          .eq('id', task.lead_id);
      }
    }

    // Log to conversations
    if (task.lead_id) {
      await supabase.from('conversations').insert({
        lead_id: task.lead_id,
        channel: 'voice',
        sender: 'system',
        content: `[Voice call failed] ${callResult.reason}. Flagged for manual call.`,
        message_type: 'system',
        metadata: {
          task_type: 'try_voice_call',
          task_id: task.id,
          call_result: callResult,
          timing_reason: timingReason,
          ...escalation,
        },
      });
    }

    await updateChannelPerformance(task.lead_id, 'voice', 'sent', null);

    // Update task metadata with escalation state
    await supabase.from('agent_tasks').update({
      metadata: { ...task.metadata, ...escalation, timing_reason: timingReason, call_result: callResult },
    }).eq('id', task.id);

    console.log(`[VoiceCall] ${timingReason} for ${task.lead_name}`);
    return null;
  }

  // Call succeeded (initiated)
  const timingReason = `Voice call initiated (call_id: ${callResult.call_id})`;

  // Log to conversations
  if (task.lead_id) {
    await supabase.from('conversations').insert({
      lead_id: task.lead_id,
      channel: 'voice',
      sender: 'agent',
      content: `[Outbound voice call] Called ${task.lead_name}`,
      message_type: 'voice',
      metadata: {
        task_type: 'try_voice_call',
        task_id: task.id,
        call_id: callResult.call_id,
        call_status: callResult.status,
        timing_reason: timingReason,
        ...escalation,
      },
    });
  }

  await updateChannelPerformance(task.lead_id, 'voice', 'sent', null);

  // Update task metadata
  await supabase.from('agent_tasks').update({
    metadata: { ...task.metadata, ...escalation, timing_reason: timingReason, call_result: callResult },
  }).eq('id', task.id);

  // Schedule missed_call_followup in case of no answer (30 min later)
  // The voice server webhook should cancel this if the call connects
  await supabase.from('agent_tasks').insert({
    task_type: 'missed_call_followup',
    task_description: `Missed call follow-up for ${task.lead_name} after voice attempt`,
    lead_id: task.lead_id || null,
    lead_phone: phone10,
    lead_name: task.lead_name,
    status: 'pending',
    scheduled_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    metadata: {
      source: 'voice_escalation',
      prev_task_id: task.id,
      call_id: callResult.call_id,
      ...escalation,
      timing_reason: 'Scheduled 30min after voice call attempt in case of no answer',
    },
    created_at: new Date().toISOString(),
  });

  // Notify via Telegram
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_ADMIN_CHAT_ID) {
    const body =
      `<b>📞 VOICE CALL INITIATED</b>\n\n` +
      `Lead: ${task.lead_name} (${phone10})\n` +
      `Call ID: ${callResult.call_id}\n` +
      `Reason: WhatsApp escalation\n\n` +
      `Missed call follow-up queued for 30min.`;
    await sendTelegram(TELEGRAM_ADMIN_CHAT_ID, body).catch(() => {});
  }

  console.log(`[VoiceCall] ${timingReason} for ${task.lead_name}`);
  return null;
}

// ============================================
// DAILY REPORT
// ============================================

async function sendDailyReport() {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_ADMIN_CHAT_ID) return;

  const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const hourIST = nowIST.getHours();
  const minIST = nowIST.getMinutes();

  // Only run at 9:00-9:05 AM IST
  if (hourIST !== 9 || minIST > 5) return;

  // Check if already sent today
  const todayStr = nowIST.toISOString().split('T')[0];
  try {
    if (fs.existsSync(DAILY_REPORT_FILE)) {
      const lastSent = fs.readFileSync(DAILY_REPORT_FILE, 'utf8').trim();
      if (lastSent === todayStr) return;
    }
  } catch (_) {}

  try {
    const yesterdayStart = new Date(nowIST);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    yesterdayStart.setHours(0, 0, 0, 0);
    const todayStart = new Date(nowIST);
    todayStart.setHours(0, 0, 0, 0);

    // Yesterday's task stats
    const { data: yesterdayTasks } = await supabase
      .from('agent_tasks')
      .select('status, task_type, lead_name, lead_id')
      .gte('created_at', yesterdayStart.toISOString())
      .lt('created_at', todayStart.toISOString());

    const executed = (yesterdayTasks || []).filter(t => t.status === 'completed' || t.status === 'failed').length;
    const successful = (yesterdayTasks || []).filter(t => t.status === 'completed').length;
    const failed = (yesterdayTasks || []).filter(t => t.status === 'failed' || t.status === 'failed_24h_window').length;

    // Unique leads contacted
    const leadIds = [...new Set((yesterdayTasks || []).filter(t => t.lead_id && t.status === 'completed').map(t => t.lead_id))];

    // Responses received yesterday
    const { data: responses } = await supabase
      .from('conversations')
      .select('id')
      .eq('sender', 'customer')
      .gte('created_at', yesterdayStart.toISOString())
      .lt('created_at', todayStart.toISOString());

    // Today's upcoming tasks
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const { data: todayTasks } = await supabase
      .from('agent_tasks')
      .select('task_type, lead_name, scheduled_at')
      .eq('status', 'pending')
      .gte('scheduled_at', todayStart.toISOString())
      .lt('scheduled_at', tomorrowStart.toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(8);

    const upNextLines = (todayTasks || []).slice(0, 5).map(t => {
      const time = t.scheduled_at ? new Date(t.scheduled_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) : '?';
      return `• ${time}: ${t.task_type.replace(/_/g, ' ')} for ${t.lead_name || 'Unknown'}`;
    }).join('\n');

    // Hot leads
    const { data: hotLeads } = await supabase
      .from('all_leads')
      .select('customer_name, lead_score')
      .in('brand', ['bcon', 'default'])
      .not('lead_stage', 'in', '("Converted","Closed Won","Closed Lost")')
      .order('lead_score', { ascending: false })
      .limit(5);

    const hotLines = (hotLeads || [])
      .filter(l => l.lead_score && l.lead_score >= 60)
      .map(l => `• ${l.customer_name || 'Unknown'} (${l.lead_score})`)
      .join('\n');

    // Going cold
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const { data: coldLeads } = await supabase
      .from('all_leads')
      .select('customer_name')
      .in('brand', ['bcon', 'default'])
      .not('lead_stage', 'in', '("Converted","Closed Won","Closed Lost","Cold")')
      .lt('last_interaction_at', threeDaysAgo)
      .limit(5);
    const coldLines = (coldLeads || []).map(l => `• ${l.customer_name || 'Unknown'}`).join('\n');

    const dateStr = nowIST.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const body =
      `<b>PROXe Daily Report - ${dateStr}</b>\n\n` +
      `Tasks executed: ${executed}\n` +
      `Successful: ${successful}\n` +
      `Failed: ${failed}\n\n` +
      `Leads contacted: ${leadIds.length}\n` +
      `Responses received: ${(responses || []).length}\n\n` +
      `<b>Up next today:</b>\n${upNextLines || '(none scheduled)'}\n\n` +
      `<b>Hot leads:</b>\n${hotLines || '(none)'}\n\n` +
      `<b>Going cold:</b>\n${coldLines || '(none)'}`;

    await sendTelegram(TELEGRAM_ADMIN_CHAT_ID, body);
    fs.writeFileSync(DAILY_REPORT_FILE, todayStr);
    console.log('[DailyReport] Sent');
  } catch (err) {
    console.error('[DailyReport] Failed:', err.message);
  }
}

// ============================================
// TELEGRAM COMMANDS
// ============================================

async function pollTelegramCommands() {
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
      body: JSON.stringify({ offset, timeout: 0, limit: 50, allowed_updates: ['message'] }),
    });
    if (!res.ok) return;
    const data = await res.json();
    updates = data.result || [];
  } catch (err) {
    console.error('[TelegramCmd] Error fetching updates:', err.message);
    return;
  }

  if (updates.length === 0) return;

  let maxUpdateId = offset;
  let processed = 0;

  for (const update of updates) {
    if (update.update_id >= maxUpdateId) maxUpdateId = update.update_id + 1;

    const msg = update.message;
    if (!msg || String(msg.chat?.id) !== String(TELEGRAM_ADMIN_CHAT_ID)) continue;

    const text = (msg.text || '').trim().toLowerCase();
    const chatId = String(msg.chat.id);

    if (text === '/status') {
      const { data: pending } = await supabase.from('agent_tasks').select('id').eq('status', 'pending');
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const { data: completed } = await supabase.from('agent_tasks').select('id').eq('status', 'completed').gte('completed_at', todayStart.toISOString());
      const { data: activeLeads } = await supabase.from('all_leads').select('id').in('brand', ['bcon', 'default']).not('lead_stage', 'in', '("Converted","Closed Won","Closed Lost","Cold")');

      await sendTelegram(chatId,
        `<b>PROXe Status</b>\n\n` +
        `Pending tasks: ${(pending || []).length}\n` +
        `Completed today: ${(completed || []).length}\n` +
        `Active leads: ${(activeLeads || []).length}\n` +
        `Mode: ${getApprovalMode().toUpperCase()}`
      ).catch(() => {});
      processed++;
    } else if (text === '/hot') {
      const { data: leads } = await supabase
        .from('all_leads')
        .select('customer_name, customer_phone_normalized, lead_score, unified_context')
        .in('brand', ['bcon', 'default'])
        .not('lead_stage', 'in', '("Converted","Closed Won","Closed Lost")')
        .order('lead_score', { ascending: false })
        .limit(5);

      const lines = (leads || []).map(l => {
        const temp = l.unified_context?.lead_temperature || '?';
        const phone = l.customer_phone_normalized || '?';
        return `• ${l.customer_name || 'Unknown'} (${phone}) - Score: ${l.lead_score || 0}, Temp: ${temp}`;
      }).join('\n');

      await sendTelegram(chatId, `<b>Top 5 Leads</b>\n\n${lines || 'No active leads'}`).catch(() => {});
      processed++;
    } else if (text === '/next') {
      const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const { data: tasks } = await supabase
        .from('agent_tasks')
        .select('task_type, lead_name, scheduled_at')
        .eq('status', 'pending')
        .lte('scheduled_at', oneHourFromNow)
        .order('scheduled_at', { ascending: true })
        .limit(10);

      const lines = (tasks || []).map(t => {
        const time = t.scheduled_at ? new Date(t.scheduled_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) : '?';
        return `• ${time}: ${t.task_type.replace(/_/g, ' ')} → ${t.lead_name || 'Unknown'}`;
      }).join('\n');

      await sendTelegram(chatId, `<b>Firing Next Hour</b>\n\n${lines || 'Nothing scheduled'}`).catch(() => {});
      processed++;
    } else if (text === '/stop') {
      const { data: pending } = await supabase.from('agent_tasks').select('id').eq('status', 'pending');
      const count = (pending || []).length;
      if (count > 0) {
        await supabase.from('agent_tasks').update({
          status: 'cancelled',
          completed_at: new Date().toISOString(),
          error_message: 'Cancelled via /stop command',
        }).eq('status', 'pending');
      }
      await sendTelegram(chatId, `🛑 <b>ALL STOP</b>\n\nCancelled ${count} pending tasks.`).catch(() => {});
      console.log(`[TelegramCmd] /stop: cancelled ${count} pending tasks`);
      processed++;
    } else if (text === '/lockdown') {
      setApprovalMode('lockdown');
      await sendTelegram(chatId, '🔒 <b>LOCKDOWN activated.</b>').catch(() => {});
      processed++;
    } else if (text === '/smart') {
      setApprovalMode('smart');
      await sendTelegram(chatId, '🧠 <b>SMART mode activated.</b>').catch(() => {});
      processed++;
    } else if (text === '/approve') {
      setApprovalMode('approve');
      await sendTelegram(chatId, '✋ <b>APPROVE mode activated.</b>').catch(() => {});
      processed++;
    } else if (text === '/notify') {
      setApprovalMode('notify');
      await sendTelegram(chatId, '📢 <b>NOTIFY mode activated.</b>').catch(() => {});
      processed++;
    }
  }

  // Persist offset
  try {
    fs.writeFileSync(TELEGRAM_OFFSET_FILE, String(maxUpdateId));
  } catch (err) {
    console.error('[TelegramCmd] Failed to save offset:', err.message);
  }

  if (processed > 0) console.log(`[TelegramCmd] Processed ${processed} commands`);
}

// ============================================
// PROACTIVE INTELLIGENCE - Morning Briefing, Predictions, Unanswered Qs
// ============================================

const MORNING_BRIEFING_FILE = path.join(__dirname, '.last_morning_briefing');
const UNANSWERED_CHECK_FILE = path.join(__dirname, '.last_unanswered_check');

/**
 * Find leads whose last conversation message is an unanswered customer question.
 * Creates urgent follow-up tasks for each.
 */
async function findUnansweredQuestions() {
  try {
    // Leads with last message from customer containing '?' and no reply for 4+ hours
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

    const { data: leads } = await supabase
      .from('all_leads')
      .select('id, customer_name, customer_phone_normalized, last_interaction_at')
      .in('brand', ['bcon', 'default'])
      .not('customer_phone_normalized', 'is', null)
      .not('lead_stage', 'in', '("Converted","Closed Won","Closed Lost")')
      .lt('last_interaction_at', fourHoursAgo);

    if (!leads || leads.length === 0) return [];

    const unanswered = [];

    for (const lead of leads) {
      // Get last message for this lead
      const { data: lastMsg } = await supabase
        .from('conversations')
        .select('sender, content, created_at')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!lastMsg || lastMsg.sender !== 'customer') continue;
      if (!lastMsg.content || !lastMsg.content.includes('?')) continue;

      // Filter out Meta form auto-generated greetings (not real questions)
      const content = lastMsg.content;
      if (/^(hello|hi)!\s+i\s+filled/i.test(content) ||
          /filled\s+(in|out)\s+your\s+form/i.test(content)) {
        continue;
      }

      // Check no pending tasks exist for this lead
      const { data: pendingTasks } = await supabase
        .from('agent_tasks')
        .select('id')
        .eq('lead_id', lead.id)
        .eq('status', 'pending')
        .limit(1);

      if (pendingTasks && pendingTasks.length > 0) continue;

      unanswered.push({
        leadId: lead.id,
        name: lead.customer_name || 'Unknown',
        phone: lead.customer_phone_normalized,
        question: lastMsg.content.substring(0, 80),
        askedAt: lastMsg.created_at,
      });

      // Create urgent follow-up task
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: existingTask } = await supabase
        .from('agent_tasks')
        .select('id')
        .eq('lead_id', lead.id)
        .eq('task_type', 'nudge_waiting')
        .gte('created_at', sevenDaysAgo)
        .limit(1);

      if (!existingTask || existingTask.length === 0) {
        await supabase.from('agent_tasks').insert({
          task_type: 'nudge_waiting',
          task_description: `Urgent: unanswered question from ${lead.customer_name || 'lead'} - "${lastMsg.content.substring(0, 60)}..."`,
          lead_id: lead.id,
          lead_phone: lead.customer_phone_normalized,
          lead_name: lead.customer_name || 'Lead',
          status: 'pending',
          scheduled_at: new Date().toISOString(),
          metadata: {
            source: 'unanswered_question',
            question: lastMsg.content.substring(0, 200),
            asked_at: lastMsg.created_at,
            timing_reason: 'Unanswered customer question detected',
            created_by: 'proactive_intelligence',
          },
          created_at: new Date().toISOString(),
        });
        console.log(`[Proactive] Created urgent task for unanswered question from ${lead.customer_name}`);
      }
    }

    return unanswered;
  } catch (err) {
    console.error('[Proactive] findUnansweredQuestions error:', err.message);
    return [];
  }
}

/**
 * Predict lead behavior from temperature_history and response_patterns.
 * Returns prediction object for task scheduling adjustments.
 */
function predictLeadBehavior(lead) {
  const ctx = lead.unified_context || {};
  const tempHistory = ctx.temperature_history || [];
  const patterns = ctx.response_patterns || {};
  const lastReadAt = ctx.last_read_at;
  const temperature = ctx.lead_temperature || 'warm';

  const prediction = {
    likelyToBook: false,
    likelyToChurn: false,
    bestHour: null,
    reengagementOpportunity: false,
    reason: [],
  };

  // Analyze temperature trend (last 3 entries)
  if (tempHistory.length >= 3) {
    const recent = tempHistory.slice(-3);
    const tempValues = { hot: 4, warm: 3, cool: 2, cold: 1 };
    const trend = (tempValues[recent[2]?.temperature] || 0) - (tempValues[recent[0]?.temperature] || 0);

    if (trend > 0) {
      prediction.likelyToBook = true;
      prediction.reason.push('temperature trending up');
    }
    if (trend < 0) {
      prediction.likelyToChurn = true;
      prediction.reason.push('temperature trending down');
    }
  }

  // Response times getting faster = more engaged
  const last5 = patterns.last_5_response_times || [];
  if (last5.length >= 3) {
    const recentAvg = last5.slice(-2).reduce((a, b) => a + b, 0) / 2;
    const olderAvg = last5.slice(0, -2).reduce((a, b) => a + b, 0) / Math.max(last5.length - 2, 1);
    if (recentAvg < olderAvg * 0.7) {
      prediction.likelyToBook = true;
      prediction.reason.push('response times getting faster');
    }
    if (recentAvg > olderAvg * 1.5) {
      prediction.likelyToChurn = true;
      prediction.reason.push('response times slowing down');
    }
  }

  // Best hour to reach: most common active hour
  const activeHours = patterns.active_hours || [];
  if (activeHours.length > 0) {
    prediction.bestHour = activeHours[Math.floor(activeHours.length / 2)]; // median
  }

  // Re-engagement opportunity: cold lead that just read a message
  if ((temperature === 'cold' || temperature === 'cool') && lastReadAt) {
    const hoursSinceRead = (Date.now() - new Date(lastReadAt).getTime()) / (1000 * 60 * 60);
    if (hoursSinceRead < 24) {
      prediction.reengagementOpportunity = true;
      prediction.reason.push('cold/cool lead read message within 24h');
    }
  }

  return prediction;
}

/**
 * Morning briefing: analyze all leads, create proactive tasks, send Telegram summary.
 * Runs at 8:30 AM IST.
 */
async function morningBriefing() {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_ADMIN_CHAT_ID) return;

  const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const hourIST = nowIST.getHours();
  const minIST = nowIST.getMinutes();

  // Only run at 8:30-8:35 AM IST
  if (hourIST !== 8 || minIST < 30 || minIST > 35) return;

  const todayStr = nowIST.toISOString().split('T')[0];
  try {
    if (fs.existsSync(MORNING_BRIEFING_FILE)) {
      if (fs.readFileSync(MORNING_BRIEFING_FILE, 'utf8').trim() === todayStr) return;
    }
  } catch (_) {}

  console.log('[MorningBriefing] Starting...');

  try {
    const priorityActions = [];
    const followUpActions = [];
    const warmingUp = [];
    const goingCold = [];
    let tasksCreated = 0;

    // Fetch all active leads
    const { data: leads } = await supabase
      .from('all_leads')
      .select('id, customer_name, customer_phone_normalized, lead_score, lead_stage, last_interaction_at, unified_context')
      .in('brand', ['bcon', 'default'])
      .not('lead_stage', 'in', '("Converted","Closed Won","Closed Lost")')
      .not('customer_phone_normalized', 'is', null);

    if (!leads || leads.length === 0) {
      fs.writeFileSync(MORNING_BRIEFING_FILE, todayStr);
      return;
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    for (const lead of leads) {
      const ctx = lead.unified_context || {};
      const temp = ctx.lead_temperature || 'warm';
      const score = lead.lead_score || 0;
      const lastInteraction = lead.last_interaction_at ? new Date(lead.last_interaction_at) : null;
      const name = lead.customer_name || 'Unknown';
      const phone = lead.customer_phone_normalized;

      // Run prediction
      const prediction = predictLeadBehavior(lead);

      // Check for existing pending tasks
      const { data: pendingTasks } = await supabase
        .from('agent_tasks')
        .select('id, task_type')
        .eq('lead_id', lead.id)
        .eq('status', 'pending')
        .limit(5);
      const hasPendingTasks = pendingTasks && pendingTasks.length > 0;
      const hasPendingBookPush = pendingTasks?.some(t => t.task_type === 'push_to_book');

      // Check for booking
      const { data: bookingTasks } = await supabase
        .from('agent_tasks')
        .select('id, scheduled_at, metadata')
        .eq('lead_id', lead.id)
        .in('task_type', ['booking_reminder_24h', 'booking_reminder_30m'])
        .eq('status', 'pending')
        .limit(1);
      const hasBooking = bookingTasks && bookingTasks.length > 0;

      // Determine best schedule hour for this lead
      const scheduleHour = prediction.bestHour || 10; // default 10 AM IST
      const scheduledIST = new Date(nowIST);
      scheduledIST.setHours(scheduleHour, 0, 0, 0);
      if (scheduledIST <= nowIST) scheduledIST.setHours(scheduledIST.getHours() + 2);
      const scheduleOffset = scheduledIST.getTime() - nowIST.getTime();
      const scheduledAt = new Date(Date.now() + scheduleOffset).toISOString();
      const timeStr = scheduledIST.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

      // ── High-score leads with no tasks and no booking ──
      if (score >= 70 && !hasPendingTasks && !hasBooking && !hasPendingBookPush) {
        await supabase.from('agent_tasks').insert({
          task_type: 'push_to_book',
          task_description: `Morning briefing: push high-score lead ${name} to book`,
          lead_id: lead.id, lead_phone: phone, lead_name: name,
          status: 'pending', scheduled_at: scheduledAt,
          metadata: { source: 'morning_briefing', lead_score: score, lead_temperature: temp, timing_reason: `Score ${score}, ${temp} — pushing to book at ${timeStr}`, created_by: 'proactive_intelligence' },
          created_at: new Date().toISOString(),
        });
        priorityActions.push(`${name} (score ${score}, ${temp}) - pushing to book at ${timeStr}`);
        tasksCreated++;
      }

      // ── Booking tomorrow: verify reminders exist ──
      if (hasBooking) {
        const bookingTime = bookingTasks[0].metadata?.booking_time || '?';
        priorityActions.push(`${name} has booking tomorrow at ${bookingTime} - reminders set`);
      }

      // ── Not contacted in 3+ days but warm ──
      if (lastInteraction && lastInteraction < threeDaysAgo && (temp === 'warm' || temp === 'hot') && !hasPendingTasks) {
        const daysSince = Math.floor((Date.now() - lastInteraction.getTime()) / (1000 * 60 * 60 * 24));
        await supabase.from('agent_tasks').insert({
          task_type: 'follow_up_day1',
          task_description: `Morning briefing: ${name} not contacted in ${daysSince} days`,
          lead_id: lead.id, lead_phone: phone, lead_name: name,
          status: 'pending', scheduled_at: scheduledAt,
          metadata: { source: 'morning_briefing', days_since_contact: daysSince, lead_temperature: temp, timing_reason: `${daysSince} days since contact, ${temp} lead — follow-up at ${timeStr}`, created_by: 'proactive_intelligence' },
          created_at: new Date().toISOString(),
        });
        followUpActions.push(`${name} hasn't heard from us in ${daysSince} days - reaching out at ${timeStr}`);
        tasksCreated++;
      }

      // ── Re-engagement opportunity: cold lead read recent message ──
      if (prediction.reengagementOpportunity && !hasPendingTasks) {
        await supabase.from('agent_tasks').insert({
          task_type: 'follow_up_day1',
          task_description: `Morning briefing: ${name} (cold) read recent message — re-engage`,
          lead_id: lead.id, lead_phone: phone, lead_name: name,
          status: 'pending', scheduled_at: scheduledAt,
          metadata: { source: 'morning_briefing', prediction: 'reengagement_opportunity', lead_temperature: temp, timing_reason: `Cold lead read message recently — nudging at ${timeStr}`, created_by: 'proactive_intelligence' },
          created_at: new Date().toISOString(),
        });
        warmingUp.push(`${name} read our last message yesterday - nudging at ${timeStr}`);
        tasksCreated++;
      }

      // ── Temperature trend: warming up ──
      if (prediction.likelyToBook && !prediction.reengagementOpportunity) {
        warmingUp.push(`${name} — ${prediction.reason.join(', ')}`);
      }

      // ── Going cold: no engagement 7+ days ──
      if (lastInteraction && lastInteraction < sevenDaysAgo && temp !== 'cold') {
        goingCold.push(name);
      }

      // ── Went warm→cool in last 24h ──
      const tempHistory = ctx.temperature_history || [];
      if (tempHistory.length >= 2) {
        const last = tempHistory[tempHistory.length - 1];
        const prev = tempHistory[tempHistory.length - 2];
        if (last.temperature === 'cool' && prev.temperature === 'warm' && new Date(last.timestamp) > oneDayAgo) {
          goingCold.push(`${name} (warm→cool in 24h)`);
        }
      }
    }

    // Find unanswered questions
    const unanswered = await findUnansweredQuestions();
    for (const u of unanswered) {
      followUpActions.push(`${u.name} asked "${u.question}" — fixing now`);
      tasksCreated++;
    }

    // Count total tasks for today
    const todayStart = new Date(nowIST); todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const { data: allTodayTasks } = await supabase
      .from('agent_tasks')
      .select('id')
      .eq('status', 'pending')
      .gte('scheduled_at', todayStart.toISOString())
      .lt('scheduled_at', tomorrowStart.toISOString());

    // Build Telegram message (must stay under 4096 chars — target 4000 to be safe)
    const MAX_MSG_LEN = 4000;
    const MAX_ITEMS_PER_SECTION = 10;

    function buildSection(title, items) {
      if (items.length === 0) return '';
      const shown = items.slice(0, MAX_ITEMS_PER_SECTION);
      const overflow = items.length - shown.length;
      let section = `<b>${title}:</b>\n${shown.map(a => `• ${a}`).join('\n')}`;
      if (overflow > 0) section += `\n<i>...and ${overflow} more</i>`;
      return section + '\n\n';
    }

    let body = `<b>Good morning. Here's what I'm planning today:</b>\n\n`;
    body += buildSection('Priority', priorityActions);
    body += buildSection('Follow-ups', followUpActions);
    body += buildSection('Warming up', warmingUp);
    body += buildSection('Going cold', goingCold);

    const footer = `Total tasks today: ${(allTodayTasks || []).length} (${tasksCreated} created just now)`;

    // Truncate if still over limit
    if (body.length + footer.length > MAX_MSG_LEN) {
      body = body.substring(0, MAX_MSG_LEN - footer.length - 30) + '\n<i>...truncated</i>\n\n';
    }
    body += footer;

    await sendTelegram(TELEGRAM_ADMIN_CHAT_ID, body);
    fs.writeFileSync(MORNING_BRIEFING_FILE, todayStr);
    console.log(`[MorningBriefing] Sent. Created ${tasksCreated} tasks.`);
  } catch (err) {
    console.error('[MorningBriefing] Failed:', err.message);
  }
}

/**
 * Run unanswered question check every 4 hours (not just morning briefing).
 */
async function checkUnansweredQuestions() {
  const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const hourIST = nowIST.getHours();

  // Run at 8, 12, 16, 20 IST hours
  if (![8, 12, 16, 20].includes(hourIST)) return;

  const checkKey = `${nowIST.toISOString().split('T')[0]}-${hourIST}`;
  try {
    if (fs.existsSync(UNANSWERED_CHECK_FILE)) {
      if (fs.readFileSync(UNANSWERED_CHECK_FILE, 'utf8').trim() === checkKey) return;
    }
  } catch (_) {}

  const unanswered = await findUnansweredQuestions();
  if (unanswered.length > 0) {
    console.log(`[Proactive] Found ${unanswered.length} unanswered questions`);
  }

  try { fs.writeFileSync(UNANSWERED_CHECK_FILE, checkKey); } catch (_) {}
}

/**
 * Weekly intelligence report — Sunday 9 AM IST.
 */
async function sendWeeklyReport() {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_ADMIN_CHAT_ID) return;

  const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  if (nowIST.getDay() !== 0 || nowIST.getHours() !== 9 || nowIST.getMinutes() > 5) return;

  const todayStr = nowIST.toISOString().split('T')[0];
  try {
    if (fs.existsSync(WEEKLY_REPORT_FILE)) {
      if (fs.readFileSync(WEEKLY_REPORT_FILE, 'utf8').trim() === todayStr) return;
    }
  } catch (_) {}

  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Task stats
    const { data: weekTasks } = await supabase
      .from('agent_tasks')
      .select('status, task_type, lead_id, metadata, completed_at')
      .gte('created_at', weekAgo);

    const executed = (weekTasks || []).filter(t => t.status === 'completed' || t.status === 'failed').length;
    const successful = (weekTasks || []).filter(t => t.status === 'completed').length;
    const successRate = executed > 0 ? Math.round((successful / executed) * 100) : 0;

    // Leads contacted and responded
    const contactedIds = [...new Set((weekTasks || []).filter(t => t.lead_id && t.status === 'completed').map(t => t.lead_id))];
    const { data: weekResponses } = await supabase.from('conversations').select('lead_id').eq('sender', 'customer').gte('created_at', weekAgo);
    const respondedIds = [...new Set((weekResponses || []).map(r => r.lead_id))];

    // Bookings
    const bookings = (weekTasks || []).filter(t => t.task_type === 'post_booking_confirmation' && t.status === 'completed').length;

    // Best day for responses (day of week with most customer messages)
    const dayBuckets = {};
    for (const r of (weekResponses || [])) {
      // We don't have created_at in the select, so approximate from the query range
    }
    // Use completed tasks for day analysis
    const completedByDay = {};
    for (const t of (weekTasks || []).filter(t => t.status === 'completed' && t.completed_at)) {
      const day = new Date(t.completed_at).toLocaleDateString('en-US', { weekday: 'long' });
      completedByDay[day] = (completedByDay[day] || 0) + 1;
    }
    const bestDay = Object.entries(completedByDay).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

    // Most effective channel (from metadata)
    const channelCounts = {};
    for (const t of (weekTasks || []).filter(t => t.status === 'completed')) {
      const ch = t.metadata?.channel || 'whatsapp';
      channelCounts[ch] = (channelCounts[ch] || 0) + 1;
    }
    const bestChannel = Object.entries(channelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'whatsapp';

    // Most effective angle
    const angleCounts = {};
    for (const t of (weekTasks || []).filter(t => t.status === 'completed' && t.metadata?.message_angle)) {
      const angle = t.metadata.message_angle;
      angleCounts[angle] = (angleCounts[angle] || 0) + 1;
    }
    const bestAngle = Object.entries(angleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

    // Temperature shifts
    const { data: allLeads } = await supabase
      .from('all_leads')
      .select('unified_context')
      .in('brand', ['bcon', 'default'])
      .not('lead_stage', 'in', '("Converted","Closed Won","Closed Lost")');

    let warmedUp = 0, wentCold = 0;
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    for (const l of (allLeads || [])) {
      const history = l.unified_context?.temperature_history || [];
      const weekEntries = history.filter(h => new Date(h.timestamp) > oneWeekAgo);
      if (weekEntries.length >= 2) {
        const first = weekEntries[0].temperature;
        const last = weekEntries[weekEntries.length - 1].temperature;
        const tempVal = { hot: 4, warm: 3, cool: 2, cold: 1 };
        if ((tempVal[last] || 0) > (tempVal[first] || 0)) warmedUp++;
        if ((tempVal[last] || 0) < (tempVal[first] || 0)) wentCold++;
      }
    }

    // Hot leads needing attention
    const { data: hotUnattended } = await supabase
      .from('all_leads')
      .select('id')
      .in('brand', ['bcon', 'default'])
      .not('lead_stage', 'in', '("Converted","Closed Won","Closed Lost")')
      .gte('lead_score', 70);
    const hotCount = (hotUnattended || []).length;

    // Not contacted in 7+ days
    const { data: staleLeads } = await supabase
      .from('all_leads')
      .select('id')
      .in('brand', ['bcon', 'default'])
      .not('lead_stage', 'in', '("Converted","Closed Won","Closed Lost","Cold")')
      .lt('last_interaction_at', weekAgo);
    const staleCount = (staleLeads || []).length;

    const body =
      `<b>PROXe Weekly Intelligence</b>\n\n` +
      `<b>Performance:</b>\n` +
      `• ${executed} tasks executed, ${successRate}% success\n` +
      `• ${contactedIds.length} leads contacted, ${respondedIds.length} responded\n` +
      `• ${bookings} bookings created\n\n` +
      `<b>Patterns:</b>\n` +
      `• Best day for activity: ${bestDay}\n` +
      `• Most effective channel: ${bestChannel}\n` +
      `• Most effective angle: ${bestAngle}\n\n` +
      `<b>Temperature shifts:</b>\n` +
      `• ${warmedUp} leads warmed up\n` +
      `• ${wentCold} leads went cold\n\n` +
      `<b>Recommendations:</b>\n` +
      `${hotCount > 0 ? `• ${hotCount} hot leads need immediate attention\n` : ''}` +
      `${staleCount > 0 ? `• ${staleCount} leads haven't been contacted in 7+ days\n` : ''}` +
      `• Best channel: increase ${bestChannel} usage`;

    await sendTelegram(TELEGRAM_ADMIN_CHAT_ID, body);
    fs.writeFileSync(WEEKLY_REPORT_FILE, todayStr);
    console.log('[WeeklyReport] Sent');
  } catch (err) {
    console.error('[WeeklyReport] Failed:', err.message);
  }
}

async function main() {
  console.log(`[TaskWorker] Run started at ${new Date().toISOString()}`);

  try {
    await pollTelegramCommands();
    await morningBriefing();
    await sendDailyReport();
    await sendWeeklyReport();
    await checkUnansweredQuestions();

    await createBookingReminderTasks();
    await createFollowUpTasks();
    await createColdLeadTasks();

    // Log task counts before processing
    const { data: taskCounts } = await supabase
      .from('agent_tasks')
      .select('status')
      .eq('status', 'pending');
    const pendingCount = (taskCounts || []).length;
    console.log(`[TaskWorker] Tasks: ${pendingCount} pending`);

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
          initialStatus: 'pending',
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
        initialStatus: 'pending',
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

  // Sort tasks by lead temperature: hot first, then warm, cool, cold
  const tempOrder = { hot: 0, warm: 1, cool: 2, cold: 3 };
  const sortedTasks = [...tasks];
  // Fetch temperatures for all leads in batch
  const leadIds = [...new Set(tasks.filter(t => t.lead_id).map(t => t.lead_id))];
  const tempCache = {};
  if (leadIds.length > 0) {
    const { data: leads } = await supabase
      .from('all_leads')
      .select('id, unified_context')
      .in('id', leadIds);
    for (const l of (leads || [])) {
      tempCache[l.id] = l.unified_context?.lead_temperature || 'warm';
    }
  }
  sortedTasks.sort((a, b) => {
    const ta = tempCache[a.lead_id] || 'warm';
    const tb = tempCache[b.lead_id] || 'warm';
    return (tempOrder[ta] || 1) - (tempOrder[tb] || 1);
  });

  console.log(`[ProcessTasks] Processing ${sortedTasks.length} tasks (sorted by temperature)`);

  for (const task of sortedTasks) {
    try {
      // ── Cold lead handling: stop all sequences, only allow re_engage ──
      const leadTemp = tempCache[task.lead_id] || 'warm';
      if (leadTemp === 'cold' && task.metadata?.sequence && task.task_type !== 're_engage') {
        await supabase.from('agent_tasks').update({
          status: 'cancelled',
          completed_at: new Date().toISOString(),
          error_message: 'Lead is cold - sequence stopped',
        }).eq('id', task.id);
        // Cancel all other pending sequence tasks for this cold lead
        if (task.lead_id && task.metadata?.sequence) {
          await supabase.from('agent_tasks').update({
            status: 'cancelled',
            completed_at: new Date().toISOString(),
            error_message: 'Lead is cold - all sequences cancelled',
          })
          .eq('lead_id', task.lead_id)
          .eq('status', 'pending')
          .neq('task_type', 're_engage');
        }
        console.log(`[ProcessTasks] Cold lead - cancelled ${task.task_type} for ${task.lead_name}`);
        continue;
      }

      // Quiet hours: 9 PM – 9 AM IST - reschedule to 9 AM IST next morning
      const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const hourIST = nowIST.getHours();
      if (hourIST >= 21 || hourIST < 9) {
        const nextMorning = new Date(nowIST);
        if (hourIST >= 21) nextMorning.setDate(nextMorning.getDate() + 1);
        nextMorning.setHours(9, 0, 0, 0);
        // Convert back to UTC for storage
        const scheduledUtc = new Date(Date.now() + (nextMorning.getTime() - nowIST.getTime()));
        const timingReason = `Quiet hours (${hourIST}:00 IST), rescheduled to 9 AM IST`;
        await supabase.from('agent_tasks').update({
          scheduled_at: scheduledUtc.toISOString(),
          metadata: { ...task.metadata, timing_reason: timingReason },
        }).eq('id', task.id);
        console.log(`[ProcessTasks] ${timingReason}: ${task.task_type} for ${task.lead_name}`);
        continue;
      }

      const result = await executeTask(task);

      // If task was skipped (e.g. lead already responded), mark completed with note
      if (result && result.skipped) {
        const completedAction = result.reason || 'Skipped - condition no longer applies';
        await supabase.from('agent_tasks').update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          error_message: completedAction,
          metadata: { ...task.metadata, completed_action: completedAction },
        }).eq('id', task.id);
        console.log(`[ProcessTasks] Skipped: ${task.task_type} for ${task.lead_name} - ${completedAction}`);
        continue;
      }

      const completedAction = `Sent ${task.task_type.replace(/_/g, ' ')} to ${task.lead_name}`;
      await supabase.from('agent_tasks').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        error_message: null,
        metadata: { ...task.metadata, completed_action: completedAction },
      }).eq('id', task.id);
      console.log(`[ProcessTasks] Completed: ${task.task_type} for ${task.lead_name}`);
      await notifyTaskResult(task, true);
    } catch (err) {
      const status = err.is24hWindow ? 'failed_24h_window' : 'failed';
      await supabase.from('agent_tasks').update({
        status,
        completed_at: new Date().toISOString(),
        error_message: err.message
      }).eq('id', task.id);
      console.error(`[ProcessTasks] Failed: ${task.task_type} for ${task.lead_name}: ${err.message}`);
      await notifyTaskResult(task, false, err.message);
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
    case 'booking_reminder_24h': {
      const rawTime24 = task.metadata?.booking_time || '';
      const fmt24 = formatTimeTo12h(rawTime24);
      return await executeSendMessage(task, waPhone,
        `${task.lead_name}, your call with the BCON Team is tomorrow at ${fmt24}. See you there.`);
    }
    case 'booking_reminder_30m':
      return await executeSendMessage(task, waPhone,
        `${task.lead_name}, 30 minutes out. See you in a bit.`);
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

    case 'try_voice_call':
      return await executeVoiceCall(task, waPhone);

    default:
      throw new Error(`Unknown task type: ${task.task_type}`);
  }
}

// ============================================
// SMART EXECUTORS
// ============================================

/**
 * Nudge waiting: smart timing based on read receipts.
 * - READ but no reply → nudge 30 min after read
 * - DELIVERED but not read → reschedule to lead's active hour
 * - NOT DELIVERED → skip WhatsApp, flag for voice call
 */
async function executeNudgeWaiting(task, waPhone) {
  // Check if lead responded since task was created
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

  // Fetch the last agent message to check read/delivery status
  let lastAgentMsg = null;
  if (task.lead_id) {
    const { data } = await supabase
      .from('conversations')
      .select('id, read_at, delivered_at, created_at, metadata')
      .eq('lead_id', task.lead_id)
      .eq('channel', 'whatsapp')
      .eq('sender', 'agent')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    lastAgentMsg = data;
  }

  // Fetch lead's response patterns for smart scheduling
  let responsePatterns = null;
  if (task.lead_id) {
    const { data: lead } = await supabase
      .from('all_leads')
      .select('unified_context')
      .eq('id', task.lead_id)
      .maybeSingle();
    responsePatterns = lead?.unified_context?.response_patterns || null;
  }

  const readAt = lastAgentMsg?.read_at || lastAgentMsg?.metadata?.read_at;
  const deliveredAt = lastAgentMsg?.delivered_at || lastAgentMsg?.metadata?.delivered_at;

  if (readAt) {
    // ── READ but no reply ──
    const readTime = new Date(readAt).getTime();
    const thirtyMinAfterRead = readTime + 30 * 60 * 1000;
    const now = Date.now();

    if (now >= thirtyMinAfterRead) {
      // 30 min passed since read → send nudge now
      const timingReason = `Read at ${new Date(readAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}, nudging 30 min after`;
      await supabase.from('agent_tasks').update({
        metadata: { ...task.metadata, timing_reason: timingReason },
      }).eq('id', task.id);
      console.log(`[SmartNudge] ${timingReason}`);

      return await executeSendNudgeMessage(task, waPhone);
    } else {
      // Less than 30 min since read → reschedule to 30 min after read_at
      const rescheduleAt = new Date(thirtyMinAfterRead).toISOString();
      const timingReason = `Read at ${new Date(readAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}, rescheduled to 30 min after read`;
      await supabase.from('agent_tasks').update({
        scheduled_at: rescheduleAt,
        metadata: { ...task.metadata, timing_reason: timingReason },
      }).eq('id', task.id);
      console.log(`[SmartNudge] ${timingReason} → ${rescheduleAt}`);
      return { skipped: true, reason: timingReason };
    }
  } else if (deliveredAt) {
    // ── DELIVERED but not read → reschedule to lead's next active hour ──
    const nextActiveTime = getNextActiveTime(responsePatterns);
    const timingReason = responsePatterns?.active_hours?.length
      ? `Not read, rescheduled to lead's active window (${new Date(nextActiveTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })})`
      : `Not read, rescheduled to next default window (${new Date(nextActiveTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })})`;

    await supabase.from('agent_tasks').update({
      scheduled_at: new Date(nextActiveTime).toISOString(),
      metadata: { ...task.metadata, timing_reason: timingReason },
    }).eq('id', task.id);
    console.log(`[SmartNudge] ${timingReason}`);
    return { skipped: true, reason: timingReason };
  } else {
    // ── NOT DELIVERED → phone might be off, flag for voice call ──
    const timingReason = 'Not delivered, flagged for voice call';
    await supabase.from('agent_tasks').update({
      metadata: { ...task.metadata, timing_reason: timingReason },
    }).eq('id', task.id);

    // Create a try_voice_call task
    const phone10 = waPhone.replace(/\D/g, '').slice(-10);
    await supabase.from('agent_tasks').insert({
      task_type: 'try_voice_call',
      task_description: `Voice call attempt: WhatsApp not delivered to ${task.lead_name}`,
      lead_id: task.lead_id || null,
      lead_phone: phone10,
      lead_name: task.lead_name,
      status: 'queued',
      scheduled_at: new Date().toISOString(),
      metadata: {
        source: 'smart_nudge',
        reason: 'whatsapp_not_delivered',
        prev_task_id: task.id,
        timing_reason: timingReason,
      },
      created_at: new Date().toISOString(),
    });

    console.log(`[SmartNudge] ${timingReason} for ${task.lead_name}`);
    return { skipped: true, reason: timingReason };
  }
}

/**
 * Get the next active time for a lead based on their response patterns.
 * Falls back to 9 AM or 7 PM IST (whichever is closer).
 */
function getNextActiveTime(responsePatterns) {
  const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const hourIST = nowIST.getHours();

  if (responsePatterns?.active_hours?.length) {
    // Find the next active hour that's in the future
    const activeHours = responsePatterns.active_hours;
    for (const h of activeHours) {
      if (h > hourIST) {
        const target = new Date(nowIST);
        target.setHours(h, 0, 0, 0);
        return target.getTime();
      }
    }
    // All active hours are past today → use first active hour tomorrow
    const target = new Date(nowIST);
    target.setDate(target.getDate() + 1);
    target.setHours(activeHours[0], 0, 0, 0);
    return target.getTime();
  }

  // No pattern → next 9 AM or 7 PM, whichever is closer
  if (hourIST < 9) {
    const target = new Date(nowIST);
    target.setHours(9, 0, 0, 0);
    return target.getTime();
  } else if (hourIST < 19) {
    const target = new Date(nowIST);
    target.setHours(19, 0, 0, 0);
    return target.getTime();
  } else {
    // After 7 PM → next morning 9 AM
    const target = new Date(nowIST);
    target.setDate(target.getDate() + 1);
    target.setHours(9, 0, 0, 0);
    return target.getTime();
  }
}

/**
 * Build and send the contextual nudge message based on last question.
 */
async function executeSendNudgeMessage(task, waPhone) {
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
  // Always send template directly - new leads have no 24h window
  const { templateName, renderedText, wamid } = await sendWhatsAppTemplate(waPhone, {
    ...task,
    task_type: 'first_outreach',
  });

  // Log to conversations
  if (task.lead_id) {
    await supabase.from('conversations').insert({
      lead_id: task.lead_id,
      channel: 'whatsapp',
      sender: 'agent',
      content: renderedText || `[Template: ${templateName}] First outreach to ${task.lead_name}`,
      message_type: 'text',
      metadata: { task_type: task.task_type, task_id: task.id, autonomous: true, template_name: templateName, ...(wamid ? { whatsapp_message_id: wamid, wa_message_id: wamid } : {}) }
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

  // ── Escalation-aware channel selection ──
  const channelChoice = await selectBestChannel(task.lead_id, task.metadata);
  let result;

  if (channelChoice.channel === 'voice') {
    // Escalate to voice call instead of WhatsApp
    const phone10 = waPhone.replace(/\D/g, '').slice(-10);
    const escalation = recordChannelAttempt(task.metadata, 'voice', 'attempting');
    const timingReason = `Escalated to voice: ${channelChoice.reason}`;

    await supabase.from('agent_tasks').update({
      metadata: { ...task.metadata, ...escalation, timing_reason: timingReason },
    }).eq('id', task.id);

    // Create a try_voice_call task immediately
    await supabase.from('agent_tasks').insert({
      task_type: 'try_voice_call',
      task_description: `Voice escalation from ${task.task_type} for ${task.lead_name}`,
      lead_id: task.lead_id || null,
      lead_phone: phone10,
      lead_name: task.lead_name,
      status: 'pending',
      scheduled_at: new Date().toISOString(),
      metadata: {
        source: 'sequence_escalation',
        sequence,
        step,
        prev_task_id: task.id,
        ...escalation,
        timing_reason: timingReason,
      },
      created_at: new Date().toISOString(),
    });

    console.log(`[Sequence] ${timingReason} for ${task.lead_name}`);
    result = null;
  } else {
    // ── WhatsApp path: check if we need a different angle ──
    const escalationLevel = task.metadata?.current_escalation_level || 1;
    const channelsTried = task.metadata?.channels_tried || [];
    const voiceWasTried = channelsTried.some(c => c.channel === 'voice');

    // follow_up_day5 after voice didn't connect → different messaging angle
    if (task.task_type === 'follow_up_day5' && voiceWasTried) {
      message = `${task.lead_name}, I know we've been trying to connect. I get it, busy schedules! Here's the thing - we've helped businesses like yours save 15+ hours/week with AI. When you have 2 minutes, just reply "yes" and I'll send over a quick case study.`;
      const escalation = recordChannelAttempt(task.metadata, 'whatsapp', 'sent');
      await supabase.from('agent_tasks').update({
        metadata: { ...task.metadata, ...escalation, timing_reason: 'Different angle after voice attempt failed' },
      }).eq('id', task.id);
    }

    // re_engage (final step) → use the channel that historically got best response
    if (task.task_type === 're_engage' && step === 4) {
      // selectBestChannel already picked the best, and we're here so it's WhatsApp
      const escalation = recordChannelAttempt(task.metadata, 'whatsapp', 'sent');
      await supabase.from('agent_tasks').update({
        metadata: { ...task.metadata, ...escalation, timing_reason: `Final re-engage via best channel: ${channelChoice.reason}` },
      }).eq('id', task.id);
    }

    // ── Dynamic message: use pre-calculated message from calculateNextAction if available ──
    if (task.metadata?.dynamic_message) {
      message = task.metadata.dynamic_message;
      console.log(`[Sequence] Using dynamic message for ${task.lead_name}: angle=${task.metadata?.message_angle}`);
    } else if (task.lead_id) {
      // Fallback: objection-aware messaging for legacy tasks without dynamic_message
      const { objections } = await getLeadTemperatureData(task.lead_id);
      const usedAngles = task.metadata?.angles_used || task.metadata?.used_angles || [];
      const objectionMsg = getObjectionAwareMessage(task.lead_name, objections, usedAngles);
      if (objectionMsg) {
        message = objectionMsg.message;
        const updatedAngles = [...usedAngles, objectionMsg.message_angle];
        await supabase.from('agent_tasks').update({
          metadata: { ...task.metadata, message_angle: objectionMsg.message_angle, angles_used: updatedAngles },
        }).eq('id', task.id);
        console.log(`[Sequence] Objection-aware message for ${task.lead_name}: angle=${objectionMsg.message_angle}`);
      }
    }

    // Track the WhatsApp attempt
    const escalation = recordChannelAttempt(task.metadata, 'whatsapp', 'sent');

    // Send the message via WhatsApp
    result = await executeSendMessage(task, waPhone, message);

    // Update channel performance
    await updateChannelPerformance(task.lead_id, 'whatsapp', 'sent', null);
  }

  // ── Dynamic next-action: calculate what to do next based on lead behavior ──
  if (task.lead_id) {
    const phone10 = waPhone.replace(/\D/g, '').slice(-10);
    const currentAngles = [...(task.metadata?.angles_used || [])];
    // Add the angle we just used (if any) to the tracking
    if (task.metadata?.message_angle) currentAngles.push(task.metadata.message_angle);

    const nextAction = await calculateNextAction(task.lead_id, {
      ...task.metadata,
      angles_used: currentAngles,
      step: step,
    });

    if (nextAction.action === 'stop') {
      // Sequence complete — no more tasks
      if (nextAction.reason.includes('not-interested')) {
        await supabase.from('all_leads').update({ lead_stage: 'Closed Lost', stage_override: true }).eq('id', task.lead_id);
      }
      console.log(`[Sequence] Stop for ${task.lead_name}: ${nextAction.reason}`);
    } else if (nextAction.action === 'voice_call') {
      // Escalate to voice
      await supabase.from('agent_tasks').insert({
        task_type: 'try_voice_call',
        task_description: `Dynamic voice escalation for ${task.lead_name}`,
        lead_id: task.lead_id,
        lead_phone: phone10,
        lead_name: task.lead_name,
        status: 'pending',
        scheduled_at: nextAction.scheduledAt.toISOString(),
        metadata: {
          ...task.metadata,
          sequence: sequence || 'dynamic',
          step: step + 1,
          message_angle: nextAction.messageAngle,
          angles_used: currentAngles,
          next_action_reason: nextAction.reason,
          timing_reason: nextAction.reason,
          lead_temperature: (await getLeadTemperatureData(task.lead_id)).temperature,
          sequence_progress: `Step ${step + 1}, Angle: ${nextAction.messageAngle}, Channel: voice`,
        },
        created_at: new Date().toISOString(),
      });
      console.log(`[Sequence] Dynamic → voice_call for ${task.lead_name}: ${nextAction.reason}`);
    } else {
      // Create next WhatsApp follow-up/nudge/push_to_book/reengagement
      const taskTypeMap = {
        nudge: 'nudge_waiting',
        follow_up: 'follow_up_day1', // generic follow-up
        push_to_book: 'push_to_book',
        reengagement: 're_engage',
      };
      const nextType = taskTypeMap[nextAction.action] || 'follow_up_day1';
      const tempData = await getLeadTemperatureData(task.lead_id);

      await supabase.from('agent_tasks').insert({
        task_type: nextType,
        task_description: `Dynamic: ${nextAction.action} for ${task.lead_name} (${nextAction.messageAngle})`,
        lead_id: task.lead_id,
        lead_phone: phone10,
        lead_name: task.lead_name,
        status: 'pending',
        scheduled_at: nextAction.scheduledAt.toISOString(),
        metadata: {
          ...task.metadata,
          sequence: sequence || 'dynamic',
          step: step + 1,
          message_angle: nextAction.messageAngle,
          angles_used: [...currentAngles, nextAction.messageAngle],
          dynamic_message: nextAction.message || null,
          next_action_reason: nextAction.reason,
          timing_reason: nextAction.reason,
          lead_temperature: tempData.temperature,
          sequence_progress: `Step ${step + 1}, Angle: ${nextAction.messageAngle}, Temperature: ${tempData.temperature}`,
          prev_task_id: task.id,
          channels_tried: task.metadata?.channels_tried || [],
          current_escalation_level: task.metadata?.current_escalation_level || 1,
        },
        created_at: new Date().toISOString(),
      });
      console.log(`[Sequence] Dynamic → ${nextType} for ${task.lead_name} at ${nextAction.scheduledAt.toISOString()} [${nextAction.reason}]`);
    }
  }

  return result;
}

/**
 * Schedule the next step in a sequence.
 * Uses smart timing: adjusts to lead's preferred_day_parts and read receipts.
 */
async function scheduleNextSequenceStep(task, nextType, nextStep, delayMs, sequence, resolvedPhone) {
  const phone = resolvedPhone || task.lead_phone;

  // Fetch lead's response patterns, temperature, and last message read status
  let responsePatterns = null;
  let lastMsgReadStatus = null;
  let leadTemperature = 'warm';
  if (task.lead_id) {
    const { data: lead } = await supabase
      .from('all_leads')
      .select('unified_context')
      .eq('id', task.lead_id)
      .maybeSingle();
    responsePatterns = lead?.unified_context?.response_patterns || null;
    leadTemperature = lead?.unified_context?.lead_temperature || 'warm';

    // Check if the last agent message was read
    const { data: lastMsg } = await supabase
      .from('conversations')
      .select('read_at, delivered_at, metadata')
      .eq('lead_id', task.lead_id)
      .eq('channel', 'whatsapp')
      .eq('sender', 'agent')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastMsg) {
      const readAt = lastMsg.read_at || lastMsg.metadata?.read_at;
      const deliveredAt = lastMsg.delivered_at || lastMsg.metadata?.delivered_at;
      if (readAt) lastMsgReadStatus = 'read';
      else if (deliveredAt) lastMsgReadStatus = 'delivered';
      else lastMsgReadStatus = 'not_delivered';
    }
  }

  // Apply test mode compression then temperature multiplier
  let adjustedDelay = applyTemperatureDelay(delayMs, leadTemperature);
  let timingReason = '';
  if (leadTemperature !== 'warm') {
    timingReason = `Temperature ${leadTemperature}: delay ${leadTemperature === 'hot' ? 'halved' : 'extended'} to ${Math.round(adjustedDelay / (60 * 60 * 1000))}h`;
  }

  // Further adjust gap based on read receipts

  if (lastMsgReadStatus === 'read') {
    // Reading but not replying → shorten gap (interested but needs more nudges)
    adjustedDelay = Math.round(delayMs * 0.6);
    timingReason = `Reading but not replying, shortened gap to ${Math.round(adjustedDelay / (60 * 60 * 1000))}h`;
  } else if (lastMsgReadStatus === 'not_delivered') {
    // Not even delivered → lengthen gap (don't spam)
    adjustedDelay = Math.round(delayMs * 1.5);
    timingReason = `Not delivered, lengthened gap to ${Math.round(adjustedDelay / (60 * 60 * 1000))}h`;
  } else if (lastMsgReadStatus === 'delivered') {
    // Delivered but not read → slight increase
    adjustedDelay = Math.round(delayMs * 1.2);
    timingReason = `Delivered but not read, gap adjusted to ${Math.round(adjustedDelay / (60 * 60 * 1000))}h`;
  }

  // Calculate base scheduled time
  let scheduledAt = new Date(Date.now() + adjustedDelay);

  // Adjust to lead's preferred day part
  const preferredPart = responsePatterns?.preferred_day_parts;
  const activeHours = responsePatterns?.active_hours;

  if (preferredPart || activeHours?.length) {
    let targetHour;
    if (preferredPart === 'evening') {
      targetHour = 18; // 6 PM IST
    } else if (preferredPart === 'morning') {
      targetHour = 9; // 9 AM IST
    } else if (preferredPart === 'afternoon') {
      targetHour = 14; // 2 PM IST
    } else {
      targetHour = 10; // default 10 AM IST
    }

    // Adjust the scheduled time to the preferred hour (IST)
    const scheduledIST = new Date(scheduledAt.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    scheduledIST.setHours(targetHour, 0, 0, 0);

    // If that time is in the past (same day), push to next day
    const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    if (scheduledIST <= nowIST) {
      scheduledIST.setDate(scheduledIST.getDate() + 1);
    }

    // Convert back: calculate the offset from IST to UTC
    const offsetMs = scheduledIST.getTime() - nowIST.getTime();
    scheduledAt = new Date(Date.now() + offsetMs);

    const dayPartReason = `Lead usually responds in ${preferredPart || 'unknown'}, scheduled for ${targetHour > 12 ? targetHour - 12 : targetHour} ${targetHour >= 12 ? 'PM' : 'AM'} IST`;
    timingReason = timingReason ? `${timingReason}; ${dayPartReason}` : dayPartReason;
  } else if (!timingReason) {
    // No pattern, use default 10 AM
    const scheduledIST = new Date(scheduledAt.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    scheduledIST.setHours(10, 0, 0, 0);
    const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    if (scheduledIST <= nowIST) {
      scheduledIST.setDate(scheduledIST.getDate() + 1);
    }
    const offsetMs = scheduledIST.getTime() - nowIST.getTime();
    scheduledAt = new Date(Date.now() + offsetMs);
    timingReason = 'No response pattern, using default 10 AM IST';
  }

  // Never send at a time the lead has never been active (if we have active_hours data)
  if (activeHours?.length >= 3) {
    const scheduledIST = new Date(scheduledAt.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const scheduledHour = scheduledIST.getHours();
    if (!activeHours.includes(scheduledHour)) {
      // Find closest active hour
      let closestHour = activeHours[0];
      let minDiff = 24;
      for (const h of activeHours) {
        const diff = Math.abs(h - scheduledHour);
        if (diff < minDiff) { minDiff = diff; closestHour = h; }
      }
      scheduledIST.setHours(closestHour, 0, 0, 0);
      const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      if (scheduledIST <= nowIST) scheduledIST.setDate(scheduledIST.getDate() + 1);
      const offsetMs = scheduledIST.getTime() - nowIST.getTime();
      scheduledAt = new Date(Date.now() + offsetMs);
      timingReason += `; snapped to nearest active hour (${closestHour}:00)`;
    }
  }

  const { error } = await supabase.from('agent_tasks').insert({
    task_type: nextType,
    task_description: `Sequence step ${nextStep}/4: ${nextType} for ${task.lead_name}`,
    lead_id: task.lead_id || null,
    lead_phone: phone,
    lead_name: task.lead_name,
    status: 'pending',
    scheduled_at: scheduledAt.toISOString(),
    metadata: {
      ...task.metadata,
      sequence: sequence || 'post_call',
      step: nextStep,
      total_steps: 4,
      prev_task_id: task.id,
      timing_reason: timingReason || undefined,
      // Propagate escalation state to child tasks
      channels_tried: task.metadata?.channels_tried || [],
      current_escalation_level: task.metadata?.current_escalation_level || 1,
    },
    created_at: new Date().toISOString(),
  });
  if (error) console.error(`[Sequence] Failed to create ${nextType}:`, error.message);
  else console.log(`[Sequence] Created ${nextType} (step ${nextStep}) for ${task.lead_name} at ${scheduledAt.toISOString()} [${timingReason}]`);
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
      .in('task_type', ['booking_reminder_24h', 'booking_reminder_30m'])
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

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Send a one-line Telegram notification after task execution.
 */
async function notifyTaskResult(task, success, errorMsg) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_ADMIN_CHAT_ID) return;
  const phone10 = (task.lead_phone || '').replace(/\D/g, '').slice(-10);
  const channel = task.metadata?.channel || 'whatsapp';
  const msg = success
    ? `Sent ${task.task_type} to ${task.lead_name} (${phone10}) via ${channel}`
    : `Failed ${task.task_type} for ${task.lead_name}: ${errorMsg || 'unknown'}`;
  try {
    await sendTelegram(TELEGRAM_ADMIN_CHAT_ID, msg);
  } catch (_) {}
}

/**
 * Resolve service_interest and pain_point from lead record / task metadata.
 * Checks form data, task metadata, unified_summary, and admin notes for context.
 */
function resolveLeadContext(task, lead) {
  const ctx = lead?.unified_context || {};
  const formData = ctx.form_data || ctx.whatsapp?.profile || ctx.web?.profile || {};

  // 1. Try explicit fields first
  let serviceInterest =
    formData.business_type || formData.service ||
    task.metadata?.service_interest || task.metadata?.business_type ||
    task.metadata?.campaign || null;

  // 2. If no explicit field, scan unified_summary and admin notes for topic keywords
  if (!serviceInterest) {
    serviceInterest = extractServiceFromContext(ctx);
  }

  // 3. Final fallback
  if (!serviceInterest) {
    serviceInterest = 'Human X AI solutions';
  }

  const painPoint =
    ctx.pain_point ||
    task.metadata?.pain_point ||
    serviceInterest ||
    'Human X AI solutions';
  return { serviceInterest, painPoint };
}

/**
 * Scan unified_context (summary, admin_notes, lead_temperature notes) for
 * service-interest keywords and return a human-friendly description.
 */
function extractServiceFromContext(ctx) {
  // Build a single text blob from available context
  const parts = [];
  if (ctx.unified_summary) parts.push(ctx.unified_summary);
  if (ctx.summary) parts.push(ctx.summary);
  if (Array.isArray(ctx.admin_notes)) {
    for (const n of ctx.admin_notes) {
      if (n.text) parts.push(n.text);
    }
  }
  if (ctx.conversation_summary) parts.push(ctx.conversation_summary);
  if (ctx.business_context) parts.push(ctx.business_context);

  if (parts.length === 0) return null;

  const blob = parts.join(' ').toLowerCase();

  // Match specific service topics (ordered by specificity)
  const topicMap = [
    { keywords: ['lead gen', 'lead generation', 'lead machine', 'leads', 'getting leads', 'more leads'], label: 'lead generation' },
    { keywords: ['ai agent', 'ai assistant', 'chatbot', 'ai bot', 'whatsapp bot', 'whatsapp automation'], label: 'AI automation' },
    { keywords: ['ai system', 'ai solution', 'artificial intelligence', 'ai for business', 'ai-powered'], label: 'AI systems' },
    { keywords: ['brand audit', 'ai brand audit', 'ai audit'], label: 'an AI Brand Audit' },
    { keywords: ['marketing', 'digital marketing', 'social media', 'content', 'branding'], label: 'marketing' },
    { keywords: ['website', 'web app', 'mobile app', 'app development', 'saas'], label: 'app development' },
    { keywords: ['automation', 'automate', 'workflow', 'process automation'], label: 'automation' },
    { keywords: ['crm', 'customer management', 'pipeline'], label: 'CRM and pipeline management' },
    { keywords: ['analytics', 'dashboard', 'reporting', 'data'], label: 'analytics and dashboards' },
    { keywords: ['e-commerce', 'ecommerce', 'online store', 'shopify'], label: 'e-commerce' },
  ];

  for (const topic of topicMap) {
    if (topic.keywords.some(kw => blob.includes(kw))) {
      return topic.label;
    }
  }

  return null;
}

/**
 * Determine if a lead is "engaged" (3+ responses) or "noengage".
 */
function isEngaged(lead) {
  return (lead?.response_count || 0) >= 3;
}

/**
 * Expected body parameter count per Meta template.
 * If a template is registered with fewer variables than we try to send,
 * Meta rejects with "Parameter name is missing or empty".
 * Keep this in sync with what's approved in Meta Business Manager.
 */
const TEMPLATE_PARAM_COUNT = {
  'bcon_proxe_booking_reminder_24h': 3,  // name, time, service
  'bcon_proxe_booking_reminder_30m': 3,  // name, service, time
  'bcon_proxe_reengagement_engaged': 2,  // name, pain_point
  'bcon_proxe_reengagement_noengage': 1, // name
  'bcon_proxe_first_outreach': 1,        // name
  'bcon_proxe_post_call_followup': 1,    // name
  'bcon_proxe_followup_engaged': 2,      // name, service
  'bcon_proxe_followup_noengage': 2,     // name, service
  'bcon_proxe_rnr': 1,                   // name
};

// Template body texts matching Meta-approved templates (used to render human-readable content for conversation logs)
const TEMPLATE_BODIES = {
  'bcon_proxe_booking_reminder_24h': `Hi {{customer_name}}, your call with the BCON Team is tomorrow at {{booking_time}}.\nWe'll be going over {{service_interest}} for your business.\nSee you there.`,
  'bcon_proxe_booking_reminder_30m': `Hi {{customer_name}}, 30 minutes to go. Your call with the BCON Team for {{service_interest}} is at {{booking_time}}.\nWe are getting things ready for you`,
  'bcon_proxe_reengagement_engaged': `Hi {{customer_name}}, you mentioned {{pain_point}} was a challenge. If that's still the case, we should chat.\nWe've been solving exactly that lately.`,
  'bcon_proxe_reengagement_noengage': `Hi {{customer_name}}, we connected a while back but didn't get to dig in to details.\nWant to see how we build systems that help businesses like yours grow?`,
  'bcon_proxe_first_outreach': `Hi {{customer_name}}, thanks for your interest in BCON! We'd love to learn more about your business and how we can help. When's a good time to chat?`, // NOT YET SUBMITTED TO META — placeholder text
  'bcon_proxe_post_call_followup': `Hi {{customer_name}}, thanks for the great conversation! If you have any questions, feel free to reach out. We're here to help!`, // NOT YET SUBMITTED TO META — placeholder text
  'bcon_proxe_followup_engaged': `Hi {{customer_name}}, we were talking about {{service_interest}} for your business. Let's continue where we left off?`,
  'bcon_proxe_followup_noengage': `Hi {{customer_name}}, you reached out to us recently about {{service_interest}}. Would you like to know how we can help?`,
  'bcon_proxe_rnr': `Hi {{customer_name}}, we tried reaching you but couldn't connect. Would you like to schedule a call at a time that works for you?`, // NOT YET SUBMITTED TO META — placeholder text
};

/**
 * Render a template body by replacing {{param_name}} placeholders with actual values.
 */
function renderTemplateText(templateName, params) {
  const body = TEMPLATE_BODIES[templateName];
  if (!body) return null;
  let rendered = body;
  for (const p of params) {
    rendered = rendered.replace(`{{${p.parameter_name}}}`, p.value || 'there');
  }
  return rendered;
}

/**
 * Build a human-readable template preview showing template name and parameters.
 */
function getTemplatePreview(task, lead) {
  const leadName = (task.lead_name && task.lead_name.trim()) || 'there';
  const taskType = task.task_type || '';
  const { serviceInterest, painPoint } = resolveLeadContext(task, lead);
  const bookingTime = task.metadata?.booking_time || 'your scheduled time';
  const engaged = isEngaged(lead);

  if (taskType === 'booking_reminder_24h' || taskType === 'reminder_24h') {
    return {
      name: 'bcon_proxe_booking_reminder_24h',
      params: [
        { label: 'Name', parameter_name: 'customer_name', value: leadName },
        { label: 'Time', parameter_name: 'booking_time', value: bookingTime },
        { label: 'Service', parameter_name: 'service_interest', value: serviceInterest },
      ],
    };
  } else if (taskType === 'booking_reminder_30m' || taskType === 'reminder_30m') {
    return {
      name: 'bcon_proxe_booking_reminder_30m',
      params: [
        { label: 'Name', parameter_name: 'customer_name', value: leadName },
        { label: 'Service', parameter_name: 'service_interest', value: serviceInterest },
        { label: 'Time', parameter_name: 'booking_time', value: bookingTime },
      ],
    };
  } else if (taskType === 're_engage') {
    if (engaged) {
      return {
        name: 'bcon_proxe_reengagement_engaged',
        params: [
          { label: 'Name', parameter_name: 'customer_name', value: leadName },
          { label: 'Pain Point', parameter_name: 'pain_point', value: painPoint },
        ],
      };
    }
    return { name: 'bcon_proxe_reengagement_noengage', params: [{ label: 'Name', parameter_name: 'customer_name', value: leadName }] };
  } else if (taskType === 'first_outreach') {
    return { name: 'bcon_proxe_first_outreach', params: [{ label: 'Name', parameter_name: 'customer_name', value: leadName }] };
  } else if (taskType === 'post_call_followup') {
    return { name: 'bcon_proxe_post_call_followup', params: [{ label: 'Name', parameter_name: 'customer_name', value: leadName }] };
  } else if (taskType === 'nudge_waiting' || taskType === 'push_to_book' || taskType.startsWith('follow_up_day') || taskType === 'missed_call_followup' || taskType === 'human_callback' || taskType === 'follow_up_24h') {
    if (engaged) {
      return {
        name: 'bcon_proxe_followup_engaged',
        params: [
          { label: 'Name', parameter_name: 'customer_name', value: leadName },
          { label: 'Service', parameter_name: 'service_interest', value: serviceInterest },
        ],
      };
    }
    return {
      name: 'bcon_proxe_followup_noengage',
      params: [
        { label: 'Name', parameter_name: 'customer_name', value: leadName },
        { label: 'Service', parameter_name: 'service_interest', value: serviceInterest },
      ],
    };
  } else {
    return { name: 'bcon_proxe_rnr', params: [{ label: 'Name', parameter_name: 'customer_name', value: leadName }] };
  }
}

// ============================================
// MESSAGE SENDING (with 24h window check)
// ============================================

/**
 * Send a message via WhatsApp. Checks 24h window first.
 * Falls back to template message if outside window.
 * Runs through Telegram approval gate before sending.
 */
async function executeSendMessage(task, waPhone, message) {
  const within24h = task.lead_id ? await isWithin24hWindow(task.lead_id) : true;

  let waMessageId = null;
  let templateUsed = null;
  if (within24h) {
    waMessageId = await sendWhatsApp(waPhone, message);
  } else {
    const { templateName, renderedText, wamid } = await sendWhatsAppTemplate(waPhone, task);
    templateUsed = templateName;
    message = renderedText || `[Template: ${templateUsed}] Sent to ${task.lead_name}`;
    waMessageId = wamid;
  }

  // Log to conversations (include wa_message_id for read receipt tracking)
  if (task.lead_id) {
    await supabase.from('conversations').insert({
      lead_id: task.lead_id,
      channel: 'whatsapp',
      sender: 'agent',
      content: message,
      message_type: 'text',
      metadata: {
        task_type: task.task_type,
        task_id: task.id,
        autonomous: true,
        ...(templateUsed ? { template_name: templateUsed } : {}),
        wa_message_id: waMessageId || undefined,
        ...(waMessageId ? { whatsapp_message_id: waMessageId } : {}),
      }
    }).then(({ error }) => {
      if (error) console.error('[executeTask] Conversation log error:', error.message);
    });

    // Track channel performance
    updateChannelPerformance(task.lead_id, 'whatsapp', 'sent', null).catch(() => {});
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

  const data = await res.json();
  const waMessageId = data?.messages?.[0]?.id || null;
  console.log(`[WhatsApp] Sent to ${phone}: ${message.substring(0, 50)}... (wamid: ${waMessageId})`);
  return waMessageId;
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

  // Enforce expected parameter count - truncate to what Meta template expects
  const expectedCount = TEMPLATE_PARAM_COUNT[templateName];
  let resolvedParams = tplInfo.params;
  if (expectedCount != null && resolvedParams.length > expectedCount) {
    console.warn(`[WhatsApp] Template "${templateName}" has ${resolvedParams.length} params but Meta expects ${expectedCount}, truncating`);
    resolvedParams = resolvedParams.slice(0, expectedCount);
  }

  // Build components from the resolved params (with null/empty safety)
  // Meta Cloud API requires parameter_name for templates with named variables
  const components = [
    {
      type: 'body',
      parameters: resolvedParams.map(p => {
        const val = p.value;
        const text = (!val || (typeof val === 'string' && val.trim() === ''))
          ? (() => { console.warn(`[WhatsApp] Template "${templateName}" param "${p.label}" is empty for lead ${task.lead_id}, using fallback "there"`); return 'there'; })()
          : val;
        return { type: 'text', parameter_name: p.parameter_name, text };
      }),
    }
  ];

  const url = `https://graph.facebook.com/v21.0/${WA_PHONE_ID}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'en' },
      components,
    }
  };

  console.log(`[WhatsApp] Template payload for ${phone} (${templateName}):`, JSON.stringify(payload, null, 2));

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WA_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errBody = await res.text();
    // Log failure to Telegram for visibility
    if (TELEGRAM_BOT_TOKEN && TELEGRAM_ADMIN_CHAT_ID) {
      const tgMsg = `⚠️ <b>Template Failed</b>\n<b>Template:</b> ${templateName}\n<b>Phone:</b> ${phone}\n<b>Lead:</b> ${task.lead_name || 'unknown'} (${task.lead_id || 'no id'})\n<b>Error:</b> ${errBody.substring(0, 200)}\n<b>Payload:</b>\n<pre>${JSON.stringify(payload.template, null, 2)}</pre>`;
      sendTelegram(TELEGRAM_ADMIN_CHAT_ID, tgMsg).catch(() => {});
    }
    throw new Error(`WhatsApp Template API error (${templateName}): ${res.status} ${errBody}`);
  }

  const resBody = await res.json();
  const wamid = resBody.messages?.[0]?.id || null;
  console.log(`[WhatsApp] Template sent to ${phone} (${templateName}) wamid: ${wamid}`);
  const renderedText = renderTemplateText(templateName, resolvedParams);
  return { templateName, renderedText, wamid };
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
