import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/types/database.types'

// Singleton pattern to prevent multiple client instances
let supabaseClient: ReturnType<typeof createSupabaseClient<Database>> | null = null

export function createClient() {
  // Return existing client if already created
  if (supabaseClient) {
    return supabaseClient
  }

  // IMPORTANT: Next.js requires static string access for NEXT_PUBLIC_* env vars.
  // Dynamic access like process.env[`NEXT_PUBLIC_${brand}_...`] does NOT work client-side.
  const supabaseUrl =
    process.env.NEXT_PUBLIC_BCON_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_WINDCHASERS_SUPABASE_URL ||
    ''

  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_BCON_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_WINDCHASERS_SUPABASE_ANON_KEY ||
    ''

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Supabase environment variables are not set! (brand=BCON)')
    console.error('   Missing:', { url: !supabaseUrl, anonKey: !supabaseAnonKey })
    console.error('   Please configure NEXT_PUBLIC_BCON_SUPABASE_URL and NEXT_PUBLIC_BCON_SUPABASE_ANON_KEY')
  }

  supabaseClient = createSupabaseClient<Database>(
    supabaseUrl,
    supabaseAnonKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  )

  return supabaseClient
}
