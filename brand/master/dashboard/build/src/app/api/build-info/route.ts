import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json')
    const buildInfoPath = path.join(process.cwd(), '.build-info')

    // Read package.json version
    let version = '1.0.0'
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
      version = packageJson.version || '1.0.0'
    }

    // Read .build-info timestamp
    let buildTimestamp = new Date().toISOString()
    let buildDate = new Date().toLocaleString()
    
    if (fs.existsSync(buildInfoPath)) {
      try {
        const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, 'utf8'))
        buildTimestamp = buildInfo.timestamp || buildTimestamp
        buildDate = buildInfo.buildDate || buildDate
      } catch {
        // If .build-info is invalid, use current date
        buildTimestamp = new Date().toISOString()
        buildDate = new Date().toLocaleString()
      }
    }

    return NextResponse.json({
      version,
      buildTimestamp,
      buildDate,
    })
  } catch (error) {
    console.error('Error reading build info:', error)
    // Return defaults on error
    return NextResponse.json({
      version: '1.0.0',
      buildTimestamp: new Date().toISOString(),
      buildDate: new Date().toLocaleString(),
    })
  }
}
