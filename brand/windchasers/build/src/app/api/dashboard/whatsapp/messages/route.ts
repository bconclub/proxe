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

    // Get all WhatsApp messages where sender is 'agent'
    const { data: messages, error: messagesError } = await supabase
      .from('conversations')
      .select('*')
      .eq('channel', 'whatsapp')
      .eq('sender', 'agent')

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



