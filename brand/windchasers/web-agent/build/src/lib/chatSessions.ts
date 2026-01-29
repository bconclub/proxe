import { getSupabaseClient, getSupabaseServiceClient } from './supabase';

// Channel type definition
// NOTE: Full type includes all 4 channels for future use
// Current build (goproxe.com) only uses: 'web' and 'voice'
// WhatsApp and Social are ready for future implementation
export type Channel = 'web' | 'whatsapp' | 'voice' | 'social';

// Helper function to clean metadata strings from conversation summary
function cleanSummary(summary: string | null | undefined): string {
  if (!summary) return '';
  return summary
    .replace(/\[User's name is[^\]]+\]/gi, '')
    .replace(/\[Booking Status:[^\]]+\]/gi, '')
    .replace(/\n\n+/g, '\n')
    .trim();
}

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
  brand: 'proxe' | 'windchasers' | 'windchasers';
  channel: Channel;
  channelData: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface UserInput {
  input: string;
  intent?: string;
  created_at: string;
}

export interface SessionSummary {
  summary: string;
  lastMessageCreatedAt: string;
}

// Get the table name for a channel
// New structure: web_sessions is self-contained (not sessions)
function getChannelTable(channel: Channel): string {
  const channelTableMap: Record<Channel, string> = {
    web: 'web_sessions',
    whatsapp: 'whatsapp_sessions',
    voice: 'voice_sessions',
    social: 'social_sessions',
  };
  return channelTableMap[channel] || 'web_sessions';
}

// Helper function to get current date/time in UTC+5:30 (IST)
function getISTTimestamp(): string {
  try {
    const now = new Date();
    // Get IST time components using Intl.DateTimeFormat
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
    
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}+05:30`;
  } catch (error) {
    // Fallback to UTC if IST conversion fails
    console.error('[getISTTimestamp] Error converting to IST, using UTC:', error);
    return new Date().toISOString();
  }
}

// Helper function to normalize phone number for all_leads deduplication
// Handles various formats: international (+91), with/without country codes, spaces, dashes, etc.
function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  
  if (!digits || digits.length < 10) {
    console.log('[normalizePhone] Phone number too short or invalid', { 
      original: phone, 
      digits, 
      length: digits?.length 
    });
    return null;
  }
  
  // Handle international formats
  // Remove common country codes (India: +91, US: +1, etc.)
  let cleanedDigits = digits;
  
  // Remove India country code (+91)
  if (cleanedDigits.startsWith('91') && cleanedDigits.length > 10) {
    cleanedDigits = cleanedDigits.slice(2);
  }
  // Remove US/Canada country code (+1)
  else if (cleanedDigits.startsWith('1') && cleanedDigits.length === 11) {
    cleanedDigits = cleanedDigits.slice(1);
  }
  
  // Remove leading zeros
  cleanedDigits = cleanedDigits.replace(/^0+/, '');
  
  // Need at least 10 digits after cleaning
  if (cleanedDigits.length < 10) {
    console.log('[normalizePhone] Phone number too short after cleaning', { 
      original: phone, 
      digits, 
      cleanedDigits,
      length: cleanedDigits.length 
    });
    return null;
  }
  
  // Always return last 10 digits for matching (handles cases with extra digits)
  const normalized = cleanedDigits.slice(-10);
  
  console.log('[normalizePhone] Normalized phone', { 
    original: phone, 
    normalized,
    digits,
    cleanedDigits
  });
  
  return normalized;
}

// Helper function to ensure all_leads record exists and return lead_id
export async function ensureAllLeads(
  customerName: string | null,
  email: string | null,
  phone: string | null,
  brand: 'proxe' | 'windchasers' | 'windchasers',
  externalSessionId?: string
): Promise<string | null> {
  console.log('[ensureAllLeads] Called', {
    hasName: !!customerName,
    hasEmail: !!email,
    hasPhone: !!phone,
    phone: phone ? phone.substring(0, 5) + '...' : null,
    brand,
    externalSessionId
  });

  // Use service role client for lead creation (bypasses RLS, more reliable)
  // Fallback to anon client if service client unavailable
  let supabase = getSupabaseServiceClient();
  const usingServiceClient = !!supabase;
  
  if (!supabase) {
    console.warn('[ensureAllLeads] Service role client not available, falling back to anon client', {
      hasServiceKey: !!process.env.WINDCHASERS_SUPABASE_SERVICE_KEY,
      envCheck: {
        hasUrl: !!process.env.NEXT_PUBLIC_WINDCHASERS_SUPABASE_URL || !!process.env.WINDCHASERS_SUPABASE_URL,
        hasAnonKey: !!process.env.NEXT_PUBLIC_WINDCHASERS_SUPABASE_ANON_KEY || !!process.env.WINDCHASERS_SUPABASE_ANON_KEY
      }
    });
    supabase = getSupabaseClient();
  } else {
    console.log('[ensureAllLeads] Using service role client (bypasses RLS)', {
      urlPrefix: process.env.NEXT_PUBLIC_WINDCHASERS_SUPABASE_URL?.substring(0, 20) || 'N/A'
    });
  }
  
  if (!supabase) {
    console.error('[ensureAllLeads] No Supabase client available (neither service nor anon)', {
      envCheck: {
        hasServiceKey: !!process.env.WINDCHASERS_SUPABASE_SERVICE_KEY,
        hasUrl: !!process.env.NEXT_PUBLIC_WINDCHASERS_SUPABASE_URL || !!process.env.WINDCHASERS_SUPABASE_URL,
        hasAnonKey: !!process.env.NEXT_PUBLIC_WINDCHASERS_SUPABASE_ANON_KEY || !!process.env.WINDCHASERS_SUPABASE_ANON_KEY
      }
    });
    return null;
  }

  // Phone is REQUIRED for lead creation - email alone is not enough
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    console.warn('[ensureAllLeads] Cannot create lead: phone number is required', {
      phone,
      email,
      customerName,
      reason: 'Phone number is mandatory for lead creation'
    });
    return null;
  }

  try {
    // Fetch conversation context from web_sessions if session ID provided
    let unifiedContext: any = {};
    if (externalSessionId) {
      const tableName = getChannelTable('web');
      const { data: sessionData } = await supabase
        .from(tableName)
        .select('conversation_summary, booking_status, booking_date, booking_time, user_inputs_summary')
        .eq('external_session_id', externalSessionId)
        .maybeSingle();
      
      if (sessionData) {
        unifiedContext = {
          web: {
            conversation_summary: cleanSummary(sessionData.conversation_summary) || null,
            booking_status: sessionData.booking_status || null,
            booking_date: sessionData.booking_date || null,
            booking_time: sessionData.booking_time || null,
            user_inputs: sessionData.user_inputs_summary || [],
          }
        };
      }
    }

    // Check if all_leads table exists and find existing lead
    let existing: any = null;
    let fetchError: any = null;

    if (normalizedPhone) {
      // Try to find by normalized phone first
      const { data, error } = await supabase
        .from('all_leads')
        .select('id, unified_context, email, customer_name, phone')
        .eq('customer_phone_normalized', normalizedPhone)
        .eq('brand', brand)
        .maybeSingle();
      
      existing = data;
      fetchError = error;
    }

    // If not found by phone and we have email, try email
    if (!existing && email) {
      const { data, error } = await supabase
        .from('all_leads')
        .select('id, unified_context, email, customer_name, phone')
        .eq('email', email)
        .eq('brand', brand)
        .maybeSingle();
      
      if (!fetchError) fetchError = error;
      if (data) existing = data;
    }

    if (fetchError) {
      // Table might not exist yet - that's okay, we'll continue without lead_id
      if (fetchError.code === '42P01') {
        console.log('[ensureAllLeads] all_leads table not found, continuing without lead_id', {
          code: fetchError.code,
          message: fetchError.message
        });
        return null;
      }
      
      // Check for RLS/permission errors
      if (fetchError.code === '42501' || fetchError.message?.includes('permission') || fetchError.message?.includes('RLS')) {
        console.error('[ensureAllLeads] Permission/RLS error checking all_leads', {
          error: fetchError,
          code: fetchError.code,
          message: fetchError.message,
          hint: 'Check RLS policies on all_leads table',
          normalizedPhone,
          email,
          brand
        });
      }
      
      console.error('[ensureAllLeads] Failed to check all_leads', {
        error: fetchError,
        code: fetchError.code,
        message: fetchError.message,
        details: fetchError.details,
        hint: fetchError.hint,
        normalizedPhone,
        email,
        brand
      });
      return null;
    }

    if (existing) {
      console.log('[ensureAllLeads] Found existing lead', {
        leadId: existing.id,
        existingName: existing.customer_name,
        existingEmail: existing.email,
        existingPhone: existing.phone
      });

      // Merge with existing unified_context
      const existingContext = existing.unified_context || {};
      const mergedContext = {
        ...existingContext,
        web: {
          ...(existingContext.web || {}),
          ...unifiedContext.web,
        }
      };

      // Build update object conditionally
      const updates: any = {
        last_touchpoint: 'web',
        last_interaction_at: getISTTimestamp(),
        unified_context: Object.keys(mergedContext).length > 0 ? mergedContext : undefined,
      };

      // Only add name/email/phone if they have values
      if (customerName) updates.customer_name = customerName;
      if (email) updates.email = email;
      if (phone) updates.phone = phone;
      if (normalizedPhone) updates.customer_phone_normalized = normalizedPhone;

      const { error: updateError } = await supabase
        .from('all_leads')
        .update(updates)
        .eq('id', existing.id);

      if (updateError) {
        console.error('[ensureAllLeads] Failed to update existing lead', {
          error: updateError,
          code: updateError.code,
          message: updateError.message,
          details: updateError.details,
          leadId: existing.id,
          updates
        });
        return null;
      }

      console.log('[ensureAllLeads] Successfully updated existing lead', {
        leadId: existing.id
      });
      return existing.id;
    }

    // Create new all_leads record
    // Phone is REQUIRED - email alone is not enough
    if (!normalizedPhone) {
      console.warn('[ensureAllLeads] Cannot create lead: phone number is required', {
        phone,
        email,
        customerName,
        reason: 'Phone number is mandatory for lead creation'
      });
      return null;
    }

    const insertData: any = {
      customer_name: customerName,
      email: email,
      phone: phone,
      first_touchpoint: 'web',
      last_touchpoint: 'web',
      last_interaction_at: new Date().toISOString(),
      brand: brand,
      unified_context: Object.keys(unifiedContext).length > 0 ? unifiedContext : null,
    };

    if (normalizedPhone) {
      insertData.customer_phone_normalized = normalizedPhone;
    }

    console.log('[ensureAllLeads] Creating new lead', {
      hasName: !!insertData.customer_name,
      hasEmail: !!insertData.email,
      hasPhone: !!insertData.phone,
      hasNormalizedPhone: !!insertData.customer_phone_normalized
    });

    console.log('[ensureAllLeads] About to insert into all_leads', {
      table: 'all_leads',
      insertData: {
        ...insertData,
        phone: insertData.phone ? insertData.phone.substring(0, 5) + '...' : null,
        customer_phone_normalized: insertData.customer_phone_normalized
      },
      brand
    });

    const { data: created, error: createError } = await supabase
      .from('all_leads')
      .insert(insertData)
      .select('id')
      .single();

    console.log('[ensureAllLeads] Insert result', {
      hasData: !!created,
      hasError: !!createError,
      createdId: created?.id,
      errorCode: createError?.code,
      errorMessage: createError?.message,
      errorDetails: createError?.details,
      errorHint: createError?.hint
    });

    if (createError) {
      // Handle unique constraint violation (duplicate phone/email)
      if (createError.code === '23505' || createError.message?.includes('duplicate')) {
        console.log('[ensureAllLeads] Duplicate lead detected, fetching existing', {
          error: createError,
          normalizedPhone,
          email
        });
        
        // Try to fetch the existing record
        let existingLead: any = null;
        if (normalizedPhone) {
          const { data } = await supabase
            .from('all_leads')
            .select('id')
            .eq('customer_phone_normalized', normalizedPhone)
            .eq('brand', brand)
            .maybeSingle();
          existingLead = data;
        }
        
        if (!existingLead && email) {
          const { data } = await supabase
            .from('all_leads')
            .select('id')
            .eq('email', email)
            .eq('brand', brand)
            .maybeSingle();
          existingLead = data;
        }
        
        if (existingLead) {
          console.log('[ensureAllLeads] Found existing lead after conflict', {
            leadId: existingLead.id
          });
          return existingLead.id;
        }
      }
      
      // Check for RLS/permission errors
      if (createError.code === '42501' || createError.message?.includes('permission') || createError.message?.includes('RLS')) {
        console.error('[ensureAllLeads] Permission/RLS error creating all_leads', {
          error: createError,
          code: createError.code,
          message: createError.message,
          hint: 'Check RLS policies on all_leads table - INSERT permission may be missing',
          brand,
          insertData: {
            ...insertData,
            phone: insertData.phone ? insertData.phone.substring(0, 5) + '...' : null
          }
        });
      }
      
      console.error('[ensureAllLeads] Failed to create all_leads', {
        error: createError,
        code: createError.code,
        message: createError.message,
        details: createError.details,
        hint: createError.hint,
        insertData: {
          ...insertData,
          phone: insertData.phone ? insertData.phone.substring(0, 5) + '...' : null
        },
        brand
      });
      return null;
    }

    if (!created || !created.id) {
      console.error('[ensureAllLeads] Created lead but no ID returned', {
        created
      });
      return null;
    }

    console.log('[ensureAllLeads] Successfully created new lead', {
      leadId: created.id
    });
    return created.id;
  } catch (error) {
    console.warn('[chatSessions] Error ensuring all_leads', error);
    return null;
  }
}

function mapSession(row: any): SessionRecord {
  // Support both old (sessions) and new (web_sessions) column names
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
    brand: row.brand ?? 'proxe',
    channel: row.channel ?? 'web',
    channelData: row.channel_data ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Initialize session immediately when chat opens
export async function initializeSessionOnOpen(
  externalSessionId: string,
  brand: 'proxe' | 'windchasers' = 'windchasers'
): Promise<SessionRecord | null> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.warn('[chatSessions] Supabase client unavailable in initializeSessionOnOpen', { brand });
    return null;
  }

  const tableName = getChannelTable('web');

  // Check if session already exists
  const { data: existing } = await supabase
    .from(tableName)
    .select('*')
    .eq('external_session_id', externalSessionId)
    .maybeSingle();

  if (existing) {
    // Update session_status to active if it was inactive
    if (existing.session_status !== 'active') {
      await supabase
        .from(tableName)
        .update({ session_status: 'active' })
        .eq('external_session_id', externalSessionId);
    }
    return mapSession(existing);
  }

  // Create new session
  const insertData: Record<string, any> = {
    external_session_id: externalSessionId,
    brand: brand,
    session_status: 'active',
    message_count: 0,
    created_at: getISTTimestamp(),
  };

  const { data: created, error: insertError } = await supabase
    .from(tableName)
    .insert(insertData)
    .select('*')
    .single();

  if (insertError) {
    console.error('[Supabase] Failed to initialize session', insertError);
    return null;
  }

  if (created) {
    console.log('[chatSessions] Session initialized on open', { externalSessionId, brand });
    return mapSession(created);
  }

  return null;
}

export async function ensureSession(
  externalSessionId: string,
  channel: Channel,
  brand: 'proxe' | 'windchasers' = 'proxe'
): Promise<SessionRecord | null> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.warn('[chatSessions] Supabase client unavailable in ensureSession', { brand, channel });
    return null;
  }

  const tableName = getChannelTable(channel);

  // Try to fetch existing session from channel-specific table
  const { data, error } = await supabase
    .from(tableName)
    .select('*')
    .eq('external_session_id', externalSessionId)
    .maybeSingle();

  if (error) {
    // If table doesn't exist or column doesn't exist, try old sessions table as fallback
    if (error.code === '42P01' || error.code === '42703') {
      console.log('[chatSessions] Channel table not available, trying fallback');
      // Fallback to old sessions table if web_sessions doesn't exist yet
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('sessions')
        .select('*')
        .eq('external_session_id', externalSessionId)
        .maybeSingle();
      
      if (fallbackError) {
        console.error('[Supabase] Failed to fetch session', fallbackError);
        return null;
      }
      
      if (fallbackData) {
        return mapSession(fallbackData);
      }
    } else {
      console.error('[Supabase] Failed to fetch session', error);
      return null;
    }
  }

  if (data) {
    return mapSession(data);
  }

  // Create new session in channel-specific table
  // For web_sessions, we need: external_session_id, brand, session_status
  // lead_id is optional initially (will be set when customer data is available)
  const insertData: Record<string, any> = {
    external_session_id: externalSessionId,
    brand: brand,
    session_status: 'active',
  };

  // Only add channel_data if the table supports it
  // web_sessions uses channel_data, but we'll add it conditionally
  insertData.channel_data = {};

  const { data: created, error: insertError } = await supabase
    .from(tableName)
    .insert(insertData)
    .select('*')
    .single();

  if (insertError) {
    // Handle duplicate key errors (23505 = unique constraint violation, HTTP 409)
    if (insertError.code === '23505' || 
        insertError.message?.includes('duplicate key value') ||
        insertError.message?.includes('already exists')) {
      console.log('[chatSessions] Duplicate session detected, fetching existing session');
      // Try to fetch the existing record
      const { data: existing, error: fetchError } = await supabase
        .from(tableName)
        .select('*')
        .eq('external_session_id', externalSessionId)
        .maybeSingle();

      if (fetchError) {
        console.error('[Supabase] Failed to fetch existing session after conflict', fetchError);
        return null;
      }

      if (existing) {
        console.log('[chatSessions] Returning existing session');
        return mapSession(existing);
      }
      return null;
    }

    // If table doesn't exist or has wrong structure, try fallback to old sessions table
    if (insertError.code === '42P01' || insertError.code === '42703' || insertError.code === '42702') {
      console.log('[chatSessions] Channel table not available or wrong structure, creating in fallback sessions table', insertError);
      const { data: fallbackCreated, error: fallbackError } = await supabase
        .from('sessions')
        .insert({ 
          external_session_id: externalSessionId,
          brand: brand,
          channel: channel,
          channel_data: {},
        })
        .select('*')
        .single();
      
      if (fallbackError) {
        console.error('[Supabase] Failed to create session in fallback table', fallbackError);
        return null;
      }
      
      if (fallbackCreated) {
        return mapSession(fallbackCreated);
      }
    } else {
      // Log detailed error information for debugging
      console.error('[Supabase] Failed to create session', { 
        error: insertError, 
        code: insertError.code,
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
        tableName,
        insertData
      });
      
      // If it's a NOT NULL constraint error (23502), try with minimal fields only
      // This happens when lead_id is required but we don't have customer data yet
      if (insertError.code === '23502' || insertError.code === '42702' || insertError.code === '42703') {
        console.log('[chatSessions] Trying minimal insert (external_session_id and brand only) - constraint violation detected');
        const minimalInsert: Record<string, any> = {
          external_session_id: externalSessionId,
          brand: brand,
        };
        
        // Don't include lead_id, session_status, or channel_data if they're causing issues
        // Let database defaults handle them
        
        const { data: minimalCreated, error: minimalError } = await supabase
          .from(tableName)
          .insert(minimalInsert)
          .select('*')
          .single();
        
        if (minimalError) {
          // If still failing, try fallback to old sessions table
          if (minimalError.code === '23502' || minimalError.code === '42P01') {
            console.log('[chatSessions] Minimal insert failed, trying fallback to sessions table');
            const { data: fallbackCreated, error: fallbackError } = await supabase
              .from('sessions')
              .insert({ 
                external_session_id: externalSessionId,
                brand: brand,
                channel: channel,
                channel_data: {},
              })
              .select('*')
              .single();
            
            if (fallbackError) {
              console.error('[Supabase] Failed to create session in fallback table', fallbackError);
              return null;
            }
            
            if (fallbackCreated) {
              return mapSession(fallbackCreated);
            }
          }
          console.error('[Supabase] Failed to create session with minimal fields', minimalError);
          return null;
        }
        
        if (minimalCreated) {
          return mapSession(minimalCreated);
        }
      }
      
      return null;
    }
  }

  if (created) {
    return mapSession(created);
  }

  return null;
}


// Helper function to check if a lead is complete (has name, email, and phone)
function isCompleteLead(profile: { userName?: string | null; phone?: string | null; email?: string | null }): boolean {
  const hasName = Boolean(profile.userName && profile.userName.trim());
  const hasEmail = Boolean(profile.email && profile.email.trim());
  const hasPhone = Boolean(profile.phone && profile.phone.trim());
  return hasName && hasEmail && hasPhone;
}

export async function updateSessionProfile(
  externalSessionId: string,
  profile: { userName?: string; phone?: string | null; email?: string | null; websiteUrl?: string | null },
  brand: 'proxe' | 'windchasers' = 'proxe'
) {
  console.log('[updateSessionProfile] Called', { externalSessionId, brand, profile });
  
  // Use service role client for profile updates (bypasses RLS, more reliable)
  // Fallback to anon client if service client unavailable
  let supabase = getSupabaseServiceClient();
  const usingServiceClient = !!supabase;
  
  if (!supabase) {
    console.warn('[updateSessionProfile] Service role client not available, falling back to anon client', {
      hasServiceKey: !!process.env.WINDCHASERS_SUPABASE_SERVICE_KEY,
      envCheck: {
        hasUrl: !!process.env.NEXT_PUBLIC_WINDCHASERS_SUPABASE_URL || !!process.env.WINDCHASERS_SUPABASE_URL,
        hasAnonKey: !!process.env.NEXT_PUBLIC_WINDCHASERS_SUPABASE_ANON_KEY || !!process.env.WINDCHASERS_SUPABASE_ANON_KEY
      }
    });
    supabase = getSupabaseClient();
  } else {
    console.log('[updateSessionProfile] Using service role client (bypasses RLS)', {
      urlPrefix: process.env.NEXT_PUBLIC_WINDCHASERS_SUPABASE_URL?.substring(0, 20) || 'N/A'
    });
  }
  
  if (!supabase) {
    console.error('[updateSessionProfile] No Supabase client available (neither service nor anon)', {
      envCheck: {
        hasServiceKey: !!process.env.WINDCHASERS_SUPABASE_SERVICE_KEY,
        hasUrl: !!process.env.NEXT_PUBLIC_WINDCHASERS_SUPABASE_URL || !!process.env.WINDCHASERS_SUPABASE_URL,
        hasAnonKey: !!process.env.NEXT_PUBLIC_WINDCHASERS_SUPABASE_ANON_KEY || !!process.env.WINDCHASERS_SUPABASE_ANON_KEY
      }
    });
    return;
  }

  // Ensure session exists first
  const session = await ensureSession(externalSessionId, 'web', brand);
  console.log('[updateSessionProfile] Session ensured', { sessionId: session?.id, externalSessionId });

  // Build updates object with new column names (customer_name, customer_email, customer_phone)
  const updates: Record<string, string | null | undefined> = {};
  if (typeof profile.userName === 'string') {
    updates.customer_name = profile.userName.trim() || null;
  }
  if (profile.phone !== undefined) {
    updates.customer_phone = profile.phone ? profile.phone.trim() : null;
  }
  if (profile.email !== undefined) {
    updates.customer_email = profile.email ? profile.email.trim() : null;
  }
  if (profile.websiteUrl !== undefined) {
    updates.website_url = profile.websiteUrl ? profile.websiteUrl.trim() : null;
  }
  
  console.log('[updateSessionProfile] Updates to apply', { updates, updateCount: Object.keys(updates).length });
  
  // If no updates to make, return early
  if (Object.keys(updates).length === 0) {
    console.warn('[updateSessionProfile] No updates to apply, returning early');
    return;
  }

  const tableName = getChannelTable('web');

  // Perform the update
  console.log('[updateSessionProfile] Executing Supabase update', { externalSessionId, updates });
  const { data, error } = await supabase
    .from(tableName)
    .update(updates)
    .eq('external_session_id', externalSessionId)
    .select();

  if (error) {
    console.error('[updateSessionProfile] ✗ Update failed', {
      error,
      errorCode: error.code,
      errorMessage: error.message,
      errorDetails: error.details,
      errorHint: error.hint,
      externalSessionId,
      updates,
      usingServiceClient,
      tableName
    });
    
    // Fallback to old sessions table if web_sessions doesn't exist
    if (error.code === '42P01' || error.code === '42703') {
      console.log('[updateSessionProfile] Trying fallback to sessions table');
      const fallbackUpdates: Record<string, string | null | undefined> = {};
      if (typeof profile.userName === 'string') {
        fallbackUpdates.user_name = profile.userName.trim() || null;
      }
      if (profile.phone !== undefined) {
        fallbackUpdates.phone = profile.phone ? profile.phone.trim() : null;
      }
      if (profile.email !== undefined) {
        fallbackUpdates.email = profile.email ? profile.email.trim() : null;
      }
      if (profile.websiteUrl !== undefined) {
        fallbackUpdates.website_url = profile.websiteUrl ? profile.websiteUrl.trim() : null;
      }
      
      const { error: fallbackError } = await supabase
        .from('sessions')
        .update(fallbackUpdates)
        .eq('external_session_id', externalSessionId);
      
      if (fallbackError) {
        console.error('[updateSessionProfile] ✗ Fallback update also failed', { 
          error: fallbackError, 
          externalSessionId,
          fallbackUpdates
        });
        return;
      }
    } else {
      console.error('[updateSessionProfile] ✗ Update failed with non-table error', { 
        error, 
        externalSessionId, 
        updates,
        usingServiceClient
      });
      return;
    }
  }

  console.log('[updateSessionProfile] ✓ Update successful', { 
    externalSessionId, 
    updatedRows: data?.length,
    updatedData: data,
    usingServiceClient
  });

  // Fetch the complete updated profile from database
  const { data: updatedSession } = await supabase
    .from(tableName)
    .select('customer_name, customer_email, customer_phone')
    .eq('external_session_id', externalSessionId)
    .maybeSingle();

  if (updatedSession) {
    const mergedProfile = {
      userName: updatedSession.customer_name ?? null,
      email: updatedSession.customer_email ?? null,
      phone: updatedSession.customer_phone ?? null,
    };
    const completeLead = isCompleteLead(mergedProfile);
    
    console.log('[Supabase] Session profile updated', { 
      externalSessionId,
      completeLead,
      hasName: Boolean(mergedProfile.userName?.trim()),
      hasEmail: Boolean(mergedProfile.email?.trim()),
      hasPhone: Boolean(mergedProfile.phone?.trim()),
      userName: mergedProfile.userName,
      email: mergedProfile.email,
      phone: mergedProfile.phone,
    });

    // Ensure all_leads record exists/updated after profile update using complete database values
    // Phone is REQUIRED for lead creation
    if (mergedProfile.phone) {
      console.log('[updateSessionProfile] Calling ensureAllLeads with profile data', {
        hasName: !!mergedProfile.userName,
        hasEmail: !!mergedProfile.email,
        hasPhone: !!mergedProfile.phone,
        phone: mergedProfile.phone ? mergedProfile.phone.substring(0, 5) + '...' : null,
        email: mergedProfile.email,
        brand,
        externalSessionId
      });
      
      const leadId = await ensureAllLeads(
        mergedProfile.userName,
        mergedProfile.email,
        mergedProfile.phone,
        brand,
        externalSessionId
      );

      console.log('[updateSessionProfile] ensureAllLeads returned:', leadId);

      // Update web_sessions with lead_id if we got one
      if (leadId) {
        console.log('[updateSessionProfile] Updating web_sessions with lead_id', {
          leadId,
          externalSessionId,
          tableName
        });
        
        const { error: leadIdError, data: updateData } = await supabase
          .from(tableName)
          .update({ lead_id: leadId })
          .eq('external_session_id', externalSessionId)
          .select('id, lead_id');

        if (leadIdError) {
          console.error('[updateSessionProfile] Failed to update lead_id', {
            error: leadIdError,
            code: leadIdError.code,
            message: leadIdError.message,
            details: leadIdError.details,
            leadId,
            externalSessionId
          });
        } else {
          console.log('[updateSessionProfile] Successfully updated web_sessions with lead_id', {
            leadId,
            externalSessionId,
            updatedRows: updateData?.length,
            verifiedLeadId: updateData?.[0]?.lead_id
          });
        }
      } else {
        console.warn('[updateSessionProfile] ensureAllLeads returned null - no lead created', {
          hasPhone: !!mergedProfile.phone,
          hasEmail: !!mergedProfile.email,
          hasName: !!mergedProfile.userName,
          phone: mergedProfile.phone,
          reason: 'ensureAllLeads may have failed or phone normalization failed'
        });
      }
    } else {
      console.log('[updateSessionProfile] Skipping lead creation - phone number is required but missing', {
        hasName: !!mergedProfile.userName,
        hasEmail: !!mergedProfile.email,
        hasPhone: !!mergedProfile.phone
      });
    }
  } else {
    console.warn('[updateSessionProfile] Could not fetch updated session', { externalSessionId });
  }
}

export async function addUserInput(
  externalSessionId: string,
  input: string,
  intent?: string,
  brand: 'proxe' | 'windchasers' = 'proxe'
) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.warn('[chatSessions] Supabase client unavailable in addUserInput', { brand });
    return;
  }

  // First, ensure session exists (create if it doesn't)
  await ensureSession(externalSessionId, 'web', brand);

  const tableName = getChannelTable('web');

  // Always save user input, regardless of lead completeness
  // This ensures all conversations are tracked in web_sessions
  // The lead can be completed later, but we want to capture all interactions

  // Fetch current session to get existing user_inputs_summary
  const { data: currentSession, error: fetchError } = await supabase
    .from(tableName)
    .select('user_inputs_summary, message_count')
    .eq('external_session_id', externalSessionId)
    .maybeSingle();

  if (fetchError) {
    // Try fallback
    if (fetchError.code === '42P01' || fetchError.code === '42703') {
      const { data: fallbackSession, error: fallbackError } = await supabase
        .from('sessions')
        .select('user_inputs_summary, message_count')
        .eq('external_session_id', externalSessionId)
        .maybeSingle();
      
      if (fallbackError || !fallbackSession) {
        console.error('[Supabase] Failed to fetch session for addUserInput', fallbackError || 'Session not found');
        return;
      }
      
      const existingInputs: UserInput[] = Array.isArray(fallbackSession?.user_inputs_summary) 
        ? fallbackSession.user_inputs_summary 
        : [];
      
      const newInput: UserInput = {
        input: input.trim(),
        intent: intent,
        created_at: getISTTimestamp(),
      };
      
      const updatedInputs = [...existingInputs, newInput].slice(-20);
      const messageCount = (fallbackSession?.message_count ?? 0) + 1;

      const { error } = await supabase
        .from('sessions')
        .update({
          user_inputs_summary: updatedInputs,
          message_count: messageCount,
          last_message_at: getISTTimestamp(),
        })
        .eq('external_session_id', externalSessionId);

      if (error) {
        console.error('[Supabase] Failed to add user input', error);
      }
      return;
    }
    console.error('[Supabase] Failed to fetch session for addUserInput', fetchError);
    return;
  }

  if (!currentSession) {
    console.error('[Supabase] Session not found for addUserInput', { externalSessionId, brand });
    return;
  }

  const existingInputs: UserInput[] = Array.isArray(currentSession?.user_inputs_summary) 
    ? currentSession.user_inputs_summary 
    : [];

  const newInput: UserInput = {
    input: input.trim(),
    intent: intent,
    created_at: new Date().toISOString(),
  };

  // Add new input and keep last 20 inputs
  const updatedInputs = [...existingInputs, newInput].slice(-20);
  const messageCount = (currentSession?.message_count ?? 0) + 1;

  const { error } = await supabase
    .from(tableName)
    .update({
      user_inputs_summary: updatedInputs,
      message_count: messageCount,
      last_message_at: new Date().toISOString(),
    })
    .eq('external_session_id', externalSessionId);

  if (error) {
    console.error('[Supabase] Failed to add user input', error);
  } else if (process.env.NODE_ENV !== 'production') {
    console.log('[Supabase] Successfully added user input', { externalSessionId, messageCount });
  }
}

export async function upsertSummary(
  externalSessionId: string,
  summary: string,
  lastMessageCreatedAt: string,
  brand: 'proxe' | 'windchasers' = 'proxe'
) {
  console.log('[upsertSummary] Called', { externalSessionId, brand, summaryLength: summary.length });
  
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.warn('[chatSessions] Supabase client unavailable in upsertSummary', { brand });
    return;
  }

  // Ensure session exists first
  await ensureSession(externalSessionId, 'web', brand);

  const tableName = getChannelTable('web');

  // Always update summary (don't require complete lead)
  // Summaries are useful for maintaining conversation context even before lead is complete
  console.log('[upsertSummary] Updating summary', { externalSessionId, summaryLength: summary.length });
  
  const { data, error } = await supabase
    .from(tableName)
    .update({
      conversation_summary: summary,
      last_message_at: lastMessageCreatedAt,
    })
    .eq('external_session_id', externalSessionId)
    .select('lead_id, booking_status, booking_date, booking_time, user_inputs_summary');

  if (error) {
    // Fallback to old sessions table
    if (error.code === '42P01' || error.code === '42703') {
      const { error: fallbackError } = await supabase
        .from('sessions')
        .update({
          conversation_summary: summary,
          last_message_at: lastMessageCreatedAt,
        })
        .eq('external_session_id', externalSessionId);
      
      if (fallbackError) {
        console.error('[Supabase] Failed to upsert summary (fallback)', { error: fallbackError, externalSessionId });
      } else {
        console.log('[Supabase] Successfully updated summary (fallback)', { externalSessionId });
      }
    } else {
      console.error('[Supabase] Failed to upsert summary', { error, externalSessionId });
    }
  } else {
    console.log('[Supabase] Successfully updated summary', { externalSessionId, updatedRows: data?.length });
    
    // Update unified_context in all_leads if lead_id exists
    if (data && data.length > 0 && data[0].lead_id) {
      const sessionData = data[0];
      const unifiedContext = {
        web: {
          conversation_summary: summary,
          booking_status: sessionData.booking_status || null,
          booking_date: sessionData.booking_date || null,
          booking_time: sessionData.booking_time || null,
          user_inputs: sessionData.user_inputs_summary || [],
        }
      };

      // Get existing unified_context and merge
      const { data: existingLead } = await supabase
        .from('all_leads')
        .select('unified_context')
        .eq('id', data[0].lead_id)
        .maybeSingle();

      const existingContext = existingLead?.unified_context || {};
      const mergedContext = {
        ...existingContext,
        web: {
          ...(existingContext.web || {}),
          ...unifiedContext.web,
        }
      };

      await supabase
        .from('all_leads')
        .update({
          unified_context: mergedContext,
        })
        .eq('id', data[0].lead_id);
    }
  }
}

export async function fetchSummary(
  externalSessionId: string,
  brand: 'proxe' | 'windchasers' = 'proxe'
): Promise<SessionSummary | null> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.warn('[chatSessions] Supabase client unavailable in fetchSummary', { brand });
    return null;
  }

  const tableName = getChannelTable('web');

  const { data, error } = await supabase
    .from(tableName)
    .select('conversation_summary, last_message_at')
    .eq('external_session_id', externalSessionId)
    .maybeSingle();

  if (error) {
    // Fallback to old sessions table
    if (error.code === '42P01' || error.code === '42703') {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('sessions')
        .select('conversation_summary, last_message_at')
        .eq('external_session_id', externalSessionId)
        .maybeSingle();
      
      if (fallbackError) {
        console.error('[Supabase] Failed to fetch summary (fallback)', fallbackError);
        return null;
      }
      
      if (!fallbackData || !fallbackData.conversation_summary) return null;
      
      return {
        summary: cleanSummary(fallbackData.conversation_summary),
        lastMessageCreatedAt: fallbackData.last_message_at || getISTTimestamp(),
      };
    }
    console.error('[Supabase] Failed to fetch summary', error);
    return null;
  }

  if (!data || !data.conversation_summary) return null;

  return {
    summary: cleanSummary(data.conversation_summary),
    lastMessageCreatedAt: data.last_message_at || getISTTimestamp(),
  };
}

export async function storeBooking(
  externalSessionId: string,
  booking: {
    date: string; // YYYY-MM-DD format
    time: string; // "11:00 AM" format
    googleEventId?: string;
    status?: 'pending' | 'confirmed' | 'Call Booked' | 'cancelled';
    name?: string; // Optional: update contact info if provided
    email?: string; // Optional: update contact info if provided
    phone?: string; // Optional: update contact info if provided
  },
  brand: 'proxe' | 'windchasers' = 'proxe'
) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.warn('[chatSessions] Supabase client unavailable in storeBooking', { brand });
    return;
  }

  const tableName = getChannelTable('web');

  // If contact info is provided, update the session first
  if (booking.name || booking.email || booking.phone) {
    const profileUpdates: { userName?: string; email?: string; phone?: string } = {};
    if (booking.name) profileUpdates.userName = booking.name;
    if (booking.email) profileUpdates.email = booking.email;
    if (booking.phone) profileUpdates.phone = booking.phone;
    
    await updateSessionProfile(externalSessionId, profileUpdates, brand);
  }

  // Always store booking details (don't require complete lead)
  // Booking details are valuable even if contact info isn't complete yet

  // Build update object
  const bookingUpdate: Record<string, any> = {
    booking_date: booking.date,
    booking_time: booking.time,
    google_event_id: booking.googleEventId ?? null,
    booking_status: booking.status ?? 'Call Booked',
    booking_created_at: getISTTimestamp(),
  };

  const { data, error } = await supabase
    .from(tableName)
    .update(bookingUpdate)
    .eq('external_session_id', externalSessionId)
    .select('lead_id, conversation_summary, user_inputs_summary');

  if (error) {
    // Fallback to old sessions table
    if (error.code === '42P01' || error.code === '42703') {
      const { error: fallbackError } = await supabase
        .from('sessions')
        .update({
          booking_date: booking.date,
          booking_time: booking.time,
          google_event_id: booking.googleEventId ?? null,
          booking_status: booking.status ?? 'Call Booked',
          booking_created_at: getISTTimestamp(),
        })
        .eq('external_session_id', externalSessionId);
      
      if (fallbackError) {
        console.error('[Supabase] Failed to store booking (fallback)', fallbackError);
      }
    } else {
      console.error('[Supabase] Failed to store booking', error);
    }
  } else if (data && data.length > 0 && data[0].lead_id) {
    // Update unified_context in all_leads
    const sessionData = data[0];
    const unifiedContext = {
      web: {
        conversation_summary: cleanSummary(sessionData.conversation_summary) || null,
        booking_status: booking.status ?? 'Call Booked',
        booking_date: booking.date,
        booking_time: booking.time,
        user_inputs: sessionData.user_inputs_summary || [],
      }
    };

    // Get existing unified_context and merge
    const { data: existingLead } = await supabase
      .from('all_leads')
      .select('unified_context')
      .eq('id', data[0].lead_id)
      .maybeSingle();

    const existingContext = existingLead?.unified_context || {};
    const mergedContext = {
      ...existingContext,
      web: {
        ...(existingContext.web || {}),
        ...unifiedContext.web,
      }
    };

    await supabase
      .from('all_leads')
      .update({
        unified_context: mergedContext,
      })
      .eq('id', data[0].lead_id);
  }
}

export async function checkExistingBooking(
  phone?: string | null,
  email?: string | null,
  brand: 'proxe' | 'windchasers' = 'proxe'
): Promise<{
  exists: boolean;
  bookingDate?: string | null;
  bookingTime?: string | null;
  bookingStatus?: 'pending' | 'confirmed' | 'Call Booked' | 'cancelled' | null;
  bookingCreatedAt?: string | null;
} | null> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.warn('[chatSessions] Supabase client unavailable in checkExistingBooking', { brand });
    return { exists: false };
  }

  if (!phone && !email) {
    return { exists: false };
  }

  const tableName = getChannelTable('web');

  try {
    // Normalize phone number if provided (remove spaces, dashes, parentheses)
    const normalizedPhone = phone ? phone.replace(/[\s\-\(\)]/g, '').replace(/^\+91/, '').replace(/^0/, '') : null;

    // Build query - check by phone or email
    // Try phone first, then email, then both
    let data = null;
    let error = null;

    if (normalizedPhone) {
      // Try by phone (exact match first)
      const { data: phoneData, error: phoneError } = await supabase
        .from(tableName)
        .select('booking_date, booking_time, booking_status, booking_created_at')
        .eq('brand', brand.toLowerCase())
        .eq('customer_phone', phone)
        .not('booking_date', 'is', null)
        .not('booking_time', 'is', null)
        .order('booking_created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (phoneData && phoneData.booking_date) {
        data = phoneData;
      } else if (phoneError && (phoneError.code === '42P01' || phoneError.code === '42703')) {
        // Table or column doesn't exist, will fallback below
        error = phoneError;
      } else {
        // Try normalized phone only if column exists (will fail gracefully if it doesn't)
        try {
          const { data: normalizedData, error: normalizedError } = await supabase
            .from(tableName)
            .select('booking_date, booking_time, booking_status, booking_created_at')
            .eq('brand', brand.toLowerCase())
            .eq('customer_phone_normalized', normalizedPhone)
            .not('booking_date', 'is', null)
            .not('booking_time', 'is', null)
            .order('booking_created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          if (normalizedData && normalizedData.booking_date) {
            data = normalizedData;
          } else if (normalizedError && normalizedError.code !== '42703') {
            // Only set error if it's not a "column doesn't exist" error
            error = normalizedError;
          }
        } catch (e) {
          // Column doesn't exist, ignore and continue
        }
      }
    }

    // If no phone match and email provided, try email
    if (!data && email) {
      const { data: emailData, error: emailError } = await supabase
        .from(tableName)
        .select('booking_date, booking_time, booking_status, booking_created_at')
        .eq('brand', brand.toLowerCase())
        .eq('customer_email', email)
        .not('booking_date', 'is', null)
        .not('booking_time', 'is', null)
        .order('booking_created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (emailData && emailData.booking_date) {
        data = emailData;
      } else {
        error = emailError || error;
      }
    }

    // If we got data, return it
    if (data && data.booking_date) {
      return {
        exists: true,
        bookingDate: data.booking_date,
        bookingTime: data.booking_time,
        bookingStatus: data.booking_status,
        bookingCreatedAt: data.booking_created_at,
      };
    }

    // If error indicates table/column doesn't exist, try fallback
    if (error && (error.code === '42P01' || error.code === '42703')) {
      // Try phone first in fallback
      let fallbackData = null;
      let fallbackError = null;

      if (phone) {
        const { data: phoneData, error: phoneErr } = await supabase
          .from('sessions')
          .select('booking_date, booking_time, booking_status, booking_created_at')
          .eq('brand', brand.toLowerCase())
          .eq('phone', phone)
          .not('booking_date', 'is', null)
          .not('booking_time', 'is', null)
          .order('booking_created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (phoneData && phoneData.booking_date) {
          fallbackData = phoneData;
        } else {
          fallbackError = phoneErr;
        }
      }

      // If no phone match, try email
      if (!fallbackData && email) {
        const { data: emailData, error: emailErr } = await supabase
          .from('sessions')
          .select('booking_date, booking_time, booking_status, booking_created_at')
          .eq('brand', brand.toLowerCase())
          .eq('email', email)
          .not('booking_date', 'is', null)
          .not('booking_time', 'is', null)
          .order('booking_created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (emailData && emailData.booking_date) {
          fallbackData = emailData;
        } else {
          fallbackError = emailErr || fallbackError;
        }
      }

      if (fallbackData && fallbackData.booking_date) {
        return {
          exists: true,
          bookingDate: fallbackData.booking_date,
          bookingTime: fallbackData.booking_time,
          bookingStatus: fallbackData.booking_status,
          bookingCreatedAt: fallbackData.booking_created_at,
        };
      }
    }

    // Log error if it wasn't a table/column missing error
    if (error && error.code !== '42P01' && error.code !== '42703') {
      console.error('[Supabase] Failed to check existing booking', error);
    }

    // No booking found
    return { exists: false };
  } catch (error) {
    console.error('[chatSessions] Error checking existing booking', error);
    return { exists: false };
  }
}

// Build user profile progressively for Windchasers
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

export async function updateWindchasersProfile(
  externalSessionId: string,
  profileData: Partial<WindchasersUserProfile>,
  brand: 'windchasers' = 'windchasers'
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.warn('[chatSessions] Supabase client unavailable in updateWindchasersProfile', { brand });
    return;
  }

  // Ensure session exists
  await ensureSession(externalSessionId, 'web', brand);

  const tableName = getChannelTable('web');

  // Fetch current session to get existing profile data
  const { data: currentSession } = await supabase
    .from(tableName)
    .select('user_inputs_summary, customer_name, customer_email, customer_phone')
    .eq('external_session_id', externalSessionId)
    .maybeSingle();

  if (!currentSession) {
    console.error('[updateWindchasersProfile] Session not found', { externalSessionId });
    return;
  }

  // Build updates object
  const updates: Record<string, any> = {};

  // Update basic profile fields if provided
  if (profileData.name) {
    updates.customer_name = profileData.name.trim();
  }
  if (profileData.phone) {
    updates.customer_phone = profileData.phone.trim();
  }
  if (profileData.email) {
    updates.customer_email = profileData.email.trim();
  }

  // Build unified_context for all_leads
  const existingInputs: UserInput[] = Array.isArray(currentSession.user_inputs_summary) 
    ? currentSession.user_inputs_summary 
    : [];

  // Extract profile data from conversation
  const windchasersContext: any = {
    user_type: profileData.user_type || null,
    education: profileData.education || null,
    course_interest: profileData.course_interest || null,
    timeline: profileData.timeline || null,
    button_clicks: profileData.button_clicks || [],
    questions_asked: profileData.questions_asked || [],
    stage: profileData.stage || 'exploration',
  };

  // Update session
  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from(tableName)
      .update(updates)
      .eq('external_session_id', externalSessionId);

    if (error) {
      console.error('[updateWindchasersProfile] Failed to update session', error);
    }
  }

  // Update all_leads with unified_context if we have phone
  const phone = profileData.phone || currentSession.customer_phone;
  if (phone) {
    const leadId = await ensureAllLeads(
      profileData.name || currentSession.customer_name,
      profileData.email || currentSession.customer_email,
      phone,
      brand,
      externalSessionId
    );

    if (leadId) {
      // Update all_leads.unified_context.windchasers
      const { data: leadData } = await supabase
        .from('all_leads')
        .select('unified_context')
        .eq('id', leadId)
        .maybeSingle();

      if (leadData) {
        const existingContext = leadData.unified_context || {};
        const updatedContext = {
          ...existingContext,
          windchasers: {
            ...(existingContext.windchasers || {}),
            ...windchasersContext,
          },
        };

        await supabase
          .from('all_leads')
          .update({ unified_context: updatedContext })
          .eq('id', leadId);
      }
    }
  }
}

export async function updateChannelData(
  externalSessionId: string,
  channelData: Record<string, any>,
  brand: 'proxe' | 'windchasers' = 'proxe'
) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.warn('[chatSessions] Supabase client unavailable in updateChannelData', { brand });
    return;
  }

  const tableName = getChannelTable('web');

  // Fetch current channel_data to merge
  const { data: session, error: fetchError } = await supabase
    .from(tableName)
    .select('channel_data')
    .eq('external_session_id', externalSessionId)
    .maybeSingle();

  if (fetchError) {
    // Fallback to old sessions table
    if (fetchError.code === '42P01' || fetchError.code === '42703') {
      const { data: fallbackSession, error: fallbackError } = await supabase
        .from('sessions')
        .select('channel_data')
        .eq('external_session_id', externalSessionId)
        .maybeSingle();
      
      if (fallbackError) {
        console.error('[Supabase] Failed to fetch session for updateChannelData (fallback)', fallbackError);
        return;
      }
      
      const currentData = fallbackSession?.channel_data ?? {};
      const mergedData = { ...currentData, ...channelData };

      const { error } = await supabase
        .from('sessions')
        .update({ channel_data: mergedData })
        .eq('external_session_id', externalSessionId);

      if (error) {
        console.error('[Supabase] Failed to update channel data (fallback)', error);
      }
      return;
    }
    console.error('[Supabase] Failed to fetch session for updateChannelData', fetchError);
    return;
  }

  const currentData = session?.channel_data ?? {};
  const mergedData = { ...currentData, ...channelData };

  const { error } = await supabase
    .from(tableName)
    .update({ channel_data: mergedData })
    .eq('external_session_id', externalSessionId);

  if (error) {
    console.error('[Supabase] Failed to update channel data', error);
  }
}

// Helper function to strip HTML tags from content
function stripHTML(html: string): string {
  if (!html || typeof html !== 'string') return html;
  // Remove HTML tags
  let text = html.replace(/<[^>]*>/g, '');
  // Decode HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
  // Clean up multiple spaces and newlines
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

// Log message to conversations table for Dashboard Inbox
export async function logMessage(
  leadId: string,
  channel: 'web' | 'whatsapp' | 'voice' | 'social',
  sender: 'customer' | 'agent' | 'system',
  content: string,
  messageType: string = 'text',
  metadata: any = {}
) {
  console.log('[logMessage] Called with:', {
    leadId,
    channel,
    sender,
    contentLength: content?.length,
    messageType,
    hasMetadata: !!metadata
  });

  if (!leadId || !content) {
    console.log('[logMessage] Missing leadId or content, skipping message log', {
      hasLeadId: !!leadId,
      hasContent: !!content,
      leadId,
      contentLength: content?.length
    });
    return null;
  }

  // Use service role client for message logging (bypasses RLS, more reliable)
  // Fallback to anon client if service client unavailable
  let supabase = getSupabaseServiceClient();
  const usingServiceClient = !!supabase;
  
  if (!supabase) {
    console.warn('[logMessage] Service role client not available, falling back to anon client', {
      hasServiceKey: !!process.env.WINDCHASERS_SUPABASE_SERVICE_KEY,
      envCheck: {
        hasUrl: !!process.env.NEXT_PUBLIC_WINDCHASERS_SUPABASE_URL || !!process.env.WINDCHASERS_SUPABASE_URL,
        hasAnonKey: !!process.env.NEXT_PUBLIC_WINDCHASERS_SUPABASE_ANON_KEY || !!process.env.WINDCHASERS_SUPABASE_ANON_KEY
      }
    });
    supabase = getSupabaseClient();
  } else {
    console.log('[logMessage] Using service role client (bypasses RLS)', {
      urlPrefix: process.env.NEXT_PUBLIC_WINDCHASERS_SUPABASE_URL?.substring(0, 20) || 'N/A'
    });
  }
  
  if (!supabase) {
    console.error('[logMessage] No Supabase client available (neither service nor anon)', {
      envCheck: {
        hasServiceKey: !!process.env.WINDCHASERS_SUPABASE_SERVICE_KEY,
        hasUrl: !!process.env.NEXT_PUBLIC_WINDCHASERS_SUPABASE_URL || !!process.env.WINDCHASERS_SUPABASE_URL,
        hasAnonKey: !!process.env.NEXT_PUBLIC_WINDCHASERS_SUPABASE_ANON_KEY || !!process.env.WINDCHASERS_SUPABASE_ANON_KEY
      }
    });
    return null;
  }
  
  // Strip HTML from content before logging
  const cleanedContent = stripHTML(content);
  const tableName = 'conversations';
  
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
      extension: 'web'
    }
  };

  console.log('[logMessage] Preparing to insert message:', {
    tableName,
    lead_id: insertData.lead_id,
    channel: insertData.channel,
    sender: insertData.sender,
    content: insertData.content,
    contentLength: insertData.content?.length,
    message_type: insertData.message_type
  });
  
  // Verify table name and lead_id before insert
  console.log('[logMessage] About to insert to table:', tableName);
  console.log('[logMessage] Lead ID exists?', !!insertData.lead_id, 'Value:', insertData.lead_id);
  console.log('[logMessage] Insert data summary:', {
    lead_id: insertData.lead_id,
    channel: insertData.channel,
    sender: insertData.sender,
    message_type: insertData.message_type,
    contentLength: insertData.content?.length,
    contentPreview: insertData.content?.substring(0, 100),
    metadataKeys: Object.keys(insertData.metadata || {})
  });
  
  try {
    console.log('[logMessage] Executing Supabase insert to "conversations" table...');
    console.log('[logMessage] Table name verified:', tableName === 'conversations' ? '✓ "conversations"' : `✗ "${tableName}"`);
    
    const { data, error } = await supabase
      .from(tableName)
      .insert(insertData)
      .select()
      .single();

    console.log('[logMessage] Insert query executed. Checking result...');

    if (error) {
      console.error('[logMessage] ✗ Error logging message to "conversations" table:', {
        error,
        errorCode: error.code,
        errorMessage: error.message,
        errorDetails: error.details,
        errorHint: error.hint,
        leadId,
        channel,
        sender,
        tableName
      });
      return null;
    }

    console.log('[logMessage] ✓ Message logged successfully to "conversations" table:', {
      messageId: data?.id,
      leadId,
      channel,
      sender,
      tableName,
      insertedAt: data?.created_at
    });

    return data;
  } catch (err: any) {
    console.error('[logMessage] Exception logging message:', {
      error: err,
      errorMessage: err?.message,
      errorStack: err?.stack,
      leadId,
      channel,
      sender
    });
    return null;
  }
}

// Fetch conversations from conversations table for a lead_id
export interface ConversationMessage {
  id: string;
  lead_id: string;
  channel: 'web' | 'whatsapp' | 'voice' | 'social';
  sender: 'customer' | 'agent' | 'system';
  content: string;
  message_type: string;
  metadata: any;
  created_at: string;
}

export async function fetchConversations(
  leadId: string,
  channel: 'web' | 'whatsapp' | 'voice' | 'social' = 'web',
  brand: 'proxe' | 'windchasers' = 'proxe',
  limit: number = 50
): Promise<ConversationMessage[]> {
  const supabase = getSupabaseClient();
  
  if (!supabase) {
    console.error('[fetchConversations] Supabase client not available');
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('lead_id', leadId)
      .eq('channel', channel)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('[fetchConversations] Error fetching conversations:', {
        error,
        errorCode: error.code,
        errorMessage: error.message,
        leadId,
        channel
      });
      return [];
    }

    console.log('[fetchConversations] Fetched conversations:', {
      count: data?.length || 0,
      leadId,
      channel
    });

    return data || [];
  } catch (err: any) {
    console.error('[fetchConversations] Exception fetching conversations:', {
      error: err,
      errorMessage: err?.message,
      errorStack: err?.stack,
      leadId,
      channel
    });
    return [];
  }
}
