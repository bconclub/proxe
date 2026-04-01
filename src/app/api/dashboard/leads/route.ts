/**
 * API Routes for Lead Management
 * 
 * GET: Fetch leads with optional grouping/filtering
 * POST: Update lead context/stage
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// GET /api/dashboard/leads - Get leads with filtering
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    
    const groupBy = searchParams.get('group_by')
    const stuck = searchParams.get('stuck')
    const days = parseInt(searchParams.get('days') || '7')
    const stage = searchParams.get('stage')
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')
    const includeNewsletter = searchParams.get('include_newsletter') === 'true'

    // Build query
    let query = supabase
      .from('all_leads')
      .select('*')
      .order('last_interaction_at', { ascending: false })
      .limit(limit)
      .range(offset, offset + limit - 1)

    // Filter by stage if specified
    if (stage) {
      query = query.eq('lead_stage', stage)
    }

    // Filter stuck leads
    if (stuck === 'true') {
      const stuckDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
      query = query.lt('last_interaction_at', stuckDate)
    }

    // Exclude newsletter signups by default
    if (!includeNewsletter) {
      // Filter out leads where unified_context->web->form_submission->form_type = 'newsletter'
      query = query.not('unified_context->web->form_submission->>form_type', 'eq', 'newsletter')
    }

    const { data: leads, error } = await query

    if (error) {
      console.error('[API] Failed to fetch leads:', error)
      return NextResponse.json(
        { error: 'Failed to fetch leads' },
        { status: 500 }
      )
    }

    // Group by stage if requested
    if (groupBy === 'lead_stage') {
      const grouped = (leads || []).reduce((acc: Record<string, any[]>, lead) => {
        const stage = lead.lead_stage || 'Unknown'
        if (!acc[stage]) acc[stage] = []
        acc[stage].push(lead)
        return acc
      }, {})

      const stageCounts = Object.entries(grouped).map(([stage, items]) => ({
        stage,
        count: items.length,
        leads: items,
      }))

      return NextResponse.json({ 
        success: true, 
        leads: stageCounts,
        total: leads?.length || 0,
      })
    }

    return NextResponse.json({ 
      success: true, 
      leads,
      total: leads?.length || 0,
    })
  } catch (error) {
    console.error('[API] Failed to fetch leads:', error)
    return NextResponse.json(
      { error: 'Failed to fetch leads' },
      { status: 500 }
    )
  }
}

// POST /api/dashboard/leads - Update lead
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const { id, updates } = body

    if (!id || !updates) {
      return NextResponse.json(
        { error: 'Missing id or updates' },
        { status: 400 }
      )
    }

    // Get existing lead
    const { data: existing } = await supabase
      .from('all_leads')
      .select('unified_context')
      .eq('id', id)
      .single()

    // Merge unified_context if provided
    const updateData: any = {
      ...updates,
      updated_at: new Date().toISOString(),
    }

    if (updates.unified_context && existing?.unified_context) {
      updateData.unified_context = {
        ...existing.unified_context,
        ...updates.unified_context,
      }
    }

    const { data, error } = await supabase
      .from('all_leads')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[API] Failed to update lead:', error)
      return NextResponse.json(
        { error: 'Failed to update lead' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, lead: data })
  } catch (error) {
    console.error('[API] Failed to update lead:', error)
    return NextResponse.json(
      { error: 'Failed to update lead' },
      { status: 500 }
    )
  }
}
