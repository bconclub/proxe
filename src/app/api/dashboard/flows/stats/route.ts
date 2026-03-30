/**
 * GET /api/dashboard/flows/stats
 * 
 * Get template statistics and coverage
 */

import { NextRequest, NextResponse } from 'next/server'
import { getTemplateStats } from '@/lib/services/templateLibrary'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const brand = searchParams.get('brand') || 'default'

    const stats = await getTemplateStats(brand)

    return NextResponse.json({
      success: true,
      stats,
    })
  } catch (error) {
    console.error('[API] Failed to fetch stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    )
  }
}
