import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

export async function GET() {
  // Try reading from generated version file first, then .build-info, then env vars
  let version = '0.0.0'
  let buildTimestamp = new Date().toISOString()

  try {
    // Try .build-info file (written by prebuild script)
    const buildInfoPath = path.join(process.cwd(), '.build-info')
    if (fs.existsSync(buildInfoPath)) {
      const info = JSON.parse(fs.readFileSync(buildInfoPath, 'utf8'))
      version = info.version || version
      buildTimestamp = info.timestamp || buildTimestamp
    }
  } catch {
    // Fallback to env vars
    version = process.env.NEXT_PUBLIC_APP_VERSION || version
    buildTimestamp = process.env.NEXT_PUBLIC_BUILD_TIME || buildTimestamp
  }

  const buildDate = new Date(buildTimestamp).toLocaleString('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })

  return NextResponse.json({ version, buildTimestamp, buildDate })
}
