import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import pkg from '../../../../package.json'

export const dynamic = 'force-dynamic'

export async function GET() {
  // Version: package.json is the source of truth — the prebuild script
  // auto-bumps the patch, so each Vercel build reflects the bumped value.
  // (Env-var approach was unreliable: NEXT_PUBLIC_APP_VERSION had to be
  // manually maintained on Vercel and got stuck at 0.0.17.)
  let version = (pkg as { version?: string }).version || '0.0.0'
  let buildTimestamp = new Date().toISOString()

  try {
    // Build timestamp: .build-info file (written by prebuild script). If it
    // exists, prefer it — the prebuild's exact timestamp is more accurate
    // than the request time. version is still package.json (the .build-info
    // version can be stale if rebuilt without prebuild running).
    const buildInfoPath = path.join(process.cwd(), '.build-info')
    if (fs.existsSync(buildInfoPath)) {
      const info = JSON.parse(fs.readFileSync(buildInfoPath, 'utf8'))
      buildTimestamp = info.timestamp || buildTimestamp
    }
  } catch {
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
