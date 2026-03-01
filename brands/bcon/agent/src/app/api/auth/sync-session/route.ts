import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { Database } from '@/types/database.types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { access_token, refresh_token, expires_at, expires_in, token_type, user: sessionUser } = body
    
    if (!access_token || !refresh_token) {
      console.error('❌ Sync session: Missing session data', {
        hasAccessToken: !!access_token,
        hasRefreshToken: !!refresh_token,
      })
      return NextResponse.json(
        { error: 'Missing session data' },
        { status: 400 }
      )
    }
    
    // Static env var access (Next.js requires static string keys for NEXT_PUBLIC_*)
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

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('❌ Sync session: Supabase environment variables not set')
      return NextResponse.json(
        {
          error: 'Server configuration error: Supabase credentials not configured',
          details: process.env.NODE_ENV === 'development' ? {
            missingUrl: !supabaseUrl,
            missingKey: !supabaseAnonKey,
          } : undefined
        },
        { status: 500 }
      )
    }
    
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
              cookieStore.set(name, value, {
                ...options,
                sameSite: 'lax' as const,
                secure: process.env.NODE_ENV === 'production',
                httpOnly: options.httpOnly ?? false,
                path: '/',
              })
            } catch (error) {
              console.error('❌ Cookie set error (POST):', error)
              // Cookie setting can fail in some contexts
            }
          },
          remove(name: string, options: CookieOptions) {
            try {
              cookieStore.set(name, '', {
                ...options,
                maxAge: 0,
                path: '/',
              })
            } catch (error) {
              console.error('❌ Cookie remove error (POST):', error)
              // Cookie removal can fail in some contexts
            }
          },
        },
      }
    )
    
    // Verify environment variables are set
    if (!supabaseUrl || supabaseUrl.includes('placeholder') || !supabaseAnonKey || supabaseAnonKey.includes('placeholder')) {
      console.error('❌ Sync session: Supabase environment variables not configured')
      return NextResponse.json(
        { error: 'Server configuration error: Supabase credentials not set' },
        { status: 500 }
      )
    }
    
    // Set the session - this will trigger cookie setting
    const { data: { session }, error: setError } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    })
    
    if (setError) {
      console.error('❌ Set session error:', {
        message: setError.message,
        status: (setError as any)?.status,
        name: setError.name,
      })
      return NextResponse.json(
        { 
          error: setError.message,
          details: process.env.NODE_ENV === 'development' ? {
            supabaseUrl: supabaseUrl?.substring(0, 30) + '...',
            hasAnonKey: !!supabaseAnonKey,
          } : undefined
        },
        { status: 401 }
      )
    }
    
    if (!session) {
      console.error('❌ Sync session: Session is null after setSession')
      return NextResponse.json(
        { error: 'Session not created' },
        { status: 401 }
      )
    }
    
    // Verify user
    const { data: { user }, error: getUserError } = await supabase.auth.getUser()
    
    if (getUserError || !user) {
      console.error('❌ Sync session: Failed to get user after setting session:', {
        error: getUserError?.message,
        status: (getUserError as any)?.status,
        hasSession: !!session,
      })
      return NextResponse.json(
        { 
          error: getUserError?.message || 'Failed to get user',
          details: process.env.NODE_ENV === 'development' ? {
            sessionExists: !!session,
            sessionUser: session?.user?.email,
          } : undefined
        },
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
    // Static env var access (Next.js requires static string keys for NEXT_PUBLIC_*)
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
              cookieStore.set(name, value, {
                ...options,
                sameSite: 'lax' as const,
                secure: process.env.NODE_ENV === 'production',
                httpOnly: options.httpOnly ?? false,
                path: '/',
              })
            } catch (error) {
              console.error('❌ Cookie set error (GET):', error)
              // Cookie setting can fail in some contexts
            }
          },
          remove(name: string, options: CookieOptions) {
            try {
              cookieStore.set(name, '', {
                ...options,
                maxAge: 0,
                path: '/',
              })
            } catch (error) {
              console.error('❌ Cookie remove error (GET):', error)
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

