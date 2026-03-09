import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const ALLOWED_STAGES = [
  'New', 'Engaged', 'Qualified', 'High Intent', 'Booking Made',
  'Converted', 'Closed Lost', 'Not Qualified', 'In Sequence', 'Cold', 'R&R'
]

/**
 * POST /api/dashboard/leads/[id]/override
 * Save activity note + update stage + trigger AI analysis (async)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const user = { id: 'system' }

    const leadId = params.id
    const body = await request.json()
    const { new_stage, activity_type, note } = body

    // Validate
    if (!new_stage) {
      return NextResponse.json({ error: 'new_stage is required' }, { status: 400 })
    }
    if (!activity_type || !note) {
      return NextResponse.json({ error: 'activity_type and note are required' }, { status: 400 })
    }
    if (!ALLOWED_STAGES.includes(new_stage)) {
      return NextResponse.json({ error: `Invalid stage: ${new_stage}` }, { status: 400 })
    }

    // Get current lead data
    const { data: lead, error: leadError } = await supabase
      .from('all_leads')
      .select('lead_stage, lead_score, unified_context')
      .eq('id', leadId)
      .single()

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    const oldStage = lead.lead_stage

    // Insert activity
    const { data: activity, error: activityError } = await supabase
      .from('lead_activities')
      .insert({
        lead_id: leadId,
        activity_type,
        note,
        created_by: user.id,
      })
      .select()
      .single()

    if (activityError) {
      console.error('Error creating activity:', activityError)
      return NextResponse.json({ error: 'Failed to create activity' }, { status: 500 })
    }

    // Update lead stage
    const { error: updateError } = await supabase
      .from('all_leads')
      .update({
        lead_stage: new_stage,
        stage_override: true,
        is_manual_override: true,
      })
      .eq('id', leadId)

    if (updateError) {
      console.error('Error updating lead:', updateError)
      return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 })
    }

    // Log stage change
    if (oldStage !== new_stage) {
      await supabase
        .from('lead_stage_changes')
        .insert({
          lead_id: leadId,
          old_stage: oldStage,
          new_stage: new_stage,
          old_score: lead.lead_score,
          new_score: lead.lead_score,
          changed_by: user.id,
          is_automatic: false,
          change_reason: note || 'Manual override',
        })
    }

    // Trigger AI analysis in background (non-blocking)
    const apiKey = process.env.CLAUDE_API_KEY
    if (apiKey && note) {
      analyzeNoteAndUpdateLead(supabase, apiKey, leadId, note, new_stage, activity.id, {
        lead_stage: new_stage,
        lead_score: lead.lead_score,
        unified_context: lead.unified_context,
      }).catch(err => {
        console.error('[NoteAnalysis] Background analysis failed:', err)
      })
    }

    return NextResponse.json({
      success: true,
      lead_id: leadId,
      old_stage: oldStage,
      new_stage: new_stage,
      activity,
    })
  } catch (error) {
    console.error('Error overriding lead stage:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * AI-powered note analysis: determines score changes, stage suggestions, and updates the lead
 * Runs asynchronously after the main override succeeds
 */
