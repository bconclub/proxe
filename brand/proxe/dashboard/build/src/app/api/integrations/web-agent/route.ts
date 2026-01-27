import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

// Service role client for webhooks (bypasses RLS)
const getServiceClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_PROXE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!
  return createClient(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false
      }
    }
  )
}

const normalizePhone = (phone: string): string => {
  return phone.replace(/\D/g, '')
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient()
    // AUTHENTICATION DISABLED - No auth check needed

    // Fetch leads from unified_leads view
    const { data: leads, error } = await supabase
      .from('unified_leads')
      .select('*')
      .order('last_interaction_at', { ascending: false })
      .limit(100)

    if (error) throw error

    // Map to dashboard format
    const mappedLeads = leads?.map((lead) => ({
      id: lead.id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      source: lead.first_touchpoint || 'web',
      first_touchpoint: lead.first_touchpoint,
      last_touchpoint: lead.last_touchpoint,
      timestamp: lead.timestamp,
      last_interaction_at: lead.last_interaction_at,
      brand: lead.brand,
      metadata: lead.metadata,
    }))

    return NextResponse.json({ leads: mappedLeads || [] })
  } catch (error) {
    console.error('Error fetching web agent leads:', error)
    return NextResponse.json(
      { error: 'Failed to fetch leads' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getServiceClient()
    const body = await request.json()

    const {
      name,
      email,
      phone,
      booking_status,
      booking_date,
      booking_time,
      brand = 'proxe',
      external_session_id,
      chat_session_id,
      website_url,
      conversation_summary,
      user_inputs_summary,
      message_count,
      last_message_at,
      metadata,
    } = body

    if (!phone || !name) {
      return NextResponse.json(
        { error: 'Missing required fields: phone and name' },
        { status: 400 }
      )
    }

    const normalizedPhone = normalizePhone(phone)

    // Generate external_session_id if not provided
    const externalSessionId =
      external_session_id ||
      chat_session_id ||
      `web_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Check if lead already exists
    const { data: existingLead, error: checkError } = await supabase
      .from('all_leads')
      .select('id')
      .eq('customer_phone_normalized', normalizedPhone)
      .eq('brand', brand)
      .maybeSingle()

    if (checkError) throw checkError

    let leadId: string

    if (!existingLead?.id) {
      // NEW LEAD - Create in all_leads
      const { data: newLead, error: insertError } = await supabase
        .from('all_leads')
        .insert({
          customer_name: name,
          email: email,
          phone: phone,
          customer_phone_normalized: normalizedPhone,
          first_touchpoint: 'web',
          last_touchpoint: 'web',
          last_interaction_at: new Date().toISOString(),
          brand: brand,
        })
        .select('id')
        .single()

      if (insertError) throw insertError
      leadId = newLead.id
    } else {
      // EXISTING LEAD - Update last_touchpoint
      leadId = existingLead.id

      const { error: updateError } = await supabase
        .from('all_leads')
        .update({
          last_touchpoint: 'web',
          last_interaction_at: new Date().toISOString(),
        })
        .eq('id', leadId)

      if (updateError) throw updateError
    }

    // Create web_sessions record
    const { data: webSession, error: webSessionError } = await supabase
      .from('web_sessions')
      .insert({
        lead_id: leadId,
        brand: brand,
        customer_name: name,
        customer_email: email,
        customer_phone: phone,
        customer_phone_normalized: normalizedPhone,
        external_session_id: externalSessionId,
        chat_session_id: chat_session_id || null,
        website_url: website_url || null,
        booking_status: booking_status || null,
        booking_date: booking_date || null,
        booking_time: booking_time || null,
        conversation_summary: conversation_summary || null,
        user_inputs_summary: user_inputs_summary || null,
        message_count: message_count || 0,
        last_message_at: last_message_at || null,
        session_status: 'active',
        channel_data: metadata || {},
      })
      .select('id')
      .single()

    if (webSessionError) throw webSessionError

    // Insert message
    const { error: messageError, data: messageData } = await supabase.from('conversations').insert({
      lead_id: leadId,
      channel: 'web',
      sender: 'system',
      content: `Web inquiry from ${name}`,
      message_type: 'text',
      metadata: {
        booking_requested: !!booking_date,
        booking_date: booking_date,
        external_session_id: externalSessionId,
      },
    }).select()

    if (messageError) {
      console.error('❌ Error inserting message into conversations table:', messageError)
      console.error('   Lead ID:', leadId)
      console.error('   Error details:', JSON.stringify(messageError, null, 2))
      // Don't fail the whole request if message insert fails - log and continue
    } else {
      console.log('✅ Message inserted successfully:', messageData?.[0]?.id)
    }

    // Trigger AI scoring (fire and forget)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    fetch(`${appUrl}/api/webhooks/message-created`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ lead_id: leadId }),
    }).catch(err => {
      console.error('Error triggering scoring:', err)
      // Don't fail the request if scoring fails
    })

    return NextResponse.json({
      success: true,
      lead_id: leadId,
      message: 'Lead created successfully',
    })
  } catch (error) {
    console.error('Error creating web agent lead:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}


