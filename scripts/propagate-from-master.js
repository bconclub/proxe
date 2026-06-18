#!/usr/bin/env node

/**
 * Propagate shared-core changes from master/agent → every brand.
 *
 * THE MODEL: master/agent is the source of truth for shared core. You edit core
 * ONCE in master, run this, and the change lands in every brand. Brand-specific
 * files (configs, prompts, brand-facts, brand-divergent components/routes) are
 * NOT in the manifest, so they are never overwritten — each brand keeps its
 * identity (colour, copy, fields, prompts, templates).
 *
 *   node scripts/propagate-from-master.js            # dry-run: report only (default)
 *   node scripts/propagate-from-master.js --apply     # actually copy
 *   node scripts/propagate-from-master.js --apply bcon # one brand only
 *
 * The manifest (scripts/brand-shared.json) lists the shared-core files = the
 * files currently identical across master+bcon+wc. Move a file OUT of the
 * manifest the moment a brand must diverge it; move one IN once it is
 * brand-neutral. After --apply, commit per brand — the pre-commit hook bumps
 * each brand's version + the company version.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'brand-shared.json'), 'utf8'));

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const onlyBrand = args.find((a) => !a.startsWith('--'));
const brands = (onlyBrand ? [onlyBrand] : manifest.brands).filter(Boolean);

const masterSrc = path.join(ROOT, 'master', 'agent', 'src');

let totalChanged = 0;
const report = {};

for (const brand of brands) {
  const brandSrc = path.join(ROOT, 'brands', brand, 'agent', 'src');
  if (!fs.existsSync(brandSrc)) {
    console.error(`! brand src not found: ${brandSrc} — skipping`);
    continue;
  }
  const changed = [];
  const missingInMaster = [];

  for (const rel of manifest.sharedCore) {
    const from = path.join(masterSrc, rel);
    const to = path.join(brandSrc, rel);
    if (!fs.existsSync(from)) { missingInMaster.push(rel); continue; }
    const src = fs.readFileSync(from);
    const dst = fs.existsSync(to) ? fs.readFileSync(to) : null;
    if (dst !== null && src.equals(dst)) continue; // already in sync
    changed.push(rel);
    if (apply) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.writeFileSync(to, src);
    }
  }

  report[brand] = { changed, missingInMaster };
  totalChanged += changed.length;
}

// ── Report ───────────────────────────────────────────────────────────────────
console.log(`\n${apply ? 'APPLIED' : 'DRY-RUN'} · propagate master → ${brands.join(', ')}`);
console.log(`manifest: ${manifest.sharedCore.length} shared-core files\n`);

for (const brand of brands) {
  const r = report[brand];
  if (!r) continue;
  console.log(`── ${brand} ──`);
  if (r.changed.length === 0) {
    console.log('  in sync — nothing to propagate');
  } else {
    console.log(`  ${apply ? 'updated' : 'WOULD update'} ${r.changed.length} file(s):`);
    r.changed.forEach((f) => console.log(`    ${apply ? '✓' : '·'} ${f}`));
  }
  if (r.missingInMaster.length) {
    console.log(`  ! ${r.missingInMaster.length} manifest file(s) missing in master (stale manifest?):`);
    r.missingInMaster.forEach((f) => console.log(`    ? ${f}`));
  }
  console.log('');
}

if (!apply && totalChanged > 0) {
  console.log(`Dry-run only. Re-run with --apply to write these ${totalChanged} change(s).`);
}
if (apply && totalChanged > 0) {
  console.log(`Done. Build-gate + commit each brand (the hook bumps versions).`);
}
