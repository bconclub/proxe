import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { Database } from '@/types/database.types'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  // IMPORTANT: Next.js requires static string access for NEXT_PUBLIC_* env vars.
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

  const supabase = createServerClient<Database>(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          supabaseResponse = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          // Ensure cookies work on localhost
          supabaseResponse.cookies.set({
            name,
            value,
            ...options,
            // Ensure cookies work on localhost (no domain restriction)
            sameSite: 'lax' as const,
            secure: process.env.NODE_ENV === 'production',
            httpOnly: options.httpOnly ?? false,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          supabaseResponse = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          supabaseResponse.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  // Add error handling to prevent infinite loops on rate limits
  try {
    // This call will automatically refresh the session if needed
    // and sync cookies from the request
    const { data: { user }, error } = await supabase.auth.getUser()
    
    // Debug logging in development
    if (process.env.NODE_ENV === 'development') {
      // Get all cookie names to see what Supabase is using
      const allCookies = request.cookies.getAll()
      const supabaseCookies = allCookies.filter(c => c.name.includes('sb-'))
      
      console.log('🔍 Middleware auth check:', {
        path: request.nextUrl.pathname,
        hasUser: !!user,
        userEmail: user?.email,
        error: error?.message,
        errorStatus: (error as any)?.status,
        supabaseCookies: supabaseCookies.map(c => c.name),
        allCookies: allCookies.map(c => ({ name: c.name, hasValue: !!c.value })),
      })
      
      // If we're going to dashboard and have no user, log why
      if (request.nextUrl.pathname === '/dashboard' && !user && error) {
        console.error('❌ Dashboard access denied:', {
          error: error.message,
          status: (error as any)?.status,
          cookies: supabaseCookies.length,
        })
      }
    }
    
    // If rate limited or bad request, don't retry
    if (error) {
      const errorStatus = (error as any)?.status
      
      // 429 = Rate limited - don't retry, just continue
      if (errorStatus === 429) {
        console.warn('🚫 Middleware: Rate limited, skipping auth check')
        return supabaseResponse
      }
      
      // 400 = Bad request - invalid session, clear and continue
      if (errorStatus === 400) {
        console.warn('🚫 Middleware: Invalid session (400), clearing cookies')
        // Clear all Supabase auth cookies (they have project-specific names)
        const allCookies = request.cookies.getAll()
        allCookies.forEach(cookie => {
          if (cookie.name.includes('sb-') && cookie.name.includes('auth-token')) {
            supabaseResponse.cookies.delete(cookie.name)
          }
        })
        return supabaseResponse
      }
      
      // Other errors - log but don't block
      if (errorStatus && errorStatus >= 500) {
        console.error('🚫 Middleware: Server error', errorStatus)
        return supabaseResponse
      }
    }
    
    // If user exists, ensure session is properly set in cookies
    // The createServerClient should handle this automatically via cookie handlers
  } catch (error) {
    // Catch any unexpected errors and continue
    console.error('🚫 Middleware: Auth check error', error)
    return supabaseResponse
  }

  return supabaseResponse
}
