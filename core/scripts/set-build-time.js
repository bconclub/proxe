#!/usr/bin/env node

/**
 * Prebuild script — stamp the build time. Runs before every build via
 * "prebuild" in package.json.
 *
 * Version model (v0.1 scheme, 2026-07-10): the COMMITTED core/package.json
 * version is the single source of truth. A pre-commit hook bumps it one patch
 * on every commit that touches core/ (scripts/bump-version.js: 0.1.1 → 0.1.2
 * → … carry at 100 → 0.2.0). This script must NOT recompute the version —
 * the old git-commit-count patch fought the hook and Vercel's shallow clone
 * made the count wrong anyway (v0.1.10 from a depth-10 clone).
 *
 * Writes:
 *   .env.local                NEXT_PUBLIC_APP_VERSION / NEXT_PUBLIC_BUILD_TIME
 *   .build-info               { version, timestamp, buildDate } for the API
 */

const fs = require('fs')
const path = require('path')

const pkgPath = path.join(process.cwd(), 'package.json')
const envLocal = path.join(process.cwd(), '.env.local')
const buildInfoPath = path.join(process.cwd(), '.build-info')

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
const newVersion = pkg.version || '0.1.0'

console.log(`📦 Version: ${newVersion} (committed in package.json — hook-maintained)`)

// ── 2. Build timestamp ──────────────────────────────────────────────────────

const buildTime = new Date().toISOString()

// ── 3. Update .env.local ────────────────────────────────────────────────────

let envContent = ''
if (fs.existsSync(envLocal)) {
  envContent = fs.readFileSync(envLocal, 'utf8')
  envContent = envContent.replace(/NEXT_PUBLIC_BUILD_TIME=.*\n?/g, '')
  envContent = envContent.replace(/NEXT_PUBLIC_APP_VERSION=.*\n?/g, '')
  envContent = envContent.trimEnd() + '\n'
}
envContent += `NEXT_PUBLIC_APP_VERSION=${newVersion}\n`
envContent += `NEXT_PUBLIC_BUILD_TIME=${buildTime}\n`
fs.writeFileSync(envLocal, envContent)

// ── 4. Write .build-info for the API route ──────────────────────────────────

fs.writeFileSync(buildInfoPath, JSON.stringify({
  version: newVersion,
  timestamp: buildTime,
  buildDate: new Date().toLocaleString(),
}, null, 2) + '\n')

console.log(`🕐 Build time: ${buildTime}`)
console.log(`📝 Updated ${envLocal}`)
