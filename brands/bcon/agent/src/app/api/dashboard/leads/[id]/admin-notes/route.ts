import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendWhatsAppText } from '@/lib/services/whatsappSender'

export const dynamic = 'force-dynamic'

const CLASSIFY_SYSTEM_PROMPT = `You are a sales admin assistant. Given an admin note about a lead, extract:
1) category (one of: POST_CALL, BOOKING_MADE, NOT_POTENTIAL, HOT_LEAD, WARM_LATER, RNR, NOT_INTERESTED, CONVERTED, DEMO_TAKEN, PROPOSAL_SENT, MEETING_REQUEST, SEND_MESSAGE, NAME_UPDATE, INFO_ONLY)
2) any booking details if mentioned (date, time)
3) any name if mentioned
4) if a direct message should be sent (note starts with "send:", "message:", "tell them")

Respond in JSON only: {"category": "...", "booking_date": "...", "booking_time": "...", "name": "...", "send_message": "...", "summary": "..."}

Category guide:
- POST_CALL: "spoke to", "just called", "had a call", "after the call" — a call happened
- BOOKING_MADE: "booked", "demo booked", "call scheduled", "meeting set" — a booking was made with date/time
- NOT_POTENTIAL: "not potential", "not a fit", "waste of time", "no budget", "too small" — lead is not worth pursuing
- HOT_LEAD: "hot lead", "very interested", "wants to start", "ready to go", "priority", "close this week" — high intent
- WARM_LATER: "maybe later", "check back later", "not now but maybe", "low potential", "follow up later" — warm but not now
- RNR: "no show", "didn't show", "no answer", "didn't pick up", "rnr", "rang no response", "not responding", "not replying", "no response" — couldn't reach them
- NOT_INTERESTED: "not interested", "dead lead" — explicit disinterest
- CONVERTED: "converted", "signed", "closed won", "deal done" — deal closed
- DEMO_TAKEN: "demo done", "demo taken", "showed the demo", "demo complete", "they saw the demo" — a demo was given
- PROPOSAL_SENT: "proposal sent", "sent proposal", "shared proposal", "sent the deck", "sent pricing" — proposal or pricing was sent
- MEETING_REQUEST: "asked for a meet", "wants a call", "send them time", "schedule a call", "asked for google meet" — they want to meet
- SEND_MESSAGE: note starts with "send:", "message:", "tell them" — direct message to send (extract the message text after the prefix into send_message)
- NAME_UPDATE: "it's [name]", "name is [name]", "his/her name is [name]" — name correction
- INFO_ONLY: general notes, observations, no action needed

For booking_date: use relative terms as-is ("tomorrow", "next Monday", "March 28"). For booking_time: extract the time ("4 pm", "10:30 am"). If not mentioned, use null.
For name: extract the actual name mentioned, or null if none.
For send_message: extract the exact message text to send (everything after "send:" /"message:" /"tell them"), or null.

Example: note "spoke to him have a demo booked for tomorrow 4 pm" → {"category": "BOOKING_MADE", "booking_date": "tomorrow", "booking_time": "4 pm", "name": null, "send_message": null, "summary": "Demo booked for tomorrow 4pm after call"}
Example: note "send: Hey, just checking in!" → {"category": "SEND_MESSAGE", "booking_date": null, "booking_time": null, "name": null, "send_message": "Hey, just checking in!", "summary": "Direct message to send to lead"}`

interface NoteClassification {
  category: string
  booking_date: string | null
  booking_time: string | null
  name: string | null
  send_message: string | null
  summary: string | null
}

/**
 * Classify an admin note using Claude Haiku to determine intent and extract structured data.
 * Falls back to INFO_ONLY if the API call fails.
 */
async function classifyNote(noteText: string): Promise<NoteClassification> {
  const apiKey = process.env.CLAUDE_API_KEY
  if (!apiKey) {
    console.error('[AdminNote] CLAUDE_API_KEY not set, falling back to INFO_ONLY')
    return { category: 'INFO_ONLY', booking_date: null, booking_time: null, name: null, send_message: null, summary: null }
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        system: CLASSIFY_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: noteText }],
      }),
    })

    if (!response.ok) {
      console.error('[AdminNote] Claude API error:', response.status, await response.text())
      return { category: 'INFO_ONLY', booking_date: null, booking_time: null, name: null, send_message: null, summary: null }
    }

    const data = await response.json()
    const text = data.content?.[0]?.text || '{}'
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('[AdminNote] Could not parse Claude response:', text)
      return { category: 'INFO_ONLY', booking_date: null, booking_time: null, name: null, send_message: null, summary: null }
    }
    const parsed = JSON.parse(jsonMatch[0])
    return {
      category: parsed.category || 'INFO_ONLY',
      booking_date: parsed.booking_date || null,
      booking_time: parsed.booking_time || null,
      name: parsed.name || null,
      send_message: parsed.send_message || null,
      summary: parsed.summary || null,
    }
  } catch (err) {
    console.error('[AdminNote] Classification failed:', err)
    return { category: 'INFO_ONLY', booking_date: null, booking_time: null, name: null, send_message: null, summary: null }
  }
}

