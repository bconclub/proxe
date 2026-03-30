import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/integrations/landing-pages
 *
 * Receives lead submissions from Windchasers landing pages / forms.
 * Upserts the lead in all_leads and fires AI scoring.
 *
 * Required header:
 *   x-api-key: WHATSAPP_API_KEY (reuses same shared secret)
 *
 * Body (all optional except name + phone):
 *   name, phone, email
 *   course_interest, city, training_type, user_type, timeline
 *   utm_source, utm_medium, utm_campaign, utm_content, utm_term
 *   page_url, form_name
 *   brand (defaults to "windchasers")
 */

function resolveSupabaseUrl(): string {
  const bp = (process.env.NEXT_PUBLIC_BRAND_ID || process.env.NEXT_PUBLIC_BRAND || 'windchasers').toUpperCase()
  return process.env[`NEXT_PUBLIC_${bp}_SUPABASE_URL`] || process.env.NEXT_PUBLIC_WINDCHASERS_SUPABASE_URL || ''
}

const getServiceClient = () =>
  createClient(resolveSupabaseUrl(), process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })

const normalizePhone = (phone: string) => phone.replace(/\D/g, '')

export async function POST(request: NextRequest) {
  try {
    // Auth
    const apiKey = request.headers.get('x-api-key')
    if (apiKey !== process.env.WHATSAPP_API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      name,
      phone,
      email,
      course_interest,
      city,
      training_type,
      user_type,
      timeline,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      page_url,
      form_name,
      brand = 'windchasers',
    } = body

    if (!name || !phone) {
      return NextResponse.json({ error: 'name and phone are required' }, { status: 400 })
    }

    const supabase = getServiceClient()
    const normalizedPhone = normalizePhone(phone)
    const now = new Date().toISOString()

    // Upsert lead
    const { data: existingLead } = await supabase
      .from('all_leads')
      .select('id, unified_context')
      .eq('customer_phone_normalized', normalizedPhone)
      .eq('brand', brand)
      .maybeSingle()

    const landingPageContext = {
      course_interest: course_interest || null,
      city: city || null,
      training_type: training_type || null,
      user_type: user_type || null,
      timeline: timeline || null,
      utm_source: utm_source || null,
      utm_medium: utm_medium || null,
      utm_campaign: utm_campaign || null,
      utm_content: utm_content || null,
      utm_term: utm_term || null,
      page_url: page_url || null,
      form_name: form_name || null,
      captured_at: now,
    }

    let leadId: string

    if (!existingLead?.id) {
      // New lead
      const { data: newLead, error: insertError } = await supabase
        .from('all_leads')
        .insert({
          customer_name: name,
          email: email || null,
          phone,
          customer_phone_normalized: normalizedPhone,
          first_touchpoint: 'landing_page',
          last_touchpoint: 'landing_page',
          last_interaction_at: now,
          brand,
          unified_context: {
            landing_page: landingPageContext,
          },
        })
        .select('id')
        .single()

      if (insertError) throw insertError
      leadId = newLead.id
    } else {
      leadId = existingLead.id
      const existing = existingLead.unified_context || {}

      const { error: updateError } = await supabase
        .from('all_leads')
        .update({
          last_touchpoint: 'landing_page',
          last_interaction_at: now,
          // Update name/email if provided and not already set
          ...(name ? { customer_name: name } : {}),
          ...(email ? { email } : {}),
          unified_context: {
            ...existing,
            landing_page: {
              ...(existing.landing_page || {}),
              ...landingPageContext,
            },
          },
        })
        .eq('id', leadId)

      if (updateError) throw updateError
    }

    // Insert a conversations record so the lead shows in inbox
    await supabase.from('conversations').insert({
      lead_id: leadId,
      channel: 'landing_page',
      sender: 'customer',
      content: `Landing page enquiry${course_interest ? ` — ${course_interest}` : ''}${form_name ? ` (${form_name})` : ''}`,
      message_type: 'text',
      metadata: { page_url, form_name, utm_source, utm_medium, utm_campaign },
    })

    // Fire AI scoring (non-blocking)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3003'
    fetch(`${appUrl}/api/webhooks/message-created`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId }),
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      lead_id: leadId,
      message: 'Landing page lead captured successfully',
    })
  } catch (error) {
    console.error('[landing-pages] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process lead' },
      { status: 500 }
    )
  }
}
