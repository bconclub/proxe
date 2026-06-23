#!/usr/bin/env node

/**
 * reverse-sync.js — pull shared-core improvements FROM a brand back INTO master.
 *
 * THE PROBLEM IT SOLVES: propagate-from-master.js only flows master → brands.
 * But work happens in brands too (e.g. Windchasers, the gold reference, gets new
 * shared features first). Those land in the brand and master never learns them,
 * so master drifts BEHIND and a later propagate would overwrite the brand with a
 * stale copy. This is the missing reverse leg of the loop:
 *
 *        edit in brand ──reverse-sync──► master ──propagate──► every brand
 *
 * SAFETY: only files listed in the manifest (scripts/brand-shared.json →
 * sharedCore) are eligible. A brand-private file (anything NOT in the manifest)
 * is NEVER pulled — that is the isolation guarantee (see below). And it refuses
 * to pull a file that DIFFERS BETWEEN BRANDS (a fork) without --force, because
 * promoting one brand's fork to master would clobber the other brand's version
 * on the next propagate.
 *
 *   node scripts/reverse-sync.js wc                 # dry-run: what wc would push up
 *   node scripts/reverse-sync.js wc --apply         # copy wc's ahead-files → master
 *   node scripts/reverse-sync.js wc --apply --only app/dashboard/pipeline/page.tsx
 *   node scripts/reverse-sync.js wc --force         # include forked files too (review!)
 *
 * AFTER --apply: review the diff in master (git diff master/agent), make sure no
 * brand-specific literal (phone, copy, BRAND_ID) rode along — if it did, either
 * parameterize it into config or EJECT the file from the manifest. Then run
 * propagate-from-master.js --apply to push the now-current master to every brand.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ISOLATION — "I edited something WC-specific that must NOT leave Windchasers":
 *
 *   A file's fate is decided by ONE thing: is it in the manifest's sharedCore?
 *     • IN  the manifest  → shared. Edits must round-trip via master and reach
 *                           every brand. Never hand-edit it in a single brand.
 *     • NOT in the manifest → brand-private. Lives in that brand only. Neither
 *                           propagate nor reverse-sync ever touches it.
 *
 *   So to make a change stay WC-only, the file must be OUT of the manifest:
 *     1. If it is already brand-private (a config, a brand prompt, a brand-only
 *        component) → just edit it. Done. Nothing else needed.
 *     2. If it is currently SHARED but you need a WC-only change → EJECT it
 *        first: remove its line from scripts/brand-shared.json sharedCore. Now
 *        it is WC's private copy forever; bcon keeps the old shared version.
 *        (Better long-term: keep the file shared and push the WC-specific bit
 *        into brand config / dashboard_settings so the code stays identical.)
 *
 *   sync-status.js will flag a shared file that was edited in only one brand as
 *   a FORK — that is the alarm that someone broke this rule. Resolve a fork by
 *   either reverse-syncing it up (it was meant to be shared) or ejecting it from
 *   the manifest (it was meant to be brand-only).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'brand-shared.json'), 'utf8'));

const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const force = argv.includes('--force');
const onlyIdx = argv.indexOf('--only');
const only = onlyIdx !== -1 ? argv[onlyIdx + 1] : null;
const ALIAS = { wc: 'windchasers' };
const brandArg = argv.find((a) => !a.startsWith('--') && a !== only);
const brand = ALIAS[brandArg] || brandArg;

if (!brand) {
  console.error('usage: node scripts/reverse-sync.js <brand> [--apply] [--force] [--only <relpath>]');
  process.exit(2);
}

const masterSrc = path.join(ROOT, 'master', 'agent', 'src');
const brandSrc = path.join(ROOT, 'brands', brand, 'agent', 'src');
if (!fs.existsSync(brandSrc)) {
  console.error(`! brand src not found: ${brandSrc}`);
  process.exit(2);
}

const otherBrands = manifest.brands.filter((b) => b && b !== brand);
const read = (abs) => (fs.existsSync(abs) ? fs.readFileSync(abs) : null);
const eq = (x, y) => x && y && x.equals(y);

// Brand artifacts: features built on the PROXe base for ONE brand (e.g. POP
// war-room). One-directional — they never reverse-sync up and never propagate
// across. Declared in the manifest (brandArtifacts); enforced here so an
// artifact can't leak into master even by accident or by an explicit --only.
const ARTIFACTS = manifest.brandArtifacts || {};
const artifactPrefixes = Object.values(ARTIFACTS).flat();
const isArtifact = (rel) => artifactPrefixes.some((p) => rel === p || rel.startsWith(p));

// Guard 1 — an artifact must never live in sharedCore. If one crept in, stop
// hard: promoting it would spread a brand-only feature to every brand.
const leaked = manifest.sharedCore.filter(isArtifact);
if (leaked.length) {
  console.error(`! brand artifact(s) found in sharedCore — eject them, they must stay brand-only:`);
  leaked.forEach((r) => console.error(`    ✗ ${r}`));
  process.exit(2);
}

// Guard 2 — refuse an explicit --only of a declared artifact.
if (only && isArtifact(only)) {
  console.error(`! ${only} is a declared brand artifact — it never reverse-syncs (stays brand-only).`);
  process.exit(2);
}

const toPull = [];   // brand differs from master, safe (no fork)
const forked = [];   // brand differs from master AND another brand also differs → fork
const skipped = [];  // requested --only but file is in sync or brand-absent

for (const rel of manifest.sharedCore) {
  if (only && rel !== only) continue;
  const m = read(path.join(masterSrc, rel));
  const b = read(path.join(brandSrc, rel));
  if (!b) { skipped.push(`${rel} (absent in ${brand})`); continue; }
  if (eq(m, b)) { if (only) skipped.push(`${rel} (already in sync)`); continue; }

  // A real conflict = another brand holds a version that differs from BOTH this
  // brand's version AND master. If the other brand merely equals (stale) master,
  // it is not a conflict — propagate will bring it forward after we pull b→master.
  const conflict = otherBrands.some((ob) => {
    const obBuf = read(path.join(ROOT, 'brands', ob, 'agent', 'src', rel));
    return obBuf && !eq(obBuf, b) && !eq(obBuf, m);
  });

  if (conflict && !force) forked.push(rel);
  else toPull.push(rel);
}

console.log(`\n${apply ? 'APPLIED' : 'DRY-RUN'} · reverse-sync ${brand} → master`);

if (forked.length) {
  console.log(`\n⚠ ${forked.length} FORKED file(s) skipped (another brand has a different version).`);
  console.log(`  Promoting these would clobber the other brand on the next propagate.`);
  console.log(`  Review each: reverse-sync with --force to promote, or eject from the manifest.`);
  forked.forEach((f) => console.log(`    ⚠ ${f}`));
}

if (toPull.length === 0) {
  console.log(`\n  nothing to pull — ${brand} adds no shared-core changes over master.`);
} else {
  console.log(`\n  ${apply ? 'pulled' : 'WOULD pull'} ${toPull.length} file(s) ${brand} → master:`);
  for (const rel of toPull) {
    console.log(`    ${apply ? '✓' : '·'} ${rel}`);
    if (apply) {
      const to = path.join(masterSrc, rel);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.writeFileSync(to, read(path.join(brandSrc, rel)));
    }
  }
}

if (skipped.length) skipped.forEach((s) => console.log(`    – ${s}`));

if (!apply && toPull.length) {
  console.log(`\nDry-run only. Re-run with --apply to write master. Then review master's git diff,`);
  console.log(`strip any brand-specific literal, and run propagate-from-master.js --apply.`);
}
if (apply && toPull.length) {
  console.log(`\nNEXT: review git diff in master/agent · then: node scripts/propagate-from-master.js --apply`);
}
