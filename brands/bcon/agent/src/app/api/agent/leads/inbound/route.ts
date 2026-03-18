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

    const body = await request.json()
    const { name, phone, email, source, campaign, notes, brand, city, brand_name, urgency, custom_fields } = body

    if (!phone) {
      return NextResponse.json({ error: 'phone is required' }, { status: 400 })
    }

    const normalizedPhone = normalizePhone(phone)
    if (!normalizedPhone) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
    }

    const validSources = ['facebook', 'google', 'website', 'form', 'manual']
    const leadSource = validSources.includes(source) ? source : 'manual'
    const leadBrand = brand || process.env.NEXT_PUBLIC_BRAND || 'bcon'

    const supabase = getServiceClient() || getClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 })
    }

    const now = new Date().toISOString()
    let leadId: string
    let isNew = false

    // Build inbound context fields
    const inboundContext: Record<string, any> = {}
    if (city) inboundContext.city = city.trim()
    if (brand_name) inboundContext.company = brand_name.trim()
    if (urgency) inboundContext.urgency = urgency.trim()
    if (custom_fields && typeof custom_fields === 'object') inboundContext.form_data = custom_fields

    // Check for existing lead
    const { data: existing } = await supabase
      .from('all_leads')
      .select('id, customer_name, unified_context')
      .eq('customer_phone_normalized', normalizedPhone)
      .maybeSingle()

    if (existing) {
      // Update existing — don't overwrite name if already set
      const updates: Record<string, any> = {
        last_interaction_at: now,
        last_touchpoint: leadSource,
      }
      if (email) updates.email = email.trim().toLowerCase()
      if (name && !existing.customer_name) updates.customer_name = name.trim()

      // Merge inbound context into unified_context
      if (Object.keys(inboundContext).length > 0) {
        const existingCtx = existing.unified_context || {}
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
          ...(Object.keys(inboundContext).length > 0 ? { unified_context: inboundContext } : {}),
        })
        .select('id')
        .single()

      if (createErr) {
        // Duplicate race condition — fetch existing
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
  } catch (error) {
    console.error('[inbound] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
