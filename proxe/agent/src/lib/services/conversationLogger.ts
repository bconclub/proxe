/**
 * services/conversationLogger.ts — Message logging + summary management
 *
 * Extracted from: web-agent/src/lib/chatSessions.ts
 *   - addUserInput()      (lines 1067-1175)
 *   - upsertSummary()     (lines 1177-1268)
 *   - fetchSummary()      (lines 1270-1319)
 *   - logMessage()        (lines 1921-2109)
 *   - fetchConversations() (lines 2123-2173)
 *
 * Tables: web_sessions (via channel table), conversations, all_leads
 * Key: logMessage requires leadId (not sessionId)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient, getClient } from './supabase';
import { getISTTimestamp, cleanSummary, stripHTML } from './utils';
import { ensureSession, getChannelTable, type Channel, type UserInput } from './sessionManager';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SessionSummary {
  summary: string;
  lastMessageCreatedAt: string;
}

export interface ConversationMessage {
  id: string;
  lead_id: string;
  channel: Channel;
  sender: 'customer' | 'agent' | 'system';
  content: string;
  message_type: string;
  metadata: any;
  created_at: string;
}

// ─── User Input Logging ─────────────────────────────────────────────────────

/**
 * Append a user input to the session's user_inputs_summary array
 * Also increments message_count and updates last_message_at
 */
export async function addUserInput(
  externalSessionId: string,
  input: string,
  channel: Channel = 'web',
  intent?: string,
  metadata: Record<string, any> = {},
  supabase?: SupabaseClient | null,
): Promise<void> {
  const client = supabase || getClient();
  if (!client) {
    console.warn('[conversationLogger] No Supabase client available');
    return;
  }

  // Ensure session exists
  await ensureSession(externalSessionId, channel, client);

  const tableName = getChannelTable(channel);

  // Fetch current session
  const { data: currentSession, error: fetchError } = await client
    .from(tableName)
    .select('user_inputs_summary, message_count')
    .eq('external_session_id', externalSessionId)
    .maybeSingle();

  if (fetchError) {
    if (fetchError.code === '42P01' || fetchError.code === '42703') {
      // Fallback to old sessions table
      const { data: fallback } = await client
        .from('sessions')
        .select('user_inputs_summary, message_count')
        .eq('external_session_id', externalSessionId)
        .maybeSingle();

      if (!fallback) return;

      const existingInputs: UserInput[] = Array.isArray(fallback.user_inputs_summary)
        ? fallback.user_inputs_summary
        : [];

      const newInput: UserInput = {
        input: input.trim(),
        intent,
        created_at: getISTTimestamp(),
      };

      const updatedInputs = [...existingInputs, newInput].slice(-20);

      await client
        .from('sessions')
        .update({
          user_inputs_summary: updatedInputs,
          message_count: (fallback.message_count ?? 0) + 1,
          last_message_at: getISTTimestamp(),
        })
        .eq('external_session_id', externalSessionId);

      return;
    }
    console.error('[conversationLogger] Failed to fetch session', fetchError);
    return;
  }

  if (!currentSession) return;

  const existingInputs: UserInput[] = Array.isArray(currentSession.user_inputs_summary)
    ? currentSession.user_inputs_summary
    : [];

  const newInput: UserInput = {
    input: input.trim(),
    intent,
    created_at: new Date().toISOString(),
    ...metadata,
  };

  const updatedInputs = [...existingInputs, newInput].slice(-20);
  const messageCount = (currentSession.message_count ?? 0) + 1;

  const { error } = await client
    .from(tableName)
    .update({
      user_inputs_summary: updatedInputs,
      message_count: messageCount,
      last_message_at: new Date().toISOString(),
    })
    .eq('external_session_id', externalSessionId);

  if (error) {
    console.error('[conversationLogger] Failed to add user input', error);
  }
}

// ─── Summary Management ─────────────────────────────────────────────────────

/**
 * Update (or create) the conversation summary for a session
 * Also syncs to all_leads.unified_context if lead_id is linked
 */
