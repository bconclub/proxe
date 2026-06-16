/**
 * POST /api/admin/backfill-attribution
 *
 * One-time backfill: writes unified_context.attribution for existing leads.
 * Derives source + first_touch from whatever is already in unified_context:
 *   - raw_form_fields.utm_source (preferred)
 *   - raw_form_fields.form_type / event_name
 *   - web.utm.source, landing_page.utm_source (legacy paths)
 *   - first_touchpoint column (channel-level fallback)
 *
 * Idempotent — skips any lead that already has attribution.source set.
 *
 * Body (optional):
 *   dryRun: true  — compute but don't write
 *   limit: 500    — cap how many to process (default unbounded)
 *   brand: "bcon" (default from env)
 *
 * Manual-trigger admin route — NOT a cron. POST + admin-key gated.
 * Auth: x-api-key header must match ADMIN_API_KEY env var (or WHATSAPP_API_KEY fallback).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient, buildAttribution } from '@/lib/services';

const BRAND_ID = process.env.NEXT_PUBLIC_BRAND || 'bcon';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key');
    const expected = process.env.ADMIN_API_KEY || process.env.WHATSAPP_API_KEY;
    if (expected && apiKey !== expected) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const dryRun: boolean = !!body.dryRun;
    const force: boolean = !!body.force;
    const limit: number = Number.isFinite(body.limit) && body.limit > 0 ? body.limit : 10000;
    const brand = body.brand || BRAND_ID;

    const supabase = getServiceClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
    }

    // Pull all leads for this brand
    const { data: leads, error } = await supabase
      .from('all_leads')
      .select('id, customer_name, first_touchpoint, last_touchpoint, unified_context')
      .eq('brand', brand)
      .limit(limit);

    if (error) {
      console.error('[backfill-attribution] Fetch error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const report = {
      total: leads?.length || 0,
      already_set: 0,
      backfilled: 0,
      examples: [] as Array<{ lead_id: string; name: string; source: string; first_touch: string }>,
      bySource: {} as Record<string, number>,
      byFirstTouch: {} as Record<string, number>,
      skipped: 0,
    };

    for (const lead of leads || []) {
      const ctx = lead.unified_context || {};

      if (ctx.attribution?.source && !force) {
        report.already_set += 1;
        continue;
      }

      // Hunt for utm_source across known legacy locations
      const utmSource: string | null =
        ctx.raw_form_fields?.utm_source ||
        ctx.web?.utm?.source ||
        ctx.landing_page?.utm_source ||
        ctx.facebook?.utm_source ||
        null;

      // Hunt for form_type
      const formType: string | null =
        ctx.raw_form_fields?.form_type ||
        ctx.web?.form_submission?.form_type ||
        ctx.landing_page?.form_name ||
        ctx.raw_form_fields?.event_name ||
        null;

      // Pull UTM block (whatever's available)
      const utm = {
        source:   utmSource,
        medium:   ctx.raw_form_fields?.utm_medium   || ctx.web?.utm?.medium   || null,
        campaign: ctx.raw_form_fields?.utm_campaign || ctx.web?.utm?.campaign || null,
        content:  ctx.raw_form_fields?.utm_content  || null,
        term:     ctx.raw_form_fields?.utm_term     || null,
      };

      const pageUrl = ctx.raw_form_fields?.page_url || ctx.web?.form_submission?.page_url || null;

      // Facebook Lead Form leads: stamp meta_ads as the source
      const isFacebookLead = lead.first_touchpoint === 'meta_forms' || lead.first_touchpoint === 'facebook_lead' || !!ctx.facebook;
      const sourceForBuild = utmSource || (isFacebookLead ? 'meta_ads' : null);
      const formTypeForBuild = formType || (isFacebookLead ? 'meta_lead_form' : null);

      const attribution = buildAttribution({
        utmSource: sourceForBuild,
        formType: formTypeForBuild,
        channel: lead.first_touchpoint || 'web',
        utm,
        pageUrl,
      });

      report.bySource[attribution.source_label] = (report.bySource[attribution.source_label] || 0) + 1;
      report.byFirstTouch[attribution.first_touch_label] = (report.byFirstTouch[attribution.first_touch_label] || 0) + 1;

      if (report.examples.length < 10) {
        report.examples.push({
          lead_id: lead.id,
          name: lead.customer_name || '—',
          source: attribution.source_label,
          first_touch: attribution.first_touch_label,
        });
      }

      if (!dryRun) {
        const { error: updateErr } = await supabase
          .from('all_leads')
          .update({
            unified_context: {
              ...ctx,
              attribution,
            },
          })
          .eq('id', lead.id);

        if (updateErr) {
          console.error(`[backfill-attribution] Update failed for ${lead.id}:`, updateErr.message);
          report.skipped += 1;
        } else {
          report.backfilled += 1;
        }
      } else {
        report.backfilled += 1; // count what *would* have been written
      }
    }

    return NextResponse.json({
      success: true,
      dryRun,
      brand,
      ...report,
    });
  } catch (error) {
    console.error('[backfill-attribution] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Backfill failed' },
      { status: 500 },
    );
  }
}
