import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// Service role client for fetching context (bypasses RLS)
const getServiceClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_BCON_SUPABASE_URL!
  return createClient(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Fetches customer context from database
 */
async function fetchCustomerContext(phone: string, brand: string = 'proxe', supabase: any) {
  const normalizedPhone = phone.replace(/\D/g, '')
  
  // Fetch lead from all_leads
  const { data: lead, error: leadError } = await supabase
    .from('all_leads')
    .select('id, unified_context, booking_date, booking_time, first_touchpoint, last_touchpoint')
    .eq('customer_phone_normalized', normalizedPhone)
    .eq('brand', brand)
    .maybeSingle()

  if (leadError || !lead) {
    return null
  }

  const context: any = {
    leadId: lead.id,
    unifiedContext: lead.unified_context || {},
    bookingDate: lead.booking_date,
    bookingTime: lead.booking_time,
    firstTouchpoint: lead.first_touchpoint,
    lastTouchpoint: lead.last_touchpoint,
    webSummary: null,
    whatsappSummary: null,
    voiceSummary: null,
    socialSummary: null,
  }

  // Fetch web conversation summary
  const { data: webSession } = await supabase
    .from('web_sessions')
    .select('conversation_summary, last_message_at')
    .eq('lead_id', lead.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (webSession?.conversation_summary) {
    context.webSummary = {
      summary: webSession.conversation_summary,
      lastInteraction: webSession.last_message_at,
    }
  }

  // Check unified_context for web data
  if (context.unifiedContext?.web?.conversation_summary) {
    context.webSummary = {
      summary: context.unifiedContext.web.conversation_summary,
      lastInteraction: context.unifiedContext.web.last_interaction,
    }
  }

  // Fetch WhatsApp conversation summary
  const { data: whatsappSession } = await supabase
    .from('whatsapp_sessions')
    .select('conversation_summary, last_message_at')
    .eq('lead_id', lead.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (whatsappSession?.conversation_summary) {
    context.whatsappSummary = {
      summary: whatsappSession.conversation_summary,
      lastInteraction: whatsappSession.last_message_at,
    }
  }

  // Check unified_context for WhatsApp data
  if (context.unifiedContext?.whatsapp?.conversation_summary) {
    context.whatsappSummary = {
      summary: context.unifiedContext.whatsapp.conversation_summary,
      lastInteraction: context.unifiedContext.whatsapp.last_interaction,
    }
  }

  // Fetch voice conversation summary
  const { data: voiceSession } = await supabase
    .from('voice_sessions')
    .select('call_summary, updated_at')
    .eq('lead_id', lead.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (voiceSession?.call_summary) {
    context.voiceSummary = {
      summary: voiceSession.call_summary,
      lastInteraction: voiceSession.updated_at,
    }
  }

  // Check unified_context for voice data
  if (context.unifiedContext?.voice?.conversation_summary) {
    context.voiceSummary = {
      summary: context.unifiedContext.voice.conversation_summary,
      lastInteraction: context.unifiedContext.voice.last_interaction,
    }
  }

  // Fetch social conversation summary
  const { data: socialSession } = await supabase
    .from('social_sessions')
    .select('conversation_summary, last_engagement_at')
    .eq('lead_id', lead.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (socialSession?.conversation_summary) {
    context.socialSummary = {
      summary: socialSession.conversation_summary,
      lastInteraction: socialSession.last_engagement_at,
    }
  }

  // Check unified_context for social data
  if (context.unifiedContext?.social?.conversation_summary) {
    context.socialSummary = {
      summary: context.unifiedContext.social.conversation_summary,
      lastInteraction: context.unifiedContext.social.last_interaction,
    }
  }

  return context
}

/**
 * Extracts key topics from conversation summary
 */
function extractTopics(summary: string): string[] {
  if (!summary) return []
  
  const topics: string[] = []
  const lowerSummary = summary.toLowerCase()
  
  const keywords = [
    'pricing', 'price', 'cost', 'plan', 'package',
    'features', 'feature', 'functionality',
    'integration', 'integrate', 'api',
    'demo', 'demonstration', 'trial',
    'implementation', 'setup', 'onboarding',
    'support', 'help', 'assistance',
    'qualification', 'qualify', 'lead',
  ]
  
  keywords.forEach(keyword => {
    if (lowerSummary.includes(keyword)) {
      topics.push(keyword)
    }
  })
  
  return topics.slice(0, 3)
}

/**
 * Formats date for natural language
 */
function formatBookingDate(dateString: string | null, timeString: string | null): string | null {
  if (!dateString) return null
  
  try {
    const date = new Date(dateString)
    const options: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }
    const formattedDate = date.toLocaleDateString('en-US', options)
    
    if (timeString) {
      const [hours, minutes] = timeString.split(':')
      const hour12 = parseInt(hours) % 12 || 12
      const ampm = parseInt(hours) >= 12 ? 'PM' : 'AM'
      return `${formattedDate} at ${hour12}:${minutes} ${ampm}`
    }
    
    return formattedDate
  } catch {
    return dateString
  }
}

/**
 * Builds system prompt with context awareness
 */
function buildSystemPrompt(context: any, customerName: string = 'there'): string {
  let prompt = `You are a helpful AI sales assistant for PROXe, an AI-powered customer engagement platform.

CUSTOMER CONTEXT:
Customer Name: ${customerName || 'Customer'}`

  // Add web conversation history
  if (context.webSummary) {
    const topics = extractTopics(context.webSummary.summary)
    prompt += `\n\nWEB CONVERSATION HISTORY:
- Previous web chat summary: "${context.webSummary.summary}"
${topics.length > 0 ? `- Key topics discussed: ${topics.join(', ')}` : ''}
- Last web interaction: ${context.webSummary.lastInteraction || 'Previously'}`

    // Add instructions for acknowledging web history
    prompt += `\n\nIMPORTANT: If this is the customer's first WhatsApp message, acknowledge the previous web conversation naturally:
- "Good to continue our chat on WhatsApp!"
- "I see you were interested in ${topics[0] || 'our services'} from our website..."
- "Following up on our web conversation about ${topics[0] || 'PROXe'}..."`
  }

  // Add WhatsApp conversation history
  if (context.whatsappSummary) {
    prompt += `\n\nWHATSAPP CONVERSATION HISTORY:
- Previous WhatsApp conversation: "${context.whatsappSummary.summary}"
- Last WhatsApp interaction: ${context.whatsappSummary.lastInteraction || 'Previously'}

IMPORTANT: Continue the conversation naturally, referencing previous WhatsApp messages when relevant.`
  }

  // Add voice conversation history
  if (context.voiceSummary) {
    prompt += `\n\nVOICE CALL HISTORY:
- Previous call summary: "${context.voiceSummary.summary}"
- Last call: ${context.voiceSummary.lastInteraction || 'Previously'}

IMPORTANT: If relevant, reference the previous phone call conversation.`
  }

  // Add social conversation history
  if (context.socialSummary) {
    prompt += `\n\nSOCIAL MEDIA ENGAGEMENT:
- Previous engagement summary: "${context.socialSummary.summary}"
- Last engagement: ${context.socialSummary.lastInteraction || 'Previously'}`
  }

  // Add booking information
  if (context.bookingDate) {
    const formattedBooking = formatBookingDate(context.bookingDate, context.bookingTime)
    prompt += `\n\nUPCOMING BOOKING:
- Scheduled: ${formattedBooking}

IMPORTANT: If this is the customer's first WhatsApp message, acknowledge the upcoming booking:
- "I see we have a call scheduled for ${formattedBooking}..."
- "Looking forward to our demo on ${formattedBooking}!"
- "Just confirming our scheduled call for ${formattedBooking}..."`
  }

  // Add touchpoint information
  if (context.firstTouchpoint && context.firstTouchpoint !== 'whatsapp') {
    prompt += `\n\nCUSTOMER JOURNEY:
- First touchpoint: ${context.firstTouchpoint}
- This is a multi-channel customer who has engaged via ${context.firstTouchpoint} before.`
  }

  // Add unified summary if available
  if (context.unifiedContext?.unified_summary) {
    prompt += `\n\nUNIFIED CUSTOMER SUMMARY:
"${context.unifiedContext.unified_summary}"

Use this as overall context for understanding the customer's journey and interests.`
  }

  // Add instructions for first message
  prompt += `\n\nFIRST MESSAGE GUIDELINES:

1. If customer has web conversation history:
   - Acknowledge it naturally: "Good to continue our chat on WhatsApp!" or "I see you were interested in [topic]..."
   - Reference specific topics from the web conversation if relevant
   - Make it feel like a seamless continuation

2. If customer has an upcoming booking:
   - Mention it: "I see we have a call scheduled for [date] at [time]..."
   - "Looking forward to our demo on [date]!"
   - "Just confirming our scheduled call..."

3. If customer is returning (has history but no specific context):
   - "Welcome back! How can I help you today?"
   - "Good to hear from you again!"

4. If completely new (no history at all):
   - Standard greeting: "Hi! I'm here to help you learn about PROXe..."
   - Introduce PROXe and its capabilities

5. Always be natural, friendly, and helpful. Don't force references - only mention previous interactions if it feels natural and relevant.

6. Keep responses concise and conversational for WhatsApp format.`

  // Add standard PROXe information
  prompt += `\n\nPROXe INFORMATION:
PROXe is an AI-powered customer engagement platform that helps businesses:
- Automate customer conversations across web, WhatsApp, voice, and social channels
- Qualify leads and book appointments
- Provide 24/7 customer support
- Integrate with existing CRM and business tools

Be helpful, professional, and focus on understanding customer needs.`

  return prompt
}

/**
 * GET /api/integrations/whatsapp/system-prompt
 * Returns system prompt for WhatsApp conversation with context awareness
 */
export async function GET(request: NextRequest) {
  try {
    // Verify API key
    const apiKey = request.headers.get('x-api-key')
    if (apiKey !== process.env.WHATSAPP_API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const phone = searchParams.get('phone')
    const customerName = searchParams.get('name') || 'there'
    const brand = searchParams.get('brand') || 'proxe'

    if (!phone) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      )
    }

    const supabase = getServiceClient()
    const context = await fetchCustomerContext(phone, brand, supabase)
    
    const systemPrompt = buildSystemPrompt(context || {}, customerName)

    return NextResponse.json({
      success: true,
      systemPrompt,
      hasContext: !!context,
      context: context ? {
        hasWebHistory: !!context.webSummary,
        hasWhatsAppHistory: !!context.whatsappSummary,
        hasVoiceHistory: !!context.voiceSummary,
        hasSocialHistory: !!context.socialSummary,
        hasBooking: !!context.bookingDate,
        firstTouchpoint: context.firstTouchpoint,
      } : null,
    })
  } catch (error) {
    console.error('Error building system prompt:', error)
    return NextResponse.json(
      { 
        error: 'Failed to build system prompt',
        details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : 'Unknown error') : undefined
      },
      { status: 500 }
    )
  }
}

