// Shared lead score calculation utility
// Used by both LeadsTable and LeadDetailsModal to ensure consistent scoring

import { createClient } from '@/lib/supabase/client'
import type { Lead } from '@/types'

export interface ScoreBreakdown {
  ai: number
  activity: number
  business: number
}

export interface CalculatedScore {
  score: number
  breakdown: ScoreBreakdown
}

export async function calculateLeadScore(leadData: Lead): Promise<CalculatedScore> {
  try {
    const supabase = createClient()
    
    // Fetch messages for analysis
    const { data: messages } = await supabase
      .from('conversations')
      .select('content, sender, created_at, channel')
      .eq('lead_id', leadData.id)
      .order('created_at', { ascending: true })

    // Get conversation summaries from unified_context
    const unifiedContext = leadData.unified_context || {}
    const conversationSummary = 
      unifiedContext.unified_summary ||
      unifiedContext.web?.conversation_summary ||
      unifiedContext.whatsapp?.conversation_summary ||
      unifiedContext.voice?.conversation_summary ||
      unifiedContext.social?.conversation_summary ||
      ''
    
    // Combine all text for analysis
    const allText = [
      conversationSummary,
      ...(messages || []).map((m: any) => m.content || '').filter(Boolean)
    ].join(' ').toLowerCase()

    // ============================================
    // 1. AI Analysis (60% weight)
    // ============================================
    let aiScore = 0
    
    // Intent signals detection
    const intentKeywords = {
      pricing: ['price', 'cost', 'pricing', 'fee', 'charge', 'afford', 'budget', 'expensive', 'cheap', 'discount', 'offer'],
      booking: ['book', 'booking', 'schedule', 'appointment', 'reserve', 'available', 'slot', 'time', 'date'],
      urgency: ['urgent', 'asap', 'soon', 'immediately', 'quickly', 'fast', 'today', 'now', 'hurry', 'rushed']
    }
    
    let intentSignals = 0
    Object.values(intentKeywords).forEach(keywords => {
      const found = keywords.some(keyword => allText.includes(keyword))
      if (found) intentSignals++
    })
    // Intent signals: 0-3, normalize to 0-100
    const intentScore = Math.min(100, (intentSignals / 3) * 100)
    
    // Sentiment analysis (simple keyword-based)
    const positiveWords = ['good', 'great', 'excellent', 'perfect', 'love', 'amazing', 'wonderful', 'happy', 'satisfied', 'interested', 'yes', 'sure', 'definitely']
    const negativeWords = ['bad', 'terrible', 'worst', 'hate', 'disappointed', 'frustrated', 'angry', 'no', 'not', "don't", "won't", 'cancel']
    
    const positiveCount = positiveWords.filter(word => allText.includes(word)).length
    const negativeCount = negativeWords.filter(word => allText.includes(word)).length
    const sentimentScore = positiveCount > negativeCount 
      ? Math.min(100, 50 + (positiveCount * 10))
      : Math.max(0, 50 - (negativeCount * 10))
    
    // Buying signals detection
    const buyingSignals = [
      'when can', 'how much', 'what is the price', 'tell me about', 'i want', 'i need',
      'interested in', 'looking for', 'considering', 'deciding', 'compare', 'options'
    ]
    const buyingSignalCount = buyingSignals.filter(signal => allText.includes(signal)).length
    const buyingSignalScore = Math.min(100, buyingSignalCount * 20)
    
    // Combine AI scores (weighted average)
    aiScore = (intentScore * 0.4 + sentimentScore * 0.3 + buyingSignalScore * 0.3)
    
    // ============================================
    // 2. Activity (30% weight)
    // ============================================
    const messageCount = messages?.length || 0
    // Message count: normalize to 0-1 (100 messages = 1.0, capped at 1.0)
    const msgCountNormalized = Math.min(1.0, messageCount / 100)
    
    // Response rate (52% = good baseline)
    const customerMessages = messages?.filter((m: any) => m.sender === 'customer').length || 0
    const agentMessages = messages?.filter((m: any) => m.sender === 'agent').length || 0
    const responseRate = customerMessages > 0 
      ? (agentMessages / customerMessages) 
      : 0
    // Response rate is already 0-1 (e.g., 0.52 for 52%)
    
    // Recency score (days since last interaction)
    const typedLeadData = leadData as any
    const lastInteraction = 
      typedLeadData.last_interaction_at || 
      unifiedContext.whatsapp?.last_interaction ||
      unifiedContext.web?.last_interaction ||
      unifiedContext.voice?.last_interaction ||
      unifiedContext.social?.last_interaction ||
      leadData.timestamp
    
    const daysSinceLastInteraction = lastInteraction
      ? Math.floor((new Date().getTime() - new Date(lastInteraction).getTime()) / (1000 * 60 * 60 * 24))
      : 999
    
    // Recency: 0 days = 1.0, 7 days = 0.5, 30 days = 0 (normalize to 0-1)
    const recencyScore = Math.max(0, Math.min(1.0, 1.0 - (daysSinceLastInteraction / 30)))
    
    // Channel mix bonus (2+ channels = bonus) - add 0.1 to the average
    const activeChannels = new Set(messages?.map((m: any) => m.channel).filter(Boolean) || []).size
    const channelMixBonus = activeChannels >= 2 ? 0.1 : 0
    
    // Activity score: ((msg_count/100 + response_rate + recency_score) / 3) * 0.3
    // Then convert to 0-100 scale for display
    const activityScoreBase = ((msgCountNormalized + responseRate + recencyScore) / 3) + channelMixBonus
    const activityScore = Math.min(100, activityScoreBase * 100)
    
    // ============================================
    // 3. Business Signals (10% weight)
    // ============================================
    let businessScore = 0
    
    // Booking exists = +10 points
    const hasBooking = !!(leadData.booking_date || leadData.booking_time || 
      unifiedContext.web?.booking_date || unifiedContext.web?.booking?.date ||
      unifiedContext.whatsapp?.booking_date || unifiedContext.whatsapp?.booking?.date ||
      unifiedContext.voice?.booking_date || unifiedContext.voice?.booking?.date ||
      unifiedContext.social?.booking_date || unifiedContext.social?.booking?.date)
    if (hasBooking) businessScore += 10
    
    // Email/phone provided = +5 points
    if (leadData.email || leadData.phone) businessScore += 5
    
    // Multi-touchpoint = +5 points (2+ channels)
    if (activeChannels >= 2) businessScore += 5
    
    // Business score can be 0-20, but we need it to contribute 10% (0-10 points) to total
    // So we normalize: businessScore (0-20) -> (0-10) for the 10% weight
    const businessScoreNormalized = Math.min(10, businessScore)
    
    // ============================================
    // Calculate Total Score
    // ============================================
    const totalScore = Math.min(100, 
      (aiScore * 0.6) + 
      (activityScore * 0.3) + 
      businessScoreNormalized
    )
    
    return {
      score: Math.round(totalScore),
      breakdown: {
        ai: Math.round(aiScore * 0.6), // Already weighted (0-60)
        activity: Math.round(activityScore * 0.3), // Already weighted (0-30)
        business: Math.round(businessScoreNormalized), // Already normalized to 0-10 for 10% weight
      }
    }
  } catch (error) {
    console.error('Error calculating lead score:', error)
    return {
      score: 0,
      breakdown: {
        ai: 0,
        activity: 0,
        business: 0
      }
    }
  }
}
