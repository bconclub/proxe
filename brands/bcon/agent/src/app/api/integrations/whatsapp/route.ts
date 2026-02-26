import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

// Service role client for webhooks (bypasses RLS)
const getServiceClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_BCON_SUPABASE_URL!
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

// Helper function to update unified_context in all_leads
async function updateWhatsAppContext(
  supabase: ReturnType<typeof getServiceClient>,
  leadId: string,
  contextData: {
    conversation_summary?: string
    conversation_context?: any
    user_inputs_summary?: any
    message_count?: number
    last_interaction?: string
    booking_status?: string
    booking_date?: string
    booking_time?: string
  }
) {
  if (!leadId) {
    console.error('updateWhatsAppContext: No leadId provided')
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
    const existingWhatsApp = existingContext.whatsapp || {}

    // Use provided last_interaction timestamp or current time
    const lastInteractionTimestamp = contextData.last_interaction || new Date().toISOString()

    // Merge new WhatsApp data
    const updatedContext = {
      ...existingContext,
      whatsapp: {
        ...existingWhatsApp,
        conversation_summary:
          contextData.conversation_summary !== undefined
            ? contextData.conversation_summary
            : existingWhatsApp.conversation_summary || null,
        conversation_context:
          contextData.conversation_context !== undefined
            ? contextData.conversation_context
            : existingWhatsApp.conversation_context || null,
        user_inputs_summary:
          contextData.user_inputs_summary !== undefined
            ? contextData.user_inputs_summary
            : existingWhatsApp.user_inputs_summary || null,
        message_count:
          contextData.message_count !== undefined
            ? contextData.message_count
            : existingWhatsApp.message_count || 0,
        last_interaction: lastInteractionTimestamp,
        booking_status:
          contextData.booking_status !== undefined
            ? contextData.booking_status
            : existingWhatsApp.booking_status || null,
        booking_date:
          contextData.booking_date !== undefined
            ? contextData.booking_date
            : existingWhatsApp.booking_date || null,
        booking_time:
          contextData.booking_time !== undefined
            ? contextData.booking_time
            : existingWhatsApp.booking_time || null,
      },
    }

    // Update all_leads
    const { data: updatedLead, error: updateError } = await supabase
      .from('all_leads')
      .update({
        unified_context: updatedContext,
        last_touchpoint: 'whatsapp',
        last_interaction_at: lastInteractionTimestamp,
      })
      .eq('id', leadId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating unified_context:', updateError)
      return null
    }

    console.log('✅ Updated unified_context.whatsapp for lead:', leadId, {
      has_summary: !!contextData.conversation_summary,
      has_context: !!contextData.conversation_context,
      message_count: contextData.message_count,
    })
    return updatedLead
  } catch (err) {
    console.error('updateWhatsAppContext error:', err)
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verify webhook signature if needed
    const apiKey = request.headers.get('x-api-key')
    if (apiKey !== process.env.WHATSAPP_API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const supabase = getServiceClient()

    const {
      name,
      email,
      phone,
      booking_status,
      booking_date,
      booking_time,
      brand = 'proxe',
      external_session_id,
      whatsapp_id,
      conversation_summary,
      conversation_context,
      user_inputs_summary,
      message_count,
      last_message_at,
      last_interaction,
      conversation_status,
      overall_sentiment,
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
      whatsapp_id ||
      `whatsapp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

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
          first_touchpoint: 'whatsapp',
          last_touchpoint: 'whatsapp',
          last_interaction_at: new Date().toISOString(),
          brand: brand,
          unified_context: {
            whatsapp: {
              conversation_summary: conversation_summary || null,
              conversation_context: conversation_context || null,
              user_inputs_summary: user_inputs_summary || null,
              message_count: message_count || 0,
              last_interaction: last_interaction || last_message_at || new Date().toISOString(),
              booking_status: booking_status || null,
              booking_date: booking_date || null,
              booking_time: booking_time || null,
            },
          },
        })
        .select('id')
        .single()

      if (insertError) throw insertError
      leadId = newLead.id
    } else {
      // EXISTING LEAD - Update last_touchpoint and unified_context
      leadId = existingLead.id

      // Update unified_context with WhatsApp data
      await updateWhatsAppContext(supabase, leadId, {
        conversation_summary,
        conversation_context,
        user_inputs_summary,
        message_count,
        last_interaction: last_interaction || last_message_at,
        booking_status,
        booking_date,
        booking_time,
      })

      // Also update last_touchpoint and last_interaction_at
      const { error: updateError } = await supabase
        .from('all_leads')
        .update({
          last_touchpoint: 'whatsapp',
          last_interaction_at: new Date().toISOString(),
        })
        .eq('id', leadId)

      if (updateError) throw updateError
    }

    // Create or update whatsapp_sessions record
    // First check if session exists
    const { data: existingSession } = await supabase
      .from('whatsapp_sessions')
      .select('id')
      .eq('external_session_id', externalSessionId)
      .maybeSingle()

    if (existingSession?.id) {
      // Update existing session
      const { error: updateSessionError } = await supabase
        .from('whatsapp_sessions')
        .update({
          conversation_summary: conversation_summary || null,
          user_inputs_summary: user_inputs_summary || null,
          message_count: message_count || 0,
          last_message_at: last_message_at || new Date().toISOString(),
          conversation_status: conversation_status || null,
          overall_sentiment: overall_sentiment || null,
          booking_status: booking_status || null,
          booking_date: booking_date || null,
          booking_time: booking_time || null,
          channel_data: metadata || {},
        })
        .eq('id', existingSession.id)

      if (updateSessionError) throw updateSessionError

      // Update unified_context again after session update to ensure sync
      await updateWhatsAppContext(supabase, leadId, {
        conversation_summary,
        conversation_context,
        user_inputs_summary,
        message_count,
        last_interaction: last_interaction || last_message_at,
        booking_status,
        booking_date,
        booking_time,
      })
    } else {
      // Create new session
      const { data: whatsappSession, error: whatsappSessionError } = await supabase
        .from('whatsapp_sessions')
        .insert({
          lead_id: leadId,
          brand: brand,
          customer_name: name,
          customer_email: email,
          customer_phone: phone,
          customer_phone_normalized: normalizedPhone,
          external_session_id: externalSessionId,
          conversation_summary: conversation_summary || null,
          user_inputs_summary: user_inputs_summary || null,
          message_count: message_count || 0,
          last_message_at: last_message_at || new Date().toISOString(),
          conversation_status: conversation_status || 'active',
          overall_sentiment: overall_sentiment || null,
          booking_status: booking_status || null,
          booking_date: booking_date || null,
          booking_time: booking_time || null,
          channel_data: metadata || {},
        })
        .select('id')
        .single()

      if (whatsappSessionError) throw whatsappSessionError

      // Update unified_context after creating new session to ensure sync
      await updateWhatsAppContext(supabase, leadId, {
        conversation_summary,
        conversation_context,
        user_inputs_summary,
        message_count,
        last_interaction: last_interaction || last_message_at,
        booking_status,
        booking_date,
        booking_time,
      })
    }

    // Insert message into conversations table
    const { error: messageError, data: messageData } = await supabase.from('conversations').insert({
      lead_id: leadId,
      channel: 'whatsapp',
      sender: body.sender || 'customer',
      content: body.message || body.content || 'WhatsApp message',
      message_type: body.message_type || 'text',
      metadata: {
        whatsapp_id: whatsapp_id,
        external_session_id: externalSessionId,
        ...(metadata || {}),
      },
    }).select()

    if (messageError) {
      console.error('❌ Error inserting message into conversations table:', messageError)
      console.error('   Lead ID:', leadId)
      console.error('   Error details:', JSON.stringify(messageError, null, 2))
      // Don't fail the whole request if message insert fails
    } else {
      console.log('✅ Message inserted successfully:', messageData?.[0]?.id)
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
    }

    return NextResponse.json({
      success: true,
      lead_id: leadId,
      message: 'WhatsApp lead processed successfully',
    })
  } catch (error) {
    console.error('Error processing WhatsApp webhook:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to process webhook',
      },
      { status: 500 }
    )
  }
}


