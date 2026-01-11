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
    console.log('Generating summary for lead:', leadId)

    // Fetch lead data
    const { data: lead, error: leadError } = await supabase
      .from('all_leads')
      .select('id, customer_name, email, phone, created_at, last_interaction_at, lead_stage, sub_stage, booking_date, booking_time, unified_context')
      .eq('id', leadId)
      .single()

    if (leadError) {
      console.error('Error fetching lead:', leadError)
      return NextResponse.json({ error: 'Failed to fetch lead', details: leadError.message }, { status: 500 })
    }

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    // ============================================
    // STEP 1: Check unified_context for existing summaries
    // ============================================
    const unifiedSummary = lead.unified_context?.unified_summary
    const webSummary = lead.unified_context?.web?.conversation_summary
    const whatsappSummary = lead.unified_context?.whatsapp?.conversation_summary

    // Priority 1: Use unified_summary if it exists
    if (unifiedSummary) {
      console.log('Using unified_summary from unified_context for lead:', leadId)
      
      // Still need to fetch activities and stage history for attribution
      const { data: lastStageChange } = await supabase
        .from('stage_history')
        .select('changed_by, changed_at, new_stage')
        .eq('lead_id', leadId)
        .order('changed_at', { ascending: false })
        .limit(1)
        .single()

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
        
        const timeAgo = formatTimeAgo(lastStageChange.changed_at)
        attribution = `Last updated by ${actorName} ${timeAgo} - ${action}`
      } else if (recentActivities && recentActivities.length > 0) {
        const latestActivity = recentActivities[0]
        const creator = latestActivity.dashboard_users
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
          serviceInterest: lead.unified_context?.service_interest || lead.unified_context?.web?.service_interest,
          painPoints: lead.unified_context?.pain_points || lead.unified_context?.web?.pain_points,
        },
        leadStage: lead.lead_stage,
        subStage: lead.sub_stage,
        bookingDate: lead.booking_date,
        bookingTime: lead.booking_time,
      }

      return NextResponse.json({
        summary: unifiedSummary,
        attribution,
        data: summaryData,
      })
    }

    // Priority 2: Combine web and whatsapp summaries if they exist
    if (webSummary || whatsappSummary) {
      console.log('Combining web and whatsapp summaries from unified_context for lead:', leadId)
      
      let combinedSummary = ''
      if (webSummary && whatsappSummary) {
        combinedSummary = `Web: ${webSummary}\n\nWhatsApp: ${whatsappSummary}`
      } else if (webSummary) {
        combinedSummary = `Web: ${webSummary}`
      } else if (whatsappSummary) {
        combinedSummary = `WhatsApp: ${whatsappSummary}`
      }

      // Still need to fetch activities and stage history for attribution
      const { data: lastStageChange } = await supabase
        .from('stage_history')
        .select('changed_by, changed_at, new_stage')
        .eq('lead_id', leadId)
        .order('changed_at', { ascending: false })
        .limit(1)
        .single()

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
        
        const timeAgo = formatTimeAgo(lastStageChange.changed_at)
        attribution = `Last updated by ${actorName} ${timeAgo} - ${action}`
      } else if (recentActivities && recentActivities.length > 0) {
        const latestActivity = recentActivities[0]
        const creator = latestActivity.dashboard_users
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
          serviceInterest: lead.unified_context?.service_interest || lead.unified_context?.web?.service_interest,
          painPoints: lead.unified_context?.pain_points || lead.unified_context?.web?.pain_points,
        },
        leadStage: lead.lead_stage,
        subStage: lead.sub_stage,
        bookingDate: lead.booking_date,
        bookingTime: lead.booking_time,
      }

      return NextResponse.json({
        summary: combinedSummary,
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

    // Extract key info from unified_context
    const keyInfo = {
      budget: lead.unified_context?.budget || lead.unified_context?.web?.budget || lead.unified_context?.whatsapp?.budget,
      serviceInterest: lead.unified_context?.service_interest || lead.unified_context?.web?.service_interest,
      painPoints: lead.unified_context?.pain_points || lead.unified_context?.web?.pain_points,
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
      bookingDate: lead.booking_date,
      bookingTime: lead.booking_time,
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
    const { data: lastStageChange } = await supabase
      .from('stage_history')
      .select('changed_by, changed_at, new_stage')
      .eq('lead_id', leadId)
      .order('changed_at', { ascending: false })
      .limit(1)
      .single()

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
            const creator = a.dashboard_users
            return `[${a.created_at}] ${creator?.name || creator?.email || 'Team'}: ${a.activity_type} - ${a.note}`
          })
          .join('\n') || 'No team activities'

        const prompt = `Generate a unified summary for this lead in this EXACT format:

"[Time ago] via [channel]. Customer [last action]. Currently [status]. [Key extracted info: interested in X, budget Y, pain points Z]. Next: [recommended action]."

Lead: ${summaryData.leadName}
Stage: ${lead.lead_stage || 'Unknown'}${lead.sub_stage ? ` (${lead.sub_stage})` : ''}
Days Inactive: ${daysInactive}
Response Rate: ${responseRate}%

Last 10 Messages:
${conversationContext || 'No messages yet'}

Recent Activities:
${activitiesContext}

${summaryData.lastMessage ? `Last Message: ${summaryData.lastMessage.sender === 'customer' ? 'Customer' : 'PROXe'} sent "${summaryData.lastMessage.content.substring(0, 150)}" via ${summaryData.lastMessage.channel} at ${new Date(summaryData.lastMessage.timestamp).toLocaleString()}` : 'No messages yet'}

Conversation Status: ${conversationStatus}
${summaryData.nextTouchpoint ? `Next Touchpoint: ${summaryData.nextTouchpoint}` : ''}
${keyInfo.budget ? `Budget mentioned: ${keyInfo.budget}` : ''}
${keyInfo.serviceInterest ? `Service interest: ${keyInfo.serviceInterest}` : ''}
${keyInfo.painPoints ? `Pain points: ${keyInfo.painPoints}` : ''}

Generate the summary in the exact format specified above. Make it concise and actionable.`

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 400,
            messages: [
              {
                role: 'user',
                content: prompt,
              },
            ],
          }),
        })

        if (response.ok) {
          const data = await response.json()
          const aiSummary = data.content?.[0]?.text || ''
          if (aiSummary) {
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
              
              const timeAgo = formatTimeAgo(lastStageChange.changed_at)
              attribution = `Last updated by ${actorName} ${timeAgo} - ${action}`
            } else if (recentActivities && recentActivities.length > 0) {
              const latestActivity = recentActivities[0]
              const creator = latestActivity.dashboard_users
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
      
      const timeAgo = formatTimeAgo(lastStageChange.changed_at)
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

