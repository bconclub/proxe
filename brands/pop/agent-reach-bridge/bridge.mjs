#!/usr/bin/env node
/**
 * PROXe Listen bridge — pulls the TOP things happening in Punjab RIGHT NOW via
 * Agent-Reach's whole-web semantic search (Exa, free, no key), classifies each
 * (issue category · sentiment · crisis / opposition / positive), and POSTs to
 * /api/agent/listen/log so real news drives the Listener instead of random seed.
 *
 * Runs on the VPS on a schedule (cron). No cookies needed — web search only.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const ENV = Object.fromEntries(
  fs.readFileSync(new URL('./.env', import.meta.url), 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const KEY = ENV.INBOUND_API_KEY;
const BASE = ENV.POP_PROXE_URL || 'https://pop-proxe.vercel.app';
const MCP_CFG = '/root/agent-reach/config/mcporter.json';

// Queries that surface the loudest current Punjab issues — general pulse + one
// per grievance category + the political axis.
const QUERIES = [
  { q: 'Punjab top political news today latest', cat: null },
  { q: 'Punjab canal water supply crisis shortage this week', cat: 'water' },
  { q: 'Punjab drugs chitta menace youth de-addiction', cat: 'drugs' },
  { q: 'Punjab farmers MSP crop loan debt mandi protest', cat: 'farm_debt' },
  { q: 'Punjab unemployment jobs youth migration', cat: 'jobs' },
  { q: 'Punjab power cuts electricity PSPCL supply', cat: 'power' },
  { q: 'Punjab roads potholes transport village connectivity', cat: 'roads' },
  { q: 'Punjab hospitals health PHC doctors shortage', cat: 'health' },
  { q: 'Punjab government schools teachers education', cat: 'education' },
  { q: 'Punjab AAP Bhagwant Mann government opposition Congress Akali BJP', cat: null },
];

const CAT_KW = {
  water: ['water', 'canal', 'irrigation', 'tubewell', 'drinking water', 'flood', 'dam'],
  drugs: ['drug', 'chitta', 'narcotic', 'de-addiction', 'overdose', 'smuggl', 'heroin', 'nsha'],
  farm_debt: ['farmer', ' msp', 'crop', 'mandi', 'loan', 'debt', 'arhtiya', 'paddy', 'wheat', 'fertiliser', 'urea', 'kisan', 'agri'],
  jobs: ['job', 'unemploy', 'employment', 'recruit', 'migrat', 'vacancy', 'hiring', 'salary'],
  power: ['power ', 'electricity', 'pspcl', 'transformer', 'load shed', 'grid'],
  roads: ['road', 'pothole', 'transport', ' bus ', 'highway', 'street', 'flyover', 'accident'],
  health: ['hospital', 'health', ' phc', 'doctor', 'medicine', 'ambulance', 'dengue', 'clinic'],
  education: ['school', 'teacher', 'education', 'student', 'college', 'university', 'exam'],
};
function classifyCat(text, forced) {
  if (forced) return forced;
  const t = ' ' + text.toLowerCase() + ' ';
  for (const [cat, kws] of Object.entries(CAT_KW)) if (kws.some((k) => t.includes(k))) return cat;
  return 'other';
}
const NEG = ['crisis', 'protest', 'clash', 'anger', 'angry', 'breakdown', 'heat', 'cornered', 'fails', 'shortage', 'delay', 'died', ' dead', 'hospitalised', 'lathicharge', 'stir', 'agitation', 'strike', 'scam', 'extortion', ' fir ', 'arrest', ' row', 'slam', 'attack', 'blame', 'worse', 'suicide', 'unrest'];
const POS = ['inaugurat', 'relief', 'launched', 'approved', ' wins', ' win ', 'boost', 'resolved', 'distributed', 'completed', 'success', 'praise', 'thank', 'record', 'welcome', 'benefit'];
const CRISIS = ['crisis', 'clash', ' dead', 'died', 'hospitalised', 'breakdown', 'emergency', 'blast', ' fire', 'lathicharge', 'stampede', 'suicide', 'violence'];
const OPP = ['opposition', 'congress', 'akali', ' bjp', 'cornered', 'slam', 'flays', 'hits out', 'targets', 'attack', 'blame'];
function classify(text) {
  const t = ' ' + text.toLowerCase() + ' ';
  const neg = NEG.some((k) => t.includes(k)), pos = POS.some((k) => t.includes(k));
  const is_crisis = CRISIS.some((k) => t.includes(k));
  const is_opposition = OPP.some((k) => t.includes(k));
  const is_positive = pos && !neg;
  const sentiment = (neg || is_crisis) && !pos ? 'negative' : is_positive ? 'positive' : 'neutral';
  const severity = is_crisis ? 3 : is_opposition ? 2 : 1;
  return { sentiment, is_crisis, is_opposition, is_positive, severity };
}

function parseResults(jsonStr) {
  let j; try { j = JSON.parse(jsonStr); } catch { return []; }
  const text = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  const parts = text.split(/\n(?=Title:\s)/).map((s) => s.trim()).filter(Boolean);
  return parts.map((p) => {
    const title = (p.match(/^Title:\s*(.+)$/m) || [])[1] || null;
    const url = (p.match(/^URL:\s*(.+)$/m) || [])[1] || null;
    let author = (p.match(/^Author:\s*(.+)$/m) || [])[1] || null;
    if (author) author = author.slice(0, 80);
    const hi = (p.split(/Highlights:\s*/)[1] || p).replace(/\n\s*\.\.\.\s*\n/g, ' ').replace(/\s+/g, ' ').trim();
    const content = ((title ? title + '. ' : '') + hi).slice(0, 600);
    return { title, url, author, content };
  }).filter((r) => r.title && r.url && r.content.length > 40);
}

async function post(sig) {
  try {
    const res = await fetch(`${BASE}/api/agent/listen/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': KEY },
      body: JSON.stringify(sig),
    });
    return res.status;
  } catch { return 0; }
}

(async () => {
  const seen = new Set();
  let posted = 0, dupe = 0, err = 0, found = 0;
  for (const { q, cat } of QUERIES) {
    let out;
    try {
      out = execSync(
        `mcporter --config ${MCP_CFG} call 'exa.web_search_exa(query: ${JSON.stringify(q)}, numResults: 6)' --output json`,
        { encoding: 'utf8', timeout: 70000, maxBuffer: 12 * 1024 * 1024 },
      );
    } catch (e) { console.error('search fail:', q, String(e.message).slice(0, 60)); continue; }
    for (const r of parseResults(out)) {
      if (seen.has(r.url)) continue;
      seen.add(r.url); found++;
      const category = classifyCat(r.title + ' ' + r.content, cat);
      const cl = classify(r.title + ' ' + r.content);
      const st = await post({ source: 'news', content: r.content, url: r.url, author: r.author, issue_category: category, ...cl });
      if (st === 200) posted++; else if (st === 500) dupe++; else err++;
    }
  }
  console.log(`[pop-listen-bridge] found ${found} · posted ${posted} · dupe/skip ${dupe} · err ${err}`);
})();
