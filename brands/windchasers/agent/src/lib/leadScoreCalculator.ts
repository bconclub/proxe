// Shared lead score calculation utility
// Used by both LeadsTable and LeadDetailsModal to ensure consistent scoring
// Weights: AI 60%, Activity 25%, Business Readiness 15%

import { createClient } from './supabase/client'
import type { Lead } from '@/types'

export interface ScoreBreakdown {
  ai: number
  activity: number
  business: number
  readiness: number
  details: {
    intentScore: number
    sentimentScore: number
    buyingScore: number
    msgCount: number
    responseRate: number
    daysInactive: number
    hasBooking: boolean
    hasContact: boolean
    multiChannel: boolean
    hasWebsite: boolean
    hasAiSystems: boolean
    urgencyLevel: string | null
    monthlyLeads: string | null
    websiteLive: boolean
  }
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
    const formData = unifiedContext.form_data || {}
    const businessIntel = unifiedContext.business_intel || {}
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
    // 1. AI Analysis (60 points max)
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
    const intentScore = Math.min(100, (intentSignals / 3) * 100)

    // Sentiment analysis
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
      'interested in', 'looking for', 'considering', 'deciding', 'compare', 'options',
      'ready', 'sign up', 'register', 'confirm', 'joining', 'enroll', 'enrol', 'deposit'
    ]
    const buyingSignalCount = buyingSignals.filter(signal => allText.includes(signal)).length
    const buyingSignalScore = Math.min(100, buyingSignalCount * 20)

    aiScore = (intentScore * 0.4 + sentimentScore * 0.3 + buyingSignalScore * 0.3)

    // ============================================
    // 2. Activity (25 points max, was 30)
    // ============================================
    const messageCount = messages?.length || 0
    const msgCountNormalized = Math.min(1.0, messageCount / 100)

    const customerMessages = messages?.filter((m: any) => m.sender === 'customer').length || 0
    const agentMessages = messages?.filter((m: any) => m.sender === 'agent').length || 0
    const responseRate = customerMessages > 0 ? (agentMessages / customerMessages) : 0

    const lastInteraction =
      leadData.last_interaction_at ||
      unifiedContext.whatsapp?.last_interaction ||
      unifiedContext.web?.last_interaction ||
      unifiedContext.voice?.last_interaction ||
      unifiedContext.social?.last_interaction ||
      leadData.timestamp

    const daysSinceLastInteraction = lastInteraction
      ? Math.floor((new Date().getTime() - new Date(lastInteraction).getTime()) / (1000 * 60 * 60 * 24))
      : 999

    const recencyScore = Math.max(0, Math.min(1.0, 1.0 - (daysSinceLastInteraction / 30)))

    const activeChannels = new Set(messages?.map((m: any) => m.channel).filter(Boolean) || []).size
    const channelMixBonus = activeChannels >= 2 ? 0.1 : 0

    const activityScoreBase = ((msgCountNormalized + responseRate + recencyScore) / 3) + channelMixBonus
    const activityScore = Math.min(100, activityScoreBase * 100)

    // ============================================
    // 3. Business Signals (booking boost)
    // ============================================
    let businessScore = 0

    const hasBooking = !!(leadData.booking_date || leadData.booking_time ||
      unifiedContext.web?.booking_date || unifiedContext.web?.booking?.date ||
      unifiedContext.whatsapp?.booking_date || unifiedContext.whatsapp?.booking?.date ||
      unifiedContext.voice?.booking_date || unifiedContext.voice?.booking?.date ||
      unifiedContext.social?.booking_date || unifiedContext.social?.booking?.date)
    if (hasBooking) businessScore += 10

    if (leadData.email || leadData.phone) businessScore += 5
    if (activeChannels >= 2) businessScore += 5

    const businessScoreNormalized = Math.min(10, businessScore)

    // ============================================
    // 4. Business Readiness (15 points max, NEW)
    // ============================================
    let readinessScore = 0

    const hasWebsite = formData.has_website === true || !!unifiedContext.website_url
    const hasAiSystems = formData.has_ai_systems === true
    const urgencyLevel: string | null = formData.urgency || null
    const monthlyLeads: string | null = formData.monthly_leads || null
    const websiteLive = businessIntel.website_live === true

    // has_website = true: +5
    if (hasWebsite) readinessScore += 5

    // has_ai_systems = false (they NEED us): +3
    if (formData.has_ai_systems === false) readinessScore += 3

    // urgency is extremely_urgent or asap: +4
    if (urgencyLevel) {
      const u = urgencyLevel.toLowerCase()
      if (['extremely_urgent', 'asap', 'immediately', 'right_now'].includes(u)) {
        readinessScore += 4
      } else if (['urgent', 'soon', 'this_week', 'this_month'].includes(u)) {
        readinessScore += 2
      }
    }

    // monthly_leads > 50: +3
    if (monthlyLeads) {
      const leadsNum = parseInt(monthlyLeads.replace(/[^0-9]/g, ''), 10) || 0
      if (leadsNum > 50) readinessScore += 3
      else if (leadsNum > 20) readinessScore += 1
    }

    // website_live from crawl: +2 bonus
    if (websiteLive) readinessScore += 2

    readinessScore = Math.min(15, readinessScore)

    // ============================================
    // Calculate Total Score
    // AI (60) + Activity (25) + Readiness (15) + business boost
    // ============================================
    const totalScore = Math.min(100,
      (aiScore * 0.6) +
      (activityScore * 0.25) +
      readinessScore +
      businessScoreNormalized
    )

    return {
      score: Math.round(totalScore),
      breakdown: {
        ai: Math.round(aiScore * 0.6),
        activity: Math.round(activityScore * 0.25),
        business: Math.round(businessScoreNormalized),
        readiness: readinessScore,
        details: {
          intentScore: Math.round(intentScore),
          sentimentScore: Math.round(sentimentScore),
          buyingScore: Math.round(buyingSignalScore),
          msgCount: messageCount,
          responseRate: Math.round(responseRate * 100),
          daysInactive: daysSinceLastInteraction,
          hasBooking,
          hasContact: !!(leadData.email || leadData.phone),
          multiChannel: activeChannels >= 2,
          hasWebsite,
          hasAiSystems,
          urgencyLevel,
          monthlyLeads,
          websiteLive,
        }
      }
    }
  } catch (error) {
    console.error('Error calculating lead score:', error)
    return {
      score: 0,
      breakdown: {
        ai: 0,
        activity: 0,
        business: 0,
        readiness: 0,
        details: {
          intentScore: 0,
          sentimentScore: 0,
          buyingScore: 0,
          msgCount: 0,
          responseRate: 0,
          daysInactive: 0,
          hasBooking: false,
          hasContact: false,
          multiChannel: false,
          hasWebsite: false,
          hasAiSystems: false,
          urgencyLevel: null,
          monthlyLeads: null,
          websiteLive: false,
        }
      }
    }
  }
}
