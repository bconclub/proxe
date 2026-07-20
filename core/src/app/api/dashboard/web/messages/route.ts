import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    // Auth gate: every dashboard API requires a logged-in Supabase session.
    // No role check here - viewer vs admin enforcement is done at write sites.
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all web messages
    const { data: messages, error: messagesError } = await supabase
      .from('conversations')
      .select('*')
      .eq('channel', 'web')
      .order('created_at', { ascending: false })

    if (messagesError) throw messagesError

    return NextResponse.json({
      messages: messages || [],
    })
  } catch (error) {
    console.error('Error fetching web messages:', error)
    return NextResponse.json(
      { error: 'Failed to fetch web messages' },
      { status: 500 }
    )
  }
}



