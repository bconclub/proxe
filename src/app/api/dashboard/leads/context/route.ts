/**
 * API Routes for Lead Context Extraction (GPFC 1)
 * 
 * POST: Extract business intelligence from conversations
 * GET: Get extracted context for a lead
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildLeadContext, extractBusinessIntel, updateLeadContext } from '@/lib/services/contextBuilder'

export const dynamic = 'force-dynamic'

// GET /api/dashboard/leads/context?leadId=xxx - Get context
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

    const supabase = await createClient()
    
    // Get lead with unified_context
    const { data: lead, error } = await supabase
      .from('all_leads')
      .select('unified_context')
      .eq('id', leadId)
      .single()

    if (error || !lead) {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      )
    }

    const context = lead.unified_context || {}
    const intel = context.extracted_intel

    return NextResponse.json({
      success: true,
      intel,
      context,
    })
  } catch (error) {
    console.error('[API] Failed to get context:', error)
    return NextResponse.json(
      { error: 'Failed to get context' },
      { status: 500 }
    )
  }
}

// POST /api/dashboard/leads/context - Extract or update context
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { leadId, action, updates } = body

    if (!leadId) {
      return NextResponse.json(
        { error: 'Missing leadId' },
        { status: 400 }
      )
    }

    // Extract business intelligence
    if (action === 'extract') {
      const intel = await extractBusinessIntel(leadId)
      
      if (!intel) {
        return NextResponse.json(
          { error: 'Extraction failed' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        intel,
      })
    }

    // Build full context
    if (action === 'build') {
      const context = await buildLeadContext(leadId, { forceRefresh: true, useAI: true })
      
      if (!context) {
        return NextResponse.json(
          { error: 'Context building failed' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        context,
      })
    }

    // Update context manually
    if (action === 'update' && updates) {
      const success = await updateLeadContext(leadId, updates)
      
      if (!success) {
        return NextResponse.json(
          { error: 'Update failed' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        updates,
      })
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    )
  } catch (error) {
    console.error('[API] Context API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