export async function upsertSummary(
  externalSessionId: string,
  summary: string,
  lastMessageCreatedAt: string,
  channel: Channel = 'web',
  supabase?: SupabaseClient | null,
): Promise<void> {
  const client = supabase || getClient();
  if (!client) {
    console.warn('[conversationLogger] No Supabase client available');
    return;
  }

  await ensureSession(externalSessionId, channel, client);

  const tableName = getChannelTable(channel);

  const { data, error } = await client
    .from(tableName)
    .update({
      conversation_summary: summary,
      last_message_at: lastMessageCreatedAt,
    })
    .eq('external_session_id', externalSessionId)
    .select('lead_id, booking_status, booking_date, booking_time, user_inputs_summary');

  if (error) {
    if (error.code === '42P01' || error.code === '42703') {
      await client
        .from('sessions')
        .update({
          conversation_summary: summary,
          last_message_at: lastMessageCreatedAt,
        })
        .eq('external_session_id', externalSessionId);
    } else {
      console.error('[conversationLogger] Failed to upsert summary', { error });
    }
    return;
  }

  // Sync to all_leads.unified_context
  if (data && data.length > 0 && data[0].lead_id) {
    const sessionData = data[0];
    const webContext = {
      conversation_summary: summary,
      booking_status: sessionData.booking_status || null,
      booking_date: sessionData.booking_date || null,
      booking_time: sessionData.booking_time || null,
      user_inputs: sessionData.user_inputs_summary || [],
    };

    const { data: existingLead } = await client
      .from('all_leads')
      .select('unified_context')
      .eq('id', data[0].lead_id)
      .maybeSingle();

    const existingCtx = existingLead?.unified_context || {};
    const mergedCtx = {
      ...existingCtx,
      [channel]: {
        ...(existingCtx[channel] || {}),
        ...webContext,
      },
    };

    await client
      .from('all_leads')
      .update({ unified_context: mergedCtx })
      .eq('id', data[0].lead_id);
  }
}

/**
 * Fetch the current conversation summary for a session
 */
export async function fetchSummary(
  externalSessionId: string,
  channel: Channel = 'web',
  supabase?: SupabaseClient | null,
): Promise<SessionSummary | null> {
  const client = supabase || getClient();
  if (!client) return null;

  const tableName = getChannelTable(channel);

  const { data, error } = await client
    .from(tableName)
    .select('conversation_summary, last_message_at')
    .eq('external_session_id', externalSessionId)
    .maybeSingle();

  if (error) {
    if (error.code === '42P01' || error.code === '42703') {
      const { data: fallback } = await client
        .from('sessions')
        .select('conversation_summary, last_message_at')
        .eq('external_session_id', externalSessionId)
        .maybeSingle();

      if (!fallback?.conversation_summary) return null;
      return {
        summary: cleanSummary(fallback.conversation_summary),
        lastMessageCreatedAt: fallback.last_message_at || getISTTimestamp(),
      };
    }
    console.error('[conversationLogger] Failed to fetch summary', error);
    return null;
  }

  if (!data?.conversation_summary) return null;

  return {
    summary: cleanSummary(data.conversation_summary),
    lastMessageCreatedAt: data.last_message_at || getISTTimestamp(),
  };
}

// ─── Conversation Message Logging ───────────────────────────────────────────

/**
 * Log a message to the conversations table (used by Dashboard Inbox)
 * Requires leadId — use leadManager.ensureOrUpdateLead() first
 */
export async function logMessage(
  leadId: string,
  channel: Channel,
  sender: 'customer' | 'agent' | 'system',
  content: string,
  messageType: string = 'text',
  metadata: any = {},
  supabase?: SupabaseClient | null,
): Promise<any | null> {
  if (!leadId || !content) {
    console.log('[conversationLogger] Missing leadId or content, skipping');
    return null;
  }

  const client = supabase || getServiceClient() || getClient();
  if (!client) {
    console.error('[conversationLogger] No Supabase client available');
    return null;
  }

  const cleanedContent = stripHTML(content);

  const insertData = {
    lead_id: leadId,
    channel: channel,
    sender: sender,
    content: cleanedContent,
    message_type: messageType,
    metadata: {
      ...metadata,
      logged_at: new Date().toISOString(),
      topic: 'chat',
      extension: channel,
    },
  };

  try {
    // Verify lead exists (foreign key constraint)
    const { data: leadCheck } = await client
      .from('all_leads')
      .select('id')
      .eq('id', leadId)
      .maybeSingle();

    if (!leadCheck) {
      console.error('[conversationLogger] Lead does not exist', { leadId });
      return null;
    }

    const { data, error } = await client
      .from('conversations')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('[conversationLogger] Failed to log message', {
        error,
        code: error.code,
        leadId,
        channel,
        sender,
      });

      if (error.code === '23503') {
        console.error('[conversationLogger] Foreign key constraint — lead_id not in all_leads');
      }
      return null;
    }

    return data;
  } catch (err: any) {
    console.error('[conversationLogger] Exception logging message', { error: err?.message, leadId });
    return null;
  }
}

/**
 * Fetch conversation messages for a lead from the conversations table
 */
export async function fetchConversations(
  leadId: string,
  channel: Channel = 'web',
  limit: number = 50,
  supabase?: SupabaseClient | null,
): Promise<ConversationMessage[]> {
  const client = supabase || getClient();
  if (!client) return [];

  try {
    const { data, error } = await client
      .from('conversations')
      .select('*')
      .eq('lead_id', leadId)
      .eq('channel', channel)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('[conversationLogger] Failed to fetch conversations', {
        error,
        leadId,
        channel,
      });
      return [];
    }

    return data || [];
  } catch (err: any) {
    console.error('[conversationLogger] Exception fetching conversations', { error: err?.message });
    return [];
  }
}
