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
  meta: 'Meta',
  meta_ads: 'Meta Ads',
  google: 'Google',
  google_ads: 'Google',
  googleads: 'Google',
  youtube: 'YouTube',
  yt: 'YouTube',
  linkedin: 'LinkedIn',
  twitter: 'X',
  x: 'X',
  tiktok: 'TikTok',
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
  pat_assessment: 'PAT Assessment',
  pilot_aptitude_test: 'PAT Assessment',
  pat: 'PAT Assessment',
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
): { source: string; source_label: string } {
  const clean = (utmSource || '').toLowerCase().trim();
  if (clean) {
    return {
      source: clean,
      source_label: SOURCE_LABELS[clean] || titleCase(clean),
    };
  }
  // No UTM — for web/form/manual fall through to "Direct", else use the channel
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
  utm?: AttributionPayload['utm'];
  pageUrl?: string | null;
}): AttributionPayload {
  const { source, source_label } = deriveSource(input.utmSource, input.channel || undefined);
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
