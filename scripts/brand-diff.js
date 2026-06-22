#!/usr/bin/env node
/**
 * brand-diff.js — generate an interactive brand-comparison flow diagram.
 *
 * Reads the real trees (master + each brand) and the shared-core manifest, then
 * emits a SELF-CONTAINED scripts/brand-diff.html (React Flow via CDN, data baked
 * in) showing, at a glance, how every brand differs from the canonical master:
 *   • sync % vs master (identical / drifted / missing shared-core files)
 *   • which features each brand has (code present) and whether the flag is on/off
 *
 * Re-run any time to refresh — nothing is hand-maintained:
 *   node scripts/brand-diff.js   then open scripts/brand-diff.html
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'brand-shared.json'), 'utf8'));
const shared = manifest.sharedCore;
const BRANDS = ['bcon', 'windchasers', 'proxe'];
const masterSrc = path.join(ROOT, 'master', 'agent', 'src');

// ── sync vs master (shared-core manifest) ────────────────────────────────────
function sync(brand) {
  const bs = path.join(ROOT, 'brands', brand, 'agent', 'src');
  let identical = 0, drift = 0, missing = 0;
  for (const rel of shared) {
    const m = path.join(masterSrc, rel), t = path.join(bs, rel);
    if (!fs.existsSync(m)) continue;
    if (!fs.existsSync(t)) { missing++; continue; }
    if (fs.readFileSync(m).equals(fs.readFileSync(t))) identical++; else drift++;
  }
  const total = identical + drift + missing;
  return { identical, drift, missing, total, pct: total ? Math.round((identical / total) * 100) : 0 };
}

// ── feature presence (by marker file) + config flag ──────────────────────────
const FEATURES = [
  { key: 'voice', label: 'Calls', file: 'app/dashboard/calls/page.tsx', flag: 'voice' },
  { key: 'toggle', label: 'Toggle', file: 'lib/useFeatureFlags.ts', flag: null },
  { key: 'brain', label: 'Brain', file: 'components/dashboard/DashboardBrain.tsx', flag: 'brain' },
  { key: 'funnel', label: 'Funnel', file: 'components/dashboard/PipelineFunnel.tsx', flag: 'pipelineFunnel' },
  { key: 'followup', label: 'Follow-up', file: 'app/api/cron/follow-up-sequence/route.ts', flag: 'followUpSequence' },
];

const CONFIG = {
  master: 'master/agent/src/configs/bcon.config.ts', // master is canonical; flags read as reference only
  bcon: 'brands/bcon/agent/src/configs/bcon.config.ts',
  windchasers: 'brands/windchasers/agent/src/configs/brand.config.ts',
  proxe: 'brands/proxe/agent/src/configs/proxe.config.ts',
};

function flags(tree) {
  const p = path.join(ROOT, CONFIG[tree]);
  if (!fs.existsSync(p)) return {};
  const s = fs.readFileSync(p, 'utf8');
  const block = (s.match(/features\s*:\s*\{([^}]*)\}/) || [])[1] || '';
  const read = (k) => { const m = block.match(new RegExp(k + '\\s*:\\s*(true|false)')); return m ? m[1] === 'true' : null; };
  return { voice: read('voice'), brain: read('brain'), pipelineFunnel: read('pipelineFunnel'), followUpSequence: read('followUpSequence') };
}

function srcRoot(tree) { return tree === 'master' ? masterSrc : path.join(ROOT, 'brands', tree, 'agent', 'src'); }

function featureStates(tree) {
  const fl = flags(tree);
  const root = srcRoot(tree);
  return FEATURES.map((f) => {
    const present = fs.existsSync(path.join(root, f.file));
    let state;
    if (!present) state = 'absent';
    else if (f.flag && fl[f.flag] === false) state = 'off';
    else state = 'on';
    return { key: f.key, label: f.label, state };
  });
}

// ── assemble ─────────────────────────────────────────────────────────────────
const DATA = {
  generatedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
  master: { tree: 'master', role: 'canonical', features: featureStates('master') },
  brands: BRANDS.map((b) => ({ tree: b, role: 'brand', sync: sync(b), features: featureStates(b) })),
};

// ── HTML (React Flow via esm.sh import map; data inlined) ─────────────────────
const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>PROXe — Brand Diff Flow</title>
<link rel="stylesheet" href="https://esm.sh/reactflow@11.11.4/dist/style.css" />
<style>
  :root { --bg:#0b0e14; --panel:#141925; --line:#263041; --txt:#e6edf3; --mut:#8b97a7;
          --green:#22c55e; --amber:#f59e0b; --red:#ef4444; --slate:#64748b; --accent:#8b5cf6; }
  * { box-sizing:border-box; }
  html,body { margin:0; height:100%; background:var(--bg); color:var(--txt);
    font:14px/1.4 ui-sans-serif,system-ui,Segoe UI,Roboto,Arial; }
  #app { height:100vh; display:flex; flex-direction:column; }
  header { padding:12px 18px; border-bottom:1px solid var(--line); display:flex; align-items:baseline; gap:14px; flex-wrap:wrap; }
  header h1 { font-size:16px; margin:0; font-weight:700; }
  header .sub { color:var(--mut); font-size:12px; }
  .legend { margin-left:auto; display:flex; gap:14px; font-size:12px; color:var(--mut); flex-wrap:wrap; }
  .legend b { display:inline-block; width:10px; height:10px; border-radius:3px; margin-right:5px; vertical-align:middle; }
  #flow { flex:1; min-height:0; }
  .node { width:230px; border-radius:14px; background:var(--panel); border:1.5px solid var(--line);
    box-shadow:0 8px 30px rgba(0,0,0,.35); overflow:hidden; }
  .node.canonical { border-color:var(--accent); }
  .node .hd { padding:10px 12px 8px; display:flex; align-items:center; justify-content:space-between; gap:8px;
    border-bottom:1px solid var(--line); }
  .node .name { font-weight:700; font-size:15px; text-transform:capitalize; }
  .node .role { font-size:10px; text-transform:uppercase; letter-spacing:.06em; color:var(--mut); }
  .node .pct { font-size:18px; font-weight:800; }
  .bar { height:5px; background:#0b0e14; border-radius:99px; overflow:hidden; margin-top:6px; }
  .bar > span { display:block; height:100%; }
  .node .body { padding:9px 12px 12px; }
  .pills { display:flex; flex-wrap:wrap; gap:5px; margin-top:2px; }
  .pill { font-size:10.5px; padding:2.5px 7px; border-radius:99px; font-weight:600; border:1px solid transparent; }
  .pill.on { background:rgba(34,197,94,.15); color:var(--green); border-color:rgba(34,197,94,.35); }
  .pill.off { background:rgba(100,116,139,.15); color:var(--slate); border-color:rgba(100,116,139,.35); }
  .pill.absent { background:rgba(239,68,68,.13); color:var(--red); border-color:rgba(239,68,68,.3); }
  .meta { color:var(--mut); font-size:11px; margin-top:9px; }
  .edge-label { background:var(--panel); border:1px solid var(--line); color:var(--txt);
    font-size:11px; padding:2px 7px; border-radius:8px; font-weight:600; }
</style>
</head>
<body>
<div id="app">
  <header>
    <h1>PROXe — Brand Diff Flow</h1>
    <span class="sub">master = canonical · each brand should differ only by brand config · generated ${DATA.generatedAt}</span>
    <div class="legend">
      <span><b style="background:var(--green)"></b>on / in&nbsp;sync</span>
      <span><b style="background:var(--slate)"></b>present, off</span>
      <span><b style="background:var(--red)"></b>absent / stale</span>
      <span><b style="background:var(--amber)"></b>drift</span>
    </div>
  </header>
  <div id="flow"></div>
</div>
<script type="importmap">
{ "imports": {
  "react": "https://esm.sh/react@18.2.0",
  "react-dom": "https://esm.sh/react-dom@18.2.0",
  "react-dom/client": "https://esm.sh/react-dom@18.2.0/client",
  "reactflow": "https://esm.sh/reactflow@11.11.4?external=react,react-dom",
  "htm": "https://esm.sh/htm@3.1.1"
} }
</script>
<script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import ReactFlow, { Background, Controls, Handle, Position } from 'reactflow';
import htm from 'htm';
const html = htm.bind(React.createElement);
const DATA = ${JSON.stringify(DATA)};

const healthColor = (pct) => pct >= 95 ? 'var(--green)' : pct >= 70 ? 'var(--amber)' : 'var(--red)';

function pills(features) {
  return html\`<div class="pills">\${features.map(f =>
    html\`<span key=\${f.key} class=\${'pill ' + f.state} title=\${f.label + ': ' + f.state}>\${f.label}\</span>\`)}</div>\`;
}

function BrandNode({ data }) {
  const d = data;
  const canonical = d.role === 'canonical';
  const pct = d.sync ? d.sync.pct : 100;
  return html\`<div class=\${'node ' + (canonical ? 'canonical' : '')}>
    \${!canonical && html\`<\${Handle} type="target" position=\${Position.Top} style=\${{opacity:0}} />\`}
    \${canonical && html\`<\${Handle} type="source" position=\${Position.Bottom} style=\${{opacity:0}} />\`}
    <div class="hd">
      <div><div class="name">\${d.tree}</div><div class="role">\${d.role}</div></div>
      \${!canonical && html\`<div class="pct" style=\${{color:healthColor(pct)}}>\${pct}%</div>\`}
    </div>
    <div class="body">
      \${!canonical && html\`<div class="bar"><span style=\${{width:pct+'%',background:healthColor(pct)}}></span></div>\`}
      \${pills(d.features)}
      \${!canonical
        ? html\`<div class="meta">\${d.sync.identical} identical · \${d.sync.drift} drift · \${d.sync.missing} missing · of \${d.sync.total}</div>\`
        : html\`<div class="meta">source of truth · \${d.features.filter(f=>f.state!=='absent').length}/\${d.features.length} features present</div>\`}
    </div>
  </div>\`;
}

const nodeTypes = { brand: BrandNode };
const NX = { master:{x:360,y:30}, bcon:{x:40,y:330}, windchasers:{x:360,y:330}, proxe:{x:680,y:330} };

const nodes = [
  { id:'master', type:'brand', position:NX.master, data:DATA.master, draggable:true },
  ...DATA.brands.map(b => ({ id:b.tree, type:'brand', position:NX[b.tree], data:b, draggable:true })),
];
const edges = DATA.brands.map(b => {
  const c = healthColor(b.sync.pct);
  const behind = b.sync.drift + b.sync.missing;
  return { id:'e-'+b.tree, source:'master', target:b.tree, animated:behind>0,
    style:{ stroke:c, strokeWidth:2 },
    label: behind===0 ? 'in sync' : (b.sync.drift+' drift · '+b.sync.missing+' missing'),
    labelBgPadding:[6,3], labelBgBorderRadius:8,
    labelStyle:{ fill:'#e6edf3', fontSize:11, fontWeight:600 },
    labelBgStyle:{ fill:'#141925', stroke:'#263041' } };
});

function App() {
  return html\`<\${ReactFlow} nodes=\${nodes} edges=\${edges} nodeTypes=\${nodeTypes}
      fitView fitViewOptions=\${{padding:0.2}} minZoom=\${0.3} proOptions=\${{hideAttribution:true}}>
    <\${Background} color="#1b2230" gap=\${22} />
    <\${Controls} showInteractive=\${false} />
  </\${ReactFlow}>\`;
}
createRoot(document.getElementById('flow')).render(html\`<\${App} />\`);
</script>
</body>
</html>`;

fs.writeFileSync(path.join(ROOT, 'scripts', 'brand-diff.html'), HTML);
console.log('Wrote scripts/brand-diff.html');
console.log('master features:', DATA.master.features.map(f => f.label + ':' + f.state).join(', '));
for (const b of DATA.brands) {
  console.log(`${b.tree.padEnd(12)} sync ${b.sync.pct}%  (${b.sync.identical}/${b.sync.total}, ${b.sync.drift} drift, ${b.sync.missing} missing)  | ` +
    b.features.map(f => f.label + ':' + f.state).join(', '));
}
