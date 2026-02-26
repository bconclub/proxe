import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Database } from '@/types/database.types'

export async function createClient() {
  // Static env var access — Next.js requires static keys for NEXT_PUBLIC_* inlining
  const supabaseUrl =
    process.env.NEXT_PUBLIC_BCON_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    'https://placeholder.supabase.co'

  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_BCON_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    'placeholder-key'

  const hasUrl = supabaseUrl !== 'https://placeholder.supabase.co'
  const hasKey = supabaseAnonKey !== 'placeholder-key'

  if (!hasUrl || !hasKey) {
    console.error('[Server] Supabase environment variables are not set!')
    console.error('Please configure NEXT_PUBLIC_BCON_SUPABASE_URL and NEXT_PUBLIC_BCON_SUPABASE_ANON_KEY')
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
