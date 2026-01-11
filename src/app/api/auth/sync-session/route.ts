import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { access_token, refresh_token, expires_at, expires_in, token_type, user: sessionUser } = body
    
    if (!access_token || !refresh_token) {
      return NextResponse.json(
        { error: 'Missing session data' },
        { status: 400 }
      )
    }
    
    const supabase = await createClient()
    
    // Set the session - this will trigger cookie setting
    const { data: { session }, error: setError } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    })
    
    if (setError) {
      console.error('Set session error:', setError)
      return NextResponse.json(
        { error: setError.message },
        { status: 401 }
      )
    }
    
    // Verify user
    const { data: { user }, error: getUserError } = await supabase.auth.getUser()
    
    if (getUserError || !user) {
      return NextResponse.json(
        { error: 'Failed to get user' },
        { status: 401 }
      )
    }
    
    return NextResponse.json({ 
      success: true, 
      user: { id: user.id, email: user.email },
      message: 'Session synced to cookies'
    })
  } catch (error) {
    console.error('Sync session error:', error)
    return NextResponse.json(
      { error: 'Failed to sync session' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // This will read from cookies and ensure they're set
    const { data: { user }, error } = await supabase.auth.getUser()
    
    // Debug logging
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 Sync session API:', {
        hasUser: !!user,
        error: error?.message,
      })
    }
    
    if (error && (error as any).status !== 400) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      )
    }
    
    if (!user) {
      return NextResponse.json(
        { error: 'No session found' },
        { status: 401 }
      )
    }
    
    return NextResponse.json({ 
      success: true, 
      user: { id: user.id, email: user.email },
      hasUser: !!user
    })
  } catch (error) {
    console.error('Sync session error:', error)
    return NextResponse.json(
      { error: 'Failed to sync session' },
      { status: 500 }
    )
  }
}

