import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getServiceClient,
  normalizePhone,
  buildAttribution,
} from '@/lib/services'
import { isLikelyRealPersonName } from '@/lib/agent-core/conversationIntelligence'

export const dynamic = 'force-dynamic'

/**
 * POST /api/dashboard/leads/create
 *
 * Manual "Add Lead" from the dashboard — typed by hand or prefilled from a
 * screenshot (the extract-screenshot route reads the image, the operator
 * reviews, then this saves it).
 *
 * Dedup is by (normalized phone, brand): if the lead already exists we UPDATE
 * it (fill blanks, append the note) rather than create a duplicate — so
 * re-adding a known number lands on the existing record.
 *
 * BCON fields (B2B + FB-form): name, phone (required), email, city,
 * business_name, business_type, service_interest, website_status, lead_volume,
 * urgency, note. (send_welcome is a follow-up — BCON's welcome-template send
 * helper isn't wired yet.)
 *
 * Auth: logged-in Supabase session. Write uses the service client (RLS bypass).
 */
export async function POST(request: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const clean = (v: any): string => (v == null ? '' : String(v).trim())
    const name = clean(body.name)
    const phoneRaw = clean(body.phone)
    const email = clean(body.email).toLowerCase()
    const city = clean(body.city)
    const businessName = clean(body.business_name)
    const businessType = clean(body.business_type)
    const serviceInterest = clean(body.service_interest)
    const websiteStatus = clean(body.website_status)
    const leadVolume = clean(body.lead_volume)
    const urgency = clean(body.urgency)
    const note = clean(body.note)

    if (!phoneRaw) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 })
    }
    const normalizedPhone = normalizePhone(phoneRaw)
    if (!normalizedPhone) {
      return NextResponse.json({ error: 'Invalid phone number format' }, { status: 400 })
    }

    // Only persist a name that looks like a real person — never a code or a
    // phone that slipped into the name field. (Same guard the lead paths use.)
    const cleanName = name && isLikelyRealPersonName(name) ? name : ''

    const supabase = getServiceClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 })
    }

    const brand = process.env.NEXT_PUBLIC_BRAND || 'bcon'
    const now = new Date().toISOString()
    const createdBy = user.email || 'system'

    const noteObj = note
      ? {
          id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          text: note,
          created_by: createdBy,
          created_at: now,
        }
      : null

    // Brand-namespaced context powers the dashboard fields (business, service,
    // city, etc.) — the same shape conversation-intelligence writes.
    const brandCtx: Record<string, any> = {}
    if (city) brandCtx.city = city
    if (businessName) brandCtx.business_name = businessName
    if (businessType) brandCtx.business_type = businessType
    if (serviceInterest) brandCtx.service_interest = serviceInterest
    if (websiteStatus) brandCtx.website_status = websiteStatus
    if (leadVolume) brandCtx.lead_volume = leadVolume
    if (urgency) brandCtx.urgency = urgency

    // ── Dedup by (phone, brand) ───────────────────────────────────────────────
    const { data: existing } = await supabase
      .from('all_leads')
      .select('id, customer_name, email, unified_context')
      .eq('customer_phone_normalized', normalizedPhone)
      .eq('brand', brand)
      .maybeSingle()

    let leadId: string
    let isNew = false

    if (existing) {
      const existingCtx = existing.unified_context || {}
      const mergedBrandCtx = { ...(existingCtx[brand] || {}), ...brandCtx }
      const manualBlock = { ...(existingCtx.manual || {}), added_via: 'dashboard', updated_at: now }
      const existingNotes: any[] = existingCtx.admin_notes || []

      const updates: Record<string, any> = {
        last_touchpoint: 'manual',
        last_interaction_at: now,
        unified_context: {
          ...existingCtx,
          ...(Object.keys(mergedBrandCtx).length > 0 ? { [brand]: mergedBrandCtx } : {}),
          manual: manualBlock,
          ...(noteObj ? { admin_notes: [...existingNotes, noteObj] } : {}),
          attribution: existingCtx.attribution ?? buildAttribution({ formType: 'manual', channel: 'manual' } as any),
        },
      }
      if (cleanName && !existing.customer_name) updates.customer_name = cleanName
      if (email && !existing.email) updates.email = email

      const { error: updErr } = await supabase.from('all_leads').update(updates).eq('id', existing.id)
      if (updErr) {
        console.error('[leads/create] update failed:', updErr.message)
        return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 })
      }
      leadId = existing.id
    } else {
      const { data: created, error: insErr } = await supabase
        .from('all_leads')
        .insert({
          customer_name: cleanName || null,
          email: email || null,
          phone: phoneRaw,
          customer_phone_normalized: normalizedPhone,
          brand,
          first_touchpoint: 'manual',
          last_touchpoint: 'manual',
          last_interaction_at: now,
          lead_stage: 'New',
          unified_context: {
            ...(Object.keys(brandCtx).length > 0 ? { [brand]: brandCtx } : {}),
            manual: { added_via: 'dashboard', created_at: now },
            ...(noteObj ? { admin_notes: [noteObj] } : {}),
            lead_sources: ['manual'],
            attribution: buildAttribution({ formType: 'manual', channel: 'manual' } as any),
          },
        })
        .select('id')
        .single()

      if (insErr || !created) {
        if (insErr?.code === '23505' || insErr?.message?.includes('duplicate')) {
          const { data: dup } = await supabase
            .from('all_leads')
            .select('id')
            .eq('customer_phone_normalized', normalizedPhone)
            .eq('brand', brand)
            .maybeSingle()
          if (dup) {
            leadId = dup.id
          } else {
            return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 })
          }
        } else {
          console.error('[leads/create] insert failed:', insErr?.message)
          return NextResponse.json(
            { error: `Failed to create lead${insErr?.message ? `: ${insErr.message}` : ''}` },
            { status: 500 },
          )
        }
      } else {
        leadId = created.id
        isNew = true
      }
    }

    // Mirror the note into activities so it shows in the Notes tab. Non-fatal.
    if (noteObj) {
      const { error: actErr } = await supabase.from('activities').insert({
        lead_id: leadId,
        activity_type: 'note',
        note: noteObj.text,
        created_by: createdBy,
      })
      if (actErr) console.error('[leads/create] activity note failed:', actErr.message)
    }

    return NextResponse.json({ success: true, lead_id: leadId, is_new: isNew })
  } catch (error: any) {
    console.error('[leads/create] Error:', error?.message || error)
    return NextResponse.json({ error: 'Failed to add lead' }, { status: 500 })
  }
}
