// PROXe Listen — pull items from RSS sources into listen_signals.
// POST (cookie auth, dashboard "Fetch now"): fetch all active rss sources (or
// ?id= for one), regex-parse each feed, lightly classify (issue / sentiment /
// crisis / seat), and insert as source='news' signals. Dedup by url via the
// unique index (on conflict do nothing). No XML dep — regex is enough for the
// standard RSS/Atom the feeds emit.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/services';
import { BRAND_ID } from '@/configs';
import { CONSTITUENCIES } from '@/lib/war-room/constituencies';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ITEMS_PER_FEED = 25;

// ── tiny text helpers ──
const unCdata = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
const stripTags = (s: string) => s.replace(/<[^>]+>/g, ' ');
const decode = (s: string) => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const clean = (s: string) => decode(stripTags(unCdata(s || ''))).replace(/\s+/g, ' ').trim();

const tag = (block: string, name: string): string => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return m ? clean(m[1]) : '';
};
const atomLink = (block: string): string => {
  const m = block.match(/<link[^>]*href="([^"]+)"[^>]*\/?>/i);
  return m ? m[1] : '';
};

// ── light classification ──
const CAT_KW: [string, RegExp][] = [
  ['water', /\bwater|canal|drinking water|tubewell|flood/i],
  ['power', /\bpower|electric|bijli|transformer|load[- ]?shed/i],
  ['jobs', /\bjobs?|unemploy|naukri|rozgar|recruit|vacan/i],
  ['roads', /\broad|highway|bridge|transport|\bbus\b|pothole/i],
  ['drugs', /\bdrug|chitta|nasha|de-?addict|narcotic/i],
  ['farm_debt', /\bfarmer|kisan|\bmsp\b|paddy|crop|farm loan|debt waiver|mandi/i],
  ['health', /\bhealth|hospital|doctor|cancer|dengue|medicine|phc\b/i],
  ['education', /\bschool|college|teacher|student|education|scholarship/i],
];
const classifyCat = (t: string): string | null => { for (const [c, re] of CAT_KW) if (re.test(t)) return c; return null; };
const NEG = /\bprotest|anger|crisis|death|killed|dead|flood|shortage|scam|fraud|suicide|slam|attack|fail|shut|strike|stir|agitation|drought/i;
const POS = /\blaunch|inaugurat|relief|boost|develop|waiver|approv|win|award|record|new (school|hospital|road)|grant/i;
const CRISIS = /\bflood|death|killed|riot|blast|emergency|clash|stampede|collapse|outbreak/i;
const OPPO = /\bopposition|slams?|attacks?|accuses?|hits out|corruption|scam/i;

const SEATS = CONSTITUENCIES.map((c) => ({ name: c.name, district: c.district, re: new RegExp(`\\b${c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i') }));
const findSeat = (t: string) => SEATS.find((s) => s.re.test(t)) || null;

// Item image: media:content / media:thumbnail / enclosure / first <img> in the
// description html. Feeds vary wildly; try them in that order.
const itemImage = (block: string): string | null => {
  // feeds embed the image raw, inside CDATA, or html-ENCODED (&lt;img … TOI does
  // this) — so also try after entity-decoding.
  const decoded = decode(unCdata(block));
  const m =
    block.match(/<media:content[^>]*url="([^"]+)"[^>]*>/i) ||
    block.match(/<media:thumbnail[^>]*url="([^"]+)"[^>]*>/i) ||
    block.match(/<enclosure[^>]*url="([^"]+\.(?:jpe?g|png|webp|gif)[^"]*)"[^>]*>/i) ||
    block.match(/<img[^>]*src=["']([^"']+)["']/i) ||
    decoded.match(/<img[^>]*src=["']([^"']+)["']/i);
  const u = m ? decode(m[1]).trim() : null;
  return u && /^https?:\/\//i.test(u) ? u.slice(0, 1000) : null;
};

function parseFeed(xml: string): Array<{ title: string; link: string; image: string | null }> {
  const out: Array<{ title: string; link: string; image: string | null }> = [];
  // RSS <item> then Atom <entry>
  const blocks = [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi), ...xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi)];
  for (const b of blocks) {
    const block = b[0];
    const title = tag(block, 'title');
    const link = tag(block, 'link') || atomLink(block);
    if (title && link) out.push({ title, link: link.trim(), image: itemImage(block) });
    if (out.length >= ITEMS_PER_FEED) break;
  }
  return out;
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'PROXe-Listen/1.0 (+https://goproxe.com)' } });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; } finally { clearTimeout(t); }
}

export async function POST(req: NextRequest) {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const sb: any = getServiceClient();
    if (!sb) return NextResponse.json({ error: 'database unavailable' }, { status: 500 });

    const only = req.nextUrl.searchParams.get('id');
    let q = sb.from('listen_sources').select('id, name, url, constituency, issue_category').eq('type', 'rss').eq('active', true);
    if (only) q = q.eq('id', only);
    const { data: sources, error } = await q.limit(30);
    if (error) throw error;

    let totalInserted = 0;
    const perSource: Array<{ id: string; name: string; found: number; inserted: number }> = [];

    for (const src of (sources || [])) {
      if (!src.url) continue;
      const xml = await fetchText(src.url);
      const items = xml ? parseFeed(xml) : [];
      let inserted = 0;
      if (items.length) {
        const rows = items.map((it) => {
          const text = it.title;
          const seat = src.constituency ? { name: src.constituency, district: null } : findSeat(text);
          const isCrisis = CRISIS.test(text);
          return {
            source: 'news',
            content: text.slice(0, 4000),
            url: it.link,
            author: src.name,
            sentiment: NEG.test(text) ? 'negative' : POS.test(text) ? 'positive' : 'neutral',
            issue_category: src.issue_category || classifyCat(text),
            constituency: seat?.name || null,
            district: (seat as any)?.district || null,
            severity: isCrisis ? 3 : 1,
            is_crisis: isCrisis,
            is_opposition: OPPO.test(text),
            is_positive: POS.test(text),
            image_url: it.image,
            brand: BRAND_ID,
          };
        });
        // on conflict (url, brand) MERGE — dedups already-ingested articles while
        // backfilling newly-parsed fields (image_url). created_at isn't in the
        // row payload so the original ingest time is preserved.
        const { data: ins, error: insErr } = await sb.from('listen_signals')
          .upsert(rows, { onConflict: 'url,brand', ignoreDuplicates: false })
          .select('id');
        if (insErr) console.error('[listen/fetch] insert failed for', src.name, insErr.message);
        else inserted = (ins || []).length;
      }
      totalInserted += inserted;
      perSource.push({ id: src.id, name: src.name, found: items.length, inserted });
      await sb.from('listen_sources').update({ last_fetched_at: new Date().toISOString(), last_item_count: items.length }).eq('id', src.id);
    }

    return NextResponse.json({ ok: true, sourcesFetched: perSource.length, totalInserted, perSource });
  } catch (e) {
    console.error('[listen/sources/fetch]', (e as Error).message);
    return NextResponse.json({ error: 'fetch failed' }, { status: 500 });
  }
}
