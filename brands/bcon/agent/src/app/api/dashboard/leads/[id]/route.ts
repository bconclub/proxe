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
  console.log('[DELETE] Handler invoked for lead:', params.id)
  
  try {
    const supabase = await createClient()
    const { id } = params

    if (!id) {
      console.log('[DELETE] Missing lead ID')
      return NextResponse.json(
        { error: 'Missing lead ID' },
        { status: 400 }
      )
    }

    console.log('[DELETE] Attempting to delete lead:', id)

    // First delete related records to handle foreign key constraints
    console.log('[DELETE] Deleting related conversations...')
    const { error: convError, count: convCount } = await supabase
      .from('conversations')
      .delete()
      .eq('lead_id', id)
    
    if (convError) {
      console.error('[DELETE] Error deleting conversations:', convError)
    } else {
      console.log(`[DELETE] Deleted ${convCount || 'unknown'} conversations`)
    }

    // Delete from activities table
    console.log('[DELETE] Deleting related activities...')
    const { error: actError, count: actCount } = await supabase
      .from('activities')
      .delete()
      .eq('lead_id', id)
    
    if (actError) {
      console.error('[DELETE] Error deleting activities:', actError)
    } else {
      console.log(`[DELETE] Deleted ${actCount || 'unknown'} activities`)
    }

    // Delete from agent_tasks
    console.log('[DELETE] Deleting related tasks...')
    const { error: taskError, count: taskCount } = await supabase
      .from('agent_tasks')
      .delete()
      .eq('lead_id', id)
    
    if (taskError) {
      console.error('[DELETE] Error deleting tasks:', taskError)
    } else {
      console.log(`[DELETE] Deleted ${taskCount || 'unknown'} tasks`)
    }

    // Finally delete the lead
    console.log('[DELETE] Deleting lead from all_leads...')
    const { data, error } = await supabase
      .from('all_leads')
      .delete()
      .eq('id', id)
      .select()

    if (error) {
      console.error('[DELETE] Supabase error deleting lead:', error)
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
