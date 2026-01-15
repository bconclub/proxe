#!/usr/bin/env node

/**
 * Script to set NEXT_PUBLIC_BUILD_TIME environment variable
 * Run this before building: node scripts/set-build-time.js
 * Or set it in your CI/CD pipeline
 */

const fs = require('fs')
const path = require('path')

// Get current timestamp
const buildTime = new Date().toISOString()

// Update .env.local or create it
const envPath = path.join(process.cwd(), '.env.local')
const envLocal = path.join(process.cwd(), '.env.local')
const envExample = path.join(process.cwd(), '.env.example')

let envContent = ''

// Read existing .env.local if it exists
if (fs.existsSync(envLocal)) {
  envContent = fs.readFileSync(envLocal, 'utf8')
  
  // Remove existing NEXT_PUBLIC_BUILD_TIME if present
  envContent = envContent.replace(/NEXT_PUBLIC_BUILD_TIME=.*\n/g, '')
} else if (fs.existsSync(envExample)) {
  // Use .env.example as base if .env.local doesn't exist
  envContent = fs.readFileSync(envExample, 'utf8')
}

// Add or update NEXT_PUBLIC_BUILD_TIME
if (!envContent.includes('NEXT_PUBLIC_BUILD_TIME')) {
  envContent += `\n# Build time - updated automatically during deployment\n`
  envContent += `NEXT_PUBLIC_BUILD_TIME=${buildTime}\n`
} else {
  envContent = envContent.replace(
    /NEXT_PUBLIC_BUILD_TIME=.*/,
    `NEXT_PUBLIC_BUILD_TIME=${buildTime}`
  )
}

// Write back to .env.local
fs.writeFileSync(envLocal, envContent)

console.log(`✅ Build time set to: ${buildTime}`)
console.log(`📝 Updated ${envLocal}`)



