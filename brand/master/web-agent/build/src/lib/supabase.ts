import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const clientCache: SupabaseClient | null = null;

const MasterSupabaseUrl = process.env.NEXT_PUBLIC_MASTER_SUPABASE_URL ?? process.env.MASTER_SUPABASE_URL;
const MasterSupabaseAnonKey = process.env.NEXT_PUBLIC_MASTER_SUPABASE_ANON_KEY ?? process.env.MASTER_SUPABASE_ANON_KEY;

export function getSupabaseClient(): SupabaseClient | null {
  if (clientCache) {
    return clientCache;
  }

  if (!MasterSupabaseUrl || !MasterSupabaseAnonKey) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[Supabase Master] Missing Supabase URL or anon key.', {
        url: MasterSupabaseUrl,
        anonKeyPresent: Boolean(MasterSupabaseAnonKey),
        envVars: {
          NEXT_PUBLIC_MASTER_SUPABASE_URL: process.env.NEXT_PUBLIC_MASTER_SUPABASE_URL ? 'SET' : 'NOT SET',
          NEXT_PUBLIC_MASTER_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_MASTER_SUPABASE_ANON_KEY ? 'SET' : 'NOT SET',
          MASTER_SUPABASE_URL: process.env.MASTER_SUPABASE_URL ? 'SET' : 'NOT SET',
          MASTER_SUPABASE_ANON_KEY: process.env.MASTER_SUPABASE_ANON_KEY ? 'SET' : 'NOT SET',
        }
      });
    }
    return null;
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log('[Supabase Master] Creating client', {
      url: MasterSupabaseUrl.replace(/(https?:\/\/)|\..*/g, '$1***'),
    });
  }

  const client = createClient(MasterSupabaseUrl, MasterSupabaseAnonKey, {
    auth: {
      persistSession: false,
    },
  });

  return client;
}

// Service role client for server-side operations
export function getSupabaseServiceClient(): SupabaseClient | null {
  const serviceKey = process.env.MASTER_SUPABASE_SERVICE_KEY;
  
  if (!MasterSupabaseUrl || !serviceKey) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[Supabase Master Service] Missing Supabase URL or service key.');
    }
    return null;
  }

  return createClient(MasterSupabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
    },
  });
}
