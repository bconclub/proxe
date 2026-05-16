/**
 * POST /api/agent/facebook-lead
 *
 * Receives Facebook Lead Ad data from Pabbly Connect and:
 *   1. Creates / deduplicates the lead in all_leads
 *   2. Fires the windchasers_followup WhatsApp template immediately
 *   3. Logs the outbound message to conversations
 *
 * Auth: x-api-key header (same WHATSAPP_API_KEY used by other webhooks)
 *
 * Pabbly field mapping (accept both Facebook defaults and custom names):
 *   name / full_name / customer_name → customer name
 *   phone / phone_number / mobile   → WhatsApp number (required)
 *   email / email_address           → email (optional)
 *   ad_name / adset_name / campaign_name / form_name → stored in facebook metadata
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getServiceClient,
  ensureOrUpdateLead,
  ensureSession,
  logMessage,
  normalizePhone,
  sendFirstOutreach,
} from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Auth
    const apiKey = request.headers.get('x-api-key');
    if (apiKey !== process.env.WHATSAPP_API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // ── Flexible field parsing ────────────────────────────────────────────────
    // Pabbly maps Facebook form fields — accept several common field names
    const name: string =
      body.name || body.full_name || body.customer_name || body.Name || '';
    const phone: string =
      body.phone || body.phone_number || body.mobile || body.Phone || body.whatsapp || '';
    const email: string | null =
      body.email || body.email_address || body.Email || null;
    const education: string | null =
      body.education || body.education_level || body.qualification || null;
    const city: string | null =
      body.city || body.City || body.location || null;

    // Facebook/campaign metadata (nice-to-have, stored for context & scoring)
    const facebookMeta = {
      ad_name: body.ad_name || body.adset_name || null,
      campaign_name: body.campaign_name || body.campaign || null,
      form_name: body.form_name || body.leadgen_form_name || null,
      lead_id: body.lead_id || body.fb_lead_id || null,
      page_id: body.page_id || null,
      ad_id: body.ad_id || null,
    };

    if (!phone) {
      return NextResponse.json(
        { error: 'Missing required field: phone' },
        { status: 400 },
      );
    }

    if (!name) {
      return NextResponse.json(
        { error: 'Missing required field: name' },
        { status: 400 },
      );
    }

    const supabase = getServiceClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
    }

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return NextResponse.json(
        { error: 'Invalid phone number format' },
        { status: 400 },
      );
    }

    const sessionId = `wa_meta_${normalizedPhone}`;

    // ── 1. Create / deduplicate lead ─────────────────────────────────────────
    const leadId = await ensureOrUpdateLead(
      name,
      email,
      phone,
      'whatsapp',
      sessionId,
      supabase,
    );

    if (!leadId) {
      return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 });
    }

    // Store Facebook metadata in unified_context.facebook
    try {
      const { data: lead } = await supabase
        .from('all_leads')
        .select('unified_context')
        .eq('id', leadId)
        .maybeSingle();

      const existingCtx = lead?.unified_context || {};
      const isNewFacebookLead = !existingCtx.facebook;
      const existingWindchasers = existingCtx.windchasers || {};
      await supabase
        .from('all_leads')
        .update({
          unified_context: {
            ...existingCtx,
            facebook: {
              ...(existingCtx.facebook || {}),
              ...facebookMeta,
              lead_created_at: new Date().toISOString(),
            },
            windchasers: {
              ...existingWindchasers,
              ...(education ? { education } : {}),
              ...(city ? { city } : {}),
            },
          },
          last_touchpoint: 'facebook_lead',
          ...(isNewFacebookLead ? { first_touchpoint: 'facebook_lead' } : {}),
        })
        .eq('id', leadId);
    } catch (ctxErr) {
      console.error('[facebook-lead] Failed to write facebook metadata:', ctxErr);
    }

    // ── 2. Ensure WhatsApp session ──────────────────────────────────────────
    await ensureSession(sessionId, 'whatsapp', supabase);

    // Link name + phone to the session
    await supabase
      .from('whatsapp_sessions')
      .update({
        lead_id: leadId,
        customer_name: name,
        customer_phone: phone,
        customer_phone_normalized: normalizedPhone,
        channel_data: { source: 'facebook_lead', ...facebookMeta },
      })
      .eq('external_session_id', sessionId);

    // ── 3. Check cooldown — don't spam an existing active lead ───────────────
    const { data: leadRow } = await supabase
      .from('all_leads')
      .select('follow_up_cooldown_until')
      .eq('id', leadId)
      .maybeSingle();

    const cooldownUntil = leadRow?.follow_up_cooldown_until;
    const inCooldown = cooldownUntil && new Date(cooldownUntil) > new Date();

    let whatsappSent = false;

    if (inCooldown) {
      console.log(`[facebook-lead] Lead ${leadId} in cooldown until ${cooldownUntil}, skipping WhatsApp send`);
    } else {
      // ── 4. Send first outreach via windchasers_followup template ────────────
      const sendResult = await sendFirstOutreach(phone, name);
      whatsappSent = sendResult.success;

      if (!sendResult.success) {
        console.error('[facebook-lead] WhatsApp send failed:', sendResult.error);
      }

      // ── 5. Log the outbound message ─────────────────────────────────────────
      if (whatsappSent) {
        await logMessage(
          leadId,
          'whatsapp',
          'agent',
          `Hey ${name.split(' ')[0]}! 👋 (windchasers_followup template)`,
          'template',
          {
            source: 'facebook_lead',
            template_name: 'windchasers_followup',
            session_id: sessionId,
            ...facebookMeta,
          },
          supabase,
        );
      }

      // ── 6. Trigger AI scoring ────────────────────────────────────────────────
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      fetch(`${appUrl}/api/webhooks/message-created`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: leadId }),
      }).catch((err) => console.error('[facebook-lead] Scoring trigger failed:', err));
    }

    console.log(`[facebook-lead] Processed: lead=${leadId} phone=${normalizedPhone} whatsapp_sent=${whatsappSent} cooldown=${inCooldown}`);

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
