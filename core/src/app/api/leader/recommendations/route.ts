// LEADER API - "Contact WAR ROOM": the leader app pushes a recommendation /
// directive to the war-room team. Lands in the War Room's Directives tab
// (realtime). Auth: x-api-key = LEADER_API_KEY.

import { NextRequest } from 'next/server';
import { getServiceClient } from '@/lib/services';
import { leaderAuthGate, corsJson, leaderOptions } from '@/lib/server/leaderAuth';
import { BRAND_ID } from '@/configs';

export const dynamic = 'force-dynamic';
export const OPTIONS = leaderOptions;

// GET - the leader's live Feed: every directive pushed to the team (his own
// pushes + AI suggestions) with its current status (new → acked → actioned).
export async function GET(req: NextRequest) {
  const denied = leaderAuthGate(req);
  if (denied) return denied;
  const sb: any = getServiceClient();
  if (!sb) return corsJson({ error: 'database unavailable' }, { status: 500 });
  try {
    const { data, error } = await sb.from('campaign_recommendations')
      .select('id, title, body, source, constituency, status, created_by, created_at')
      .eq('brand', BRAND_ID)
      .order('created_at', { ascending: false })
      .limit(60);
    if (error) throw error;
    return corsJson({ items: data || [] });
  } catch (e) {
    console.error('[leader/recommendations GET]', (e as Error).message);
    return corsJson({ error: 'query failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = leaderAuthGate(req);
  if (denied) return denied;
  const sb: any = getServiceClient();
  if (!sb) return corsJson({ error: 'database unavailable' }, { status: 500 });

  try {
    const body = await req.json().catch(() => ({} as any));
    const { title, body: recoBody, constituency, created_by } = body || {};
    if (!title || typeof title !== 'string' || !title.trim()) {
      return corsJson({ error: 'title is required' }, { status: 400 });
    }

    const { data, error } = await sb.from('campaign_recommendations')
      .insert({
        title: title.trim().slice(0, 300),
        body: recoBody ? String(recoBody).slice(0, 2000) : null,
        source: 'leader',
        constituency: constituency || null,
        status: 'new',
        created_by: created_by || null,
        brand: BRAND_ID,
      })
      .select('id')
      .single();
    if (error) throw error;

    return corsJson({ ok: true, id: data.id });
  } catch (e) {
    console.error('[leader/recommendations]', (e as Error).message);
    return corsJson({ error: 'insert failed' }, { status: 500 });
  }
}
