import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    // AUTHENTICATION DISABLED - No auth check needed
    // const {
    //   data: { user },
    // } = await supabase.auth.getUser()

    // if (!user) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // }

    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = (page - 1) * limit
    const source = searchParams.get('source')
    const status = searchParams.get('status')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    let query = supabase
      .from('unified_leads')
      .select('*', { count: 'exact' })
      .order('last_interaction_at', { ascending: false })

    if (source) {
      // Filter by first_touchpoint or last_touchpoint
      query = query.or(`first_touchpoint.eq.${source},last_touchpoint.eq.${source}`)
    }

    if (status) {
      query = query.eq('status', status)
    }

    if (startDate) {
      // Use last_interaction_at for date filtering (more accurate than timestamp)
      query = query.gte('last_interaction_at', startDate)
    }

    if (endDate) {
      query = query.lte('last_interaction_at', endDate)
    }

    const { data, error, count } = await query.range(offset, offset + limit - 1)

    if (error) {
      console.error('Database error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      })
      throw error
    }

    return NextResponse.json({
      leads: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    })
  } catch (error) {
    console.error('Error fetching leads:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { 
        error: 'Failed to fetch leads',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      },
      { status: 500 }
    )
  }
}


