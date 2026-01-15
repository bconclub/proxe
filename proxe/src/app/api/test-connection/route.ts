import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const results: {
    envCheck: {
      url: boolean
      anonKey: boolean
      serviceRoleKey: boolean
    }
    connectionTest: {
      success: boolean
      error?: string
      responseTime?: number
    }
    databaseTest: {
      success: boolean
      error?: string
      tablesChecked?: string[]
    }
  } = {
    envCheck: {
      url: !!(process.env.NEXT_PUBLIC_PROXE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL),
      anonKey: !!(process.env.NEXT_PUBLIC_PROXE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      serviceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
    connectionTest: {
      success: false,
    },
    databaseTest: {
      success: false,
    },
  }

  // Support both PROXE-prefixed and standard variable names
  const supabaseUrl = process.env.NEXT_PUBLIC_PROXE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_PROXE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Test 1: Environment Variables
  console.log('🔍 Testing Supabase connection...')
  console.log('   URL:', supabaseUrl ? 'Set' : 'Missing')
  console.log('   Anon Key:', supabaseAnonKey ? 'Set' : 'Missing')
  console.log('   Service Role Key:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'Missing')

  // Test 2: Connection Test
  if (results.envCheck.url && results.envCheck.anonKey && supabaseUrl && supabaseAnonKey) {
    try {
      const startTime = Date.now()
      const response = await fetch(`${supabaseUrl}/rest/v1/`, {
        method: 'GET',
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      })
      const responseTime = Date.now() - startTime

      results.connectionTest.success = response.ok || response.status === 404
      results.connectionTest.responseTime = responseTime

      if (!response.ok && response.status !== 404) {
        results.connectionTest.error = `HTTP ${response.status}: ${response.statusText}`
        console.error('❌ Connection test failed:', results.connectionTest.error)
      } else {
        console.log('✅ Connection test passed:', responseTime + 'ms')
      }
    } catch (error) {
      results.connectionTest.error = error instanceof Error ? error.message : 'Unknown error'
      console.error('❌ Connection test error:', results.connectionTest.error)
    }
  } else {
    results.connectionTest.error = 'Missing environment variables'
  }

  // Test 3: Database Query Test
  if (results.envCheck.url && results.envCheck.anonKey) {
    try {
      const supabase = await createClient()
      
      // Try to query a simple table
      const { data, error } = await supabase
        .from('dashboard_users')
        .select('id')
        .limit(1)

      if (error) {
        results.databaseTest.error = error.message
        console.error('❌ Database test failed:', error.message)
        console.error('   Error code:', error.code)
        console.error('   Error details:', error.details)
      } else {
        results.databaseTest.success = true
        console.log('✅ Database test passed')
        
        // Check other tables
        const tablesToCheck = ['all_leads', 'dashboard_settings', 'web_sessions', 'whatsapp_sessions']
        const accessibleTables: string[] = ['dashboard_users']
        
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
            // Table might not exist
          }
        }
        
        results.databaseTest.tablesChecked = accessibleTables
      }
    } catch (error) {
      results.databaseTest.error = error instanceof Error ? error.message : 'Unknown error'
      console.error('❌ Database test error:', results.databaseTest.error)
    }
  } else {
    results.databaseTest.error = 'Missing environment variables'
  }

  return NextResponse.json({
    success: results.connectionTest.success && results.databaseTest.success,
    ...results,
    timestamp: new Date().toISOString(),
  })
}
