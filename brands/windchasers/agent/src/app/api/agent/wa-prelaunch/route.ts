/**
 * POST /api/agent/wa-prelaunch
 *
 * Captures a lead's phone + UTM attribution BEFORE they're redirected to wa.me.
 * The website shows a small form on every WhatsApp button click:
 *   Name + Phone → submit → redirect to wa.me
 *
 * When the lead actually messages on WhatsApp, the Meta webhook dedupes by
 * phone and attaches the conversation to this already-attributed lead.
 *
 * No auth — this is a public lead-capture endpoint. CORS-friendly.
 *
 * Body:
 *   name (required)
 *   phone (required)
 *   email (optional)
 *   utm_source / utm_medium / utm_campaign / utm_content / utm_term (optional)
 *   page_url (optional)
 *   external_session_id (optional)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient, normalizePhone, buildAttribution } from '@/lib/services';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const name: string = body.name || body.full_name || '';
    const phone: string = body.phone || body.phone_number || '';
    const email: string | null = body.email || null;

    const utm = {
      utm_source:   body.utm_source   || null,
      utm_medium:   body.utm_medium   || null,
      utm_campaign: body.utm_campaign || null,
      utm_content:  body.utm_content  || null,
      utm_term:     body.utm_term     || null,
    };

    const pageUrl: string | null = body.page_url || null;
    const externalSessionId: string | null = body.external_session_id || null;

    if (!phone) {
      return NextResponse.json(
        { error: 'Missing required field: phone' },
        { status: 400, headers: CORS_HEADERS },
      );
    }
    if (!name) {
      return NextResponse.json(
        { error: 'Missing required field: name' },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const supabase = getServiceClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Database connection unavailable' },
        { status: 503, headers: CORS_HEADERS },
      );
    }

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return NextResponse.json(
        { error: 'Invalid phone number format' },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const brand = process.env.NEXT_PUBLIC_BRAND_ID || process.env.NEXT_PUBLIC_BRAND || 'windchasers';
    const now = new Date().toISOString();

    // Build standardized attribution payload
    const attributionPayload = buildAttribution({
      utmSource: utm.utm_source || null,
      formType: 'whatsapp_button',
      channel: 'whatsapp',
      utm: {
        source:   utm.utm_source,
        medium:   utm.utm_medium,
        campaign: utm.utm_campaign,
        content:  utm.utm_content,
        term:     utm.utm_term,
      },
      pageUrl,
    });
    const sourceLabel = attributionPayload.source_label;

    // ── Dedup by phone + brand ──────────────────────────────────────────────
    const { data: existing } = await supabase
      .from('all_leads')
      .select('id, unified_context')
      .eq('customer_phone_normalized', normalizedPhone)
      .eq('brand', brand)
      .maybeSingle();

    let leadId: string;
    let isNew = false;

    if (existing) {
      leadId = existing.id;
      const ctx = existing.unified_context || {};
      // Update — but DO NOT overwrite an existing source. Source is immutable.
      const mergedAttribution = ctx.attribution
        ? ctx.attribution // keep existing
        : attributionPayload; // first time we have attribution data

      await supabase
        .from('all_leads')
        .update({
          customer_name: name,
          ...(email ? { email } : {}),
          phone,
          last_touchpoint: 'whatsapp',
          last_interaction_at: now,
          unified_context: {
            ...ctx,
            attribution: mergedAttribution,
            raw_form_fields: { ...(ctx.raw_form_fields || {}), ...utm, page_url: pageUrl },
            pending_wa_message: true,
            pending_wa_at: now,
          },
        })
        .eq('id', leadId);
    } else {
      const { data: created, error: insertErr } = await supabase
        .from('all_leads')
        .insert({
          customer_name: name,
          email,
          phone,
          customer_phone_normalized: normalizedPhone,
          brand,
          first_touchpoint: 'whatsapp',
          last_touchpoint: 'whatsapp',
          last_interaction_at: now,
          unified_context: {
            attribution: attributionPayload,
            raw_form_fields: { ...utm, page_url: pageUrl, form_type: 'whatsapp_prelaunch' },
            pending_wa_message: true,
            pending_wa_at: now,
            ...(externalSessionId ? { external_session_id: externalSessionId } : {}),
          },
        })
        .select('id')
        .single();

      if (insertErr || !created) {
        console.error('[wa-prelaunch] Insert failed:', insertErr);
        return NextResponse.json(
          { error: 'Failed to create lead' },
          { status: 500, headers: CORS_HEADERS },
        );
      }
      leadId = created.id;
      isNew = true;
    }

    console.log(`[wa-prelaunch] lead=${leadId} phone=${normalizedPhone} source=${sourceLabel} new=${isNew}`);

    return NextResponse.json(
      {
        success: true,
        lead_id: leadId,
        is_new: isNew,
        source: sourceLabel,
      },
      { status: 200, headers: CORS_HEADERS },
    );
  } catch (error) {
    console.error('[wa-prelaunch] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process pre-launch capture' },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
