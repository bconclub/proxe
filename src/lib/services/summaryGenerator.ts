/**
 * Summary Generator Service - GPFC 4: Live Summary Generation
 * 
 * Generates live-updating AI summaries for leads.
 * Uses Claude Haiku with full conversation context + extracted data.
 */

import { createClient } from '@/lib/supabase/client'
import { ExtractedBusinessIntel } from './contextBuilder'

// ============================================================================
// TYPES
// ============================================================================

export interface LeadSummary {
  text: string
  generatedAt: string
  updatedAt: string
  generating: boolean
  keyPoints: {
    business: string
    currentStatus: string
    goals: string
    nextAction: string
  }
}

export interface SummaryUpdateTrigger {
  type: 'new_message' | 'stage_change' | 'booking_created' | 'booking_cancelled' | 'admin_note' | 'manual'
  timestamp: string
  data?: any
}

// ============================================================================
// CONFIG
// ============================================================================

const CLAUDE_API_KEY = process.env.NEXT_PUBLIC_CLAUDE_API_KEY
const SUMMARY_CACHE_MINUTES = 5 // Don't regenerate more often than this

// ============================================================================
// SUMMARY GENERATION
// ============================================================================

/**
 * Generate AI summary for a lead
 */
export async function generateLeadSummary(
  leadId: string,
  forceRefresh: boolean = false
): Promise<LeadSummary | null> {
  const supabase = createClient()

  try {
    // Check if recently generated
    if (!forceRefresh) {
      const { data: existing } = await supabase
        .from('all_leads')
        .select('unified_context')
        .eq('id', leadId)
        .single()

      const cached = existing?.unified_context?.ai_summary
      if (cached?.generatedAt) {
        const generatedAt = new Date(cached.generatedAt)
        const cacheExpiry = new Date(Date.now() - SUMMARY_CACHE_MINUTES * 60 * 1000)
        if (generatedAt > cacheExpiry) {
          return {
            ...cached,
            generating: false,
          }
        }
      }
    }

    // Fetch lead data
    const { data: lead } = await supabase
      .from('all_leads')
      .select('*')
      .eq('id', leadId)
      .single()

    if (!lead) return null

    const ctx = lead.unified_context || {}

    // Fetch conversation history
    const { data: conversations } = await supabase
      .from('conversations')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: true })
      .limit(50)

    // Fetch recent tasks
    const { data: tasks } = await supabase
      .from('agent_tasks')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(10)

    // Build context for AI
    const conversationText = (conversations || [])
      .map(m => `${m.sender === 'customer' ? 'Lead' : 'Agent'}: ${m.content}`)
      .join('\n')

    // Extracted intel
    const intel: ExtractedBusinessIntel = ctx.extracted_intel || {}

    // Generate summary
    const summary = await generateWithAI({
      leadName: lead.customer_name,
      businessName: intel.business_name,
      businessType: intel.business_type,
      painPoints: intel.pain_points,
      serviceInterests: intel.service_interests,
      decisionTimeline: intel.decision_timeline,
      bookingDate: lead.booking_date,
      bookingTime: lead.booking_time,
      leadStage: lead.lead_stage,
      leadScore: lead.lead_score,
      responseCount: lead.response_count,
      conversationText,
      recentTasks: (tasks || []).map(t => ({
        type: t.task_type,
        status: t.status,
        scheduledAt: t.scheduled_at,
      })),
    })

    if (!summary) return null

    // Structure the summary
    const leadSummary: LeadSummary = {
      text: summary.text,
      generatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      generating: false,
      keyPoints: summary.keyPoints,
    }

    // Update lead record
    await supabase
      .from('all_leads')
      .update({
        unified_context: {
          ...ctx,
          ai_summary: leadSummary,
          summary: summary.text, // For backward compatibility
        },
      })
      .eq('id', leadId)

    return leadSummary
  } catch (error) {
    console.error('[SummaryGenerator] Failed to generate summary:', error)
    return null
  }
}

/**
 * Generate summary using Claude Haiku
 */
