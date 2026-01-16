import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Database } from '@/types/database.types'

export async function createClient() {
  // Support both PROXE-prefixed and standard variable names
  const supabaseUrl = process.env.NEXT_PUBLIC_PROXE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
  const supabaseAnonKey = process.env.NEXT_PUBLIC_PROXE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'
  
  // Enhanced error checking
  const hasUrl = !!(process.env.NEXT_PUBLIC_PROXE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)
  const hasKey = !!(process.env.NEXT_PUBLIC_PROXE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  
  if (!hasUrl || !hasKey) {
    console.error('❌ [Server] Supabase environment variables are not set!')
    console.error('   Missing:', {
      url: !hasUrl,
      anonKey: !hasKey,
    })
    console.error('   Please configure NEXT_PUBLIC_PROXE_SUPABASE_URL and NEXT_PUBLIC_PROXE_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY) in your .env.local file')
  } else {
    // Validate URL format
    if (!supabaseUrl.startsWith('https://') || !supabaseUrl.includes('.supabase.co')) {
      console.error('❌ [Server] Invalid Supabase URL format:', supabaseUrl)
      console.error('   Expected format: https://your-project.supabase.co')
    }
    
    // Validate key format
    if (supabaseAnonKey.length < 50) {
      console.error('❌ [Server] Supabase anon key appears invalid (too short)')
    }
  }

  const cookieStore = await cookies()

  return createServerClient<Database>(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set(name, value, {
              ...options,
              sameSite: 'lax' as const,
              secure: process.env.NODE_ENV === 'production',
              httpOnly: options.httpOnly ?? false,
            })
          } catch (error) {
            // Cookie setting can fail in some contexts (e.g., during redirects)
            // This is expected and handled gracefully
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set(name, '', {
              ...options,
              maxAge: 0,
            })
          } catch (error) {
            // Cookie removal can fail in some contexts
          }
        },
      },
    }
  )
}

