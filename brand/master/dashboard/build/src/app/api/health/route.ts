import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

/**
 * Health check endpoint
 * Verifies that the build is complete and chunks are available
 */
export async function GET() {
  try {
    const buildDir = path.join(process.cwd(), '.next')
    const chunksDir = path.join(buildDir, 'static', 'chunks')
    const buildIdPath = path.join(buildDir, 'BUILD_ID')
    
    const checks = {
      buildDirectoryExists: fs.existsSync(buildDir),
      chunksDirectoryExists: fs.existsSync(chunksDir),
      buildIdExists: fs.existsSync(buildIdPath),
      buildId: null as string | null,
      chunkCount: 0,
      timestamp: new Date().toISOString(),
    }
    
    if (checks.buildIdExists) {
      try {
        checks.buildId = fs.readFileSync(buildIdPath, 'utf8').trim()
      } catch {
        // Ignore read errors
      }
    }
    
    if (checks.chunksDirectoryExists) {
      try {
        const chunks = fs.readdirSync(chunksDir)
        checks.chunkCount = chunks.filter(f => f.endsWith('.js')).length
      } catch {
        // Ignore read errors
      }
    }
    
    const isHealthy = 
      checks.buildDirectoryExists &&
      checks.chunksDirectoryExists &&
      checks.buildIdExists &&
      checks.chunkCount > 10 // Should have many chunks
    
    return NextResponse.json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      checks,
      message: isHealthy 
        ? 'Build is complete and chunks are available'
        : 'Build appears incomplete - chunks may be missing',
    }, {
      status: isHealthy ? 200 : 503,
    })
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }, {
      status: 500,
    })
  }
}
