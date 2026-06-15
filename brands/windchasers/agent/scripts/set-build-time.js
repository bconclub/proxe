#!/usr/bin/env node

/**
 * Prebuild script — stamp build time + surface the COMMITTED version.
 * Runs before every build via "prebuild" in package.json.
 *
 * Sets two NEXT_PUBLIC_ env vars in .env.local:
 *   NEXT_PUBLIC_BUILD_TIME  — ISO timestamp of this build
 *   NEXT_PUBLIC_APP_VERSION — version from package.json (as committed)
 *
 * Also writes a .build-info JSON file for the build-info API route.
 *
 * NOTE: the version is NOT bumped here. Bumping happens at commit time via
 * scripts/bump-version.js (driven by the pre-commit hook), so the committed
 * number is the source of truth and actually persists/climbs per push. Bumping
 * here as well meant the build server always added +1 on top of an unchanged
 * committed version, so the deploy was stuck showing the same number forever.
 */

const fs = require('fs')
const path = require('path')

const pkgPath = path.join(process.cwd(), 'package.json')
const envLocal = path.join(process.cwd(), '.env.local')
const buildInfoPath = path.join(process.cwd(), '.build-info')

// ── 1. Read the committed version (no bump — see note above) ────────────────

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
const newVersion = pkg.version || '0.0.1'
console.log(`📦 Building version: ${newVersion}`)

// ── 2. Build timestamp ──────────────────────────────────────────────────────

const buildTime = new Date().toISOString()

// ── 3. Update .env.local ────────────────────────────────────────────────────

let envContent = ''
if (fs.existsSync(envLocal)) {
  envContent = fs.readFileSync(envLocal, 'utf8')
  // Remove old values
  envContent = envContent.replace(/NEXT_PUBLIC_BUILD_TIME=.*\n?/g, '')
  envContent = envContent.replace(/NEXT_PUBLIC_APP_VERSION=.*\n?/g, '')
  // Clean trailing whitespace
  envContent = envContent.trimEnd() + '\n'
}

envContent += `NEXT_PUBLIC_APP_VERSION=${newVersion}\n`
envContent += `NEXT_PUBLIC_BUILD_TIME=${buildTime}\n`

fs.writeFileSync(envLocal, envContent)

// ── 4. Write .build-info for API route ──────────────────────────────────────

fs.writeFileSync(buildInfoPath, JSON.stringify({
  version: newVersion,
  timestamp: buildTime,
  buildDate: new Date().toLocaleString(),
}, null, 2) + '\n')

console.log(`🕐 Build time: ${buildTime}`)
console.log(`📝 Updated ${envLocal}`)