async function analyzeNoteAndUpdateLead(
  supabase: any,
  apiKey: string,
  leadId: string,
  note: string,
  currentStage: string,
  activityId: string,
  leadData: { lead_stage: string; lead_score: number | null; unified_context: any }
) {
  const truncatedNote = note.slice(0, 500) // Cap for token efficiency

  const prompt = `You are a lead intelligence analyst. A team member logged this note about a sales lead:

NOTE: "${truncatedNote}"
CURRENT STAGE: ${currentStage}
CURRENT SCORE: ${leadData.lead_score ?? 'Unknown'}

Analyze the note and determine:
1. Score change (delta: -30 to +30)
2. Should the stage change? To what?
3. Should we flag for follow-up?
4. Brief reasoning (1 sentence)

STAGES: New, Engaged, Qualified, High Intent, Booking Made, Converted, Closed Lost, Not Qualified, In Sequence, Cold, R&R

RULES:
- "not interested" / "looking elsewhere" / "too expensive" / "no budget" → Closed Lost, delta -20 to -30
- "RNR" / "didn't pick up" / "no answer" / "voicemail" → keep stage, delta -5
- "good conversation" / "interested" / "wants info" → Qualified or High Intent, delta +10 to +20
- "wants to book" / "sending proposal" / "ready to proceed" → High Intent, delta +15 to +25
- "confirmed" / "payment" / "booked" → Booking Made or Converted, delta +25 to +30
- "asked for callback" / "will think about it" → keep stage, delta 0 to +5
- "competitor" / "went with someone else" → Closed Lost, delta -25
- If note is about a stage change only with no real insight, delta 0 and keep stage as-is

Respond ONLY with JSON:
{"score_delta":<number>,"suggested_stage":"<stage or null>","flag_followup":<boolean>,"reasoning":"<1 sentence>"}`

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      console.error('[NoteAnalysis] Claude API error:', response.status)
      return
    }

    const data = await response.json()
    const text = data.content?.[0]?.text || ''

    // Parse JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('[NoteAnalysis] Could not parse JSON:', text)
      return
    }

    const analysis = JSON.parse(jsonMatch[0])
    const scoreDelta = Math.max(-30, Math.min(30, analysis.score_delta || 0))
    const suggestedStage = analysis.suggested_stage
    const currentScore = leadData.lead_score || 0
    const newScore = Math.max(0, Math.min(100, currentScore + scoreDelta))

    // Build update
    const updateFields: Record<string, any> = {}

    if (scoreDelta !== 0) {
      updateFields.lead_score = newScore
    }

    // Auto-change stage only if AI suggests it AND the score delta is significant (>=10)
    if (suggestedStage && ALLOWED_STAGES.includes(suggestedStage) && suggestedStage !== currentStage && Math.abs(scoreDelta) >= 10) {
      updateFields.lead_stage = suggestedStage
    }

    // Apply updates
    if (Object.keys(updateFields).length > 0) {
      await supabase
        .from('all_leads')
        .update(updateFields)
        .eq('id', leadId)

      // Log AI-driven stage change
      if (updateFields.lead_stage && updateFields.lead_stage !== currentStage) {
        await supabase
          .from('lead_stage_changes')
          .insert({
            lead_id: leadId,
            old_stage: currentStage,
            new_stage: updateFields.lead_stage,
            old_score: currentScore,
            new_score: newScore,
            changed_by: 'PROXe AI',
            is_automatic: true,
            change_reason: `AI note analysis: ${analysis.reasoning}`,
          })
      }
    }

    // Store analysis on the activity
    await supabase
      .from('lead_activities')
      .update({
        ai_analysis: {
          score_delta: scoreDelta,
          suggested_stage: suggestedStage,
          flag_followup: analysis.flag_followup || false,
          reasoning: analysis.reasoning || '',
          applied_score: newScore,
          applied_stage: updateFields.lead_stage || currentStage,
        }
      })
      .eq('id', activityId)

    // Update team_notes_summary in unified_context for agent conversations
    await updateTeamNotesSummary(supabase, apiKey, leadId)

    console.log(`[NoteAnalysis] Lead ${leadId}: score ${currentScore} → ${newScore} (delta ${scoreDelta}), stage: ${updateFields.lead_stage || currentStage}`)
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.error('[NoteAnalysis] Request timed out')
    } else {
      console.error('[NoteAnalysis] Error:', err)
    }
  }
}

/**
 * Regenerate the team_notes_summary in unified_context
 * This summary is injected into PROXe's conversation prompt so the agent knows what the team observed
 */
async function updateTeamNotesSummary(
  supabase: any,
  apiKey: string,
  leadId: string,
) {
  try {
    // Fetch recent team notes (last 10)
    const { data: recentNotes } = await supabase
      .from('lead_activities')
      .select('note, created_at, activity_type')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(10)

    if (!recentNotes || recentNotes.length === 0) return

    const notesText = recentNotes.map((n: any) =>
      `[${new Date(n.created_at).toLocaleDateString()}] ${n.note}`
    ).join('\n')

    // Generate a concise summary for agent context
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages: [{
          role: 'user',
          content: `Summarize these team notes about a sales lead in 2-3 sentences. Focus on what the sales team has learned about this customer and any key observations:\n\n${notesText}`
        }],
      }),
    })

    if (!response.ok) return

    const data = await response.json()
    const summary = data.content?.[0]?.text || ''

    if (summary) {
      // Get current unified_context and update team_notes_summary
      const { data: lead } = await supabase
        .from('all_leads')
        .select('unified_context')
        .eq('id', leadId)
        .single()

      const unifiedContext = lead?.unified_context || {}
      unifiedContext.team_notes_summary = summary

      await supabase
        .from('all_leads')
        .update({ unified_context: unifiedContext })
        .eq('id', leadId)
    }
  } catch (err) {
    console.error('[NoteAnalysis] Error updating team notes summary:', err)
  }
}
