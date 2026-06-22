#!/usr/bin/env node
/**
 * brand-diff.js — interactive brand-comparison flow diagram.
 *
 * Reads the real trees (master + each brand) + the shared-core manifest, then
 * emits a SELF-CONTAINED scripts/brand-diff.html (React Flow via CDN, data baked
 * in) showing how every brand differs from canonical master:
 *   • sync % vs master (identical / drifted / missing shared-core files)
 *   • capabilities grouped by area (Channels / Dashboard / Engine / Platform),
 *     each a pill: on (green) · present-but-off (slate) · absent (red)
 *   • hover any pill → what it does + this brand's state/config
 *   • hover the brand's config chip → that brand's full config (theme, prompt,
 *     api, avatar, feature flags)
 *
 *   node scripts/brand-diff.js            # regenerate the html
 *   node scripts/brand-diff.js --serve    # regenerate + host + open browser
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { exec } = require('child_process');

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'brand-shared.json'), 'utf8'));
const shared = manifest.sharedCore;
const BRANDS = ['bcon', 'windchasers', 'proxe'];
const masterSrc = path.join(ROOT, 'master', 'agent', 'src');

// ── capabilities (grouped) — marker file = "is this wired in this tree" ───────
const CATS = [
  { cat: 'Channels', items: [
    { key: 'web', label: 'Web chat', file: 'components/widget/ChatWidget.tsx', desc: 'Website chat widget + web agent (/api/agent/web/chat).' },
    { key: 'whatsapp', label: 'WhatsApp', file: 'app/api/agent/whatsapp/webhook/route.ts', desc: 'WhatsApp inbound webhook, outbound send + Meta templates.' },
    { key: 'instagram', label: 'Instagram', file: 'lib/services/instagramSender.ts', desc: 'Instagram DM + comment replies (Meta).' },
    { key: 'voice', label: 'Calls', file: 'app/dashboard/calls/page.tsx', flag: 'voice', desc: 'Vapi inbound/outbound calls + Calls dashboard (recordings, transcripts).' },
  ] },
  { cat: 'Dashboard', items: [
    { key: 'brain', label: 'Brain', file: 'components/dashboard/DashboardBrain.tsx', flag: 'brain', desc: '"Ask PROXe" — Q&A over your live dashboard data (Sonnet).' },
    { key: 'funnel', label: 'Funnel', file: 'components/dashboard/PipelineFunnel.tsx', flag: 'pipelineFunnel', desc: 'Pipeline funnel-stage breakdown widget.' },
    { key: 'tasks', label: 'Tasks', file: 'app/dashboard/tasks/page.tsx', desc: 'Automation task board — next-to-fire, approvals, activity feed.' },
    { key: 'health', label: 'Health', file: 'components/dashboard/HealthStrip.tsx', desc: 'System-health strip + endpoint monitor.' },
    { key: 'tokens', label: 'Tokens', file: 'app/api/dashboard/token-usage/route.ts', desc: 'Claude token-spend tracking by area.' },
  ] },
  { cat: 'Engine', items: [
    { key: 'scoring', label: 'Scoring', file: 'app/api/leads/score/route.ts', desc: 'AI lead scoring.' },
    { key: 'knowledge', label: 'Knowledge', file: 'app/api/knowledge-base/route.ts', desc: 'Knowledge base upload + embeddings search.' },
    { key: 'calendar', label: 'Calendar', file: 'app/api/calendar/availability/route.ts', desc: 'Calendar availability + booking.' },
  ] },
  { cat: 'Platform', items: [
    { key: 'toggle', label: 'Toggle', file: 'lib/useFeatureFlags.ts', desc: 'Runtime Settings→Features on/off switches (no redeploy).' },
    { key: 'multiuser', label: 'Multi-user', file: 'app/api/auth/redeem-invite/route.ts', desc: 'Team accounts + invite redemption + per-user auth.' },
    { key: 'followup', label: 'Follow-up', file: 'app/api/cron/follow-up-sequence/route.ts', flag: 'followUpSequence', desc: 'Automated re-engagement follow-up cron.' },
  ] },
];
const ALL = CATS.flatMap((c) => c.items.map((i) => ({ ...i, cat: c.cat })));

const CONFIG = {
  master: 'master/agent/src/configs/bcon.config.ts',
  bcon: 'brands/bcon/agent/src/configs/bcon.config.ts',
  windchasers: 'brands/windchasers/agent/src/configs/brand.config.ts',
  proxe: 'brands/proxe/agent/src/configs/proxe.config.ts',
};

function srcRoot(tree) { return tree === 'master' ? masterSrc : path.join(ROOT, 'brands', tree, 'agent', 'src'); }

function flags(tree) {
  const p = path.join(ROOT, CONFIG[tree]);
  if (!fs.existsSync(p)) return {};
  const s = fs.readFileSync(p, 'utf8');
  const block = (s.match(/features\s*:\s*\{([^}]*)\}/) || [])[1] || '';
  const read = (k) => { const m = block.match(new RegExp(k + '\\s*:\\s*(true|false)')); return m ? m[1] === 'true' : null; };
  return { voice: read('voice'), brain: read('brain'), pipelineFunnel: read('pipelineFunnel'), followUpSequence: read('followUpSequence') };
}

function brandConfig(tree) {
  const p = path.join(ROOT, CONFIG[tree]);
  const s = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  const g = (re) => { const m = s.match(re); return m ? m[1] : null; };
  return {
    name: g(/name:\s*'([^']+)'/),
    brand: g(/brand:\s*'([^']+)'/),
    primary: g(/primary:\s*'(#[0-9A-Fa-f]{3,8})'/),
    prompt: g(/path:\s*'(@\/[^']+prompt[^']*)'/) || g(/path:\s*'([^']+)'/),
    apiUrl: g(/apiUrl:\s*'([^']+)'/),
    avatar: g(/type:\s*'(logo|icon|image)'/),
    flags: flags(tree),
  };
}

function detail(tree, f, state) {
  const T = tree.charAt(0).toUpperCase() + tree.slice(1);
  let status;
  if (state === 'absent') status = 'Not present in this brand.';
  else if (state === 'off') status = `Code shipped but switched OFF (features.${f.flag} = false). Flip it in Settings → Features.`;
  else if (f.flag) status = `ON (features.${f.flag} = true).`;
  else status = 'Present & active.';
  return { desc: f.desc, status: `${T}: ${status}` };
}

function featureStates(tree) {
  const fl = flags(tree);
  const root = srcRoot(tree);
  return ALL.map((f) => {
    const present = fs.existsSync(path.join(root, f.file));
    let state;
    if (!present) state = 'absent';
    else if (f.flag && fl[f.flag] === false) state = 'off';
    else state = 'on';
    const d = detail(tree, f, state);
    return { key: f.key, label: f.label, cat: f.cat, state, desc: d.desc, status: d.status, flag: f.flag || null };
  });
}

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

const DATA = {
  generatedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
  cats: CATS.map((c) => ({ cat: c.cat, keys: c.items.map((i) => i.key) })),
  master: { tree: 'master', role: 'canonical', features: featureStates('master'), config: brandConfig('master') },
  brands: BRANDS.map((b) => ({ tree: b, role: 'brand', sync: sync(b), features: featureStates(b), config: brandConfig(b) })),
};

// ── HTML ──────────────────────────────────────────────────────────────────────
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
    font:13px/1.4 ui-sans-serif,system-ui,Segoe UI,Roboto,Arial; }
  #app { height:100vh; display:flex; flex-direction:column; }
  header { padding:11px 18px; border-bottom:1px solid var(--line); display:flex; align-items:baseline; gap:14px; flex-wrap:wrap; }
  header h1 { font-size:16px; margin:0; font-weight:700; }
  header .sub { color:var(--mut); font-size:12px; }
  .legend { margin-left:auto; display:flex; gap:13px; font-size:12px; color:var(--mut); flex-wrap:wrap; }
  .legend b { display:inline-block; width:10px; height:10px; border-radius:3px; margin-right:5px; vertical-align:middle; }
  #flow { flex:1; min-height:0; }
  .node { width:262px; border-radius:14px; background:var(--panel); border:1.5px solid var(--line);
    box-shadow:0 8px 30px rgba(0,0,0,.35); overflow:hidden; }
  .node.canonical { border-color:var(--accent); }
  .node .hd { padding:10px 12px 8px; display:flex; align-items:center; justify-content:space-between; gap:8px; border-bottom:1px solid var(--line); }
  .node .name { font-weight:700; font-size:15px; text-transform:capitalize; }
  .node .role { font-size:10px; text-transform:uppercase; letter-spacing:.06em; color:var(--mut); }
  .node .pct { font-size:18px; font-weight:800; }
  .bar { height:5px; background:#0b0e14; border-radius:99px; overflow:hidden; margin:8px 12px 0; }
  .bar > span { display:block; height:100%; }
  .body { padding:8px 12px 10px; }
  .catrow { margin-top:7px; }
  .catlabel { font-size:9.5px; text-transform:uppercase; letter-spacing:.07em; color:var(--mut); margin-bottom:3px; }
  .pills { display:flex; flex-wrap:wrap; gap:4px; }
  .pill { font-size:10.5px; padding:2.5px 7px; border-radius:99px; font-weight:600; border:1px solid transparent; cursor:default; }
  .pill.on { background:rgba(34,197,94,.15); color:var(--green); border-color:rgba(34,197,94,.35); }
  .pill.off { background:rgba(100,116,139,.15); color:var(--slate); border-color:rgba(100,116,139,.4); }
  .pill.absent { background:rgba(239,68,68,.13); color:var(--red); border-color:rgba(239,68,68,.3); }
  .cfg { display:flex; align-items:center; gap:7px; margin-top:10px; padding-top:9px; border-top:1px dashed var(--line);
    font-size:11px; color:var(--mut); cursor:help; }
  .cfg .sw { width:13px; height:13px; border-radius:4px; border:1px solid rgba(255,255,255,.15); flex:none; }
  .meta { color:var(--mut); font-size:10.5px; margin-top:7px; }
  #tip { position:fixed; z-index:50; max-width:300px; background:#0f1420; border:1px solid var(--accent);
    border-radius:10px; padding:9px 11px; box-shadow:0 12px 36px rgba(0,0,0,.55); pointer-events:none;
    font-size:12px; display:none; }
  #tip .t { font-weight:700; }
  #tip .cat { font-size:9.5px; text-transform:uppercase; letter-spacing:.06em; color:var(--accent); margin-left:6px; }
  #tip .d { color:var(--mut); margin:5px 0; }
  #tip .s { color:var(--txt); }
  #tip .kv { color:var(--mut); margin-top:3px; }
  #tip .kv b { color:var(--txt); font-weight:600; }
</style>
</head>
<body>
<div id="app">
  <header>
    <h1>PROXe — Brand Diff Flow</h1>
    <span class="sub">master = canonical · brands should differ only by config · hover a pill or the ⓘ config chip · ${DATA.generatedAt}</span>
    <div class="legend">
      <span><b style="background:var(--green)"></b>on</span>
      <span><b style="background:var(--slate)"></b>present, off</span>
      <span><b style="background:var(--red)"></b>absent</span>
      <span><b style="background:var(--amber)"></b>drift</span>
    </div>
  </header>
  <div id="flow"></div>
  <div id="tip"></div>
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
const CATS = DATA.cats;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const tipEl = document.getElementById('tip');

function showTip(e, htmlStr) {
  tipEl.innerHTML = htmlStr;
  tipEl.style.display = 'block';
  const pad = 14, w = tipEl.offsetWidth, h = tipEl.offsetHeight;
  let x = e.clientX + pad, y = e.clientY + pad;
  if (x + w > window.innerWidth) x = e.clientX - w - pad;
  if (y + h > window.innerHeight) y = e.clientY - h - pad;
  tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
}
const hideTip = () => { tipEl.style.display = 'none'; };

const healthColor = (pct) => pct >= 95 ? 'var(--green)' : pct >= 70 ? 'var(--amber)' : 'var(--red)';

function pillTip(f) {
  return '<div><span class="t">' + esc(f.label) + '</span><span class="cat">' + esc(f.cat) + '</span></div>' +
    '<div class="d">' + esc(f.desc) + '</div>' +
    '<div class="s">' + esc(f.status) + '</div>';
}
function configTip(tree, cfg) {
  const fl = cfg.flags || {};
  const flagLine = ['voice','brain','pipelineFunnel','followUpSequence']
    .map(k => k + '=' + (fl[k] === null || fl[k] === undefined ? '–' : fl[k])).join('  ');
  const T = tree.charAt(0).toUpperCase() + tree.slice(1);
  let rows = '<div><span class="t">' + esc(T) + ' config</span></div>';
  if (tree === 'master') {
    rows += '<div class="d">Canonical template — carries every brand\\'s config (bcon · windchasers · proxe); not a live customer site.</div>';
    return rows;
  }
  rows += '<div class="kv"><b>name</b> ' + esc(cfg.name) + '  ·  <b>brand</b> ' + esc(cfg.brand) + '</div>';
  if (cfg.primary) rows += '<div class="kv"><b>theme</b> <span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:' + esc(cfg.primary) + ';vertical-align:middle"></span> ' + esc(cfg.primary) + '</div>';
  if (cfg.prompt) rows += '<div class="kv"><b>prompt</b> ' + esc(cfg.prompt) + '</div>';
  if (cfg.apiUrl) rows += '<div class="kv"><b>api</b> ' + esc(cfg.apiUrl) + '</div>';
  if (cfg.avatar) rows += '<div class="kv"><b>avatar</b> ' + esc(cfg.avatar) + '</div>';
  rows += '<div class="kv"><b>flags</b> ' + esc(flagLine) + '</div>';
  return rows;
}

function Pills({ features }) {
  return CATS.map(c => html\`<div class="catrow" key=\${c.cat}>
    <div class="catlabel">\${c.cat}</div>
    <div class="pills">\${c.keys.map(k => {
      const f = features.find(x => x.key === k);
      return html\`<span key=\${k} class=\${'pill ' + f.state}
        onMouseEnter=\${(e) => showTip(e, pillTip(f))}
        onMouseMove=\${(e) => showTip(e, pillTip(f))}
        onMouseLeave=\${hideTip}>\${f.label}\</span>\`;
    })}</div>
  </div>\`);
}

function BrandNode({ data: d }) {
  const canonical = d.role === 'canonical';
  const pct = d.sync ? d.sync.pct : 100;
  const cfg = d.config || {};
  return html\`<div class=\${'node ' + (canonical ? 'canonical' : '')}>
    \${!canonical && html\`<\${Handle} type="target" position=\${Position.Top} style=\${{opacity:0}} />\`}
    \${canonical && html\`<\${Handle} type="source" position=\${Position.Bottom} style=\${{opacity:0}} />\`}
    <div class="hd">
      <div><div class="name">\${d.tree}</div><div class="role">\${d.role}</div></div>
      \${!canonical && html\`<div class="pct" style=\${{color:healthColor(pct)}}>\${pct}%</div>\`}
    </div>
    \${!canonical && html\`<div class="bar"><span style=\${{width:pct+'%',background:healthColor(pct)}}></span></div>\`}
    <div class="body">
      <\${Pills} features=\${d.features} />
      <div class="cfg"
        onMouseEnter=\${(e) => showTip(e, configTip(d.tree, cfg))}
        onMouseMove=\${(e) => showTip(e, configTip(d.tree, cfg))}
        onMouseLeave=\${hideTip}>
        <span class="sw" style=\${{background: canonical ? 'var(--accent)' : (cfg.primary || '#333')}}></span>
        <span>\${canonical ? 'canonical template' : (cfg.brand || d.tree)} · config ⓘ</span>
      </div>
      \${!canonical
        ? html\`<div class="meta">\${d.sync.identical} identical · \${d.sync.drift} drift · \${d.sync.missing} missing · of \${d.sync.total}</div>\`
        : html\`<div class="meta">source of truth · \${d.features.filter(f=>f.state!=='absent').length}/\${d.features.length} capabilities</div>\`}
    </div>
  </div>\`;
}

const nodeTypes = { brand: BrandNode };
const NX = { master:{x:420,y:20}, bcon:{x:40,y:380}, windchasers:{x:420,y:380}, proxe:{x:800,y:380} };
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
      fitView fitViewOptions=\${{padding:0.15}} minZoom=\${0.2} proOptions=\${{hideAttribution:true}}
      onMove=\${hideTip}>
    <\${Background} color="#1b2230" gap=\${22} />
    <\${Controls} showInteractive=\${false} />
  </\${ReactFlow}>\`;
}
createRoot(document.getElementById('flow')).render(html\`<\${App} />\`);
</script>
</body>
</html>`;

fs.writeFileSync(path.join(ROOT, 'scripts', 'brand-diff.html'), HTML);
console.log('Wrote scripts/brand-diff.html  (' + ALL.length + ' capabilities in ' + CATS.length + ' groups)');
for (const b of DATA.brands) {
  console.log(`${b.tree.padEnd(12)} sync ${b.sync.pct}%  on:${b.features.filter(f=>f.state==='on').length} off:${b.features.filter(f=>f.state==='off').length} absent:${b.features.filter(f=>f.state==='absent').length}`);
}

if (process.argv.includes('--serve')) {
  const PORT = Number((process.argv.find(a => a.startsWith('--port=')) || '').split('=')[1]) || 8777;
  const file = path.join(ROOT, 'scripts', 'brand-diff.html');
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(file));
  });
  server.on('error', (e) => {
    console.error(e.code === 'EADDRINUSE'
      ? `Port ${PORT} is busy — try: node scripts/brand-diff.js --serve --port=8778`
      : String(e));
    process.exit(1);
  });
  server.listen(PORT, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${PORT}/brand-diff.html`;
    console.log(`\nBrand Diff Flow → ${url}\n(Ctrl+C to stop)`);
    const open = process.platform === 'win32' ? `start "" "${url}"`
      : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(open, () => {});
  });
}
