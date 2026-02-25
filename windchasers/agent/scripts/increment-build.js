#!/usr/bin/env node

/**
 * Script to auto-increment build version
 * - Reads package.json version
 * - Increments patch number (1.0.0 → 1.0.1)
 * - Writes back to package.json
 * - Creates .build-info file with timestamp
 */

const fs = require('fs')
const path = require('path')

// Get paths
const packageJsonPath = path.join(process.cwd(), 'package.json')
const buildInfoPath = path.join(process.cwd(), '.build-info')

// Read package.json
if (!fs.existsSync(packageJsonPath)) {
  console.error('❌ Error: package.json not found')
  process.exit(1)
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
const currentVersion = packageJson.version || '1.0.0'

// Parse version (semver format: major.minor.patch)
const versionParts = currentVersion.split('.')
if (versionParts.length !== 3) {
  console.error('❌ Error: Invalid version format. Expected semver (e.g., 1.0.0)')
  process.exit(1)
}

// Increment patch version
const major = parseInt(versionParts[0], 10)
const minor = parseInt(versionParts[1], 10)
const patch = parseInt(versionParts[2], 10) + 1

const newVersion = `${major}.${minor}.${patch}`

// Update package.json
packageJson.version = newVersion
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n')

// Create .build-info file with timestamp
const buildTimestamp = new Date().toISOString()
const buildInfo = {
  version: newVersion,
  timestamp: buildTimestamp,
  buildDate: new Date(buildTimestamp).toLocaleString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  }),
}

fs.writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2) + '\n')

console.log(`✅ Version incremented: ${currentVersion} → ${newVersion}`)
console.log(`📝 Updated package.json`)
console.log(`📝 Created .build-info with timestamp: ${buildTimestamp}`)
