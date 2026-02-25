/**
 * services/contextBuilder.ts — Cross-channel context assembly
 *
 * Extracted from:
 *   - web-agent/src/lib/chatSessions.ts: updateWindchasersProfile() (1685-1835)
 *   - dashboard/api/integrations/whatsapp/system-prompt/route.ts:
 *       fetchCustomerContext() (18-143), extractTopics() (148-171),
 *       formatBookingDate() (176-200)
 *
 * Tables: all_leads, web_sessions, whatsapp_sessions, voice_sessions, social_sessions
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient, getClient } from './supabase';
import { getISTTimestamp } from './utils';
import { ensureSession, getChannelTable, type Channel, type UserInput } from './sessionManager';
import { ensureOrUpdateLead } from './leadManager';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CustomerContext {
  leadId: string;
  unifiedContext: Record<string, any>;
  bookingDate: string | null;
  bookingTime: string | null;
  firstTouchpoint: string | null;
  lastTouchpoint: string | null;
  webSummary: { summary: string; lastInteraction: string | null } | null;
  whatsappSummary: { summary: string; lastInteraction: string | null } | null;
  voiceSummary: { summary: string; lastInteraction: string | null } | null;
  socialSummary: { summary: string; lastInteraction: string | null } | null;
}

export interface WindchasersUserProfile {
  name?: string;
  phone?: string;
  email?: string;
  user_type?: 'student' | 'parent' | 'professional';
  education?: '12th_completed' | 'in_school';
  course_interest?: 'pilot' | 'helicopter' | 'drone' | 'cabin';
  timeline?: 'asap' | '1-3mo' | '6+mo' | '1yr+';
  button_clicks?: string[];
  questions_asked?: string[];
  stage?: 'exploration' | 'consideration' | 'ready' | 'booked';
}

// ─── Topic Extraction ───────────────────────────────────────────────────────

/**
 * Extract key topics from a conversation summary
 */
export function extractTopics(summary: string): string[] {
  if (!summary) return [];

  const topics: string[] = [];
  const lower = summary.toLowerCase();

  const keywords = [
    'pricing', 'price', 'cost', 'plan', 'package',
    'features', 'feature', 'functionality',
    'integration', 'integrate', 'api',
    'demo', 'demonstration', 'trial',
    'implementation', 'setup', 'onboarding',
    'support', 'help', 'assistance',
    'qualification', 'qualify', 'lead',
    // Aviation-specific (Windchasers)
    'pilot', 'helicopter', 'drone', 'cabin crew',
    'dgca', 'cpl', 'atpl', 'training', 'license',
  ];

  keywords.forEach(keyword => {
    if (lower.includes(keyword)) topics.push(keyword);
  });

  return topics.slice(0, 5);
}

/**
 * Format booking date/time for human-readable display
 */
export function formatBookingInfo(
  dateString: string | null,
  timeString: string | null,
): string | null {
  if (!dateString) return null;

  try {
    const date = new Date(dateString);
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    };
    const formatted = date.toLocaleDateString('en-US', options);

    if (timeString) {
      const [hours, minutes] = timeString.split(':');
      const hour12 = parseInt(hours) % 12 || 12;
      const ampm = parseInt(hours) >= 12 ? 'PM' : 'AM';
      return `${formatted} at ${hour12}:${minutes} ${ampm}`;
    }

    return formatted;
  } catch {
    return dateString;
  }
}

// ─── Cross-Channel Context ──────────────────────────────────────────────────

/**
 * Fetch unified customer context from all channels
 * Used by WhatsApp system-prompt builder for context-aware conversations
 */
