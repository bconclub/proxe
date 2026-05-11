import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'

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
    // Use the service-role client so the cascade actually executes — the
    // anon/cookie client is filtered by RLS (`auth.role() = 'authenticated'`)
    // and silently returns 0 rows even though the response looks like success.
    const supabase = getServiceClient() || (await createClient())
    const { id } = params

    if (!id) {
      console.log('[DELETE] Missing lead ID')
      return NextResponse.json(
        { error: 'Missing lead ID' },
        { status: 400 }
      )
    }

    console.log('[DELETE] Attempting to delete lead:', id)

    // CASCADE DELETE: clear every child table that has a FK -> all_leads(id)
    // before deleting the parent row. Missing any table here causes the final
    // delete to fail silently with a 23503 FK constraint and the dashboard
    // "Delete Lead" button to look broken.
    const childTables = [
      'conversations',
      'messages',
      'activities',
      'agent_tasks',
      'lead_stage_changes',
      'lead_stage_overrides',
      'web_sessions',
      'whatsapp_sessions',
      'voice_sessions',
      'social_sessions',
    ] as const

    for (const table of childTables) {
      const { error: childErr } = await supabase.from(table).delete().eq('lead_id', id)
      if (childErr) {
        console.error(`[DELETE] Error deleting from ${table}:`, childErr)
      } else {
        console.log(`[DELETE] Cleared ${table}`)
      }
    }

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

    const deletedCount = data?.length || 0
    console.log('[DELETE] Successfully deleted lead:', id, 'Rows affected:', deletedCount)

    if (deletedCount === 0) {
      return NextResponse.json(
        { error: 'Lead not deleted (not found or blocked by policy)', leadId: id },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      deleted: deletedCount,
      leadId: id,
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
