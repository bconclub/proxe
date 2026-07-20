// DASHBOARD - recommendations (directives) list + ack/actioned.
// The War Room's Directives tab reads via war-room/data; this route is the
// team's response path. Cookie auth.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const sb: any = getServiceClient() || authClient;
    const status = req.nextUrl.searchParams.get('status') || '';
    let q = sb.from('campaign_recommendations')
      .select('id, created_at, title, body, source, constituency, status, created_by')
      .order('created_at', { ascending: false })
      .limit(100);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ recommendations: data || [] });
  } catch (e) {
    console.error('[dashboard/recommendations] GET:', e);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, status } = await req.json().catch(() => ({} as any));
    if (!id || !['acked', 'actioned'].includes(status)) {
      return NextResponse.json({ error: 'id and status (acked|actioned) required' }, { status: 400 });
    }

    const sb: any = getServiceClient() || authClient;
    const { error } = await sb.from('campaign_recommendations').update({ status }).eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[dashboard/recommendations] POST:', e);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