export async function fetchCustomerContext(
  phone: string,
  name?: string,
  supabase?: SupabaseClient | null,
): Promise<CustomerContext | null> {
  const client = supabase || getServiceClient() || getClient();
  if (!client) return null;

  const normalizedPhone = phone.replace(/\D/g, '');

  // Fetch lead from all_leads
  const { data: lead, error: leadError } = await client
    .from('all_leads')
    .select('id, unified_context, booking_date, booking_time, first_touchpoint, last_touchpoint')
    .eq('customer_phone_normalized', normalizedPhone)
    .maybeSingle();

  if (leadError || !lead) return null;

  const context: CustomerContext = {
    leadId: lead.id,
    unifiedContext: lead.unified_context || {},
    bookingDate: lead.booking_date,
    bookingTime: lead.booking_time,
    firstTouchpoint: lead.first_touchpoint,
    lastTouchpoint: lead.last_touchpoint,
    webSummary: null,
    whatsappSummary: null,
    voiceSummary: null,
    socialSummary: null,
  };

  // Fetch web conversation summary
  const { data: webSession } = await client
    .from('web_sessions')
    .select('conversation_summary, last_message_at')
    .eq('lead_id', lead.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (webSession?.conversation_summary) {
    context.webSummary = {
      summary: webSession.conversation_summary,
      lastInteraction: webSession.last_message_at,
    };
  }
  // Also check unified_context.web
  if (context.unifiedContext?.web?.conversation_summary) {
    context.webSummary = {
      summary: context.unifiedContext.web.conversation_summary,
      lastInteraction: context.unifiedContext.web.last_interaction,
    };
  }

  // Fetch WhatsApp conversation summary
  const { data: waSession } = await client
    .from('whatsapp_sessions')
    .select('conversation_summary, last_message_at')
    .eq('lead_id', lead.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (waSession?.conversation_summary) {
    context.whatsappSummary = {
      summary: waSession.conversation_summary,
      lastInteraction: waSession.last_message_at,
    };
  }
  if (context.unifiedContext?.whatsapp?.conversation_summary) {
    context.whatsappSummary = {
      summary: context.unifiedContext.whatsapp.conversation_summary,
      lastInteraction: context.unifiedContext.whatsapp.last_interaction,
    };
  }

  // Fetch voice conversation summary
  const { data: voiceSession } = await client
    .from('voice_sessions')
    .select('call_summary, updated_at')
    .eq('lead_id', lead.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (voiceSession?.call_summary) {
    context.voiceSummary = {
      summary: voiceSession.call_summary,
      lastInteraction: voiceSession.updated_at,
    };
  }
  if (context.unifiedContext?.voice?.conversation_summary) {
    context.voiceSummary = {
      summary: context.unifiedContext.voice.conversation_summary,
      lastInteraction: context.unifiedContext.voice.last_interaction,
    };
  }

  // Fetch social conversation summary
  const { data: socialSession } = await client
    .from('social_sessions')
    .select('conversation_summary, last_engagement_at')
    .eq('lead_id', lead.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (socialSession?.conversation_summary) {
    context.socialSummary = {
      summary: socialSession.conversation_summary,
      lastInteraction: socialSession.last_engagement_at,
    };
  }
  if (context.unifiedContext?.social?.conversation_summary) {
    context.socialSummary = {
      summary: context.unifiedContext.social.conversation_summary,
      lastInteraction: context.unifiedContext.social.last_interaction,
    };
  }

  return context;
}

// ─── Brand Profile Updates ──────────────────────────────────────────────────

/**
 * Update brand-specific user profile data (e.g. Windchasers aviation preferences)
 * Syncs to both the channel session and all_leads.unified_context
 */
export async function updateBrandProfile(
  externalSessionId: string,
  profileData: Partial<WindchasersUserProfile>,
  channel: Channel = 'web',
  supabase?: SupabaseClient | null,
): Promise<void> {
  const client = supabase || getClient();
  if (!client) return;

  await ensureSession(externalSessionId, channel, client);

  const tableName = getChannelTable(channel);

  // Fetch current session
  const { data: currentSession } = await client
    .from(tableName)
    .select('user_inputs_summary, customer_name, customer_email, customer_phone, lead_id')
    .eq('external_session_id', externalSessionId)
    .maybeSingle();

  if (!currentSession) {
    console.error('[contextBuilder] Session not found', { externalSessionId });
    return;
  }

  // Update basic profile fields
  const updates: Record<string, any> = {};
  if (profileData.name) updates.customer_name = profileData.name.trim();
  if (profileData.phone) updates.customer_phone = profileData.phone.trim();
  if (profileData.email) updates.customer_email = profileData.email.trim();

  if (Object.keys(updates).length > 0) {
    const { error } = await client
      .from(tableName)
      .update(updates)
      .eq('external_session_id', externalSessionId);

    if (error) {
      console.error('[contextBuilder] Failed to update session profile', error);
    }
  }

  // Build brand-specific context
  const brandContext: any = {
    user_type: profileData.user_type || null,
    education: profileData.education || null,
    course_interest: profileData.course_interest || null,
    plan_to_fly: profileData.timeline || null,
    timeline: profileData.timeline || null,
    button_clicks: profileData.button_clicks || [],
    questions_asked: profileData.questions_asked || [],
    stage: profileData.stage || 'exploration',
  };

  // Find or create lead
  let leadId: string | null = currentSession.lead_id || null;

  if (!leadId) {
    const phone = profileData.phone || currentSession.customer_phone;
    if (phone) {
      leadId = await ensureOrUpdateLead(
        profileData.name || currentSession.customer_name,
        profileData.email || currentSession.customer_email,
        phone,
        channel,
        externalSessionId,
        client,
      );
    }

    // Fallback: find by email
    if (!leadId && currentSession.customer_email) {
      const { data: leadByEmail } = await client
        .from('all_leads')
        .select('id')
        .eq('email', currentSession.customer_email)
        .maybeSingle();

      if (leadByEmail?.id) leadId = leadByEmail.id;
    }
  }

  // Update all_leads.unified_context.windchasers
  if (leadId) {
    const { data: leadData } = await client
      .from('all_leads')
      .select('unified_context')
      .eq('id', leadId)
      .maybeSingle();

    if (leadData) {
      const existingCtx = leadData.unified_context || {};
      const updatedCtx = {
        ...existingCtx,
        windchasers: {
          ...(existingCtx.windchasers || {}),
          ...brandContext,
        },
      };

      const { error: updateError } = await client
        .from('all_leads')
        .update({
          unified_context: updatedCtx,
          last_interaction_at: getISTTimestamp(),
        })
        .eq('id', leadId);

      if (updateError) {
        console.error('[contextBuilder] Failed to update lead unified_context', updateError);
      }
    }
  }
}
