/**
 * services/supabase.ts — Service-role Supabase client for server-side operations
 *
 * Brand-agnostic: resolves env vars using NEXT_PUBLIC_BRAND to find the
 * correct Supabase project for each brand deployment.
 *
 * Lookup order (URL example):
 *   1. NEXT_PUBLIC_{BRAND}_SUPABASE_URL   (e.g. NEXT_PUBLIC_BCON_SUPABASE_URL)
 *   2. NEXT_PUBLIC_SUPABASE_URL           (generic)
 *   3. NEXT_PUBLIC_BCON_SUPABASE_URL (legacy fallback)
 *
 * Extracted from: web-agent/src/lib/supabase.ts (getSupabaseServiceClient)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Cache clients to avoid creating new instances on every call
let serviceClient: SupabaseClient | null = null;
let anonClient: SupabaseClient | null = null;

/** Return the BRAND slug uppercased, e.g. "BCON", "WINDCHASERS" */
function brandPrefix(): string {
  return (process.env.NEXT_PUBLIC_BRAND || 'windchasers').toUpperCase();
}

/** Resolve a Supabase env var with brand-specific → generic → legacy fallback */
function resolveEnv(...keys: string[]): string | undefined {
  for (const k of keys) {
    if (process.env[k]) return process.env[k];
  }
  return undefined;
}

/**
 * Get a service-role Supabase client (bypasses RLS)
 * Used for all service operations: lead creation, message logging, booking, etc.
 */
export function getServiceClient(): SupabaseClient | null {
  if (serviceClient) return serviceClient;

  const bp = brandPrefix();

  const supabaseUrl = resolveEnv(
    `NEXT_PUBLIC_${bp}_SUPABASE_URL`,
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_BCON_SUPABASE_URL',
    `${bp}_SUPABASE_URL`,
    'BCON_SUPABASE_URL',
  );

  const serviceKey = resolveEnv(
    `${bp}_SUPABASE_SERVICE_KEY`,
    'SUPABASE_SERVICE_ROLE_KEY',
    'BCON_SUPABASE_SERVICE_KEY',
  );

  if (!supabaseUrl || !serviceKey) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[services/supabase] Missing URL or service key (brand=${bp})`, {
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

  const bp = brandPrefix();

  const supabaseUrl = resolveEnv(
    `NEXT_PUBLIC_${bp}_SUPABASE_URL`,
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_BCON_SUPABASE_URL',
    `${bp}_SUPABASE_URL`,
    'BCON_SUPABASE_URL',
  );

  const anonKey = resolveEnv(
    `NEXT_PUBLIC_${bp}_SUPABASE_ANON_KEY`,
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_BCON_SUPABASE_ANON_KEY',
    `${bp}_SUPABASE_ANON_KEY`,
    'BCON_SUPABASE_ANON_KEY',
  );

  if (!supabaseUrl || !anonKey) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[services/supabase] Missing URL or anon key (brand=${bp})`, {
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
