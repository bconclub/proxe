import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// In-memory cache for metrics (30 seconds TTL)
interface CachedMetrics {
  data: any
  timestamp: number
  hotLeadThreshold: number
}

let metricsCache: CachedMetrics | null = null
const CACHE_TTL = 30000 // 30 seconds in milliseconds

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const hotLeadThreshold = parseInt(searchParams.get('hotLeadThreshold') || '70', 10)
    
    // Check cache
    const now = Date.now()
    if (
      metricsCache &&
      metricsCache.hotLeadThreshold === hotLeadThreshold &&
      (now - metricsCache.timestamp) < CACHE_TTL
    ) {
      // Return cached data
      return NextResponse.json(metricsCache.data, {
        headers: {
          'X-Cache': 'HIT',
          'Cache-Control': 'private, max-age=30',
        },
      })
    }

    // Cache miss - proceed with database queries
    const supabase = await createClient()
    
    // Get all leads with full data (booking_date/booking_time don't exist in all_leads)
    const { data: leads, error: leadsError } = await supabase
      .from('all_leads')
      .select('id, customer_name, email, phone, lead_score, lead_stage, last_interaction_at, unified_context, created_at, first_touchpoint, last_touchpoint')
      .order('lead_score', { ascending: false })
    
    // Get booking data from all session tables
    const { data: whatsappSessions } = await supabase
      .from('whatsapp_sessions')
      .select('lead_id, booking_date, booking_time')
    
    const { data: webSessions } = await supabase
      .from('web_sessions')
      .select('lead_id, booking_date, booking_time')
    
    // Get session data for conversation counting (with message_count and created_at)
    const { data: webSessionsForConversations } = await supabase
      .from('web_sessions')
      .select('id, created_at, message_count')
      .gte('message_count', 1)
    
    const { data: whatsappSessionsForConversations } = await supabase
      .from('whatsapp_sessions')
      .select('id, created_at, message_count')
      .gte('message_count', 1)
    
    const { data: voiceSessions } = await supabase
      .from('voice_sessions')
      .select('lead_id, booking_date, booking_time')
    
    const { data: socialSessions } = await supabase
      .from('social_sessions')
      .select('lead_id, booking_date, booking_time')
    
    // Create a map of lead_id -> booking data from all channels
    const sessionBookings: Record<string, { date: string | null; time: string | null }> = {}
    
    const addBookings = (sessions: any[]) => {
      sessions?.forEach((session: any) => {
        if (session.lead_id && (session.booking_date || session.booking_time)) {
          // Keep the first booking found, or update if this one has both date and time
          if (!sessionBookings[session.lead_id] || (!sessionBookings[session.lead_id].date && session.booking_date)) {
            sessionBookings[session.lead_id] = {
              date: session.booking_date || sessionBookings[session.lead_id]?.date || null,
              time: session.booking_time || sessionBookings[session.lead_id]?.time || null,
            }
          }
        }
      })
    }
    
    addBookings(whatsappSessions || [])
    addBookings(webSessions || [])
    addBookings(voiceSessions || [])
    addBookings(socialSessions || [])

    if (leadsError) {
      console.error('Error fetching leads:', leadsError)
      return NextResponse.json(
        { error: 'Failed to fetch leads', details: leadsError.message },
        { status: 500 }
      )
    }
    
    // Ensure leads is an array
    const safeLeads = leads || []

    // Get messages for response time calculation
    // Try conversations first, fallback to messages
    let messages: any[] = []
    const { data: conversationsData, error: conversationsError } = await supabase
      .from('conversations')
      .select('lead_id, sender, created_at, metadata, channel')
      .order('created_at', { ascending: true })
    
    if (conversationsError) {
      console.warn('Error fetching conversations, trying messages table:', conversationsError)
      // Fallback to messages table if conversations doesn't exist
      const { data: messagesData, error: messagesError } = await supabase
        .from('messages')
        .select('lead_id, sender, created_at, metadata, channel')
        .order('created_at', { ascending: true })
      
      if (messagesError) {
        console.warn('Error fetching messages:', messagesError)
        messages = []
      } else {
        messages = messagesData || []
      }
    } else {
      messages = conversationsData || []
    }

    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date(now)
    todayEnd.setHours(23, 59, 59, 999)
    const todayStartStr = todayStart.toISOString().split('T')[0]
    const staleThreshold = new Date(now.getTime() - 48 * 60 * 60 * 1000) // 48 hours ago

    // Helper function to get booking data from multiple sources
    const getBookingData = (lead: any) => {
      const unifiedContext = lead.unified_context || {}
      const webBooking = unifiedContext?.web?.booking || {}
      const whatsappBooking = unifiedContext?.whatsapp?.booking || {}
      const voiceBooking = unifiedContext?.voice?.booking || {}
      const socialBooking = unifiedContext?.social?.booking || {}
      const sessionBooking = sessionBookings[lead.id]
      
      // Check unified_context for booking_date directly (not nested in booking object)
      const bookingDate = 
        unifiedContext?.web?.booking_date ||
        unifiedContext?.whatsapp?.booking_date ||
        unifiedContext?.voice?.booking_date ||
        unifiedContext?.social?.booking_date ||
        webBooking?.date || 
        webBooking?.booking_date ||
        whatsappBooking?.date ||
        whatsappBooking?.booking_date ||
        voiceBooking?.date ||
        voiceBooking?.booking_date ||
        socialBooking?.date ||
        socialBooking?.booking_date ||
        sessionBooking?.date ||
        null
      
      const bookingTime = 
        unifiedContext?.web?.booking_time ||
        unifiedContext?.whatsapp?.booking_time ||
        unifiedContext?.voice?.booking_time ||
        unifiedContext?.social?.booking_time ||
        webBooking?.time || 
        webBooking?.booking_time ||
        whatsappBooking?.time ||
        whatsappBooking?.booking_time ||
        voiceBooking?.time ||
        voiceBooking?.booking_time ||
        socialBooking?.time ||
        socialBooking?.booking_time ||
        sessionBooking?.time ||
        null
      
      return { bookingDate, bookingTime }
    }

    // Calculate date ranges for conversation counts (reuse existing 'now' variable)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const previous7DaysStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
    
    // ============================================================================
    // TOTAL CONVERSATIONS: Count unique sessions with user engagement
    // ============================================================================
    // Count criteria:
    // 1. Unique session (web_sessions OR whatsapp_sessions)
    // 2. Has at least 1 customer message (message_count >= 1)
    // 3. Each session counted once
    //
    // Query logic:
    // - Web conversations: COUNT(DISTINCT id) FROM web_sessions WHERE message_count >= 1
    // - WhatsApp conversations: COUNT(DISTINCT id) FROM whatsapp_sessions WHERE message_count >= 1
    // - Total = sum of both
    //
    // Don't count:
    // - Empty sessions (no user messages)
    // - Duplicate sessions
    //
    // Do count:
    // - Quick action button click (first interaction)
    // - Any user-initiated message
    // - One per session
    
    const safeWebSessions = webSessionsForConversations || []
    const safeWhatsappSessions = whatsappSessionsForConversations || []
    
    // Helper function to count unique sessions within a date range
    const countSessionsInRange = (sessions: any[], startDate: Date, endDate?: Date) => {
      return sessions.filter(session => {
        if (!session?.created_at) return false
        const sessionDate = new Date(session.created_at)
        if (endDate) {
          return sessionDate >= startDate && sessionDate < endDate
        }
        return sessionDate >= startDate
      }).length
    }
    
    // Count unique sessions by period (7D, 14D, 30D)
    const webConversations7D = countSessionsInRange(safeWebSessions, sevenDaysAgo)
    const whatsappConversations7D = countSessionsInRange(safeWhatsappSessions, sevenDaysAgo)
    const uniqueConversations7D = webConversations7D + whatsappConversations7D
    
    const webConversations14D = countSessionsInRange(safeWebSessions, fourteenDaysAgo)
    const whatsappConversations14D = countSessionsInRange(safeWhatsappSessions, fourteenDaysAgo)
    const uniqueConversations14D = webConversations14D + whatsappConversations14D
    
    const webConversations30D = countSessionsInRange(safeWebSessions, thirtyDaysAgo)
    const whatsappConversations30D = countSessionsInRange(safeWhatsappSessions, thirtyDaysAgo)
    const uniqueConversations30D = webConversations30D + whatsappConversations30D
    
    // Previous 7 days (for trend calculation)
    const webConversationsPrevious7D = countSessionsInRange(safeWebSessions, previous7DaysStart, sevenDaysAgo)
    const whatsappConversationsPrevious7D = countSessionsInRange(safeWhatsappSessions, previous7DaysStart, sevenDaysAgo)
    const previous7DUniqueConversations = webConversationsPrevious7D + whatsappConversationsPrevious7D
    
    // Calculate trend (percentage change from previous 7 days)
    const trend7D = previous7DUniqueConversations > 0 
      ? Math.round(((uniqueConversations7D - previous7DUniqueConversations) / previous7DUniqueConversations) * 100)
      : 0
    
    // Total unique conversations (all time) = all sessions with message_count >= 1
    const totalWebConversations = safeWebSessions.length
    const totalWhatsappConversations = safeWhatsappSessions.length
    const totalUniqueConversations = totalWebConversations + totalWhatsappConversations
    
    // Total leads count
    const totalLeadsCount = safeLeads.length
    
    // Use the unique session-based conversation counts
    const conversations7D = uniqueConversations7D
    const conversations14D = uniqueConversations14D
    const conversations30D = uniqueConversations30D
    const totalConversationsCount = totalUniqueConversations
    
    // Debug logging for conversation counts
    console.log('📊 Total Conversations Calculation (Session-based):')
    console.log(`  - Web sessions with engagement (message_count >= 1): ${totalWebConversations}`)
    console.log(`  - WhatsApp sessions with engagement (message_count >= 1): ${totalWhatsappConversations}`)
    console.log(`  - Total unique conversations: ${totalUniqueConversations}`)
    console.log(`  - 7D: ${conversations7D} (Web: ${webConversations7D}, WhatsApp: ${whatsappConversations7D})`)
    console.log(`  - 14D: ${conversations14D} (Web: ${webConversations14D}, WhatsApp: ${whatsappConversations14D})`)
    console.log(`  - 30D: ${conversations30D} (Web: ${webConversations30D}, WhatsApp: ${whatsappConversations30D})`)
    console.log(`  - Previous 7D: ${previous7DUniqueConversations} (for trend: ${trend7D}%)`)

    // 1. Hot Leads (score >= threshold, default 70)
    const hotLeadThreshold = parseInt(searchParams.get('hotLeadThreshold') || '70', 10)
    const hotLeads = safeLeads.filter(lead => (lead.lead_score || 0) >= hotLeadThreshold)

    // 2. Today's Activity
    const todayMessages = messages?.filter(msg => {
      const msgDate = new Date(msg.created_at)
      return msgDate >= todayStart && msgDate <= todayEnd
    }) || []
    
    const todayBookings = safeLeads.filter(lead => {
      const { bookingDate } = getBookingData(lead)
      return bookingDate && bookingDate.startsWith(todayStartStr)
    })
    
    const todayNewLeads = safeLeads.filter(lead => {
      const createdDate = new Date(lead.created_at)
      return createdDate >= todayStart && createdDate <= todayEnd
    })

    // 3. Response Health (avg response time in seconds)
    // Calculate from conversations table using input_to_output_gap_ms
    // Filter: channel IN ('web', 'whatsapp') AND sender = 'agent'
    // SQL equivalent: SELECT AVG((metadata->>'input_to_output_gap_ms')::numeric / 1000) as avg_response_seconds
    //                 FROM conversations
    //                 WHERE channel IN ('web', 'whatsapp') AND sender = 'agent'
    //                 AND metadata->>'input_to_output_gap_ms' IS NOT NULL
    let avgResponseTimeSeconds = 0
    
    try {
      const { data: conversationsForResponse, error: convError } = await supabase
        .from('conversations')
        .select('metadata')
        .in('channel', ['web', 'whatsapp'])
        .eq('sender', 'agent')
        .not('metadata->input_to_output_gap_ms', 'is', null)
      
      if (!convError && conversationsForResponse && conversationsForResponse.length > 0) {
        let totalGapMs = 0
        let validCount = 0
        
        conversationsForResponse.forEach((conv: any) => {
          const gapMs = conv.metadata?.input_to_output_gap_ms
          if (gapMs !== null && gapMs !== undefined) {
            const gapMsNum = typeof gapMs === 'number' ? gapMs : parseFloat(gapMs)
            if (!isNaN(gapMsNum) && gapMsNum > 0) {
              totalGapMs += gapMsNum
              validCount++
            }
          }
        })
        
        if (validCount > 0) {
          avgResponseTimeSeconds = (totalGapMs / validCount) / 1000 // Convert ms to seconds
        }
      } else if (convError) {
        console.warn('Error fetching conversations for response time:', convError)
      }
    } catch (error) {
      console.warn('Error calculating avg response time:', error)
    }

    // 5. Leads Needing Attention (high score, recent interaction)
    const leadsNeedingAttention = safeLeads
      .filter(lead => {
        const score = lead.lead_score || 0
        const lastInteraction = lead.last_interaction_at ? new Date(lead.last_interaction_at) : null
        const daysSinceInteraction = lastInteraction 
          ? (now.getTime() - lastInteraction.getTime()) / (1000 * 60 * 60 * 24)
          : 999
        
        return score > 50 && daysSinceInteraction < 7
      })
      .slice(0, 5)
      .map(lead => ({
        id: lead.id,
        name: lead.customer_name || 'Unknown',
        score: lead.lead_score || 0,
        lastContact: lead.last_interaction_at || lead.created_at,
        stage: lead.lead_stage || 'New',
      }))

    // 6. Upcoming Bookings (next 3)
    const upcomingBookings = safeLeads
      .map(lead => {
        const { bookingDate, bookingTime } = getBookingData(lead)
        return { lead, bookingDate, bookingTime }
      })
      .filter(({ bookingDate }) => {
        if (!bookingDate) return false
        try {
          const bookingDateTime = new Date(`${bookingDate}T12:00:00`)
          return bookingDateTime >= now && !isNaN(bookingDateTime.getTime())
        } catch {
          return false
        }
      })
      .sort((a, b) => {
        try {
          const dateA = new Date(`${a.bookingDate}T${a.bookingTime || '12:00:00'}`)
          const dateB = new Date(`${b.bookingDate}T${b.bookingTime || '12:00:00'}`)
          return dateA.getTime() - dateB.getTime()
        } catch {
          return 0
        }
      })
      .slice(0, 3)
      .map(({ lead, bookingDate, bookingTime }) => ({
        id: lead.id,
        name: lead.customer_name || 'Unknown',
        date: bookingDate,
        time: bookingTime,
        datetime: new Date(`${bookingDate}T${bookingTime || '12:00:00'}`).toISOString(),
      }))

    // 7. Stale Leads (>48h no response)
    const staleLeads = safeLeads.filter(lead => {
      const lastInteraction = lead.last_interaction_at ? new Date(lead.last_interaction_at) : new Date(lead.created_at)
      return lastInteraction < staleThreshold
    })

    // 8. Lead Flow (funnel)
    const leadFlow = {
      new: safeLeads.filter(l => !l.lead_stage || l.lead_stage === 'New').length,
      engaged: safeLeads.filter(l => l.lead_stage === 'Engaged').length,
      qualified: safeLeads.filter(l => l.lead_stage === 'Qualified').length,
      booked: safeLeads.filter(l => {
        if (l.lead_stage === 'Booking Made') return true
        const { bookingDate } = getBookingData(l)
        return !!bookingDate
      }).length,
    }

    // 9. Channel Performance
    const channelPerformance = {
      web: {
        total: safeLeads.filter(l => l.first_touchpoint === 'web' || l.last_touchpoint === 'web').length,
        booked: safeLeads.filter(l => {
          if (l.first_touchpoint !== 'web' && l.last_touchpoint !== 'web') return false
          const { bookingDate } = getBookingData(l)
          return !!bookingDate
        }).length,
      },
      whatsapp: {
        total: safeLeads.filter(l => l.first_touchpoint === 'whatsapp' || l.last_touchpoint === 'whatsapp').length,
        booked: safeLeads.filter(l => {
          if (l.first_touchpoint !== 'whatsapp' && l.last_touchpoint !== 'whatsapp') return false
          const { bookingDate } = getBookingData(l)
          return !!bookingDate
        }).length,
      },
      voice: {
        total: safeLeads.filter(l => l.first_touchpoint === 'voice' || l.last_touchpoint === 'voice').length,
        booked: safeLeads.filter(l => {
          if (l.first_touchpoint !== 'voice' && l.last_touchpoint !== 'voice') return false
          const { bookingDate } = getBookingData(l)
          return !!bookingDate
        }).length,
      },
    }

    // 10. Score Distribution
    const scoreDistribution = {
      hot: safeLeads.filter(l => (l.lead_score || 0) >= hotLeadThreshold).length,
      warm: safeLeads.filter(l => (l.lead_score || 0) >= 40 && (l.lead_score || 0) < 70).length,
      cold: safeLeads.filter(l => (l.lead_score || 0) < 40).length,
    }

    // 11. Recent Activity - Key Business Events Only
    const keyEvents: Array<{
      id: string
      leadId: string
      leadName: string
      eventType: string
      timestamp: string
      content: string
      channel: string
      metadata?: any
    }> = []

    // Get stage changes from stage_history
    const { data: stageChanges } = await supabase
      .from('stage_history')
      .select('lead_id, old_stage, new_stage, score_at_change, changed_at, changed_by')
      .order('changed_at', { ascending: false })
      .limit(50)

    stageChanges?.forEach((change: any) => {
      const lead = safeLeads.find(l => l.id === change.lead_id)
      if (lead && change.old_stage && change.old_stage !== change.new_stage) {
        keyEvents.push({
          id: `stage-${change.lead_id}-${change.changed_at}`,
          leadId: change.lead_id,
          leadName: lead.customer_name || 'Unknown',
          eventType: 'stage_change',
          timestamp: change.changed_at,
          content: `${lead.customer_name || 'Unknown'} entered ${change.new_stage} stage${change.old_stage ? ` (from ${change.old_stage})` : ''}`,
          channel: lead.first_touchpoint || lead.last_touchpoint || 'web',
          metadata: { oldStage: change.old_stage, newStage: change.new_stage, score: change.score_at_change },
        })
      }
    })

    // Get booking events from web_sessions and whatsapp_sessions
    const { data: webBookingSessions } = await supabase
      .from('web_sessions')
      .select('lead_id, booking_date, booking_time, booking_status, booking_created_at, customer_name')
      .not('booking_date', 'is', null)
      .order('booking_created_at', { ascending: false })
      .limit(20)

    webBookingSessions?.forEach((session: any) => {
      const lead = safeLeads.find(l => l.id === session.lead_id)
      const leadName = session.customer_name || lead?.customer_name || 'Unknown'
      const eventType = session.booking_status === 'cancelled' ? 'booking_cancelled' : 'booking_made'
      
      keyEvents.push({
        id: `booking-web-${session.lead_id}-${session.booking_created_at}`,
        leadId: session.lead_id,
        leadName,
        eventType,
        timestamp: session.booking_created_at || session.updated_at,
        content: eventType === 'booking_cancelled' 
          ? `${leadName} cancelled their booking`
          : `${leadName} booked a call${session.booking_date ? ` for ${new Date(session.booking_date).toLocaleDateString()}` : ''}`,
        channel: 'web',
        metadata: { bookingDate: session.booking_date, bookingTime: session.booking_time, status: session.booking_status },
      })
    })

    const { data: whatsappBookingSessions } = await supabase
      .from('whatsapp_sessions')
      .select('lead_id, booking_date, booking_time, booking_status, booking_created_at, customer_name')
      .not('booking_date', 'is', null)
      .order('booking_created_at', { ascending: false })
      .limit(20)

    whatsappBookingSessions?.forEach((session: any) => {
      const lead = safeLeads.find(l => l.id === session.lead_id)
      const leadName = session.customer_name || lead?.customer_name || 'Unknown'
      const eventType = session.booking_status === 'cancelled' ? 'booking_cancelled' : 'booking_made'
      
      keyEvents.push({
        id: `booking-whatsapp-${session.lead_id}-${session.booking_created_at}`,
        leadId: session.lead_id,
        leadName,
        eventType,
        timestamp: session.booking_created_at || session.updated_at,
        content: eventType === 'booking_cancelled'
          ? `${leadName} cancelled their booking`
          : `${leadName} booked a call${session.booking_date ? ` for ${new Date(session.booking_date).toLocaleDateString()}` : ''}`,
        channel: 'whatsapp',
        metadata: { bookingDate: session.booking_date, bookingTime: session.booking_time, status: session.booking_status },
      })
    })

    // Detect new hot leads (score >= threshold) and significant score changes
    // Check if lead became hot recently (within last 7 days)
    const recentHotLeads = safeLeads.filter(lead => {
      const score = lead.lead_score || 0
      if (score < hotLeadThreshold) return false
      const lastInteraction = lead.last_interaction_at ? new Date(lead.last_interaction_at) : new Date(lead.created_at)
      const daysAgo = (now.getTime() - lastInteraction.getTime()) / (1000 * 60 * 60 * 24)
      return daysAgo <= 7
    })

    // Track score changes from stage_history (compare consecutive entries)
    const scoreChanges: Record<string, { oldScore: number; newScore: number; timestamp: string }> = {}
    stageChanges?.forEach((change: any, index: number) => {
      if (change.score_at_change && index < stageChanges.length - 1) {
        const prevChange = stageChanges[index + 1]
        if (prevChange.lead_id === change.lead_id && prevChange.score_at_change) {
          const scoreDiff = change.score_at_change - prevChange.score_at_change
          if (Math.abs(scoreDiff) >= 20) {
            scoreChanges[change.lead_id] = {
              oldScore: prevChange.score_at_change,
              newScore: change.score_at_change,
              timestamp: change.changed_at,
            }
          }
        }
      }
    })

    // Add score change events
    Object.entries(scoreChanges).forEach(([leadId, change]) => {
      const lead = safeLeads.find(l => l.id === leadId)
      if (lead) {
        const scoreIncrease = change.newScore - change.oldScore
        keyEvents.push({
          id: `score-change-${leadId}-${change.timestamp}`,
          leadId,
          leadName: lead.customer_name || 'Unknown',
          eventType: 'score_change',
          timestamp: change.timestamp,
          content: `${lead.customer_name || 'Unknown'}'s score ${scoreIncrease > 0 ? 'jumped' : 'dropped'} ${Math.abs(scoreIncrease)} points (${change.oldScore} → ${change.newScore})`,
          channel: lead.first_touchpoint || lead.last_touchpoint || 'web',
          metadata: { oldScore: change.oldScore, newScore: change.newScore, increase: scoreIncrease },
        })
      }
    })

    // Detect new hot leads (score >= threshold) - show if recently became hot
    recentHotLeads.forEach(lead => {
      // Check if this lead recently became hot (has a recent stage change to hot stage or score >= threshold)
      const recentStageChange = stageChanges?.find((sc: any) => 
        sc.lead_id === lead.id && 
        new Date(sc.changed_at) >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) &&
        (sc.new_stage === 'High Intent' || sc.new_stage === 'Booking Made' || (sc.score_at_change && sc.score_at_change >= hotLeadThreshold))
      )

      // Only show if it's a new hot lead (not already tracked as score change)
      if (recentStageChange && !scoreChanges[lead.id]) {
        keyEvents.push({
          id: `hot-lead-${lead.id}-${lead.last_interaction_at}`,
          leadId: lead.id,
          leadName: lead.customer_name || 'Unknown',
          eventType: 'hot_lead',
          timestamp: lead.last_interaction_at || lead.created_at,
          content: `${lead.customer_name || 'Unknown'} became a hot lead (score: ${lead.lead_score})`,
          channel: lead.first_touchpoint || lead.last_touchpoint || 'web',
          metadata: { score: lead.lead_score },
        })
      }
    })

    // Detect multi-channel touchpoints
    const multiChannelLeads = safeLeads.filter(lead => 
      lead.first_touchpoint && 
      lead.last_touchpoint && 
      lead.first_touchpoint !== lead.last_touchpoint
    )

    multiChannelLeads.forEach(lead => {
      if (lead.last_interaction_at) {
        const lastInteraction = new Date(lead.last_interaction_at)
        const daysAgo = (now.getTime() - lastInteraction.getTime()) / (1000 * 60 * 60 * 24)
        if (daysAgo <= 7) {
          keyEvents.push({
            id: `multichannel-${lead.id}-${lead.last_interaction_at}`,
            leadId: lead.id,
            leadName: lead.customer_name || 'Unknown',
            eventType: 'multichannel',
            timestamp: lead.last_interaction_at,
            content: `${lead.customer_name || 'Unknown'} engaged via ${lead.last_touchpoint} (also uses ${lead.first_touchpoint})`,
            channel: lead.last_touchpoint,
            metadata: { firstTouchpoint: lead.first_touchpoint, lastTouchpoint: lead.last_touchpoint },
          })
        }
      }
    })

    // Detect leads going cold (>48h inactive)
    staleLeads.forEach(lead => {
      const lastInteraction = lead.last_interaction_at ? new Date(lead.last_interaction_at) : new Date(lead.created_at)
      const hoursAgo = (now.getTime() - lastInteraction.getTime()) / (1000 * 60 * 60)
      // Only show if went cold recently (within last 7 days)
      if (hoursAgo >= 48 && hoursAgo <= 168) {
        keyEvents.push({
          id: `cold-${lead.id}-${lead.last_interaction_at}`,
          leadId: lead.id,
          leadName: lead.customer_name || 'Unknown',
          eventType: 'went_cold',
          timestamp: lead.last_interaction_at || lead.created_at,
          content: `${lead.customer_name || 'Unknown'} went cold (${Math.floor(hoursAgo / 24)} days inactive)`,
          channel: lead.first_touchpoint || lead.last_touchpoint || 'web',
          metadata: { daysInactive: Math.floor(hoursAgo / 24) },
        })
      }
    })

    // Get system messages with event_type metadata
    const systemMessages = messages?.filter((msg: any) => 
      msg.sender === 'system' || 
      (msg.metadata && typeof msg.metadata === 'object' && 'event_type' in msg.metadata)
    ) || []

    systemMessages.forEach((msg: any) => {
      const lead = safeLeads.find(l => l.id === msg.lead_id)
      if (lead) {
        const eventType = msg.metadata?.event_type || 'system'
        keyEvents.push({
          id: `system-${msg.lead_id}-${msg.created_at}`,
          leadId: msg.lead_id,
          leadName: lead.customer_name || 'Unknown',
          eventType,
          timestamp: msg.created_at,
          content: msg.metadata?.content || msg.content || 'System event',
          channel: msg.channel || 'web',
          metadata: msg.metadata,
        })
      }
    })

    // Sort by timestamp (most recent first) and take top 10
    const recentActivity = keyEvents
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10)
      .map(event => ({
        id: event.leadId,
        channel: event.channel,
        type: event.eventType,
        timestamp: event.timestamp,
        content: event.content,
        metadata: event.metadata,
      }))

    // 12. Quick Stats
    const channelCounts: Record<string, number> = {}
    safeLeads.forEach(lead => {
      const channel = lead.first_touchpoint || lead.last_touchpoint || 'unknown'
      channelCounts[channel] = (channelCounts[channel] || 0) + 1
    })
    const bestChannel = Object.entries(channelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'web'

    // Busiest hour (from messages)
    const hourCounts: Record<number, number> = {}
    messages?.forEach(msg => {
      const hour = new Date(msg.created_at).getHours()
      hourCounts[hour] = (hourCounts[hour] || 0) + 1
    })
    const busiestHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 14
    const busiestHourFormatted = `${busiestHour}:00`

    // 13. Trend Data (7 days for sparklines)
    const leadTrend = []
    const bookingTrend = []
    const conversationTrend = [] // Daily unique conversations
    const hotLeadsTrend = [] // Daily hot leads count
    const responseTimeTrend = []
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now)
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split('T')[0]
      
      // Leads trend
      const dayLeads = safeLeads.filter(l => {
        const created = new Date(l.created_at).toISOString().split('T')[0]
        return created === dateStr
      }).length
      leadTrend.push({ value: dayLeads })
      
      // Bookings trend
      const dayBookings = safeLeads.filter(l => {
        const { bookingDate } = getBookingData(l)
        return bookingDate && bookingDate.startsWith(dateStr)
      }).length
      bookingTrend.push({ value: dayBookings })
      
      // Conversations trend (unique sessions with engagement per day)
      // Count sessions created on this day with message_count >= 1
      const dayWebSessions = safeWebSessions.filter(session => {
        if (!session?.created_at) return false
        const sessionDate = new Date(session.created_at).toISOString().split('T')[0]
        return sessionDate === dateStr
      }).length
      
      const dayWhatsappSessions = safeWhatsappSessions.filter(session => {
        if (!session?.created_at) return false
        const sessionDate = new Date(session.created_at).toISOString().split('T')[0]
        return sessionDate === dateStr
      }).length
      
      const dayUniqueConversations = dayWebSessions + dayWhatsappSessions
      conversationTrend.push({ value: dayUniqueConversations })
      
      // Hot leads trend (leads with score >= threshold per day)
      const dayHotLeads = safeLeads.filter(l => {
        const lastInteraction = l.last_interaction_at ? new Date(l.last_interaction_at) : new Date(l.created_at)
        const interactionDate = lastInteraction.toISOString().split('T')[0]
        return interactionDate === dateStr && (l.lead_score || 0) >= hotLeadThreshold
      }).length
      hotLeadsTrend.push({ value: dayHotLeads })
      
      // Response time trend (daily average)
      // Use input_to_output_gap_ms from conversations table
      const dayMessages = messages?.filter(m => {
        const msgDate = new Date(m.created_at).toISOString().split('T')[0]
        return msgDate === dateStr && 
               m.sender === 'agent' && 
               (m.channel === 'web' || m.channel === 'whatsapp')
      }) || []
      
      let dayTotalResponse = 0
      let dayResponseCount = 0
      dayMessages.forEach((msg: any) => {
        if (msg.metadata?.input_to_output_gap_ms) {
          const gapMs = typeof msg.metadata.input_to_output_gap_ms === 'number' 
            ? msg.metadata.input_to_output_gap_ms 
            : parseFloat(msg.metadata.input_to_output_gap_ms)
          if (!isNaN(gapMs) && gapMs > 0) {
            dayTotalResponse += gapMs / 1000 // Convert ms to seconds
            dayResponseCount++
          }
        }
      })
      const dayAvgResponse = dayResponseCount > 0 ? dayTotalResponse / dayResponseCount : 0
      responseTimeTrend.push({ value: dayAvgResponse })
    }
    
    // Calculate % changes
    const leadChange = leadTrend.length >= 2 
      ? Math.round(((leadTrend[leadTrend.length - 1].value - leadTrend[0].value) / Math.max(leadTrend[0].value, 1)) * 100)
      : 0
    const bookingChange = bookingTrend.length >= 2
      ? Math.round(((bookingTrend[bookingTrend.length - 1].value - bookingTrend[0].value) / Math.max(bookingTrend[0].value, 1)) * 100)
      : 0
    const responseTimeChange = responseTimeTrend.length >= 2
      ? Math.round(((responseTimeTrend[0].value - responseTimeTrend[responseTimeTrend.length - 1].value) / Math.max(responseTimeTrend[0].value, 1)) * 100)
      : 0

    // 14. 24-hour activity for sparkline
    const hourlyActivity = []
    for (let i = 23; i >= 0; i--) {
      const hourDate = new Date(now)
      hourDate.setHours(i, 0, 0, 0)
      const hourEnd = new Date(hourDate)
      hourEnd.setHours(i, 59, 59, 999)
      
      const hourMessages = messages?.filter(m => {
        const msgDate = new Date(m.created_at)
        return msgDate >= hourDate && msgDate <= hourEnd
      }).length || 0
      
      hourlyActivity.push({ time: `${i}:00`, value: hourMessages })
    }

    // 15. Channel distribution for donut
    const channelDistribution = Object.entries(channelCounts).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
    }))

    // 16. Hour heatmap data
    const heatmapData = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      value: hourCounts[i] || 0,
    }))

    // ============================================================================
    // 17. "AT A GLANCE" METRICS - Radial Chart Calculations
    // ============================================================================
    // These four metrics appear in the "At a Glance" section of the dashboard
    // and are displayed as radial/progress charts showing percentages.
    
    // ----------------------------------------------------------------------------
    // 1. AVG SCORE (0-100%)
    // ----------------------------------------------------------------------------
    // Formula: Average of all lead scores across all leads
    // Calculation: Sum of all lead scores / Total number of leads
    //
    // How lead score is calculated per lead (in database function calculate_lead_score):
    // - AI Analysis (60% weight):
    //   * Engagement quality (20%): Based on conversation depth and quality
    //   * Intent signals (20%): Keywords indicating buying intent (pricing, booking, urgency)
    //   * Question depth (20%): Complexity and depth of customer questions
    // - Activity (30% weight):
    //   * Response rate: How often agent responds to customer messages
    //   * Days inactive: Recency of last interaction (fresher = higher score)
    //   * Touchpoints: Number of channels used (multi-channel = bonus)
    // - Business Signals (10% weight):
    //   * Booking made: +50 points if booking exists
    //   * Re-engaged: +20 points if lead re-engaged after being inactive
    //
    // The final score is capped at 100 and stored in all_leads.lead_score
    // This metric shows the average health/quality of all leads in the system.
    const avgScore = safeLeads.length > 0
      ? Math.round(safeLeads.reduce((sum, l) => sum + (l.lead_score || 0), 0) / safeLeads.length)
      : 0
    
    // ----------------------------------------------------------------------------
    // 2. RESPONSE RATE (0-100%)
    // ----------------------------------------------------------------------------
    // Formula: (Agent replies / Customer messages) * 100
    //
    // This measures how responsive the team is to customer inquiries.
    // - Customer messages: All messages sent by customers (sender = 'customer')
    // - Agent replies: All messages sent by agents (sender = 'agent')
    //
    // Example:
    // - 100 customer messages
    // - 95 agent replies
    // - Response Rate = (95 / 100) * 100 = 95%
    //
    // A higher rate indicates better customer service responsiveness.
    // Note: This is NOT the same as "customer response rate" (how often customers reply).
    const customerMessages = messages?.filter(m => m.sender === 'customer').length || 0
    const agentReplies = messages?.filter(m => m.sender === 'agent').length || 0
    const responseRate = customerMessages > 0
      ? Math.round((agentReplies / customerMessages) * 100)
      : 0
    
    // ----------------------------------------------------------------------------
    // 3. BOOKING RATE (0-100%)
    // ----------------------------------------------------------------------------
    // Formula: (Leads with bookings / Total leads) * 100
    //
    // What counts as a booking:
    // A lead is considered to have a booking if ANY of these conditions are true:
    // 1. unified_context.web.booking_date exists
    // 2. unified_context.web.booking.date exists
    // 3. unified_context.whatsapp.booking_date exists
    // 4. unified_context.whatsapp.booking.date exists
    // 5. unified_context.voice.booking_date exists
    // 6. unified_context.voice.booking.date exists
    // 7. unified_context.social.booking_date exists
    // 8. unified_context.social.booking.date exists
    // 9. whatsapp_sessions.booking_date IS NOT NULL
    // 10. web_sessions.booking_date IS NOT NULL
    // 11. voice_sessions.booking_date IS NOT NULL
    // 12. social_sessions.booking_date IS NOT NULL
    //
    // The getBookingData() function checks all these sources in priority order.
    // This metric shows the conversion rate: what percentage of leads have made bookings.
    //
    // Example:
    // - 100 total leads
    // - 50 leads have bookings (any booking_date found in any source)
    // - Booking Rate = (50 / 100) * 100 = 50%
    const leadsWithBookings = safeLeads.filter(lead => {
      const { bookingDate } = getBookingData(lead)
      return !!bookingDate
    })
    
    const bookingRate = safeLeads.length > 0
      ? Math.round((leadsWithBookings.length / safeLeads.length) * 100)
      : 0
    
    // Conversion Rate: (leads with bookings / total unique conversations) * 100
    // This shows what percentage of conversations resulted in bookings
    // totalUniqueConversations is calculated earlier as distinct lead_ids with messages
    const conversionRate = totalUniqueConversations > 0 
      ? Math.round((leadsWithBookings.length / totalUniqueConversations) * 100)
      : 0
    
    // Debug logging for booking rate and conversion rate
    console.log('📊 Booking Rate Calculation:')
    console.log(`  - Total leads: ${safeLeads.length}`)
    console.log(`  - Leads with bookings: ${leadsWithBookings.length}`)
    console.log(`  - Booking rate: ${bookingRate}%`)
    console.log(`  - Session bookings found: ${Object.keys(sessionBookings).length}`)
    console.log('📊 Conversion Rate Calculation:')
    console.log(`  - Total unique conversations: ${totalUniqueConversations}`)
    console.log(`  - Leads with bookings: ${leadsWithBookings.length}`)
    console.log(`  - Conversion rate: ${conversionRate}% (bookings / unique conversations)`)
    console.log(`  - Sample booking sources:`, {
      fromWhatsappSessions: whatsappSessions?.filter((s: any) => s.booking_date).length || 0,
      fromWebSessions: webSessions?.filter((s: any) => s.booking_date).length || 0,
      fromVoiceSessions: voiceSessions?.filter((s: any) => s.booking_date).length || 0,
      fromSocialSessions: socialSessions?.filter((s: any) => s.booking_date).length || 0,
    })
    
    // Log a few sample leads with bookings for debugging
    if (leadsWithBookings.length > 0) {
      const sampleLeads = leadsWithBookings.slice(0, 3).map(lead => {
        const { bookingDate, bookingTime } = getBookingData(lead)
        return {
          id: lead.id,
          name: lead.customer_name,
          bookingDate,
          bookingTime,
          hasUnifiedContext: !!lead.unified_context,
        }
      })
      console.log(`  - Sample leads with bookings:`, sampleLeads)
    }
    
    // ----------------------------------------------------------------------------
    // 4. CHANNEL HEALTH (0-100%)
    // ----------------------------------------------------------------------------
    // Formula: (Active channels / Total possible channels) * 100
    //
    // How it's calculated:
    // 1. Count messages per channel from the conversations/messages table
    // 2. Identify "active channels" = channels with at least 1 message
    // 3. Total possible channels = 4 (web, whatsapp, voice, social)
    // 4. Channel Health = (active channels / 4) * 100
    //
    // What makes a channel "healthy":
    // - A channel is considered "active" if it has received at least 1 message
    // - Channel Health measures channel diversification and utilization
    // - Higher percentage = more channels are being used (better distribution)
    //
    // Examples:
    // - 4 active channels (web, whatsapp, voice, social all have messages)
    //   → Channel Health = (4 / 4) * 100 = 100%
    // - 2 active channels (only web and whatsapp have messages)
    //   → Channel Health = (2 / 4) * 100 = 50%
    // - 1 active channel (only web has messages)
    //   → Channel Health = (1 / 4) * 100 = 25%
    //
    // This metric helps identify if you're over-relying on a single channel
    // or successfully engaging customers across multiple touchpoints.
    const channelMessageCounts: Record<string, number> = {}
    const totalMessages = messages?.length || 0
    
    // Count messages per channel from conversations/messages table
    messages?.forEach(msg => {
      const channel = msg.channel || 'unknown'
      if (channel !== 'unknown') {
        channelMessageCounts[channel] = (channelMessageCounts[channel] || 0) + 1
      }
    })
    
    // Calculate 7-day trends for radial metrics (reuse existing sevenDaysAgo variable)
    
    // Get daily aggregates for last 7 days
    const dailyTrends: {
      avgScore: Array<{ date: string; value: number }>
      responseRate: Array<{ date: string; value: number }>
      bookingRate: Array<{ date: string; value: number }>
      avgResponseTime: Array<{ date: string; value: number }>
    } = {
      avgScore: [],
      responseRate: [],
      bookingRate: [],
      avgResponseTime: [],
    }

    // Calculate daily trends
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now)
      date.setDate(date.getDate() - i)
      date.setHours(0, 0, 0, 0)
      const nextDate = new Date(date)
      nextDate.setDate(nextDate.getDate() + 1)
      const dateStr = date.toISOString().split('T')[0]

      // Get leads created up to this date
      const leadsUpToDate = safeLeads.filter(l => {
        const created = new Date(l.created_at)
        return created <= nextDate
      })

      // Daily avg score
      const dailyScores = leadsUpToDate
        .filter(l => {
          const lastInteraction = l.last_interaction_at ? new Date(l.last_interaction_at) : new Date(l.created_at)
          return lastInteraction >= date && lastInteraction < nextDate
        })
        .map(l => l.lead_score || 0)
      const dailyAvgScore = dailyScores.length > 0
        ? dailyScores.reduce((sum, score) => sum + score, 0) / dailyScores.length
        : 0

      // Daily response rate (messages with agent replies)
      const dailyMessages = messages?.filter((msg: any) => {
        const msgDate = new Date(msg.created_at)
        return msgDate >= date && msgDate < nextDate
      }) || []
      const customerMessages = dailyMessages.filter((m: any) => m.sender === 'customer')
      const agentReplies = dailyMessages.filter((m: any) => m.sender === 'agent')
      const dailyResponseRate = customerMessages.length > 0
        ? (agentReplies.length / customerMessages.length) * 100
        : 0

      // Daily booking rate
      const dailyBookings = safeLeads.filter(l => {
        const { bookingDate } = getBookingData(l)
        if (!bookingDate) return false
        const booking = new Date(bookingDate)
        return booking >= date && booking < nextDate
      }).length
      const dailyBookingRate = leadsUpToDate.length > 0
        ? (dailyBookings / leadsUpToDate.length) * 100
        : 0

      // Daily avg response time
      // Use input_to_output_gap_ms from conversations table
      // Filter: channel IN ('web', 'whatsapp') AND sender = 'agent'
      const dailyAgentMessages = dailyMessages.filter((msg: any) => 
        msg.sender === 'agent' && 
        (msg.channel === 'web' || msg.channel === 'whatsapp')
      )
      
      let dailyTotalResponseTime = 0
      let dailyResponseCount = 0
      dailyAgentMessages.forEach((msg: any) => {
        if (msg.metadata?.input_to_output_gap_ms) {
          const gapMs = typeof msg.metadata.input_to_output_gap_ms === 'number'
            ? msg.metadata.input_to_output_gap_ms
            : parseFloat(msg.metadata.input_to_output_gap_ms)
          if (!isNaN(gapMs) && gapMs > 0) {
            dailyTotalResponseTime += gapMs / 1000 // Convert ms to seconds
            dailyResponseCount++
          }
        }
      })
      const dailyAvgResponseTime = dailyResponseCount > 0
        ? dailyTotalResponseTime / dailyResponseCount
        : 0

      dailyTrends.avgScore.push({ date: dateStr, value: Math.round(dailyAvgScore) })
      dailyTrends.responseRate.push({ date: dateStr, value: Math.round(dailyResponseRate) })
      dailyTrends.bookingRate.push({ date: dateStr, value: Math.round(dailyBookingRate) })
      dailyTrends.avgResponseTime.push({ date: dateStr, value: Math.round(dailyAvgResponseTime * 10) / 10 }) // Round to 1 decimal
    }

    // Prepare response data
    const responseData = {
      hotLeads: {
        count: hotLeads.length,
        leads: hotLeads.slice(0, 5).map(l => ({ id: l.id, name: l.customer_name || 'Unknown', score: l.lead_score || 0 })),
      },
      totalConversations: {
        count7D: conversations7D,
        count14D: conversations14D,
        count30D: conversations30D,
        trend7D: trend7D,
      },
      totalLeads: {
        count: totalLeadsCount,
        fromConversations: totalConversationsCount,
        conversionRate: conversionRate,
      },
      todayActivity: {
        messages: todayMessages.length,
        bookings: todayBookings.length,
        newLeads: todayNewLeads.length,
      },
      responseHealth: {
        avgSeconds: avgResponseTimeSeconds,
        status: avgResponseTimeSeconds < 5 ? 'good' : avgResponseTimeSeconds < 10 ? 'warning' : 'critical',
      },
      leadsNeedingAttention,
      upcomingBookings,
      staleLeads: {
        count: staleLeads.length,
        leads: staleLeads.slice(0, 5).map(l => ({ id: l.id, name: l.customer_name || 'Unknown' })),
      },
      leadFlow,
      channelPerformance,
      scoreDistribution,
      recentActivity,
      quickStats: {
        bestChannel,
        busiestHour: busiestHourFormatted,
        topPainPoint: 'Pricing', // TODO: Extract from summaries
      },
      trends: {
        leads: { data: leadTrend, change: leadChange },
        bookings: { data: bookingTrend, change: bookingChange },
        conversations: { data: conversationTrend, change: 0 }, // Daily unique conversations
        hotLeads: { data: hotLeadsTrend, change: 0 }, // Daily hot leads count
        responseTime: { data: responseTimeTrend, change: responseTimeChange },
      },
      // Upcoming bookings per day (next 7 days) for sparkline
      upcomingBookingsTrend: (() => {
        const upcomingTrend = []
        for (let i = 0; i < 7; i++) {
          const date = new Date(now)
          date.setDate(date.getDate() + i)
          date.setHours(0, 0, 0, 0)
          const nextDate = new Date(date)
          nextDate.setDate(nextDate.getDate() + 1)
          const dateStr = date.toISOString().split('T')[0]
          
          const dayBookings = upcomingBookings.filter(booking => {
            try {
              const bookingDate = new Date(booking.datetime)
              return bookingDate >= date && bookingDate < nextDate
            } catch {
              return false
            }
          }).length
          upcomingTrend.push({ value: dayBookings })
        }
        return upcomingTrend
      })(),
      hourlyActivity,
      channelDistribution,
      heatmapData,
      radialMetrics: {
        avgScore,
        responseRate,
        bookingRate,
        avgResponseTime: Math.round(avgResponseTimeSeconds * 10) / 10, // Round to 1 decimal (seconds)
      },
      radialTrends: {
        avgScore: dailyTrends.avgScore.map(d => ({ value: d.value })),
        responseRate: dailyTrends.responseRate.map(d => ({ value: d.value })),
        bookingRate: dailyTrends.bookingRate.map(d => ({ value: d.value })),
        avgResponseTime: dailyTrends.avgResponseTime.map(d => ({ value: d.value })),
      },
    }
    
    // Cache the response
    metricsCache = {
      data: responseData,
      timestamp: Date.now(),
      hotLeadThreshold,
    }
    
    return NextResponse.json(responseData, {
      headers: {
        'X-Cache': 'MISS',
        'Cache-Control': 'private, max-age=30',
      },
    })
  } catch (error) {
    console.error('Error fetching founder metrics:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const errorStack = error instanceof Error ? error.stack : undefined
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch metrics',
        message: errorMessage,
        stack: process.env.NODE_ENV === 'development' ? errorStack : undefined,
      },
      { status: 500 }
    )
  }
}
