import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/leads/score
 * Trigger AI scoring for a lead based on conversation messages
 * Called automatically when a new message is inserted
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    // Allow service role or authenticated users
    const body = await request.json()
    const { lead_id } = body

    if (!lead_id) {
      return NextResponse.json({ error: 'lead_id is required' }, { status: 400 })
    }

    console.log('Scoring lead:', lead_id)

    // Fetch lead data
    const { data: lead, error: leadError } = await supabase
      .from('all_leads')
      .select('id, customer_name, email, phone, created_at, last_interaction_at, lead_stage, lead_score, booking_date, booking_time, is_manual_override')
      .eq('id', lead_id)
      .single()

    if (leadError || !lead) {
      console.error('Error fetching lead:', leadError)
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    // Check if manual override is active - if so, skip scoring
    if (lead.is_manual_override) {
      console.log('Lead has manual override, skipping scoring')
      return NextResponse.json({ 
        success: true, 
        message: 'Manual override active, skipping scoring',
        lead_id,
        score: lead.lead_score,
        stage: lead.lead_stage
      })
    }

    // Fetch full conversation thread for this lead
    const { data: messages, error: messagesError } = await supabase
      .from('conversations')
      .select('content, sender, created_at, channel')
      .eq('lead_id', lead_id)
      .order('created_at', { ascending: true })

    if (messagesError) {
      console.error('Error fetching messages:', messagesError)
      // Continue with empty messages
    }

    const conversationMessages = messages || []

    // Fetch activities for this lead
    const { data: activities } = await supabase
      .from('activities')
      .select('activity_type, created_at')
      .eq('lead_id', lead_id)
      .order('created_at', { ascending: false })
      .limit(10)

    // Calculate activity metrics
    const responseCount = conversationMessages.filter(m => m.sender === 'customer').length
    const totalMessages = conversationMessages.length
    const daysSinceStart = lead.created_at 
      ? Math.floor((new Date().getTime() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24))
      : 0
    const touchpoints = activities?.length || 0

    // Check for booking
    const hasBooking = !!(lead.booking_date && lead.booking_time)

    // Check if re-engaged after being cold (was inactive > 7 days, now has new message)
    const lastInteraction = lead.last_interaction_at || lead.created_at
    const daysInactive = lastInteraction
      ? Math.floor((new Date().getTime() - new Date(lastInteraction).getTime()) / (1000 * 60 * 60 * 24))
      : 0
    const wasCold = daysInactive > 7
    const isReengaged = wasCold && conversationMessages.length > 0

    // Build conversation context for AI analysis
    const conversationText = conversationMessages
      .map(m => `${m.sender === 'customer' ? 'Customer' : 'PROXe'}: ${m.content}`)
      .join('\n')

    // Call Claude API for AI scoring
    const apiKey = process.env.CLAUDE_API_KEY
    let aiScore = 0
    let aiAnalysis = null

    if (apiKey && conversationText) {
      try {
        const prompt = `Analyze this customer conversation and provide a lead score (0-100) based on:

1. Engagement (20%): response time, message length, questions asked
2. Intent signals (20%): keywords like pricing, booking, interested, when, how, schedule
3. Conversation depth (20%): number of turns, topic progression, specificity
4. Activity metrics (30%): response rate, days since start, touchpoints
5. Business events (10%): booking made (+50), re-engaged after cold (+20)

Conversation:
${conversationText.substring(0, 3000)} ${conversationText.length > 3000 ? '...' : ''}

Metrics:
- Response count: ${responseCount}
- Total messages: ${totalMessages}
- Days since start: ${daysSinceStart}
- Touchpoints: ${touchpoints}
- Has booking: ${hasBooking}
- Re-engaged: ${isReengaged}

Respond with ONLY a JSON object in this exact format:
{
  "score": <number 0-100>,
  "engagement": <number 0-20>,
  "intent": <number 0-20>,
  "depth": <number 0-20>,
  "activity": <number 0-30>,
  "business": <number 0-10>,
  "reasoning": "<brief explanation>"
}`

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 500,
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
          const text = data.content?.[0]?.text || ''
          
          // Parse JSON from response
          try {
            const jsonMatch = text.match(/\{[\s\S]*\}/)
            if (jsonMatch) {
              aiAnalysis = JSON.parse(jsonMatch[0])
              aiScore = Math.min(100, Math.max(0, aiAnalysis.score || 0))
            } else {
              // Fallback: extract number from text
              const scoreMatch = text.match(/\b(\d{1,3})\b/)
              if (scoreMatch) {
                aiScore = Math.min(100, Math.max(0, parseInt(scoreMatch[1])))
              }
            }
          } catch (parseError) {
            console.error('Error parsing AI response:', parseError)
            // Fallback scoring below
          }
        } else {
          const errorText = await response.text()
          console.error('Claude API error:', response.status, errorText)
          // Fallback scoring below
        }
      } catch (error) {
        console.error('Error calling Claude API:', error)
        // Fallback scoring below
      }
    }

    // Fallback scoring if AI fails
    if (aiScore === 0 && conversationMessages.length > 0) {
      // Simple rule-based scoring
      let score = 0
      
      // Engagement (20%)
      if (totalMessages > 10) score += 20
      else if (totalMessages > 5) score += 15
      else if (totalMessages > 2) score += 10
      else if (totalMessages > 0) score += 5
      
      // Intent signals (20%)
      const intentKeywords = ['pricing', 'price', 'cost', 'book', 'booking', 'schedule', 'interested', 'when', 'how', 'available']
      const hasIntent = conversationText.toLowerCase().split(/\s+/).some(word => intentKeywords.includes(word))
      if (hasIntent) score += 20
      else if (totalMessages > 3) score += 10
      else score += 5
      
      // Conversation depth (20%)
      if (totalMessages > 5) score += 20
      else if (totalMessages > 2) score += 15
      else score += 10
      
      // Activity metrics (30%)
      const responseRate = totalMessages > 0 ? (responseCount / totalMessages) * 100 : 0
      score += Math.min(15, (responseRate / 100) * 15)
      score += Math.min(10, Math.min(touchpoints * 2, 10))
      score += Math.max(0, 5 - Math.min(daysSinceStart / 7, 5))
      
      // Business events (10%)
      if (hasBooking) score += 50 // Major boost
      else if (isReengaged) score += 20
      
      aiScore = Math.min(100, score)
    }

    // Auto-assign stage based on score
    let newStage = lead.lead_stage || 'new'
    
    // Override: If booking exists, force Booking Made stage
    if (hasBooking) {
      newStage = 'Booking Made'
    } else if (aiScore >= 86) {
      newStage = 'Booking Made'
    } else if (aiScore >= 61) {
      newStage = 'High Intent'
    } else if (aiScore >= 31) {
      newStage = 'Qualified'
    } else if (aiScore > 0 || conversationMessages.length > 0) {
      // First message scoring - don't default to "New"
      if (conversationMessages.length === 1) {
        // First message: check for strong intent
        const firstMessage = conversationMessages[0].content.toLowerCase()
        const strongIntent = ['book', 'booking', 'schedule', 'interested', 'pricing', 'price'].some(keyword => 
          firstMessage.includes(keyword)
        )
        if (strongIntent && hasBooking) {
          newStage = 'Booking Made'
        } else if (strongIntent || aiScore >= 31) {
          newStage = 'Qualified'
        } else {
          newStage = 'New'
        }
      } else {
        newStage = 'New'
      }
    }

    // Get old stage for logging
    const oldStage = lead.lead_stage

    // Update lead
    const { error: updateError } = await supabase
      .from('all_leads')
      .update({
        lead_score: aiScore,
        lead_stage: newStage,
        last_interaction_at: new Date().toISOString(),
        response_count: responseCount,
        total_touchpoints: touchpoints,
      })
      .eq('id', lead_id)

    if (updateError) {
      console.error('Error updating lead:', updateError)
      return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 })
    }

    // Log to lead_stage_changes if stage changed
    if (oldStage !== newStage) {
      await supabase
        .from('lead_stage_changes')
        .insert({
          lead_id: lead_id,
          old_stage: oldStage,
          new_stage: newStage,
          old_score: lead.lead_score || null,
          new_score: aiScore,
          is_automatic: true,
          change_reason: 'PROXe AI scoring',
        })
    }

    // Update metrics
    await supabase.rpc('update_lead_metrics', { lead_uuid: lead_id })

    return NextResponse.json({
      success: true,
      lead_id,
      score: aiScore,
      stage: newStage,
      old_stage: oldStage,
      ai_analysis: aiAnalysis,
    })
  } catch (error) {
    console.error('Error scoring lead:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

