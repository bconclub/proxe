#!/usr/bin/env node
/**
 * Scale the POP demo data ~10x so the dashboard reads like real campaign volume:
 * ~27k people on the intensity ladder and ~3,000 cadre (badge holders).
 *
 * Adds leads with fields that DERIVE the right tier via the pop_set_intensity
 * trigger (no direct intensity writes):
 *   tier 1 voter     — constituency + lean leaning/undecided, no qualifying action
 *   tier 2 supporter — lean='supporter'
 *   tier 3 volunteer — action_intent='volunteer'
 * Then links 3,000 tier-3 leads to active d2d_workers → pop_promote_cadre bumps
 * them to tier 4 (cadre). Evening-biased created_at keeps the heatmap rhythm.
 *
 * Idempotent-ish: clears prior scale rows (phone prefix +9197) + their workers
 * first, so re-running resets to the target instead of stacking.
 *
 *   node brands/pop/supabase/seed-scale.cjs
 */
const fs = require('fs');
const path = require('path');
const { Client } = (() => {
  try { return require(path.join(__dirname, '..', 'agent', 'node_modules', 'pg')); }
  catch { return require('pg'); }
})();
const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, '..', 'agent', '.env.local'), 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

const SEATS = require('./_seats.json'); // {name, district, region}[]
let s = 20260708;
const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const weighted = (pairs) => { const t = pairs.reduce((x, [, w]) => x + w, 0); let r = rnd() * t; for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; } return pairs[0][0]; };

const CATS = ['jobs', 'water', 'power', 'roads', 'drugs', 'farm_debt', 'health', 'education', 'other'];
const GRIEV = { water: 'No canal water, fields drying.', power: '8-hour power cuts in peak season.', jobs: 'Educated youth, no jobs locally.', roads: 'Link road broken since monsoon.', drugs: 'Drug menace in the village, need action.', farm_debt: 'Crop loan crushing us, MSP not paid.', health: 'PHC has no doctor for months.', education: 'Govt school short of teachers.', other: 'Pension stuck, repeated visits no use.' };
const MAGNETS = [['whatsapp', 5], ['voice', 3], ['pulse_app', 4], ['missed_call', 2], ['qr', 3], ['d2d', 2]];
const LANGS = [['pa', 6], ['hi', 3], ['en', 1]];
const FIRST = ['Harpreet', 'Gurpreet', 'Manjit', 'Simran', 'Jaspreet', 'Baljit', 'Navdeep', 'Amandeep', 'Rajwinder', 'Kuldeep', 'Sukhwinder', 'Karamjit', 'Paramjit', 'Ranjit', 'Davinder', 'Charanjit', null];
// evening-biased hour (matches bias-hours.js so the heatmap keeps its rhythm)
const HOUR_W = { 8: 2, 9: 3, 10: 4, 11: 4, 12: 5, 13: 4, 14: 3, 15: 3, 16: 4, 17: 6, 18: 9, 19: 12, 20: 11, 21: 8, 22: 4 };
const pickHour = () => Number(weighted(Object.entries(HOUR_W)));

const TARGET_TOTAL = 27000;
const CADRE_TARGET = 3000;

