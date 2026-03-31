/**
 * Context Builder Service - GPFC 1: Extract Business Intelligence
 * 
 * Extracts business intelligence from conversations and form data.
 * Stores extracted data in all_leads.unified_context JSONB.
 */

import { createClient } from '@/lib/supabase/client'

// ============================================================================
// TYPES
// ============================================================================

export interface ExtractedBusinessIntel {
  business_name?: string
  business_type?: string
  pain_points?: string[]
  service_interests?: string[]
  budget_indication?: string
  decision_timeline?: 'ASAP' | 'This month' | 'Next quarter' | 'Just researching'
  email?: string
  website_url?: string
  phone?: string
  extracted_at: string
  confidence: 'high' | 'medium' | 'low'
}

export interface ConversationMessage {
  id: string
  lead_id: string
  sender: 'customer' | 'agent'
  content: string
  created_at: string
  metadata?: Record<string, any>
}

export interface FormData {
  email?: string
  website_url?: string
  phone?: string
  business_name?: string
  business_type?: string
  [key: string]: any
}

// ============================================================================
// AI EXTRACTION
// ============================================================================

const CLAUDE_API_KEY = process.env.NEXT_PUBLIC_CLAUDE_API_KEY

/**
 * Use Claude Haiku to extract business intelligence from conversation
 */
