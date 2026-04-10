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

    // First, try to delete related records in conversations table
    // This handles foreign key constraints if they exist
    try {
      const { error: convError } = await supabase
        .from('conversations')
        .delete()
        .eq('lead_id', id)
      
      if (convError) {
        console.log('[DELETE] No conversations deleted or error:', convError.message)
      } else {
        console.log('[DELETE] Deleted related conversations for lead:', id)
      }
    } catch (e) {
      console.log('[DELETE] Error deleting conversations (may not exist):', e)
    }

    // Delete from all_leads
    const { data, error } = await supabase
      .from('all_leads')
      .delete()
      .eq('id', id)
      .select()

    if (error) {
      console.error('[DELETE] Supabase error:', error)
      return NextResponse.json(
        { error: 'Failed to delete lead', details: error.message, code: error.code },
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
    console.error('[DELETE] Error stack:', error?.stack)
    return NextResponse.json(
      { 
        error: 'Failed to delete lead', 
        details: error?.message || 'Unknown error',
        type: error?.constructor?.name || 'Unknown'
      },
      { status: 500 }
    )
  }
}
