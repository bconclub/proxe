import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveWorkspaceBrands, scopeToWorkspace } from '@/lib/server/workspace'

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

    // Get all WhatsApp messages where sender is 'agent', scoped to the
    // selected workspace. Without this the inbox showed every brand's messages
    // on a shared database no matter which workspace was picked.
    const ws = await resolveWorkspaceBrands()
    const { data: messages, error: messagesError } = await scopeToWorkspace(
      supabase
        .from('conversations')
        .select('*')
        .eq('channel', 'whatsapp')
        .eq('sender', 'agent'),
      ws
    )

    if (messagesError) throw messagesError

    const totalMessagesSent = messages?.length || 0

    return NextResponse.json({
      totalMessagesSent,
      messages: messages || [],
    })
  } catch (error) {
    console.error('Error fetching WhatsApp messages:', error)
    return NextResponse.json(
      { error: 'Failed to fetch WhatsApp messages' },
      { status: 500 }
    )
  }
}



