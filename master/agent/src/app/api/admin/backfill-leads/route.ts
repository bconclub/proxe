import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/admin/backfill-leads?secret=backfill-leads-2026
 *
 * Extracts email, name, city, company from whatsapp_sessions.user_inputs_summary
 * and unified_context.whatsapp.user_inputs_summary, then updates all_leads.
 *
 * Also copies customer_email from whatsapp_sessions → all_leads.email where missing.
 */
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')
  if (secret !== 'backfill-leads-2026') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Missing Supabase credentials' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  // Step 1: Get all whatsapp_sessions with user_inputs_summary
  const { data: sessions, error: sessionsError } = await supabase
    .from('whatsapp_sessions')
    .select('id, lead_id, customer_name, customer_email, customer_phone, user_inputs_summary')

  if (sessionsError) {
    return NextResponse.json({ error: 'Failed to fetch sessions', details: sessionsError.message }, { status: 500 })
  }

  // Step 2: Get all leads
  const { data: leads, error: leadsError } = await supabase
    .from('all_leads')
    .select('id, customer_name, email, phone, unified_context')

  if (leadsError) {
    return NextResponse.json({ error: 'Failed to fetch leads', details: leadsError.message }, { status: 500 })
  }

  const leadsMap = new Map((leads || []).map(l => [l.id, l]))

  const results = {
    sessionsProcessed: 0,
    leadsUpdated: 0,
    emailsExtracted: 0,
    namesExtracted: 0,
    emailsCopied: 0,
    errors: [] as string[],
    details: [] as any[],
  }

  for (const session of (sessions || [])) {
    results.sessionsProcessed++

    if (!session.lead_id) continue

    const lead = leadsMap.get(session.lead_id)
    if (!lead) continue

    // Collect data from all sources
    let extractedEmail: string | null = null
    let extractedName: string | null = null
    let extractedCity: string | null = null
    let extractedCompany: string | null = null

    // Source 1: whatsapp_sessions.user_inputs_summary (JSONB array)
    const userInputs: any[] = Array.isArray(session.user_inputs_summary)
      ? session.user_inputs_summary
      : []

    for (const input of userInputs) {
      if (!input || typeof input !== 'object') continue

      // Check for email in various keys
      const email = input.email || input.Email || input.EMAIL
        || input.email_address || input.emailAddress
      if (email && typeof email === 'string' && email.includes('@')) {
        extractedEmail = email.trim().toLowerCase()
      }

      // Check for name
      const name = input.full_name || input.fullName || input.name
        || input.Name || input.FULL_NAME || input.customer_name
      if (name && typeof name === 'string' && name.length > 1) {
        extractedName = name.trim()
      }

      // Check for city
      const city = input.city || input.City || input.CITY
        || input.location || input.Location
      if (city && typeof city === 'string') {
        extractedCity = city.trim()
      }

      // Check for company/brand
      const company = input.company || input.Company || input.COMPANY
        || input.business_name || input.brand || input.Brand
        || input.company_name || input.companyName
      if (company && typeof company === 'string') {
        extractedCompany = company.trim()
      }
    }

    // Source 2: whatsapp_sessions.customer_email (direct column)
    if (!extractedEmail && session.customer_email) {
      extractedEmail = session.customer_email.trim().toLowerCase()
    }

    // Source 3: unified_context.whatsapp.user_inputs_summary (on the lead)
    const ucInputs = lead.unified_context?.whatsapp?.user_inputs_summary
    if (Array.isArray(ucInputs)) {
      for (const input of ucInputs) {
        if (!input || typeof input !== 'object') continue

        if (!extractedEmail) {
          const email = input.email || input.Email || input.EMAIL
            || input.email_address || input.emailAddress
          if (email && typeof email === 'string' && email.includes('@')) {
            extractedEmail = email.trim().toLowerCase()
          }
        }

        if (!extractedName) {
          const name = input.full_name || input.fullName || input.name
            || input.Name || input.FULL_NAME || input.customer_name
          if (name && typeof name === 'string' && name.length > 1) {
            extractedName = name.trim()
          }
        }

        if (!extractedCity) {
          const city = input.city || input.City || input.CITY
            || input.location || input.Location
          if (city && typeof city === 'string') {
            extractedCity = city.trim()
          }
        }

        if (!extractedCompany) {
          const company = input.company || input.Company || input.COMPANY
            || input.business_name || input.brand || input.Brand
            || input.company_name || input.companyName
          if (company && typeof company === 'string') {
            extractedCompany = company.trim()
          }
        }
      }
    }

    // Source 4: Parse from first conversation message (Facebook form data as text)
    // The first user message often contains structured data like:
    // "full_name: John Doe\nemail: john@example.com\ncity: Bangalore"
    if (!extractedEmail || !extractedName) {
      const ucUser = lead.unified_context?.whatsapp?.user_inputs
      if (Array.isArray(ucUser)) {
        for (const input of ucUser) {
          if (!input || typeof input !== 'object') continue
          if (!extractedEmail) {
            const email = input.email || input.Email
            if (email && typeof email === 'string' && email.includes('@')) {
              extractedEmail = email.trim().toLowerCase()
            }
          }
          if (!extractedName) {
            const name = input.full_name || input.fullName || input.name || input.Name
            if (name && typeof name === 'string' && name.length > 1) {
              extractedName = name.trim()
            }
          }
        }
      }
    }

    // Now update all_leads if we found data that's currently missing
    const leadUpdates: Record<string, any> = {}

    if (extractedEmail && !lead.email) {
      leadUpdates.email = extractedEmail
      results.emailsExtracted++
    }

    if (extractedName && !lead.customer_name) {
      leadUpdates.customer_name = extractedName
      results.namesExtracted++
    }

    // Also copy customer_email from session → lead if session has it
    if (!lead.email && session.customer_email && !extractedEmail) {
      leadUpdates.email = session.customer_email.trim().toLowerCase()
      results.emailsCopied++
    }

    // Update unified_context with city/company if found
    if (extractedCity || extractedCompany) {
      const existingCtx = lead.unified_context || {}
      const existingProfile = existingCtx.whatsapp?.profile || {}
      leadUpdates.unified_context = {
        ...existingCtx,
        whatsapp: {
          ...existingCtx.whatsapp,
          profile: {
            ...existingProfile,
            ...(extractedCity ? { city: extractedCity } : {}),
            ...(extractedCompany ? { company: extractedCompany } : {}),
          },
        },
      }
    }

    if (Object.keys(leadUpdates).length > 0) {
      const { error: updateError } = await supabase
        .from('all_leads')
        .update(leadUpdates)
        .eq('id', lead.id)

      if (updateError) {
        results.errors.push(`Lead ${lead.id}: ${updateError.message}`)
      } else {
        results.leadsUpdated++
        results.details.push({
          leadId: lead.id,
          currentName: lead.customer_name,
          currentEmail: lead.email,
          extracted: {
            email: extractedEmail,
            name: extractedName,
            city: extractedCity,
            company: extractedCompany,
          },
          updated: leadUpdates,
        })
      }
    }
  }

  return NextResponse.json({
    success: true,
    ...results,
  })
}
