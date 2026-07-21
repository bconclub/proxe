/**
 * services/attribution.ts - Source / First Touch resolution
 *
 * Three orthogonal concepts:
 *   SOURCE       - marketing channel that drove them to us (Instagram, Google, Direct, ...)
 *                  Set ONCE on lead creation. Never updated.
 *   FIRST TOUCH  - first interface/form they engaged with (Demo Form, PAT, WhatsApp Form, ...)
 *                  Set ONCE on lead creation. Never updated.
 *   LAST TOUCH   - most recent channel (mutates over time, handled by `last_touchpoint` column)
 *
 * Stored at: unified_context.attribution
 *
 * Display fallback (for legacy leads without attribution):
 *   Source     → utm_source → first_touchpoint → 'direct'
 *   FirstTouch → form_type → first_touchpoint → 'web'
 */

const SOURCE_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  ig: 'Instagram',
  facebook: 'Facebook',
  fb: 'Facebook',
  facebook_ads: 'Facebook Ads',
  fb_ads: 'Facebook Ads',
  meta: 'Meta',
  meta_ads: 'Meta Ads',
  meta_forms_clickthrough: 'Meta Forms',
  // Plain 'google' = organic (came via a google.com referrer with no gclid/UTM).
  // Paid clicks resolve to google_ads (gclid/utm_medium=cpc), kept separate.
  google: 'Google Organic',
  google_organic: 'Google Organic',
  google_ads: 'Google Ads',
  googleads: 'Google Ads',
  youtube: 'YouTube',
  yt: 'YouTube',
  linkedin: 'LinkedIn',
  linkedin_ads: 'LinkedIn Ads',
  twitter: 'X',
  x: 'X',
  tiktok: 'TikTok',
  tiktok_ads: 'TikTok Ads',
  bing: 'Bing',
  bing_ads: 'Bing Ads',
  whatsapp: 'WhatsApp',
  email: 'Email',
  newsletter: 'Newsletter',
  direct: 'Direct',
  organic: 'Organic',
  referral: 'Referral',
};

const FIRST_TOUCH_LABELS: Record<string, string> = {
  // Form-based entries
  demo_form: 'Demo Form',
  demo_booked: 'Demo Form',
  pat_assessment: 'PAT',
  pilot_aptitude_test: 'PAT',
  pat: 'PAT',
  whatsapp_prelaunch: 'WA Popup',
  whatsapp_button: 'WA Popup',
  // Accept the space-separated form_type the website actually sends
  // (e.g. "WhatsApp Prelaunch" → "whatsapp prelaunch" after lowercase)
  'whatsapp prelaunch': 'WA Popup',
  'whatsapp popup': 'WA Popup',
  'whatsapp pop-up': 'WA Popup',
  'whatsapp pop up': 'WA Popup',
  meta_lead_form: 'Meta Lead Form',
  facebook_lead: 'Meta Lead Form',
  webinar: 'Webinar',
  offline_event: 'Offline Event',
  newsletter: 'Newsletter',
  contact: 'Contact Form',
  landing_page: 'Landing Page',
  // Channel-level (used when no form_type)
  whatsapp: 'WhatsApp',
  voice_call: 'Voice Call',
  voice: 'Voice Call',
  web: 'Web Chat',
  web_chat: 'Web Chat',
  chat_widget: 'Web Chat',
  manual: 'Manual Entry',
};

function titleCase(s: string): string {
  return s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Channels that represent a marketing source (the place that DROVE the lead
 * to us). Acceptable as the SOURCE column value.
 *
 * Platform channels like 'whatsapp' or 'web' are NOT in this set - they
 * describe the surface the lead used to message us, not what brought them
 * here. A WA-Popup lead has channel='whatsapp' but the marketing source
 * is whatever ad they came from (Instagram, Facebook Ads, etc.).
 */
const MARKETING_CHANNELS = new Set([
  'ig', 'instagram',
  'fb', 'facebook', 'facebook_ads', 'fb_ads',
  'meta', 'meta_ads', 'meta_forms_clickthrough',
  'google', 'google_ads', 'googleads', 'google_organic',
  'bing', 'bing_ads',
  'youtube', 'yt',
  'linkedin', 'linkedin_ads',
  'tiktok', 'tiktok_ads',
  'twitter', 'x',
  'snapchat', 'pinterest',
  'email', 'newsletter',
  'referral', 'organic',
]);

export const META_FORM_CLICKTHROUGH_SOURCE = 'meta_forms_clickthrough';
export const META_FORM_CLICKTHROUGH_LABEL = 'Meta Forms';
// First-touch (the SOURCE sub-line): these leads clicked through from a Meta
// lead form into WhatsApp, so the sub-line reads "WA Click Through".
export const META_FORM_CLICKTHROUGH_FIRST_TOUCH = 'whatsapp_clickthrough';
export const META_FORM_CLICKTHROUGH_FIRST_TOUCH_LABEL = 'WA Click Through';

/**
 * Detects a Meta lead-form "Chat on WhatsApp" click-through. Such leads arrive
 * as a normal WhatsApp inbound whose FIRST message is the form prefill, e.g.
 *   "Hello! I filled out your form ... what_is_your_concern?: ... first name: ..."
 * They carry no UTM and no marketing channel, so without this they get tagged
 * 'Direct'. We relabel them 'Meta Forms Click-through' (distinct from a native
 * Meta Lead Form integration).
 */
export function isMetaFormClickThrough(text: string | null | undefined): boolean {
  if (!text) return false;
  // Meta's prefill copy varies: "filled out your form", "filled in your form",
  // "filled up the form", "filled your form", etc.
  if (/filled\s*(in|out|up)?\s*(your|the)?\s*form\b/i.test(text)) return true;
  // Fallback: 2+ snake_case form-field keys like "what_is_your_x?:"
  const keys = text.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\??\s*:/gi);
  return !!keys && keys.length >= 2;
}

