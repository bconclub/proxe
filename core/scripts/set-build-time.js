#!/usr/bin/env node

/**
 * Prebuild script — derive ONE unified app version + stamp the build time.
 * Runs before every build via "prebuild" in package.json.
 *
 * Version model (single source of truth = the main engine, i.e. core/):
 *   MAJOR.MINOR  — curated in core/package.json. Bump when a real milestone
 *                  ships (e.g. the POP voice stack). This is the human signal
 *                  for "what we added".
 *   PATCH        — the repo's total git commit count, computed here at build
 *                  time. Climbs by itself with every commit merged, so the
 *                  version always moves as work lands — no manual patch bumps,
 *                  no ephemeral +1 that resets every build (the old bug: it was
 *                  stuck re-bumping 129 -> 130 forever because the change was
 *                  never committed back).
 *
 * The committed patch in package.json is IGNORED — it's always recomputed from
 * git — so an accidentally-committed bumped patch self-heals on the next build.
 * Every brand builds from the same repo, so they all read the same MAJOR.MINOR
 * and (per branch) the same count: one unified engine version, not per-brand.
 *
 * Writes:
 *   package.json version      (ephemeral, so the API routes that inline
 *                              pkg.version pick up the computed value)
 *   .env.local                NEXT_PUBLIC_APP_VERSION / NEXT_PUBLIC_BUILD_TIME
 *   .build-info               { version, timestamp, buildDate } for the API
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const pkgPath = path.join(process.cwd(), 'package.json')
const envLocal = path.join(process.cwd(), '.env.local')
const buildInfoPath = path.join(process.cwd(), '.build-info')

// ── 1. Resolve version = MAJOR.MINOR (curated) + PATCH (git commit count) ────

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
const [major = 0, minor = 1] = (pkg.version || '0.1.0').split('.').map(Number)

function gitCommitCount() {
  try {
    // Vercel clones shallow; deepen so the count is the real total, not 1.
    try { execSync('git fetch --unshallow', { stdio: 'ignore' }) }
    catch { try { execSync('git fetch --deepen=100000', { stdio: 'ignore' }) } catch { /* already complete */ } }
    const n = parseInt(execSync('git rev-list --count HEAD', { encoding: 'utf8' }).trim(), 10)
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

const count = gitCommitCount()
// Fallback (no git / unreadable): keep the committed patch so we never regress
// to .0 or crash — real builds always have git, so this is a rare safety net.
const patch = count != null ? count : (parseInt((pkg.version || '0.1.0').split('.')[2], 10) || 0)
const newVersion = `${major}.${minor}.${patch}`

pkg.version = newVersion
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
console.log(`📦 Version: ${newVersion}  (major.minor ${major}.${minor} from package.json, patch = ${count != null ? 'git commit count' : 'fallback'})`)

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
