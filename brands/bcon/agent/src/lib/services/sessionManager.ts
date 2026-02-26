/**
 * services/sessionManager.ts — Channel-agnostic session CRUD
 *
 * Extracted from: web-agent/src/lib/chatSessions.ts
 *   - mapSession()          (lines 538-562)
 *   - initializeSessionOnOpen() (lines 564-621)
 *   - ensureSession()       (lines 623-810)
 *   - updateChannelData()   (lines 1837-1899)
 *
 * Tables: web_sessions, whatsapp_sessions, voice_sessions, social_sessions
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getClient } from './supabase';
import { getISTTimestamp, cleanSummary } from './utils';

// ─── Types ──────────────────────────────────────────────────────────────────

export type Channel = 'web' | 'whatsapp' | 'voice' | 'social';

export interface SessionRecord {
  id: string;
  externalSessionId: string;
  userName: string | null;
  phone: string | null;
  email: string | null;
  websiteUrl: string | null;
  conversationSummary: string | null;
  lastMessageAt: string | null;
  userInputsSummary: UserInput[];
  messageCount: number;
  bookingDate: string | null;
  bookingTime: string | null;
  bookingStatus: 'pending' | 'confirmed' | 'Call Booked' | 'cancelled' | null;
  googleEventId: string | null;
  bookingCreatedAt: string | null;
  channel: Channel;
  channelData: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  leadId?: string | null;
}

export interface UserInput {
  input: string;
  intent?: string;
  created_at: string;
  user_type?: string;
  course_interest?: string;
  timeline?: string;
  education?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Map channel to its database table name
 */
export function getChannelTable(channel: Channel): string {
  const map: Record<Channel, string> = {
    web: 'web_sessions',
    whatsapp: 'whatsapp_sessions',
    voice: 'voice_sessions',
    social: 'social_sessions',
  };
  return map[channel] || 'web_sessions';
}

/**
 * Map a raw database row to a typed SessionRecord
 */
export function mapSession(row: any): SessionRecord {
  return {
    id: row.id,
    externalSessionId: row.external_session_id || row.externalSessionId,
    userName: row.customer_name ?? row.user_name ?? null,
    phone: row.customer_phone ?? row.phone ?? null,
    email: row.customer_email ?? row.email ?? null,
    websiteUrl: row.website_url ?? null,
    conversationSummary: cleanSummary(row.conversation_summary) ?? null,
    lastMessageAt: row.last_message_at ?? null,
    userInputsSummary: Array.isArray(row.user_inputs_summary) ? row.user_inputs_summary : [],
    messageCount: row.message_count ?? 0,
    bookingDate: row.booking_date ?? null,
    bookingTime: row.booking_time ?? null,
    bookingStatus: row.booking_status ?? null,
    googleEventId: row.google_event_id ?? null,
    bookingCreatedAt: row.booking_created_at ?? null,
    channel: row.channel ?? 'web',
    channelData: row.channel_data ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    leadId: row.lead_id ?? null,
  };
}

// ─── Session Operations ─────────────────────────────────────────────────────

/**
 * Initialize a session when the chat widget opens (web channel)
 * Creates a new session if one doesn't exist, or reactivates it
 */
export async function initializeSession(
  externalSessionId: string,
  channel: Channel = 'web',
  supabase?: SupabaseClient | null,
): Promise<SessionRecord | null> {
  const client = supabase || getClient();
  if (!client) {
    console.warn('[sessionManager] No Supabase client available');
    return null;
  }

  const tableName = getChannelTable(channel);

  // Check if session already exists
  const { data: existing } = await client
    .from(tableName)
    .select('*')
    .eq('external_session_id', externalSessionId)
    .maybeSingle();

  if (existing) {
    // Reactivate if inactive
    if (existing.session_status !== 'active') {
      await client
        .from(tableName)
        .update({ session_status: 'active' })
        .eq('external_session_id', externalSessionId);
    }
    return mapSession(existing);
  }

  // Create new session
  const insertData: Record<string, any> = {
    external_session_id: externalSessionId,
    session_status: 'active',
    message_count: 0,
    created_at: getISTTimestamp(),
  };

  const { data: created, error: insertError } = await client
    .from(tableName)
    .insert(insertData)
    .select('*')
    .single();

  if (insertError) {
    console.error('[sessionManager] Failed to initialize session', insertError);
    return null;
  }

  if (created) {
    console.log('[sessionManager] Session initialized', { externalSessionId, channel });
    return mapSession(created);
  }

  return null;
}

/**
 * Get or create a session for any channel
 * Handles duplicate key conflicts, table fallbacks, and minimal inserts
 */
