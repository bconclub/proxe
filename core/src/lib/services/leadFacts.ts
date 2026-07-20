// ─── LEAD FACTS - what the lead actually SAID, distilled for templates ──────
// The goal / brand / pain that fill template variables must come from the
// lead's own words: their form answers, the campaign they responded to, what
// they typed in chat. Fallbacks are last resort, never the default.
//
// Used by the follow-up cron sender and the Tasks-board previews so the
// message a lead receives (and the preview the operator sees) reflects the
// lead's reality, not "[goal]".

export interface LeadFacts {
  /** what they're after - "AI Lead Machine", their stated goal, etc. */
  goal: string | null
  /** their company/brand name */
  brandName: string | null
  /** the headache they described (e.g. "managing leads manually on WhatsApp") */
  painPoint: string | null
}

// Known form answers → human phrasing (bcon Meta-form vocabulary).
const SYSTEM_PAIN: Record<string, string> = {
  whatsapp_manually: 'managing leads manually on WhatsApp',
  no_system: 'having no lead system in place',
  excel: 'tracking leads in spreadsheets',
  spreadsheets: 'tracking leads in spreadsheets',
  crm_not_working: 'a CRM that is not working for you',
}

function clean(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.replace(/_/g, ' ').trim()
  return s.length > 1 ? s : null
}

export function resolveLeadFacts(lead: {
  service_interest?: string | null
  customer_name?: string | null
  unified_context?: Record<string, any> | null
} | null | undefined): LeadFacts {
  const uc: Record<string, any> = lead?.unified_context || {}
  const fd: Record<string, any> = uc.form_data || {}
  const raw: Record<string, any> = uc.raw_form_fields || {}
  const webProfile: Record<string, any> = uc.web?.profile || {}
  const waProfile: Record<string, any> = uc.whatsapp?.profile || {}

  // GOAL - their words first, then the campaign they answered, then nothing.
  const goal =
    clean(lead?.service_interest) ||
    clean(uc.bcon?.service_interest) ||
    clean(fd.service_interest) || clean(fd.goal) || clean(fd.interest) ||
    clean(webProfile.goal) || clean(webProfile.service_interest) ||
    clean(waProfile.goal) || clean(waProfile.service_interest) ||
    clean(uc.attribution?.utm?.campaign) || // the product/campaign they enquired on
    null

  // BRAND - their company, from any field they gave it in.
  const brandName =
    clean(uc.company) || clean(uc.bcon?.company) ||
    clean(fd.brand_name) || clean(fd.company) || clean(fd.business_name) ||
    clean(raw['Company Name']) || clean(raw.company_name) || clean(raw.brand_name) ||
    clean(webProfile.company) || clean(waProfile.company) ||
    null

  // PAIN - the headache they described, mapped from known form vocab.
  const sysKey = String(fd.current_system || raw.current_system || '').toLowerCase()
  const painPoint =
    clean(fd.pain_point) || clean(uc.pain_point) || clean(uc.bcon?.pain_point) ||
    (SYSTEM_PAIN[sysKey] || null) ||
    clean(webProfile.pain_point) ||
    null

  return { goal, brandName, painPoint }
}
