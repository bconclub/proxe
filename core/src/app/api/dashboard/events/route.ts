// CAMPAIGN EVENTS - first consumer of campaign_events/event_rsvps (023).
//
//   GET  ?upcoming=1 → { events: [...+rsvp counts] }   (cookie auth)
//   POST { title, ... } → { ok, id }                    (cookie auth)
//
// The War Room's Event Monitor reads the same aggregation via war-room/data;
// this route is the dashboard-side CRUD.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/services';
import { BRAND_ID } from '@/configs';

export const dynamic = 'force-dynamic';

const EVENT_STATUSES = ['planned', 'live', 'done', 'cancelled'];

export async function GET(req: NextRequest) {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const sb: any = getServiceClient() || authClient;
    const upcoming = req.nextUrl.searchParams.get('upcoming') === '1';

    let q = sb.from('campaign_events')
      .select('id, created_at, title, topic, description, constituency, district, venue, event_date, status')
      .order('event_date', { ascending: true })
      .limit(50);
    if (upcoming) q = q.in('status', ['planned', 'live']);

    const { data: events, error } = await q;
    if (error) throw error;

    // RSVP counts per event.
    const ids = (events || []).map((e: any) => e.id);
    const agg = new Map<string, Record<string, number>>();
    if (ids.length) {
      const { data: rsvps } = await sb.from('event_rsvps').select('event_id, status').in('event_id', ids);
      (rsvps || []).forEach((r: any) => {
        const a = agg.get(r.event_id) || {};
        a[r.status] = (a[r.status] || 0) + 1;
        agg.set(r.event_id, a);
      });
    }

    return NextResponse.json({
      events: (events || []).map((e: any) => {
        const a = agg.get(e.id) || {};
        return { ...e, rsvps: { invited: a.invited || 0, interested: a.interested || 0, confirmed: a.confirmed || 0, attended: a.attended || 0, no_show: a.no_show || 0 } };
      }),
    });
  } catch (e) {
    console.error('[dashboard/events] GET error:', e);
    return NextResponse.json({ error: 'failed to fetch events' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({} as any));
    const { title, topic, description, constituency, district, venue, event_date, status } = body || {};
    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }
    if (status && !EVENT_STATUSES.includes(status)) {
      return NextResponse.json({ error: `status must be one of ${EVENT_STATUSES.join(', ')}` }, { status: 400 });
    }

    const sb: any = getServiceClient() || authClient;
    const { data, error } = await sb.from('campaign_events')
      .insert({
        title,
        topic: topic || null,
        description: description || null,
        constituency: constituency || null,
        district: district || null,
        venue: venue || null,
        event_date: event_date || null,
        status: status || 'planned',
        brand: BRAND_ID,
      })
      .select('id')
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    console.error('[dashboard/events] POST error:', e);
    return NextResponse.json({ error: 'failed to create event' }, { status: 500 });
  }
}
