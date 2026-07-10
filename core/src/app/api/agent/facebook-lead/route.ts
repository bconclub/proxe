/**
 * POST /api/agent/facebook-lead
 *
 * Receives Facebook Lead Ad data from Pabbly Connect and:
 *   1. Creates / deduplicates the lead in all_leads (source: facebook_lead)
 *   2. Fires the windchasers_followup WhatsApp template immediately
 *   3. Logs the outbound message to conversations
 *
 * Pabbly field mapping:
 *   name / full_name            → customer name
 *   phone / phone_number        → WhatsApp number (required)
 *   email                       → email (optional)
 *   education / education_level → education level
 *   city                        → city
 *   platform                    → Meta placement surface: 'ig' | 'fb' (drives source badge)
 *   campaign_name / adset_name / ad_name / form_name / form_id / lead_id → ad metadata
 *   class_12_pcm / start_timeline / age → lead-form qualifying answers
 *   utm_source/medium/campaign/content → ONLY real UTMs — never hardcode a label here
 *
 * Auth: x-api-key header must match INBOUND_API_KEY env var.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient, normalizePhone, logMessage, sendWelcomeTemplate, pickWelcomeTemplate, isParentSource, sendParentWelcomeTemplate, isCabinCrewSource, sendCabinCrewWelcome, buildAttribution, isLikelyRealPersonName } from '@/lib/services';
import { BRAND_ID } from '@/configs';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const apiKey = request.headers.get('x-api-key');
    const expectedKey = process.env.INBOUND_API_KEY;
    if (!expectedKey || apiKey !== expectedKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // ── Field parsing ─────────────────────────────────────────────────────────
    // `rawName` is used for the required-field gate (we never drop a lead because
    // somebody typed junk into the name field — phone is the real identifier).
    // `cleanName` is the real-person-validated name for storage and template use.
    const rawName: string =
      body.name || body.full_name || body.customer_name || body.Name || '';
    // Prefer full_name (FB profile name) over form field `name` (often a referral
    // code or other junk people type into the first form field).
    const cleanName: string =
      [body.full_name, body.name, body.customer_name, body.Name]
        .find((n): n is string => typeof n === 'string' && isLikelyRealPersonName(n)) ?? '';
    const name: string = rawName;
    const phone: string =
      body.phone || body.phone_number || body.mobile || body.Phone || body.whatsapp || '';
    const email: string | null =
      body.email || body.email_address || body.Email || null;
    const education: string | null =
      body.education || body.education_level || body.qualification || null;
    const city: string | null =
      body.city || body.City || body.location || null;

    // Qualifying answers from the lead form (mapped in Pabbly to these keys)
    const class12Pcm: string | null =
      body.class_12_pcm || body.class12_pcm || null;
    const startTimeline: string | null =
      body.start_timeline || body.when_looking_to_start || null;
    const age: string | null = body.age != null ? String(body.age) : null;

    // UTM attribution from Facebook Ads
    const utmData = {
      utm_source:   body.utm_source   || null,
      utm_medium:   body.utm_medium   || null,
      utm_campaign: body.utm_campaign || null,
      utm_content:  body.utm_content  || null,
    };

    // Facebook campaign metadata
    // `platform` is Meta's per-lead placement surface: 'ig' (Instagram) or
    // 'fb' (Facebook) — the true marketing source for lead-form leads.
    const platform: string =
      String(body.platform || '').toLowerCase().trim();
    const facebookMeta = {
      platform:      platform || null,
      ad_name:       body.ad_name || null,
      adset_name:    body.adset_name || null,
      campaign_name: body.campaign_name || body.campaign || null,
      form_name:     body.form_name || body.leadgen_form_name || null,
      form_id:       body.form_id || null,
      lead_id:       body.lead_id || body.fb_lead_id || null,
      ...utmData,
    };

    if (!phone) {
      return NextResponse.json({ error: 'Missing required field: phone' }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: 'Missing required field: name' }, { status: 400 });
    }

    const supabase = getServiceClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
    }

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return NextResponse.json({ error: 'Invalid phone number format' }, { status: 400 });
    }

    const brand = BRAND_ID;

    // ── 1. Deduplicate by phone ───────────────────────────────────────────────
    const { data: existing } = await supabase
      .from('all_leads')
      .select('id, unified_context, follow_up_cooldown_until')
      .eq('customer_phone_normalized', normalizedPhone)
      .eq('brand', brand)
      .maybeSingle();

    const now = new Date().toISOString();
    let leadId: string;

    const windchasersProfile: Record<string, string> = {};
    if (education) windchasersProfile.education = education;
    if (city) windchasersProfile.city = city;
    if (class12Pcm) windchasersProfile.class_12_pcm = class12Pcm;
    if (startTimeline) windchasersProfile.start_timeline = startTimeline;
    if (age) windchasersProfile.age = age;

    // Attribution: Facebook Lead Form is always Meta paid. Source precedence:
    // real UTM (rare on lead forms) → placement platform (ig → Instagram,
    // fb → Facebook) → meta_ads. Pabbly must NOT hardcode utm_source — that's
    // how every lead ended up badged "Res1 Platform".
    const platformSource =
      platform === 'ig' ? 'ig' : platform === 'fb' ? 'facebook' : null;
    const attribution = buildAttribution({
      utmSource: facebookMeta.utm_source || platformSource || 'meta_ads',
      formType: 'meta_lead_form',
      channel: 'meta_forms',
      utm: {
        source:   facebookMeta.utm_source   || null,
        medium:   facebookMeta.utm_medium   || null,
        campaign: facebookMeta.utm_campaign || null,
        content:  facebookMeta.utm_content  || null,
        term:     null,
      },
      pageUrl: null,
    });

    if (existing) {
      leadId = existing.id;
      const existingCtx = existing.unified_context || {};

      await supabase
        .from('all_leads')
        .update({
          ...(cleanName ? { customer_name: cleanName } : {}),
          ...(email ? { email } : {}),
          phone,
          customer_phone_normalized: normalizedPhone,
          last_touchpoint: 'facebook_lead',
          last_interaction_at: now,
          unified_context: {
            ...existingCtx,
            facebook: {
              ...(existingCtx.facebook || {}),
              ...facebookMeta,
              last_lead_at: now,
            },
            windchasers: {
              ...(existingCtx.windchasers || {}),
              ...windchasersProfile,
            },
            // Attribution is immutable — keep existing if already set
            attribution: existingCtx.attribution ?? attribution,
          },
        })
        .eq('id', leadId);
    } else {
      // Brand-new lead — set first_touchpoint: facebook_lead directly
      const { data: created, error: insertError } = await supabase
        .from('all_leads')
        .insert({
          customer_name: cleanName || null,
          email,
          phone,
          customer_phone_normalized: normalizedPhone,
          brand,
          first_touchpoint: 'facebook_lead',
          last_touchpoint: 'facebook_lead',
          last_interaction_at: now,
          unified_context: {
            facebook: { ...facebookMeta, lead_created_at: now },
            windchasers: windchasersProfile,
            attribution,
          },
        })
        .select('id')
        .single();

      if (insertError || !created) {
        console.error('[facebook-lead] Insert failed:', insertError);
        return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 });
      }
      leadId = created.id;
    }

    // ── 2. Cooldown check — don't re-message an active lead ──────────────────
    const cooldownUntil = existing?.follow_up_cooldown_until;
    const inCooldown = cooldownUntil && new Date(cooldownUntil) > new Date();

    let whatsappSent = false;

    if (inCooldown) {
      console.log(`[facebook-lead] Lead ${leadId} in cooldown until ${cooldownUntil}, skipping WhatsApp`);
    } else {
      // ── 3. Fire the welcome template — parent enquiry gets its own template
      // (named param `parent_name`); otherwise pilot vs generic by the
      // ad/form/campaign the lead came from (a pilot ad/form/campaign → pilot welcome).
      const attributionSignals = [
        facebookMeta.form_name,
        facebookMeta.campaign_name,
        facebookMeta.adset_name,
        facebookMeta.ad_name,
        facebookMeta.utm_campaign,
        facebookMeta.utm_content,
        facebookMeta.utm_source,
      ];
      // Priority: parent → cabin crew → pilot/generic. Cabin-crew leads (from
      // the cabin-crew ads/forms) get their own welcome; sendCabinCrewWelcome
      // falls back to the generic template until the cabin-crew one is approved.
      const isParentLead = isParentSource(...attributionSignals);
      const isCabinCrewLead = !isParentLead && isCabinCrewSource(...attributionSignals);
      let welcomeTpl: string;
      let sendResult: { success: boolean; error?: string };
      if (isParentLead) {
        welcomeTpl = 'windchasers_pilot_parents_welcome_v1';
        sendResult = await sendParentWelcomeTemplate(phone, cleanName);
      } else if (isCabinCrewLead) {
        const r = await sendCabinCrewWelcome(phone, cleanName);
        welcomeTpl = r.templateUsed;
        sendResult = { success: r.success, error: r.error };
      } else {
        welcomeTpl = pickWelcomeTemplate(...attributionSignals);
        sendResult = await sendWelcomeTemplate(phone, cleanName, welcomeTpl);
      }
      whatsappSent = sendResult.success;

      if (!sendResult.success) {
        console.error('[facebook-lead] WhatsApp send failed:', sendResult.error);
      }

      // ── 4. Log the outbound message ──────────────────────────────────────────
      if (whatsappSent) {
        await logMessage(
          leadId,
          'whatsapp',
          'agent',
          `Hey ${name.split(' ')[0]}! (${welcomeTpl} template)`,
          'template',
          { source: 'facebook_lead', template_name: welcomeTpl, ...facebookMeta },
          supabase,
        );
      }

      // ── 5. Trigger AI scoring (fire-and-forget) ──────────────────────────────
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      fetch(`${appUrl}/api/webhooks/message-created`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: leadId }),
      }).catch((err) => console.error('[facebook-lead] Scoring trigger failed:', err));
    }

    console.log(`[facebook-lead] lead=${leadId} phone=${normalizedPhone} sent=${whatsappSent} cooldown=${!!inCooldown}`);

    return NextResponse.json({
      success: true,
      lead_id: leadId,
      whatsapp_sent: whatsappSent,
      skipped_cooldown: !!inCooldown,
    });
  } catch (error) {
    console.error('[facebook-lead] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process lead' },
      { status: 500 },
    );
  }
}
