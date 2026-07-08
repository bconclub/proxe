// PROXe Listen — SOURCES registry (list / add / toggle / delete). Cookie auth.
// The Sources panel on /dashboard/listen manages these; the fetch route pulls
// their items into listen_signals.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/services';
import { BRAND_ID } from '@/configs';

export const dynamic = 'force-dynamic';

const TYPES = ['rss', 'api', 'manual', 'internal'];
const CATEGORIES = ['jobs', 'water', 'power', 'roads', 'drugs', 'farm_debt', 'health', 'education', 'other'];

export async function GET() {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const sb: any = getServiceClient() || authClient;

    const { data, error } = await sb.from('listen_sources')
      .select('id, created_at, name, type, url, constituency, issue_category, active, last_fetched_at, last_item_count')
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) throw error;
    return NextResponse.json({ sources: data || [] });
  } catch (e) {
    console.error('[listen/sources] GET:', e);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const sb: any = getServiceClient();
    if (!sb) return NextResponse.json({ error: 'database unavailable' }, { status: 500 });

    const body = await req.json().catch(() => ({} as any));
    const { name, type = 'rss', url, constituency, issue_category } = body || {};
    if (!name || typeof name !== 'string') return NextResponse.json({ error: 'name is required' }, { status: 400 });
    if (!TYPES.includes(type)) return NextResponse.json({ error: `type must be one of ${TYPES.join(', ')}` }, { status: 400 });
    if ((type === 'rss' || type === 'api') && !url) return NextResponse.json({ error: 'url is required for rss/api sources' }, { status: 400 });
    if (issue_category && !CATEGORIES.includes(issue_category)) return NextResponse.json({ error: 'invalid issue_category' }, { status: 400 });

    const { data, error } = await sb.from('listen_sources')
      .insert({
        name: name.trim().slice(0, 200),
        type,
        url: url ? String(url).trim() : null,
        constituency: constituency || null,
        issue_category: issue_category || null,
        active: true,
        brand: BRAND_ID,
      })
      .select('id')
      .single();
    if (error) {
      if (String(error.message || '').includes('duplicate')) return NextResponse.json({ error: 'that URL is already a source' }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    console.error('[listen/sources] POST:', e);
    return NextResponse.json({ error: 'failed to add source' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const sb: any = getServiceClient() || authClient;

    const { id, active } = await req.json().catch(() => ({} as any));
    if (!id || typeof active !== 'boolean') return NextResponse.json({ error: 'id and active required' }, { status: 400 });
    const { error } = await sb.from('listen_sources').update({ active }).eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[listen/sources] PATCH:', e);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const sb: any = getServiceClient() || authClient;

    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const { error } = await sb.from('listen_sources').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[listen/sources] DELETE:', e);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
