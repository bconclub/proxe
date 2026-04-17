import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, getClient, normalizePhone } from '@/lib/services'

export const dynamic = 'force-dynamic'

/**
 * POST /api/agent/leads/inbound
 * Inbound lead API for Facebook, Google, website forms, manual entry.
 * Creates or updates a lead and schedules a first_outreach task.
 *
 * Auth: x-api-key header must match INBOUND_API_KEY env var.
 * Body: { name, phone, email?, source, campaign?, notes?, brand?,
 *         city?, brand_name?, urgency?, custom_fields? }
 */
export async function POST(request: NextRequest) {
  try {
    // Auth check
    const apiKey = request.headers.get('x-api-key')
    const expectedKey = process.env.INBOUND_API_KEY
    if (!expectedKey || apiKey !== expectedKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body - handle JSON, form-urlencoded, and malformed payloads
    let body: Record<string, any>
    const rawBody = await request.text()

    const contentType = request.headers.get('content-type') || ''
    if (contentType.includes('application/x-www-form-urlencoded')) {
      // Pabbly sometimes sends form-urlencoded instead of JSON
      const params = new URLSearchParams(rawBody)
      body = Object.fromEntries(params.entries())
      // form-urlencoded custom_fields arrives as a string - try to parse it
      if (typeof body.custom_fields === 'string') {
        try { body.custom_fields = JSON.parse(body.custom_fields) } catch { /* leave as string */ }
      }
    } else {
      try {
        body = JSON.parse(rawBody)
      } catch (parseErr: any) {
        console.error('[inbound] JSON parse failed. Raw body:', rawBody)
        // Try to extract fields from malformed JSON/text
        const extract = (key: string) => {
          const m = rawBody.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`, 'i'))
          return m ? m[1] : undefined
        }
        body = {
          name: extract('name'),
          phone: extract('phone'),
          email: extract('email'),
          source: extract('source'),
          campaign: extract('campaign'),
          brand: extract('brand'),
          city: extract('city'),
          brand_name: extract('brand_name'),
          urgency: extract('urgency'),
          // notes intentionally omitted - most likely the field that broke parsing
        }
        if (!body.phone) {
          return NextResponse.json(
            { error: `Invalid request body: ${parseErr.message}` },
            { status: 400 }
          )
        }
      }
    }

    const { name, phone, email, source, campaign, brand, city, brand_name, urgency, custom_fields } = body

    // Sanitize notes - trim, collapse newlines to spaces, strip non-printable chars
    let notes: string | null = null
    try {
      if (body.notes != null) {
        notes = String(body.notes)
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // strip non-printable (keep \n \r \t)
          .replace(/[\r\n]+/g, ' ')                             // newlines → single space
          .trim() || null
      }
    } catch {
      // notes malformed - proceed without it
      notes = null
    }

    if (!phone) {
      return NextResponse.json({ error: 'phone is required' }, { status: 400 })
    }

    const normalizedPhone = normalizePhone(phone)
    if (!normalizedPhone) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
    }

    // Map inbound source to an allowed touchpoint value
    // Constraint: web, whatsapp, voice, social, facebook, google, form, manual, pabbly, ads, referral, organic, meta_forms
    const sourceToTouchpoint: Record<string, string> = {
      facebook: 'meta_forms',
      'facebook forms': 'meta_forms',
      'facebook form': 'meta_forms',
      meta_forms: 'meta_forms',
      meta: 'meta_forms',
      fb: 'meta_forms',
      'fb forms': 'meta_forms',
      google: 'google',
      'google ads': 'google',
      website: 'web',
      web: 'web',
      form: 'form',
      manual: 'manual',
      pabbly: 'pabbly',
      whatsapp: 'whatsapp',
      voice: 'voice',
      social: 'social',
      ads: 'ads',
      referral: 'referral',
      organic: 'organic',
    }
    const normalizedSource = (source || '').toString().trim().toLowerCase()
    const leadSource = normalizedSource ? (sourceToTouchpoint[normalizedSource] || normalizedSource) : 'manual'
    const leadBrand = brand || process.env.NEXT_PUBLIC_BRAND || 'bcon'

    const supabase = getServiceClient() || getClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 })
    }

    const now = new Date().toISOString()
    let leadId: string
    let isNew = false

    // Parse Pabbly form fields into structured data
    const parsePabblyBool = (val: any): boolean | null => {
      if (val == null) return null
      const s = String(val).toLowerCase().trim()
      if (s.includes('yes') || s === 'true' || s === '1') return true
      if (s.includes('no') || s === 'false' || s === '0') return false
      return null
    }

    const cf = custom_fields || {}
    const formData: Record<string, any> = {}
    // "Do You Have Your Website Ready"
    const hasWebsiteRaw = cf['Do You Have Your Website Ready'] ?? cf['has_website'] ?? cf['website_ready']
    if (hasWebsiteRaw != null) formData.has_website = parsePabblyBool(hasWebsiteRaw)
    // "How Many Leads Can You Handle A Month"
    const monthlyLeadsRaw = cf['How Many Leads Can You Handle A Month'] ?? cf['monthly_leads'] ?? cf['leads_per_month']
    if (monthlyLeadsRaw != null) formData.monthly_leads = String(monthlyLeadsRaw).trim()
    // "How Fast Do You Want This Set Up"
    const urgencyRaw = cf['How Fast Do You Want This Set Up'] ?? cf['setup_urgency'] ?? urgency
    if (urgencyRaw != null) formData.urgency = String(urgencyRaw).trim().toLowerCase().replace(/\s+/g, '_')
    // "Do You Have Any AI Systems Running"
    const hasAiRaw = cf['Do You Have Any AI Systems Running'] ?? cf['has_ai_systems'] ?? cf['ai_systems']
    if (hasAiRaw != null) formData.has_ai_systems = parsePabblyBool(hasAiRaw)
    // Brand name
    if (brand_name) formData.brand_name = brand_name.trim()

    // Build inbound context fields
    const inboundContext: Record<string, any> = {}
    if (city) inboundContext.city = city.trim()
    if (brand_name) inboundContext.company = brand_name.trim()
    if (urgency) inboundContext.urgency = (urgencyRaw ? String(urgencyRaw).trim().toLowerCase().replace(/\s+/g, '_') : urgency?.trim())
    if (Object.keys(formData).length > 0) inboundContext.form_data = formData
    if (custom_fields && typeof custom_fields === 'object') {
      // Store raw custom_fields separately for reference
      inboundContext.raw_form_fields = custom_fields
    }

    // Check for existing lead
    const { data: existing } = await supabase
      .from('all_leads')
      .select('id, customer_name, unified_context')
      .eq('customer_phone_normalized', normalizedPhone)
      .maybeSingle()

    if (existing) {
      // Update existing - don't overwrite name if already set
      const updates: Record<string, any> = {
        last_interaction_at: now,
        last_touchpoint: leadSource,
      }
      if (email) updates.email = email.trim().toLowerCase()
      if (name && !existing.customer_name) updates.customer_name = name.trim()

      // Merge inbound context into unified_context
      if (Object.keys(inboundContext).length > 0) {
        const existingCtx = existing.unified_context || {}
        // Track lead_sources array (ordered path: meta_forms → whatsapp etc.)
        const existingSources: string[] = existingCtx.lead_sources || []
        if (!existingSources.includes(leadSource)) {
          inboundContext.lead_sources = [...existingSources, leadSource]
        }
        updates.unified_context = { ...existingCtx, ...inboundContext }
      }

      await supabase.from('all_leads').update(updates).eq('id', existing.id)
      leadId = existing.id
    } else {
      // Create new lead
      const { data: created, error: createErr } = await supabase
        .from('all_leads')
        .insert({
          customer_name: name?.trim() || null,
          email: email?.trim().toLowerCase() || null,
          phone,
          customer_phone_normalized: normalizedPhone,
          brand: leadBrand,
          first_touchpoint: leadSource,
          last_touchpoint: leadSource,
          last_interaction_at: now,
          lead_stage: 'New',
          ...(Object.keys(inboundContext).length > 0 ? { unified_context: { ...inboundContext, lead_sources: [leadSource] } } : { unified_context: { lead_sources: [leadSource] } }),
        })
        .select('id')
        .single()

      if (createErr) {
        // Duplicate race condition - fetch existing
        if (createErr.code === '23505' || createErr.message?.includes('duplicate')) {
          const { data: dup } = await supabase
            .from('all_leads')
            .select('id')
            .eq('customer_phone_normalized', normalizedPhone)
            .maybeSingle()
          if (dup) {
            leadId = dup.id
          } else {
            throw createErr
          }
        } else {
          throw createErr
        }
      } else {
        leadId = created.id
        isNew = true
      }
    }

    // Create first_outreach task
    const leadName = name?.trim() || existing?.customer_name || 'Lead'
    const { error: taskErr } = await supabase.from('agent_tasks').insert({
      task_type: 'first_outreach',
      task_description: `First outreach to ${leadName} from ${leadSource}${campaign ? ` (${campaign})` : ''}`,
      lead_id: leadId,
      lead_phone: normalizedPhone,
      lead_name: leadName,
      status: 'pending',
      scheduled_at: now,
      metadata: {
        source: leadSource,
        campaign: campaign || null,
        notes: notes || null,
        inbound: true,
        city: city?.trim() || null,
        brand_name: brand_name?.trim() || null,
        urgency: urgency?.trim() || null,
        custom_fields: custom_fields || null,
      },
      created_at: now,
    })

    if (taskErr) {
      console.error('[inbound] Failed to create first_outreach task:', taskErr.message)
    }

    return NextResponse.json({
      success: true,
      lead_id: leadId,
      is_new: isNew,
      task_created: !taskErr,
    })
  } catch (error: any) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : error?.message || error?.details || JSON.stringify(error) || 'Unknown error'
    console.error('[inbound] Error:', message, error)
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
