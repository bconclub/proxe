/**
 * services/supabase.ts — Service-role Supabase client for server-side operations
 *
 * The dashboard has two existing Supabase clients:
 *   - lib/supabase/server.ts  (cookie-based SSR for dashboard pages)
 *   - lib/supabase/client.ts  (singleton anon client for API routes)
 *
 * Services need a SERVICE-ROLE client that bypasses RLS for reliable
 * lead creation, message logging, and booking storage.
 *
 * Extracted from: web-agent/src/lib/supabase.ts (getSupabaseServiceClient)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Cache clients to avoid creating new instances on every call
let serviceClient: SupabaseClient | null = null;
let anonClient: SupabaseClient | null = null;

/**
 * Get a service-role Supabase client (bypasses RLS)
 * Used for all service operations: lead creation, message logging, booking, etc.
 */
export function getServiceClient(): SupabaseClient | null {
  if (serviceClient) return serviceClient;

  const supabaseUrl =
    process.env.NEXT_PUBLIC_WINDCHASERS_SUPABASE_URL ??
    process.env.WINDCHASERS_SUPABASE_URL;

  const serviceKey =
    process.env.WINDCHASERS_SUPABASE_SERVICE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[services/supabase] Missing URL or service key', {
        hasUrl: !!supabaseUrl,
        hasServiceKey: !!serviceKey,
      });
    }
    return null;
  }

  serviceClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  return serviceClient;
}

/**
 * Get an anonymous Supabase client (subject to RLS)
 * Fallback when service-role client is unavailable
 */
export function getAnonClient(): SupabaseClient | null {
  if (anonClient) return anonClient;

  const supabaseUrl =
    process.env.NEXT_PUBLIC_WINDCHASERS_SUPABASE_URL ??
    process.env.WINDCHASERS_SUPABASE_URL;

  const anonKey =
    process.env.NEXT_PUBLIC_WINDCHASERS_SUPABASE_ANON_KEY ??
    process.env.WINDCHASERS_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[services/supabase] Missing URL or anon key', {
        hasUrl: !!supabaseUrl,
        hasAnonKey: !!anonKey,
      });
    }
    return null;
  }

  anonClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
  });

  return anonClient;
}

/**
 * Get the best available Supabase client
 * Prefers service-role (bypasses RLS), falls back to anon
 */
export function getClient(): SupabaseClient | null {
  return getServiceClient() || getAnonClient();
}
