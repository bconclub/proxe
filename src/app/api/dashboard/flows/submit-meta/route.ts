/**
 * POST /api/dashboard/flows/submit-meta
 * 
 * Submit a new template to Meta for approval
 */

import { NextRequest, NextResponse } from 'next/server'
import { submitTemplateToMeta } from '@/lib/services/templateLibrary'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const {
      name,
      category,
      language,
      body,
      header,
      footer,
    } = body

    // Validate required fields
    if (!name || !category || !language || !body) {
      return NextResponse.json(
        { error: 'Missing required fields: name, category, language, body' },
        { status: 400 }
      )
    }

    // Get credentials from environment
    const businessAccountId = process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID
    const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN

    if (!businessAccountId || !accessToken) {
      return NextResponse.json(
        { error: 'Meta API credentials not configured' },
        { status: 500 }
      )
    }

    // Submit to Meta
    console.log(`[API] Submitting template ${name} to Meta...`)
    const result = await submitTemplateToMeta(businessAccountId, accessToken, {
      name,
      category,
      language,
      body,
      header,
      footer,
    })

    return NextResponse.json({
      success: true,
      metaTemplateId: result.id,
      status: result.status,
    })
  } catch (error) {
    console.error('[API] Failed to submit template:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to submit template' },
      { status: 500 }
    )
  }
}
