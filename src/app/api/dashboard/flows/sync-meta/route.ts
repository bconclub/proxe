/**
 * POST /api/dashboard/flows/sync-meta
 * 
 * Sync templates with Meta API
 * Fetches all templates from Meta and updates database
 */

import { NextRequest, NextResponse } from 'next/server'
import { fetchMetaTemplates, syncTemplatesWithDatabase } from '@/lib/services/templateLibrary'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    // Get credentials from environment
    const businessAccountId = process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID
    const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN
    const brand = 'default'

    if (!businessAccountId || !accessToken) {
      return NextResponse.json(
        { error: 'Meta API credentials not configured' },
        { status: 500 }
      )
    }

    // Fetch templates from Meta
    console.log('[API] Fetching templates from Meta...')
    const metaTemplates = await fetchMetaTemplates(businessAccountId, accessToken)

    // Sync with database
    console.log(`[API] Syncing ${metaTemplates.length} templates with database...`)
    const syncResult = await syncTemplatesWithDatabase(metaTemplates, brand)

    return NextResponse.json({
      success: true,
      synced: syncResult,
      metaCount: metaTemplates.length,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[API] Failed to sync templates:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync templates' },
      { status: 500 }
    )
  }
}
