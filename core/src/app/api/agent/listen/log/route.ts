// PROXE LISTEN — signal intake. "Listen first, engage better."
//
// One POST per signal from any bridge: WhatsApp media-scan group, call centre,
// volunteer reports, survey pipelines, future social scrapers (twitter/fb/ig/
// yt/news). Rows land in listen_signals; the War Room digests them into
// trending issues / crisis alerts / narratives.
//
// Auth: x-api-key = INBOUND_API_KEY (machine-intake pattern, same as d2d/log).
// ALL enums validated here BEFORE insert — a single off-CHECK value would
// atomically reject the whole row (vapi-webhook lesson).

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/services';
import { getCurrentBrandId, BRAND_ID } from '@/configs';

export const dynamic = 'force-dynamic';

const SOURCES = ['twitter', 'facebook', 'instagram', 'youtube', 'news', 'whatsapp_trend', 'complaint', 'call_centre', 'volunteer_report', 'survey'];
const SENTIMENTS = ['positive', 'negative', 'neutral'];
const CATEGORIES = ['jobs', 'water', 'power', 'roads', 'drugs', 'farm_debt', 'health', 'education', 'other'];

export async function POST(req: NextRequest) {
  if (getCurrentBrandId() !== 'pop') {
    return NextResponse.json({ error: 'Listen intake is a POP campaign feature' }, { status: 404 });
  }
  const expected = process.env.INBOUND_API_KEY;
  if (!expected || req.headers.get('x-api-key') !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const sb: any = getServiceClient();
  if (!sb) return NextResponse.json({ error: 'database unavailable' }, { status: 500 });

  try {
    const body = await req.json().catch(() => ({} as any));
    const {
      source, content, url, author, sentiment, issue_category,
      constituency, district, severity, is_crisis, is_opposition, is_positive,
    } = body || {};

    // Validate everything BEFORE touching the DB.
    if (!source || !SOURCES.includes(source)) {
      return NextResponse.json({ error: `source must be one of ${SOURCES.join(', ')}` }, { status: 400 });
    }
    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }
    if (sentiment && !SENTIMENTS.includes(sentiment)) {
      return NextResponse.json({ error: `sentiment must be one of ${SENTIMENTS.join(', ')}` }, { status: 400 });
    }
    if (issue_category && !CATEGORIES.includes(issue_category)) {
      return NextResponse.json({ error: `issue_category must be one of ${CATEGORIES.join(', ')}` }, { status: 400 });
    }
    const sev = severity === undefined || severity === null ? 1 : Number(severity);
    if (!Number.isInteger(sev) || sev < 1 || sev > 3) {
      return NextResponse.json({ error: 'severity must be 1-3' }, { status: 400 });
    }

    const { data, error } = await sb.from('listen_signals')
      .insert({
        source,
        content: content.trim().slice(0, 4000),
        url: url || null,
        author: author || null,
        sentiment: sentiment || null,
        issue_category: issue_category || null,
        constituency: constituency || null,
        district: district || null,
        severity: sev,
        is_crisis: Boolean(is_crisis),
        is_opposition: Boolean(is_opposition),
        is_positive: Boolean(is_positive),
        brand: BRAND_ID,
      })
      .select('id')
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    console.error('[listen/log]', (e as Error).message);
    return NextResponse.json({ error: 'insert failed' }, { status: 500 });
  }
}