async function generateWithAI(context: {
  leadName: string
  businessName?: string
  businessType?: string
  painPoints?: string[]
  serviceInterests?: string[]
  decisionTimeline?: string
  bookingDate?: string
  bookingTime?: string
  leadStage: string
  leadScore: number
  responseCount: number
  conversationText: string
  recentTasks: any[]
}): Promise<{ text: string; keyPoints: LeadSummary['keyPoints'] } | null> {
  if (!CLAUDE_API_KEY) return null

  const systemPrompt = `You are a lead intelligence assistant. Write a concise, business-focused summary of a sales lead.

Write in plain text (no markdown). Max 3-4 sentences. Focus on:
- Who they are (name, business)
- What they want/need
- Current status (stage, booking, etc.)
- Suggested next action

Format example:
"Rajkumar runs Vips Paramedical College (Education) with 200 students but wants to scale to 1000 seats. Discussed AI chatbot for lead qualification and WhatsApp automation. Booked for Mar 4 at 2 PM for demo. Next: Send 24h reminder and confirm attendance."`

  const userPrompt = `Lead: ${context.leadName}
Business: ${context.businessName || 'Not identified'}
Type: ${context.businessType || 'Unknown'}
Stage: ${context.leadStage}
Score: ${context.leadScore}/100
Responses: ${context.responseCount}
${context.bookingDate ? `Booking: ${context.bookingDate} at ${context.bookingTime || 'TBD'}` : 'No booking scheduled'}
${context.painPoints?.length ? `Pain points: ${context.painPoints.join(', ')}` : ''}
${context.serviceInterests?.length ? `Interested in: ${context.serviceInterests.join(', ')}` : ''}
${context.decisionTimeline ? `Timeline: ${context.decisionTimeline}` : ''}

Recent conversation:
${context.conversationText.slice(-1000)} // Last 1000 chars

Write a 3-4 sentence summary.`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 200,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!response.ok) {
      console.error('[SummaryGenerator] Claude API error:', response.status)
      return null
    }

    const data = await response.json()
    const text = data.content?.[0]?.text?.trim()

    if (!text) return null

    // Parse key points from the text
    const keyPoints = extractKeyPoints(text, context)

    return { text, keyPoints }
  } catch (error) {
    console.error('[SummaryGenerator] AI generation failed:', error)
    return null
  }
}

/**
 * Extract structured key points from summary text
 */
function extractKeyPoints(
  text: string,
  context: any
): LeadSummary['keyPoints'] {
  // Simple extraction - can be enhanced with AI
  return {
    business: context.businessName || context.leadName,
    currentStatus: context.leadStage,
    goals: context.serviceInterests?.[0] || 'Not specified',
    nextAction: context.bookingDate 
      ? `Confirm booking for ${context.bookingDate}`
      : 'Follow up to schedule',
  }
}

/**
 * Trigger summary update after significant event
 */
export async function triggerSummaryUpdate(
  leadId: string,
  trigger: SummaryUpdateTrigger
): Promise<void> {
  // Debounce: wait 5 seconds then generate
  setTimeout(async () => {
    try {
      await generateLeadSummary(leadId, true)
    } catch (error) {
      console.error('[SummaryGenerator] Background update failed:', error)
    }
  }, 5000)
}

/**
 * Get summary with generation status
 */
export async function getLeadSummary(leadId: string): Promise<LeadSummary | null> {
  const supabase = createClient()

  try {
    const { data: lead } = await supabase
      .from('all_leads')
      .select('unified_context')
      .eq('id', leadId)
      .single()

    if (!lead) return null

    const summary = lead.unified_context?.ai_summary
    if (!summary) {
      // Trigger generation if none exists
      generateLeadSummary(leadId)
      return {
        text: '',
        generatedAt: '',
        updatedAt: '',
        generating: true,
        keyPoints: {
          business: '',
          currentStatus: '',
          goals: '',
          nextAction: '',
        },
      }
    }

    return summary
  } catch (error) {
    console.error('[SummaryGenerator] Failed to get summary:', error)
    return null
  }
}

/**
 * Refresh summary manually
 */
export async function refreshSummary(leadId: string): Promise<LeadSummary | null> {
  return generateLeadSummary(leadId, true)
}
