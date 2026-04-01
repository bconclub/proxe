/**
 * Website Form Submission API
 * 
 * POST /api/website
 * Receives form submissions from website contact/newsletter forms
 * Creates or updates leads in all_leads table
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Helper to normalize phone number
function normalizePhone(phone: string | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  // Keep last 10 digits (Indian format)
  return digits.slice(-10)
}

// Helper to check auth
function checkAuth(request: NextRequest): boolean {
  const webhookSecret = process.env.WEBHOOK_SECRET
  if (!webhookSecret) {
    // If no webhook secret is set, allow all requests
    return true
  }

  const authHeader = request.headers.get('authorization')
  if (!authHeader) return false

  const token = authHeader.replace('Bearer ', '').trim()
  return token === webhookSecret
}

// POST /api/website - Handle form submission
export async function POST(request: NextRequest) {
  try {
    // Check auth if WEBHOOK_SECRET is configured
    if (!checkAuth(request)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()

    // Validation: Required fields
    const { name, email, phone, brand, form_type = 'contact' } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Required: name' },
        { status: 400 }
      )
    }

    if (!email && !phone) {
      return NextResponse.json(
        { error: 'Required: email or phone' },
        { status: 400 }
      )
    }

    if (!brand) {
      return NextResponse.json(
        { error: 'Required: brand' },
        { status: 400 }
      )
    }

    // Normalize phone for deduplication
    const normalizedPhone = normalizePhone(phone)

    const supabase = await createClient()

    // Check for existing lead by phone or email
    let existingLeadQuery = supabase
      .from('all_leads')
      .select('*')
      .eq('brand', brand)

    if (normalizedPhone) {
      existingLeadQuery = existingLeadQuery.eq('customer_phone_normalized', normalizedPhone)
    } else if (email) {
      existingLeadQuery = existingLeadQuery.eq('email', email)
    }

    const { data: existingLead, error: lookupError } = await existingLeadQuery.maybeSingle()

    if (lookupError) {
      console.error('[API/Website] Error looking up existing lead:', lookupError)
      return NextResponse.json(
        { error: 'Database error' },
        { status: 500 }
      )
    }

    const now = new Date().toISOString()

    // Build form submission data for unified_context
    const formSubmission = {
      form_type,
      name,
      email: email || null,
      phone: phone || null,
      message: body.message || null,
      page_url: body.page_url || null,
      utm_source: body.utm_source || null,
      utm_medium: body.utm_medium || null,
      utm_campaign: body.utm_campaign || null,
      submitted_at: now,
      user_agent: request.headers.get('user-agent') || null,
      ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null,
    }

    if (existingLead) {
      // Update existing lead
      const existingContext = existingLead.unified_context || {}
      const webSubmissions = existingContext.web?.form_submissions || []

      const updatedContext = {
        ...existingContext,
        web: {
          ...existingContext.web,
          form_submissions: [...webSubmissions, formSubmission],
          last_form_submission: formSubmission,
        },
      }

      const { data: updatedLead, error: updateError } = await supabase
        .from('all_leads')
        .update({
          customer_name: name || existingLead.customer_name,
          email: email || existingLead.email,
          phone: phone || existingLead.phone,
          last_touchpoint: 'web',
          last_interaction_at: now,
          total_touchpoints: (existingLead.total_touchpoints || 0) + 1,
          unified_context: updatedContext,
          updated_at: now,
        })
        .eq('id', existingLead.id)
        .select()
        .single()

      if (updateError) {
        console.error('[API/Website] Error updating lead:', updateError)
        return NextResponse.json(
          { error: 'Failed to update lead' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        lead_id: updatedLead.id,
        action: 'updated',
        lead_stage: updatedLead.lead_stage,
      })
    } else {
      // Create new lead
      const unifiedContext = {
        web: {
          form_submissions: [formSubmission],
          first_form_submission: formSubmission,
          last_form_submission: formSubmission,
        },
      }

      const { data: newLead, error: insertError } = await supabase
        .from('all_leads')
        .insert({
          customer_name: name,
          email: email || null,
          phone: phone || null,
          customer_phone_normalized: normalizedPhone,
          first_touchpoint: 'web',
          last_touchpoint: 'web',
          last_interaction_at: now,
          brand,
          unified_context: unifiedContext,
          lead_stage: 'New',
          lead_score: 0,
          total_touchpoints: 1,
          is_active_chat: false,
          response_count: 0,
          days_inactive: 0,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single()

      if (insertError) {
        console.error('[API/Website] Error creating lead:', insertError)
        return NextResponse.json(
          { error: 'Failed to create lead' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        lead_id: newLead.id,
        action: 'created',
        lead_stage: newLead.lead_stage,
      })
    }
  } catch (error) {
    console.error('[API/Website] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET /api/website - Health check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/website',
    methods: ['POST'],
    description: 'Website form submission endpoint',
  })
}
