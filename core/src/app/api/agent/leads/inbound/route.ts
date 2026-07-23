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
  TEMPLATE_BUTTON_TYPES,
  notifySlackLead,
  sendWhatsAppTemplate,
  sendWebinarConfirm,
  sendOfflineEventConfirm,
  isCabinCrewSource,
  sendCabinCrewWelcome,
  pickWelcomeTemplate,
  sendWelcomeTemplate,
  sendNamedTemplate,
  isParentSource,
  sendParentWelcomeTemplate,
  isLikelyRealPersonName,
} from '@/lib/services'
import type { DemoFormat } from '@/lib/services'
import { BRAND_ID } from '@/configs'
import { normalizeCourse } from '@/configs/courses'
import { renderWaTemplate } from '@/configs/whatsapp-template-bodies'

export const dynamic = 'force-dynamic'

// Scout onboarding URL used in the scout_welcome WhatsApp template ({{2}}).
const LOKAZEN_SCOUT_ONBOARDING_URL =
  process.env.NEXT_PUBLIC_LOKAZEN_SCOUT_ONBOARDING_URL || 'https://www.lokazen.in/scout#scout-form'

// Upstream forms/apps sometimes send a category/placeholder label instead of an
// actual name — a single word (e.g. "Property") or a compound default a signup
// flow stamps on a brand-new account before the person enters their real name
// (e.g. the Lokazen owner app's account default "Property Owner"). Either way
// it then gets greeted back at the person ("Hi Property, ...") or displayed as
// their name on the dashboard. A name counts as a placeholder when EVERY word
// in it is a known placeholder token — so "Property Owner" is blocked but a
// real name like "Owner Smith" is not (only one word matches).
const NAME_PLACEHOLDER_BLOCKLIST = new Set([
  'property', 'owner', 'brand', 'scout', 'connector', 'lead', 'customer',
  'test', 'n/a', 'na', 'none', 'unknown', 'undefined', 'null',
])
function cleanName(raw?: string | number | null): string {
  // Coerce first — inbound payloads sometimes send name/number fields non-string.
  const trimmed = (raw == null ? '' : String(raw)).trim()
  if (!trimmed) return ''
  // Synthetic account ids / placeholder emails the owner & scout apps stamp on a
  // brand-new account BEFORE a real name exists — never a person's name. e.g.
  // "owner_9341333999_1783481293327@noemail.lokazen.in", any @noemail./noreply
  // address, or an "<type>_<digits>…" internal id. Without this the id leaks into
  // the dashboard as the lead's name and into "Hi <id>" greetings.
  if (/@noemail\.|noreply|no-reply|placeholder/i.test(trimmed)) return ''
  if (/^(owner|brand|scout|connector|lead|user|customer)_\d/i.test(trimmed)) return ''
  const words = trimmed.toLowerCase().split(/\s+/)
  const isPlaceholder = words.every((w) => NAME_PLACEHOLDER_BLOCKLIST.has(w))
  return isPlaceholder ? '' : trimmed
}

