/**
 * POST /api/admin/backfill-profile
 *
 * Runs the AI conversation-intelligence extractor over EXISTING leads that
 * have conversation history but are missing user_type / service_interest etc.
 * Updates unified_context.<brand> with whatever can be confidently inferred.
 *
 * BCON extracts a B2B profile (business_type / service_interest / pain_point /
 * timeline / lead_volume / user_type) — NOT Windchasers' aviation schema.
 *
 * Body (optional):
 *   dryRun: true   — preview without writing
 *   limit: 50      — max leads to process (default 50; bumps Haiku cost)
 *   onlyMissing: true (default) — only leads whose brand context lacks user_type AND service_interest
 *   brand: "bcon"
 *
 * Manual-trigger admin route — NOT a cron. POST + admin-key gated.
 * Auth: x-api-key matches ADMIN_API_KEY / WHATSAPP_API_KEY (skipped if neither set).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/services';
import { extractProfileFromConversation, mergeProfile } from '@/lib/agent-core/conversationIntelligence';

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
    const limit: number = Number.isFinite(body.limit) && body.limit > 0 ? Math.min(body.limit, 200) : 50;
    const onlyMissing: boolean = body.onlyMissing !== false;
    const brand = body.brand || BRAND_ID;

    const supabase = getServiceClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
    }

    const { data: leads, error } = await supabase
      .from('all_leads')
      .select('id, customer_name, unified_context')
      .eq('brand', brand)
      .order('last_interaction_at', { ascending: false, nullsFirst: false })
      .limit(limit);

    if (error) throw error;

    const report = {
      total: leads?.length || 0,
      processed: 0,
      updated: 0,
      skipped_no_messages: 0,
      skipped_already_set: 0,
      skipped_extractor_returned_nothing: 0,
      examples: [] as Array<{ lead_id: string; name: string; before: any; after: any }>,
    };

    for (const lead of leads || []) {
      const ctx = lead.unified_context || {};
      const brandCtx = ctx[brand] || ctx.bcon || {};

      if (onlyMissing && (brandCtx.user_type || brandCtx.service_interest)) {
        report.skipped_already_set += 1;
        continue;
      }

      // Pull last 30 customer + agent messages for this lead
      const { data: msgs } = await supabase
        .from('conversations')
        .select('sender, content')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: true })
        .limit(30);

      if (!msgs || msgs.length === 0) {
        report.skipped_no_messages += 1;
        continue;
      }
      // At least one customer message is needed to learn anything
      const hasCustomerMessage = msgs.some((m: any) => m.sender === 'customer');
      if (!hasCustomerMessage) {
        report.skipped_no_messages += 1;
        continue;
      }

      const history = msgs.map((m: any) => ({
        role: m.sender === 'customer' ? ('user' as const) : ('assistant' as const),
        content: m.content || '',
      }));

      const profile = await extractProfileFromConversation(history);
      report.processed += 1;

      if (!profile || Object.keys(profile).length === 0) {
        report.skipped_extractor_returned_nothing += 1;
        continue;
      }

      const mergedBrandCtx = mergeProfile(brandCtx, profile);

      if (report.examples.length < 10) {
        report.examples.push({
          lead_id: lead.id,
          name: lead.customer_name || '—',
          before: {
            user_type: brandCtx.user_type || null,
            service_interest: brandCtx.service_interest || null,
            timeline: brandCtx.timeline || null,
          },
          after: {
            user_type: mergedBrandCtx.user_type || null,
            service_interest: mergedBrandCtx.service_interest || null,
            timeline: mergedBrandCtx.timeline || null,
            business_type: mergedBrandCtx.business_type || null,
            pain_point: mergedBrandCtx.pain_point || null,
          },
        });
      }

      if (!dryRun) {
        const { error: upErr } = await supabase
          .from('all_leads')
          .update({ unified_context: { ...ctx, [brand]: mergedBrandCtx } })
          .eq('id', lead.id);
        if (!upErr) report.updated += 1;
        else console.error(`[backfill-profile] update failed for ${lead.id}:`, upErr.message);
      } else {
        report.updated += 1;
      }
    }

    return NextResponse.json({ success: true, dryRun, brand, ...report });
  } catch (error) {
    console.error('[backfill-profile] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Backfill failed' },
      { status: 500 },
    );
  }
}
