#!/usr/bin/env node

/**
 * sync-status.js — the single read-only health check for the master↔brands model.
 *
 * Answers "is everything in the same place?" in one shot. Never writes anything.
 *
 *   node scripts/sync-status.js
 *
 * It classifies every shared-core file (scripts/brand-shared.json → sharedCore)
 * across master + each brand, and surfaces the four states that matter:
 *
 *   FORK        a shared file where two brands disagree with each other.
 *               The manifest is LYING — it claims the file is identical
 *               everywhere but it is not. Decide: promote one version to master
 *               (reverse-sync) OR eject the file from the manifest (it is now
 *               genuinely brand-divergent).
 *
 *   BRAND-AHEAD a shared file where master == one brand but another brand has a
 *               NEWER copy (master is stale). This is the reverse-flow signal:
 *               the brand improved shared code directly. Pull it brand→master
 *               with reverse-sync.js, then propagate master→brands.
 *
 *   ABSENT      a shared file missing entirely in a brand. Never propagated.
 *               Run propagate-from-master.js --apply to seed it.
 *
 *   MISSING     a manifest entry that does not exist in master at all. Stale
 *               manifest — remove the line, or add the file to master.
 *
 * Anything NOT in the manifest is brand-private by definition and is never
 * reported here — that is the whole point of the manifest (see ISOLATION below).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'brand-shared.json'), 'utf8'));
const brands = manifest.brands.filter(Boolean);

const treeOf = (b) => (b === 'master' ? 'master/agent/src' : `brands/${b}/agent/src`);
const read = (b, rel) => {
  const p = path.join(ROOT, treeOf(b), rel);
  return fs.existsSync(p) ? fs.readFileSync(p) : null;
};
const eq = (x, y) => x && y && x.equals(y);

const forks = [];       // bcon ≠ wc (real divergence between brands)
const brandAhead = [];  // master stale, a brand is newer
const absent = [];      // missing in a brand
const missing = [];     // missing in master (stale manifest)

for (const rel of manifest.sharedCore) {
  const m = read('master', rel);
  if (!m) { missing.push(rel); continue; }

  const copies = brands.map((b) => ({ b, buf: read(b, rel) }));
  const present = copies.filter((c) => c.buf);

  if (present.length < brands.length) {
    absent.push(`${rel}  [absent in: ${copies.filter((c) => !c.buf).map((c) => c.b).join(', ')}]`);
  }

  // do any two present brands disagree with each other?
  let brandsDisagree = false;
  for (let i = 0; i < present.length; i++) {
    for (let j = i + 1; j < present.length; j++) {
      if (!eq(present[i].buf, present[j].buf)) brandsDisagree = true;
    }
  }

  const aheadBrands = present.filter((c) => !eq(c.buf, m)).map((c) => c.b);

  if (brandsDisagree) {
    forks.push(`${rel}  [differs across brands: ${aheadBrands.join(', ') || 'see copies'}]`);
  } else if (aheadBrands.length) {
    // all present brands agree with each other but differ from master => brand-ahead
    brandAhead.push(`${rel}  [newer in: ${aheadBrands.join(', ')} → master is stale]`);
  }
}

const section = (title, rows, glyph) => {
  console.log(`\n${title}  (${rows.length})`);
  console.log(rows.length ? rows.map((r) => `  ${glyph} ${r}`).join('\n') : '  (none)');
};

console.log(`\nSYNC STATUS · master + ${brands.join(' + ')}`);
console.log(`manifest: ${manifest.sharedCore.length} shared-core files`);

section('⚠ FORK — brands disagree, manifest is lying', forks, '⚠');
section('↩ BRAND-AHEAD — master is stale, reverse-sync needed', brandAhead, '·');
section('… ABSENT — shared file never propagated to a brand', absent, '·');
section('? MISSING IN MASTER — stale manifest entry', missing, '?');

const clean = !forks.length && !brandAhead.length && !absent.length && !missing.length;
console.log(`\n${clean ? '✓ fully in sync' : 'Not in sync — see above. reverse-sync.js pulls brand→master; propagate-from-master.js pushes master→brands.'}\n`);
process.exit(clean ? 0 : 1);
