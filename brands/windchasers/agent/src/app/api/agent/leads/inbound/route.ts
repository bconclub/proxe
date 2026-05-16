import { NextRequest, NextResponse } from 'next/server'
import {
  getServiceClient,
  getClient,
  normalizePhone,
  createCalendarEvent,
  sendFirstOutreach,
  sendDemoBookedConfirmation,
  sendPATResult,
} from '@/lib/services'

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
    const VALID_TOUCHPOINTS = new Set(['web','whatsapp','voice','social','facebook','google','form','manual','pabbly','ads','referral','organic','meta_forms'])
    const mappedSource = normalizedSource ? (sourceToTouchpoint[normalizedSource] || normalizedSource) : 'manual'
    // Fall back to 'form' for any value not in the channel_type enum (e.g. 'pat', 'guide_download').
    // The original raw source is preserved in agent_tasks.metadata.source below.
    const leadSource = VALID_TOUCHPOINTS.has(mappedSource) ? mappedSource : 'form'
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

    // ── Brand-namespaced context (powers dashboard TYPE / COURSE columns) ───
    // The dashboard reads unified_context[leadBrand].user_type and
    // .course_interest — without this the columns stay blank even though we
    // have the data in custom_fields.
    const brandCtxData: Record<string, any> = {}
    const cf2 = (custom_fields || {}) as Record<string, any>
    const audienceRaw = String(cf2.audience || cf2.user_type || '').toLowerCase().trim()
    if (
      audienceRaw === 'student' ||
      audienceRaw === 'parent' ||
      audienceRaw === 'professional' ||
      audienceRaw === 'early_stage'
    ) {
      brandCtxData.user_type = audienceRaw
    }
    if (leadBrand === 'windchasers') {
      // Map the interest value the form sends to the short course label the
      // dashboard's filter dropdown uses (DGCA / Flight / Heli / Cabin / Drone).
      const interestRaw = String(cf2.interest || cf2.course_interest || '').toLowerCase().trim()
      const courseMap: Record<string, string> = {
        dgca_ground: 'DGCA',
        dgca: 'DGCA',
        pilot_training_abroad: 'Flight',
        flight: 'Flight',
        helicopter_license: 'Heli',
        helicopter: 'Heli',
        heli: 'Heli',
        cabin_crew: 'Cabin',
        cabin: 'Cabin',
        drone: 'Drone',
      }
      if (interestRaw && courseMap[interestRaw]) {
        brandCtxData.course_interest = courseMap[interestRaw]
      } else if (interestRaw && interestRaw !== 'other') {
        brandCtxData.course_interest = interestRaw.charAt(0).toUpperCase() + interestRaw.slice(1)
      }
      const demoTypeRaw = String(cf2.demo_type || '').toLowerCase().trim()
      if (demoTypeRaw) brandCtxData.session_type = demoTypeRaw
      const educationRaw = String(cf2.education || '').toLowerCase().trim()
      if (educationRaw) brandCtxData.education = educationRaw

      // ── PAT (Pilot Aptitude Test) submission ──────────────────────────────
      // total_score is 0–150. Tier is RE-DERIVED on the server from total_score
      // (never trust the client) using the official cutoffs:
      //   140+ premium · 120+ strong · 90+ moderate · 0+ not-ready
      // See docs/pat-scoring.md for the full spec.
      const isPat =
        normalizedSource === 'pat' ||
        String(cf2.form_type || '').toLowerCase() === 'pilot_aptitude_test'
      if (isPat) {
        const total = Number(cf2.total_score)
        if (!isNaN(total)) {
          brandCtxData.pat_score = total
          brandCtxData.pat_score_100 = Math.round((total * 100) / 150)
          // Server-derived tier — authoritative
          const derivedTier =
            total >= 140 ? 'premium' :
            total >= 120 ? 'strong' :
            total >= 90  ? 'moderate' :
                           'not-ready'
          brandCtxData.pat_tier = derivedTier
          // Log client-sent tier for comparison (not stored on lead)
          const clientTier = String(cf2.tier || '').toLowerCase().trim()
          if (clientTier && clientTier !== derivedTier) {
            console.warn(`[inbound/pat] Tier mismatch: client="${clientTier}" derived="${derivedTier}" score=${total}`)
          }
        }
        const qual = Number(cf2.qualification_score)
        if (!isNaN(qual)) brandCtxData.pat_qualification_score = qual
        const apt = Number(cf2.aptitude_score)
        if (!isNaN(apt)) brandCtxData.pat_aptitude_score = apt
        const rdy = Number(cf2.readiness_score)
        if (!isNaN(rdy)) brandCtxData.pat_readiness_score = rdy
        if (cf2.eligible_class_12_pass != null) {
          brandCtxData.pat_eligible_class_12_pass = !!cf2.eligible_class_12_pass
        }
        brandCtxData.pat_max_score = 150
        brandCtxData.pat_completed_at = now
      }
    }
    if (Object.keys(brandCtxData).length > 0) {
      inboundContext[leadBrand] = brandCtxData
    }

    // Check for existing lead — scope to brand because the same phone can
    // exist across brands (e.g. someone is a lead for both bcon and
    // windchasers). Without the brand filter, .maybeSingle() returns null
    // when multiple brands have this phone, sending us into the insert path
    // and tripping the (phone, brand) unique constraint.
    const { data: existing } = await supabase
      .from('all_leads')
      .select('id, customer_name, unified_context')
      .eq('customer_phone_normalized', normalizedPhone)
      .eq('brand', leadBrand)
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
        // Shallow merge would overwrite existingCtx[leadBrand] with the new
        // brandCtxData, wiping any course/type the chat widget had set.
        // Deep-merge the brand-namespace object specifically.
        const mergedBrandCtx = inboundContext[leadBrand]
          ? { ...(existingCtx[leadBrand] || {}), ...inboundContext[leadBrand] }
          : existingCtx[leadBrand]
        updates.unified_context = {
          ...existingCtx,
          ...inboundContext,
          ...(mergedBrandCtx ? { [leadBrand]: mergedBrandCtx } : {}),
        }
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
        // Duplicate race condition or pre-existing row the first lookup
        // missed - the unique constraint is on (phone, brand) so look up by
        // exactly that shape. Fall back to (customer_phone_normalized, brand)
        // in case the existing row's raw `phone` column was stored in a
        // different format.
        if (createErr.code === '23505' || createErr.message?.includes('duplicate')) {
          let dupId: string | null = null

          const { data: dupByPhone } = await supabase
            .from('all_leads')
            .select('id')
            .eq('phone', phone)
            .eq('brand', leadBrand)
            .maybeSingle()
          if (dupByPhone) dupId = dupByPhone.id

          if (!dupId) {
            const { data: dupByNormalized } = await supabase
              .from('all_leads')
              .select('id')
              .eq('customer_phone_normalized', normalizedPhone)
              .eq('brand', leadBrand)
              .maybeSingle()
            if (dupByNormalized) dupId = dupByNormalized.id
          }

          if (dupId) {
            leadId = dupId
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
        original_source: normalizedSource || null,
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

    // ── Detect submission type for routing the right template ────────────────
    const cfields = (custom_fields || {}) as Record<string, any>
    const isDemoBooking =
      String(notes || '').toLowerCase() === 'demo_booked' ||
      String(cfields.event_name || '').toLowerCase() === 'demo_booked' ||
      String(cfields.form_type || '').toLowerCase() === 'demo_booked'
    const isPatSubmission =
      normalizedSource === 'pat' ||
      String(cfields.form_type || '').toLowerCase() === 'pilot_aptitude_test'

    // ── PAT result → fires immediately (no calendar dependency) ──────────────
    // Demo confirmations are sent AFTER the calendar event below so we have
    // the meet link. Generic outreach is sent only for new leads that are
    // NEITHER a PAT submission NOR a demo booking.
    if (phone && isPatSubmission) {
      const score = Number(cfields.total_score)
      const tier = String(cfields.tier || '')
      if (!isNaN(score)) {
        sendPATResult(phone, leadName, score, tier)
          .then((result) => {
            if (result.success) {
              supabase.from('conversations').insert({
                lead_id: leadId,
                channel: 'whatsapp',
                sender: 'agent',
                content: `[Template: windchasers_pat_result] PAT result for ${leadName.split(' ')[0]} — ${score}/150 (${tier})`,
                message_type: 'template',
                metadata: { template_name: 'windchasers_pat_result', auto_sent: true, trigger: 'pat_completed', score, tier },
              }).catch(() => {})
              console.log(`[inbound] PAT result WA sent to ${phone} (lead: ${leadId}) score=${score} tier=${tier}`)
            } else {
              console.error(`[inbound] PAT result WA failed for ${phone}:`, result.error)
            }
          })
          .catch((err) => console.error('[inbound] PAT result WA error:', err))
      }
    } else if (isNew && phone && !isDemoBooking) {
      // Generic welcome — only for brand-new leads that aren't a demo/PAT.
      sendFirstOutreach(phone, leadName)
        .then((result) => {
          if (result.success) {
            supabase.from('conversations').insert({
              lead_id: leadId,
              channel: 'whatsapp',
              sender: 'agent',
              content: `[Template: windchasers_followup] Hi ${leadName.split(' ')[0]}!`,
              message_type: 'template',
              metadata: { template_name: 'windchasers_followup', auto_sent: true, trigger: 'inbound_first_outreach' },
            }).catch(() => {})
            console.log(`[inbound] First outreach WA sent to ${phone} (lead: ${leadId})`)
          } else {
            console.error(`[inbound] First outreach WA failed for ${phone}:`, result.error)
          }
        })
        .catch((err) => console.error('[inbound] First outreach WA error:', err))
    }

    const preferredDate = cfields.preferred_date || cfields.preferredDate || null
    const preferredTime = cfields.preferred_time || cfields.preferredTime || null

    let calendarResult: { eventId: string; eventLink: string } | null = null
    let calendarError: string | null = null
    let demoMeetLink: string | null = null

    if (isDemoBooking && preferredDate && preferredTime) {
      try {
        // Dedupe: if the lead already has a booking at this exact slot, skip.
        const { data: leadRow } = await supabase
          .from('all_leads')
          .select('unified_context')
          .eq('id', leadId)
          .maybeSingle()

        const existingBooking = leadRow?.unified_context?.web?.booking || {}
        const sameSlot =
          existingBooking?.eventId &&
          existingBooking?.date === preferredDate &&
          existingBooking?.time === preferredTime

        if (sameSlot) {
          console.log(`[inbound] Demo already booked for ${leadId} at ${preferredDate} ${preferredTime}, skipping calendar create`)
          calendarResult = {
            eventId: existingBooking.eventId,
            eventLink: existingBooking.eventLink || '',
          }
          demoMeetLink = existingBooking.meetLink || null
        } else {
          const event = await createCalendarEvent({
            date: preferredDate,
            time: preferredTime,
            name: leadName,
            email: email?.trim() || undefined,
            phone,
            courseInterest: cfields.interest || cfields.course_interest || undefined,
            sessionType: cfields.demo_type || 'Demo Session',
          })

          if (!event) {
            calendarError = 'createCalendarEvent returned null (likely missing Google credentials)'
            console.error('[inbound]', calendarError)
          } else {
            calendarResult = {
              eventId: event.eventId,
              eventLink: event.eventLink,
            }
            demoMeetLink = event.meetLink || null

            // Re-fetch unified_context (might have changed since the merge above)
            // and stamp the booking on it.
            const { data: refreshed } = await supabase
              .from('all_leads')
              .select('unified_context')
              .eq('id', leadId)
              .maybeSingle()
            const ctx = refreshed?.unified_context || {}
            const updatedCtx = {
              ...ctx,
              web: {
                ...(ctx.web || {}),
                booking_date: preferredDate,
                booking_time: preferredTime,
                booking_status: 'confirmed',
                booking: {
                  date: preferredDate,
                  time: preferredTime,
                  status: 'confirmed',
                  eventId: event.eventId,
                  eventLink: event.eventLink,
                  meetLink: event.meetLink || null,
                  hasAttendees: event.hasAttendees,
                  source: 'inbound_demo_form',
                  created_at: new Date().toISOString(),
                },
              },
            }
            await supabase
              .from('all_leads')
              .update({ unified_context: updatedCtx })
              .eq('id', leadId)
          }
        }
      } catch (calErr: any) {
        calendarError = calErr?.message || String(calErr)
        console.error('[inbound] Calendar event creation failed:', calendarError)
        // Swallow — lead is already saved.
      }
    }

    // ── Demo booking confirmation WhatsApp ───────────────────────────────────
    // Sent AFTER the calendar event so we have the meet link for the URL button.
    // Fires for every demo booking (new or returning lead).
    if (isDemoBooking && phone && preferredDate && preferredTime) {
      try {
        const dateObj = new Date(`${preferredDate}T${preferredTime}+05:30`)
        const dateDisplay = dateObj.toLocaleDateString('en-IN', {
          weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata',
        })
        const [h, m] = preferredTime.toString().split(':').map(Number)
        const period = h >= 12 ? 'PM' : 'AM'
        const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h
        const timeDisplay = `${hour12}:${(m || 0).toString().padStart(2, '0')} ${period} IST`

        sendDemoBookedConfirmation(phone, leadName, dateDisplay, timeDisplay, demoMeetLink)
          .then((result) => {
            if (result.success) {
              supabase.from('conversations').insert({
                lead_id: leadId,
                channel: 'whatsapp',
                sender: 'agent',
                content: `[Template: windchasers_demo_booked] Demo confirmed for ${leadName.split(' ')[0]} on ${dateDisplay} at ${timeDisplay}`,
                message_type: 'template',
                metadata: {
                  template_name: 'windchasers_demo_booked',
                  auto_sent: true,
                  trigger: 'demo_booked',
                  date: preferredDate,
                  time: preferredTime,
                  meet_link: demoMeetLink,
                },
              }).catch(() => {})
              console.log(`[inbound] Demo confirmation WA sent to ${phone} (lead: ${leadId})`)
            } else {
              console.error(`[inbound] Demo confirmation WA failed for ${phone}:`, result.error)
            }
          })
          .catch((err) => console.error('[inbound] Demo confirmation WA error:', err))
      } catch (waErr: any) {
        console.error('[inbound] Demo confirmation prep failed:', waErr?.message || waErr)
      }
    }

    return NextResponse.json({
      success: true,
      lead_id: leadId,
      is_new: isNew,
      task_created: !taskErr,
      ...(isDemoBooking
        ? {
            calendar: calendarResult
              ? {
                  event_id: calendarResult.eventId,
                  event_link: calendarResult.eventLink,
                }
              : null,
            calendar_error: calendarError,
          }
        : {}),
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