(async () => {
  const ref = (env.NEXT_PUBLIC_POP_SUPABASE_URL || '').match(/https:\/\/([a-z0-9]+)\./)?.[1];
  if (ref && !env.DATABASE_URL.includes(ref)) { console.error('SAFETY STOP: not POP db'); process.exit(1); }
  const c = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  // reset prior scale rows
  await c.query("DELETE FROM d2d_workers WHERE phone LIKE '+9197%'");
  await c.query("DELETE FROM conversations WHERE lead_id IN (SELECT id FROM all_leads WHERE brand='pop' AND phone LIKE '+9197%')");
  await c.query("DELETE FROM all_leads WHERE brand='pop' AND phone LIKE '+9197%'");

  const existing = (await c.query("SELECT count(*)::int n FROM all_leads WHERE brand='pop'")).rows[0].n;
  const toAdd = Math.max(0, TARGET_TOTAL - existing);
  console.log(`existing ${existing}, adding ${toAdd} to reach ~${TARGET_TOTAL}…`);

  const now = Date.now();
  const rows = [];
  for (let i = 0; i < toAdd; i++) {
    const seat = pick(SEATS);
    // peak-tier split: 40% voter · 35% supporter · 25% volunteer
    const roll = rnd();
    let lean, action, engagement;
    if (roll < 0.40) { lean = pick(['leaning', 'undecided']); action = 'none'; engagement = 'info'; }
    else if (roll < 0.75) { lean = 'supporter'; action = weighted([['none', 3], ['share', 2], ['vote', 2], ['rally', 1]]); engagement = 'info'; }
    else { lean = pick(['supporter', 'leaning']); action = 'volunteer'; engagement = 'volunteer'; }

    const hasGriev = rnd() < 0.73;
    const cat = hasGriev ? pick(CATS) : null;
    const daysAgo = Math.floor(rnd() * 45);
    const created = new Date(now - daysAgo * 86400000);
    created.setUTCHours(pickHour(), Math.floor(rnd() * 60), Math.floor(rnd() * 60), 0);
    const mag = weighted(MAGNETS);
    const tp = mag === 'whatsapp' ? 'whatsapp' : (mag === 'voice' || mag === 'missed_call') ? 'voice' : 'web';
    const score = weighted([[8, 3], [22, 3], [38, 3], [52, 2], [66, 2], [80, 1], [92, 1]]);
    const stage = score >= 86 ? 'Booking Made' : score >= 61 ? 'High Intent' : score >= 31 ? 'Qualified' : 'New';
    rows.push({
      name: pick(FIRST), phone: '+9197' + String(1000000 + i).slice(-7),
      tp, constituency: seat.name, district: seat.district, language: weighted(LANGS),
      lean, magnet: mag, cat, griev: cat ? GRIEV[cat] : null,
      salience: weighted([[1, 4], [2, 4], [3, 2]]), created: created.toISOString(),
      score, stage, lastInter: created.toISOString(), activeChat: rnd() < 0.15,
      action, engagement, loop: hasGriev ? weighted([['raised', 6], ['routed', 3], ['resolved', 2]]) : 'raised',
    });
  }

  const COLS = 'brand, customer_name, phone, first_touchpoint, last_touchpoint, constituency, district, language, lean, magnet, grievance_category, grievance_text, salience, created_at, lead_score, lead_stage, last_interaction_at, is_active_chat, action_intent, engagement_type, loop_status';
  const NC = 21;
  const CHUNK = 700;
  let inserted = 0;
  for (let off = 0; off < rows.length; off += CHUNK) {
    const slice = rows.slice(off, off + CHUNK);
    const ph = []; const vals = [];
    slice.forEach((r, i) => {
      const b = i * NC;
      ph.push('(' + Array.from({ length: NC }, (_, k) => '$' + (b + k + 1)).join(',') + ')');
      vals.push('pop', r.name, r.phone, r.tp, r.tp, r.constituency, r.district, r.language, r.lean, r.magnet,
        r.cat, r.griev, r.salience, r.created, r.score, r.stage, r.lastInter, r.activeChat, r.action, r.engagement, r.loop);
    });
    await c.query(`INSERT INTO all_leads (${COLS}) VALUES ${ph.join(',')}`, vals);
    inserted += slice.length;
    if (off % 3500 === 0) process.stdout.write(`  ${inserted}/${rows.length}\r`);
  }
  console.log(`\ninserted ${inserted} leads`);

  // ── Cadre: link 3,000 tier-3 volunteers to active d2d_workers → tier 4 ──
  const vols = (await c.query(
    "SELECT id, customer_name, phone, constituency FROM all_leads WHERE brand='pop' AND intensity=3 AND phone LIKE '+9197%' ORDER BY random() LIMIT $1", [CADRE_TARGET]
  )).rows;
  console.log(`linking ${vols.length} volunteers to cadre workers…`);
  const WC = 6; // name, phone, lead_id, constituency, verification_code, status
  const wcols = 'name, phone, lead_id, constituency, verification_code, status';
  let wIns = 0;
  for (let off = 0; off < vols.length; off += CHUNK) {
    const slice = vols.slice(off, off + CHUNK);
    const ph = []; const vals = [];
    slice.forEach((v, i) => {
      const b = i * WC;
      ph.push('(' + Array.from({ length: WC }, (_, k) => '$' + (b + k + 1)).join(',') + ')');
      const code = 'POP-C' + String(100000 + off + i).slice(-6);
      vals.push(v.customer_name || 'Karyakarta', '+9197W' + String(1000000 + off + i).slice(-7), v.id, v.constituency, code, 'active');
    });
    await c.query(`INSERT INTO d2d_workers (${wcols}) VALUES ${ph.join(',')}`, vals);
    wIns += slice.length;
  }
  console.log(`created ${wIns} cadre workers`);

  // report
  const dist = (await c.query("SELECT intensity, count(*)::int n FROM all_leads WHERE brand='pop' GROUP BY 1 ORDER BY 1")).rows;
  const tot = (await c.query("SELECT count(*)::int n FROM all_leads WHERE brand='pop'")).rows[0].n;
  const ladder = (await c.query("SELECT sum((intensity>=1)::int)::int v, sum((intensity>=2)::int)::int s, sum((intensity>=3)::int)::int vol, sum((intensity>=4)::int)::int cad FROM all_leads WHERE brand='pop'")).rows[0];
  console.log('total pop leads:', tot);
  console.log('intensity dist:', JSON.stringify(dist));
  console.log(`LADDER → voters ${ladder.v} · supporters ${ladder.s} · volunteers ${ladder.vol} · cadre ${ladder.cad}`);
  await c.end();
})().catch((e) => { console.error('SCALE ERR', e.message); process.exit(1); });