/**
 * Resolve a relative date string ("tomorrow", "next Monday", etc.) to an absolute Date in IST.
 * Falls back to tomorrow 10 AM IST if unparseable.
 */
function resolveBookingDate(dateStr: string, timeStr: string | null): Date {
  const now = new Date()
  const istOffsetMs = 5.5 * 60 * 60 * 1000
  const nowIST = new Date(now.getTime() + istOffsetMs)
  const lower = dateStr.toLowerCase().trim()

  let targetIST = new Date(nowIST)

  if (lower === 'today') {
    // keep today
  } else if (lower === 'tomorrow') {
    targetIST.setUTCDate(targetIST.getUTCDate() + 1)
  } else if (lower.startsWith('next ')) {
    // "next Monday", "next Tuesday" etc
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const targetDay = dayNames.indexOf(lower.replace('next ', '').trim())
    if (targetDay >= 0) {
      const currentDay = targetIST.getUTCDay()
      let daysAhead = targetDay - currentDay
      if (daysAhead <= 0) daysAhead += 7
      targetIST.setUTCDate(targetIST.getUTCDate() + daysAhead)
    } else {
      targetIST.setUTCDate(targetIST.getUTCDate() + 1) // fallback tomorrow
    }
  } else if (/in\s*(\d+)\s*days?/.test(lower)) {
    const m = lower.match(/in\s*(\d+)\s*days?/)
    if (m) targetIST.setUTCDate(targetIST.getUTCDate() + parseInt(m[1]))
  } else {
    // Try parsing as absolute date
    const parsed = new Date(dateStr)
    if (!isNaN(parsed.getTime())) {
      targetIST = new Date(parsed.getTime() + istOffsetMs)
    } else {
      targetIST.setUTCDate(targetIST.getUTCDate() + 1) // fallback tomorrow
    }
  }

  // Parse time
  let hour = 10, minutes = 0
  if (timeStr) {
    const timeMatch = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
    if (timeMatch) {
      hour = parseInt(timeMatch[1])
      minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0
      const ampm = timeMatch[3]?.toLowerCase()
      if (ampm === 'am' && hour === 12) hour = 0
      else if (ampm === 'pm' && hour !== 12) hour += 12
      else if (!ampm && hour >= 1 && hour <= 8) hour += 12 // assume PM for business hours
    }
  }

  targetIST.setUTCHours(hour, minutes, 0, 0)
  return new Date(targetIST.getTime() - istOffsetMs)
}

