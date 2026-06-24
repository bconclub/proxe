#!/usr/bin/env node
/**
 * Pulse of Punjab — seed booked "grievance call" events.
 *
 * Gives a handful of constituents an upcoming grievance-call booking
 * (booking_date + booking_time on all_leads, plus metadata.title = "Grievance
 * Call" so the dashboard's Upcoming Events panel labels them). This is what the
 * founder asked for: some people who've booked a call show up as events.
 *
 * Idempotent: re-running just re-points the same N rows at fresh future dates.
 * Reads DATABASE_URL from ../agent/.env.local (same as apply.js). Requires `pg`.
 *
 *   node seed-bookings.js [count]      # default 10
 */
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '..', 'agent', '.env.local');
  if (!fs.existsSync(envPath)) throw new Error(`env not found: ${envPath}`);
  const out = {};
  for (const raw of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

function requirePg() {
  try { return require(path.join(__dirname, '..', 'agent', 'node_modules', 'pg')); }
  catch { return require('pg'); }
}

const TIMES = ['10:30', '11:00', '12:00', '15:00', '16:30', '17:00', '18:30'];

async function main() {
  const env = loadEnv();
  const count = parseInt(process.argv[2] || '10', 10);
  const connectionString = env.DATABASE_URL;
  if (!connectionString) { console.error('[seed-bookings] DATABASE_URL missing in agent/.env.local'); process.exit(1); }

  const { Client } = requirePg();
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('[seed-bookings] connected:', connectionString.replace(/:[^:@/]+@/, ':****@'));

  try {
    // Pick the most recently-active constituents that have a phone (so the
    // booking attaches to a real, visible row).
    const { rows } = await client.query(
      `select id, customer_name, constituency from all_leads
       where phone is not null
       order by last_interaction_at desc nulls last, created_at desc
       limit $1`, [count]
    );
    if (!rows.length) { console.log('[seed-bookings] no constituents found — run the main seed first.'); return; }

    let i = 0;
    for (const r of rows) {
      // Spread bookings across the next 1..N days at varied times.
      const dayOffset = 1 + (i % 9);
      const time = TIMES[i % TIMES.length];
      await client.query(
        `update all_leads
           set booking_date = (current_date + ($2 || ' days')::interval)::date,
               booking_time = $3::time,
               metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{title}', '"Grievance Call"'::jsonb, true),
               last_interaction_at = now()
         where id = $1`,
        [r.id, String(dayOffset), time]
      );
      console.log(`  + ${r.customer_name || r.id} (${r.constituency || '—'}) → grievance call in ${dayOffset}d at ${time}`);
      i++;
    }
    console.log(`[seed-bookings] done. ${rows.length} grievance-call bookings seeded.`);
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error('[seed-bookings] ERROR:', e.message); process.exit(1); });
