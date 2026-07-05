import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/types/database.types'

// Singleton pattern to prevent multiple client instances.
// createBrowserClient stores the session in cookies (not just localStorage)
// so the Next.js server-side createServerClient can read it without any
// manual sync-session dance.
let supabaseClient: ReturnType<typeof createBrowserClient<Database>> | null = null

export function createClient() {
  if (supabaseClient) return supabaseClient

  // IMPORTANT: Next.js requires static string access for NEXT_PUBLIC_* env vars.
  // Dynamic access like process.env[`NEXT_PUBLIC_${brand}_...`] does NOT work client-side.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Supabase environment variables are not set! (brand=BCON)')
    console.error('   Missing:', { url: !supabaseUrl, anonKey: !supabaseAnonKey })
    console.error('   Please configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }

  supabaseClient = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)
  return supabaseClient
}
