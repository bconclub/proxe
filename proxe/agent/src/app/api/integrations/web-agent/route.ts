import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

// Service role client for webhooks (bypasses RLS)
const getServiceClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_WINDCHASERS_SUPABASE_URL!
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

// Helper function to update unified_context.web in all_leads (similar to updateWhatsAppContext)
async function updateWebContext(
  supabase: ReturnType<typeof getServiceClient>,
  leadId: string,
  contextData: {
    conversation_summary?: string
    user_inputs_summary?: any
    message_count?: number
    last_interaction?: string
    booking_status?: string
    booking_date?: string
    booking_time?: string
    customer_name?: string
    customer_email?: string
    customer_phone?: string
    windchasers_data?: {
      user_type?: string
      course_interest?: string
      timeline?: string
      city?: string
      training_type?: string
      class_12_science?: boolean
      plan_to_fly?: string
      budget_awareness?: string
      dgca_completed?: boolean
    }
  }
) {
  if (!leadId) {
    console.error('updateWebContext: No leadId provided')
    return null
  }

  try {
    // Get existing unified_context
    const { data: lead, error: fetchError } = await supabase
      .from('all_leads')
      .select('unified_context')
      .eq('id', leadId)
      .single()

    if (fetchError) {
      console.error('Error fetching lead:', fetchError)
      return null
    }

    const existingContext = lead?.unified_context || {}
    const existingWeb = existingContext.web || {}
    const existingWindchasers = existingContext.windchasers || {}

    // Use provided last_interaction timestamp or current time
    const lastInteractionTimestamp = contextData.last_interaction || new Date().toISOString()

    // Merge new web data
    const updatedWebContext = {
      ...existingWeb,
      conversation_summary:
        contextData.conversation_summary !== undefined
          ? contextData.conversation_summary
          : existingWeb.conversation_summary || null,
      user_inputs_summary:
        contextData.user_inputs_summary !== undefined
          ? contextData.user_inputs_summary
          : existingWeb.user_inputs_summary || null,
      message_count:
        contextData.message_count !== undefined
          ? contextData.message_count
          : existingWeb.message_count || 0,
      last_interaction: lastInteractionTimestamp,
      booking_status:
        contextData.booking_status !== undefined
          ? contextData.booking_status
          : existingWeb.booking_status || null,
      booking_date:
        contextData.booking_date !== undefined
          ? contextData.booking_date
          : existingWeb.booking_date || null,
      booking_time:
        contextData.booking_time !== undefined
          ? contextData.booking_time
          : existingWeb.booking_time || null,
      customer_name:
        contextData.customer_name !== undefined
          ? contextData.customer_name
          : existingWeb.customer_name || null,
      customer_email:
        contextData.customer_email !== undefined
          ? contextData.customer_email
          : existingWeb.customer_email || null,
      customer_phone:
        contextData.customer_phone !== undefined
          ? contextData.customer_phone
          : existingWeb.customer_phone || null,
    }

    // Merge Windchasers aviation-specific data
    const updatedWindchasersContext = contextData.windchasers_data
      ? {
          ...existingWindchasers,
          ...contextData.windchasers_data,
        }
      : existingWindchasers

    // Build updated unified_context
    const updatedContext = {
      ...existingContext,
      web: updatedWebContext,
      windchasers: updatedWindchasersContext,
    }

    // Update all_leads
    const { data: updatedLead, error: updateError } = await supabase
      .from('all_leads')
      .update({
        unified_context: updatedContext,
        last_touchpoint: 'web',
        last_interaction_at: lastInteractionTimestamp,
      })
      .eq('id', leadId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating unified_context:', updateError)
      return null
    }

    console.log('✅ Updated unified_context.web for lead:', leadId, {
      message_count: updatedWebContext.message_count,
      has_summary: !!updatedWebContext.conversation_summary,
      has_windchasers_data: Object.keys(updatedWindchasersContext).length > 0,
    })

    return updatedLead
  } catch (err) {
    console.error('updateWebContext error:', err)
    return null
  }
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
      // Profile data
      name,
      email,
      phone,
      // Session data
      brand = 'windchasers',
      external_session_id,
      chat_session_id,
      website_url,
      // Message data
      message,
      message_sender = 'customer', // 'customer' | 'agent' | 'system'
      message_type = 'text',
      // Booking data
      booking_status,
      booking_date,
      booking_time,
      // Conversation data
      conversation_summary,
      user_inputs_summary,
      message_count,
      last_message_at,
      // Windchasers aviation-specific data
      windchasers_data,
      // Metadata
      metadata,
      // Action type
      action = 'message', // 'open' | 'message' | 'profile' | 'button' | 'summary'
    } = body

    // Generate external_session_id if not provided
    const externalSessionId =
      external_session_id ||
      chat_session_id ||
      `web_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    let leadId: string | null = null
    let webSessionId: string | null = null

    // ============================================
    // HANDLE CHAT OPEN (action === 'open')
    // ============================================
    if (action === 'open') {
      // Create or find session without requiring name/phone
      const { data: existingSession, error: sessionCheckError } = await supabase
        .from('web_sessions')
        .select('id, lead_id')
        .eq('external_session_id', externalSessionId)
        .eq('brand', brand)
        .maybeSingle()

      if (sessionCheckError && sessionCheckError.code !== 'PGRST116') {
        throw sessionCheckError
      }

      if (existingSession) {
        // Session already exists
        leadId = existingSession.lead_id
        webSessionId = existingSession.id
      } else {
        // Create anonymous session (no lead_id yet)
        const { data: newSession, error: sessionError } = await supabase
          .from('web_sessions')
          .insert({
            brand: brand,
            external_session_id: externalSessionId,
            chat_session_id: chat_session_id || null,
            website_url: website_url || null,
            session_status: 'active',
            message_count: 0,
            channel_data: metadata || {},
          })
          .select('id')
          .single()

        if (sessionError) throw sessionError
        webSessionId = newSession.id

        // Update unified_context if we have any initial data
        if (metadata) {
          await updateWebContext(supabase, leadId || '', {
            windchasers_data: windchasers_data,
          })
        }
      }

      return NextResponse.json({
        success: true,
        session_id: webSessionId,
        external_session_id: externalSessionId,
        lead_id: leadId,
        message: 'Session opened',
      })
    }

    // ============================================
    // HANDLE PROFILE COLLECTION (action === 'profile' or when name/phone provided)
    // ============================================
    if (action === 'profile' || (name && phone)) {
      const normalizedPhone = normalizePhone(phone)

      // Check if lead already exists
      const { data: existingLead, error: checkError } = await supabase
        .from('all_leads')
        .select('id')
        .eq('customer_phone_normalized', normalizedPhone)
        .eq('brand', brand)
        .maybeSingle()

      if (checkError) throw checkError

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
            unified_context: {
              web: {
                customer_name: name,
                customer_email: email,
                customer_phone: phone,
                message_count: 0,
                last_interaction: new Date().toISOString(),
              },
              windchasers: windchasers_data || {},
            },
          })
          .select('id')
          .single()

        if (insertError) throw insertError
        leadId = newLead.id
      } else {
        // EXISTING LEAD - Update
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

      // Find or create web_sessions record
      const { data: existingSession, error: sessionCheckError } = await supabase
        .from('web_sessions')
        .select('id')
        .eq('external_session_id', externalSessionId)
        .eq('brand', brand)
        .maybeSingle()

      if (sessionCheckError && sessionCheckError.code !== 'PGRST116') {
        throw sessionCheckError
      }

      if (existingSession) {
        // Update existing session
        webSessionId = existingSession.id
        const { error: updateSessionError } = await supabase
          .from('web_sessions')
          .update({
            lead_id: leadId,
            customer_name: name,
            customer_email: email,
            customer_phone: phone,
            customer_phone_normalized: normalizedPhone,
            updated_at: new Date().toISOString(),
          })
          .eq('id', webSessionId)

        if (updateSessionError) throw updateSessionError
      } else {
        // Create new session
        const { data: newSession, error: sessionError } = await supabase
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
            session_status: 'active',
            message_count: message_count || 0,
            last_message_at: last_message_at || null,
            channel_data: metadata || {},
          })
          .select('id')
          .single()

        if (sessionError) throw sessionError
        webSessionId = newSession.id
      }

      // Update unified_context with profile and Windchasers data
      if (!leadId) {
        throw new Error('Lead ID is required but was not found')
      }
      await updateWebContext(supabase, leadId, {
        customer_name: name,
        customer_email: email,
        customer_phone: phone,
        windchasers_data: windchasers_data,
      })

      // Insert system message about profile collection
      await supabase.from('conversations').insert({
        lead_id: leadId,
        channel: 'web',
        sender: 'system',
        content: `Profile collected: ${name}${email ? ` (${email})` : ''}${phone ? ` - ${phone}` : ''}`,
        message_type: 'system',
        metadata: {
          action: 'profile_collected',
          external_session_id: externalSessionId,
        },
      })

      return NextResponse.json({
        success: true,
        lead_id: leadId,
        session_id: webSessionId,
        message: 'Profile collected successfully',
      })
    }

    // ============================================
    // HANDLE MESSAGE SEND (action === 'message')
    // ============================================
    if (action === 'message' && message) {
      // Find session by external_session_id
      const { data: session, error: sessionError } = await supabase
        .from('web_sessions')
        .select('id, lead_id, message_count')
        .eq('external_session_id', externalSessionId)
        .eq('brand', brand)
        .maybeSingle()

      if (sessionError && sessionError.code !== 'PGRST116') {
        throw sessionError
      }

      if (!session) {
        return NextResponse.json(
          { error: 'Session not found. Please open chat first.' },
          { status: 404 }
        )
      }

      webSessionId = session.id
      leadId = session.lead_id

      if (!leadId) {
        return NextResponse.json(
          { error: 'Lead not found. Please provide profile information first.' },
          { status: 404 }
        )
      }

      const now = new Date().toISOString()
      const newMessageCount = (session.message_count || 0) + 1

      // Update web_sessions: increment message_count and update last_message_at
      const { error: updateSessionError } = await supabase
        .from('web_sessions')
        .update({
          message_count: newMessageCount,
          last_message_at: now,
          updated_at: now,
        })
        .eq('id', webSessionId)

      if (updateSessionError) throw updateSessionError

      // Insert message into conversations table
      const { error: messageError } = await supabase.from('conversations').insert({
        lead_id: leadId,
        channel: 'web',
        sender: message_sender,
        content: message,
        message_type: message_type,
        metadata: {
          external_session_id: externalSessionId,
          ...(metadata || {}),
        },
      })

      if (messageError) {
        console.error('❌ Error inserting message into conversations table:', messageError)
        // Don't fail the whole request if message insert fails
      } else {
        console.log('✅ Message inserted successfully for lead:', leadId)
      }

      // Update unified_context.web with message data
      if (!leadId) {
        throw new Error('Lead ID is required but was not found')
      }
      await updateWebContext(supabase, leadId, {
        message_count: newMessageCount,
        last_interaction: now,
      })

      // Trigger AI scoring (fire and forget)
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001'
      fetch(`${appUrl}/api/webhooks/message-created`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ lead_id: leadId }),
      }).catch(err => {
        console.error('Error triggering scoring:', err)
      })

      return NextResponse.json({
        success: true,
        lead_id: leadId,
        session_id: webSessionId,
        message_count: newMessageCount,
        message: 'Message sent successfully',
      })
    }

    // ============================================
    // HANDLE BUTTON CLICK (action === 'button')
    // ============================================
    if (action === 'button') {
      // Find session
      const { data: session, error: sessionError } = await supabase
        .from('web_sessions')
        .select('id, lead_id, user_inputs_summary')
        .eq('external_session_id', externalSessionId)
        .eq('brand', brand)
        .maybeSingle()

      if (sessionError && sessionError.code !== 'PGRST116') {
        throw sessionError
      }

      if (!session) {
        return NextResponse.json(
          { error: 'Session not found' },
          { status: 404 }
        )
      }

      webSessionId = session.id
      leadId = session.lead_id

      // Update user_inputs_summary
      const existingInputs = session.user_inputs_summary || {}
      const updatedInputs = {
        ...existingInputs,
        ...user_inputs_summary,
        last_button_click: new Date().toISOString(),
      }

      const { error: updateSessionError } = await supabase
        .from('web_sessions')
        .update({
          user_inputs_summary: updatedInputs,
          updated_at: new Date().toISOString(),
        })
        .eq('id', webSessionId)

      if (updateSessionError) throw updateSessionError

      // Update unified_context
      if (leadId) {
        await updateWebContext(supabase, leadId, {
          user_inputs_summary: updatedInputs,
          windchasers_data: windchasers_data,
        })

        // Insert button click as system message
        await supabase.from('conversations').insert({
          lead_id: leadId,
          channel: 'web',
          sender: 'system',
          content: `Button clicked: ${JSON.stringify(user_inputs_summary)}`,
          message_type: 'button',
          metadata: {
            action: 'button_click',
            external_session_id: externalSessionId,
            ...(metadata || {}),
          },
        })
      }

      return NextResponse.json({
        success: true,
        session_id: webSessionId,
        lead_id: leadId,
        message: 'Button click recorded',
      })
    }

    // ============================================
    // HANDLE CONVERSATION SUMMARY (action === 'summary')
    // ============================================
    if (action === 'summary') {
      // Find session
      const { data: session, error: sessionError } = await supabase
        .from('web_sessions')
        .select('id, lead_id')
        .eq('external_session_id', externalSessionId)
        .eq('brand', brand)
        .maybeSingle()

      if (sessionError && sessionError.code !== 'PGRST116') {
        throw sessionError
      }

      if (!session) {
        return NextResponse.json(
          { error: 'Session not found' },
          { status: 404 }
        )
      }

      webSessionId = session.id
      leadId = session.lead_id

      if (!leadId) {
        return NextResponse.json(
          { error: 'Lead not found' },
          { status: 404 }
        )
      }

      // Update web_sessions with summary
      const { error: updateSessionError } = await supabase
        .from('web_sessions')
        .update({
          conversation_summary: conversation_summary,
          booking_status: booking_status || null,
          booking_date: booking_date || null,
          booking_time: booking_time || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', webSessionId)

      if (updateSessionError) throw updateSessionError

      // Update unified_context
      if (!leadId) {
        throw new Error('Lead ID is required but was not found')
      }
      await updateWebContext(supabase, leadId, {
        conversation_summary: conversation_summary,
        booking_status: booking_status,
        booking_date: booking_date,
        booking_time: booking_time,
      })

      return NextResponse.json({
        success: true,
        lead_id: leadId,
        session_id: webSessionId,
        message: 'Summary updated successfully',
      })
    }

    // Default: legacy behavior (for backward compatibility)
    // This handles the old API format where name and phone were required
    if (!name || !phone) {
      return NextResponse.json(
        { error: 'Missing required fields. Provide name and phone, or use action parameter.' },
        { status: 400 }
      )
    }

    // Legacy code path (kept for backward compatibility)
    const normalizedPhone = normalizePhone(phone)

    const { data: existingLead, error: checkError } = await supabase
      .from('all_leads')
      .select('id')
      .eq('customer_phone_normalized', normalizedPhone)
      .eq('brand', brand)
      .maybeSingle()

    if (checkError) throw checkError

    if (!existingLead?.id) {
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

    // Update unified_context
    if (!leadId) {
      throw new Error('Lead ID is required but was not found')
    }
    await updateWebContext(supabase, leadId, {
      customer_name: name,
      customer_email: email,
      customer_phone: phone,
      conversation_summary: conversation_summary,
      user_inputs_summary: user_inputs_summary,
      message_count: message_count,
      booking_status: booking_status,
      booking_date: booking_date,
      booking_time: booking_time,
      windchasers_data: windchasers_data,
    })

    // Insert system message
    await supabase.from('conversations').insert({
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
    })

    // Trigger AI scoring
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001'
    fetch(`${appUrl}/api/webhooks/message-created`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ lead_id: leadId }),
    }).catch(err => {
      console.error('Error triggering scoring:', err)
    })

    return NextResponse.json({
      success: true,
      lead_id: leadId,
      message: 'Lead created successfully',
    })
  } catch (error) {
    console.error('Error in web agent route:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
