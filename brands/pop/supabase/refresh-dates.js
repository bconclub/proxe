#!/usr/bin/env node
/**
 * Pulse of Punjab — refresh constituent dates so the War Room graphs are live.
 *
 * The seeded constituents' created_at was ~2 weeks old, so the war-room daily
 * series (14-day window) + live feed + "captured today" all read flat/empty.
 * This re-dates every pop constituent across the LAST 14 DAYS, weighted toward
 * recent (a healthy chunk today), and sets last_interaction_at between created
 * and now. Also bumps any existing booking to a future date so Upcoming Events
 * stays populated. Re-runnable.
 *
 * Reads DATABASE_URL from ../agent/.env.local. Requires `pg`.
 *   node refresh-dates.js
 */
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '..', 'agent', '.env.local');
  const out = {};
  for (const raw of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('='); if (eq === -1) continue;
    const k = line.slice(0, eq).trim(); let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}
function requirePg() {
  try { return require(path.join(__dirname, '..', 'agent', 'node_modules', 'pg')); }
  catch { return require('pg'); }
}

const DAYS = 14;
const DAY_MS = 86400000;

async function main() {
  const env = loadEnv();
  const { Client } = requirePg();
  const client = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('[refresh-dates] connected:', String(env.DATABASE_URL).replace(/:[^:@/]+@/, ':****@'));

  try {
    const { rows } = await client.query(`select id from all_leads where brand = 'pop' order by created_at asc`);
    const N = rows.length;
    if (!N) { console.log('[refresh-dates] no pop constituents.'); return; }

    // Per-day target counts, heavier toward today (day 0). Ensures an upward
    // curve and a non-empty "today" bucket.
    const weights = [];
    for (let d = 0; d < DAYS; d++) weights.push(Math.pow((DAYS - d) / DAYS, 1.5));
    const wsum = weights.reduce((a, b) => a + b, 0);
    const perDay = weights.map((w) => Math.max(1, Math.round((N * w) / wsum)));

    const now = Date.now();
    const todayMidnight = new Date(new Date().setHours(0, 0, 0, 0)).getTime();

    // Shuffle the ids so the re-dating isn't correlated with old order.
    for (let i = N - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rows[i], rows[j]] = [rows[j], rows[i]]; }

    let idx = 0, updated = 0, todayCount = 0;
    for (let d = 0; d < DAYS && idx < N; d++) {
      for (let k = 0; k < perDay[d] && idx < N; k++) {
        const row = rows[idx++];
        let created;
        if (d === 0) {
          // today: between midnight and now
          created = new Date(todayMidnight + Math.random() * (now - todayMidnight));
          todayCount++;
        } else {
          const dayStart = now - d * DAY_MS;
          created = new Date(dayStart - Math.random() * DAY_MS * 0.95);
        }
        // last interaction: somewhere between created and now, biased recent
        const last = new Date(created.getTime() + Math.pow(Math.random(), 0.5) * (now - created.getTime()));
        await client.query(
          `update all_leads set created_at = $2, last_interaction_at = $3 where id = $1`,
          [row.id, created.toISOString(), last.toISOString()]
        );
        updated++;
      }
    }
    // Any leftover (rounding) → spread across the last 3 days.
    while (idx < N) {
      const row = rows[idx++];
      const created = new Date(now - Math.random() * 3 * DAY_MS);
      await client.query(`update all_leads set created_at = $2, last_interaction_at = $2 where id = $1`, [row.id, created.toISOString()]);
      updated++;
    }

    // Bump any existing booking to a future date (Upcoming Events).
    const b = await client.query(
      `update all_leads set booking_date = (current_date + ((1 + floor(random()*9))::int || ' days')::interval)::date
       where brand = 'pop' and booking_date is not null returning id`
    );

    console.log(`[refresh-dates] re-dated ${updated} constituents across the last ${DAYS} days (${todayCount} today); bumped ${b.rowCount} bookings to future.`);
  } finally {
    await client.end();
  }
}
main().catch((e) => { console.error('[refresh-dates] ERROR:', e.message); process.exit(1); });
