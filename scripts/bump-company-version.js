#!/usr/bin/env node

/**
 * Company-wide version bumper.
 *
 * Bumps the root `package.json` ("proxe-platform") version by one patch
 * (carry at 100) on EVERY commit, regardless of brand. This is the
 * company-wide deploy number that climbs for any change anywhere in the repo —
 * it sits alongside the per-brand versions (each brand also bumps its own when
 * touched, via scripts/<brand>/.../bump-version.js).
 *
 * Run by scripts/git-hooks/pre-commit. Writes:
 *   - package.json        ("version")
 *   - .build-info         (version + timestamp) at repo root
 */

const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const pkgPath = path.join(root, 'package.json')

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
let [major, minor, patch] = (pkg.version || '0.0.0').split('.').map((n) => parseInt(n, 10) || 0)

patch += 1
if (patch >= 100) { patch = 0; minor += 1 }
if (minor >= 100) { minor = 0; major += 1 }

const version = `${major}.${minor}.${patch}`
const timestamp = new Date().toISOString()

pkg.version = version
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

fs.writeFileSync(
  path.join(root, '.build-info'),
  JSON.stringify({ version, timestamp, scope: 'company' }, null, 2) + '\n',
)

console.log(`🏢 Company version bumped to ${version}`)
