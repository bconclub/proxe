import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const clientCache: SupabaseClient | null = null;

// Use standard Next.js env var names for standalone app
const proxeSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_PROXE_SUPABASE_URL ?? process.env.PROXE_SUPABASE_URL;
const proxeSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_PROXE_SUPABASE_ANON_KEY ?? process.env.PROXE_SUPABASE_ANON_KEY;

export function getSupabaseClient(): SupabaseClient | null {
  if (clientCache) {
    return clientCache;
  }

  if (!proxeSupabaseUrl || !proxeSupabaseAnonKey) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[Supabase PROXe] Missing Supabase URL or anon key.', {
        url: proxeSupabaseUrl,
        anonKeyPresent: Boolean(proxeSupabaseAnonKey),
        envVars: {
          NEXT_PUBLIC_PROXE_SUPABASE_URL: process.env.NEXT_PUBLIC_PROXE_SUPABASE_URL ? 'SET' : 'NOT SET',
          NEXT_PUBLIC_PROXE_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_PROXE_SUPABASE_ANON_KEY ? 'SET' : 'NOT SET',
          PROXE_SUPABASE_URL: process.env.PROXE_SUPABASE_URL ? 'SET' : 'NOT SET',
          PROXE_SUPABASE_ANON_KEY: process.env.PROXE_SUPABASE_ANON_KEY ? 'SET' : 'NOT SET',
        }
      });
    }
    return null;
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log('[Supabase PROXe] Creating client', {
      url: proxeSupabaseUrl.replace(/(https?:\/\/)|\..*/g, '$1***'),
    });
  }

  const client = createClient(proxeSupabaseUrl, proxeSupabaseAnonKey, {
    auth: {
      persistSession: false,
    },
  });

  return client;
}

// Service role client for server-side operations
export function getSupabaseServiceClient(): SupabaseClient | null {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.PROXE_SUPABASE_SERVICE_KEY;
  
  if (!proxeSupabaseUrl || !serviceKey) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[Supabase PROXe Service] Missing Supabase URL or service key.');
    }
    return null;
  }

  return createClient(proxeSupabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
    },
  });
}
