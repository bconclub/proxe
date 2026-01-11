import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// GET: Public endpoint for website to fetch widget style
// No authentication required - this is for public website use
export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      // Fallback to default if env vars not set
      return NextResponse.json(
        { style: 'searchbar' },
        {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        }
      )
    }

    // Use service role key to bypass RLS for public access
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Fetch widget style setting
    const { data: setting, error } = await supabase
      .from('dashboard_settings')
      .select('value')
      .eq('key', 'widget_style')
      .single()

    if (error && error.code !== 'PGRST116') {
      // PGRST116 is "not found" - that's okay, we'll use default
      // Log error but don't fail - return default
      console.warn('Error fetching widget style (public):', error.message)
    }

    // Default to searchbar if not set or error
    const style = setting?.value?.style || 'searchbar'

    // Add CORS headers for public access
    return NextResponse.json(
      { style },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      }
    )
  } catch (error) {
    console.error('Error fetching widget style (public):', error)
    // Always return a valid response, defaulting to searchbar
    return NextResponse.json(
      { style: 'searchbar' },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      }
    )
  }
}

// Handle OPTIONS for CORS preflight
export async function OPTIONS() {
  return NextResponse.json(
    {},
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    }
  )
}

