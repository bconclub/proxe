import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessLeadId } from '@/lib/services/leadAccess'

// DEPRECATED — the `status` column is a dead legacy taxonomy (null on every
// lead; no UI writes it since 2026-07-13). Lead pipeline state lives in
// `lead_stage` via the /stage route. Kept only so old clients don't 404.
// Allowed status values
const ALLOWED_STATUSES = [
  'New Lead',
  'Follow Up',
  'RNR (No Response)',
  'Interested',
  'Wrong Enquiry',
  'Call Booked',
  'Closed'
]

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    // Auth gate: every dashboard API requires a logged-in Supabase session.
    // No role check here — viewer vs admin enforcement is done at write sites.
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const { status } = await request.json()
    const leadId = params.id

    // Lead-type access: restricted users can't act on leads outside their courses.
    if (!(await canAccessLeadId(supabase, user.id, leadId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Validate status
    if (!status || !ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${ALLOWED_STATUSES.join(', ')}` },
        { status: 400 }
      )
    }

    // Update the status in all_leads table
    const { data, error } = await supabase
      .from('all_leads')
      .update({ status })
      .eq('id', leadId)
      .select()
      .single()

    if (error) {
      console.error('Error updating lead status:', error)
      return NextResponse.json(
        { error: 'Failed to update lead status' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, lead: data })
  } catch (error) {
    console.error('Error updating lead status:', error)
    return NextResponse.json(
      { error: 'Failed to update lead status' },
      { status: 500 }
    )
  }
}

