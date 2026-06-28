import { NextRequest, NextResponse } from 'next/server'
import { errorLogger } from '@/lib/errorLogger'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const component = searchParams.get('component') || undefined
    const limit = parseInt(searchParams.get('limit') || '10', 10)

    const logs = errorLogger.getLogs(component, limit)

    return NextResponse.json({
      logs,
      count: logs.length,
    })
  } catch (error) {
    console.error('Error fetching error logs:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch error logs',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
