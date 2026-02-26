import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/types/database.types'

// Singleton pattern to prevent multiple client instances
let supabaseClient: ReturnType<typeof createSupabaseClient<Database>> | null = null

export function createClient() {
  // Return existing client if already created
  if (supabaseClient) {
    return supabaseClient
  }

  // Static env var access — Next.js inlines NEXT_PUBLIC_* only with static keys
  const supabaseUrl =
    process.env.NEXT_PUBLIC_BCON_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    'https://placeholder.supabase.co'

  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_BCON_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    'placeholder-key'

  // Error checking
  const hasUrl = supabaseUrl !== 'https://placeholder.supabase.co'
  const hasKey = supabaseAnonKey !== 'placeholder-key'

  if (!hasUrl || !hasKey) {
    console.error('Supabase environment variables are not set!')
    console.error('Please configure NEXT_PUBLIC_BCON_SUPABASE_URL and NEXT_PUBLIC_BCON_SUPABASE_ANON_KEY')
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
