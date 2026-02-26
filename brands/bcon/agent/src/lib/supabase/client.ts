import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/types/database.types'

// Singleton pattern to prevent multiple client instances
let supabaseClient: ReturnType<typeof createSupabaseClient<Database>> | null = null

export function createClient() {
  // Return existing client if already created
  if (supabaseClient) {
    return supabaseClient
  }

  // Brand-agnostic Supabase configuration
  const brand = (process.env.NEXT_PUBLIC_BRAND || 'bcon').toUpperCase()
  const supabaseUrl = process.env[`NEXT_PUBLIC_${brand}_SUPABASE_URL`] || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
  const supabaseAnonKey = process.env[`NEXT_PUBLIC_${brand}_SUPABASE_ANON_KEY`] || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

  // Enhanced error checking
  const hasUrl = supabaseUrl !== 'https://placeholder.supabase.co'
  const hasKey = supabaseAnonKey !== 'placeholder-key'

  if (!hasUrl || !hasKey) {
    console.error(`❌ Supabase environment variables are not set! (brand=${brand})`)
    console.error('   Missing:', {
      url: !hasUrl,
      anonKey: !hasKey,
    })
    console.error(`   Please configure NEXT_PUBLIC_${brand}_SUPABASE_URL and NEXT_PUBLIC_${brand}_SUPABASE_ANON_KEY in your .env.local file`)
  } else {
    // Validate URL format
    if (!supabaseUrl.startsWith('https://') || !supabaseUrl.includes('.supabase.co')) {
      console.error('❌ Invalid Supabase URL format:', supabaseUrl)
      console.error('   Expected format: https://your-project.supabase.co')
    }
    
    // Validate key format (should be a JWT-like string)
    if (supabaseAnonKey.length < 50) {
      console.error('❌ Supabase anon key appears invalid (too short):', supabaseAnonKey.substring(0, 20) + '...')
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.log('✅ Supabase client initialized:', {
        url: supabaseUrl.substring(0, 30) + '...',
        anonKeySet: !!supabaseAnonKey,
        anonKeyLength: supabaseAnonKey.length,
      })
    }
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

