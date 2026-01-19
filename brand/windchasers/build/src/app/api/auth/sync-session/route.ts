import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
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
    
    // Windchasers Supabase configuration
    const supabaseUrl = process.env.NEXT_PUBLIC_WINDCHASERS_SUPABASE_URL || 'https://placeholder.supabase.co'
    const supabaseAnonKey = process.env.NEXT_PUBLIC_WINDCHASERS_SUPABASE_ANON_KEY || 'placeholder-key'
    
    const cookieStore = await cookies()

    const supabase = createServerClient<Database>(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: CookieOptions) {
            try {
              cookieStore.set({
                name,
                value,
                ...options,
                sameSite: 'lax' as const,
                secure: process.env.NODE_ENV === 'production',
                httpOnly: options.httpOnly ?? false,
              })
            } catch (error) {
              // Cookie setting can fail in some contexts
            }
          },
          remove(name: string, options: CookieOptions) {
            try {
              cookieStore.set({
                name,
                value: '',
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
      const allCookies = cookieStore.getAll()
      const supabaseCookies = allCookies.filter(c => c.name.includes('sb-'))
      console.log('✅ Cookies set:', supabaseCookies.map(c => ({ name: c.name, hasValue: !!c.value })))
    }
    
    return NextResponse.json(
      { 
        success: true, 
        user: { id: user.id, email: user.email },
        message: 'Session synced to cookies'
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

export async function GET(request: NextRequest) {
  try {
    // Windchasers Supabase configuration
    const supabaseUrl = process.env.NEXT_PUBLIC_WINDCHASERS_SUPABASE_URL || 'https://placeholder.supabase.co'
    const supabaseAnonKey = process.env.NEXT_PUBLIC_WINDCHASERS_SUPABASE_ANON_KEY || 'placeholder-key'
    
    const cookieStore = await cookies()

    const supabase = createServerClient<Database>(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: CookieOptions) {
            try {
              cookieStore.set({
                name,
                value,
                ...options,
                sameSite: 'lax' as const,
                secure: process.env.NODE_ENV === 'production',
                httpOnly: options.httpOnly ?? false,
              })
            } catch (error) {
              // Cookie setting can fail in some contexts
            }
          },
          remove(name: string, options: CookieOptions) {
            try {
              cookieStore.set({
                name,
                value: '',
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

