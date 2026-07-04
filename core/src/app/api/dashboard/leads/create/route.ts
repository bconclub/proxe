import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getServiceClient,
  normalizePhone,
  buildAttribution,
  isLikelyRealPersonName,
  sendWelcomeTemplate,
  pickWelcomeTemplate,
  logMessage,
} from '@/lib/services'
import { BRAND_ID } from '@/configs'

export const dynamic = 'force-dynamic'

/**
 * POST /api/dashboard/leads/create
 *
 * Manual "Add Lead" from the dashboard — either typed in by hand or prefilled
 * from a WhatsApp screenshot (the extract-screenshot route reads the image,
 * the operator reviews, then this saves it).
 *
 * Dedup is by (normalized phone, brand): if the lead already exists we UPDATE
 * it (fill blanks, append the note) rather than create a duplicate. This is
 * what makes "add a screenshot to update that lead" work — re-adding a known
 * number lands on the existing record.
 *
 * Optional `send_welcome`: fire the Meta-approved welcome template to the lead.
 * Templates are allowed for cold outreach (no 24h window needed), so this is a
 * safe, explicit, operator-triggered first touch.
 *
 * Auth: logged-in Supabase session. Write uses the service client (RLS bypass,
 * same as every other dashboard write).
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
    const courseInterest = clean(body.course_interest)
    const userType = clean(body.user_type).toLowerCase()
    const education = clean(body.education)
    // Agency-business intake (bcon/pop AddLeadModal) — only those brands send these.
    const businessName = clean(body.business_name)
    const businessType = clean(body.business_type)
    const serviceInterest = clean(body.service_interest)
    const websiteStatus = clean(body.website_status)
    const leadVolume = clean(body.lead_volume)
    const urgency = clean(body.urgency)
    const note = clean(body.note)
    const sendWelcome = body.send_welcome === true

    if (!phoneRaw) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 })
    }
    const normalizedPhone = normalizePhone(phoneRaw)
    if (!normalizedPhone) {
      return NextResponse.json({ error: 'Invalid phone number format' }, { status: 400 })
    }

    // Only persist a name that looks like a real person — never a referral code
    // or a phone number that slipped into the name field. (Same guard the Meta
    // form lead path uses.)
    const cleanName = name && isLikelyRealPersonName(name) ? name : ''

    const supabase = getServiceClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 })
    }

    const brand = BRAND_ID
    const now = new Date().toISOString()
    const createdBy = user.email || 'system'

    // Build the note object once (if any) — stored in unified_context.admin_notes[]
    // and the activities table, the same shape the Notes tab + admin-notes route use.
    const noteObj = note
      ? {
          id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          text: note,
          created_by: createdBy,
          created_at: now,
        }
      : null

    // Brand-namespaced context powers the dashboard TYPE / COURSE / city / education.
    const brandCtx: Record<string, any> = {}
    if (city) brandCtx.city = city
    if (courseInterest) brandCtx.course_interest = courseInterest
    if (education) brandCtx.education = education
    if (['student', 'parent', 'professional', 'early_stage'].includes(userType)) {
      brandCtx.user_type = userType
    }
    // bcon/pop agency-business fields — same shape conversation-intelligence writes.
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
      const manualBlock = {
        ...(existingCtx.manual || {}),
        added_via: 'dashboard',
        updated_at: now,
      }
      const existingNotes: any[] = existingCtx.admin_notes || []

      const updates: Record<string, any> = {
        last_touchpoint: 'manual',
        last_interaction_at: now,
        unified_context: {
          ...existingCtx,
          ...(Object.keys(mergedBrandCtx).length > 0 ? { [brand]: mergedBrandCtx } : {}),
          manual: manualBlock,
          ...(noteObj ? { admin_notes: [...existingNotes, noteObj] } : {}),
          // Attribution is immutable — keep whatever the lead already had.
          attribution: existingCtx.attribution ?? buildAttribution({ formType: 'manual', channel: 'manual' }),
        },
      }
      // Only fill blanks — never overwrite a real existing name/email.
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
            manual: {
              added_via: 'dashboard',
              created_at: now,
            },
            ...(noteObj ? { admin_notes: [noteObj] } : {}),
            lead_sources: ['manual'],
            attribution: buildAttribution({ formType: 'manual', channel: 'manual' }),
          },
        })
        .select('id')
        .single()

      if (insErr || !created) {
        // Lost a race to a concurrent insert — fall back to the existing row.
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

    // Mirror the note into the activities table so it shows in the Notes tab
    // (same dual-write the admin-notes route does). Non-fatal on failure.
    if (noteObj) {
      const { error: actErr } = await supabase.from('activities').insert({
        lead_id: leadId,
        activity_type: 'note',
        // created_by is a UUID column — user id or null, never email/'system'.
        created_by: user.id || null,
        note: noteObj.text,
      })
      if (actErr) console.error('[leads/create] activity note failed:', actErr.message)
    }

    // ── Optional welcome message ──────────────────────────────────────────────
    // Fires the Meta-approved welcome template (allowed cold). Soft-fail: a send
    // failure never blocks the lead from being saved — we just report it.
    let welcomeSent = false
    let welcomeError: string | null = null
    if (sendWelcome) {
      try {
        // Pilot vs generic by the course interest / note picked on the form.
        const welcomeTpl = pickWelcomeTemplate(courseInterest, note, userType)
        const result = await sendWelcomeTemplate(phoneRaw, cleanName, welcomeTpl)
        welcomeSent = result.success
        if (!result.success) {
          welcomeError = result.error || 'send failed'
          console.error('[leads/create] welcome send failed:', welcomeError)
        } else {
          const firstName = (cleanName || 'there').split(' ')[0]
          await logMessage(
            leadId,
            'whatsapp',
            'agent',
            `Hey ${firstName}! (${welcomeTpl} template)`,
            'template',
            {
              source: 'dashboard_add_lead',
              template_name: welcomeTpl,
              sent_by: createdBy,
              trigger: 'manual_welcome',
            },
            supabase,
          )
        }
      } catch (err: any) {
        welcomeError = err?.message || String(err)
        console.error('[leads/create] welcome send exception:', welcomeError)
      }
    }

    return NextResponse.json({ success: true, lead_id: leadId, is_new: isNew, welcome_sent: welcomeSent, welcome_error: welcomeError })
  } catch (error: any) {
    console.error('[leads/create] Error:', error?.message || error)
    return NextResponse.json({ error: 'Failed to add lead' }, { status: 500 })
  }
}