/**
 * POST /api/dashboard/leads/[id]/admin-notes
 * Add an admin note to a lead - dual-writes to unified_context.admin_notes[] and activities table.
 * Classifies note intent via Claude Haiku AI and triggers appropriate actions (tasks, stage changes, messages).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()

    // Get the logged-in user
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const createdBy = user?.email || 'system'

    const leadId = params.id
    const body = await request.json()
    const { note } = body

    if (!note?.trim()) {
      return NextResponse.json({ error: 'Note is required' }, { status: 400 })
    }

    const trimmedNote = note.trim()

    // 1. Fetch current lead data (unified_context + lead info for task creation)
    const { data: lead, error: leadError } = await supabase
      .from('all_leads')
      .select('unified_context, customer_name, customer_phone_normalized, phone')
      .eq('id', leadId)
      .single()

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    // 2. Duplicate guard — skip if same note text was added in the last 30 seconds
    const existingCtx = lead.unified_context || {}
    const existingNotes: any[] = existingCtx.admin_notes || []
    const thirtySecsAgo = new Date(Date.now() - 30000).toISOString()
    const isDuplicate = existingNotes.some(
      (n: any) => n.text === trimmedNote && n.created_at > thirtySecsAgo
    )
    if (isDuplicate) {
      console.warn(`[AdminNote] Duplicate guard: "${trimmedNote.substring(0, 40)}" was just saved, skipping`)
      return NextResponse.json({ success: true, note: existingNotes[existingNotes.length - 1], actions: [], actions_taken: ['Duplicate note — skipped'], classification: { category: 'INFO_ONLY', summary: null }, new_stage: null, new_score: null, summary_refreshed: false })
    }

    // 3. Append to unified_context.admin_notes[]
    const newNote = {
      id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      text: trimmedNote,
      created_by: createdBy,
      created_at: new Date().toISOString(),
    }

    const updatedCtx = {
      ...existingCtx,
      admin_notes: [...existingNotes, newNote],
    }

    // 4. Update all_leads with new note
    const { error: updateError } = await supabase
      .from('all_leads')
      .update({ unified_context: updatedCtx })
      .eq('id', leadId)

    if (updateError) throw updateError

    // 5. Also insert into activities table (appears in Activity tab)
    await supabase
      .from('activities')
      .insert({
        lead_id: leadId,
        activity_type: 'note',
        note: trimmedNote,
        created_by: createdBy,
      })

    // 5. Classify note using Claude Haiku AI
    const actions: string[] = []
    const actionsTaken: string[] = []
    const leadPhone = lead.customer_phone_normalized || lead.phone?.replace(/\D/g, '').slice(-10) || null
    const leadName = lead.customer_name || 'Lead'
    const now = new Date()
    let newStage: string | null = null
    let newScore: number | null = null

    console.log(`[AdminNote] Step 1: Classifying note "${trimmedNote.substring(0, 80)}" for lead ${leadId}`)
    const classification = await classifyNote(trimmedNote)
    console.log(`[AdminNote] Step 2: Classification result:`, JSON.stringify(classification))
    actions.push(`ai_category:${classification.category}`)

    // --- Execute actions based on AI classification ---

    if (classification.category === 'BOOKING_MADE') {
      // Cancel existing follow-up tasks
      const { data: cancelledTasks } = await supabase
        .from('agent_tasks')
        .update({ status: 'cancelled', completed_at: now.toISOString(), error_message: `Cancelled: booking made via admin note` })
        .eq('lead_id', leadId)
        .in('task_type', ['follow_up_day1', 'follow_up_day3', 'follow_up_day5', 're_engage', 'nudge_waiting', 'push_to_book', 'missed_call_followup', 'human_callback', 'post_call_followup', 'follow_up_24h'])
        .in('status', ['pending', 'queued', 'in_queue', 'awaiting_approval'])
        .select('id')
      const cancelCount = cancelledTasks?.length || 0
      if (cancelCount > 0) {
        actions.push(`cancelled_${cancelCount}_followup_tasks`)
        actionsTaken.push(`Cancelled ${cancelCount} pending follow-up tasks`)
        console.log(`[AdminNote] Step 3a: Cancelled ${cancelCount} follow-up tasks`)
      }

      // Resolve booking time
      const bookingAt = resolveBookingDate(
        classification.booking_date || 'tomorrow',
        classification.booking_time
      )
      const bookingTimeDisplay = classification.booking_time || 'scheduled time'

      // Create booking_reminder_24h (24h before booking)
      const reminder24h = new Date(bookingAt.getTime() - 24 * 60 * 60 * 1000)
      if (reminder24h > now) {
        await supabase.from('agent_tasks').insert({
          task_type: 'booking_reminder_24h',
          task_description: `24h reminder: ${leadName} booking at ${bookingTimeDisplay}`,
          lead_id: leadId,
          lead_phone: leadPhone,
          lead_name: leadName,
          status: 'pending',
          scheduled_at: reminder24h.toISOString(),
          metadata: { source: 'admin_note', booking_time: bookingTimeDisplay, sequence: 'booking' },
          created_at: now.toISOString(),
        })
        actions.push('booking_reminder_24h_created')
        actionsTaken.push(`Created 24h booking reminder for ${classification.booking_date || 'tomorrow'} ${bookingTimeDisplay}`)
        console.log(`[AdminNote] Step 3b: Created booking_reminder_24h at ${reminder24h.toISOString()}`)
      }

      // Create booking_reminder_30m (30min before booking)
      const reminder30m = new Date(bookingAt.getTime() - 30 * 60 * 1000)
      if (reminder30m > now) {
        await supabase.from('agent_tasks').insert({
          task_type: 'booking_reminder_30m',
          task_description: `30min reminder: ${leadName} booking at ${bookingTimeDisplay}`,
          lead_id: leadId,
          lead_phone: leadPhone,
          lead_name: leadName,
          status: 'pending',
          scheduled_at: reminder30m.toISOString(),
          metadata: { source: 'admin_note', booking_time: bookingTimeDisplay, sequence: 'booking' },
          created_at: now.toISOString(),
        })
        actions.push('booking_reminder_30m_created')
        actionsTaken.push(`Created 30min booking reminder`)
        console.log(`[AdminNote] Step 3c: Created booking_reminder_30m at ${reminder30m.toISOString()}`)
      }

      // Update stage and boost score
      newStage = 'Booking Made'
      newScore = 80
      const { error: stageScoreErr, count: stageScoreCount } = await supabase
        .from('all_leads')
        .update({ lead_stage: newStage, stage_override: true, lead_score: newScore })
        .eq('id', leadId)
      if (stageScoreErr) {
        console.error(`[AdminNote] Step 3d: FAILED to update stage/score:`, stageScoreErr.message)
      } else {
        console.log(`[AdminNote] Step 3d: Stage → Booking Made, Score → 80 (rows updated: ${stageScoreCount ?? 'unknown'})`)
      }
      // Verify the write persisted
      const { data: verifyLead } = await supabase.from('all_leads').select('lead_score, lead_stage, stage_override').eq('id', leadId).single()
      console.log(`[AdminNote] Step 3e: DB verify — lead_score=${verifyLead?.lead_score}, lead_stage=${verifyLead?.lead_stage}, stage_override=${verifyLead?.stage_override}`)
      actions.push('stage_updated:Booking Made,score_80')
      actionsTaken.push(`Stage changed to Booking Made`)
      actionsTaken.push(`Score updated to 80`)

    }

    if (classification.category === 'POST_CALL') {
      console.log(`[AdminNote] Step 3: POST_CALL — updating touchpoint and creating followup`)
      await supabase
        .from('all_leads')
        .update({ last_touchpoint: 'voice', last_interaction_at: now.toISOString() })
        .eq('id', leadId)
      actionsTaken.push(`Marked last touchpoint as voice call`)
      const { error: taskError } = await supabase
        .from('agent_tasks')
        .insert({
          task_type: 'post_call_followup',
          task_description: `Post-call follow-up: ${trimmedNote}`,
          lead_id: leadId,
          lead_phone: leadPhone,
          lead_name: leadName,
          status: 'pending',
          scheduled_at: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
          metadata: { source: 'admin_note', sequence: 'post_call', step: 0 },
          created_at: now.toISOString(),
        })
      if (!taskError) {
        actions.push('post_call_followup_created')
        actionsTaken.push(`Created post-call follow-up task (1 hour)`)
        console.log(`[AdminNote] Step 3b: Created post_call_followup task`)
      } else {
        console.error('[AdminNote] Failed to create post_call_followup:', taskError.message)
      }
    }

    if (classification.category === 'NOT_POTENTIAL') {
      console.log(`[AdminNote] Step 3: NOT_POTENTIAL — cancelling tasks, closing lead`)
      // Cancel ALL pending tasks
      const { data: cancelledTasks } = await supabase
        .from('agent_tasks')
        .update({ status: 'cancelled', completed_at: now.toISOString(), error_message: `Cancelled: admin note "${trimmedNote.substring(0, 50)}"` })
        .eq('lead_id', leadId)
        .in('status', ['pending', 'queued', 'in_queue', 'awaiting_approval'])
        .select('id')
      const cancelCount = cancelledTasks?.length || 0
      if (cancelCount > 0) actionsTaken.push(`Cancelled ${cancelCount} pending tasks`)
      console.log(`[AdminNote] Step 3a: Cancelled ${cancelCount} tasks`)

      newStage = 'Closed Lost'
      newScore = 0
      await supabase
        .from('all_leads')
        .update({ lead_stage: newStage, stage_override: true, lead_score: newScore })
        .eq('id', leadId)
      actionsTaken.push(`Stage changed to Closed Lost`)
      actionsTaken.push(`Score updated to 0`)
      console.log(`[AdminNote] Step 3b: Stage → Closed Lost, Score → 0`)

      // Create quarterly re_engage (90 days)
      await supabase.from('agent_tasks').insert({
        task_type: 're_engage',
        task_description: `Quarterly check-in for ${leadName} (marked not potential)`,
        lead_id: leadId,
        lead_phone: leadPhone,
        lead_name: leadName,
        status: 'pending',
        scheduled_at: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: { source: 'admin_note', trigger: 'not_potential', quarterly: true },
        created_at: now.toISOString(),
      })
      actions.push(`not_potential:cancelled_${cancelCount}_tasks,stage_Closed_Lost,score_0,re_engage_90d`)
      actionsTaken.push(`Scheduled 90-day re-engagement check-in`)
      console.log(`[AdminNote] Step 3c: Created 90-day re_engage task`)
    }

    if (classification.category === 'HOT_LEAD') {
      console.log(`[AdminNote] Step 3: HOT_LEAD — boosting lead`)
      // Set temperature to hot
      const { data: freshCtx } = await supabase
        .from('all_leads')
        .select('unified_context')
        .eq('id', leadId)
        .single()
      if (freshCtx) {
        await supabase
          .from('all_leads')
          .update({ unified_context: { ...(freshCtx.unified_context || {}), lead_temperature: 'hot' } })
          .eq('id', leadId)
      }
      actionsTaken.push(`Temperature set to hot`)

      // Update stage and boost score
      newStage = 'High Intent'
      newScore = 85
      await supabase
        .from('all_leads')
        .update({ lead_stage: newStage, stage_override: true, lead_score: newScore })
        .eq('id', leadId)
      actionsTaken.push(`Stage changed to High Intent`)
      actionsTaken.push(`Score updated to 85`)
      console.log(`[AdminNote] Step 3a: Stage → High Intent, Score → 85, Temp → hot`)

      // Check for existing booking
      const { data: bookingTasks } = await supabase
        .from('agent_tasks')
        .select('id')
        .eq('lead_id', leadId)
        .in('task_type', ['booking_reminder_24h', 'booking_reminder_30m'])
        .in('status', ['pending', 'completed'])
        .limit(1)
      const hasBooking = bookingTasks && bookingTasks.length > 0

      if (hasBooking) {
        await supabase.from('agent_tasks').insert({
          task_type: 'human_callback',
          task_description: `PREP: High-potential lead ${leadName} has a booking. Review before call.`,
          lead_id: leadId,
          lead_phone: leadPhone,
          lead_name: leadName,
          status: 'pending',
          scheduled_at: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
          metadata: { source: 'admin_note', trigger: 'high_potential', prep: true },
          created_at: now.toISOString(),
        })
        actions.push('high_potential:temp_hot,stage_High_Intent,score_85,prep_task_created')
        actionsTaken.push(`Created prep task — review before existing booking`)
        console.log(`[AdminNote] Step 3b: Created prep task (has existing booking)`)
      } else {
        await supabase.from('agent_tasks').insert({
          task_type: 'push_to_book',
          task_description: `Push to book: high-potential lead ${leadName}`,
          lead_id: leadId,
          lead_phone: leadPhone,
          lead_name: leadName,
          status: 'pending',
          scheduled_at: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
          metadata: { source: 'admin_note', trigger: 'high_potential' },
          created_at: now.toISOString(),
        })
        actions.push('high_potential:temp_hot,stage_High_Intent,score_85,push_to_book_1h')
        actionsTaken.push(`Created push-to-book task (1 hour)`)
        console.log(`[AdminNote] Step 3b: Created push_to_book task (no existing booking)`)
      }
    }

    if (classification.category === 'WARM_LATER') {
      console.log(`[AdminNote] Step 3: WARM_LATER — nurturing lead`)
      // Cancel existing tasks
      const { data: cancelledTasks } = await supabase
        .from('agent_tasks')
        .update({ status: 'cancelled', completed_at: now.toISOString(), error_message: `Cancelled: admin note "${trimmedNote.substring(0, 50)}"` })
        .eq('lead_id', leadId)
        .in('status', ['pending', 'queued', 'in_queue', 'awaiting_approval'])
        .select('id')
      const cancelCount = cancelledTasks?.length || 0
      if (cancelCount > 0) actionsTaken.push(`Cancelled ${cancelCount} pending tasks`)
      console.log(`[AdminNote] Step 3a: Cancelled ${cancelCount} tasks`)

      newStage = 'Nurture'
      await supabase
        .from('all_leads')
        .update({ lead_stage: newStage, stage_override: true })
        .eq('id', leadId)
      actionsTaken.push(`Stage changed to Nurture`)
      console.log(`[AdminNote] Step 3b: Stage → Nurture`)

      // Create 90-day check-in
      await supabase.from('agent_tasks').insert({
        task_type: 're_engage',
        task_description: `90-day check-in for ${leadName} (warm later)`,
        lead_id: leadId,
        lead_phone: leadPhone,
        lead_name: leadName,
        status: 'pending',
        scheduled_at: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: { source: 'admin_note', trigger: 'warm_later', quarterly: true },
        created_at: now.toISOString(),
      })
      actions.push(`warm_later:cancelled_${cancelCount}_tasks,stage_Nurture,re_engage_90d`)
      actionsTaken.push(`Scheduled 90-day check-in`)
      console.log(`[AdminNote] Step 3c: Created 90-day re_engage task`)
    }

    if (classification.category === 'RNR') {
      console.log(`[AdminNote] Step 3: RNR — creating follow-up sequence`)
      // Update last_touchpoint to voice (call attempt)
      await supabase
        .from('all_leads')
        .update({ last_touchpoint: 'voice', last_interaction_at: now.toISOString() })
        .eq('id', leadId)
      actionsTaken.push(`Marked last touchpoint as voice call`)

      // Cancel any remaining booking reminder tasks
      await supabase
        .from('agent_tasks')
        .update({ status: 'cancelled', completed_at: now.toISOString() })
        .eq('lead_id', leadId)
        .in('task_type', ['booking_reminder_24h', 'booking_reminder_30m'])
        .in('status', ['pending', 'queued'])

      // Create missed_call_followup in 30 minutes
      const { error: missedErr } = await supabase.from('agent_tasks').insert({
        task_type: 'missed_call_followup',
        task_description: `Missed call follow-up: ${trimmedNote}`,
        lead_id: leadId,
        lead_phone: leadPhone,
        lead_name: leadName,
        status: 'pending',
        scheduled_at: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
        metadata: { source: 'admin_note', sequence: 'no_show', step: 0, timing_reason: 'RNR — follow-up in 30 min' },
        created_at: now.toISOString(),
      })
      if (!missedErr) {
        actions.push('missed_call_followup_created')
        actionsTaken.push(`Created missed-call follow-up (30 min)`)
        console.log(`[AdminNote] Step 3a: Created missed_call_followup`)
      } else {
        console.error('[AdminNote] Failed to create missed_call_followup:', missedErr.message)
      }

      // Schedule follow-up sequence (day 1, 3, 5, 7)
      const rnrSequence = [
        { type: 'follow_up_day1', offsetMs: 1 * 24 * 60 * 60 * 1000, step: 1 },
        { type: 'follow_up_day3', offsetMs: 3 * 24 * 60 * 60 * 1000, step: 2 },
        { type: 'follow_up_day5', offsetMs: 5 * 24 * 60 * 60 * 1000, step: 3 },
        { type: 're_engage', offsetMs: 7 * 24 * 60 * 60 * 1000, step: 4 },
      ]
      for (const s of rnrSequence) {
        await supabase.from('agent_tasks').insert({
          task_type: s.type,
          task_description: `Sequence step ${s.step}/4: ${s.type} for ${leadName} (RNR)`,
          lead_id: leadId,
          lead_phone: leadPhone,
          lead_name: leadName,
          status: 'pending',
          scheduled_at: new Date(now.getTime() + s.offsetMs).toISOString(),
          metadata: { source: 'admin_note', sequence: 'rnr', step: s.step, total_steps: 4 },
          created_at: now.toISOString(),
        })
      }
      newStage = 'In Sequence'
      await supabase
        .from('all_leads')
        .update({ lead_stage: newStage })
        .eq('id', leadId)
      actions.push('sequence_created:rnr:4_steps')
      actionsTaken.push(`Created 4-step follow-up sequence (day 1, 3, 5, 7)`)
      actionsTaken.push(`Stage changed to In Sequence`)
      console.log(`[AdminNote] Step 3b: Created RNR sequence, Stage → In Sequence`)
    }

    if (classification.category === 'NOT_INTERESTED') {
      console.log(`[AdminNote] Step 3: NOT_INTERESTED — closing lead`)
      newStage = 'Closed Lost'
      await supabase
        .from('all_leads')
        .update({ lead_stage: newStage, stage_override: true })
        .eq('id', leadId)
      actions.push('stage_updated:Closed Lost')
      actionsTaken.push(`Stage changed to Closed Lost`)
      console.log(`[AdminNote] Step 3a: Stage → Closed Lost`)
    }

    if (classification.category === 'CONVERTED') {
      console.log(`[AdminNote] Step 3: CONVERTED — marking as won`)
      newStage = 'Converted'
      await supabase
        .from('all_leads')
        .update({ lead_stage: newStage, stage_override: true })
        .eq('id', leadId)
      actions.push('stage_updated:Converted')
      actionsTaken.push(`Stage changed to Converted`)
      console.log(`[AdminNote] Step 3a: Stage → Converted`)
    }

    if (classification.category === 'DEMO_TAKEN') {
      console.log(`[AdminNote] Step 3: DEMO_TAKEN — creating post-demo sequence`)
      // Cancel all pending follow-up tasks
      const { data: cancelledTasks } = await supabase
        .from('agent_tasks')
        .update({ status: 'cancelled', completed_at: now.toISOString(), error_message: `Cancelled: demo taken via admin note` })
        .eq('lead_id', leadId)
        .in('task_type', ['follow_up_day1', 'follow_up_day3', 'follow_up_day5', 'nudge_waiting', 'push_to_book', 'follow_up_24h'])
        .in('status', ['pending', 'queued', 'in_queue', 'awaiting_approval'])
        .select('id')
      const cancelCount = cancelledTasks?.length || 0
      if (cancelCount > 0) {
        actions.push(`cancelled_${cancelCount}_followup_tasks`)
        actionsTaken.push(`Cancelled ${cancelCount} pending follow-up tasks`)
        console.log(`[AdminNote] Step 3a: Cancelled ${cancelCount} tasks`)
      }

      // Update stage and score
      newStage = 'Demo Taken'
      newScore = 72
      await supabase
        .from('all_leads')
        .update({ lead_stage: newStage, stage_override: true, lead_score: newScore })
        .eq('id', leadId)
      actions.push('stage_updated:Demo Taken,score_72')
      actionsTaken.push(`Stage changed to Demo Taken`)
      actionsTaken.push(`Score updated to 72`)
      console.log(`[AdminNote] Step 3b: Stage → Demo Taken, Score → 72`)

      // Insert aggressive post-demo sequence
      const demoSequence = [
        { type: 'follow_up_day1',  offsetMs: 1 * 24 * 60 * 60 * 1000,            step: 1 },
        { type: 'try_voice_call',  offsetMs: 2 * 24 * 60 * 60 * 1000,            step: 2 },
        { type: 'follow_up_day3',  offsetMs: 3 * 24 * 60 * 60 * 1000,            step: 3 },
        { type: 'follow_up_day5',  offsetMs: 5 * 24 * 60 * 60 * 1000,            step: 4 },
      ]
      for (const s of demoSequence) {
        await supabase.from('agent_tasks').insert({
          task_type: s.type,
          task_description: `Post-demo step ${s.step}/4: ${s.type} for ${leadName}`,
          lead_id: leadId,
          lead_phone: leadPhone,
          lead_name: leadName,
          status: 'pending',
          scheduled_at: new Date(now.getTime() + s.offsetMs).toISOString(),
          metadata: { source: 'admin_note', sequence: 'post_demo', step: 0 },
          created_at: now.toISOString(),
        })
      }
      actions.push('sequence_created:post_demo:4_steps')
      actionsTaken.push(`Created 4-step post-demo sequence (day 1, voice day 2, day 3, day 5)`)
      console.log(`[AdminNote] Step 3c: Created post-demo sequence`)
    }

    if (classification.category === 'PROPOSAL_SENT') {
      console.log(`[AdminNote] Step 3: PROPOSAL_SENT — creating post-proposal sequence`)
      // Cancel all pending follow-up tasks
      const { data: cancelledTasks } = await supabase
        .from('agent_tasks')
        .update({ status: 'cancelled', completed_at: now.toISOString(), error_message: `Cancelled: proposal sent via admin note` })
        .eq('lead_id', leadId)
        .in('task_type', ['follow_up_day1', 'follow_up_day3', 'follow_up_day5', 'nudge_waiting', 'push_to_book', 'follow_up_24h'])
        .in('status', ['pending', 'queued', 'in_queue', 'awaiting_approval'])
        .select('id')
      const cancelCount = cancelledTasks?.length || 0
      if (cancelCount > 0) {
        actions.push(`cancelled_${cancelCount}_followup_tasks`)
        actionsTaken.push(`Cancelled ${cancelCount} pending follow-up tasks`)
        console.log(`[AdminNote] Step 3a: Cancelled ${cancelCount} tasks`)
      }

      // Update stage and score
      newStage = 'Proposal Sent'
      newScore = 80
      await supabase
        .from('all_leads')
        .update({ lead_stage: newStage, stage_override: true, lead_score: newScore })
        .eq('id', leadId)
      actions.push('stage_updated:Proposal Sent,score_80')
      actionsTaken.push(`Stage changed to Proposal Sent`)
      actionsTaken.push(`Score updated to 80`)
      console.log(`[AdminNote] Step 3b: Stage → Proposal Sent, Score → 80`)

      // Insert post-proposal sequence
      const proposalSequence = [
        { type: 'follow_up_day1', offsetMs: 1 * 24 * 60 * 60 * 1000,                      step: 1 },
        { type: 'try_voice_call', offsetMs: 1 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000, step: 2 },
        { type: 'follow_up_day3', offsetMs: 3 * 24 * 60 * 60 * 1000,                      step: 3 },
        { type: 'follow_up_day5', offsetMs: 5 * 24 * 60 * 60 * 1000,                      step: 4 },
      ]
      for (const s of proposalSequence) {
        await supabase.from('agent_tasks').insert({
          task_type: s.type,
          task_description: `Post-proposal step ${s.step}/4: ${s.type} for ${leadName}`,
          lead_id: leadId,
          lead_phone: leadPhone,
          lead_name: leadName,
          status: 'pending',
          scheduled_at: new Date(now.getTime() + s.offsetMs).toISOString(),
          metadata: { source: 'admin_note', sequence: 'post_proposal', step: 0 },
          created_at: now.toISOString(),
        })
      }
      actions.push('sequence_created:post_proposal:4_steps')
      actionsTaken.push(`Created 4-step post-proposal sequence (day 1, voice day 1+4h, day 3, day 5)`)
      console.log(`[AdminNote] Step 3c: Created post-proposal sequence`)
    }

    if (classification.category === 'MEETING_REQUEST') {
      console.log(`[AdminNote] Step 3: MEETING_REQUEST — sending WhatsApp + nudge`)
      if (leadPhone) {
        const msg = `${leadName}, we'd love to set up a call. What time works best for you this week?`
        const sendResult = await sendWhatsAppText(leadPhone, msg)
        if (sendResult.success) {
          actions.push('whatsapp_sent:meeting_request')
          actionsTaken.push(`Sent WhatsApp: meeting time request`)
          console.log(`[AdminNote] Step 3a: WhatsApp sent to ${leadPhone}`)
          await supabase.from('conversations').insert({
            lead_id: leadId,
            channel: 'whatsapp',
            sender: 'agent',
            content: msg,
            message_type: 'text',
            metadata: { source: 'admin_note', note: trimmedNote },
          })
        } else {
          actions.push(`whatsapp_failed:${sendResult.error?.substring(0, 50)}`)
          actionsTaken.push(`WhatsApp send failed`)
          console.error(`[AdminNote] Step 3a: WhatsApp failed:`, sendResult.error)
        }
      }
      // Create nudge_waiting task in 2 hours
      await supabase.from('agent_tasks').insert({
        task_type: 'nudge_waiting',
        task_description: `Nudge: asked for meeting time, no response yet (${leadName})`,
        lead_id: leadId,
        lead_phone: leadPhone,
        lead_name: leadName,
        status: 'pending',
        scheduled_at: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
        metadata: { source: 'admin_note', trigger: 'meeting_request' },
        created_at: now.toISOString(),
      })
      actions.push('nudge_waiting_created:2h')
      actionsTaken.push(`Created nudge task if no reply (2 hours)`)
      console.log(`[AdminNote] Step 3b: Created nudge_waiting task`)
    }

    if (classification.category === 'SEND_MESSAGE') {
      console.log(`[AdminNote] Step 3: SEND_MESSAGE — sending direct message`)
      const directMessage = classification.send_message?.trim()
      if (directMessage && leadPhone) {
        const sendResult = await sendWhatsAppText(leadPhone, directMessage)
        if (sendResult.success) {
          actions.push('whatsapp_sent:direct_message')
          actionsTaken.push(`Sent WhatsApp message to lead`)
          console.log(`[AdminNote] Step 3a: Direct message sent to ${leadPhone}`)
          await supabase.from('conversations').insert({
            lead_id: leadId,
            channel: 'whatsapp',
            sender: 'agent',
            content: directMessage,
            message_type: 'text',
            metadata: { source: 'admin_note', direct_send: true },
          })
        } else {
          actions.push(`whatsapp_failed:${sendResult.error?.substring(0, 50)}`)
          actionsTaken.push(`WhatsApp send failed`)
          console.error(`[AdminNote] Step 3a: WhatsApp failed:`, sendResult.error)
        }
      }
    }

    if (classification.category === 'NAME_UPDATE' && classification.name) {
      console.log(`[AdminNote] Step 3: NAME_UPDATE — updating name to "${classification.name}"`)
      const extractedName = classification.name.trim().replace(/\b\w/g, (c: string) => c.toUpperCase())
      if (extractedName.length >= 2) {
        await supabase
          .from('all_leads')
          .update({ customer_name: extractedName })
          .eq('id', leadId)
        actions.push(`name_updated:${extractedName}`)
        actionsTaken.push(`Name updated to ${extractedName}`)
        console.log(`[AdminNote] Step 3a: Name → ${extractedName}`)
      }
    }

    if (classification.category === 'INFO_ONLY') {
      actionsTaken.push(`Note saved — no automated actions needed`)
      console.log(`[AdminNote] Step 3: INFO_ONLY — no actions taken`)
    }

    // 6. Log action summary to activity feed
    if (actionsTaken.length > 0 && classification.category !== 'INFO_ONLY') {
      const actionSummary = `PROXe: Note detected '${trimmedNote.substring(0, 40)}${trimmedNote.length > 40 ? '...' : ''}' (${classification.category}) → ${actionsTaken.join(', ')}`
      await supabase.from('activities').insert({
        lead_id: leadId,
        activity_type: 'automation',
        note: actionSummary,
        created_by: 'PROXe AI',
      })
      console.log(`[AdminNote] Step 4: Activity logged`)
    }

    // 7. If any action was taken (beyond just classification), invalidate cached unified_summary
    let summaryRefreshed = false
    if (classification.category !== 'INFO_ONLY') {
      const { data: freshLead } = await supabase
        .from('all_leads')
        .select('unified_context')
        .eq('id', leadId)
        .single()

      if (freshLead) {
        const ctx = freshLead.unified_context || {}
        const { error: summaryErr } = await supabase
          .from('all_leads')
          .update({ unified_context: { ...ctx, unified_summary: null } })
          .eq('id', leadId)
        if (summaryErr) {
          console.error('[AdminNote] Failed to invalidate summary:', summaryErr.message)
        } else {
          summaryRefreshed = true
          actionsTaken.push(`Summary refresh triggered`)
          console.log(`[AdminNote] Step 5: Summary cache invalidated`)
        }
      }
    }

    console.log(`[AdminNote] Done. Category: ${classification.category}, Actions: ${actionsTaken.length}, Stage: ${newStage}, Score: ${newScore}`)

    return NextResponse.json({
      success: true,
      note: newNote,
      actions,
      actions_taken: actionsTaken,
      classification: { category: classification.category, summary: classification.summary },
      new_stage: newStage,
      new_score: newScore,
      summary_refreshed: summaryRefreshed,
    })
  } catch (error) {
    console.error('Error saving admin note:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/dashboard/leads/[id]/admin-notes
 * Remove an admin note by its id (or text+created_at fallback) from unified_context.admin_notes[].
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const leadId = params.id
    const body = await request.json()
    const { note_id, note_text, note_created_at } = body

    if (!note_id && !note_text) {
      return NextResponse.json({ error: 'note_id or note_text is required' }, { status: 400 })
    }

    const { data: lead, error: leadError } = await supabase
      .from('all_leads')
      .select('unified_context')
      .eq('id', leadId)
      .single()

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    const ctx = lead.unified_context || {}
    const notes: any[] = ctx.admin_notes || []

    // Find and remove the note by id, or fallback to text+created_at match
    const filtered = notes.filter((n: any) => {
      if (note_id && n.id === note_id) return false
      if (!note_id && n.text === note_text && n.created_at === note_created_at) return false
      return true
    })

    if (filtered.length === notes.length) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }

    const { error: updateError } = await supabase
      .from('all_leads')
      .update({ unified_context: { ...ctx, admin_notes: filtered } })
      .eq('id', leadId)

    if (updateError) throw updateError

    console.log(`[AdminNote] Deleted note for lead ${leadId}. ${notes.length} → ${filtered.length} notes`)

    return NextResponse.json({ success: true, remaining: filtered.length })
  } catch (error) {
    console.error('Error deleting admin note:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
