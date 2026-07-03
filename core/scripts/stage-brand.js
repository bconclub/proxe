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

// 1. brand public assets → core/public
copyDir(path.join(brandDir, 'public'), path.join(core, 'public'));

// 2. local env (Vercel injects env itself, so this file only exists locally)
const brandEnv = path.join(brandDir, '.env.local');
if (fs.existsSync(brandEnv)) fs.copyFileSync(brandEnv, path.join(core, '.env.local'));

console.log(`[stage-brand] staged "${brand}" (public${fs.existsSync(brandEnv) ? ' + env' : ''})`);
