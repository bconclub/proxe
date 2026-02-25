import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Health check endpoint
 * Minimal health check to reduce serverless function size
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: Date.now(),
  }, {
    status: 200,
  })
}
