import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    
    const { data: changelog, error } = await supabase
      .from('changelog')
      .select('*')
      .order('date', { ascending: false })
    
    if (error) {
      console.error('Error fetching changelog:', error)
      return NextResponse.json(
        { error: 'Failed to fetch changelog', message: error.message },
        { status: 500 }
      )
    }
    
    return NextResponse.json({ changelog })
  } catch (error) {
    console.error('Error in changelog API:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