async function extractWithAI(
  conversationHistory: ConversationMessage[],
  existingContext: Record<string, any>
): Promise<Partial<ExtractedBusinessIntel>> {
  if (!CLAUDE_API_KEY || conversationHistory.length === 0) {
    return {}
  }

  const conversationText = conversationHistory
    .map(m => `${m.sender === 'customer' ? 'Lead' : 'Agent'}: ${m.content}`)
    .join('\n\n')

  const systemPrompt = `You are a business intelligence extraction assistant. Extract structured information from sales conversations.

Extract these fields if present:
- business_name: Company/brand name (e.g., "Vips Paramedical College")
- business_type: Industry/category (e.g., "Education", "Real Estate", "Healthcare")
- pain_points: Array of specific problems mentioned
- service_interests: What they're looking for (AI solutions, automation, etc.)
- budget_indication: Any pricing/budget mentions
- decision_timeline: One of ["ASAP", "This month", "Next quarter", "Just researching"]
- email: Email address if mentioned
- website_url: Website if mentioned

Return ONLY a valid JSON object with extracted fields. Omit fields not found. Be conservative - only extract if confident.`

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
        max_tokens: 500,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Extract business intelligence from this conversation:\n\n${conversationText}`,
          },
        ],
      }),
    })

    if (!response.ok) {
      console.error('[ContextBuilder] Claude API error:', response.status)
      return {}
    }

    const data = await response.json()
    const content = data.content?.[0]?.text?.trim()
    
    if (!content) return {}

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
    
    return {}
  } catch (error) {
    console.error('[ContextBuilder] AI extraction failed:', error)
    return {}
  }
}

/**
 * Pattern-based extraction as fallback/validation
 */
function extractWithPatterns(content: string): Partial<ExtractedBusinessIntel> {
  const result: Partial<ExtractedBusinessIntel> = {}

  // Email extraction
  const emailMatch = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
  if (emailMatch) result.email = emailMatch[0]

  // Website extraction
  const websiteMatch = content.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?)/gi)
  if (websiteMatch) result.website_url = websiteMatch[0].startsWith('http') ? websiteMatch[0] : `https://${websiteMatch[0]}`

  // Phone extraction (Indian format)
  const phoneMatch = content.match(/(?:\+91|91)?[\s-]?(?:\d{10}|\d{5}[\s-]?\d{5})/)
  if (phoneMatch) result.phone = phoneMatch[0].replace(/\D/g, '').slice(-10)

  // Business type keywords
  const typePatterns: Record<string, string[]> = {
    'Education': ['college', 'school', 'university', 'institute', 'academy', 'training'],
    'Healthcare': ['hospital', 'clinic', 'medical', 'healthcare', 'pharmacy', 'doctor'],
    'Real Estate': ['realtor', 'property', 'real estate', 'construction', 'builder', 'apartment'],
    'Technology': ['software', 'tech', 'it company', 'saas', 'app development', 'startup'],
    'Retail': ['shop', 'store', 'retail', 'ecommerce', 'trading', 'wholesale'],
    'Services': ['consultant', 'agency', 'services', 'solutions', 'consulting'],
    'Manufacturing': ['manufacturing', 'factory', 'industry', 'production', 'supplier'],
    'Hospitality': ['hotel', 'restaurant', 'cafe', 'resort', 'hospitality', 'catering'],
    'Finance': ['finance', 'insurance', 'accounting', 'investment', 'banking', 'financial'],
  }

  const lowerContent = content.toLowerCase()
  for (const [type, keywords] of Object.entries(typePatterns)) {
    if (keywords.some(kw => lowerContent.includes(kw))) {
      result.business_type = type
      break
    }
  }

  // Pain points patterns
  const painPatterns = [
    /(?:problem|issue|challenge|struggle|difficulty|pain|concern)[s]?[\s:]+([^,.]+)/gi,
    /(?:need|want|looking for|searching for)[\s:]+([^,.]+(?:help|solution|improve|increase|decrease|reduce))/gi,
    /(?:not|don't|cant|can't)[\s:]+(?:get|have|find|manage|handle|track)[\s:]+([^,.]+)/gi,
  ]

  const painPoints: string[] = []
  for (const pattern of painPatterns) {
    let match
    while ((match = pattern.exec(content)) !== null) {
      if (match[1] && match[1].length > 5) {
        painPoints.push(match[1].trim())
      }
    }
  }
  if (painPoints.length > 0) {
    result.pain_points = [...new Set(painPoints)].slice(0, 5)
  }

  // Service interests patterns
  const servicePatterns = [
    /(?:ai|automation|chatbot|whatsapp|crm|system|solution|software|app|website|marketing|lead generation)/gi,
  ]

  const serviceInterests: string[] = []
  for (const pattern of servicePatterns) {
    const matches = content.match(pattern)
    if (matches) {
      serviceInterests.push(...matches)
    }
  }
  if (serviceInterests.length > 0) {
    result.service_interests = [...new Set(serviceInterests)].map(s => s.charAt(0).toUpperCase() + s.slice(1)).slice(0, 5)
  }

  // Decision timeline detection
  const timelinePatterns = {
    'ASAP': ['asap', 'as soon as possible', 'immediately', 'urgent', 'right now', 'this week'],
    'This month': ['this month', 'within a month', 'in 2 weeks', 'next week', 'soon'],
    'Next quarter': ['next quarter', 'in 3 months', 'q\d', 'january', 'february', 'march', 'april', 'may', 'june'],
    'Just researching': ['just looking', 'researching', 'exploring', 'gathering info', 'learning', 'curious'],
  }

  for (const [timeline, keywords] of Object.entries(timelinePatterns)) {
    if (keywords.some(kw => lowerContent.includes(kw))) {
      result.decision_timeline = timeline as ExtractedBusinessIntel['decision_timeline']
      break
    }
  }

  // Budget indication
  const budgetMatch = content.match(/(?:budget|cost|price|pricing|investment)[\s:]*(?:rs\.?|inr|₹|\$)?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i)
  if (budgetMatch) {
    result.budget_indication = budgetMatch[0]
  }

  return result
}

/**
 * Extract business name using patterns
 */
