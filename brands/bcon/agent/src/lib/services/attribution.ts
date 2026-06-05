/**
 * services/attribution.ts — Source / First Touch resolution (BCON)
 *
 * Ported from the Windchasers core, trimmed to BCON's business context
 * (no aviation/PAT first-touch labels). Three orthogonal concepts:
 *   SOURCE       — marketing channel that drove them to us (Meta, Google,
 *                  Instagram, Facebook, Direct, ...). Set ONCE on lead
 *                  creation. Never updated.
 *   FIRST TOUCH  — first interface/form they engaged with (Lead Form, Demo,
 *                  Contact, WhatsApp, ...). Set ONCE on lead creation.
 *   LAST TOUCH   — most recent channel (mutates; handled by `last_touchpoint`).
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
  meta_forms: 'Meta Forms',
  meta_forms_clickthrough: 'Meta Forms',
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
  // Form-based entries (business context — no aviation/PAT)
  demo_form: 'Demo Form',
  demo_booked: 'Demo Form',
  demo: 'Demo',
  meta_lead_form: 'Meta Lead Form',
  facebook_lead: 'Meta Lead Form',
  whatsapp_clickthrough: 'WA Click Through',
  whatsapp_button: 'WA Popup',
  whatsapp_prelaunch: 'WA Popup',
  'whatsapp popup': 'WA Popup',
  newsletter: 'Newsletter',
  contact: 'Contact Form',
  landing_page: 'Landing Page',
  guide_download: 'Guide Download',
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
 * to us). Platform channels like 'whatsapp' or 'web' are NOT here — they
 * describe the surface the lead used to message us, not what brought them.
 */
const MARKETING_CHANNELS = new Set([
  'ig', 'instagram',
  'fb', 'facebook', 'facebook_ads', 'fb_ads',
  'meta', 'meta_ads', 'meta_forms', 'meta_forms_clickthrough',
  'google', 'google_ads', 'googleads',
  'bing', 'bing_ads',
  'youtube', 'yt',
  'linkedin', 'linkedin_ads',
  'tiktok', 'tiktok_ads',
  'twitter', 'x',
  'snapchat', 'pinterest',
  'email', 'newsletter',
  'referral', 'organic',
]);

export function deriveSource(
  utmSource: string | null | undefined,
  channelFallback?: string,
  resolvedChannel?: string | null,
): { source: string; source_label: string } {
  // PRIORITY 1: utm_source (explicit marketing tracking — the gold signal).
  const utm = (utmSource || '').toLowerCase().trim();
  if (utm && utm !== 'direct') {
    return { source: utm, source_label: SOURCE_LABELS[utm] || titleCase(utm) };
  }

  // PRIORITY 2: resolvedChannel — but ONLY if it's a marketing channel.
  const rc = (resolvedChannel || '').toLowerCase().trim();
  if (rc && MARKETING_CHANNELS.has(rc)) {
    return { source: rc, source_label: SOURCE_LABELS[rc] || titleCase(rc) };
  }

  // PRIORITY 3: channelFallback (inbound endpoint's leadSource enum, only
  // for non-ambiguous marketing-ish values like 'facebook' or 'google').
  const ch = (channelFallback || '').toLowerCase().trim();
  if (ch && MARKETING_CHANNELS.has(ch)) {
    return { source: ch, source_label: SOURCE_LABELS[ch] || titleCase(ch) };
  }

  // PRIORITY 4: 'direct' — no marketing signal at all. Platforms
  // (whatsapp / web / voice) are deliberately NOT surfaced as a source.
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
  /** Referring URL (e.g. CTWA ad source_url) — surfaced as 'Referrer' in the modal. */
  referrer?: string | null;
  captured_at: string;
}

export function buildAttribution(input: {
  utmSource?: string | null;
  formType?: string | null;
  channel?: string | null;
  /**
   * Resolved channel (e.g. fbclid → facebook_ads, gclid → google_ads) —
   * takes priority over utm_source when present.
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
