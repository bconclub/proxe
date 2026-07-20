import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { recordTokenUsage, usageFrom } from '@/lib/token-usage'
import { BRAND_ID } from '@/configs'
import { resolveModel } from '@/lib/agent-core'

export const dynamic = 'force-dynamic'

// The lead-summary Claude prompt was hardcoded for Windchasers (aviation), so a
// lokazen commercial-real-estate lead (owner listing a shop, brand seeking space,
// scout) had NO domain that fit - Claude found no "course/pilot" info in a
// property-details chat and fell back to the trivial "…in the In Sequence stage"
// line. This makes the framing brand-aware so the summary reflects what the lead
// actually said.
function summaryDomain(brand: string): { who: string; s1: string; s2: string; dont: string; ex1: string; ex2: string } {
  if (brand === 'pop') {
    return {
      who: 'a political campaign (Pulse of Punjab). Every lead is a PERSON in the constituency - a voter, supporter, volunteer, or cadre - not a customer.',
      s1: 'Sentence 1: Who they are, where they stand on the frontline ladder (voter / supporter / volunteer / cadre) and their constituency if known.',
      s2: 'Sentence 2: The grievance or issue they raised (water, jobs, drugs, farm debt, power, roads, education, health) and any specifics they gave.',
      dont: 'This is a voter / constituent, NOT a sales lead. Never use sales words - no "customer", "deal", "pipeline", "booking", "purchase", or sales stages like "Qualified" / "In Sequence".',
      ex1: 'Sachin is a supporter in Jalalabad (Firozpur) who raised unemployment as the biggest issue. Engaged over a voice call; next: log the jobs grievance and route it to the team.',
      ex2: 'Manjit is a volunteer in Talwandi Sabo raising farm debt and MSP concerns, active on WhatsApp. Next: connect them to the local cadre for follow-up.',
    }
  }
  if (brand === 'lokazen') {
    return {
      who: 'Lokazen - a commercial real-estate marketplace in Bangalore. Every lead is one of three: an OWNER listing a commercial property, a BRAND looking for retail/commercial space, or a SCOUT (a gig worker who spots empty "to-let" shops).',
      s1: 'Sentence 1: Who they are and which type (owner / brand / scout), with the ONE headline fact - e.g. "owner listing a 950 sqft ground-floor shop on BH Road, Nelamangala" or "brand seeking 600-1500 sqft in South Bangalore" or "scout onboarding, asked about the app".',
      s2: 'Sentence 2: The concrete details they shared - owner: area, size, floor, rent, deposit/lock-in, availability; brand: area, size, budget, timeline; scout: their question or where they are in KYC/onboarding.',
      dont: 'This is a commercial real-estate lead - NOT aviation, pilots, courses, or "business solutions". Never mention any of those.',
      ex1: 'Praveen is an owner listing a 950 sqft ground-floor shop on BH Road, Nelamangala (Atri Square). Rent ₹1.5L fixed, 6-month advance, 3-year lock-in, no bargain; shared photos and a Maps link. Next: verify details and match to brands searching that area.',
      ex2: 'Karan is a brand looking for ~600-1500 sqft commercial space in South Bangalore. Asked about availability and pricing but hasn\'t locked a requirement. Next: confirm budget and preferred micro-market, then share matching options.',
    }
  }
  if (brand === 'windchasers') {
    return {
      who: 'an aviation training academy (Windchasers)',
      s1: 'Sentence 1: Who they are and which course/program they\'re interested in (e.g. CPL, PPL, helicopter, cabin crew) - only if actually known.',
      s2: 'Sentence 2: What they asked about or what was discussed.',
      dont: 'This is a pilot-training lead, not a business. Do not write that they "haven\'t shared information about their business".',
      ex1: 'Aarav is exploring a CPL (commercial pilot) path and asked about eligibility and the total timeline before committing. Agreed to a counselling call but no slot is locked yet - follow up to confirm a time.',
      ex2: 'Meera asked about cabin crew training cost and duration. Tried to book a call for Monday 3 PM but the slot didn\'t confirm and she went quiet - reach out to help her lock a time.',
    }
  }
  return {
    who: 'a business',
    s1: 'Sentence 1: Who they are and what product/service they\'re interested in - only if actually known.',
    s2: 'Sentence 2: What they asked about or what was discussed.',
    dont: 'Only state what the conversation actually shows.',
    ex1: 'Priya asked about pricing and what\'s included, and wanted to see a demo before deciding. Next: send options and confirm a demo time.',
    ex2: 'Rahul compared two plans and asked about support and onboarding. Went quiet after the quote - follow up with a nudge.',
  }
}