// Outbound-message dedup gate — this webhook can be called more than once for
// the exact same event (page reload, retry, double form-submit; confirmed
// live for lokazen scout events, firing the same template 4x in 6 minutes).
// Every WhatsApp template send in this file should check this FIRST: skip
// (log only — the lead's data still updates normally) if the same template
// already went out to this lead within the window. Time-based rather than
// "only ever once" so genuinely repeatable actions (a scout's 2nd/3rd/4th
// submission, a later payout, a re-booked demo at a different time) still
// send — only true back-to-back duplicates get squashed.
const TEMPLATE_DEDUP_WINDOW_MS = 5 * 60 * 1000
async function wasTemplateRecentlySent(
  supabase: any,
  leadId: string,
  templateName: string,
  windowMs: number = TEMPLATE_DEDUP_WINDOW_MS,
): Promise<boolean> {
  const { data: recentSend } = await supabase
    .from('conversations')
    .select('created_at')
    .eq('lead_id', leadId)
    .eq('channel', 'whatsapp')
    .filter('metadata->>template_name', 'eq', templateName)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return !!(recentSend?.created_at && (Date.now() - new Date(recentSend.created_at).getTime()) < windowMs)
}

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
    // Diagnostic: log exactly what each lead arrives with (name vs brand + which
    // form fields came through) so we can confirm the website is forwarding the
    // full submission. Names/fields only — no secrets.
    console.log('[inbound] received:', JSON.stringify({
      name: name || null,
      brand_name: brand_name || null,
      source: source || null,
      city: city || null,
      cf_keys: Object.keys((custom_fields as Record<string, unknown>) || {}),
    }))

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
      webinar: 'webinar',
    }
    const normalizedSource = (source || '').toString().trim().toLowerCase()
    const VALID_TOUCHPOINTS = new Set(['web','whatsapp','voice','social','facebook','google','form','manual','pabbly','ads','referral','organic','meta_forms','webinar'])
    const mappedSource = normalizedSource ? (sourceToTouchpoint[normalizedSource] || normalizedSource) : 'manual'
    const leadBrand = brand || BRAND_ID
    // Fall back to 'form' for any value not in the channel_type enum (e.g. 'pat', 'guide_download').
    // The original raw source is preserved in agent_tasks.metadata.source below.
    // 'webinar' exists only in windchasers' channel_type enum (migration 035) —
    // other brands' inserts would 22P02, so they coerce to 'form'.
    let leadSource = VALID_TOUCHPOINTS.has(mappedSource) ? mappedSource : 'form'
    if (leadSource === 'webinar' && leadBrand !== 'windchasers') leadSource = 'form'

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
    // Webinar registration flag (windchasers) — set in the brand block below,
    // read later for task-skip + confirmation send.
    let isWebinarReg = false
    // Cabin-crew lead flag (windchasers) — set in the brand block below, read
    // later for the dedicated cabin-crew welcome + first_outreach skip.
    let isCabinCrewLead = false
    // Flight-school lead flag (windchasers) — set below, read at the welcome
    // block so these get the generic welcome (which has a "Flight Schools"
    // button) rather than the pilot-training welcome.
    let isFlightSchoolLead = false
    // Offline-event lead flag (windchasers) - set below. Unlike webinar, this
    // does NOT skip first_outreach: there's no confirmation/reminder template
    // yet, so a counsellor still needs to follow up. Flip this once a
    // dedicated offline-event WhatsApp confirm exists (mirror the webinar
    // isWebinarReg skip at the first_outreach block below).
    let isOfflineEventLead = false
    const audienceRaw = String(cf2.audience || cf2.user_type || (body as any).audience || (body as any).user_type || '').toLowerCase().trim()
    if (
      audienceRaw === 'student' ||
      audienceRaw === 'parent' ||
      audienceRaw === 'professional' ||
      audienceRaw === 'early_stage'
    ) {
      brandCtxData.user_type = audienceRaw
    }
    if (leadBrand === 'windchasers') {
      // Normalize the interest to one canonical course label
      // (Pilot / DGCA / Helicopter / Cabin Crew / Flight School) — no abbreviated variations.
      const interestRaw = String(cf2.interest || cf2.course_interest || '').toLowerCase().trim()
      const normalizedCourse = normalizeCourse(interestRaw)
      if (normalizedCourse && interestRaw !== 'other') {
        brandCtxData.course_interest = normalizedCourse
      }
      // Cabin-crew lead: from the mapped course interest OR any cabin-crew
      // signal in the source/form/campaign. Gets the dedicated cabin-crew
      // welcome below (with generic fallback) instead of the counsellor
      // first_outreach task.
      isCabinCrewLead =
        brandCtxData.course_interest === 'Cabin Crew' ||
        isCabinCrewSource(
          normalizedSource,
          interestRaw,
          String(cf2.form_type || (body as any).form_type || ''),
          String(cf2.form_name || cf2.campaign || campaign || ''),
          String(cf2.ad_name || ''),
        )
      // Cabin-crew detected from the source/form/campaign but no explicit course
      // captured → tag the course so the COURSE column shows "Cabin Crew".
      // (TYPE stays user_type: student/parent; cabin crew belongs in COURSE.)
      if (isCabinCrewLead && !brandCtxData.course_interest) {
        brandCtxData.course_interest = 'Cabin Crew'
      }
      // Flight-school lead (study/train abroad) — from the flight-school form/
      // source or a school-name field. Force COURSE = 'Flight School' so it is
      // NOT remapped to 'Pilot' (normalizeCourse treats "flight" as Pilot).
      isFlightSchoolLead =
        brandCtxData.course_interest === 'Flight School' ||
        String(cf2.form_type || (body as any).form_type || '').toLowerCase().trim() === 'flight_school' ||
        String(normalizedSource || '').toLowerCase() === 'flight_school' ||
        !!(cf2.school_interested || cf2.school_country || (body as any).school_interested)
      if (isFlightSchoolLead) {
        brandCtxData.course_interest = 'Flight School'
        const school = cf2.school_interested || (body as any).school_interested
        const country = cf2.school_country || (body as any).school_country
        if (school) brandCtxData.school_interested = String(school)
        if (country) brandCtxData.school_country = String(country)
      }
      const demoTypeRaw = String(cf2.demo_type || '').toLowerCase().trim()
      if (demoTypeRaw) brandCtxData.session_type = demoTypeRaw
      const educationRaw = String(cf2.education || '').toLowerCase().trim()
      if (educationRaw) brandCtxData.education = educationRaw

      // ── Webinar registration (Zoom → Pabbly) ──────────────────────────────
      // Registrants are pre-leads: tagged lead_type='webinar' so the Leads
      // page's Webinar tab can segment them out of the main list. user_type
      // (student/parent) is NOT touched — that's who they are, this is why
      // they came.
      // A COMPLETED Zoom registration (the Zoom → Pabbly webhook fires only after
      // they finish registering on Zoom) carries a per-registrant join_url, or a
      // static zoom_registered flag. That distinguishes "actually registered on
      // Zoom" from "clicked Register on the landing page".
      const zoomJoinUrl = String(cf2.zoom_join_url || (body as any).zoom_join_url || (body as any).join_url || '').trim()
      const isZoomReg =
        !!zoomJoinUrl ||
        ['yes', 'true', '1'].includes(String(cf2.zoom_registered || (body as any).zoom_registered || '').toLowerCase().trim())
      isWebinarReg =
        isZoomReg ||
        normalizedSource === 'webinar' ||
        String(cf2.form_type || (body as any).form_type || '').toLowerCase().trim() === 'webinar' ||
        String(cf2.lead_type || (body as any).lead_type || '').toLowerCase().trim() === 'webinar'
      if (isWebinarReg) {
        brandCtxData.lead_type = 'webinar'
        const webinarName = String(cf2.webinar_name || cf2.webinar_topic || cf2.event_name || (body as any).webinar_name || (body as any).event_name || '').trim()
        if (webinarName) brandCtxData.webinar_name = webinarName
        const webinarDate = String(cf2.webinar_date || cf2.webinar_datetime || cf2.event_date || (body as any).webinar_date || '').trim()
        if (webinarDate) brandCtxData.webinar_date = webinarDate
        brandCtxData.webinar_registered_at = now
        if (isZoomReg) {
          brandCtxData.zoom_registered = true
          brandCtxData.zoom_registered_at = now
          if (zoomJoinUrl) brandCtxData.zoom_join_url = zoomJoinUrl
        }
      }

      // ── Offline event registration (demo class, open house, etc.) ─────────
      // Distinct from "Key Event" (a lead's own scheduled call/demo booking on
      // all_leads.booking_date) — this is a MARKETING segment, many leads
      // registering for the SAME in-person session, same shape as webinar but
      // for a physical venue instead of a Zoom link. Tagged lead_type=
      // 'offline_event' so the Leads page's Offline Events tab can segment
      // them out. user_type (student/parent) is NOT touched here.
      isOfflineEventLead =
        normalizedSource === 'offline_event' ||
        String(cf2.form_type || (body as any).form_type || '').toLowerCase().trim() === 'offline_event' ||
        String(cf2.lead_type || (body as any).lead_type || '').toLowerCase().trim() === 'offline_event'
      if (isOfflineEventLead) {
        brandCtxData.lead_type = 'offline_event'
        const offlineEventName = String(cf2.offline_event_name || cf2.event_name || (body as any).offline_event_name || (body as any).event_name || '').trim()
        if (offlineEventName) brandCtxData.offline_event_name = offlineEventName
        const offlineEventDate = String(cf2.offline_event_date || cf2.event_date || (body as any).offline_event_date || '').trim()
        if (offlineEventDate) brandCtxData.offline_event_date = offlineEventDate
        const offlineEventLocation = String(cf2.offline_event_location || cf2.event_location || (body as any).offline_event_location || '').trim()
        if (offlineEventLocation) brandCtxData.offline_event_location = offlineEventLocation
        // Who they're bringing (parent/guest, free text from the landing page
        // form) - so the counsellor/venue knows headcount without a callback.
        const offlineEventComingWith = String(cf2.offline_event_coming_with || (body as any).offline_event_coming_with || '').trim()
        if (offlineEventComingWith) brandCtxData.offline_event_coming_with = offlineEventComingWith
        brandCtxData.offline_event_registered_at = now
      }

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
        // Count of shops this scout has submitted (drives the Properties column).
        // Default 1 for a brand-new scout's first submission; for an existing
        // scout it's recomputed as existing + 1 at the merge below.
        if (scoutEvent === 'submission') brandCtxData.scout_submissions_count = 1
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
        // Free-text the owner typed (floor / "other details" / description) — the
        // website bundles floor into this, so it carries the extra detail PROXe
        // otherwise dropped. Surfaces in the property modal's "Other details".
        const notes = asStr(pick('notes', 'description', 'other_details', 'details', 'message'))
        if (notes) brandCtxData.notes = notes
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
      if (cleanName(name) && !existing.customer_name) updates.customer_name = cleanName(name)

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
        // A submission event increments the scout's running submitted count
        // (the shallow merge above would otherwise reset it to the default 1).
        if (mergedBrandCtx && brandCtxData.scout_event === 'submission') {
          mergedBrandCtx.scout_submissions_count =
            Number((existingCtx[leadBrand] as any)?.scout_submissions_count || 0) + 1
        }
        // A webinar registration must never DEMOTE an existing real lead into
        // the webinar segment: only keep the webinar tag if the lead was
        // already webinar-tagged. The registration details (webinar_name/date/
        // registered_at) still merge in either way.
        if (mergedBrandCtx && brandCtxData.lead_type === 'webinar' &&
            (existingCtx[leadBrand] as any)?.lead_type !== 'webinar') {
          delete mergedBrandCtx.lead_type
        }
        // Same guard for offline-event registrations: never demote an existing
        // real lead into the offline-event segment. Registration details
        // (offline_event_name/date/location/registered_at) still merge in.
        if (mergedBrandCtx && brandCtxData.lead_type === 'offline_event' &&
            (existingCtx[leadBrand] as any)?.lead_type !== 'offline_event') {
          delete mergedBrandCtx.lead_type
        }
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
          customer_name: cleanName(name) || null,
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
    // 'Lead' is a placeholder, fine for DB storage/dashboard display, but reads
    // badly as a WhatsApp greeting ("Hi Lead" — the same class of bug as "Hi
    // Property"). Every firstName-for-greeting derivation below checks for this
    // exact sentinel and uses 'there' instead, without changing the DB fallback.
    const leadName = cleanName(name) || cleanName(existing?.customer_name) || 'Lead'
    // Track whether we have a first_outreach in flight for the response payload.
    // Hoisted out of the else block so it's in scope at the return below
    // (this was a latent ReferenceError once the function actually got called).
    let taskCreated = false

    // Windchasers: a brand-new, non-webinar/cabin/PAT/demo lead gets an
    // immediate pilot/generic/parent welcome (re-enabled below — the v3 welcome
    // templates are Meta-approved). Mirrors the cabin-crew path: welcome now,
    // skip the (dead) first_outreach task so the lead isn't double-handled.
    const isNewLead = !existing
    const isPatEarly =
      leadBrand === 'windchasers' &&
      (normalizedSource === 'pat' || String(cf2.form_type || '').toLowerCase() === 'pilot_aptitude_test')
    const isDemoEarly =
      String(notes || '').toLowerCase() === 'demo_booked' ||
      String(cf2.event_name || '').toLowerCase() === 'demo_booked' ||
      String(cf2.form_type || '').toLowerCase() === 'demo_booked'
    const isWindchasersWelcomeLead =
      leadBrand === 'windchasers' && !!phone && isNewLead &&
      !isWebinarReg && !isOfflineEventLead && !isCabinCrewLead && !isPatEarly && !isDemoEarly
    // bcon: every brand-new inbound lead with a phone gets an IMMEDIATE welcome
    // (website form -> web welcome, Meta/AI-Lead-Machine -> campaign welcome).
    // The old path parked a first_outreach task for the task-worker — which is
    // retired — so website leads reached PROXe and then sat silent.
    const isBconWelcomeLead = leadBrand === 'bcon' && !!phone && isNewLead

    const { data: existingOutreach } = await supabase
      .from('agent_tasks')
      .select('id')
      .eq('task_type', 'first_outreach')
      .eq('lead_id', leadId)
      .in('status', ['pending', 'queued', 'awaiting_approval'])
      .limit(1)

    // Scouts do NOT run the brand/owner follow-up sequence — they have their own
    // lifecycle drip (signup/KYC/submission/payout via scout_event templates), so
    // never queue a first_outreach / sequence task for a scout lead.
    const isScoutLead = leadBrand === 'lokazen' && brandCtxData.user_type === 'scout'
    if (isScoutLead) {
      console.log(`[inbound] Scout lead ${leadName} — no follow-up sequence (scout lifecycle only)`)
    } else if (isWebinarReg) {
      // Webinar registrants are pre-leads at volume — the confirm + reminder
      // templates ARE the outreach; no counsellor first_outreach task.
      console.log(`[inbound] Webinar registration ${leadName} — no first_outreach task`)
    } else if (isCabinCrewLead) {
      // Cabin-crew leads get the dedicated cabin-crew welcome below as the first
      // touch (mirrors the FB path) — no separate first_outreach task, so the
      // lead isn't messaged twice. The worker still follows up by scanning.
      console.log(`[inbound] Cabin-crew lead ${leadName} — cabin-crew welcome, no first_outreach task`)
    } else if (isWindchasersWelcomeLead) {
      // Pilot/generic/parent welcome fires below as the first touch — no dead
      // first_outreach task (its worker never ran, so those leads were silent).
      console.log(`[inbound] Windchasers lead ${leadName} — pilot/generic/parent welcome, no first_outreach task`)
    } else if (isBconWelcomeLead) {
      // bcon welcome fires below as the first touch — no dead first_outreach task.
      console.log(`[inbound] bcon lead ${leadName} — inline welcome, no first_outreach task`)
    } else if (existingOutreach && existingOutreach.length > 0) {
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
    // (Core note: gated to lokazen — other brands keep their existing behavior.)
    if (isNew && leadBrand === 'lokazen') {
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
                ['From', city?.trim() || null],
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
    // PROXe owns ALL scout messaging: the website forwards each scout_event
    // (signup / kyc_received / kyc_approved / upi_saved / submission / payout)
    // and never sends its own scout WhatsApp (confirmed: its own
    // notifyPayoutSent/etc. are Slack+email admin alerts only, not scout-facing).
    // All 6 Meta-approved templates are active by default — no Vercel env-var
    // step needed. LOKAZEN_ACTIVE_SCOUT_TEMPLATES remains as an optional
    // override (e.g. to disable one template without a code change) but is
    // never required. Scouts are handled entirely by the dedicated sender
    // below, never by the brand/owner welcome here.
    const DEFAULT_ACTIVE_SCOUT_TEMPLATES = [
      'scout_signup', 'scout_kyc_received', 'scout_kyc_approved',
      'scout_upi_saved', 'scout_submission_received', 'scout_payout_sent',
    ]
    const activeScoutTemplates = new Set(
      process.env.LOKAZEN_ACTIVE_SCOUT_TEMPLATES
        ? process.env.LOKAZEN_ACTIVE_SCOUT_TEMPLATES.split(',').map((s) => s.trim()).filter(Boolean)
        : DEFAULT_ACTIVE_SCOUT_TEMPLATES,
    )
    const scoutEventToSend = brandCtxData.user_type === 'scout'
      ? String(brandCtxData.scout_event || (isNew ? 'signup' : ''))
      : null
    if (leadBrand === 'lokazen' && isNew && normalizedPhone && brandCtxData.user_type !== 'scout') {
      try {
        // The lead's "name" is often the BRAND they typed (e.g. "Bulbul Blablu"),
        // not a person — greeting "Hi Bulbul" is wrong. Only use it as a first
        // name when it looks like a real person AND is NOT the same as the brand
        // name; otherwise greet "there".
        const lkzBrand = String(brand_name || brandCtxData.brand_name || '').trim().toLowerCase()
        const nameIsPerson = leadName !== 'Lead'
          && isLikelyRealPersonName(leadName)
          && leadName.trim().toLowerCase() !== lkzBrand
        const firstName = (nameIsPerson ? leadName : 'there').split(' ')[0]
        const isBrandLead = brandCtxData.user_type === 'brand'
        const isOwnerLead = brandCtxData.user_type === 'owner'

        // Approved (POSITIONAL {{1}}=name) confirm template — the default AND the
        // fallback if the richer audience welcome is not yet live on Meta.
        const confirmName = 'lokazen_lead_confirm'
        const confirmComponents = [{ type: 'body' as const, parameters: [{ type: 'text', text: firstName }] }]
        const confirmBody = `Hi ${firstName}, Lokazen here - we have received your enquiry and a property specialist will contact you shortly. Reply to this message anytime to share your requirement (area, size, budget).`

        // Chosen send. Brand and owner leads try their richer welcome (NAMED
        // params) first; everyone else gets the confirm.
        let templateName = confirmName
        let renderedBody = confirmBody
        let components: Array<{ type: 'body'; parameters: Array<any> }> = confirmComponents
        // Quick-reply buttons baked into each approved template. WhatsApp renders
        // them from the template itself; we mirror the labels into metadata so the
        // dashboard inbox shows the same chips (confirm has none).
        let templateButtons: string[] = []

        // Only send the rich "Got your brief" templates when a brief actually
        // EXISTS at send time. Leads often arrive with just name+phone (details
        // come later in chat), and sending the brief template then filled every
        // slot with placeholder text ("Budget: ₹your budget/mo") — broken-looking.
        // Brand brief = brand name + at least one requirement field. Owner brief
        // = at least two of location / size / rent. Anything less falls through
        // to the plain confirm template, which claims no brief.
        const bBrand = String(brandCtxData.brand_name || '').trim()
        const bRent = String(brandCtxData.budget_monthly_rent || '').trim()
        const bSize = String(brandCtxData.required_size_sqft || '').trim()
        const bAreas = String(brandCtxData.target_zones || '').trim()
        const brandHasBrief = !!bBrand && !!(bRent || bSize || bAreas)
        const oLoc = String(brandCtxData.property_zone || brandCtxData.google_maps_url || '').trim()
        const oSize = String(brandCtxData.property_size_sqft || '').trim()
        const oRent = String(brandCtxData.asking_rent_monthly || '').trim()
        const ownerHasBrief = [oLoc, oSize, oRent].filter(Boolean).length >= 2

        if (isBrandLead && brandHasBrief) {
          const brandName = bBrand
          const rentRange = bRent || 'your budget'
          const sizeRange = bSize || 'your requirement'
          const locations = bAreas || 'your preferred areas'
          templateName = 'lokazen_brand_welcome_v1'
          components = [{ type: 'body', parameters: [
            { type: 'text', parameter_name: 'contact_name', text: firstName },
            { type: 'text', parameter_name: 'brand_name', text: brandName },
            { type: 'text', parameter_name: 'rent_range', text: rentRange },
            { type: 'text', parameter_name: 'size_range', text: sizeRange },
            { type: 'text', parameter_name: 'locations', text: locations },
          ] }]
          renderedBody = `Hi ${firstName}, Loka here from Lokazen\n\nGot your brief for ${brandName}:\n\nBudget: ₹${rentRange}/mo\nSize: ${sizeRange} sq ft\nAreas: ${locations}\n\nWe are pulling matched spaces that fit your requirement.\n\nTeam Lokazen`
          templateButtons = ['How it works', 'Talk to The Team']
        } else if (isOwnerLead && ownerHasBrief) {
          // Owners often drop a Google Maps pin instead of typing a locality, so
          // property_zone can be empty while the map link is present — use it as
          // the location before falling back to a generic phrase.
          const location = oLoc || 'your area'
          const size = oSize || 'your space'
          const rent = oRent || 'your expected rent'
          templateName = 'lokazen_property_owner_welcome_v1'
          components = [{ type: 'body', parameters: [
            { type: 'text', parameter_name: 'contact_name', text: firstName },
            { type: 'text', parameter_name: 'location', text: location },
            { type: 'text', parameter_name: 'size', text: size },
            { type: 'text', parameter_name: 'rent', text: rent },
          ] }]
          renderedBody = `Hi ${firstName}, Loka here from Lokazen.\n\nGot your property listing brief:\n\n📍 Location: ${location}\n\nSize: ${size} sq ft\nExpected rent: ₹${rent}/mo\n\nWe are matching it against active brands looking to expand.\n\nTeam Lokazen`
          templateButtons = ['How it Works', 'Talk to the Team']
        }

        let waRes = await sendWhatsAppTemplate(normalizedPhone, templateName, components, 'en')

        // The richer audience welcomes (brand / owner) are still In review on
        // Meta. Until approved the send fails — fall back to the approved confirm
        // so the lead still gets a welcome. Drop once both are live.
        if (!waRes.success && (isBrandLead || isOwnerLead)) {
          console.warn(`[inbound] Lokazen ${templateName} failed (${waRes.error}) — falling back to ${confirmName}`)
          templateName = confirmName
          renderedBody = confirmBody
          templateButtons = []
          waRes = await sendWhatsAppTemplate(normalizedPhone, confirmName, confirmComponents, 'en')
        }
        await supabase.from('conversations').insert({
          lead_id: leadId,
          channel: 'whatsapp',
          sender: 'agent',
          content: waRes.success ? renderedBody : `[Template send FAILED: ${templateName}]\n\n${renderedBody}`,
          message_type: 'template',
          metadata: {
            template_name: templateName,
            template_language: 'en',
            template_buttons: templateButtons.length ? templateButtons : undefined,
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
          // We just reached the lead on WhatsApp — that's the latest touch now, so
          // the lead card/list stops showing "web" after an outbound template.
          // (first_touchpoint stays 'web' — that's the origin.)
          await supabase.from('all_leads')
            .update({ last_touchpoint: 'whatsapp', last_interaction_at: new Date().toISOString() })
            .eq('id', leadId)
          console.log(`[inbound] Lokazen WA template sent lead=${leadId} template=${templateName} messageId=${(waRes as any).messageId}`)
        }
      } catch (waErr: any) {
        console.error('[inbound] Lokazen WA send exception:', waErr?.message || waErr)
      }
    }

    // ── Lokazen SCOUT messaging — PROXe owns the whole drip ──────────────────
    // The website forwards every scout_event and never texts scouts itself.
    // All 6 templates (scout_signup / scout_kyc_received / scout_kyc_approved /
    // scout_upi_saved / scout_submission_received / scout_payout_sent) are the
    // exact names approved on Lokazen's WABA and are active by default (see
    // DEFAULT_ACTIVE_SCOUT_TEMPLATES above) — no env var required.
    if (leadBrand === 'lokazen' && scoutEventToSend && normalizedPhone) {
      try {
        // Canonical scout event → the EXACT Meta-approved template on Lokazen's
        // WABA (verified live in WhatsApp Manager, 2026-07-06: every one of these
        // 6 templates is FULLY STATIC — zero {{n}} body placeholders, just a
        // static "Open Scout Portal" URL button — so params is always []. (Body
        // text below is copied verbatim from the approved previews, purely for
        // the conversations-table timeline; it is never sent to Meta. If a
        // future template adds real placeholders, rebuild the per-lead values —
        // leadName/brandCtxData.scout_url/scout_area_covered/last_payout_amount/
        // scout_upi_id — here and pass them via params instead of [].)
        const SCOUT_EVENT_MAP: Record<string, { template: string; params: Array<{ type: 'text'; text: string }>; body: string }> = {
          signup: {
            template: 'scout_signup',
            params: [],
            body: `Welcome to Lokazen Scout! Your account is ready. Spot vacant shops and offices in Bangalore, submit them from your phone, and earn for every verified property. Log in anytime with your phone number - no password needed.`,
          },
          kyc_received: {
            template: 'scout_kyc_received',
            params: [],
            body: `We have received your KYC details. Verification is usually completed within 24 hours, and we will message you as soon as you are approved. You can check your status anytime in your Scout dashboard.`,
          },
          kyc_approved: {
            template: 'scout_kyc_approved',
            params: [],
            body: `Good news - your KYC is verified. You are all set to earn as a Lokazen Scout. Add your UPI ID in your profile (if you have not already) so payouts reach you directly.`,
          },
          upi_saved: {
            template: 'scout_upi_saved',
            params: [],
            body: `Your UPI ID has been saved. Payouts for your verified properties will be sent directly to this UPI. You are fully set up - happy scouting!`,
          },
          submission: {
            template: 'scout_submission_received',
            params: [],
            body: `We have received your property submission. Our team will verify it and update you soon.`,
          },
          payout: {
            template: 'scout_payout_sent',
            params: [],
            body: `Your Lokazen Scout payout has been sent to your UPI. It should reflect in your account shortly. You can see your full earnings summary in your dashboard - keep scouting!`,
          },
        }
        // Normalise the website's scout_event vocabulary onto the canonical keys
        // above so a naming drift (kyc_submitted vs kyc_received, upi_added vs
        // upi_saved, payout vs payout_sent, etc.) still fires the right template.
        const SCOUT_EVENT_ALIASES: Record<string, string> = {
          signup: 'signup', welcome: 'signup', scout_signup: 'signup',
          kyc_submitted: 'kyc_received', kyc_received: 'kyc_received', kyc: 'kyc_received',
          kyc_verified: 'kyc_approved', kyc_approved: 'kyc_approved', verified: 'kyc_approved',
          upi_added: 'upi_saved', upi_saved: 'upi_saved', upi: 'upi_saved',
          submission: 'submission', submission_received: 'submission', submitted: 'submission',
          payout: 'payout', payout_sent: 'payout', paid: 'payout',
        }
        const canonicalEvent = SCOUT_EVENT_ALIASES[scoutEventToSend] || scoutEventToSend
        const mapped = SCOUT_EVENT_MAP[canonicalEvent]
        const activeTemplates = activeScoutTemplates
        // Dedup gate. signup/kyc_received/kyc_approved/upi_saved are ONE-TIME
        // lifecycle stages — a scout can only reach "KYC received" once, ever,
        // so a 5-minute time window isn't enough: confirmed live, the website
        // kept re-sending the same kyc_submitted event hours apart (6:42 PM,
        // 6:50 PM, 7:00 AM next day) and each one slipped past the old
        // 5-minute-only gate as a "new" send. These 4 use an unbounded
        // (Infinity) window — ANY prior send of this template to this lead,
        // no matter how old, blocks another. submission/payout are genuinely
        // repeatable (a scout's 2nd/3rd property, a later payout) so they keep
        // the 5-minute window — only true back-to-back duplicates are squashed.
        const ONE_TIME_SCOUT_EVENTS = new Set(['signup', 'kyc_received', 'kyc_approved', 'upi_saved'])
        // "submission received" was firing on EVERY property a scout sent (seen
        // live: 5 identical "we received your submission" in 90 min = spam). The
        // 3h window (2026-07-13) still let an all-day scout collect 4-5 identical
        // texts per day — re-reported via Report Issue ISS-20260716-qj09j5 (one
        // active scout: 16 sends in 4 days). One acknowledgement per DAY is
        // enough; the Scout Portal lists every submission. payout stays
        // repeatable on the default short window (each payout is distinct and
        // important).
        const SUBMISSION_DEDUP_MS = 24 * 60 * 60 * 1000
        const dedupWindowMs = ONE_TIME_SCOUT_EVENTS.has(canonicalEvent) ? Infinity
          : canonicalEvent === 'submission' ? SUBMISSION_DEDUP_MS
          : undefined
        const recentDuplicate = mapped
          ? await wasTemplateRecentlySent(supabase, leadId, mapped.template, dedupWindowMs)
          : false
        if (!mapped) {
          console.log(`[inbound] Lokazen scout event has no template mapping: ${scoutEventToSend} (context persisted, no send)`)
        } else if (!activeTemplates.has(mapped.template)) {
          console.log(`[inbound] Lokazen scout template disabled via LOKAZEN_ACTIVE_SCOUT_TEMPLATES override: ${mapped.template} (context persisted, no send).`)
        } else if (recentDuplicate) {
          console.log(`[inbound] Lokazen scout template SKIPPED as duplicate (sent within last 5 min): ${mapped.template} lead=${leadId}`)
        } else {
          // Fully static templates (params.length === 0) get an empty components
          // array — Meta hard-fails on a BODY component whose parameter count
          // doesn't match the template's placeholder count (seen live: sending 2
          // params to a 0-param template → 132000 error), so don't send a BODY
          // component at all when there's nothing to fill in.
          const waRes = await sendWhatsAppTemplate(
            normalizedPhone,
            mapped.template,
            mapped.params.length > 0 ? [{ type: 'body', parameters: mapped.params }] : [],
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
              template_buttons: TEMPLATE_BUTTONS[mapped.template] || [],
              template_button_type: TEMPLATE_BUTTON_TYPES[mapped.template] || 'quick_reply',
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
            // We just reached the scout on WhatsApp — that's the latest touch now
            // (mirrors the brand/owner welcome path above, which already does this;
            // the scout path never did, so the Leads table kept showing "Web" as
            // last touch even after PROXe sent a scout template).
            await supabase.from('all_leads')
              .update({ last_touchpoint: 'whatsapp', last_interaction_at: new Date().toISOString() })
              .eq('id', leadId)
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

    // ── Webinar registration → confirmation template ─────────────────────────
    // Guarded: dedup window (re-submits / Pabbly retries), soft-fail while the
    // template is still in Meta review (no needs_human_followup noise — the
    // reminder cron + counsellors don't depend on this send).
    if (phone && isWebinarReg) {
      const firstName = (leadName !== 'Lead' && isLikelyRealPersonName(leadName) ? leadName : 'there').split(' ')[0]
      const webinarName = String(cfields.webinar_name || cfields.webinar_topic || (body as any).webinar_name || (body as any).event_name || '').trim()
      const webinarDate = String(cfields.webinar_date || cfields.webinar_datetime || (body as any).webinar_date || '').trim()
      // Single confirmation template for all audiences (windchasers_webinar_confirmation_v1).
      const confirmTpl = 'windchasers_webinar_confirmation_v1'
      const confirmAlreadySent = await wasTemplateRecentlySent(supabase, leadId, confirmTpl)
      if (confirmAlreadySent) {
        console.log(`[inbound] Webinar confirm SKIPPED as duplicate lead=${leadId} phone=${phone}`)
      } else try {
        const result = await sendWebinarConfirm(phone, firstName, webinarName, webinarDate)
        // Log the ACTUAL approved template body + buttons (topic/date/time filled)
        // so the inbox shows exactly what the customer received, not a one-liner.
        const [wDatePart, wTimePart] = String(webinarDate || '').split(/\s+at\s+/i)
        const rendered = renderWaTemplate(confirmTpl, {
          customer_name: firstName,
          topic: webinarName || 'our upcoming webinar',
          date: (wDatePart || webinarDate || 'the scheduled date').trim(),
          time: (wTimePart || 'the scheduled time').trim(),
        })
        const bodyText = rendered?.content
          || `Hi ${firstName}, you're registered for ${webinarName || 'our upcoming webinar'} on ${webinarDate || 'the scheduled date'}.`
        await supabase.from('conversations').insert({
          lead_id: leadId,
          channel: 'whatsapp',
          sender: 'agent',
          content: result.success ? bodyText : `[Template send FAILED: ${confirmTpl}]\n\n${bodyText}`,
          message_type: 'template',
          metadata: {
            template_name: confirmTpl,
            template_language: 'en',
            auto_sent: true,
            trigger: 'webinar_registration',
            sent_by: 'system (inbound webhook)',
            audience: brandCtxData.user_type || null,
            webinar_name: webinarName || null,
            webinar_date: webinarDate || null,
            ...(rendered?.buttons?.length ? { template_buttons: rendered.buttons } : {}),
            ...(rendered?.footer ? { template_footer: rendered.footer } : {}),
            // Store Meta's wamid so delivery/read receipts can match this row.
            ...(result.messageId ? { wa_message_id: result.messageId, delivery_status: 'sent' } : {}),
            send_succeeded: !!result.success,
            send_error: result.success ? null : (result.error || 'unknown'),
          },
        })
        if (result.success) {
          // The last touch is now WhatsApp (the confirm we just sent), not the form.
          await supabase.from('all_leads').update({ last_touchpoint: 'whatsapp', last_interaction_at: now }).eq('id', leadId)
        }
        if (!result.success) {
          console.error(`[inbound] Webinar confirm send FAILED lead=${leadId} phone=${phone} tpl=${confirmTpl} error=${result.error}`)
        } else {
          console.log(`[inbound] Webinar confirm OK lead=${leadId} phone=${phone} tpl=${confirmTpl} webinar=${webinarName}`)
        }
      } catch (err: any) {
        console.error(`[inbound] Webinar confirm EXCEPTION lead=${leadId} phone=${phone}: ${err?.message || err}`)
      }
    }

    // ── Offline-event registration → confirmation template ────────────────────
    // Demo class / open house etc. - dedicated template (distinct from
    // windchasers_demo_offline_v2, which is the unrelated 1-on-1 "book a demo"
    // campus-visit flow). This fires once the lead actually completes THIS
    // landing-page form - the real "you're confirmed" moment, mirroring the
    // webinar confirm above. PENDING Meta review as of 2026-07-21 - soft-fails
    // (logs, doesn't throw) until approved, same as the webinar confirm.
    // Guarded the same way: dedup window + soft-fail.
    if (phone && isOfflineEventLead) {
      const firstName = (leadName !== 'Lead' && isLikelyRealPersonName(leadName) ? leadName : 'there').split(' ')[0]
      const eventName = String(cfields.offline_event_name || cfields.event_name || (body as any).offline_event_name || (body as any).event_name || '').trim()
      const eventDate = String(cfields.offline_event_date || cfields.event_date || (body as any).offline_event_date || '').trim()
      const confirmTpl = 'windchasers_offline_event_confirmation_v2'
      const confirmAlreadySent = await wasTemplateRecentlySent(supabase, leadId, confirmTpl)
      if (confirmAlreadySent) {
        console.log(`[inbound] Offline-event confirm SKIPPED as duplicate lead=${leadId} phone=${phone}`)
      } else try {
        const [eDatePart, eTimePart] = String(eventDate || '').split(/\s+at\s+/i)
        const dateDisplay = (eDatePart || eventDate || 'the scheduled date').trim()
        const timeDisplay = (eTimePart || '11:00 AM IST').trim()
        const result = await sendOfflineEventConfirm(phone, firstName, eventName || 'the WindChasers Demo Class', eventDate || `${dateDisplay} at ${timeDisplay}`)
        const rendered = renderWaTemplate(confirmTpl, {
          customer_name: firstName,
          event_name: eventName || 'the WindChasers Demo Class',
          date: dateDisplay,
          time: timeDisplay,
        })
        const bodyText = rendered?.content
          || `Hi ${firstName}, you're all set for ${eventName || 'the demo class'} on ${dateDisplay} at ${timeDisplay}.`
        await supabase.from('conversations').insert({
          lead_id: leadId,
          channel: 'whatsapp',
          sender: 'agent',
          content: result.success ? bodyText : `[Template send FAILED: ${confirmTpl}]\n\n${bodyText}`,
          message_type: 'template',
          metadata: {
            template_name: confirmTpl,
            template_language: 'en',
            auto_sent: true,
            trigger: 'offline_event_registration',
            sent_by: 'system (inbound webhook)',
            offline_event_name: eventName || null,
            offline_event_date: eventDate || null,
            send_succeeded: !!result.success,
            send_error: result.success ? null : (result.error || 'unknown'),
          },
        })
        if (result.success) {
          await supabase.from('all_leads').update({ last_touchpoint: 'whatsapp', last_interaction_at: now }).eq('id', leadId)
        }
        if (!result.success) {
          console.error(`[inbound] Offline-event confirm send FAILED lead=${leadId} phone=${phone} tpl=${confirmTpl} error=${result.error}`)
        } else {
          console.log(`[inbound] Offline-event confirm OK lead=${leadId} phone=${phone} tpl=${confirmTpl} event=${eventName}`)
        }
      } catch (err: any) {
        console.error(`[inbound] Offline-event confirm EXCEPTION lead=${leadId} phone=${phone}: ${err?.message || err}`)
      }
    }

    // ── Cabin-crew lead → dedicated welcome (website path) ────────────────────
    // Mirrors the FB path. sendCabinCrewWelcome falls back to the generic
    // welcome until the cabin-crew template is Meta-approved, so a cabin-crew
    // lead is never left unwelcomed. Dedup-guarded against re-submits/retries.
    if (phone && isCabinCrewLead && !isWebinarReg && !isPatSubmission && !isDemoBooking) {
      const firstName = (leadName !== 'Lead' && isLikelyRealPersonName(leadName) ? leadName : 'there').split(' ')[0]
      const ccAlready =
        (await wasTemplateRecentlySent(supabase, leadId, 'windchasers_cabin_crew_welcome_v1')) ||
        (await wasTemplateRecentlySent(supabase, leadId, 'windchasers_generic_welcome_v3')) ||
        (await wasTemplateRecentlySent(supabase, leadId, 'windchasers_generic_welcome_v1'))
      if (ccAlready) {
        console.log(`[inbound] Cabin-crew welcome SKIPPED as duplicate lead=${leadId} phone=${phone}`)
      } else try {
        const result = await sendCabinCrewWelcome(phone, firstName)
        const rendered = renderWaTemplate(result.templateUsed, { customer_name: firstName, parent_name: firstName })
        const bodyText = rendered?.content || `Hi ${firstName}, welcome to Windchasers cabin crew training.`
        await supabase.from('conversations').insert({
          lead_id: leadId,
          channel: 'whatsapp',
          sender: 'agent',
          content: result.success ? bodyText : `[Template send FAILED: ${result.templateUsed}]\n\n${bodyText}`,
          message_type: 'template',
          metadata: {
            template_name: result.templateUsed,
            template_language: 'en',
            auto_sent: true,
            trigger: 'cabin_crew_lead',
            sent_by: 'system (inbound webhook)',
            ...(rendered?.buttons?.length ? { template_buttons: rendered.buttons } : {}),
            ...(rendered?.footer ? { template_footer: rendered.footer } : {}),
            ...(result.messageId ? { wa_message_id: result.messageId, delivery_status: 'sent' } : {}),
            send_succeeded: !!result.success,
            send_error: result.success ? null : (result.error || 'unknown'),
          },
        })
        if (result.success) {
          await supabase.from('all_leads').update({ last_touchpoint: 'whatsapp', last_interaction_at: now }).eq('id', leadId)
        }
        if (!result.success) {
          console.error(`[inbound] Cabin-crew welcome FAILED lead=${leadId} phone=${phone} tpl=${result.templateUsed} error=${result.error}`)
        } else {
          console.log(`[inbound] Cabin-crew welcome OK lead=${leadId} phone=${phone} tpl=${result.templateUsed}`)
        }
      } catch (err: any) {
        console.error(`[inbound] Cabin-crew welcome EXCEPTION lead=${leadId} phone=${phone}: ${err?.message || err}`)
      }
    }

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
        const firstName = (leadName !== 'Lead' && isLikelyRealPersonName(leadName) ? leadName : 'there').split(' ')[0]
        const tierKey = (derivedTier || tier || '').toLowerCase().trim()
        const tierLabel = TIER_LABELS[tierKey] || (tier || 'Pending')
        const tierMessage = TIER_MESSAGES[tierKey] || 'A counsellor can walk you through the next steps.'
        const score100 = Math.round((score * 100) / 150)
        const renderedBody = renderPATResultBody(firstName, score100, tierLabel, tierMessage)

        // Dedup gate — this webhook can be called more than once for the same
        // PAT submission (retry, double form-submit, page reload after
        // completing the test). Skip the send if already sent within the
        // window; everything else in the function still runs normally.
        const patAlreadySent = await wasTemplateRecentlySent(supabase, leadId, 'windchasers_pat_result_v2')
        if (patAlreadySent) {
          console.log(`[inbound] PAT WA SKIPPED as duplicate (sent within last 5 min) lead=${leadId} phone=${phone}`)
        } else try {
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
    // ── bcon welcome (website forms + AI Lead Machine / Meta feeds) ──────────
    // Fires INLINE at intake, mirroring windchasers — the first_outreach task
    // path died with the task-worker. Dedup-guarded against re-submits.
    if (isBconWelcomeLead) {
      const firstName = (leadName !== 'Lead' && leadName ? leadName : 'there').split(' ')[0]
      const bconWelcomeAlready =
        (await wasTemplateRecentlySent(supabase, leadId, 'bcon_lead_machine_meta_welcome_v1_')) ||
        (await wasTemplateRecentlySent(supabase, leadId, 'bcon_welcome_web_v1'))
      if (bconWelcomeAlready) {
        console.log(`[inbound] bcon welcome SKIPPED as duplicate lead=${leadId} phone=${phone}`)
      } else {
        const bconBrandName = (brand_name || '').trim() || String(cf2.company || cf2.brand_name || '').trim() || 'your business'
        const isMetaLead =
          ['meta_forms', 'facebook', 'facebook_lead', 'meta', 'instagram'].includes(normalizedSource) ||
          /lead\s*machine/i.test(String(campaign || cf2.utm_campaign || cf2.form_name || ''))
        let bconTpl: string
        let bconBody: string
        let bconButtons: string[]
        let bconRes: { success: boolean; error?: string; messageId?: string }
        if (isMetaLead) {
          bconTpl = 'bcon_lead_machine_meta_welcome_v1_'
          bconButtons = ['Yes, Book a Demo', 'Tell me more in chat']
          bconBody = `Hi ${firstName},\n\nThanks for your interest in *AI Lead Machine* for ${bconBrandName}.\n\nWe help businesses like yours capture, qualify and convert more leads on autopilot, fully done for you.\n\nWant to see it in action?`
          bconRes = await sendNamedTemplate(phone, bconTpl, [
            { name: 'customer_name', value: firstName },
            { name: 'brand_name', value: bconBrandName },
          ])
        } else {
          bconTpl = 'bcon_welcome_web_v1'
          bconButtons = ['Book a Call', 'Tell Me More']
          const bconInterest = String(cf2.service_interest || cf2.interest || cf2.goal || notes || '').trim() || 'growing your business'
          const bconProbe = String(cf2.message || cf2.probe_question || '').trim().slice(0, 120) || 'Tell me a bit about what you have in mind'
          bconBody = `Hey ${firstName}, got your enquiry about ${bconInterest} for ${bconBrandName}.\n\n${bconProbe}, Lets get on call to discuss this.`
          bconRes = await sendNamedTemplate(phone, bconTpl, [
            { name: 'customer_name', value: firstName },
            { name: 'service_interest', value: bconInterest },
            { name: 'brand_name', value: bconBrandName },
            { name: 'probe_question', value: bconProbe },
          ])
        }
        try {
          await supabase.from('conversations').insert({
            lead_id: leadId,
            channel: 'whatsapp',
            sender: 'agent',
            content: bconRes.success ? bconBody : `[Template send FAILED: ${bconTpl}] ${bconRes.error || ''}`,
            message_type: 'template',
            metadata: {
              source: 'inbound_welcome',
              template_name: bconTpl,
              template_buttons: bconButtons,
              ai_generated: true,
              send_succeeded: bconRes.success,
              ...(bconRes.success ? {} : { send_error: bconRes.error || 'unknown' }),
              ...(bconRes.messageId ? { wa_message_id: bconRes.messageId, whatsapp_message_id: bconRes.messageId } : {}),
            },
          })
        } catch (logErr: any) {
          console.error('[inbound] bcon welcome log failed:', logErr?.message)
        }
        console.log(`[inbound] bcon welcome ${bconRes.success ? 'SENT' : 'FAILED'} tpl=${bconTpl} lead=${leadId}${bconRes.error ? ` err=${bconRes.error}` : ''}`)
      }
    }

    // ── Pilot / generic / parent welcome (windchasers website + Res1/Pabbly) ──
    // Re-enabled: the v3 welcome templates are Meta-approved. Fires immediately
    // for a brand-NEW lead that isn't a webinar/cabin/PAT/demo submission — so
    // pilot_training_hero, generic website forms, and meta_lead_form leads (incl.
    // the Res1 Platform feed that lands as 'manual') get a first touch instead of
    // sitting silent on a dead first_outreach task. Parent enquiries get the
    // parent template (named param parent_name); everyone else pilot vs generic
    // by source. Dedup-guarded against re-submits / retries.
    if (isWindchasersWelcomeLead) {
      const firstName = (leadName !== 'Lead' && isLikelyRealPersonName(leadName) ? leadName : 'there').split(' ')[0]
      const welcomeAlready =
        (await wasTemplateRecentlySent(supabase, leadId, 'windchasers_generic_welcome_v3')) ||
        (await wasTemplateRecentlySent(supabase, leadId, 'windchasers_generic_welcome_v1')) ||
        (await wasTemplateRecentlySent(supabase, leadId, 'windchasers_pilot_welcome_v3')) ||
        (await wasTemplateRecentlySent(supabase, leadId, 'windchasers_pilot_welcome_v2')) ||
        (await wasTemplateRecentlySent(supabase, leadId, 'windchasers_pilot_parents_welcome_v1')) ||
        (await wasTemplateRecentlySent(supabase, leadId, 'windchasers_cabin_crew_welcome_v1'))
      if (welcomeAlready) {
        console.log(`[inbound] Welcome SKIPPED as duplicate lead=${leadId} phone=${phone}`)
      } else {
        const signals = [
          normalizedSource,
          String(cf2.form_type || ''),
          String(cf2.form_name || cf2.campaign || campaign || ''),
          String(cf2.ad_name || ''),
          String(cf2.utm_campaign || cf2.utm_content || ''),
          String(brandCtxData.course_interest || ''),
        ]
        const isParentLead = brandCtxData.user_type === 'parent' || isParentSource(...signals)
        let welcomeTpl: string
        let sendResult: { success: boolean; error?: string }
        if (isParentLead) {
          welcomeTpl = 'windchasers_pilot_parents_welcome_v1'
          sendResult = await sendParentWelcomeTemplate(phone, firstName)
        } else if (isFlightSchoolLead) {
          // Flight-school leads get the generic welcome — it carries a "Flight
          // Schools" button — rather than the pilot-training welcome. (A dedicated
          // windchasers_flight_school_welcome_v1 can replace this once approved.)
          welcomeTpl = 'windchasers_generic_welcome_v3'
          sendResult = await sendWelcomeTemplate(phone, firstName, welcomeTpl)
        } else {
          welcomeTpl = pickWelcomeTemplate(...signals)
          sendResult = await sendWelcomeTemplate(phone, firstName, welcomeTpl)
        }
        const rendered = renderWaTemplate(welcomeTpl, { customer_name: firstName, parent_name: firstName })
        const bodyText = rendered?.content || (welcomeTpl.includes('parents')
          ? `Hi ${firstName}, welcome to Windchasers.`
          : `Hey ${firstName}! Welcome to Windchasers.`)
        try {
          await supabase.from('conversations').insert({
            lead_id: leadId,
            channel: 'whatsapp',
            sender: 'agent',
            content: sendResult.success ? bodyText : `[Template send FAILED: ${welcomeTpl}]\n\n${bodyText}`,
            message_type: 'template',
            metadata: {
              template_name: welcomeTpl,
              template_language: 'en',
              auto_sent: true,
              trigger: isParentLead ? 'parent_lead' : 'new_lead_welcome',
              ...(rendered?.buttons?.length ? { template_buttons: rendered.buttons } : {}),
              ...(rendered?.footer ? { template_footer: rendered.footer } : {}),
              sent_by: 'system (inbound webhook)',
              ...(sendResult.messageId ? { wa_message_id: sendResult.messageId, delivery_status: 'sent' } : {}),
              send_succeeded: !!sendResult.success,
              send_error: sendResult.success ? null : (sendResult.error || 'unknown'),
            },
          })
        } catch (err: any) {
          console.error(`[inbound] Welcome log EXCEPTION lead=${leadId}: ${err?.message || err}`)
        }
        if (sendResult.success) {
          await supabase.from('all_leads').update({ last_touchpoint: 'whatsapp', last_interaction_at: now }).eq('id', leadId)
        }
        if (!sendResult.success) {
          console.error(`[inbound] Welcome FAILED lead=${leadId} phone=${phone} tpl=${welcomeTpl} error=${sendResult.error}`)
        } else {
          console.log(`[inbound] Welcome OK lead=${leadId} phone=${phone} tpl=${welcomeTpl}`)
        }
      }
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
        const firstName = (leadName !== 'Lead' && isLikelyRealPersonName(leadName) ? leadName : 'there').split(' ')[0]
        const renderedBody = demoFormat === 'online'
          ? renderDemoOnlineBody(firstName, dateDisplay, timeDisplay)
          : renderDemoOfflineBody(firstName, dateDisplay, timeDisplay)
        // Dedup gate — this webhook can be called more than once for the same
        // demo booking (retry, double form-submit, page reload after booking).
        // Skip the send if already sent within the window; everything else in
        // the function still runs normally.
        const demoAlreadySent = await wasTemplateRecentlySent(supabase, leadId, templateName)
        if (demoAlreadySent) {
          console.log(`[inbound] Demo WA SKIPPED as duplicate (sent within last 5 min) lead=${leadId} phone=${phone} template=${templateName}`)
        } else try {
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
