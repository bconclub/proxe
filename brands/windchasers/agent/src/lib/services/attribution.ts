/**
 * services/attribution.ts — Source / First Touch resolution
 *
 * Three orthogonal concepts:
 *   SOURCE       — marketing channel that drove them to us (Instagram, Google, Direct, ...)
 *                  Set ONCE on lead creation. Never updated.
 *   FIRST TOUCH  — first interface/form they engaged with (Demo Form, PAT, WhatsApp Form, ...)
 *                  Set ONCE on lead creation. Never updated.
 *   LAST TOUCH   — most recent channel (mutates over time, handled by `last_touchpoint` column)
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
  google: 'Google',
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

export function deriveSource(
  utmSource: string | null | undefined,
  channelFallback?: string,
  resolvedChannel?: string | null,
): { source: string; source_label: string } {
  // PRIORITY 1: resolvedChannel — the website's own pre-resolved channel
  // (custom_fields.channel: ig, fb, google_ads, facebook_ads, …). This is
  // the most reliable signal because the website has already done the
  // click-id → channel mapping (e.g. fbclid → facebook_ads) that UTM
  // tagging alone misses. Meta auto-tags ads with fbclid INSTEAD of UTM,
  // so reading utm_source first buckets every Meta-ad lead to "Direct".
  const rc = (resolvedChannel || '').toLowerCase().trim();
  if (rc && rc !== 'unknown' && rc !== 'direct') {
    return {
      source: rc,
      source_label: SOURCE_LABELS[rc] || titleCase(rc),
    };
  }
  // PRIORITY 2: utm_source (the classic signal, when explicit UTM is present)
  const clean = (utmSource || '').toLowerCase().trim();
  if (clean) {
    return {
      source: clean,
      source_label: SOURCE_LABELS[clean] || titleCase(clean),
    };
  }
  // PRIORITY 3: channelFallback (legacy — the inbound endpoint's `leadSource`
  // enum, e.g. 'form', 'pabbly'). Fall through to "Direct" for ambiguous ones.
  const ch = (channelFallback || 'direct').toLowerCase().trim();
  if (!ch || ch === 'web' || ch === 'form' || ch === 'manual' || ch === 'unknown') {
    return { source: 'direct', source_label: 'Direct' };
  }
  return {
    source: ch,
    source_label: SOURCE_LABELS[ch] || titleCase(ch),
  };
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
  // No form_type — use channel
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
   * Website's resolved channel (custom_fields.channel) — takes priority over
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