function buildLeadSummaryPrompt(parts: {
  leadName: string; stageLabel: string; profileInfo: string; activitiesContext: string;
  conversationBlock: string;
}): string {
  const d = summaryDomain(BRAND_ID)
  return `Summarize this lead for ${d.who} in 2-3 sentences max. Plain text, no emojis, no headers, no labels.
${d.s1}
${d.s2}
Sentence 3: What happened (booked / pending / no response / lost) and what to do next.
If anything went wrong (booking failed, frustrated, asked for a human), say it clearly.
IMPORTANT: If a call was logged with notes (see TEAM NOTES & CALL LOGS below), treat those notes as the source of truth about what happened on the call, and reflect the key points + the next step.

CRITICAL: Only state what the conversation or profile actually shows. NEVER invent or assume details. ${d.dont} If you don't know something, simply leave it out.
If there isn't enough real information to say who they are or what they want, reply with EXACTLY this and nothing else: "Not enough context yet - more interaction needed to summarize this lead."

Example:
${d.ex1}

Another example:
${d.ex2}

Keep it under 55 words. Be specific to what was actually said. No fluff.

Lead: ${parts.leadName}
Stage: ${parts.stageLabel}
${parts.profileInfo ? 'Profile: ' + parts.profileInfo : ''}
${parts.activitiesContext && parts.activitiesContext !== 'No team activities' ? `\nTEAM NOTES & CALL LOGS (most recent first):\n${parts.activitiesContext}\n` : ''}
${parts.conversationBlock}`
}

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
    // Auth gate: every dashboard API requires a logged-in Supabase session.
    // No role check here - viewer vs admin enforcement is done at write sites.
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const leadId = params.id
    const { searchParams } = new URL(request.url)
    const forceRefresh = searchParams.get('refresh') === 'true'
    console.log('Generating summary for lead:', leadId, { forceRefresh })

    // Fetch lead data
    const { data: lead, error: leadError } = await supabase
      .from('all_leads')
      // POP campaign columns (intensity ladder + grievance) appended only for pop.
      .select('id, customer_name, email, phone, created_at, last_interaction_at, lead_stage, sub_stage, unified_context'
        + (BRAND_ID === 'pop' ? ', intensity, grievance_category, lean' : ''))
      .eq('id', leadId)
      .single() as { data: any; error: any }

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

    // POP is a campaign, not a sales pipeline: describe a person by their frontline
    // TIER + grievance, never a sales stage like "Qualified". Other brands keep the
    // lead_stage wording. `stageLabel` feeds the AI prompt; `standingPhrase` is the
    // natural-language "currently ..." bit used by the non-AI fallbacks.
    const isPopBrand = BRAND_ID === 'pop'
    const POP_TIERS = ['Contact', 'Voter', 'Supporter', 'Volunteer', 'Cadre']
    const popTier = isPopBrand ? POP_TIERS[Math.max(0, Math.min(4, (lead as any).intensity ?? 0))] : ''
    const popGrievance = isPopBrand ? String((lead as any).grievance_category || '').replace(/_/g, ' ') : ''
    const stageLabel = isPopBrand
      ? `${popTier}${popGrievance ? ` · ${popGrievance} grievance` : ''}`
      : `${lead.lead_stage || 'Unknown'}${lead.sub_stage ? ` (${lead.sub_stage})` : ''}`
    const standingPhrase = isPopBrand
      ? `a ${popTier}${popGrievance ? ` raising a ${popGrievance} grievance` : ''}`
      : `in the ${lead.lead_stage || 'Unknown'} stage${lead.sub_stage ? ` (${lead.sub_stage})` : ''}`
    // Attribution action: a campaign has no sales "stage" - say it plainly for POP.
    const stageActionText = (newStage: string | null | undefined) =>
      isPopBrand ? 'updated their status' : `changed stage to ${newStage}`

    // ============================================
    // STEP 0: Hallucination guard - refuse to summarize with no real signal
    // ============================================
    // A lead with only outbound outreach (no reply) and no captured profile,
    // key info, or booking has nothing to honestly summarize. Letting Claude
    // run here invents facts ("no info about their business shared", "still
    // waiting for reply") - so we short-circuit with an honest line. This runs
    // before the cached-summary step so a previously-fabricated cached summary
    // is replaced too.
    const guardProfile = {
      ...(lead.unified_context?.web?.profile || {}),
      ...(lead.unified_context?.whatsapp?.profile || {}),
    }
    const guardHasProfile = !!(guardProfile.company || guardProfile.business_type || guardProfile.city || guardProfile.notes)
    const guardHasKeyInfo = !!(
      lead.unified_context?.budget ||
      lead.unified_context?.service_interest ||
      lead.unified_context?.pain_points ||
      lead.unified_context?.web?.service_interest ||
      lead.unified_context?.whatsapp?.service_interest ||
      lead.unified_context?.bcon?.business_type ||
      lead.unified_context?.bcon?.timeline
    )
    const guardHasBooking = !!(bookingDate || bookingTime)

    let guardInbound = 0
    let guardTotal = 0
    try {
      const { count: inb } = await supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('lead_id', leadId)
        .eq('sender', 'customer')
      guardInbound = inb || 0
      const { count: tot } = await supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('lead_id', leadId)
      guardTotal = tot || 0
    } catch (e) {
      console.error('Summary context-check failed, proceeding without guard:', e)
      guardInbound = 1 // on error, don't block a legit summary with a false "not enough context"
    }

    const hasEnoughContext = guardInbound > 0 || guardHasProfile || guardHasKeyInfo || guardHasBooking

    if (!hasEnoughContext) {
      const honestSummary = `Not enough context yet to summarize ${lead.customer_name || 'this lead'} - no reply or details captured so far${guardTotal > 0 ? ' (only outreach sent)' : ''}. Currently ${standingPhrase}.`

      const lastInteraction = lead.last_interaction_at || lead.created_at
      const daysInactive = lastInteraction
        ? Math.max(0, Math.floor((new Date().getTime() - new Date(lastInteraction).getTime()) / 86400000))
        : 0

      // Best-effort attribution from the most recent stage change / activity
      let attribution = ''
      const { data: lastStageChangeData } = await supabase
        .from('lead_stage_changes')
        .select('changed_by, created_at, new_stage')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(1)
      const lastStageChange = lastStageChangeData && lastStageChangeData.length > 0 ? lastStageChangeData[0] : null
      const { data: guardActivities } = await supabase
        .from('activities')
        .select('activity_type, created_at, created_by, dashboard_users:created_by (name, email)')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(1)
      if (lastStageChange) {
        let actorName = 'PROXe AI'
        if (lastStageChange.changed_by !== 'PROXe AI' && lastStageChange.changed_by !== 'system') {
          const { data: u } = await supabase.from('dashboard_users').select('name, email').eq('id', lastStageChange.changed_by).single()
          if (u) actorName = u.name || u.email || 'Team Member'
        }
        attribution = `Last updated by ${actorName} ${formatTimeAgo(lastStageChange.created_at)} - ${stageActionText(lastStageChange.new_stage)}`
      } else if (guardActivities && guardActivities.length > 0) {
        const a = guardActivities[0]
        const creator = Array.isArray(a.dashboard_users) ? a.dashboard_users[0] : a.dashboard_users
        attribution = `Last updated by ${creator?.name || creator?.email || 'Team Member'} ${formatTimeAgo(a.created_at)} - ${a.activity_type}`
      }

      console.log('Insufficient context for summary - returning honest placeholder for lead:', leadId)
      return NextResponse.json({
        summary: honestSummary,
        attribution,
        data: {
          leadName: lead.customer_name || 'Customer',
          lastMessage: null,
          conversationStatus: guardInbound > 0 ? 'Active' : 'No response yet',
          responseRate: guardTotal > 0 ? Math.round((guardInbound / guardTotal) * 100) : 0,
          daysInactive,
          nextTouchpoint: lead.unified_context?.next_touchpoint || lead.unified_context?.sequence?.next_step,
          keyInfo: {},
          leadStage: lead.lead_stage,
          subStage: lead.sub_stage,
          bookingDate,
          bookingTime,
          insufficientContext: true,
        },
      })
    }

    // ============================================
    // STEP 1: Check unified_context for existing summaries
    // ============================================
    const unifiedSummary = lead.unified_context?.unified_summary
    const webSummary = lead.unified_context?.web?.conversation_summary
    const whatsappSummary = lead.unified_context?.whatsapp?.conversation_summary

    // Check if cached summary is stale: new activity since last generation
    const summaryGeneratedAt = lead.unified_context?.unified_summary_generated_at
    const lastInteractionAt = lead.last_interaction_at
    const summaryIsStale = unifiedSummary && summaryGeneratedAt && lastInteractionAt &&
      new Date(lastInteractionAt).getTime() > new Date(summaryGeneratedAt).getTime()

    // Priority 1: Use unified_summary if it exists, is not stale, and not forced refresh
    if (unifiedSummary && !forceRefresh && !summaryIsStale) {
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
        let action = stageActionText(lastStageChange.new_stage)

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

      // Fetch full conversation history for richer summary
      let allConversationMessages: any[] = []
      try {
        const { data: convData } = await supabase
          .from('conversations')
          .select('content, sender, created_at, channel')
          .eq('lead_id', leadId)
          .order('created_at', { ascending: true })
          .limit(80)

        if (convData) allConversationMessages = convData
      } catch (err) {
        console.error('Error fetching conversation for summary:', err)
      }

      const fullConversationContext = allConversationMessages
        .map(m => `${m.sender === 'customer' ? 'Customer' : 'PROXe'} (${m.channel}): ${m.content}`)
        .join('\n')

      // Extract profile data from unified_context
      const waProfile = lead.unified_context?.whatsapp?.profile || {}
      const webProfile = lead.unified_context?.web?.profile || {}
      const profileInfo: string[] = []
      if (waProfile.company || webProfile.company) profileInfo.push(`Company: ${waProfile.company || webProfile.company}`)
      if (waProfile.business_type || webProfile.business_type) profileInfo.push(`Business: ${waProfile.business_type || webProfile.business_type}`)
      if (waProfile.city || webProfile.city) profileInfo.push(`City: ${waProfile.city || webProfile.city}`)
      if (waProfile.notes || webProfile.notes) profileInfo.push(`Notes: ${waProfile.notes || webProfile.notes}`)

      // Try to generate unified summary using Claude API
      const apiKey = process.env.CLAUDE_API_KEY
      if (apiKey) {
        try {
          const conversationBlock = fullConversationContext
            ? `CONVERSATION (${allConversationMessages.length} messages):\n${fullConversationContext}`
            : `Channel Summaries:\n${webSummary ? 'Web: ' + webSummary + '\n' : ''}${whatsappSummary ? 'WhatsApp: ' + whatsappSummary + '\n' : ''}`
          const prompt = buildLeadSummaryPrompt({
            leadName: lead.customer_name || 'Customer',
            stageLabel,
            profileInfo: profileInfo.join(' | '),
            activitiesContext,
            conversationBlock,
          })

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
                model: resolveModel(process.env.CLAUDE_MODEL),
                max_tokens: 200,
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
            await recordTokenUsage('notes_summary', data.model || '', usageFrom(data).input, usageFrom(data).output)
            const unifiedSummary = data.content?.[0]?.text || ''
            if (unifiedSummary) {
              // Build attribution
              let attribution = ''
              if (lastStageChange) {
                const changedBy = lastStageChange.changed_by
                let actorName = 'PROXe AI'
                let action = stageActionText(lastStageChange.new_stage)

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
                  unified_summary: unifiedSummary,
                  unified_summary_generated_at: new Date().toISOString()
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
        fallbackSummary += `Currently ${standingPhrase}.`
      } else if (webSummary) {
        fallbackSummary = `${lead.customer_name || 'Customer'} engaged via web channel. ${webSummary} Currently ${standingPhrase}.`
      } else if (whatsappSummary) {
        fallbackSummary = `${lead.customer_name || 'Customer'} engaged via WhatsApp. ${whatsappSummary} Currently ${standingPhrase}.`
      }

      // Safety check: ensure we always have a summary
      if (!fallbackSummary || fallbackSummary.trim() === '') {
        fallbackSummary = `${lead.customer_name || 'Customer'} is currently ${standingPhrase}.`
      }

      // Build attribution
      let attribution = ''
      if (lastStageChange) {
        const changedBy = lastStageChange.changed_by
        let actorName = 'PROXe AI'
        let action = stageActionText(lastStageChange.new_stage)

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

    // Build full conversation context (all messages, not just last 10)
    // Include up to 80 messages to capture early context about who they are
    const conversationMessages = allMessages.slice(-80).map(m => ({
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
        // Build full conversation context
        const conversationContext = conversationMessages
          .map(m => `${m.sender} (${m.channel}): ${m.content}`)
          .join('\n')

        // Build activities context
        const activitiesContext = recentActivities
          ?.map(a => {
            const creator = Array.isArray(a.dashboard_users)
              ? a.dashboard_users[0]
              : a.dashboard_users
            return `[${a.created_at}] ${creator?.name || creator?.email || 'Team'}: ${a.activity_type} - ${a.note}`
          })
          .join('\n') || 'No team activities'

        // Extract profile data from unified_context
        const waProfile = lead.unified_context?.whatsapp?.profile || {}
        const webProfile = lead.unified_context?.web?.profile || {}
        const profileInfo = []
        if (waProfile.company || webProfile.company) profileInfo.push(`Company: ${waProfile.company || webProfile.company}`)
        if (waProfile.business_type || webProfile.business_type) profileInfo.push(`Business: ${waProfile.business_type || webProfile.business_type}`)
        if (waProfile.city || webProfile.city) profileInfo.push(`City: ${waProfile.city || webProfile.city}`)
        if (waProfile.notes || webProfile.notes) profileInfo.push(`Notes: ${waProfile.notes || webProfile.notes}`)

        const prompt = buildLeadSummaryPrompt({
          leadName: summaryData.leadName,
          stageLabel: `${lead.lead_stage || 'Unknown'}${lead.sub_stage ? ' (' + lead.sub_stage + ')' : ''}`,
          profileInfo: profileInfo.join(' | '),
          activitiesContext,
          conversationBlock: `CONVERSATION (${conversationMessages.length} messages):\n${conversationContext || 'No messages yet'}`,
        })

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
              max_tokens: 200, // Increased from 400 to allow for more comprehensive summaries
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
          await recordTokenUsage('notes_summary', data.model || '', usageFrom(data).input, usageFrom(data).output)
          const aiSummary = data.content?.[0]?.text || ''
          if (aiSummary) {
            // Save the new summary to the database
            try {
              const newUnifiedContext = {
                ...(lead.unified_context || {}),
                unified_summary: aiSummary,
                unified_summary_generated_at: new Date().toISOString()
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
              let action = stageActionText(lastStageChange.new_stage)

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
    let fallbackSummary = `${summaryData.leadName} is currently ${standingPhrase}. `

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

