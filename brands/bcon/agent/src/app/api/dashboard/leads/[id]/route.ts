import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { id } = params

    const { data, error } = await supabase
      .from('all_leads')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    if (!data) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    return NextResponse.json({
      ...data,
      name: data.customer_name || data.name || null,
      source: data.first_touchpoint || data.last_touchpoint || 'whatsapp',
    })
  } catch (error) {
    console.error('[leads/[id]] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch lead' }, { status: 500 })
  }
}

// DELETE handler for /api/dashboard/leads/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { id } = params

    if (!id) {
      return NextResponse.json(
        { error: 'Missing lead ID' },
        { status: 400 }
      )
    }

    console.log('[DELETE] Attempting to delete lead:', id)

    const { data, error } = await supabase
      .from('all_leads')
      .delete()
      .eq('id', id)
      .select()

    if (error) {
      console.error('[DELETE] Supabase error:', error)
      return NextResponse.json(
        { error: 'Failed to delete lead', details: error.message },
        { status: 500 }
      )
    }

    console.log('[DELETE] Successfully deleted lead:', id, 'Rows affected:', data?.length || 0)

    return NextResponse.json({ 
      success: true, 
      deleted: data?.length || 0,
      leadId: id
    })
  } catch (error: any) {
    console.error('[DELETE] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to delete lead', details: error?.message || 'Unknown error' },
      { status: 500 }
    )
  }
}
