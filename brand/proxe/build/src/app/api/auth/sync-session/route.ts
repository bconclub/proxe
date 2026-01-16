import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { Database } from '@/types/database.types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { access_token, refresh_token, expires_at, expires_in, token_type, user: sessionUser } = body
    
    if (!access_token || !refresh_token) {
      return NextResponse.json(
        { error: 'Missing session data' },
        { status: 400 }
      )
    }
    
    // Support both PROXE-prefixed and standard variable names
    const supabaseUrl = process.env.NEXT_PUBLIC_PROXE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
    const supabaseAnonKey = process.env.NEXT_PUBLIC_PROXE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'
    
    let response = NextResponse.next()
    
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
            response = NextResponse.next({
              request: {
                headers: request.headers,
              },
            })
            response.cookies.set({
              name,
              value,
              ...options,
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
            response = NextResponse.next({
              request: {
                headers: request.headers,
              },
            })
            response.cookies.set({
              name,
              value: '',
              ...options,
            })
          },
        },
      }
    )
    
    // Set the session - this will trigger cookie setting
    const { data: { session }, error: setError } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    })
    
    if (setError) {
      console.error('Set session error:', setError)
      return NextResponse.json(
        { error: setError.message },
        { status: 401 }
      )
    }
    
    // Verify user
    const { data: { user }, error: getUserError } = await supabase.auth.getUser()
    
    if (getUserError || !user) {
      console.error('❌ Sync session: Failed to get user after setting session:', getUserError)
      return NextResponse.json(
        { error: 'Failed to get user' },
        { status: 401 }
      )
    }
    
    // Log success in development
    if (process.env.NODE_ENV === 'development') {
      console.log('✅ Sync session: Successfully synced session for user:', user.email)
      const allCookies = response.cookies.getAll()
      const supabaseCookies = allCookies.filter(c => c.name.includes('sb-'))
      console.log('✅ Cookies set:', supabaseCookies.map(c => ({ name: c.name, hasValue: !!c.value })))
    }
    
    // Create JSON response and copy all cookies from the response object
    const jsonResponse = NextResponse.json(
      { 
        success: true, 
        user: { id: user.id, email: user.email },
        message: 'Session synced to cookies'
      }
    )
    
    // Copy all cookies from the response to the JSON response
    // This ensures cookies are sent back to the client
    response.cookies.getAll().forEach(cookie => {
      jsonResponse.cookies.set({
        name: cookie.name,
        value: cookie.value,
        path: cookie.path || '/',
        domain: cookie.domain,
        sameSite: 'lax' as const,
        secure: process.env.NODE_ENV === 'production',
        httpOnly: cookie.name.includes('auth-token') || cookie.name.includes('sb-'),
        maxAge: cookie.maxAge,
      })
    })
    
    // Also copy any Set-Cookie headers from the response
    const setCookieHeaders = response.headers.getSetCookie()
    setCookieHeaders.forEach(cookie => {
      jsonResponse.headers.append('Set-Cookie', cookie)
    })
    
    return jsonResponse
  } catch (error) {
    console.error('Sync session error:', error)
    return NextResponse.json(
      { error: 'Failed to sync session' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    // Support both PROXE-prefixed and standard variable names
    const supabaseUrl = process.env.NEXT_PUBLIC_PROXE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
    const supabaseAnonKey = process.env.NEXT_PUBLIC_PROXE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'
    
    let response = NextResponse.next()
    
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
            response = NextResponse.next({
              request: {
                headers: request.headers,
              },
            })
            response.cookies.set({
              name,
              value,
              ...options,
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
            response = NextResponse.next({
              request: {
                headers: request.headers,
              },
            })
            response.cookies.set({
              name,
              value: '',
              ...options,
            })
          },
        },
      }
    )
    
    // This will read from cookies and ensure they're set
    const { data: { user }, error } = await supabase.auth.getUser()
    
    // Debug logging
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 Sync session API:', {
        hasUser: !!user,
        error: error?.message,
      })
    }
    
    if (error && (error as any).status !== 400) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      )
    }
    
    if (!user) {
      return NextResponse.json(
        { error: 'No session found' },
        { status: 401 }
      )
    }
    
    return NextResponse.json(
      { 
        success: true, 
        user: { id: user.id, email: user.email },
        hasUser: !!user
      },
      {
        headers: response.headers,
      }
    )
  } catch (error) {
    console.error('Sync session error:', error)
    return NextResponse.json(
      { error: 'Failed to sync session' },
      { status: 500 }
    )
  }
}

