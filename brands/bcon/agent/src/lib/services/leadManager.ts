/**
 * services/leadManager.ts — Lead creation, deduplication, and profile updates
 *
 * Extracted from: web-agent/src/lib/chatSessions.ts
 *   - normalizePhone()       (lines 105-158)
 *   - ensureAllLeads()       (lines 161-536)
 *   - updateSessionProfile() (lines 821-1065)
 *   - isCompleteLead()       (lines 813-819)
 *
 * Tables: all_leads, web_sessions (via sessionManager)
 * Key: Phone is REQUIRED for lead creation; dedup on customer_phone_normalized
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient, getClient } from './supabase';
import { getISTTimestamp, cleanSummary } from './utils';
import { ensureSession, getChannelTable, type Channel } from './sessionManager';

// ─── Phone Normalization ────────────────────────────────────────────────────

/**
 * Normalize phone number for deduplication
 * Handles: +91, +1, spaces, dashes, parentheses, leading zeros
 * Always returns last 10 digits for matching
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;

  const digits = phone.replace(/\D/g, '');
  if (!digits || digits.length < 10) return null;

  let cleaned = digits;

  // Remove India country code (+91)
  if (cleaned.startsWith('91') && cleaned.length > 10) {
    cleaned = cleaned.slice(2);
  }
  // Remove US/Canada country code (+1)
  else if (cleaned.startsWith('1') && cleaned.length === 11) {
    cleaned = cleaned.slice(1);
  }

  // Remove leading zeros
  cleaned = cleaned.replace(/^0+/, '');

  if (cleaned.length < 10) return null;

  // Always return last 10 digits
  return cleaned.slice(-10);
}

// ─── Lead Helpers ───────────────────────────────────────────────────────────

/**
 * Check if a lead profile has all required fields
 */
function isCompleteLead(profile: {
  userName?: string | null;
  phone?: string | null;
  email?: string | null;
}): boolean {
  return (
    Boolean(profile.userName?.trim()) &&
    Boolean(profile.email?.trim()) &&
    Boolean(profile.phone?.trim())
  );
}

// ─── Lead Operations ────────────────────────────────────────────────────────

/**
 * Ensure an all_leads record exists for a customer, or update the existing one.
 * Phone is REQUIRED for lead creation. Deduplicates on customer_phone_normalized.
 *
 * @returns lead_id or null
 */
export async function ensureOrUpdateLead(
  customerName: string | null,
  email: string | null,
  phone: string | null,
  channel: Channel,
  externalSessionId?: string,
  supabase?: SupabaseClient | null,
): Promise<string | null> {
  // Prefer service role client for lead operations (bypasses RLS)
  const client = supabase || getServiceClient() || getClient();
  if (!client) {
    console.error('[leadManager] No Supabase client available');
    return null;
  }

  // Phone is REQUIRED
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    console.warn('[leadManager] Cannot create lead: phone is required', { phone, email });
    return null;
  }

  try {
    // Fetch conversation context from channel session if available
    let unifiedContext: any = {};
    if (externalSessionId) {
      const tableName = getChannelTable(channel);
      const { data: sessionData } = await client
        .from(tableName)
        .select('conversation_summary, booking_status, booking_date, booking_time, user_inputs_summary')
        .eq('external_session_id', externalSessionId)
        .maybeSingle();

      if (sessionData) {
        const userInputs: any[] = Array.isArray(sessionData.user_inputs_summary)
          ? sessionData.user_inputs_summary
          : [];

        // Extract brand-specific profile data from user inputs
        const brandData: any = {};
        userInputs.forEach((input: any) => {
          if (input.user_type) brandData.user_type = input.user_type;
          if (input.course_interest) brandData.course_interest = input.course_interest;
          if (input.timeline) {
            brandData.timeline = input.timeline;
            brandData.plan_to_fly = input.timeline;
          }
          if (input.education) brandData.education = input.education;
        });

        unifiedContext = {
          [channel]: {
            conversation_summary: cleanSummary(sessionData.conversation_summary) || null,
            booking_status: sessionData.booking_status || null,
            booking_date: sessionData.booking_date || null,
            booking_time: sessionData.booking_time || null,
            user_inputs: userInputs,
          },
          ...(Object.keys(brandData).length > 0 ? { bcon: brandData } : {}),
        };
      }
    }

    // ── Look up existing lead ──────────────────────────────────────────────

    let existing: any = null;

    // Try by normalized phone first
    const { data: byPhone, error: phoneErr } = await client
      .from('all_leads')
      .select('id, unified_context, email, customer_name, phone')
      .eq('customer_phone_normalized', normalizedPhone)
      .maybeSingle();

    if (phoneErr && phoneErr.code === '42P01') {
      console.log('[leadManager] all_leads table not found');
      return null;
    }

    existing = byPhone;

    // Fallback: try by email
    if (!existing && email) {
      const { data: byEmail } = await client
        .from('all_leads')
        .select('id, unified_context, email, customer_name, phone')
        .eq('email', email)
        .maybeSingle();

      if (byEmail) existing = byEmail;
    }

    // ── Update existing lead ───────────────────────────────────────────────

    if (existing) {
      const existingCtx = existing.unified_context || {};
      const mergedContext = {
        ...existingCtx,
        [channel]: {
          ...(existingCtx[channel] || {}),
          ...(unifiedContext[channel] || {}),
        },
        bcon: {
          ...(existingCtx.bcon || {}),
          ...(unifiedContext.bcon || {}),
        },
      };

      const updates: any = {
        last_touchpoint: channel,
        last_interaction_at: getISTTimestamp(),
        unified_context: Object.keys(mergedContext).length > 0 ? mergedContext : undefined,
      };

      if (customerName) updates.customer_name = customerName;
      if (email) updates.email = email;
      if (phone) updates.phone = phone;
      if (normalizedPhone) updates.customer_phone_normalized = normalizedPhone;

      const { error: updateError } = await client
        .from('all_leads')
        .update(updates)
        .eq('id', existing.id);

      if (updateError) {
        console.error('[leadManager] Failed to update lead', { error: updateError, leadId: existing.id });
        return null;
      }

      return existing.id;
    }

    // ── Create new lead ────────────────────────────────────────────────────

    const insertData: any = {
      customer_name: customerName,
      email: email,
      phone: phone,
      customer_phone_normalized: normalizedPhone,
      first_touchpoint: channel,
      last_touchpoint: channel,
      last_interaction_at: new Date().toISOString(),
      unified_context: Object.keys(unifiedContext).length > 0 ? unifiedContext : null,
    };

    const { data: created, error: createError } = await client
      .from('all_leads')
      .insert(insertData)
      .select('id')
      .single();

    if (createError) {
      // Duplicate — fetch existing
      if (createError.code === '23505' || createError.message?.includes('duplicate')) {
        let dup: any = null;
        const { data: d1 } = await client
          .from('all_leads')
          .select('id')
          .eq('customer_phone_normalized', normalizedPhone)
          .maybeSingle();
        dup = d1;

        if (!dup && email) {
          const { data: d2 } = await client
            .from('all_leads')
            .select('id')
            .eq('email', email)
            .maybeSingle();
          dup = d2;
        }

        if (dup) return dup.id;
      }

      console.error('[leadManager] Failed to create lead', {
        error: createError,
        code: createError.code,
      });
      return null;
    }

    if (!created?.id) {
      console.error('[leadManager] Lead created but no ID returned');
      return null;
    }

    console.log('[leadManager] New lead created', { leadId: created.id });
    return created.id;
  } catch (error) {
    console.warn('[leadManager] Error in ensureOrUpdateLead', error);
    return null;
  }
}

