import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// GET: Fetch widget style setting
export async function GET() {
  try {
    const supabase = await createClient()
    // AUTHENTICATION DISABLED - No auth check needed
    // const {
    //   data: { user },
    // } = await supabase.auth.getUser()

    // if (!user) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // }

    // Fetch widget style setting
    const { data: setting, error } = await supabase
      .from('dashboard_settings')
      .select('value')
      .eq('key', 'widget_style')
      .single()

    if (error && error.code !== 'PGRST116') {
      // PGRST116 is "not found" - that's okay, we'll use default
      throw error
    }

    // Default to searchbar if not set
    const style = setting?.value?.style || 'searchbar'

    return NextResponse.json({ style })
  } catch (error) {
    console.error('Error fetching widget style:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      {
        error: 'Failed to fetch widget style',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
      { status: 500 }
    )
  }
}

// POST: Save widget style setting
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    // AUTHENTICATION DISABLED - No auth check needed
    // const {
    //   data: { user },
    // } = await supabase.auth.getUser()

    // if (!user) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // }

    // Admin check disabled since auth is disabled
    // Use system user ID for tracking
    const systemUserId = 'system'

    const body = await request.json()
    const { style } = body

    if (!style || !['searchbar', 'bubble'].includes(style)) {
      return NextResponse.json(
        { error: 'Invalid style. Must be "searchbar" or "bubble"' },
        { status: 400 }
      )
    }

    // Upsert widget style setting
    const { data, error } = await supabase
      .from('dashboard_settings')
      .upsert(
        {
          key: 'widget_style',
          value: { style },
          description: 'Widget style preference: searchbar or bubble',
          updated_by: systemUserId,
        },
        {
          onConflict: 'key',
        }
      )
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      style: data.value.style,
      message: 'Widget style saved successfully',
    })
  } catch (error) {
    console.error('Error saving widget style:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      {
        error: 'Failed to save widget style',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
      { status: 500 }
    )
  }
}

