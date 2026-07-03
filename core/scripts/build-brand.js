#!/usr/bin/env node
// Cross-platform per-brand build: `node scripts/build-brand.js <brand>`
const { execSync } = require('child_process');
const brand = process.argv[2];
if (!brand) { console.error('usage: build-brand.js <brand>'); process.exit(1); }
const env = { ...process.env, BRAND_ID: brand, NEXT_PUBLIC_BRAND: brand };
execSync('npm run build', { stdio: 'inherit', env });
