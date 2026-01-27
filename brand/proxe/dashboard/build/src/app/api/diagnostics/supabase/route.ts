import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

interface DiagnosticResult {
  timestamp: string
  supabaseConfig: {
    url: string | null
    urlValid: boolean
    anonKey: string | null
    anonKeyValid: boolean
    serviceRoleKey: string | null
    serviceRoleKeyValid: boolean
  }
  connectivity: {
    canReachSupabase: boolean
    responseTime?: number
    error?: string
  }
  auth: {
    status: 'ok' | 'error' | 'rate_limited'
    canAuthenticate: boolean
    error?: string
    rateLimitInfo?: {
      isRateLimited: boolean
      retryAfter?: number
    }
  }
  database: {
    status: 'connected' | 'error' | 'unauthorized'
    canQuery: boolean
    error?: string
    tablesAccessible?: string[]
  }
  project: {
    status: 'active' | 'paused' | 'unknown'
    message: string
  }
  recommendations: string[]
}

export async function GET() {
  const result: DiagnosticResult = {
    timestamp: new Date().toISOString(),
    supabaseConfig: {
      url: null,
      urlValid: false,
      anonKey: null,
      anonKeyValid: false,
      serviceRoleKey: null,
      serviceRoleKeyValid: false,
    },
    connectivity: {
      canReachSupabase: false,
    },
    auth: {
      status: 'error',
      canAuthenticate: false,
    },
    database: {
      status: 'error',
      canQuery: false,
    },
    project: {
      status: 'unknown',
      message: 'Not checked',
    },
    recommendations: [],
  }

  // 1. Check Configuration (support both PROXE-prefixed and standard)
  const supabaseUrl = process.env.NEXT_PUBLIC_PROXE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_PROXE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  result.supabaseConfig.url = supabaseUrl || null
  result.supabaseConfig.urlValid = !!supabaseUrl && supabaseUrl.startsWith('https://') && supabaseUrl.includes('.supabase.co')
  result.supabaseConfig.anonKey = anonKey ? `${anonKey.substring(0, 20)}...` : null
  result.supabaseConfig.anonKeyValid = !!anonKey && anonKey.length > 50
  result.supabaseConfig.serviceRoleKey = serviceRoleKey ? `${serviceRoleKey.substring(0, 20)}...` : null
  result.supabaseConfig.serviceRoleKeyValid = !!serviceRoleKey && serviceRoleKey.length > 50

  if (!result.supabaseConfig.urlValid) {
    result.recommendations.push('NEXT_PUBLIC_SUPABASE_URL is missing or invalid. Check your .env.local file.')
  }
  if (!result.supabaseConfig.anonKeyValid) {
    result.recommendations.push('NEXT_PUBLIC_SUPABASE_ANON_KEY is missing or invalid. Get it from Supabase Dashboard > Settings > API.')
  }
  if (!result.supabaseConfig.serviceRoleKeyValid) {
    result.recommendations.push('SUPABASE_SERVICE_ROLE_KEY is missing or invalid. This is needed for webhooks.')
  }

  // 2. Check Connectivity
  if (result.supabaseConfig.urlValid && result.supabaseConfig.anonKeyValid) {
    try {
      const startTime = Date.now()
      const response = await fetch(`${supabaseUrl}/rest/v1/`, {
        method: 'GET',
        headers: {
          'apikey': anonKey!,
          'Authorization': `Bearer ${anonKey}`,
        },
        signal: AbortSignal.timeout(5000), // 5 second timeout
      })
      const responseTime = Date.now() - startTime

      result.connectivity.canReachSupabase = response.ok || response.status === 404 // 404 is ok, means server is reachable
      result.connectivity.responseTime = responseTime

      if (!response.ok && response.status !== 404) {
        result.connectivity.error = `HTTP ${response.status}: ${response.statusText}`
        
        // Check for rate limiting
        if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after')
          result.auth.status = 'rate_limited'
          result.auth.rateLimitInfo = {
            isRateLimited: true,
            retryAfter: retryAfter ? parseInt(retryAfter) : undefined,
          }
          result.recommendations.push(`Rate limited! Wait ${retryAfter || 'a few'} seconds before retrying.`)
        }
      }
    } catch (error) {
      result.connectivity.error = error instanceof Error ? error.message : 'Unknown error'
      result.recommendations.push('Cannot reach Supabase. Check your internet connection and Supabase project status.')
    }
  }

  // 3. Check Auth Service
  if (result.supabaseConfig.urlValid && result.supabaseConfig.anonKeyValid) {
    try {
      // Test auth endpoint without actually authenticating
      const authResponse = await fetch(`${supabaseUrl}/auth/v1/health`, {
        method: 'GET',
        headers: {
          'apikey': anonKey!,
        },
        signal: AbortSignal.timeout(5000),
      })

      if (authResponse.ok) {
        result.auth.status = 'ok'
        result.auth.canAuthenticate = true
      } else if (authResponse.status === 429) {
        result.auth.status = 'rate_limited'
        result.auth.canAuthenticate = false
        const retryAfter = authResponse.headers.get('retry-after')
        result.auth.rateLimitInfo = {
          isRateLimited: true,
          retryAfter: retryAfter ? parseInt(retryAfter) : undefined,
        }
        result.recommendations.push(`Auth service is rate limited. Wait ${retryAfter || 'a few minutes'} before retrying.`)
      } else {
        result.auth.status = 'error'
        result.auth.error = `Auth service returned ${authResponse.status}`
      }
    } catch (error) {
      result.auth.status = 'error'
      result.auth.error = error instanceof Error ? error.message : 'Unknown error'
    }
  }

  // 4. Check Database Connection
  if (result.supabaseConfig.urlValid && result.supabaseConfig.anonKeyValid) {
    try {
      const supabase = await createClient()
      
      // Try a simple query
      const { data, error } = await supabase
        .from('dashboard_users')
        .select('id')
        .limit(1)

      if (error) {
        result.database.status = error.code === '42501' || error.message.includes('permission') ? 'unauthorized' : 'error'
        result.database.error = error.message
        
        if (error.code === '42501') {
          result.recommendations.push('Database RLS (Row Level Security) is blocking access. Check your RLS policies.')
        } else if (error.code === '42P01') {
          result.recommendations.push('Table does not exist. Run database migrations from supabase/migrations/')
        }
      } else {
        result.database.status = 'connected'
        result.database.canQuery = true
        
        // Try to list accessible tables
        try {
          const { data: tablesData } = await supabase
            .from('dashboard_users')
            .select('*')
            .limit(0)
          
          // If we can query, try to check other tables
          const tablesToCheck = ['dashboard_users', 'all_leads', 'dashboard_settings', 'web_sessions']
          const accessibleTables: string[] = []
          
          for (const table of tablesToCheck) {
            try {
              const { error: tableError } = await supabase
                .from(table)
                .select('*')
                .limit(0)
              
              if (!tableError) {
                accessibleTables.push(table)
              }
            } catch {
              // Table might not exist or not accessible
            }
          }
          
          result.database.tablesAccessible = accessibleTables
        } catch {
          // Ignore table listing errors
        }
      }
    } catch (error) {
      result.database.status = 'error'
      result.database.error = error instanceof Error ? error.message : 'Unknown error'
    }
  }

  // 5. Check Project Status
  if (result.connectivity.canReachSupabase) {
    result.project.status = 'active'
    result.project.message = 'Supabase project is reachable and active'
  } else if (result.connectivity.error?.includes('timeout')) {
    result.project.status = 'unknown'
    result.project.message = 'Cannot determine project status - connection timeout'
  } else {
    result.project.status = 'unknown'
    result.project.message = 'Cannot reach Supabase project'
  }

  // Add general recommendations
  if (result.auth.status === 'rate_limited') {
    result.recommendations.push('You are currently rate limited. This usually resets after 5-10 minutes.')
    result.recommendations.push('Consider using Google OAuth login as an alternative.')
  }

  if (result.database.status === 'connected' && result.auth.status === 'ok') {
    result.recommendations.push('✅ All Supabase services are working correctly!')
  }

  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}

