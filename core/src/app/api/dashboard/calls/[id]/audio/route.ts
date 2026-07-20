import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'

export const dynamic = 'force-dynamic'

// GET /api/dashboard/calls/[id]/audio
// Streams a call recording. V1 (Vapi) exposes a public recording URL directly,
// but V2 (ElevenLabs) audio is behind the API key - so we proxy it here (fetch
// with xi-api-key, stream back) so the dashboard's <audio> can play it. `id` is
// the external_session_id (the ElevenLabs conversation_id for V2).
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const supabase = getServiceClient() || authClient
  const { data: session } = await supabase
    .from('voice_sessions')
    .select('call_summary, recording_url')
    .eq('external_session_id', id)
    .maybeSingle()

  // Vapi/other: if a real recording URL is stored, just redirect to it.
  const stored = session?.recording_url
  if (stored && !String(session?.call_summary || '').includes('engine:elevenlabs')) {
    return NextResponse.redirect(stored)
  }

  // ElevenLabs: fetch the conversation audio with the API key and stream it.
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) return NextResponse.json({ error: 'ElevenLabs not configured' }, { status: 500 })
  const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(id)}/audio`, {
    headers: { 'xi-api-key': key },
  })
  if (!r.ok || !r.body) {
    return NextResponse.json({ error: `audio unavailable (${r.status})` }, { status: r.status === 404 ? 404 : 502 })
  }
  return new NextResponse(r.body, {
    status: 200,
    headers: {
      'Content-Type': r.headers.get('content-type') || 'audio/mpeg',
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
