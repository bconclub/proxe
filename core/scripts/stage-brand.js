#!/usr/bin/env node
/**
 * stage-brand.js — prebuild step. Stages the active brand's assets into /core so
 * ONE core builds any brand. Chosen by BRAND_ID (or NEXT_PUBLIC_BRAND).
 *   - copies /brands/<id>/public/* → /core/public   (always — per-brand assets)
 *   - copies /brands/<id>/.env.local → /core/.env.local  (LOCAL only; on Vercel
 *     the env comes from project settings, so .env.local won't exist there)
 */
const fs = require('fs');
const path = require('path');

const brand = process.env.BRAND_ID || process.env.NEXT_PUBLIC_BRAND || process.env.NEXT_PUBLIC_BRAND_ID;
if (!brand) {
  console.error('[stage-brand] BRAND_ID not set — cannot stage a brand.');
  process.exit(1);
}
const core = path.resolve(__dirname, '..');
const brandDir = path.resolve(core, '..', 'brands', brand);
if (!fs.existsSync(brandDir)) {
  console.error(`[stage-brand] brand pack not found: ${brandDir}`);
  process.exit(1);
}

function copyDir(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// 1. brand public assets → core/public (wipe first — a previous brand's assets
//    must never survive into this brand's staging)
const corePublic = path.join(core, 'public');
fs.rmSync(corePublic, { recursive: true, force: true });
fs.mkdirSync(corePublic, { recursive: true });
copyDir(path.join(brandDir, 'public'), corePublic);

// 2. local env (Vercel injects env itself, so this file only exists locally)
const brandEnv = path.join(brandDir, '.env.local');
if (fs.existsSync(brandEnv)) fs.copyFileSync(brandEnv, path.join(core, '.env.local'));

// 3. `.brand` junction/symlink → /brands/<id>. BOTH resolvers (tsconfig paths
//    AND the webpack alias) point at this fixed dir, so no config file ever
//    names a brand. tsconfig `paths` beats webpack aliases in Next's resolver —
//    a hardcoded brand there silently builds that brand for EVERY BRAND_ID.
const brandLink = path.join(core, '.brand');
let prevBrand = null;
try { prevBrand = path.basename(fs.realpathSync(brandLink)); } catch {}
try {
  const st = fs.lstatSync(brandLink);
  if (st.isSymbolicLink() || st.isDirectory()) fs.rmSync(brandLink, { recursive: true, force: true });
} catch {}
fs.symlinkSync(brandDir, brandLink, 'junction');

// 3b. repo-root node_modules junction → core/node_modules. Brand-pack files
//     (/brands/<id>/widget) live outside core; their bare imports ('react',
//     '@vapi-ai/web') resolve by upward walk, which must find ONE canonical
//     node_modules. (resolve.modules/react aliases were tried and load dual
//     react copies in junctioned setups — see next.config.js comment.)
const rootModules = path.resolve(core, '..', 'node_modules');
try {
  fs.lstatSync(rootModules);
} catch {
  try {
    fs.symlinkSync(path.join(core, 'node_modules'), rootModules, 'junction');
    console.log('[stage-brand] linked repo-root node_modules -> core/node_modules');
  } catch (e) {
    console.warn(`[stage-brand] could not link repo-root node_modules: ${e.message}`);
  }
}

// 4. brand switch → wipe .next. Compiled chunks inline NEXT_PUBLIC_* values and
//    @brand modules at build time; Next does NOT reliably invalidate them when
//    the env/alias change underneath it, so a stale cache serves the PREVIOUS
//    brand's Supabase project and config. (On Vercel each project builds one
//    brand, so prevBrand === brand and the cache survives as intended.)
if (prevBrand && prevBrand !== brand) {
  fs.rmSync(path.join(core, '.next'), { recursive: true, force: true });
  console.log(`[stage-brand] brand switch ${prevBrand} -> ${brand}: cleared .next`);
}

console.log(`[stage-brand] staged "${brand}" (public${fs.existsSync(brandEnv) ? ' + env' : ''} + .brand link)`);