export function deriveSource(
  utmSource: string | null | undefined,
  channelFallback?: string,
  resolvedChannel?: string | null,
): { source: string; source_label: string } {
  // PRIORITY 1: utm_source (explicit marketing tracking - the gold signal).
  // When a UTM is present the lead came from a tracked campaign and that's
  // unambiguously the marketing source.
  const utm = (utmSource || '').toLowerCase().trim();
  if (utm && utm !== 'direct') {
    return { source: utm, source_label: SOURCE_LABELS[utm] || titleCase(utm) };
  }

  // PRIORITY 2: resolvedChannel - but ONLY if it's a marketing channel.
  // The website's `channel` field also fills in 'whatsapp' / 'web' / 'direct'
  // for un-tracked traffic; those are platforms, not marketing sources, so
  // we reject them here. Useful values that DO win: facebook_ads (resolved
  // from fbclid), google_ads (from gclid), ig/fb/etc. when explicit.
  const rc = (resolvedChannel || '').toLowerCase().trim();
  if (rc && MARKETING_CHANNELS.has(rc)) {
    return { source: rc, source_label: SOURCE_LABELS[rc] || titleCase(rc) };
  }

  // PRIORITY 3: channelFallback (inbound endpoint's `leadSource` enum, only
  // for non-ambiguous marketing-ish values like 'facebook' or 'google').
  const ch = (channelFallback || '').toLowerCase().trim();
  if (ch && MARKETING_CHANNELS.has(ch)) {
    return { source: ch, source_label: SOURCE_LABELS[ch] || titleCase(ch) };
  }

  // PRIORITY 4: 'direct' - no marketing signal at all. We deliberately do
  // NOT surface 'whatsapp' / 'web' here as a source value (they're platforms).
  return { source: 'direct', source_label: 'Direct' };
}

export function deriveFirstTouch(
  formType: string | null | undefined,
  channelFallback: string = 'web',
): { first_touch: string; first_touch_label: string } {
  const ft = (formType || '').toLowerCase().trim();
  if (ft && FIRST_TOUCH_LABELS[ft]) {
    return { first_touch: ft, first_touch_label: FIRST_TOUCH_LABELS[ft] };
  }
  if (ft) {
    return { first_touch: ft, first_touch_label: titleCase(ft) };
  }
  // No form_type - use channel
  const ch = channelFallback.toLowerCase().trim();
  return {
    first_touch: ch,
    first_touch_label: FIRST_TOUCH_LABELS[ch] || titleCase(ch),
  };
}

export interface AttributionPayload {
  source: string;
  source_label: string;
  first_touch: string;
  first_touch_label: string;
  utm?: {
    source?: string | null;
    medium?: string | null;
    campaign?: string | null;
    content?: string | null;
    term?: string | null;
  };
  page_url?: string | null;
  captured_at: string;
}

export function buildAttribution(input: {
  utmSource?: string | null;
  formType?: string | null;
  channel?: string | null;
  /**
   * Website's resolved channel (custom_fields.channel) - takes priority over
   * utm_source when present. The website resolves fbclid → facebook_ads,
   * gclid → google_ads, etc., so this catches Meta-ad leads that arrive
   * without UTM tagging.
   */
  resolvedChannel?: string | null;
  utm?: AttributionPayload['utm'];
  pageUrl?: string | null;
}): AttributionPayload {
  const { source, source_label } = deriveSource(
    input.utmSource,
    input.channel || undefined,
    input.resolvedChannel,
  );
  const { first_touch, first_touch_label } = deriveFirstTouch(input.formType, input.channel || 'web');
  return {
    source,
    source_label,
    first_touch,
    first_touch_label,
    ...(input.utm ? { utm: input.utm } : {}),
    ...(input.pageUrl ? { page_url: input.pageUrl } : {}),
    captured_at: new Date().toISOString(),
  };
}
