#!/usr/bin/env node

/**
 * Prebuild script — auto-bump patch version + set build time
 * Runs before every build via "prebuild" in package.json.
 *
 * Sets two NEXT_PUBLIC_ env vars in .env.local:
 *   NEXT_PUBLIC_BUILD_TIME  — ISO timestamp of this build
 *   NEXT_PUBLIC_APP_VERSION — auto-incremented patch version from package.json
 *
 * Also writes a .build-info JSON file for the build-info API route.
 */

const fs = require('fs')
const path = require('path')

const pkgPath = path.join(process.cwd(), 'package.json')
const envLocal = path.join(process.cwd(), '.env.local')
const buildInfoPath = path.join(process.cwd(), '.build-info')

// ── 1. Auto-bump patch version in package.json ──────────────────────────────

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
const [major, minor, patch] = (pkg.version || '0.0.1').split('.').map(Number)
const newVersion = `${major}.${minor}.${patch + 1}`
pkg.version = newVersion
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
console.log(`📦 Version bumped: ${major}.${minor}.${patch} → ${newVersion}`)

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
