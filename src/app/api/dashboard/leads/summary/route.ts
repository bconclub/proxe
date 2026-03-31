/**
 * API Routes for Lead Summary Generation (GPFC 4)
 * 
 * GET: Get summary for a lead
 * POST: Generate or refresh summary
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateLeadSummary, getLeadSummary, refreshSummary } from '@/lib/services/summaryGenerator'

export const dynamic = 'force-dynamic'

// GET /api/dashboard/leads/summary?leadId=xxx - Get summary
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const leadId = searchParams.get('leadId')

    if (!leadId) {
      return NextResponse.json(
        { error: 'Missing leadId parameter' },
        { status: 400 }
      )
    }

    const summary = await getLeadSummary(leadId)

    if (!summary) {
      return NextResponse.json(
        { error: 'Summary not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      summary,
    })
  } catch (error) {
    console.error('[API] Summary fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch summary' },
      { status: 500 }
    )
  }
}

// POST /api/dashboard/leads/summary - Generate or refresh summary
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { leadId, forceRefresh } = body

    if (!leadId) {
      return NextResponse.json(
        { error: 'Missing leadId' },
        { status: 400 }
      )
    }

    let summary

    if (forceRefresh) {
      summary = await refreshSummary(leadId)
    } else {
      summary = await generateLeadSummary(leadId)
    }

    if (!summary) {
      return NextResponse.json(
        { error: 'Summary generation failed' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      summary,
      refreshed: forceRefresh || false,
    })
  } catch (error) {
    console.error('[API] Summary generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate summary' },
      { status: 500 }
    )
  }
}
