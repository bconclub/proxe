import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient, cancelBooking } from '@/lib/services'

export const dynamic = 'force-dynamic'

/**
 * POST /api/dashboard/leads/[id]/cancel-booking
 *
 * Removes a lead's booked session entirely: deletes the Google Calendar event,
 * clears the booking from the lead's unified_context + web_sessions, and cancels
 * the pending booking_reminder WhatsApp templates. Used by the dashboard
 * "Cancel booking" action.
 *
 * Auth: logged-in session. Write via service role.
 */
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServiceClient() || authClient
    const result = await cancelBooking(params.id, supabase as any)
    if (!result.ok) {
      return NextResponse.json({ error: result.error || 'Failed to cancel booking' }, { status: 400 })
    }
    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    console.error('[cancel-booking] Error:', error?.message || error)
    return NextResponse.json({ error: 'Failed to cancel booking' }, { status: 500 })
  }
}
