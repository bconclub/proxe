#!/usr/bin/env node
/**
 * Seed PROXe Listen signals (POP DB only). Idempotent: clears prior seed rows
 * (author prefix 'seed:') then inserts a realistic 30-day spread across every
 * source, issue, sentiment and seat so the Listen board looks like it handles
 * real volume. NOT part of the live board — a one-off demo data loader.
 *
 *   node brands/pop/supabase/seed-listen.js
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

const SEATS = require('./_seats.json'); // {name, district, region}[]

// deterministic pseudo-random so re-seeds are stable
let s = 987654;
const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const weighted = (pairs) => { const t = pairs.reduce((x, [, w]) => x + w, 0); let r = rnd() * t; for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; } return pairs[0][0]; };

const SOURCES = [
  ['twitter', 8], ['facebook', 7], ['news', 6], ['whatsapp_trend', 6],
  ['instagram', 4], ['youtube', 3], ['complaint', 5], ['call_centre', 5],
  ['volunteer_report', 4], ['survey', 2],
];
const CATS = ['jobs', 'water', 'power', 'roads', 'drugs', 'farm_debt', 'health', 'education', 'other'];
// region issue skew mirrors the war-room seed
const REGION_ISSUE = {
  Majha: [['drugs', 5], ['water', 3], ['jobs', 2], ['health', 2], ['roads', 1], ['power', 1], ['education', 1], ['farm_debt', 1]],
  Doaba: [['jobs', 4], ['power', 3], ['roads', 2], ['education', 2], ['water', 1], ['drugs', 2], ['health', 1], ['farm_debt', 1]],
  Malwa: [['farm_debt', 5], ['water', 3], ['power', 3], ['jobs', 2], ['drugs', 2], ['health', 1], ['roads', 1], ['education', 1]],
};

// content templates by category + sentiment lean. {seat} is filled per row.
const NEG = {
  water: ['No canal water reaching tail-end villages in {seat}, standing crop drying up.', 'Third week without irrigation water in {seat}, farmers furious.', 'Tubewells running dry in {seat}, drinking water tankers not coming.'],
  power: ['8-hour unscheduled power cuts across {seat} in peak paddy season.', 'Transformer blown in {seat} for 5 days, nobody from PSPCL responding.', 'Voltage fluctuation damaging motors in {seat}, huge losses.'],
  jobs: ['Educated youth in {seat} jobless, migration to Canada rising.', 'Promised factory in {seat} never came, thousands still unemployed.', 'Contractual staff in {seat} unpaid for months, protest planned.'],
  roads: ['Link road in {seat} broken since monsoon, school buses cannot pass.', 'Potholes on {seat} main road caused another accident last night.', 'No streetlights on {seat} bypass, unsafe after dark.'],
  drugs: ['Drug menace spreading fast among youth in {seat}, families desperate.', 'Open sale of chitta near {seat} bus stand, police looking away.', 'Two young men from {seat} died of overdose this week.'],
  farm_debt: ['Crop loan crushing small farmers in {seat}, MSP payment stuck.', 'Arhtiya dues unpaid in {seat}, another farmer took his life.', 'Fertiliser shortage in {seat} at sowing time, black marketing rampant.'],
  health: ['PHC in {seat} has no doctor for months, patients travelling 40km.', 'No ambulance in {seat} last night, pregnant woman suffered.', 'Medicine stock-out at {seat} civil hospital, buying from private.'],
  education: ['Govt school in {seat} short of 6 teachers, kids sitting idle.', 'No science lab in {seat} senior secondary, students switching out.', 'Mid-day meal quality in {seat} schools very poor, parents angry.'],
  other: ['Old-age pension stuck for months in {seat}, repeated visits useless.', 'Ration depot in {seat} short-weighing, no action on complaints.', 'Encroachment on {seat} panchayat land, officials silent.'],
};
const POS = {
  water: ['New tubewell inaugurated in {seat}, villagers thanking the team.', 'Canal desilting in {seat} finally done, water reaching fields.'],
  power: ['Power supply in {seat} much better this week, people appreciating.', 'New feeder line for {seat} approved, farmers relieved.'],
  jobs: ['Skill camp in {seat} placed 40 youth, families grateful.', 'Local startup in {seat} hiring, hope returning.'],
  roads: ['{seat} link road repair started, residents happy at last.', 'Streetlights restored on {seat} bypass, safer now.'],
  drugs: ['De-addiction drive in {seat} helping families, strong response.', 'Youth club in {seat} running sports to keep kids off drugs.'],
  farm_debt: ['MSP payment cleared for {seat} farmers, relief on the ground.', 'Debt-relief camp in {seat} well received.'],
  health: ['New doctor joined {seat} PHC, long queues but grateful.', 'Free health camp in {seat} screened 300 people.'],
  education: ['Two new teachers posted to {seat} school, parents pleased.', 'Smart classroom in {seat} inaugurated, kids excited.'],
  other: ['Pension arrears released in {seat}, elders thankful.', 'Ration depot in {seat} cleaned up after our follow-up.'],
};
const OPP = [
  'Opposition holding rally in {seat} claiming our promises are all laare (empty).',
  'Rival party WhatsApp forward in {seat} calling this a flop show, spreading fast.',
  'Opposition leader in {seat} attacking on drugs record, video going viral.',
  'Fake news in {seat} that funds were diverted, need quick rebuttal.',
];
const CRISIS = [
  'URGENT: farmer protest blocking highway near {seat}, TV crews arriving.',
  'CRISIS: contaminated water reported in {seat}, several hospitalised.',
  'URGENT: clash during {seat} rally, one injured, footage circulating.',
  'CRISIS: sudden power grid failure across {seat} block, anger boiling.',
];

(async () => {
  const env = loadEnv();
  const ref = (env.NEXT_PUBLIC_POP_SUPABASE_URL || '').match(/https:\/\/([a-z0-9]+)\./)?.[1];
  if (ref && !env.DATABASE_URL.includes(ref)) { console.error('SAFETY STOP: not POP db'); process.exit(1); }
  const c = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  await c.query("DELETE FROM listen_signals WHERE brand='pop' AND author LIKE 'seed:%'");

  const rows = [];
  const N = 780;
  for (let i = 0; i < N; i++) {
    const seat = pick(SEATS);
    const src = weighted(SOURCES);
    // recency skew: more recent signals, with a plateau back to 30d
    const daysAgo = weighted([[0, 6], [1, 6], [2, 5], [3, 4], [4, 3], [5, 3], [6, 3], [8, 2], [10, 2], [13, 2], [16, 1], [20, 1], [25, 1], [29, 1]]);
    const created = new Date(Date.now() - daysAgo * 86400000 - Math.floor(rnd() * 86000000));

    // classify: 6% crisis, 14% opposition, ~30% positive, rest negative-ish
    const roll = rnd();
    let content, sentiment, cat, sev = 1, isCrisis = false, isOpp = false, isPos = false;
    if (roll < 0.06) {
      isCrisis = true; sentiment = 'negative'; sev = 3;
      cat = weighted(REGION_ISSUE[seat.region] || REGION_ISSUE.Malwa);
      content = pick(CRISIS).replace(/\{seat\}/g, seat.name);
    } else if (roll < 0.20) {
      isOpp = true; sentiment = 'negative'; sev = weighted([[2, 3], [3, 1]]);
      cat = weighted([['drugs', 3], ['jobs', 2], ['farm_debt', 2], ['other', 1]]);
      content = pick(OPP).replace(/\{seat\}/g, seat.name);
    } else if (roll < 0.50) {
      isPos = true; sentiment = 'positive'; sev = 1;
      cat = weighted(REGION_ISSUE[seat.region] || REGION_ISSUE.Malwa);
      content = pick(POS[cat] || POS.other).replace(/\{seat\}/g, seat.name);
    } else if (roll < 0.62) {
      sentiment = 'neutral'; sev = 1;
      cat = weighted(REGION_ISSUE[seat.region] || REGION_ISSUE.Malwa);
      content = pick(NEG[cat] || NEG.other).replace(/\{seat\}/g, seat.name);
    } else {
      sentiment = 'negative'; sev = weighted([[1, 3], [2, 2], [3, 1]]);
      cat = weighted(REGION_ISSUE[seat.region] || REGION_ISSUE.Malwa);
      content = pick(NEG[cat] || NEG.other).replace(/\{seat\}/g, seat.name);
    }

    const urlBase = {
      twitter: 'https://twitter.com/i/status/', facebook: 'https://facebook.com/posts/',
      instagram: 'https://instagram.com/p/', youtube: 'https://youtube.com/watch?v=',
      news: 'https://tribuneindia.com/news/punjab/', whatsapp_trend: null,
      complaint: null, call_centre: null, volunteer_report: null, survey: null,
    }[src];
    const url = urlBase ? urlBase + Math.floor(rnd() * 1e9).toString(36) : null;

    rows.push({
      source: src, content, url, author: 'seed:' + src,
      sentiment, issue_category: cat, constituency: seat.name, district: seat.district,
      severity: sev, is_crisis: isCrisis, is_opposition: isOpp, is_positive: isPos,
      created: created.toISOString(),
    });
  }

  const cols = 'brand, source, content, url, author, sentiment, issue_category, constituency, district, severity, is_crisis, is_opposition, is_positive, created_at';
  const NC = 14;
  // batch insert in chunks of 200 rows to stay under param limits
  const CHUNK = 200;
  let inserted = 0;
  for (let off = 0; off < rows.length; off += CHUNK) {
    const slice = rows.slice(off, off + CHUNK);
    const p = []; const v = [];
    slice.forEach((r, i) => {
      const b = i * NC;
      p.push('(' + Array.from({ length: NC }, (_, k) => '$' + (b + k + 1)).join(',') + ')');
      v.push('pop', r.source, r.content, r.url, r.author, r.sentiment, r.issue_category,
        r.constituency, r.district, r.severity, r.is_crisis, r.is_opposition, r.is_positive, r.created);
    });
    await c.query(`INSERT INTO listen_signals (${cols}) VALUES ${p.join(',')}`, v);
    inserted += slice.length;
  }

  const tot = (await c.query("SELECT count(*)::int n FROM listen_signals WHERE brand='pop'")).rows[0].n;
  const cri = (await c.query("SELECT count(*)::int n FROM listen_signals WHERE brand='pop' AND is_crisis")).rows[0].n;
  console.log(`seeded ${inserted} listen signals (crisis ${cri}); pop listen_signals total now ${tot}`);
  await c.end();
})().catch((e) => { console.error('SEED ERR', e.message); process.exit(1); });
