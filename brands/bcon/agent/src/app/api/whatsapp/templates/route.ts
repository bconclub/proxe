/**
 * GET /api/whatsapp/templates — List all WhatsApp message templates from Meta
 * POST /api/whatsapp/templates — Send a test template message
 *
 * Uses env vars: META_WHATSAPP_ACCESS_TOKEN, META_WHATSAPP_PHONE_NUMBER_ID
 * The WABA ID is fetched automatically from the phone number ID.
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const GRAPH_API_VERSION = 'v21.0'
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

function getCredentials() {
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN
  const wabaId = process.env.META_WHATSAPP_WABA_ID
  if (!phoneNumberId || !accessToken) {
    return null
  }
  return { phoneNumberId, accessToken, wabaId }
}

/**
 * GET — List all templates from Meta Business Account
 */
export async function GET() {
  try {
    const creds = getCredentials()
    if (!creds) {
      return NextResponse.json(
        { error: 'Missing META_WHATSAPP_ACCESS_TOKEN or META_WHATSAPP_PHONE_NUMBER_ID' },
        { status: 500 }
      )
    }

    // Step 1: Get phone info
    const phoneRes = await fetch(
      `${GRAPH_API_BASE}/${creds.phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating`,
      { headers: { Authorization: `Bearer ${creds.accessToken}` } }
    )
    const phoneData = await phoneRes.json()

    // Step 2: Resolve WABA ID — env var > edge lookup > debug_token
    let wabaId: string | null = creds.wabaId || null
    const debugInfo: Record<string, any> = {}

    if (!wabaId) {
      // Try edge endpoint
      try {
        const wabaRes = await fetch(
          `${GRAPH_API_BASE}/${creds.phoneNumberId}?fields=whatsapp_business_account`,
          { headers: { Authorization: `Bearer ${creds.accessToken}` } }
        )
        const wabaData = await wabaRes.json()
        debugInfo.phoneFieldsResponse = wabaData
        if (wabaData.whatsapp_business_account?.id) {
          wabaId = wabaData.whatsapp_business_account.id
        }
      } catch (e) { /* continue */ }
    }

    if (!wabaId) {
      // Try debug_token to find WABA from token's granted scopes
      try {
        const debugRes = await fetch(
          `${GRAPH_API_BASE}/debug_token?input_token=${creds.accessToken}`,
          { headers: { Authorization: `Bearer ${creds.accessToken}` } }
        )
        const debugData = await debugRes.json()
        debugInfo.debugToken = debugData?.data ? {
          app_id: debugData.data.app_id,
          type: debugData.data.type,
          scopes: debugData.data.scopes,
          granular_scopes: debugData.data.granular_scopes,
        } : debugData
        // Look for WABA ID in granular scopes
        const wabaScope = debugData?.data?.granular_scopes?.find(
          (s: any) => s.scope === 'whatsapp_business_messaging' || s.scope === 'whatsapp_business_management'
        )
        if (wabaScope?.target_ids?.length > 0) {
          wabaId = wabaScope.target_ids[0]
          debugInfo.wabaIdSource = 'debug_token.granular_scopes'
        }
      } catch (e) { /* continue */ }
    }

    if (!wabaId) {
      return NextResponse.json({
        error: 'Could not determine WABA ID. Set META_WHATSAPP_WABA_ID env var on Vercel.',
        phoneInfo: phoneData,
        debugInfo,
        hint: 'Check debugInfo.debugToken.granular_scopes for WABA IDs, or find it at: Meta Business Suite > WhatsApp > Settings',
      }, { status: 400 })
    }

    // Step 3: List all templates
    const templatesRes = await fetch(
      `${GRAPH_API_BASE}/${wabaId}/message_templates?limit=100`,
      { headers: { Authorization: `Bearer ${creds.accessToken}` } }
    )

    if (!templatesRes.ok) {
      const errBody = await templatesRes.text()
      return NextResponse.json(
        { error: 'Failed to fetch templates', status: templatesRes.status, details: errBody },
        { status: 502 }
      )
    }

    const templatesData = await templatesRes.json()

    // Simplify output
    const templates = (templatesData.data || []).map((t: any) => ({
      name: t.name,
      status: t.status,
      category: t.category,
      language: t.language,
      components: t.components,
    }))

    return NextResponse.json({
      success: true,
      wabaId,
      phoneInfo: {
        id: phoneData.id,
        displayNumber: phoneData.display_phone_number,
        verifiedName: phoneData.verified_name,
        quality: phoneData.quality_rating,
      },
      totalTemplates: templates.length,
      templates,
    })
  } catch (error) {
    console.error('[whatsapp/templates] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * POST — Send a test template message
 *
 * Body: {
 *   to: "919353253817",           // Phone with country code
 *   templateName: "hello_world",  // Template name (must be approved)
 *   languageCode: "en_US",        // Language code
 *   bodyParams: ["John"]          // Optional body parameter values
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const creds = getCredentials()
    if (!creds) {
      return NextResponse.json(
        { error: 'Missing WhatsApp credentials' },
        { status: 500 }
      )
    }

    const body = await request.json()
    const {
      to,
      templateName = 'hello_world',
      languageCode = 'en_US',
      bodyParams = [],
    } = body

    if (!to) {
      return NextResponse.json({ error: 'Missing "to" phone number' }, { status: 400 })
    }

    // Normalize phone: strip non-digits
    const phone = to.replace(/[^0-9]/g, '')

    // Build components (only add body params if provided)
    const components: any[] = []
    if (bodyParams.length > 0) {
      components.push({
        type: 'body',
        parameters: bodyParams.map((p: string) => ({ type: 'text', text: p })),
      })
    }

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components.length > 0 ? { components } : {}),
      },
    }

    console.log('[whatsapp/templates] Sending test:', JSON.stringify(payload, null, 2))

    const res = await fetch(`${GRAPH_API_BASE}/${creds.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const resBody = await res.json()

    if (!res.ok) {
      return NextResponse.json({
        success: false,
        status: res.status,
        error: resBody,
        payload,
      }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      messageId: resBody.messages?.[0]?.id,
      to: phone,
      templateName,
      response: resBody,
    })
  } catch (error) {
    console.error('[whatsapp/templates] Send error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