function extractBusinessName(content: string): string | undefined {
  // Common patterns for business name mention
  const patterns = [
    /(?:my|our)\s+(?:company|business|firm|organization)\s+(?:is|name)[\s:]+([^,.]+)/i,
    /(?:i am from|i work at|i work for|we are)\s+([^,.]+(?:college|school|university|institute|solutions|services|tech|consulting|trading|llp|pvt|limited|ltd|corp|inc))/i,
    /(?:name|company)\s*:?\s*([^,.]+(?:college|school|university|institute|solutions|services|tech|consulting|trading))/i,
  ]

  for (const pattern of patterns) {
    const match = content.match(pattern)
    if (match && match[1]) {
      const name = match[1].trim()
      // Filter out generic names
      const genericNames = ['here', 'there', 'this', 'that', 'company', 'business']
      if (name.length > 2 && !genericNames.includes(name.toLowerCase())) {
        return name
      }
    }
  }

  return undefined
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

const supabase = createClient()

/**
 * Build context for a lead by extracting intelligence from conversations
 */
export async function buildLeadContext(
  leadId: string,
  options: { forceRefresh?: boolean; useAI?: boolean } = {}
): Promise<ExtractedBusinessIntel | null> {
  try {
    // Get existing lead data
    const { data: lead } = await supabase
      .from('all_leads')
      .select('unified_context, customer_name, email, customer_phone_normalized, last_interaction_at')
      .eq('id', leadId)
      .single()

    if (!lead) return null

    const existingContext = lead.unified_context || {}
    
    // Check if recently extracted (within 1 hour) and not forced
    if (!options.forceRefresh && existingContext.extracted_intel?.extracted_at) {
      const extractedAt = new Date(existingContext.extracted_intel.extracted_at)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
      if (extractedAt > oneHourAgo) {
        return existingContext.extracted_intel as ExtractedBusinessIntel
      }
    }

    // Get conversation history
    const { data: conversations } = await supabase
      .from('conversations')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: true })

    const conversationHistory: ConversationMessage[] = conversations || []

    // Extract from form data if available
    const formData: FormData = existingContext.form_data || existingContext.whatsapp?.profile || {}

    // Combine all text for pattern extraction
    const allText = conversationHistory
      .map(m => m.content)
      .join(' ')

    // Pattern-based extraction
    const patternExtracted = extractWithPatterns(allText)

    // AI-based extraction if enabled
    let aiExtracted: Partial<ExtractedBusinessIntel> = {}
    if (options.useAI !== false && conversationHistory.length > 0) {
      aiExtracted = await extractWithAI(conversationHistory, existingContext)
    }

    // Extract business name specifically
    const businessName = extractBusinessName(allText) || formData.business_name

    // Merge all sources (priority: form > AI > patterns)
    const extracted: ExtractedBusinessIntel = {
      business_name: businessName || existingContext.business_name,
      business_type: formData.business_type || aiExtracted.business_type || patternExtracted.business_type || existingContext.business_type,
      email: formData.email || lead.email || patternExtracted.email || aiExtracted.email,
      website_url: formData.website_url || patternExtracted.website_url || aiExtracted.website_url,
      phone: lead.customer_phone_normalized || formData.phone || patternExtracted.phone,
      pain_points: aiExtracted.pain_points || patternExtracted.pain_points || existingContext.pain_points,
      service_interests: aiExtracted.service_interests || patternExtracted.service_interests || existingContext.service_interests,
      budget_indication: aiExtracted.budget_indication || patternExtracted.budget_indication || existingContext.budget_indication,
      decision_timeline: aiExtracted.decision_timeline || patternExtracted.decision_timeline || existingContext.decision_timeline,
      extracted_at: new Date().toISOString(),
      confidence: aiExtracted.business_name ? 'high' : patternExtracted.business_name ? 'medium' : 'low',
    }

    // Update lead record with extracted data
    const updatedContext = {
      ...existingContext,
      ...extracted,
      extracted_intel: extracted,
    }

    await supabase
      .from('all_leads')
      .update({ unified_context: updatedContext })
      .eq('id', leadId)

    return extracted
  } catch (error) {
    console.error('[ContextBuilder] Failed to build context:', error)
    return null
  }
}

/**
 * Extract business intelligence on-demand
 */
export async function extractBusinessIntel(
  leadId: string
): Promise<ExtractedBusinessIntel | null> {
  return buildLeadContext(leadId, { forceRefresh: true, useAI: true })
}

/**
 * Update lead with extracted data manually
 */
export async function updateLeadContext(
  leadId: string,
  updates: Partial<ExtractedBusinessIntel>
): Promise<boolean> {
  try {
    const { data: lead } = await supabase
      .from('all_leads')
      .select('unified_context')
      .eq('id', leadId)
      .single()

    if (!lead) return false

    const existingContext = lead.unified_context || {}
    
    await supabase
      .from('all_leads')
      .update({
        unified_context: {
          ...existingContext,
          ...updates,
          extracted_intel: {
            ...existingContext.extracted_intel,
            ...updates,
            extracted_at: new Date().toISOString(),
          },
        },
      })
      .eq('id', leadId)

    return true
  } catch (error) {
    console.error('[ContextBuilder] Failed to update context:', error)
    return false
  }
}

/**
 * Trigger extraction after conversation webhook
 */
export async function triggerExtractionAfterConversation(
  leadId: string
): Promise<void> {
  // Run extraction in background (don't await)
  buildLeadContext(leadId, { useAI: true }).catch(err => {
    console.error('[ContextBuilder] Background extraction failed:', err)
  })
}
