#!/usr/bin/env node
/**
 * Seed demo constituents for the POP war-room (POP DB only). Idempotent: clears
 * prior seed rows (phone prefix +9198765) then inserts a realistic spread.
 * NOT part of the read-only war room — a one-off demo data loader.
 *
 *   node brands/pop/supabase/seed-war-room.js
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

// 117 seats (subset mapping mirrors src/lib/war-room/constituencies.ts regions).
const SEATS = require('./_seats.json'); // {name, district, region}[]

// deterministic pseudo-random so re-seeds are stable
let s = 12345;
const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const weighted = (pairs) => { const t = pairs.reduce((x, [, w]) => x + w, 0); let r = rnd() * t; for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; } return pairs[0][0]; };

const CATS = ['jobs', 'water', 'power', 'roads', 'drugs', 'farm_debt', 'health', 'education', 'other'];
const MAGNETS = [['whatsapp', 5], ['voice', 3], ['pulse_app', 4], ['missed_call', 2], ['qr', 1]];
const LANGS = [['pa', 6], ['hi', 3], ['en', 1]];
const INTENTS = [['vote', 4], ['volunteer', 2], ['rally', 1], ['share', 2], ['none', 3]];
const LOOP = [['raised', 6], ['routed', 3], ['resolved', 2]];
const FIRST = ['Harpreet', 'Gurpreet', 'Manjit', 'Simran', 'Jaspreet', 'Baljit', 'Navdeep', 'Amandeep', 'Rajwinder', 'Kuldeep', 'Sukhwinder', 'Karamjit', null, null];
const GRIEV = {
  water: 'No canal water for 3 weeks, fields drying.',
  power: '8-hour power cuts in peak season.',
  jobs: 'Educated youth, no jobs locally.',
  roads: 'Link road broken since last monsoon.',
  drugs: 'Drug menace in the village, need action.',
  farm_debt: 'Crop loan crushing us, MSP not paid.',
  health: 'PHC has no doctor for months.',
  education: 'Govt school short of teachers.',
  other: 'Pension stuck, repeated visits no use.',
};
// region issue skew (brief: drugs in Majha, farm_debt in Malwa)
const REGION_ISSUE = {
  Majha: [['drugs', 5], ['water', 3], ['jobs', 2], ['health', 2], ['roads', 1], ['power', 1], ['education', 1], ['farm_debt', 1], ['other', 1]],
  Doaba: [['jobs', 4], ['power', 3], ['roads', 2], ['education', 2], ['water', 1], ['drugs', 2], ['health', 1], ['farm_debt', 1], ['other', 1]],
  Malwa: [['farm_debt', 5], ['water', 3], ['power', 3], ['jobs', 2], ['drugs', 2], ['health', 1], ['roads', 1], ['education', 1], ['other', 1]],
};

(async () => {
  const env = loadEnv();
  const ref = (env.NEXT_PUBLIC_POP_SUPABASE_URL || '').match(/https:\/\/([a-z0-9]+)\./)?.[1];
  if (ref && !env.DATABASE_URL.includes(ref)) { console.error('SAFETY STOP: not POP db'); process.exit(1); }
  const c = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  await c.query("DELETE FROM all_leads WHERE brand='pop' AND phone LIKE '+9198765%'");

  const rows = [];
  let n = 0;
  // ~55 of 117 seats active, weighted so some are hot
  const active = SEATS.filter(() => rnd() < 0.48);
  for (const seat of active) {
    const voices = 1 + Math.floor(rnd() * rnd() * 9); // 1..9, skewed low
    for (let i = 0; i < voices; i++) {
      n++;
      const cat = weighted(REGION_ISSUE[seat.region] || REGION_ISSUE.Malwa);
      // swing seats: bump undecided
      const swing = rnd() < 0.3;
      const lean = swing
        ? weighted([['undecided', 6], ['leaning', 2], ['supporter', 1], ['opposed', 1]])
        : weighted([['supporter', 4], ['leaning', 3], ['undecided', 2], ['opposed', 1]]);
      const daysAgo = weighted([[0, 3], [1, 3], [2, 2], [3, 2], [5, 2], [7, 2], [10, 1], [13, 1]]);
      const created = new Date(Date.now() - daysAgo * 86400000 - Math.floor(rnd() * 80000000));
      const mag = weighted(MAGNETS);
      // first/last_touchpoint must be web|whatsapp|voice|social (existing CHECK).
      const tp = mag === 'whatsapp' ? 'whatsapp' : (mag === 'voice' || mag === 'missed_call') ? 'voice' : 'web';
      rows.push({
        tp,
        name: pick(FIRST),
        phone: '+9198765' + String(100000 + n).slice(-6),
        constituency: seat.name, district: seat.district,
        language: weighted(LANGS), lean, magnet: mag,
        grievance_category: cat, grievance_text: GRIEV[cat],
        salience: weighted([[1, 4], [2, 4], [3, 2]]),
        action_intent: weighted(INTENTS), loop_status: weighted(LOOP),
        created: created.toISOString(),
      });
    }
  }

  const vals = [];
  const ph = [];
  rows.forEach((r, i) => {
    const b = i * 14;
    ph.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},$${b+13},$${b+14})`);
    vals.push('pop', r.name, r.phone, r.tp, r.tp, r.constituency, r.district, r.language, r.lean, r.magnet, r.grievance_category, r.grievance_text, r.salience, r.created);
  });
  // columns: brand, customer_name, phone, first_touchpoint, last_touchpoint, constituency, district, language, lean, magnet, grievance_category, grievance_text, salience, created_at
  // (action_intent + loop_status set in a second pass to keep the tuple width sane)
  await c.query(
    `INSERT INTO all_leads (brand, customer_name, phone, first_touchpoint, last_touchpoint, constituency, district, language, lean, magnet, grievance_category, grievance_text, salience, created_at) VALUES ${ph.join(',')}`,
    vals,
  );
  // second pass: action_intent + loop_status per seeded row
  for (const r of rows) {
    await c.query("UPDATE all_leads SET action_intent=$1, loop_status=$2 WHERE phone=$3 AND brand='pop'", [r.action_intent || 'none', r.loop_status || 'raised', r.phone]);
  }

  const tot = (await c.query("SELECT count(*)::int n FROM all_leads WHERE brand='pop'")).rows[0].n;
  console.log(`seeded ${rows.length} constituents across ${active.length} seats; pop total now ${tot}`);
  await c.end();
})().catch((e) => { console.error('SEED ERR', e.message); process.exit(1); });