export async function ensureSession(
  externalSessionId: string,
  channel: Channel,
  supabase?: SupabaseClient | null,
): Promise<SessionRecord | null> {
  const client = supabase || getClient();
  if (!client) {
    console.warn('[sessionManager] No Supabase client available');
    return null;
  }

  const tableName = getChannelTable(channel);

  // Try to fetch existing session
  const { data, error } = await client
    .from(tableName)
    .select('*')
    .eq('external_session_id', externalSessionId)
    .maybeSingle();

  if (error) {
    if (error.code === '42P01' || error.code === '42703') {
      console.log('[sessionManager] Channel table not available, trying fallback');
      const { data: fallbackData, error: fallbackError } = await client
        .from('sessions')
        .select('*')
        .eq('external_session_id', externalSessionId)
        .maybeSingle();

      if (fallbackError) {
        console.error('[sessionManager] Fallback fetch failed', fallbackError);
        return null;
      }
      if (fallbackData) return mapSession(fallbackData);
    } else {
      console.error('[sessionManager] Failed to fetch session', error);
      return null;
    }
  }

  if (data) return mapSession(data);

  // Create new session
  const insertData: Record<string, any> = {
    external_session_id: externalSessionId,
    session_status: 'active',
    channel_data: {},
  };

  const { data: created, error: insertError } = await client
    .from(tableName)
    .insert(insertData)
    .select('*')
    .single();

  if (insertError) {
    // Handle duplicate key (race condition)
    if (
      insertError.code === '23505' ||
      insertError.message?.includes('duplicate key value')
    ) {
      console.log('[sessionManager] Duplicate session detected, fetching existing');
      const { data: existing } = await client
        .from(tableName)
        .select('*')
        .eq('external_session_id', externalSessionId)
        .maybeSingle();

      if (existing) return mapSession(existing);
      return null;
    }

    // Table doesn't exist — fallback
    if (insertError.code === '42P01' || insertError.code === '42703' || insertError.code === '42702') {
      console.log('[sessionManager] Channel table unavailable, creating in fallback');
      const { data: fallbackCreated, error: fallbackError } = await client
        .from('sessions')
        .insert({
          external_session_id: externalSessionId,
          channel: channel,
          channel_data: {},
        })
        .select('*')
        .single();

      if (fallbackError) {
        console.error('[sessionManager] Fallback insert failed', fallbackError);
        return null;
      }
      if (fallbackCreated) return mapSession(fallbackCreated);
    }

    // NOT NULL constraint — try minimal insert
    if (insertError.code === '23502') {
      console.log('[sessionManager] Trying minimal insert');
      const { data: minimalCreated, error: minimalError } = await client
        .from(tableName)
        .insert({ external_session_id: externalSessionId })
        .select('*')
        .single();

      if (minimalError) {
        console.error('[sessionManager] Minimal insert failed', minimalError);
        return null;
      }
      if (minimalCreated) return mapSession(minimalCreated);
    }

    console.error('[sessionManager] Failed to create session', {
      error: insertError,
      code: insertError.code,
      tableName,
    });
    return null;
  }

  if (created) return mapSession(created);
  return null;
}

/**
 * Merge new data into a session's channel_data JSON column
 */
export async function updateChannelData(
  externalSessionId: string,
  channel: Channel,
  channelData: Record<string, any>,
  supabase?: SupabaseClient | null,
): Promise<void> {
  const client = supabase || getClient();
  if (!client) {
    console.warn('[sessionManager] No Supabase client available');
    return;
  }

  const tableName = getChannelTable(channel);

  // Fetch current channel_data to merge
  const { data: session, error: fetchError } = await client
    .from(tableName)
    .select('channel_data')
    .eq('external_session_id', externalSessionId)
    .maybeSingle();

  if (fetchError) {
    if (fetchError.code === '42P01' || fetchError.code === '42703') {
      // Fallback to old sessions table
      const { data: fallbackSession } = await client
        .from('sessions')
        .select('channel_data')
        .eq('external_session_id', externalSessionId)
        .maybeSingle();

      const currentData = fallbackSession?.channel_data ?? {};
      await client
        .from('sessions')
        .update({ channel_data: { ...currentData, ...channelData } })
        .eq('external_session_id', externalSessionId);
      return;
    }
    console.error('[sessionManager] Failed to fetch for updateChannelData', fetchError);
    return;
  }

  const currentData = session?.channel_data ?? {};
  const { error } = await client
    .from(tableName)
    .update({ channel_data: { ...currentData, ...channelData } })
    .eq('external_session_id', externalSessionId);

  if (error) {
    console.error('[sessionManager] Failed to update channel data', error);
  }
}
