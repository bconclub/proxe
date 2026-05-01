import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'

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
    const includeNewsletter = searchParams.get('include_newsletter') === 'true'

    let query = supabase
      .from('all_leads')
      .select('*', { count: 'exact' })
      .order('last_interaction_at', { ascending: false })

    // Exclude newsletter signups by default
    if (!includeNewsletter) {
      query = query.not('unified_context->web->form_submission->>form_type', 'eq', 'newsletter')
    }

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

    // Map all_leads columns to the shape the frontend expects
    const leads = (data || []).map((lead: any) => ({
      ...lead,
      name: lead.customer_name || lead.name || null,
      source: lead.first_touchpoint || lead.last_touchpoint || 'whatsapp',
    }))

    return NextResponse.json({
      leads,
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

// DELETE /api/dashboard/leads - Delete leads by email or id
export async function DELETE(request: NextRequest) {
  try {
    // Service-role client so RLS doesn't silently swallow the delete.
    const supabase = getServiceClient() || (await createClient())
    const { searchParams } = new URL(request.url)
    
    const id = searchParams.get('id')
    const email = searchParams.get('email')
    const phone = searchParams.get('phone')

    if (!id && !email && !phone) {
      return NextResponse.json(
        { error: 'Missing id, email, or phone parameter' },
        { status: 400 }
      )
    }

    let query = supabase.from('all_leads').delete()

    if (id) {
      query = query.eq('id', id)
    } else if (email) {
      query = query.eq('email', email)
    } else if (phone) {
      query = query.eq('customer_phone_normalized', phone.replace(/\D/g, '').slice(-10))
    }

    const { data, error } = await query.select()

    if (error) {
      console.error('[API] Failed to delete lead:', error)
      return NextResponse.json(
        { error: 'Failed to delete lead' },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      success: true, 
      deleted: data?.length || 0,
      leads: data 
    })
  } catch (error) {
    console.error('[API] Failed to delete lead:', error)
    return NextResponse.json(
      { error: 'Failed to delete lead' },
      { status: 500 }
    )
  }
}


