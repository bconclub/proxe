import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { Database } from '@/types/database.types'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'
  
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

  // AUTHENTICATION DISABLED - Auth checks commented out
  // // Add error handling to prevent infinite loops on rate limits
  // try {
  //   
  //   // This call will automatically refresh the session if needed
  //   // and sync cookies from the request
  //   const { data: { user }, error } = await supabase.auth.getUser()
  //   
  //   // Debug logging in development
  //   if (process.env.NODE_ENV === 'development') {
  //     // Get all cookie names to see what Supabase is using
  //     const allCookies = request.cookies.getAll()
  //     const supabaseCookies = allCookies.filter(c => c.name.includes('sb-'))
  //     
  //     console.log('🔍 Middleware auth check:', {
  //       path: request.nextUrl.pathname,
  //       hasUser: !!user,
  //       hasSession: !!session,
  //       userEmail: user?.email,
  //       error: error?.message,
  //       errorStatus: (error as any)?.status,
  //       supabaseCookies: supabaseCookies.map(c => c.name),
  //       allCookieNames: allCookies.map(c => c.name),
  //     })
  //   }
  //   
  //   // If rate limited or bad request, don't retry
  //   if (error) {
  //     const errorStatus = (error as any).status
  //     
  //     // 429 = Rate limited - don't retry, just continue
  //     if (errorStatus === 429) {
  //       console.warn('🚫 Middleware: Rate limited, skipping auth check')
  //       return supabaseResponse
  //     }
  //     
  //     // 400 = Bad request - invalid session, clear and continue
  //     if (errorStatus === 400) {
  //       console.warn('🚫 Middleware: Invalid session (400), clearing cookies')
  //       // Clear all Supabase auth cookies (they have project-specific names)
  //       const allCookies = request.cookies.getAll()
  //       allCookies.forEach(cookie => {
  //         if (cookie.name.includes('sb-') && cookie.name.includes('auth-token')) {
  //           supabaseResponse.cookies.delete(cookie.name)
  //         }
  //       })
  //       return supabaseResponse
  //     }
  //     
  //     // Other errors - log but don't block
  //     if (errorStatus && errorStatus >= 500) {
  //       console.error('🚫 Middleware: Server error', errorStatus)
  //       return supabaseResponse
  //     }
  //   }
  //   
  //   // If user exists, ensure session is properly set in cookies
  //   // The createServerClient should handle this automatically via cookie handlers
  // } catch (error) {
  //   // Catch any unexpected errors and continue
  //   console.error('🚫 Middleware: Auth check error', error)
  //   return supabaseResponse
  // }

  return supabaseResponse
}

