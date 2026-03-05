import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Helper function to format time ago
function formatTimeAgo(dateString: string): string {
  const now = new Date()
  const date = new Date(dateString)
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
  return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    // AUTHENTICATION DISABLED - No auth check needed
    // const {
    //   data: { user },
    // } = await supabase.auth.getUser()

    // if (!user) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // }

    // Use a placeholder user ID for logging (since auth is disabled)
    const user = { id: 'system' }

    const leadId = params.id
    const { searchParams } = new URL(request.url)
    const forceRefresh = searchParams.get('refresh') === 'true'
    console.log('Generating summary for lead:', leadId, { forceRefresh })

    // Fetch lead data
    const { data: lead, error: leadError } = await supabase
      .from('all_leads')
      .select('id, customer_name, email, phone, created_at, last_interaction_at, lead_stage, sub_stage, unified_context')
      .eq('id', leadId)
      .single()

    if (leadError) {
      console.error('Error fetching lead:', leadError)
      return NextResponse.json({ error: 'Failed to fetch lead', details: leadError.message }, { status: 500 })
    }

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    // Extract booking_date and booking_time from unified_context
    const bookingDate = lead.unified_context?.web?.booking_date || lead.unified_context?.web?.booking?.date || null
    const bookingTime = lead.unified_context?.web?.booking_time || lead.unified_context?.web?.booking?.time || null

    // ============================================
    // STEP 1: Check unified_context for existing summaries
    // ============================================
    const unifiedSummary = lead.unified_context?.unified_summary
    const webSummary = lead.unified_context?.web?.conversation_summary
    const whatsappSummary = lead.unified_context?.whatsapp?.conversation_summary

    // Priority 1: Use unified_summary if it exists (unless forced refresh)
    if (unifiedSummary && !forceRefresh) {
      console.log('Using unified_summary from unified_context for lead:', leadId)

      // Still need to fetch activities and stage history for attribution
      const { data: lastStageChangeData } = await supabase
        .from('lead_stage_changes')
        .select('changed_by, created_at, new_stage')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(1)

      const lastStageChange = lastStageChangeData && lastStageChangeData.length > 0 ? lastStageChangeData[0] : null

      const { data: recentActivities } = await supabase
        .from('activities')
        .select(`
          activity_type,
          note,
          created_at,
          created_by,
          dashboard_users:created_by (name, email)
        `)
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(1)

      // Build attribution
      let attribution = ''
      if (lastStageChange) {
        const changedBy = lastStageChange.changed_by
        let actorName = 'PROXe AI'
        let action = `changed stage to ${lastStageChange.new_stage}`

        if (changedBy !== 'PROXe AI' && changedBy !== 'system') {
          const { data: user } = await supabase
            .from('dashboard_users')
            .select('name, email')
            .eq('id', changedBy)
            .single()

          if (user) {
            actorName = user.name || user.email || 'Team Member'
          }
        }

        const timeAgo = formatTimeAgo(lastStageChange.created_at)
        attribution = `Last updated by ${actorName} ${timeAgo} - ${action}`
      } else if (recentActivities && recentActivities.length > 0) {
        const latestActivity = recentActivities[0]
        // dashboard_users is an array from the relation query, get first element
        const creator = Array.isArray(latestActivity.dashboard_users)
          ? latestActivity.dashboard_users[0]
          : latestActivity.dashboard_users
        const actorName = creator?.name || creator?.email || 'Team Member'
        const timeAgo = formatTimeAgo(latestActivity.created_at)
        attribution = `Last updated by ${actorName} ${timeAgo} - ${latestActivity.activity_type}`
      }

      // Calculate basic metrics for summaryData
      const lastInteraction = lead.last_interaction_at || lead.created_at
      const daysInactive = lastInteraction
        ? Math.max(0, Math.floor((new Date().getTime() - new Date(lastInteraction).getTime()) / (1000 * 60 * 60 * 24)))
        : 0

      // Fetch messages for response rate calculation
      let responseRate = 0
      try {
        const { data: messages } = await supabase
          .from('conversations')
          .select('sender')
          .eq('lead_id', leadId)

        if (messages && messages.length > 0) {
          const customerMessages = messages.filter(m => m.sender === 'customer').length
          responseRate = Math.round((customerMessages / messages.length) * 100)
        }
      } catch (error) {
        console.error('Error calculating response rate:', error)
      }

      const summaryData = {
        leadName: lead.customer_name || 'Customer',
        lastMessage: null,
        conversationStatus: 'Active',
        responseRate,
        daysInactive,
        nextTouchpoint: lead.unified_context?.next_touchpoint || lead.unified_context?.sequence?.next_step,
        keyInfo: {
          budget: lead.unified_context?.budget || lead.unified_context?.web?.budget || lead.unified_context?.whatsapp?.budget,
          serviceInterest: lead.unified_context?.service_interest || lead.unified_context?.web?.service_interest || lead.unified_context?.bcon?.service_interest,
          painPoints: lead.unified_context?.pain_points || lead.unified_context?.web?.pain_points,
          businessType: lead.unified_context?.bcon?.business_type || lead.unified_context?.bcon?.user_type || null,
          timeline: lead.unified_context?.bcon?.timeline || null,
        },
        leadStage: lead.lead_stage,
        subStage: lead.sub_stage,
        bookingDate: bookingDate,
        bookingTime: bookingTime,
      }

      return NextResponse.json({
        summary: unifiedSummary,
        attribution,
        data: summaryData,
      })
    }

    // Priority 2: Generate unified summary from web and whatsapp summaries if they exist
    // (but unified_summary doesn't exist yet, or we're refreshing)
    if ((webSummary || whatsappSummary) || forceRefresh) {
      console.log('Generating unified summary from web/whatsapp summaries for lead:', leadId)

      // Fetch additional context needed for unified summary generation
      const { data: lastStageChangeData } = await supabase
        .from('lead_stage_changes')
        .select('changed_by, created_at, new_stage')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(1)

      const lastStageChange = lastStageChangeData && lastStageChangeData.length > 0 ? lastStageChangeData[0] : null

      const { data: recentActivities } = await supabase
        .from('activities')
        .select(`
          activity_type,
          note,
          created_at,
          created_by,
          dashboard_users:created_by (name, email)
        `)
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(5)

      // Calculate basic metrics
      const lastInteraction = lead.last_interaction_at || lead.created_at
      const daysInactive = lastInteraction
        ? Math.max(0, Math.floor((new Date().getTime() - new Date(lastInteraction).getTime()) / (1000 * 60 * 60 * 24)))
        : 0

      // Fetch messages for response rate calculation
      let responseRate = 0
      try {
        const { data: messages } = await supabase
          .from('conversations')
          .select('sender')
          .eq('lead_id', leadId)

        if (messages && messages.length > 0) {
          const customerMessages = messages.filter(m => m.sender === 'customer').length
          responseRate = Math.round((customerMessages / messages.length) * 100)
        }
      } catch (error) {
        console.error('Error calculating response rate:', error)
      }

      // Extract key info (BCON = AI business solutions)
      const brandContextData = lead.unified_context?.bcon || {}
      const keyInfo = {
        budget: lead.unified_context?.budget || lead.unified_context?.web?.budget || lead.unified_context?.whatsapp?.budget,
        serviceInterest: lead.unified_context?.service_interest || lead.unified_context?.web?.service_interest || brandContextData.service_interest,
        painPoints: lead.unified_context?.pain_points || lead.unified_context?.web?.pain_points,
        businessType: brandContextData.business_type || brandContextData.user_type || null,
        timeline: brandContextData.timeline || null,
      }

      // Build activities context
      const activitiesContext = recentActivities
        ?.map(a => {
          const creator = Array.isArray(a.dashboard_users)
            ? a.dashboard_users[0]
            : a.dashboard_users
          return `[${a.created_at}] ${creator?.name || creator?.email || 'Team'}: ${a.activity_type} - ${a.note}`
        })
        .join('\n') || 'No team activities'

      // Build lead-specific context
      const brandInfo = []
      if (keyInfo.businessType) {
        brandInfo.push(`Business Type: ${keyInfo.businessType}`)
      }
      if (keyInfo.serviceInterest) {
        brandInfo.push(`Service Interest: ${keyInfo.serviceInterest}`)
      }
      if (keyInfo.timeline) {
        brandInfo.push(`Timeline: ${keyInfo.timeline}`)
      }

      // Try to generate unified summary using Claude API
      const apiKey = process.env.CLAUDE_API_KEY
      if (apiKey) {
        try {
          // Include existing summary if available for context preservation
          const existingSummary = lead.unified_context?.unified_summary || ''

          const prompt = `Generate a useful summary for this business lead. This is BCON Club — an AI-powered business solutions company.

${existingSummary ? `PREVIOUS SUMMARY (preserve key facts from this, update with new info):\n${existingSummary}\n` : ''}
FORMAT REQUIREMENTS:
- Write exactly 2-3 concise, punchy sentences.
- Use markdown **bolding** for critical information like service interest, business needs, status, or intent.
- Summarize the conversation, current status, and next steps.

CRITICAL RULES:
- BE CONCISE. No fluff. No "This user is...". Just the facts.
- ONLY state actions explicitly confirmed in messages.
- NEVER assume actions that aren't explicitly stated.
- NEVER say "no communication summaries available" or "no interaction details" - always provide a useful summary.
- NEVER mention "course offerings", "enrollment", or aviation terms — this is a business AI solutions company.
- If a previous summary exists, preserve its key facts and ADD new information. Do not lose important context.

Lead Information:
Name: ${lead.customer_name || 'Customer'}
Stage: ${lead.lead_stage || 'Unknown'}${lead.sub_stage ? ` (${lead.sub_stage})` : ''}
Days Inactive: ${daysInactive}
${brandInfo.length > 0 ? `\nLead Details:\n${brandInfo.join('\n')}` : ''}

Channel Summaries:
${webSummary ? `Web Channel:\n${webSummary}\n` : ''}
${whatsappSummary ? `WhatsApp Channel:\n${whatsappSummary}\n` : ''}

Recent Activities:
${activitiesContext}

${keyInfo.budget ? `Budget mentioned: ${keyInfo.budget}` : ''}
${keyInfo.serviceInterest ? `Service interest: ${keyInfo.serviceInterest}` : ''}
${keyInfo.painPoints ? `Pain points: ${keyInfo.painPoints}` : ''}
${lead.unified_context?.next_touchpoint ? `Next Touchpoint: ${lead.unified_context.next_touchpoint}` : ''}

Generate a 2-3 sentence summary focusing on what was discussed, the lead's current status, and recommended next steps.`

          // Add timeout to prevent hanging
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

          let response
          try {
            response = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 800,
                messages: [
                  {
                    role: 'user',
                    content: prompt,
                  },
                ],
              }),
              signal: controller.signal,
            })
            clearTimeout(timeoutId)
          } catch (fetchError: any) {
            clearTimeout(timeoutId)
            if (fetchError.name === 'AbortError') {
              console.error('Claude API request timed out after 30 seconds')
            } else {
              console.error('Claude API request failed:', fetchError)
            }
            throw fetchError // Re-throw to be caught by outer catch
          }

          if (response.ok) {
            const data = await response.json()
            const unifiedSummary = data.content?.[0]?.text || ''
            if (unifiedSummary) {
              // Build attribution
              let attribution = ''
              if (lastStageChange) {
                const changedBy = lastStageChange.changed_by
                let actorName = 'PROXe AI'
                let action = `changed stage to ${lastStageChange.new_stage}`

                if (changedBy !== 'PROXe AI' && changedBy !== 'system') {
                  const { data: user } = await supabase
                    .from('dashboard_users')
                    .select('name, email')
                    .eq('id', changedBy)
                    .single()

                  if (user) {
                    actorName = user.name || user.email || 'Team Member'
                  }
                }

                const timeAgo = formatTimeAgo(lastStageChange.created_at)
                attribution = `Last updated by ${actorName} ${timeAgo} - ${action}`
              } else if (recentActivities && recentActivities.length > 0) {
                const latestActivity = recentActivities[0]
                const creator = Array.isArray(latestActivity.dashboard_users)
                  ? latestActivity.dashboard_users[0]
                  : latestActivity.dashboard_users
                const actorName = creator?.name || creator?.email || 'Team Member'
                const timeAgo = formatTimeAgo(latestActivity.created_at)
                attribution = `Last updated by ${actorName} ${timeAgo} - ${latestActivity.activity_type}`
              }

              const summaryData = {
                leadName: lead.customer_name || 'Customer',
                lastMessage: null,
                conversationStatus: 'Active',
                responseRate,
                daysInactive,
                nextTouchpoint: lead.unified_context?.next_touchpoint || lead.unified_context?.sequence?.next_step,
                keyInfo,
                leadStage: lead.lead_stage,
                subStage: lead.sub_stage,
                bookingDate: bookingDate,
                bookingTime: bookingTime,
              }

              // Save the new summary to the database
              try {
                const newUnifiedContext = {
                  ...(lead.unified_context || {}),
                  unified_summary: unifiedSummary
                };
                await supabase
                  .from('all_leads')
                  .update({ unified_context: newUnifiedContext })
                  .eq('id', leadId);
              } catch (dbError) {
                console.error('Error saving updated unified_summary:', dbError);
              }

              return NextResponse.json({
                summary: unifiedSummary,
                attribution,
                data: summaryData,
              })
            }
          } else {
            const errorText = await response.text()
            console.error('Claude API error:', response.status, errorText)
          }
        } catch (error) {
          console.error('Error generating unified summary from channel summaries:', error)
          // Fall through to fallback
        }
      }

      // Fallback: If Claude API fails or is unavailable, create a better combined summary
      let fallbackSummary = ''
      if (webSummary && whatsappSummary) {
        // Try to create a more unified narrative
        fallbackSummary = `${lead.customer_name || 'Customer'} has engaged through both web and WhatsApp channels. `
        fallbackSummary += `Web interaction: ${webSummary} `
        fallbackSummary += `WhatsApp interaction: ${whatsappSummary} `
        fallbackSummary += `Currently in ${lead.lead_stage || 'Unknown'} stage${lead.sub_stage ? ` (${lead.sub_stage})` : ''}.`
      } else if (webSummary) {
        fallbackSummary = `${lead.customer_name || 'Customer'} engaged via web channel. ${webSummary} Currently in ${lead.lead_stage || 'Unknown'} stage${lead.sub_stage ? ` (${lead.sub_stage})` : ''}.`
      } else if (whatsappSummary) {
        fallbackSummary = `${lead.customer_name || 'Customer'} engaged via WhatsApp. ${whatsappSummary} Currently in ${lead.lead_stage || 'Unknown'} stage${lead.sub_stage ? ` (${lead.sub_stage})` : ''}.`
      }

      // Safety check: ensure we always have a summary
      if (!fallbackSummary || fallbackSummary.trim() === '') {
        fallbackSummary = `${lead.customer_name || 'Customer'} is currently in the ${lead.lead_stage || 'Unknown'} stage${lead.sub_stage ? ` (${lead.sub_stage})` : ''}.`
      }

      // Build attribution
      let attribution = ''
      if (lastStageChange) {
        const changedBy = lastStageChange.changed_by
        let actorName = 'PROXe AI'
        let action = `changed stage to ${lastStageChange.new_stage}`

        if (changedBy !== 'PROXe AI' && changedBy !== 'system') {
          const { data: user } = await supabase
            .from('dashboard_users')
            .select('name, email')
            .eq('id', changedBy)
            .single()

          if (user) {
            actorName = user.name || user.email || 'Team Member'
          }
        }

        const timeAgo = formatTimeAgo(lastStageChange.created_at)
        attribution = `Last updated by ${actorName} ${timeAgo} - ${action}`
      } else if (recentActivities && recentActivities.length > 0) {
        const latestActivity = recentActivities[0]
        const creator = Array.isArray(latestActivity.dashboard_users)
          ? latestActivity.dashboard_users[0]
          : latestActivity.dashboard_users
        const actorName = creator?.name || creator?.email || 'Team Member'
        const timeAgo = formatTimeAgo(latestActivity.created_at)
        attribution = `Last updated by ${actorName} ${timeAgo} - ${latestActivity.activity_type}`
      }

      const summaryData = {
        leadName: lead.customer_name || 'Customer',
        lastMessage: null,
        conversationStatus: 'Active',
        responseRate,
        daysInactive,
        nextTouchpoint: lead.unified_context?.next_touchpoint || lead.unified_context?.sequence?.next_step,
        keyInfo,
        leadStage: lead.lead_stage,
        subStage: lead.sub_stage,
        bookingDate: bookingDate,
        bookingTime: bookingTime,
      }

      return NextResponse.json({
        summary: fallbackSummary,
        attribution,
        data: summaryData,
      })
    }

    // ============================================
    // STEP 2: No summaries found - fallback to Claude generation
    // ============================================
    console.log('No summaries in unified_context, generating new summary via Claude for lead:', leadId)

    // Fetch last messages from all channels
    let webMessages = null
    let whatsappMessages = null
    let voiceMessages = null
    let socialMessages = null
    let allMessages: any[] = []

    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('content, sender, created_at, channel')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: true })

      if (!error && data) {
        allMessages = data
        // Get last message per channel
        const webMsgs = data.filter(m => m.channel === 'web')
        const whatsappMsgs = data.filter(m => m.channel === 'whatsapp')
        const voiceMsgs = data.filter(m => m.channel === 'voice')
        const socialMsgs = data.filter(m => m.channel === 'social')

        webMessages = webMsgs.length > 0 ? webMsgs[webMsgs.length - 1] : null
        whatsappMessages = whatsappMsgs.length > 0 ? whatsappMsgs[whatsappMsgs.length - 1] : null
        voiceMessages = voiceMsgs.length > 0 ? voiceMsgs[voiceMsgs.length - 1] : null
        socialMessages = socialMsgs.length > 0 ? socialMsgs[socialMsgs.length - 1] : null
      }
    } catch (error) {
      console.error('Error fetching messages:', error)
      // Continue with empty messages - will generate summary anyway
    }

    // Calculate response rate (percentage of customer messages)
    let responseRate = 0
    if (allMessages && allMessages.length > 0) {
      const customerMessages = allMessages.filter(m => m.sender === 'customer').length
      const totalMessages = allMessages.length
      responseRate = totalMessages > 0 ? Math.round((customerMessages / totalMessages) * 100) : 0
    }

    // Calculate days inactive
    const lastInteraction = lead.last_interaction_at || lead.created_at
    const daysInactive = lastInteraction
      ? Math.max(0, Math.floor((new Date().getTime() - new Date(lastInteraction).getTime()) / (1000 * 60 * 60 * 24)))
      : 0

    // Get last message (most recent across all channels)
    const lastMessage = [webMessages, whatsappMessages, voiceMessages, socialMessages]
      .filter(Boolean)
      .sort((a, b) => new Date(b!.created_at).getTime() - new Date(a!.created_at).getTime())[0]

    // Check for scheduled follow-ups (from unified_context or sequences)
    const nextTouchpoint = lead.unified_context?.next_touchpoint || lead.unified_context?.sequence?.next_step

    // Extract key info from unified_context (BCON = AI business solutions)
    const brandContextData = lead.unified_context?.bcon || {}
    const keyInfo = {
      budget: lead.unified_context?.budget || lead.unified_context?.web?.budget || lead.unified_context?.whatsapp?.budget,
      serviceInterest: lead.unified_context?.service_interest || lead.unified_context?.web?.service_interest || brandContextData.service_interest,
      painPoints: lead.unified_context?.pain_points || lead.unified_context?.web?.pain_points,
      businessType: brandContextData.business_type || brandContextData.user_type || null,
      timeline: brandContextData.timeline || null,
    }

    // Determine conversation status
    const hoursSinceLastMessage = lastMessage
      ? Math.floor((new Date().getTime() - new Date(lastMessage.created_at).getTime()) / (1000 * 60 * 60))
      : daysInactive * 24

    let conversationStatus = 'No recent activity'
    if (hoursSinceLastMessage < 1) {
      conversationStatus = 'Actively chatting'
    } else if (lastMessage?.sender === 'agent') {
      conversationStatus = `Waiting on customer (${hoursSinceLastMessage}h ago)`
    } else if (lastMessage?.sender === 'customer') {
      conversationStatus = `No response (${hoursSinceLastMessage}h ago)`
    }

    // Build summary data
    const summaryData = {
      leadName: lead.customer_name || 'Customer',
      lastMessage: lastMessage ? {
        content: lastMessage.content,
        sender: lastMessage.sender,
        timestamp: lastMessage.created_at,
        channel: lastMessage.channel,
      } : null,
      conversationStatus,
      responseRate,
      daysInactive,
      nextTouchpoint,
      keyInfo,
      leadStage: lead.lead_stage,
      subStage: lead.sub_stage,
      bookingDate: bookingDate,
      bookingTime: bookingTime,
    }

    // Fetch last 10 conversation messages
    const last10Messages = allMessages.slice(-10).map(m => ({
      sender: m.sender === 'customer' ? 'Customer' : 'PROXe',
      content: m.content,
      timestamp: m.created_at,
      channel: m.channel,
    }))

    // Fetch recent activities
    const { data: recentActivities } = await supabase
      .from('activities')
      .select(`
        activity_type,
        note,
        created_at,
        created_by,
        dashboard_users:created_by (name, email)
      `)
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(5)

    // Fetch last stage change
    const { data: lastStageChangeData } = await supabase
      .from('lead_stage_changes')
      .select('changed_by, created_at, new_stage')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(1)

    const lastStageChange = lastStageChangeData && lastStageChangeData.length > 0 ? lastStageChangeData[0] : null

    // Generate AI summary if Claude API key is available
    const apiKey = process.env.CLAUDE_API_KEY
    if (apiKey) {
      try {
        // Build conversation context
        const conversationContext = last10Messages
          .map(m => `[${m.timestamp}] ${m.sender} (${m.channel}): ${m.content}`)
          .join('\n')

        // Build activities context
        const activitiesContext = recentActivities
          ?.map(a => {
            // dashboard_users is an array from the relation query, get first element
            const creator = Array.isArray(a.dashboard_users)
              ? a.dashboard_users[0]
              : a.dashboard_users
            return `[${a.created_at}] ${creator?.name || creator?.email || 'Team'}: ${a.activity_type} - ${a.note}`
          })
          .join('\n') || 'No team activities'

        // Build lead-specific context
        const brandInfo = []
        if (keyInfo.businessType) {
          brandInfo.push(`Business Type: ${keyInfo.businessType}`)
        }
        if (keyInfo.serviceInterest) {
          brandInfo.push(`Service Interest: ${keyInfo.serviceInterest}`)
        }
        if (keyInfo.timeline) {
          brandInfo.push(`Timeline: ${keyInfo.timeline}`)
        }

        // Include existing summary for context preservation
        const existingSummary = lead.unified_context?.unified_summary || ''

        const prompt = `Generate a useful summary for this business lead based on their conversation history. This is BCON Club — an AI-powered business solutions company.

${existingSummary ? `PREVIOUS SUMMARY (preserve key facts from this, update with new info):\n${existingSummary}\n` : ''}
FORMAT REQUIREMENTS:
- Write exactly 2-3 concise, punchy sentences.
- Use markdown **bolding** for critical information like service interest, business needs, status, or intent.
- Summarize the conversation, current status, and next steps.

CRITICAL RULES:
- BE CONCISE. No fluff or filler phrases.
- ONLY state actions explicitly confirmed in messages.
- NEVER assume actions that aren't explicitly stated.
- NEVER say "no communication summaries available" or "no interaction details" - always provide a useful summary.
- NEVER mention "course offerings", "enrollment", or aviation terms — this is a business AI solutions company.
- If a previous summary exists, preserve its key facts and ADD new information. Do not lose important context.
- If messages exist, summarize the actual conversation content.

Lead Information:
Name: ${summaryData.leadName}
Stage: ${lead.lead_stage || 'Unknown'}${lead.sub_stage ? ` (${lead.sub_stage})` : ''}
Days Inactive: ${daysInactive}
${brandInfo.length > 0 ? `\nLead Details:\n${brandInfo.join('\n')}` : ''}

Conversation Messages:
${conversationContext || 'No messages recorded yet.'}

Recent Activities:
${activitiesContext}

${summaryData.lastMessage ? `Last Message: ${summaryData.lastMessage.sender === 'customer' ? 'Customer' : 'PROXe'} sent "${summaryData.lastMessage.content.substring(0, 200)}" via ${summaryData.lastMessage.channel} at ${new Date(summaryData.lastMessage.timestamp).toLocaleString()}` : ''}

Conversation Status: ${conversationStatus}
${summaryData.nextTouchpoint ? `Next Touchpoint: ${summaryData.nextTouchpoint}` : ''}
${keyInfo.budget ? `Budget mentioned: ${keyInfo.budget}` : ''}
${keyInfo.serviceInterest ? `Service interest: ${keyInfo.serviceInterest}` : ''}
${keyInfo.painPoints ? `Pain points: ${keyInfo.painPoints}` : ''}

Generate a 2-3 sentence summary focusing on what was discussed in the conversation, the lead's current status, and recommended next steps.`

        // Add timeout to prevent hanging
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

        let response
        try {
          response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 800, // Increased from 400 to allow for more comprehensive summaries
              messages: [
                {
                  role: 'user',
                  content: prompt,
                },
              ],
            }),
            signal: controller.signal,
          })
          clearTimeout(timeoutId)
        } catch (fetchError: any) {
          clearTimeout(timeoutId)
          if (fetchError.name === 'AbortError') {
            console.error('Claude API request timed out after 30 seconds')
          } else {
            console.error('Claude API request failed:', fetchError)
          }
          throw fetchError // Re-throw to be caught by outer catch
        }

        if (response.ok) {
          const data = await response.json()
          const aiSummary = data.content?.[0]?.text || ''
          if (aiSummary) {
            // Save the new summary to the database
            try {
              const newUnifiedContext = {
                ...(lead.unified_context || {}),
                unified_summary: aiSummary
              };
              await supabase
                .from('all_leads')
                .update({ unified_context: newUnifiedContext })
                .eq('id', leadId);
            } catch (dbError) {
              console.error('Error saving regenerated unified_summary:', dbError);
            }

            // Build attribution
            let attribution = ''
            if (lastStageChange) {
              const changedBy = lastStageChange.changed_by
              let actorName = 'PROXe AI'
              let action = `changed stage to ${lastStageChange.new_stage}`

              if (changedBy !== 'PROXe AI' && changedBy !== 'system') {
                // Try to get user name
                const { data: user } = await supabase
                  .from('dashboard_users')
                  .select('name, email')
                  .eq('id', changedBy)
                  .single()

                if (user) {
                  actorName = user.name || user.email || 'Team Member'
                }
              }

              const timeAgo = formatTimeAgo(lastStageChange.created_at)
              attribution = `Last updated by ${actorName} ${timeAgo} - ${action}`
            } else if (recentActivities && recentActivities.length > 0) {
              const latestActivity = recentActivities[0]
              const creator = Array.isArray(latestActivity.dashboard_users)
                ? latestActivity.dashboard_users[0]
                : latestActivity.dashboard_users
              const actorName = creator?.name || creator?.email || 'Team Member'
              const timeAgo = formatTimeAgo(latestActivity.created_at)

              attribution = `Last updated by ${actorName} ${timeAgo} - ${latestActivity.activity_type}`
            } else if (summaryData.lastMessage) {
              const sender = summaryData.lastMessage.sender === 'customer' ? 'Customer' : 'PROXe'
              const timeAgo = formatTimeAgo(summaryData.lastMessage.timestamp)
              attribution = `Last updated by ${sender} ${timeAgo} - message sent`
            }

            return NextResponse.json({
              summary: aiSummary,
              attribution,
              data: summaryData,
            })
          }
        } else {
          const errorText = await response.text()
          console.error('Claude API error:', response.status, errorText)
        }
      } catch (error) {
        console.error('Error generating AI summary:', error)
        // Continue to fallback
      }
    }

    // Fallback: Generate basic summary without AI
    let fallbackSummary = `${summaryData.leadName} is currently in the ${lead.lead_stage || 'Unknown'} stage`
    if (lead.sub_stage) {
      fallbackSummary += ` (${lead.sub_stage})`
    }
    fallbackSummary += `. `

    // Add lead-specific info
    const brandDetails = []
    if (keyInfo.businessType) {
      brandDetails.push(`Business Type: ${keyInfo.businessType}`)
    }
    if (keyInfo.serviceInterest) {
      brandDetails.push(`Service Interest: ${keyInfo.serviceInterest}`)
    }
    if (keyInfo.timeline) {
      brandDetails.push(`Timeline: ${keyInfo.timeline}`)
    }
    if (brandDetails.length > 0) {
      fallbackSummary += `${brandDetails.join(', ')}. `
    }

    if (summaryData.lastMessage) {
      const sender = summaryData.lastMessage.sender === 'customer' ? 'Customer' : 'PROXe'
      const timeAgo = hoursSinceLastMessage < 24
        ? `${hoursSinceLastMessage}h ago`
        : `${daysInactive}d ago`
      fallbackSummary += `Last message from ${sender} ${timeAgo}: "${summaryData.lastMessage.content.substring(0, 100)}...". `
    }

    fallbackSummary += `Conversation status: ${conversationStatus}. `
    fallbackSummary += `Response rate: ${responseRate}%. `

    if (keyInfo.budget || keyInfo.serviceInterest || keyInfo.painPoints) {
      fallbackSummary += 'Key info: '
      if (keyInfo.budget) fallbackSummary += `Budget: ${keyInfo.budget}. `
      if (keyInfo.serviceInterest) fallbackSummary += `Interest: ${keyInfo.serviceInterest}. `
      if (keyInfo.painPoints) fallbackSummary += `Pain points: ${keyInfo.painPoints}. `
    }

    // Build attribution for fallback
    let attribution = ''
    if (lastStageChange) {
      const changedBy = lastStageChange.changed_by
      let actorName = 'PROXe AI'
      let action = `changed stage to ${lastStageChange.new_stage}`

      if (changedBy !== 'PROXe AI' && changedBy !== 'system') {
        const { data: user } = await supabase
          .from('dashboard_users')
          .select('name, email')
          .eq('id', changedBy)
          .single()

        if (user) {
          actorName = user.name || user.email || 'Team Member'
        }
      }

      const timeAgo = formatTimeAgo(lastStageChange.created_at)
      attribution = `Last updated by ${actorName} ${timeAgo} - ${action}`
    }

    console.log('Returning fallback summary for lead:', leadId)
    return NextResponse.json({
      summary: fallbackSummary,
      attribution,
      data: summaryData,
    })
  } catch (error) {
    console.error('Error generating lead summary:', error)
    // Always return a basic summary even on error
    const errorSummary = `Unable to load summary`
    return NextResponse.json({
      summary: errorSummary,
      attribution: '',
      data: {
        daysInactive: 0,
        responseRate: 0,
      },
      error: String(error),
    })
  }
}

