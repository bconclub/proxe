import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/webhooks/message-created
 * Webhook handler for when a new message is created
 * Triggers AI scoring for the lead
 */
export async function POST(request: NextRequest) {
  try {
    // Verify webhook secret if needed
    const body = await request.json()
    const { lead_id, message_id } = body

    if (!lead_id) {
      return NextResponse.json({ error: 'lead_id is required' }, { status: 400 })
    }

    console.log('Webhook: New message created for lead:', lead_id)

    // Call scoring endpoint
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const scoreResponse = await fetch(`${appUrl}/api/dashboard/leads/${lead_id}/score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!scoreResponse.ok) {
      const errorText = await scoreResponse.text()
      console.error('Error scoring lead:', errorText)
      // Don't fail the webhook - scoring can be retried
      return NextResponse.json({ 
        success: false, 
        message: 'Scoring failed but webhook processed',
        error: errorText 
      })
    }

    const scoreData = await scoreResponse.json()
    console.log('Lead scored successfully:', scoreData)

    return NextResponse.json({
      success: true,
      message: 'Lead scored successfully',
      score_data: scoreData,
    })
  } catch (error) {
    console.error('Error in message-created webhook:', error)
    // Return success to prevent webhook retries for transient errors
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

