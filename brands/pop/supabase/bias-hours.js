#!/usr/bin/env node
/**
 * Give POP touchpoints a realistic time-of-day rhythm so the Activity Heatmap
 * (weekday x hour) actually shows correlation instead of a flat wash.
 *
 * Preserves each lead's CALENDAR DATE (so daily/7d/30d counts and "today" are
 * untouched) and only rewrites the hour-of-day, drawn from an evening-weighted
 * curve (people engage after work; peak ~7 PM). A couple of weekdays get a
 * slightly sharper evening peak so a clear "Peak day" emerges. Idempotent-ish:
 * re-running just re-rolls the hours.
 *
 *   node brands/pop/supabase/bias-hours.js
 */
const fs = require('fs');
const path = require('path');
const { Client } = (() => {
  try { return require(path.join(__dirname, '..', 'agent', 'node_modules', 'pg')); }
  catch { return require('pg'); }
})();

function loadEnv() {
  const p = path.join(__dirname, '..', 'agent', '.env.local');
  return Object.fromEntries(
    fs.readFileSync(p, 'utf8').split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
  );
}

let s = 424242;
const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };

// Base hour weights (UTC hour used directly by the heatmap; labelled as the
// campaign's local clock). Evening-heavy, peak at 19:00, tail off by 22:00.
const BASE = { 7: 1, 8: 2, 9: 3, 10: 4, 11: 4, 12: 5, 13: 4, 14: 3, 15: 3, 16: 4, 17: 6, 18: 9, 19: 12, 20: 11, 21: 8, 22: 4, 23: 2 };
// Per-weekday multiplier on the evening peak (0=Sun..6=Sat), so Wed & Sat run hottest.
const DAY_MULT = [0.85, 0.95, 1.0, 1.25, 1.0, 1.05, 1.2]; // Sun,Mon,Tue,Wed,Thu,Fri,Sat

function pickHour(weekday) {
  const mult = DAY_MULT[weekday] ?? 1;
  const pairs = Object.entries(BASE).map(([h, w]) => {
    const hn = Number(h);
    // amplify the evening window by the weekday multiplier
    const weight = hn >= 17 && hn <= 21 ? w * mult : w;
    return [hn, weight];
  });
  const total = pairs.reduce((a, [, w]) => a + w, 0);
  let r = rnd() * total;
  for (const [h, w] of pairs) { if ((r -= w) <= 0) return h; }
  return 19;
}

(async () => {
  const env = loadEnv();
  const ref = (env.NEXT_PUBLIC_POP_SUPABASE_URL || '').match(/https:\/\/([a-z0-9]+)\./)?.[1];
  if (ref && !env.DATABASE_URL.includes(ref)) { console.error('SAFETY STOP: not POP db'); process.exit(1); }
  const c = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const rows = (await c.query("SELECT id, created_at FROM all_leads WHERE brand='pop' AND created_at IS NOT NULL")).rows;
  console.log(`biasing hours for ${rows.length} pop leads…`);

  const updates = rows.map((r) => {
    const d = new Date(r.created_at);
    // Keep the UTC calendar date; rewrite hour/min from the evening curve.
    const weekday = d.getUTCDay();
    const hour = pickHour(weekday);
    const min = Math.floor(rnd() * 60);
    const sec = Math.floor(rnd() * 60);
    const nd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, min, sec));
    return { id: r.id, ts: nd.toISOString() };
  });

  // Batch via UPDATE ... FROM (unnest) — fast, no per-row round trips.
  const CHUNK = 500;
  let done = 0;
  for (let off = 0; off < updates.length; off += CHUNK) {
    const slice = updates.slice(off, off + CHUNK);
    const ids = slice.map((u) => u.id);
    const tss = slice.map((u) => u.ts);
    await c.query(
      `UPDATE all_leads AS a SET created_at = v.ts::timestamptz
       FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::text[]) AS ts) AS v
       WHERE a.id = v.id`,
      [ids, tss],
    );
    done += slice.length;
  }

  // Quick sanity: hour distribution.
  const dist = (await c.query(
    "SELECT extract(hour from created_at)::int AS h, count(*)::int n FROM all_leads WHERE brand='pop' GROUP BY 1 ORDER BY 1"
  )).rows;
  console.log(`updated ${done}. hour histogram:`);
  console.log(dist.map((r) => `${r.h}:${r.n}`).join('  '));
  await c.end();
})().catch((e) => { console.error('BIAS ERR', e.message); process.exit(1); });
