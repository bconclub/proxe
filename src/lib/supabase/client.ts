import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/types/database.types'

// Singleton pattern to prevent multiple client instances
let supabaseClient: ReturnType<typeof createSupabaseClient<Database>> | null = null

export function createClient() {
  // Return existing client if already created
  if (supabaseClient) {
    return supabaseClient
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'
  
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.warn('⚠️  Supabase environment variables are not set. Please configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local file')
  }
  
  // AUTHENTICATION DISABLED - Clear any rate limit flags
  if (typeof window !== 'undefined') {
    // Clear rate limit flags since auth is disabled
    localStorage.removeItem('authRateLimitUntil')
    // Clear any auth tokens
    const projectRef = supabaseUrl.split('//')[1]?.split('.')[0]
    if (projectRef) {
      // Clear all Supabase auth-related localStorage items
      Object.keys(localStorage).forEach(key => {
        if (key.includes('sb-') && key.includes('auth')) {
          localStorage.removeItem(key)
        }
      })
    }
  }

  supabaseClient = createSupabaseClient<Database>(
    supabaseUrl,
    supabaseAnonKey,
    {
      auth: {
        persistSession: false
      }
    }
  )
  
  return supabaseClient
}

