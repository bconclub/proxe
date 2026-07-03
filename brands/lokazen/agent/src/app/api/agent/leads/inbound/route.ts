import { NextRequest, NextResponse } from 'next/server'
import {
  getServiceClient,
  getClient,
  normalizePhone,
  createCalendarEvent,
  sendDemoConfirmation,
  sendPATResult,
  buildAttribution,
  renderPATResultBody,
  renderDemoOnlineBody,
  renderDemoOfflineBody,
  TIER_LABELS,
  TIER_MESSAGES,
  TEMPLATE_HEADERS,
  TEMPLATE_BUTTONS,
  notifySlackLead,
  sendWhatsAppTemplate,
} from '@/lib/services'
import type { DemoFormat } from '@/lib/services'
import { BRAND_ID } from '@/configs'

export const dynamic = 'force-dynamic'

// Scout onboarding URL used in the scout_welcome WhatsApp template ({{2}}).
const LOKAZEN_SCOUT_ONBOARDING_URL =
  process.env.NEXT_PUBLIC_LOKAZEN_SCOUT_ONBOARDING_URL || 'https://www.lokazen.in/scout#scout-form'

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
    const leadBrand = brand || BRAND_ID

    // The lokazen all_leads.first_touchpoint CHECK constraint only permits the
    // base channels (web/whatsapp/voice/social). A form/ads/meta_forms/manual
    // source would fail the INSERT and the lead would be LOST — the exact reason
    // onboarding/ad leads weren't arriving. Coerce the value we WRITE to an
    // allowed channel; the true source is still preserved in unified_context.
    // attribution + agent_tasks.metadata.original_source. (Scoped to lokazen so
    // brands with a wider constraint keep full touchpoint fidelity.)
    const DB_ALLOWED_TOUCHPOINTS = new Set(['web', 'whatsapp', 'voice', 'social'])
    const storedTouchpoint =
      leadBrand === 'lokazen' && !DB_ALLOWED_TOUCHPOINTS.has(leadSource) ? 'web' : leadSource

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

    // ── Lokazen: map Brand Onboarding / Property Owner Onboarding form fields ──
    // The lokazen.in onboarding forms (BrandOnboardingForm / PropertyOwner
    // OnboardingForm) POST rich details, but without this mapping they only
    // land in raw_form_fields and the dashboard's PROPERTY TYPE / SIZE / zone
    // columns (which read unified_context.lokazen.*) stay blank. We read the
    // form's own key names AND common aliases so it survives light renaming.
    if (leadBrand === 'lokazen') {
      const pick = (...keys: string[]) => {
        for (const k of keys) {
          const v = cf2[k] ?? (body as Record<string, any>)[k]
          if (v != null && String(v).trim() !== '') return v
        }
        return null
      }
      const asStr = (v: any) => (v == null ? null : String(Array.isArray(v) ? v.join(', ') : v).trim() || null)
      // The lokazen.in website posts user_type "seeker" (wants space = brand)
      // and "provider" (lists space = owner). Handle those FIRST, then the
      // generic words, so real payloads classify correctly.
      const asType = (v: any): 'brand' | 'owner' | null => {
        const s = String(v || '').toLowerCase().trim()
        if (!s) return null
        if (s.includes('seeker') || s.includes('brand') || s.includes('tenant')) return 'brand'
        if (s.includes('provider') || s.includes('owner') || s.includes('property') || s.includes('landlord') || s.includes('list')) return 'owner'
        if (s.includes('space')) return 'brand'
        return null
      }

      // Scout is deterministic: the website scout routes post user_type='scout'
      // (and/or source/lead_source containing "scout") plus a scout_event tag for
      // the lifecycle step. Scout is checked FIRST and short-circuits the
      // brand/owner inference so a scout never gets misclassified.
      const rawTypeStr = String(
        pick('user_type', 'audience', 'lead_type', 'onboarding_type', 'type', 'form_type', 'event_name', 'lead_source') ||
        normalizedSource || '',
      ).toLowerCase()
      const isScout = /\bscout\b/.test(rawTypeStr)
      const scoutEvent = asStr(pick('scout_event', 'lifecycle_event', 'scout_stage'))

      // Resolve audience (brand vs owner). Explicit type field wins; else infer
      // from the form_type/event_name/lead_source/source, else field presence.
      let lkzType: 'brand' | 'owner' | 'scout' | null = isScout
        ? 'scout'
        : asType(pick('user_type', 'audience', 'lead_type', 'onboarding_type', 'type')) ||
          asType(pick('form_type', 'event_name', 'lead_source')) ||
          asType(normalizedSource)

      // Field presence fallback (only if the type is still unknown). current_outlets
      // => brand; carpet/asking-rent => owner. space_type/area_sqft/budget_rent are
      // sent by BOTH sides so they don't discriminate.
      const hasPropFields = !!pick('propertyType', 'property_type', 'spaceTypes', 'space_types', 'carpetArea', 'carpet_area', 'asking_rent', 'monthly_rent')
      const hasBrandFields = !!pick('brandName', 'brand_name', 'outlets', 'current_outlets', 'sizeMin', 'size_min', 'rentMin', 'rent_min')
      if (!lkzType) lkzType = hasPropFields ? 'owner' : hasBrandFields ? 'brand' : null

      if (lkzType === 'scout') {
        brandCtxData.user_type = 'scout'
        brandCtxData.lead_type = 'scout'
        if (scoutEvent) brandCtxData.scout_event = scoutEvent
        const area = asStr(pick('scout_area', 'area_covered', 'coverage_area', 'area', 'location'))
        if (area) brandCtxData.scout_area_covered = area
        const kyc = asStr(pick('kyc_status'))
        if (kyc) brandCtxData.kyc_status = kyc
        const subArea = asStr(pick('submission_area', 'property_area'))
        if (subArea) brandCtxData.last_submission_area = subArea
        const payout = asStr(pick('payout_amount', 'amount'))
        if (payout) brandCtxData.last_payout_amount = payout
        // The website forwards the exact deep-link it would have texted (portal /
        // profile / submit, already carrying the scout's submission_token) plus
        // the UPI on the upi_added step. PROXe re-uses these so the message links
        // land the scout on the right page without PROXe needing the token.
        const scoutUrl = asStr(pick('scout_url', 'portal_url', 'profile_url', 'submit_url', 'deep_link'))
        if (scoutUrl) brandCtxData.scout_url = scoutUrl
        const upi = asStr(pick('upi_id', 'upi'))
        if (upi) brandCtxData.scout_upi_id = upi
      } else if (lkzType === 'owner') {
        brandCtxData.user_type = 'owner'
        // Live website keys first: space_type / area_sqft / location_preference / budget_rent.
        const propType = asStr(pick('space_type', 'propertyType', 'property_type', 'spaceTypes', 'space_types', 'property_kind'))
        if (propType) brandCtxData.property_type = propType
        const size = asStr(pick('area_sqft', 'carpetArea', 'carpet_area', 'builtUpArea', 'built_up_area', 'property_size_sqft', 'sqft', 'size'))
        if (size) brandCtxData.property_size_sqft = size
        const zone = asStr(pick('location_preference', 'area', 'locality', 'zone', 'property_zone', 'micromarket', 'location'))
        if (zone) brandCtxData.property_zone = zone
        const rent = asStr(pick('budget_rent', 'rent', 'asking_rent', 'monthly_rent', 'asking_rent_monthly', 'expected_rent'))
        if (rent) brandCtxData.asking_rent_monthly = rent
        const floor = asStr(pick('floor'))
        if (floor) brandCtxData.floor = floor
        const frontage = asStr(pick('frontage', 'frontage_ft'))
        if (frontage) brandCtxData.frontage_ft = frontage
        const amenities = asStr(pick('amenities'))
        if (amenities) brandCtxData.amenities = amenities
        const avail = asStr(pick('handoverDate', 'handover_date', 'availability_date', 'available_from'))
        if (avail) brandCtxData.availability_date = avail
        const deposit = asStr(pick('deposit', 'security_deposit', 'deposit_amount'))
        if (deposit) brandCtxData.deposit = deposit
        const gmaps = asStr(pick('google_maps_link', 'google_maps_url', 'gmaps_link', 'map_link', 'maps_url'))
        if (gmaps) brandCtxData.google_maps_url = gmaps
      } else if (lkzType === 'brand') {
        brandCtxData.user_type = 'brand'
        const bname = asStr(pick('brand_name', 'brandName', 'company', 'brand'))
        if (bname) brandCtxData.brand_name = bname
        // Live website sends "business_type" (e.g. "Cafe / Coffee").
        const cat = asStr(pick('business_type', 'category', 'brand_category', 'business_category', 'brand_type'))
        if (cat) brandCtxData.brand_category = cat
        const outlets = asStr(pick('current_outlets', 'outlets', 'num_outlets'))
        if (outlets) brandCtxData.current_outlets = outlets
        // Live website sends "location_preference" (comma-joined areas).
        const zones = asStr(pick('location_preference', 'selectedAreas', 'selected_areas', 'target_zones', 'areas', 'preferred_areas', 'zone', 'area', 'locality'))
        if (zones) brandCtxData.target_zones = zones
        // What format of space they want (e.g. "restaurant").
        const fmt = asStr(pick('space_type', 'preferred_format', 'format', 'property_format'))
        if (fmt) brandCtxData.preferred_format = fmt
        // Size: live "area_sqft" is already a range (e.g. "800-2000"); else min-max.
        const sizeMin = asStr(pick('sizeMin', 'size_min', 'min_size'))
        const sizeMax = asStr(pick('sizeMax', 'size_max', 'max_size'))
        const sizeExplicit = asStr(pick('area_sqft', 'required_size_sqft', 'size', 'sqft'))
        const sizeRange = sizeExplicit || (sizeMin && sizeMax ? `${sizeMin}-${sizeMax}` : sizeMin || sizeMax)
        if (sizeRange) brandCtxData.required_size_sqft = sizeRange
        // Budget: live "budget_rent"; else min-max range.
        const rentMin = asStr(pick('rentMin', 'rent_min', 'budget_min'))
        const rentMax = asStr(pick('rentMax', 'rent_max', 'budget_max'))
        const budgetExplicit = asStr(pick('budget_rent', 'budget_monthly_rent', 'budget', 'rent'))
        const budget = budgetExplicit || (rentMin && rentMax ? `${rentMin}-${rentMax}` : rentMin || rentMax)
        if (budget) brandCtxData.budget_monthly_rent = budget
        const audience = asStr(pick('target_audience', 'audience_type', 'customer_profile'))
        if (audience) brandCtxData.target_audience = audience
      }

      // ── Common CRE extras (any lokazen form) ──────────────────────────────
      // Fields the action/enquiry forms send that the brand/owner branches
      // above don't cover. The frontend already forwards all of these; we just
      // surface them as structured context instead of leaving them in
      // raw_form_fields. property_id links the lead to the Loka listing (and
      // powers the image gallery). requested_action captures high-intent forms
      // (site visit / expert call) that otherwise look like a plain lead.
      const propId = asStr(pick('property_id', 'propertyId'))
      if (propId) brandCtxData.property_id = propId
      const src = normalizedSource || String(cf2.lead_source || '')
      if (src === 'site_visit_request' || cf2.lead_source === 'site_visit_request') {
        brandCtxData.requested_action = 'site_visit'
        const pt = asStr(pick('property_title', 'propertyTitle'))
        if (pt) brandCtxData.property_title = pt
        const pd = asStr(pick('preferred_date', 'preferredDate', 'schedule_date'))
        const ptime = asStr(pick('preferred_time', 'preferredTime', 'schedule_time'))
        const when = [pd, ptime].filter(Boolean).join(' ')
        if (when) brandCtxData.preferred_visit_at = when
      } else if (cf2.lead_source === 'expert_connect') {
        brandCtxData.requested_action = 'expert_call'
        const sd = asStr(pick('schedule_datetime', 'scheduleDateTime'))
        if (sd) brandCtxData.preferred_visit_at = sd
      }
      // Free-text requirement (contact-team / search requirements / notes).
      const req = asStr(pick('requirements', 'requirement', 'search_criteria'))
      if (req) brandCtxData.requirement_notes = req
      const bestTime = asStr(pick('best_time', 'bestTime'))
      if (bestTime) brandCtxData.best_time = bestTime
      // Owner extras (public-submit / hyderabad) the owner branch doesn't map.
      const poss = asStr(pick('possession_date', 'possessionDate', 'availability'))
      if (poss && !brandCtxData.availability_date) brandCtxData.availability_date = poss
      const pstatus = asStr(pick('property_status'))
      if (pstatus) brandCtxData.property_status = pstatus
      const cafeFmt = asStr(pick('cafe_format'))
      if (cafeFmt && !brandCtxData.preferred_format) brandCtxData.preferred_format = cafeFmt
      const venue = asStr(pick('venue'))
      if (venue) brandCtxData.venue = venue
    }

    if (Object.keys(brandCtxData).length > 0) {
      inboundContext[leadBrand] = brandCtxData
    }

    // ── Build attribution payload (Source / First Touch) ────────────────────
    // Source priority: resolvedChannel (custom_fields.channel) > utm_source > fallback.
    //   custom_fields.channel is the website's own resolved channel — it has
    //   already mapped fbclid → facebook_ads, gclid → google_ads, etc., which
    //   catches Meta-ad leads that arrive without UTM tagging (Meta auto-tags
    //   with fbclid INSTEAD of UTM, so utm-first bucket every Meta lead as
    //   "Direct"). First touch = form_type.
    const attribution = buildAttribution({
      resolvedChannel: cf2.channel || null,
      utmSource: cf2.utm_source || null,
      formType: (cf2.form_type || cf2.event_name || body.source || '').toString() || null,
      channel: leadSource,
      utm: {
        source:   cf2.utm_source   || null,
        medium:   cf2.utm_medium   || null,
        campaign: cf2.utm_campaign || campaign || null,
        content:  cf2.utm_content  || null,
        term:     cf2.utm_term     || null,
      },
      pageUrl: cf2.page_url || null,
    })

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
        last_touchpoint: storedTouchpoint,
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
        // Attribution is IMMUTABLE — never overwrite existing source/first_touch.
        // Only write it if the lead doesn't already have attribution data.
        const mergedAttribution = existingCtx.attribution ?? attribution
        updates.unified_context = {
          ...existingCtx,
          ...inboundContext,
          ...(mergedBrandCtx ? { [leadBrand]: mergedBrandCtx } : {}),
          attribution: mergedAttribution,
        }
      }

      await supabase.from('all_leads').update(updates).eq('id', existing.id)
      leadId = existing.id
    } else {
      // Create new lead — attribution is set ONCE at creation
      const { data: created, error: createErr } = await supabase
        .from('all_leads')
        .insert({
          customer_name: name?.trim() || null,
          email: email?.trim().toLowerCase() || null,
          phone,
          customer_phone_normalized: normalizedPhone,
          brand: leadBrand,
          first_touchpoint: storedTouchpoint,
          last_touchpoint: storedTouchpoint,
          last_interaction_at: now,
          lead_stage: 'New',
          unified_context: {
            ...inboundContext,
            lead_sources: [leadSource],
            attribution,
          },
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

    // ── Link prior anonymous web-chat session to this lead ──────────────────
    // When a visitor takes the PAT (or any inbound form) from the chat
    // widget, the website appends `?conversation_id=<sid>` to the assessment
    // URL. Without this block the anonymous chat history would stay orphaned
    // (lead_id=null), so the inbox would show two unrelated entities:
    //   - "Web visitor · a625440e" with 10 chat messages
    //   - "Himadri samadder" lead from the PAT submission
    // Now we re-point both web_sessions.lead_id AND conversations.lead_id so
    // the chat → PAT journey reads as one continuous lead.
    //
    // Sources we check, in order: explicit cf2.conversation_id, then parse
    // the conversation_id query param out of cf2.page_url, then cf2.referrer
    // (some forms only send the referrer).
    let chatSessionId: string | null = null
    if (cf2.conversation_id && typeof cf2.conversation_id === 'string') {
      chatSessionId = cf2.conversation_id.trim() || null
    }
    if (!chatSessionId) {
      for (const candidate of [cf2.page_url, cf2.referrer]) {
        if (!candidate || typeof candidate !== 'string') continue
        try {
          // Coerce relative paths to a parseable URL — the host is throwaway.
          const u = new URL(candidate.startsWith('http') ? candidate : `https://example.com${candidate}`)
          const cid = u.searchParams.get('conversation_id')
          if (cid) {
            chatSessionId = cid.trim()
            break
          }
        } catch {
          // Malformed URL — try the next source.
        }
      }
    }

    if (chatSessionId) {
      try {
        // Repoint the web_session if it's still unlinked. We deliberately
        // don't overwrite a different lead_id — if the session was already
        // attached to someone else, we don't want to steal it.
        const { data: sessionUpdated, error: sessionErr } = await supabase
          .from('web_sessions')
          .update({ lead_id: leadId })
          .eq('external_session_id', chatSessionId)
          .is('lead_id', null)
          .select('id')

        // Backfill anonymous conversations for this session. Same protection:
        // only rows that are still lead_id=null.
        const { error: convErr, count: convCount } = await supabase
          .from('conversations')
          .update({ lead_id: leadId }, { count: 'exact' })
          .filter('metadata->>session_id', 'eq', chatSessionId)
          .is('lead_id', null)

        if (sessionErr || convErr) {
          console.error('[inbound/chat-link] partial failure:', {
            sessionErr: sessionErr?.message,
            convErr: convErr?.message,
          })
        } else {
          console.log(
            `[inbound/chat-link] lead=${leadId} chatSession=${chatSessionId} ` +
            `session_updated=${sessionUpdated?.length || 0} conv_backfilled=${convCount ?? 0}`,
          )
        }
      } catch (e: any) {
        // Non-fatal — the lead has been created, the chat history just
        // stays orphaned. Better to ship the lead than block on this.
        console.error('[inbound/chat-link] unexpected:', e?.message || e)
      }
    }

    // Create first_outreach task — but skip if one is already pending for this
    // lead. The inbound endpoint can fire multiple times for the same lead
    // (e.g. the same Meta form is re-submitted, or the user fills the PAT
    // form after the lead form). Without this guard, every submission appends
    // a duplicate "First Outreach to X" task to the dashboard.
    const leadName = name?.trim() || existing?.customer_name || 'Lead'
    // Track whether we have a first_outreach in flight for the response payload.
    // Hoisted out of the else block so it's in scope at the return below
    // (this was a latent ReferenceError once the function actually got called).
    let taskCreated = false

    const { data: existingOutreach } = await supabase
      .from('agent_tasks')
      .select('id')
      .eq('task_type', 'first_outreach')
      .eq('lead_id', leadId)
      .in('status', ['pending', 'queued', 'awaiting_approval'])
      .limit(1)

    if (existingOutreach && existingOutreach.length > 0) {
      console.log(`[inbound] Skipping first_outreach for ${leadName} — already pending (task ${existingOutreach[0].id})`)
      taskCreated = true // a task already exists for this lead
    } else {
      const { error: taskErr } = await supabase.from('agent_tasks').insert({
        brand: BRAND_ID,
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
      } else {
        taskCreated = true
      }
    }

    // ── Slack "new lead" alert (no-op unless SLACK_WEBHOOK_URL is set) ────────
    // Fires for genuinely new inbound leads (Brand / Property onboarding forms,
    // ads, etc.). Awaited so Vercel doesn't drop it; soft-fails so Slack never
    // blocks the lead. Detail line surfaces the captured Brand/Property fields.
    if (isNew) {
      try {
        const lkz = brandCtxData
        const typeLabel = lkz.user_type === 'owner' ? 'Property Owner' : lkz.user_type === 'brand' ? 'Brand' : null
        // Structured detail — rendered as Slack 2-column fields, not a joined line.
        const detailFields: Array<[string, string | number | null | undefined]> =
          lkz.user_type === 'owner'
            ? [
                ['Property type', lkz.property_type],
                ['Size', lkz.property_size_sqft ? `${lkz.property_size_sqft} sqft` : null],
                ['Area', lkz.property_zone],
                ['Rent', lkz.asking_rent_monthly],
                ['Floor', lkz.floor],
              ]
            : lkz.user_type === 'brand'
            ? [
                ['Brand', lkz.brand_name],
                ['Category', lkz.brand_category],
                ['Areas', lkz.target_zones],
                ['Format', lkz.preferred_format],
                ['Size', lkz.required_size_sqft ? `${lkz.required_size_sqft} sqft` : null],
                ['Budget', lkz.budget_monthly_rent],
                ['Outlets', lkz.current_outlets],
              ]
            : []
        await notifySlackLead({
          brandLabel: leadBrand === 'lokazen' ? 'Lokazen' : leadBrand,
          title: 'New lead',
          name: leadName,
          phone: normalizedPhone,
          email: email?.trim() || null,
          leadType: typeLabel,
          source: normalizedSource || leadSource,
          detailFields,
          footer: 'new lead',
        })
      } catch (slackErr: any) {
        console.error('[inbound] Slack new-lead notify failed:', slackErr?.message || slackErr)
      }
    }

    // ── Lokazen: first-outreach WhatsApp template on a new form/website lead ──
    // Form leads have no open 24h window, so the outbound MUST be an approved
    // template. Meta-approved (this WABA): lokazen_lead_confirm (POSITIONAL,
    // {{1}}=name) for brand+owner; scout_welcome (POSITIONAL, {{1}}=name,
    // {{2}}=portal URL) for scouts. Awaited (Vercel won't drop it), soft-fails,
    // and logged to conversations so the inbox reflects the send.
    // PROXe now owns ALL scout messaging: the website forwards each scout_event
    // (signup / kyc_submitted / kyc_verified / upi_added / submission / payout)
    // and no longer sends its own scout WhatsApp. Every scout template is OPT-IN
    // via this allowlist (env LOKAZEN_ACTIVE_SCOUT_TEMPLATES, DEFAULT EMPTY) so
    // nothing fires until each is confirmed live on PROXe's WABA — this prevents
    // double-texting during the site->PROXe cutover. Scouts are handled entirely
    // by the dedicated sender below, never by the brand/owner welcome here.
    const activeScoutTemplates = new Set(
      (process.env.LOKAZEN_ACTIVE_SCOUT_TEMPLATES || '')
        .split(',').map((s) => s.trim()).filter(Boolean),
    )
    const scoutEventToSend = brandCtxData.user_type === 'scout'
      ? String(brandCtxData.scout_event || (isNew ? 'signup' : ''))
      : null
    if (leadBrand === 'lokazen' && isNew && normalizedPhone && brandCtxData.user_type !== 'scout') {
      try {
        const firstName = (leadName || 'there').split(' ')[0]
        const templateName = 'lokazen_lead_confirm'
        const params: Array<{ type: 'text'; text: string }> = [{ type: 'text', text: firstName }]
        const renderedBody = `Hi ${firstName}, Lokazen here - we have received your enquiry and a property specialist will contact you shortly. Reply to this message anytime to share your requirement (area, size, budget).`
        const waRes = await sendWhatsAppTemplate(
          normalizedPhone,
          templateName,
          [{ type: 'body', parameters: params }],
          'en',
        )
        await supabase.from('conversations').insert({
          lead_id: leadId,
          channel: 'whatsapp',
          sender: 'agent',
          content: waRes.success ? renderedBody : `[Template send FAILED: ${templateName}]\n\n${renderedBody}`,
          message_type: 'template',
          metadata: {
            template_name: templateName,
            template_language: 'en',
            auto_sent: true,
            trigger: 'inbound_new_lead',
            sent_by: 'system (inbound webhook)',
            send_succeeded: !!waRes.success,
            send_error: waRes.success ? null : (waRes.error || 'unknown'),
            http_status: (waRes as any).statusCode ?? null,
            wa_message_id: (waRes as any).messageId ?? null,
          },
        })
        if (!waRes.success) {
          console.error(`[inbound] Lokazen WA template FAILED lead=${leadId} template=${templateName} status=${(waRes as any).statusCode} error=${waRes.error}`)
          await supabase.from('all_leads').update({ needs_human_followup: true }).eq('id', leadId)
        } else {
          console.log(`[inbound] Lokazen WA template sent lead=${leadId} template=${templateName} messageId=${(waRes as any).messageId}`)
        }
      } catch (waErr: any) {
        console.error('[inbound] Lokazen WA send exception:', waErr?.message || waErr)
      }
    }

    // ── Lokazen SCOUT messaging — PROXe owns the whole drip ──────────────────
    // The website forwards every scout_event and no longer texts scouts itself.
    // Templates 1-4 REUSE the exact names + param order the site already had
    // Meta-approved (scout_welcome / scout_kyc_submitted / scout_kyc_verified /
    // scout_upi_added); 5-6 (scout_submission_received / scout_payout) are new.
    // A template only fires when its name is in the ACTIVE allowlist (env
    // LOKAZEN_ACTIVE_SCOUT_TEMPLATES, DEFAULT EMPTY) — so during cutover an event
    // persists context WITHOUT sending until that template is confirmed live on
    // PROXe's WABA. Add names to the env to switch them on, no redeploy.
    if (leadBrand === 'lokazen' && scoutEventToSend && normalizedPhone) {
      try {
        const firstName = (leadName || 'there').split(' ')[0]
        const url = String(brandCtxData.scout_url || LOKAZEN_SCOUT_ONBOARDING_URL)
        const area = String(brandCtxData.last_submission_area || brandCtxData.scout_area_covered || 'your area')
        const amount = String(brandCtxData.last_payout_amount || '')
        const upi = String(brandCtxData.scout_upi_id || '')
        const t = (text: string) => ({ type: 'text' as const, text })
        const SCOUT_EVENT_MAP: Record<string, { template: string; params: Array<{ type: 'text'; text: string }>; body: string }> = {
          // 1-4: same names + param order as the site's approved templates.
          signup: {
            template: 'scout_welcome',
            params: [t(firstName), t(url)],
            body: `Hi ${firstName}, welcome to Lokazen Scout! Spot an empty commercial shop with a To Let board, take one clear photo, and earn ₹250 per verified listing.\n\nNext step: complete your one-time ID check (KYC) so we can pay you - it takes about 5 minutes. Open your dashboard: ${url}\n\nSee you out there.`,
          },
          kyc_submitted: {
            template: 'scout_kyc_submitted',
            params: [t(firstName)],
            body: `Thanks ${firstName} - your ID verification request is submitted. We'll message you the moment it's reviewed. You can keep spotting and submitting shops in the meantime - your payout is simply held until verification completes.`,
          },
          kyc_verified: {
            template: 'scout_kyc_verified',
            params: [t(firstName), t(url)],
            body: `You're verified, ${firstName}! Your identity check is complete and you can now be paid. Last step: add your UPI ID in your profile so we can send your ₹250 per verified property. Add it here: ${url}\n\nAlmost there.`,
          },
          upi_added: {
            template: 'scout_upi_added',
            params: [t(firstName), t(upi || 'your UPI'), t(url)],
            body: `All set, ${firstName}! Your UPI (${upi || 'your UPI'}) is saved and you're ready to earn. Go spot a To Let shop, take one clear photo, and submit - most verified listings pay within 24 to 48 hours. Submit here: ${url}\n\nHappy scouting.`,
          },
          // 5-6: net-new touchpoints the site never messaged.
          submission: {
            template: 'scout_submission_received',
            params: [t(firstName), t(area)],
            body: `Hi ${firstName}, we have received your shop submission at ${area}. Our team will verify it and update you soon.`,
          },
          payout: {
            template: 'scout_payout',
            params: [t(firstName), t(area), t(amount || 'Your reward')],
            body: `Hi ${firstName}, your submission at ${area} is verified and ${amount || 'your reward'} has been sent to your UPI. Keep spotting To Let shops to earn more.`,
          },
        }
        const mapped = SCOUT_EVENT_MAP[scoutEventToSend]
        const activeTemplates = activeScoutTemplates
        if (!mapped) {
          console.log(`[inbound] Lokazen scout event has no template mapping: ${scoutEventToSend} (context persisted, no send)`)
        } else if (!activeTemplates.has(mapped.template)) {
          console.log(`[inbound] Lokazen scout template not yet active: ${mapped.template} (context persisted, no send). Add to LOKAZEN_ACTIVE_SCOUT_TEMPLATES once live on PROXe's WABA.`)
        } else {
          const waRes = await sendWhatsAppTemplate(
            normalizedPhone,
            mapped.template,
            [{ type: 'body', parameters: mapped.params }],
            'en',
          )
          await supabase.from('conversations').insert({
            lead_id: leadId,
            channel: 'whatsapp',
            sender: 'agent',
            content: waRes.success ? mapped.body : `[Template send FAILED: ${mapped.template}]\n\n${mapped.body}`,
            message_type: 'template',
            metadata: {
              template_name: mapped.template,
              template_language: 'en',
              auto_sent: true,
              trigger: `scout_${scoutEventToSend}`,
              sent_by: 'system (inbound webhook)',
              send_succeeded: !!waRes.success,
              send_error: waRes.success ? null : (waRes.error || 'unknown'),
              http_status: (waRes as any).statusCode ?? null,
              wa_message_id: (waRes as any).messageId ?? null,
            },
          })
          if (!waRes.success) {
            console.error(`[inbound] Lokazen scout WA FAILED lead=${leadId} template=${mapped.template} status=${(waRes as any).statusCode} error=${waRes.error}`)
            await supabase.from('all_leads').update({ needs_human_followup: true }).eq('id', leadId)
          } else {
            console.log(`[inbound] Lokazen scout WA sent lead=${leadId} template=${mapped.template} messageId=${(waRes as any).messageId}`)
          }
        }
      } catch (scoutErr: any) {
        console.error('[inbound] Lokazen scout lifecycle send exception:', scoutErr?.message || scoutErr)
      }
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
      // Re-derive tier from total_score (don't trust client payload).
      // Same cutoffs as the canonical block above + docs/pat-scoring.md.
      const derivedTier = isNaN(score)
        ? ''
        : score >= 140 ? 'premium'
          : score >= 120 ? 'strong'
            : score >= 90 ? 'moderate'
              : 'not-ready'
      const tier = derivedTier
      if (!isNaN(score)) {
        // AWAIT (not fire-and-forget) — Vercel kills in-flight promises after
        // NextResponse.json() returns. Also always log to conversations,
        // success OR failure, so the dashboard reflects reality.
        const firstName = (leadName || 'there').split(' ')[0]
        const tierKey = (derivedTier || tier || '').toLowerCase().trim()
        const tierLabel = TIER_LABELS[tierKey] || (tier || 'Pending')
        const tierMessage = TIER_MESSAGES[tierKey] || 'A counsellor can walk you through the next steps.'
        const score100 = Math.round((score * 100) / 150)
        const renderedBody = renderPATResultBody(firstName, score100, tierLabel, tierMessage)

        try {
          const result = await sendPATResult(phone, leadName, score, tier)
          // Compose content from the actual rendered template body so the
          // inbox shows what the customer sees on WhatsApp, not a placeholder.
          // Failures get a "[Template send FAILED]" prefix so they're scannable.
          const content = result.success
            ? renderedBody
            : `[Template send FAILED: windchasers_pat_result_v2]\n\n${renderedBody}`

          const { error: logErr } = await supabase.from('conversations').insert({
            lead_id: leadId,
            channel: 'whatsapp',
            sender: 'agent',
            content,
            message_type: 'template',
            metadata: {
              template_name: 'windchasers_pat_result_v2',
              template_language: 'en',
              template_header: TEMPLATE_HEADERS['windchasers_pat_result_v2'] || null,
              template_buttons: TEMPLATE_BUTTONS['windchasers_pat_result_v2'] || [],
              auto_sent: true,
              trigger: 'pat_completed',
              sent_by: 'system (inbound webhook)',
              score_raw: score,
              score_100: score100,
              tier: tierLabel,
              tier_key: tierKey,
              send_succeeded: !!result.success,
              send_error: result.success ? null : (result.error || 'unknown'),
              http_status: (result as any).statusCode ?? null,
              wa_message_id: (result as any).messageId ?? null,
            },
          })

          // ── ERROR CHECKING ─────────────────────────────────────────────
          // 1) Conversation log write failed (RLS / schema drift / DB down)
          if (logErr) {
            console.error(`[inbound] PAT conversation log FAILED for lead=${leadId} phone=${phone}: ${logErr.message}`)
            await supabase.from('all_leads').update({ needs_human_followup: true }).eq('id', leadId)
          }
          // 2) Meta send failed (template missing / param mismatch / token expired / etc)
          if (!result.success) {
            console.error(`[inbound] PAT WA send FAILED lead=${leadId} phone=${phone} status=${(result as any).statusCode} error=${result.error}`)
            await supabase.from('all_leads').update({ needs_human_followup: true }).eq('id', leadId)
          } else {
            console.log(`[inbound] PAT WA OK lead=${leadId} phone=${phone} score=${score}/150 tier=${tierKey} messageId=${(result as any).messageId}`)
          }
        } catch (err: any) {
          // 3) Unexpected exception (network blow up, Anthropic SDK throw, etc)
          console.error(`[inbound] PAT WA EXCEPTION lead=${leadId} phone=${phone}: ${err?.message || err}`)
          // Best-effort: log a failure row so the operator can see something went wrong.
          await supabase.from('conversations').insert({
            lead_id: leadId,
            channel: 'whatsapp',
            sender: 'agent',
            content: `[Template send EXCEPTION: windchasers_pat_result_v2]\n\n${renderedBody}`,
            message_type: 'template',
            metadata: {
              template_name: 'windchasers_pat_result_v2',
              auto_sent: true,
              trigger: 'pat_completed',
              send_succeeded: false,
              send_error: err?.message || String(err),
              send_exception: true,
            },
          })
          await supabase.from('all_leads').update({ needs_human_followup: true }).eq('id', leadId)
        }
      }
    }
    // NOTE: generic first-outreach for new non-PAT, non-demo leads is DISABLED.
    // The 'windchasers_followup' template was never approved in Meta, so every
    // send was failing silently. Path removed until we set up real responses.
    // Re-enable by approving a template in Meta and restoring the branch.

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

        // Resolve demo format. demo_type comes from the website form (or
        // sessionType inside legacy payloads). Default to 'offline' when
        // unknown — safer than assuming online without a calendar event.
        const rawDemoType = String(
          cfields.demo_type ||
          cfields.session_type ||
          cfields.sessionType ||
          ''
        ).toLowerCase().trim()
        const demoFormat: DemoFormat = rawDemoType === 'online' ? 'online' : 'offline'
        const eventIdForButton = calendarResult?.eventId || null
        const templateName = demoFormat === 'online'
          ? 'windchasers_demo_online_v2'
          : 'windchasers_demo_offline_v2'

        // AWAIT (not fire-and-forget) — see PAT block above for rationale.
        const firstName = (leadName || 'there').split(' ')[0]
        const renderedBody = demoFormat === 'online'
          ? renderDemoOnlineBody(firstName, dateDisplay, timeDisplay)
          : renderDemoOfflineBody(firstName, dateDisplay, timeDisplay)
        try {
          const result = await sendDemoConfirmation(phone, leadName, dateDisplay, timeDisplay, demoFormat, eventIdForButton)
          const content = result.success
            ? renderedBody
            : `[Template send FAILED: ${templateName}]\n\n${renderedBody}`

          const { error: logErr } = await supabase.from('conversations').insert({
            lead_id: leadId,
            channel: 'whatsapp',
            sender: 'agent',
            content,
            message_type: 'template',
            metadata: {
              template_name: templateName,
              template_language: 'en',
              template_header: TEMPLATE_HEADERS[templateName] || null,
              template_buttons: TEMPLATE_BUTTONS[templateName] || [],
              auto_sent: true,
              trigger: 'demo_booked',
              sent_by: 'system (inbound webhook)',
              format: demoFormat,
              date: preferredDate,
              time: preferredTime,
              calendar_event_id: eventIdForButton,
              meet_link: demoMeetLink, // kept for downstream consumers — null for offline
              send_succeeded: !!result.success,
              send_error: result.success ? null : (result.error || 'unknown'),
              http_status: (result as any).statusCode ?? null,
              wa_message_id: (result as any).messageId ?? null,
            },
          })

          // ── ERROR CHECKING ─────────────────────────────────────────────
          if (logErr) {
            console.error(`[inbound] Demo conversation log FAILED for lead=${leadId} phone=${phone}: ${logErr.message}`)
            await supabase.from('all_leads').update({ needs_human_followup: true }).eq('id', leadId)
          }
          if (!result.success) {
            console.error(`[inbound] Demo WA send FAILED lead=${leadId} phone=${phone} format=${demoFormat} status=${(result as any).statusCode} error=${result.error}`)
            await supabase.from('all_leads').update({ needs_human_followup: true }).eq('id', leadId)
          } else {
            console.log(`[inbound] Demo WA OK lead=${leadId} phone=${phone} format=${demoFormat} messageId=${(result as any).messageId}`)
          }
        } catch (err: any) {
          console.error(`[inbound] Demo WA EXCEPTION lead=${leadId} phone=${phone} format=${demoFormat}: ${err?.message || err}`)
          await supabase.from('conversations').insert({
            lead_id: leadId,
            channel: 'whatsapp',
            sender: 'agent',
            content: `[Template send EXCEPTION: ${templateName}]\n\n${renderedBody}`,
            message_type: 'template',
            metadata: {
              template_name: templateName,
              auto_sent: true,
              trigger: 'demo_booked',
              format: demoFormat,
              send_succeeded: false,
              send_error: err?.message || String(err),
              send_exception: true,
            },
          })
          await supabase.from('all_leads').update({ needs_human_followup: true }).eq('id', leadId)
        }
      } catch (waErr: any) {
        console.error('[inbound] Demo confirmation prep failed:', waErr?.message || waErr)
      }
    }

    return NextResponse.json({
      success: true,
      lead_id: leadId,
      is_new: isNew,
      task_created: taskCreated,
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
