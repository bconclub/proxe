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
import { getServiceClient, normalizePhone, logMessage, sendWelcomeTemplate, pickWelcomeTemplate, isParentSource, sendParentWelcomeTemplate, isCabinCrewSource, sendCabinCrewWelcome, isDemoClassSource, normalizeDemoClassDayPreference, sendOfflineEventRegisterNudge, sendEmail, buildAttribution, isLikelyRealPersonName } from '@/lib/services';
import { BRAND_ID } from '@/configs';
import { normalizeCourse } from '@/configs/courses';

export const dynamic = 'force-dynamic';

// Same dedup window as leads/inbound/route.ts's wasTemplateRecentlySent -
// protects against Pabbly retrying the same webhook / duplicate submissions.
const TEMPLATE_DEDUP_WINDOW_MS = 5 * 60 * 1000;

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
    .maybeSingle();
  return !!(recentSend?.created_at && (Date.now() - new Date(recentSend.created_at).getTime()) < windowMs);
}

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
    // Demo Class lead form's own qualifying question - which single-day session
    // they'd attend (e.g. "27th_july"). Interest-stage only; the landing-page
    // form completion is what actually confirms their spot.
    const dayPreference: string | null =
      body.which_day_works_for_you || body.day_preference || null;
    // Explicit course/interest the Pabbly workflow can set (e.g. "cabin_crew",
    // "pilot", "cpl"). Drives welcome routing deterministically instead of
    // relying on the ad/form name — set a static value per dedicated workflow.
    const course: string | null =
      body.course || body.course_interest || body.interest || body.program || null;
    // Two separate, explicit markers a Pabbly workflow can set - deliberately
    // split so one field never has to describe both dimensions at once:
    //   lead_type     = WHO the person is    ("Student Lead", "Parent Lead")
    //   campaign_type = WHAT campaign/event  ("DGCA Demo Session", "Cabin Crew")
    // Neither feeds into `course` directly (so e.g. "DGCA Demo Session" isn't
    // misread by normalizeCourse as the DGCA ground-class course just because
    // the word "DGCA" appears in it) - both are fed into the keyword
    // detectors below instead, each on its own natural dimension.
    const leadTypeSignal: string | null = body.lead_type || null;
    const campaignTypeSignal: string | null = body.campaign_type || null;

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
    // TYPE column (student/parent) - this route previously never set it at
    // all, so every Meta lead-ad lead showed a blank TYPE regardless of which
    // audience the ad targeted. Explicit body.audience/user_type wins (mirrors
    // leads/inbound); else infer from the lead_type marker ("Parent Lead" /
    // "Student Lead") a dedicated Pabbly workflow can set.
    const audienceRaw = String(body.audience || body.user_type || '').toLowerCase().trim();
    if (audienceRaw === 'student' || audienceRaw === 'parent') {
      windchasersProfile.user_type = audienceRaw;
    } else if (leadTypeSignal) {
      const lt = leadTypeSignal.toLowerCase();
      if (/\bparent\b/.test(lt)) windchasersProfile.user_type = 'parent';
      else if (/\bstudent\b/.test(lt)) windchasersProfile.user_type = 'student';
    }
    if (course) windchasersProfile.course_interest = normalizeCourse(course);
    // Cabin-crew ad/form with no explicit course field → tag the course so the
    // COURSE column shows "Cabin Crew" (TYPE stays user_type: student/parent).
    if (!windchasersProfile.course_interest && isCabinCrewSource(
      course, campaignTypeSignal, facebookMeta.form_name, facebookMeta.campaign_name,
      facebookMeta.adset_name, facebookMeta.ad_name, facebookMeta.utm_campaign, facebookMeta.utm_content,
    )) {
      windchasersProfile.course_interest = 'Cabin Crew';
    }

    // Demo Class ad/campaign (e.g. "Demo Session 27-28th July") - tag INTEREST
    // immediately so the lead shows in the dashboard's Offline Events tab and a
    // counsellor can follow up, but do NOT mark offline_event_registered_at:
    // that's reserved for when they actually complete the landing-page form
    // (this is only the ad-lead-form stage, same distinction webinar makes
    // between lead_type='webinar' and zoom_registered).
    const isDemoClassLead = isDemoClassSource(
      course, campaignTypeSignal, facebookMeta.form_name, facebookMeta.campaign_name,
      facebookMeta.adset_name, facebookMeta.ad_name, facebookMeta.utm_campaign, facebookMeta.utm_content,
    );
    if (isDemoClassLead) {
      windchasersProfile.lead_type = 'offline_event';
      windchasersProfile.offline_event_name = 'WindChasers Demo Class';
      const normalizedDay = normalizeDemoClassDayPreference(dayPreference);
      if (normalizedDay || dayPreference) windchasersProfile.offline_event_date = normalizedDay || String(dayPreference);
      windchasersProfile.offline_event_interest_source = 'facebook_lead_form';
      if (!windchasersProfile.course_interest) windchasersProfile.course_interest = 'Pilot';
    }

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

      // Never DEMOTE an existing lead into the offline-event segment - a
      // re-click on the demo-class ad shouldn't hide an active, already-being-
      // worked lead from the main Leads view. Registration details (name/
      // date/interest-source) still merge in either way; only the segment
      // tag itself is protected. Mirrors the same guard in leads/inbound.
      const mergedWindchasers: Record<string, any> = {
        ...(existingCtx.windchasers || {}),
        ...windchasersProfile,
      };
      if (windchasersProfile.lead_type === 'offline_event' && existingCtx.windchasers?.lead_type !== 'offline_event') {
        mergedWindchasers.lead_type = existingCtx.windchasers?.lead_type;
      }

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
            windchasers: mergedWindchasers,
            // Attribution is immutable - keep existing if already set
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
    } else if (isDemoClassLead) {
      // ── 3a. Demo-class lead → "confirm your seat" nudge, NOT a booking
      // confirmation. This is only interest (a Meta lead-ad form) - they
      // haven't completed the landing-page registration yet, so saying
      // "confirmed" here would be wrong (and windchasers_demo_offline_v2 is
      // for the unrelated 1-on-1 "book a demo" campus-visit flow anyway).
      // windchasers_offline_event_register_nudge_v3 has a "Confirm My Seat"
      // URL button pointing at the landing page; completing that form is what
      // actually fires sendOfflineEventConfirm in leads/inbound and flips the
      // dashboard's RSVP chip to Registered. PENDING Meta review as of
      // 2026-07-21 - falls back to the plain welcome until it's approved so
      // leads are never left unmessaged. Dedup-guarded against retries.
      const nudgeTpl = 'windchasers_offline_event_register_nudge_v3';
      const nudgeAlreadySent = await wasTemplateRecentlySent(supabase, leadId, nudgeTpl);
      const first = (cleanName || name || 'there').split(' ')[0];
      const eventName = windchasersProfile.offline_event_name || 'the WindChasers Demo Class';
      if (nudgeAlreadySent) {
        console.log(`[facebook-lead] Offline-event nudge SKIPPED as duplicate lead=${leadId} phone=${normalizedPhone}`);
      } else {
        const nudgeResult = await sendOfflineEventRegisterNudge(phone, first, eventName);
        if (nudgeResult.success) {
          whatsappSent = true;
          const rendered = renderWaTemplate(nudgeTpl, { customer_name: first, event_name: eventName });
          const logText = rendered?.content || `Hi ${first}, tap below to confirm your seat for ${eventName}.`;
          await logMessage(
            leadId,
            'whatsapp',
            'agent',
            logText,
            'template',
            {
              source: 'facebook_lead',
              template_name: nudgeTpl,
              trigger: 'offline_event_interest',
              ...(rendered?.buttons?.length ? { template_buttons: rendered.buttons } : {}),
              ...(rendered?.footer ? { template_footer: rendered.footer } : {}),
              ...(nudgeResult.messageId ? { wa_message_id: nudgeResult.messageId, delivery_status: 'sent' } : {}),
              ...facebookMeta,
            },
            supabase,
          );
          await supabase.from('all_leads').update({ last_touchpoint: 'whatsapp', last_interaction_at: now }).eq('id', leadId);
        } else {
          // Not approved yet (or some other send failure) - fall back to the
          // plain welcome so the lead still hears from us today.
          console.error('[facebook-lead] Offline-event nudge send failed, falling back to generic welcome:', nudgeResult.error);
          const fallbackTpl = pickWelcomeTemplate(course, facebookMeta.form_name, facebookMeta.campaign_name, facebookMeta.adset_name, facebookMeta.ad_name, facebookMeta.utm_campaign, facebookMeta.utm_content, facebookMeta.utm_source);
          const fallbackResult = await sendWelcomeTemplate(phone, cleanName, fallbackTpl);
          whatsappSent = fallbackResult.success;
          if (fallbackResult.success) {
            const rendered = renderWaTemplate(fallbackTpl, { customer_name: first });
            const logText = rendered?.content || `Hey ${first}! Welcome to Windchasers.`;
            await logMessage(
              leadId, 'whatsapp', 'agent', logText, 'template',
              {
                source: 'facebook_lead',
                template_name: fallbackTpl,
                trigger: 'offline_event_interest_fallback',
                ...(rendered?.buttons?.length ? { template_buttons: rendered.buttons } : {}),
                ...(rendered?.footer ? { template_footer: rendered.footer } : {}),
                ...(fallbackResult.messageId ? { wa_message_id: fallbackResult.messageId, delivery_status: 'sent' } : {}),
                ...facebookMeta,
              },
              supabase,
            );
            await supabase.from('all_leads').update({ last_touchpoint: 'whatsapp', last_interaction_at: now }).eq('id', leadId);
          }
        }
      }

      // ── 3b. "Confirm your seat" email ── Meta lead forms capture email
      // directly (the landing-page register modal doesn't ask for one, so
      // this only fires on the FB-ad path). Plain HTML - no Meta approval
      // needed, unlike WhatsApp templates. Says "confirm", not "confirmed" -
      // same reasoning as the WhatsApp nudge above.
      if (email) {
        try {
          const landingUrl = 'https://windchasers.in/dgca-demo-class';
          const emailResult = await sendEmail({
            to: email,
            subject: `Confirm your seat - ${eventName}`,
            html: `<p>Hi ${first},</p>` +
              `<p>You told us you're interested in <strong>${eventName}</strong> at our Bengaluru campus - we'd love to see you there!</p>` +
              `<p><a href="${landingUrl}">Tap here to confirm your seat</a> (or reply to the WhatsApp message we just sent).</p>` +
              `<p>- Team WindChasers</p>`,
          });
          if (!emailResult.sent) console.error('[facebook-lead] Confirmation email failed:', emailResult.error);
        } catch (err: any) {
          console.error('[facebook-lead] Confirmation email exception:', err?.message || err);
        }
      }

      // ── 3c. Trigger AI scoring (fire-and-forget) ─────────────────────────────
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      fetch(`${appUrl}/api/webhooks/message-created`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: leadId }),
      }).catch((err) => console.error('[facebook-lead] Scoring trigger failed:', err));
    } else {
      // ── 3. Fire the welcome template — parent enquiry gets its own template
      // (named param `parent_name`); otherwise pilot vs generic by the
      // ad/form/campaign the lead came from (a pilot ad/form/campaign → pilot welcome).
      // `course` first: a dedicated Pabbly workflow sets a static
      // course_interest (e.g. "cabin_crew") so routing is deterministic even
      // when the ad/form/campaign names don't carry the audience keyword.
      const attributionSignals = [
        course,
        leadTypeSignal,
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
