import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  // Support both PROXE-prefixed and standard variable names
  const supabaseUrl = process.env.NEXT_PUBLIC_PROXE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || null
  const supabaseAnonKey = process.env.NEXT_PUBLIC_PROXE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || null
  const usingProxePrefix = !!(process.env.NEXT_PUBLIC_PROXE_SUPABASE_URL && process.env.NEXT_PUBLIC_PROXE_SUPABASE_ANON_KEY)

  const debug: {
    env: {
      url: string | null
      urlSet: boolean
      anonKey: string | null
      anonKeySet: boolean
      nodeEnv: string
      usingProxePrefix: boolean
    }
    authCheck: {
      canCreateClient: boolean
      getUserResult: {
        hasUser: boolean
        userEmail: string | null
        error: string | null
        errorStatus: number | null
      } | null
    }
    recommendations: string[]
  } = {
    env: {
      url: supabaseUrl,
      urlSet: !!supabaseUrl,
      anonKey: supabaseAnonKey ? `${supabaseAnonKey.substring(0, 20)}...` : null,
      anonKeySet: !!supabaseAnonKey,
      nodeEnv: process.env.NODE_ENV || 'unknown',
      usingProxePrefix,
    },
    authCheck: {
      canCreateClient: false,
      getUserResult: null,
    },
    recommendations: [],
  }

  // Check environment variables
  const varPrefix = usingProxePrefix ? 'NEXT_PUBLIC_PROXE_SUPABASE' : 'NEXT_PUBLIC_SUPABASE'
  
  if (!debug.env.urlSet) {
    debug.recommendations.push(`❌ ${varPrefix}_URL is not set in .env.local`)
  } else if (!debug.env.url?.startsWith('https://') || !debug.env.url?.includes('.supabase.co')) {
    debug.recommendations.push(`⚠️ ${varPrefix}_URL format appears invalid (should be https://xxx.supabase.co)`)
  } else {
    debug.recommendations.push(`✅ ${varPrefix}_URL is set correctly${usingProxePrefix ? ' (using PROXE prefix)' : ''}`)
  }

  if (!debug.env.anonKeySet) {
    debug.recommendations.push(`❌ ${varPrefix}_ANON_KEY is not set in .env.local`)
  } else if (supabaseAnonKey && supabaseAnonKey.length < 50) {
    debug.recommendations.push(`⚠️ ${varPrefix}_ANON_KEY appears too short (should be ~200+ characters)`)
  } else {
    debug.recommendations.push(`✅ ${varPrefix}_ANON_KEY is set correctly${usingProxePrefix ? ' (using PROXE prefix)' : ''}`)
  }

  // Try to create client and check auth
  if (debug.env.urlSet && debug.env.anonKeySet) {
    try {
      const supabase = await createClient()
      debug.authCheck.canCreateClient = true

      // Try to get user
      const { data: { user }, error } = await supabase.auth.getUser()

      debug.authCheck.getUserResult = {
        hasUser: !!user,
        userEmail: user?.email || null,
        error: error?.message || null,
        errorStatus: (error as any)?.status || null,
      }

      if (error) {
        if ((error as any)?.status === 429) {
          debug.recommendations.push('⚠️ Rate limited by Supabase - wait a few minutes')
        } else if ((error as any)?.status === 400) {
          debug.recommendations.push('❌ Invalid session (400) - cookies may be corrupted, try clearing browser cookies')
        } else if ((error as any)?.status === 401) {
          debug.recommendations.push('❌ Unauthorized (401) - API key may be invalid')
        } else {
          debug.recommendations.push(`❌ Auth error: ${error.message} (status: ${(error as any)?.status || 'unknown'})`)
        }
      } else if (user) {
        debug.recommendations.push(`✅ User authenticated: ${user.email}`)
      } else {
        debug.recommendations.push('⚠️ No user found - you need to log in')
      }
    } catch (error) {
      debug.authCheck.canCreateClient = false
      debug.recommendations.push(`❌ Failed to create Supabase client: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  } else {
    debug.recommendations.push('❌ Cannot test auth - environment variables missing')
  }

  // Add development bypass recommendation
  if (debug.env.nodeEnv === 'development') {
    debug.recommendations.push('💡 Development mode: You can temporarily bypass auth in dashboard/layout.tsx')
  }

  return NextResponse.json(debug, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}