/**
 * Update session profile (name/phone/email) and trigger lead creation
 * Returns lead_id if a lead was created/found
 */
export async function updateLeadProfile(
  externalSessionId: string,
  profile: {
    userName?: string;
    phone?: string | null;
    email?: string | null;
    websiteUrl?: string | null;
  },
  channel: Channel = 'web',
  supabase?: SupabaseClient | null,
): Promise<string | null> {
  const client = supabase || getServiceClient() || getClient();
  if (!client) {
    console.error('[leadManager] No Supabase client available');
    return null;
  }

  // Ensure session exists
  await ensureSession(externalSessionId, channel, client);

  // Build updates
  const updates: Record<string, string | null | undefined> = {};
  if (typeof profile.userName === 'string') updates.customer_name = profile.userName.trim() || null;
  if (profile.phone !== undefined) updates.customer_phone = profile.phone?.trim() || null;
  if (profile.email !== undefined) updates.customer_email = profile.email?.trim() || null;
  if (profile.websiteUrl !== undefined) updates.website_url = profile.websiteUrl?.trim() || null;

  if (Object.keys(updates).length === 0) return null;

  const tableName = getChannelTable(channel);

  const { error } = await client
    .from(tableName)
    .update(updates)
    .eq('external_session_id', externalSessionId);

  if (error) {
    // Fallback to old sessions table
    if (error.code === '42P01' || error.code === '42703') {
      const fallbackUpdates: Record<string, string | null | undefined> = {};
      if (typeof profile.userName === 'string') fallbackUpdates.user_name = profile.userName.trim() || null;
      if (profile.phone !== undefined) fallbackUpdates.phone = profile.phone?.trim() || null;
      if (profile.email !== undefined) fallbackUpdates.email = profile.email?.trim() || null;
      if (profile.websiteUrl !== undefined) fallbackUpdates.website_url = profile.websiteUrl?.trim() || null;

      await client
        .from('sessions')
        .update(fallbackUpdates)
        .eq('external_session_id', externalSessionId);
    } else {
      console.error('[leadManager] Profile update failed', { error, externalSessionId });
      return null;
    }
  }

  // Fetch merged profile from database to use for lead creation
  const { data: updatedSession } = await client
    .from(tableName)
    .select('customer_name, customer_email, customer_phone')
    .eq('external_session_id', externalSessionId)
    .maybeSingle();

  if (!updatedSession) return null;

  const mergedProfile = {
    userName: updatedSession.customer_name ?? null,
    email: updatedSession.customer_email ?? null,
    phone: updatedSession.customer_phone ?? null,
  };

  // Phone is required for lead creation
  if (!mergedProfile.phone) return null;

  const leadId = await ensureOrUpdateLead(
    mergedProfile.userName,
    mergedProfile.email,
    mergedProfile.phone,
    channel,
    externalSessionId,
    client,
  );

  // Link lead_id to session
  if (leadId) {
    const { error: linkError } = await client
      .from(tableName)
      .update({ lead_id: leadId })
      .eq('external_session_id', externalSessionId);

    if (linkError) {
      console.error('[leadManager] Failed to link lead_id to session', { leadId, error: linkError });
      return null;
    }

    console.log('[leadManager] Lead linked to session', { leadId, externalSessionId });
  }

  return leadId;
}
