import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendWhatsAppText } from '@/lib/services/whatsappSender'

export const dynamic = 'force-dynamic'

/**
 * Parse a time reference from note text and return a scheduled_at Date in IST.
 * Returns null if no actionable time reference found.
 */
function parseCallbackTime(noteText: string): Date | null {
  const lower = noteText.toLowerCase()
  const now = new Date()
  // IST offset: UTC+5:30
  const istOffsetMs = 5.5 * 60 * 60 * 1000
  const nowIST = new Date(now.getTime() + istOffsetMs)

  // "call back at 5" / "call at 3" → today at that hour PM IST
  const atTimeMatch = lower.match(/(?:call\s*(?:back)?|follow\s*up)\s*(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
  if (atTimeMatch) {
    let hour = parseInt(atTimeMatch[1])
    const minutes = atTimeMatch[2] ? parseInt(atTimeMatch[2]) : 0
    const ampm = atTimeMatch[3]?.toLowerCase()
    if (ampm === 'am' && hour === 12) hour = 0
    else if (ampm === 'pm' && hour !== 12) hour += 12
    else if (!ampm && hour >= 1 && hour <= 8) hour += 12 // assume PM for business hours

    const scheduled = new Date(nowIST)
    scheduled.setUTCHours(hour, minutes, 0, 0)
    // Convert from IST back to UTC
    return new Date(scheduled.getTime() - istOffsetMs)
  }

  // "call tomorrow" / "follow up tomorrow" → tomorrow 10 AM IST
  if (lower.includes('tomorrow')) {
    const tomorrow = new Date(nowIST)
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
    tomorrow.setUTCHours(10, 0, 0, 0)
    return new Date(tomorrow.getTime() - istOffsetMs)
  }

  // "follow up in X days" / "call in X days" → X days from now at 10 AM IST
  const inDaysMatch = lower.match(/(?:follow\s*up|call\s*(?:back)?)\s*in\s+(\d+)\s*days?/)
  if (inDaysMatch) {
    const days = parseInt(inDaysMatch[1])
    const future = new Date(nowIST)
    future.setUTCDate(future.getUTCDate() + days)
    future.setUTCHours(10, 0, 0, 0)
    return new Date(future.getTime() - istOffsetMs)
  }

  // Generic match with no specific time → tomorrow 10 AM IST
  const tomorrow = new Date(nowIST)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  tomorrow.setUTCHours(10, 0, 0, 0)
  return new Date(tomorrow.getTime() - istOffsetMs)
}

/**
 * Check if note text contains callback/follow-up intent keywords.
 */
function hasCallbackIntent(noteText: string): boolean {
  const lower = noteText.toLowerCase()
  return /call\s*back|call\s*at\s+\d|call\s*tomorrow|follow\s*up/.test(lower)
}

/**
 * POST /api/dashboard/leads/[id]/admin-notes
 * Add an admin note to a lead - dual-writes to unified_context.admin_notes[] and activities table.
 * Parses note text for actionable intent (callbacks, stage changes) via keyword matching.
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
    const lowerNote = trimmedNote.toLowerCase()

    // 1. Fetch current lead data (unified_context + lead info for task creation)
    const { data: lead, error: leadError } = await supabase
      .from('all_leads')
      .select('unified_context, customer_name, customer_phone_normalized, phone')
      .eq('id', leadId)
      .single()

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    // 2. Append to unified_context.admin_notes[]
    const existingCtx = lead.unified_context || {}
    const existingNotes = existingCtx.admin_notes || []
    const newNote = {
      text: trimmedNote,
      created_by: createdBy,
      created_at: new Date().toISOString(),
    }

    const updatedCtx = {
      ...existingCtx,
      admin_notes: [...existingNotes, newNote],
    }

    // 3. Update all_leads with new note
    const { error: updateError } = await supabase
      .from('all_leads')
      .update({ unified_context: updatedCtx })
      .eq('id', leadId)

    if (updateError) throw updateError

    // 4. Also insert into activities table (appears in Activity tab)
    await supabase
      .from('activities')
      .insert({
        lead_id: leadId,
        activity_type: 'note',
        note: trimmedNote,
        created_by: createdBy,
      })

    // 5. Parse note for actionable intent (keyword matching, no AI calls)
    const actions: string[] = []
    const leadPhone = lead.customer_phone_normalized || lead.phone?.replace(/\D/g, '').slice(-10) || null
    const leadName = lead.customer_name || 'Lead'
    const now = new Date()

    // 5a. Callback / follow-up intent → create agent_tasks
    if (hasCallbackIntent(lowerNote)) {
      const scheduledAt = parseCallbackTime(trimmedNote)
      if (scheduledAt) {
        const { error: taskError } = await supabase
          .from('agent_tasks')
          .insert({
            task_type: 'human_callback',
            task_description: trimmedNote,
            lead_id: leadId,
            lead_phone: leadPhone,
            lead_name: leadName,
            status: 'pending',
            scheduled_at: scheduledAt.toISOString(),
            metadata: { source: 'admin_note' },
            created_at: now.toISOString(),
          })
        if (taskError) {
          console.error('[AdminNote] Failed to create callback task:', taskError.message)
        } else {
          actions.push(`callback_task_created:${scheduledAt.toISOString()}`)
        }
      }
    }

    // 5b. "spoke to" / "just called" / "had a call" → completed call, post-call followup
    if (/spoke\s*to|just\s*called|had\s*a\s*call/.test(lowerNote)) {
      await supabase
        .from('all_leads')
        .update({ last_touchpoint: 'voice', last_interaction_at: now.toISOString() })
        .eq('id', leadId)
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
      if (!taskError) actions.push('post_call_followup_created')
      else console.error('[AdminNote] Failed to create post_call_followup:', taskError.message)
    }

    // 5b2. "no show" / "didnt show" / "didn't show" / "no answer" / "didnt pick up" / "didn't pick up"
    //      → missed call followup (immediate) + follow-up sequence (day 1, 3, 5, 7)
    if (/no\s*show|didn'?t\s*show|no\s*answer|didn'?t\s*pick\s*up/.test(lowerNote)) {
      // Cancel any remaining booking reminder tasks for this lead
      await supabase
        .from('agent_tasks')
        .update({ status: 'cancelled', completed_at: now.toISOString() })
        .eq('lead_id', leadId)
        .in('task_type', ['booking_reminder_24h', 'booking_reminder_30m'])
        .in('status', ['pending', 'queued'])

      // Create immediate missed_call_followup
      const { error: missedErr } = await supabase.from('agent_tasks').insert({
        task_type: 'missed_call_followup',
        task_description: `Missed call follow-up: ${trimmedNote}`,
        lead_id: leadId,
        lead_phone: leadPhone,
        lead_name: leadName,
        status: 'pending',
        scheduled_at: now.toISOString(),
        metadata: { source: 'admin_note', sequence: 'no_show', step: 0 },
        created_at: now.toISOString(),
      })
      if (!missedErr) actions.push('missed_call_followup_created')
      else console.error('[AdminNote] Failed to create missed_call_followup:', missedErr.message)

      // Schedule follow-up sequence (day 1, 3, 5, 7)
      const noShowSequence = [
        { type: 'follow_up_day1', offsetMs: 1 * 24 * 60 * 60 * 1000, step: 1 },
        { type: 'follow_up_day3', offsetMs: 3 * 24 * 60 * 60 * 1000, step: 2 },
        { type: 'follow_up_day5', offsetMs: 5 * 24 * 60 * 60 * 1000, step: 3 },
        { type: 're_engage', offsetMs: 7 * 24 * 60 * 60 * 1000, step: 4 },
      ]
      for (const s of noShowSequence) {
        await supabase.from('agent_tasks').insert({
          task_type: s.type,
          task_description: `Sequence step ${s.step}/4: ${s.type} for ${leadName} (no-show)`,
          lead_id: leadId,
          lead_phone: leadPhone,
          lead_name: leadName,
          status: 'pending',
          scheduled_at: new Date(now.getTime() + s.offsetMs).toISOString(),
          metadata: { source: 'admin_note', sequence: 'no_show', step: s.step, total_steps: 4 },
          created_at: now.toISOString(),
        })
      }
      await supabase
        .from('all_leads')
        .update({ lead_stage: 'In Sequence' })
        .eq('id', leadId)
      actions.push('sequence_created:no_show:4_steps')
    }

    // 5c. Name extraction: "it's [name]" / "name is [name]" / "his/her name is [name]"
    const nameMatch = lowerNote.match(/(?:it'?s|(?:his|her|their)?\s*name\s*is)\s+([a-z][a-z\s]{1,30})/i)
    if (nameMatch) {
      const extractedName = trimmedNote.substring(
        trimmedNote.toLowerCase().indexOf(nameMatch[1].toLowerCase()),
        trimmedNote.toLowerCase().indexOf(nameMatch[1].toLowerCase()) + nameMatch[1].length
      ).trim().replace(/\b\w/g, c => c.toUpperCase())
      if (extractedName.length >= 2) {
        await supabase
          .from('all_leads')
          .update({ customer_name: extractedName })
          .eq('id', leadId)
        actions.push(`name_updated:${extractedName}`)
      }
    }

    // 5d. "not responding" / "not replying" / "no response" → follow-up sequence
    if (/not\s*respond|not\s*reply|no\s*response/.test(lowerNote)) {
      const sequenceSteps = [
        { type: 'follow_up_day1', offsetMs: 24 * 60 * 60 * 1000, step: 1 },
        { type: 'follow_up_day3', offsetMs: 3 * 24 * 60 * 60 * 1000, step: 2 },
        { type: 'follow_up_day5', offsetMs: 5 * 24 * 60 * 60 * 1000, step: 3 },
        { type: 're_engage', offsetMs: 7 * 24 * 60 * 60 * 1000, step: 4 },
      ]
      for (const s of sequenceSteps) {
        await supabase.from('agent_tasks').insert({
          task_type: s.type,
          task_description: `Sequence step ${s.step}/4: ${s.type} for ${leadName}`,
          lead_id: leadId,
          lead_phone: leadPhone,
          lead_name: leadName,
          status: 'pending',
          scheduled_at: new Date(now.getTime() + s.offsetMs).toISOString(),
          metadata: { source: 'admin_note', sequence: 'no_response', step: s.step, total_steps: 4 },
          created_at: now.toISOString(),
        })
      }
      // Set lead stage to In Sequence
      await supabase
        .from('all_leads')
        .update({ lead_stage: 'In Sequence' })
        .eq('id', leadId)
      actions.push('sequence_created:no_response:4_steps')
    }

    // 5e. "not interested" / "lost" / "dead lead" → Closed Lost
    if (/not\s*interested|dead\s*lead/.test(lowerNote)) {
      await supabase
        .from('all_leads')
        .update({ lead_stage: 'Closed Lost', stage_override: true })
        .eq('id', leadId)
      actions.push('stage_updated:Closed Lost')
    }

    // 5f. "converted" / "signed" / "closed won" / "deal done" → Converted
    if (/converted|signed|closed\s*won|deal\s*done/.test(lowerNote)) {
      await supabase
        .from('all_leads')
        .update({ lead_stage: 'Converted', stage_override: true })
        .eq('id', leadId)
      actions.push('stage_updated:Converted')
    }

    // 5g. MEETING/TIME REQUESTED → send WhatsApp + nudge_waiting in 2h
    if (/asked?\s*for\s*(?:a?\s*)?meet|asked?\s*for\s*(?:a?\s*)?time|wants?\s*a?\s*call|wants?\s*to\s*meet|send\s*(?:them|him|her)?\s*time|get\s*a?\s*time|asked?\s*for\s*google\s*meet|schedule\s*a?\s*call/.test(lowerNote)) {
      if (leadPhone) {
        const msg = `${leadName}, we'd love to set up a call. What time works best for you this week?`
        const sendResult = await sendWhatsAppText(leadPhone, msg)
        if (sendResult.success) {
          actions.push('whatsapp_sent:meeting_request')
          // Log the sent message to conversations
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
    }

    // 5h. NOT POTENTIAL → cancel ALL tasks, set Cold, re_engage in 90 days
    if (/not\s*potential|not\s*a\s*fit|too\s*small|no\s*budget|waste\s*of\s*time|low\s*priority/.test(lowerNote)) {
      // Cancel ALL pending/queued/awaiting_approval tasks
      const { data: cancelledTasks } = await supabase
        .from('agent_tasks')
        .update({ status: 'cancelled', completed_at: now.toISOString(), error_message: `Cancelled: admin note "${trimmedNote.substring(0, 50)}"` })
        .eq('lead_id', leadId)
        .in('status', ['pending', 'queued', 'in_queue', 'awaiting_approval'])
        .select('id')
      const cancelCount = cancelledTasks?.length || 0

      await supabase
        .from('all_leads')
        .update({ lead_stage: 'Cold', stage_override: true })
        .eq('id', leadId)

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
      actions.push(`not_potential:cancelled_${cancelCount}_tasks,stage_Cold,re_engage_90d`)
    }

    // 5i. LOW POTENTIAL → cancel tasks, set Cold, re_engage in 30 days
    if (/maybe\s*later|check\s*back\s*later|not\s*now\s*but\s*maybe|low\s*potential|follow\s*up\s*later/.test(lowerNote)) {
      const { data: cancelledTasks } = await supabase
        .from('agent_tasks')
        .update({ status: 'cancelled', completed_at: now.toISOString(), error_message: `Cancelled: admin note "${trimmedNote.substring(0, 50)}"` })
        .eq('lead_id', leadId)
        .in('status', ['pending', 'queued', 'in_queue', 'awaiting_approval'])
        .select('id')
      const cancelCount = cancelledTasks?.length || 0

      await supabase
        .from('all_leads')
        .update({ lead_stage: 'Cold', stage_override: true })
        .eq('id', leadId)

      // Create monthly re_engage (30 days)
      await supabase.from('agent_tasks').insert({
        task_type: 're_engage',
        task_description: `Monthly check-in for ${leadName} (low potential)`,
        lead_id: leadId,
        lead_phone: leadPhone,
        lead_name: leadName,
        status: 'pending',
        scheduled_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: { source: 'admin_note', trigger: 'low_potential', monthly: true },
        created_at: now.toISOString(),
      })
      actions.push(`low_potential:cancelled_${cancelCount}_tasks,stage_Cold,re_engage_30d`)
    }

    // 5j. HIGH POTENTIAL → hot temperature, shorten timers, push_to_book or prep
    if (/hot\s*lead|very\s*interested|wants?\s*to\s*start|ready\s*to\s*go|priority|close\s*this\s*week/.test(lowerNote)) {
      // Set temperature to hot in unified_context
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
        // Create prep task for the team
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
        actions.push('high_potential:temp_hot,prep_task_created')
      } else {
        // Create push_to_book in 1 hour
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
        actions.push('high_potential:temp_hot,push_to_book_1h')
      }
    }

    // 5k. PRICING DISCUSSION → send WhatsApp with call CTA
    if (/asked?\s*about\s*pricing|wants?\s*pricing|send\s*pricing|quote\s*needed/.test(lowerNote)) {
      if (leadPhone) {
        const msg = `${leadName}, thanks for your interest. Let's hop on a quick call so we can walk you through what works best for your business. When's good?`
        const sendResult = await sendWhatsAppText(leadPhone, msg)
        if (sendResult.success) {
          actions.push('whatsapp_sent:pricing_response')
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
        }
      }
    }

    // 5l. SEND MESSAGE → "send:" / "message:" / "tell them" → send exact text
    const sendMatch = trimmedNote.match(/^(?:send\s*:|message\s*:|tell\s*them\s*)(.*)/i)
    if (sendMatch) {
      const directMessage = sendMatch[1].trim()
      if (directMessage && leadPhone) {
        const sendResult = await sendWhatsAppText(leadPhone, directMessage)
        if (sendResult.success) {
          actions.push('whatsapp_sent:direct_message')
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
        }
      }
    }

    // 6. Log action summary to activity feed
    if (actions.length > 0) {
      const actionSummary = `PROXe: Note detected '${trimmedNote.substring(0, 40)}${trimmedNote.length > 40 ? '...' : ''}' → ${actions.join(', ')}`
      await supabase.from('activities').insert({
        lead_id: leadId,
        activity_type: 'automation',
        note: actionSummary,
        created_by: 'PROXe AI',
      })
    }

    // 7. If any action was taken, invalidate cached unified_summary
    if (actions.length > 0) {
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
        }
      }
    }

    return NextResponse.json({ success: true, note: newNote, actions })
  } catch (error) {
    console.error('Error saving admin note:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
