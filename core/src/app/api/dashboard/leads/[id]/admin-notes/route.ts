/**
 * Admin notes - thin wrapper around the shared noteOrchestrator.
 * Saves the note + delegates classification & actions to lib/services/noteOrchestrator.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { classifyAndAct, getServiceClient } from '@/lib/services'
import { assignOwnerOnTouch } from '@/lib/services/leadOwnership'
import { canAccessLeadId } from '@/lib/services/leadAccess'

export const dynamic = 'force-dynamic'

/**
 * POST /api/dashboard/leads/[id]/admin-notes
 * Add an admin note to a lead - dual-writes to unified_context.admin_notes[] and activities table,
 * then runs the shared note orchestrator (AI classification + actions).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Auth check via cookie-bound client (so we can capture user.email
    // for the note's created_by). DB writes use service-role to bypass RLS
    // - the cookie client occasionally returns 0 affected rows + no error
    // when RLS quirks (e.g. PostgREST scoping) hit, leaving the note in
    // limbo. Service-role is consistent with other dashboard routes.
    const authClient = await createClient()
    const {
      data: { user },
    } = await authClient.auth.getUser()
    const createdBy = user?.email || 'system'

    const supabase = getServiceClient() || authClient

    const leadId = params.id

    // Lead-type access: restricted users can't act on leads outside their courses.
    if (user?.id && !(await canAccessLeadId(supabase, user.id, leadId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { note } = body

    if (!note?.trim()) {
      return NextResponse.json({ error: 'Note is required' }, { status: 400 })
    }

    const trimmedNote = note.trim()

    // 1. Fetch current lead data for duplicate guard + existing notes
    const { data: lead, error: leadError } = await supabase
      .from('all_leads')
      .select('unified_context')
      .eq('id', leadId)
      .single()

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    const existingCtx = lead.unified_context || {}
    const existingNotes: any[] = existingCtx.admin_notes || []

    // 2. Duplicate guard - same text in last 30 seconds
    const thirtySecsAgo = new Date(Date.now() - 30000).toISOString()
    const isDuplicate = existingNotes.some(
      (n: any) => n.text === trimmedNote && n.created_at > thirtySecsAgo,
    )
    if (isDuplicate) {
      return NextResponse.json({
        success: true,
        note: existingNotes[existingNotes.length - 1],
        actions: [],
        actions_taken: ['Duplicate note - skipped'],
        classification: { category: 'INFO_ONLY', summary: null },
        new_stage: null,
        new_score: null,
        summary_refreshed: false,
      })
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
    const { error: updateError } = await supabase
      .from('all_leads')
      .update({ unified_context: updatedCtx })
      .eq('id', leadId)
    if (updateError) throw updateError

    // 4. Insert into activities table. created_by is a UUID column - pass the
    // user id or null, never the email/'system' (that throws 22P02 and 500s).
    // The readable author lives on the unified_context.admin_notes entry above.
    const { error: activityError } = await supabase.from('activities').insert({
      lead_id: leadId,
      activity_type: 'note',
      note: trimmedNote,
      created_by: user?.id || null,
    })
    if (activityError) throw activityError

    // Adding a note = "I'm working this lead now" → become the owner.
    // Done BEFORE the orchestrator so its fresh context re-read keeps the owner.
    await assignOwnerOnTouch(supabase, leadId, user)

    // 5. Run the shared orchestrator (classify + act)
    const result = await classifyAndAct({
      leadId,
      text: trimmedNote,
      createdBy,
      supabase: supabase as any,
    })

    return NextResponse.json({
      success: true,
      note: newNote,
      ...result,
    })
  } catch (error) {
    console.error('Error saving admin note:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}

/**
 * DELETE /api/dashboard/leads/[id]/admin-notes
 * Remove an admin note by its id (or text+created_at fallback) from unified_context.admin_notes[].
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    // Same service-role bypass as POST - RLS occasionally swallows the
    // update without surfacing an error.
    const supabase = getServiceClient() || (await createClient())
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

    return NextResponse.json({ success: true, remaining: filtered.length })
  } catch (error) {
    console.error('Error deleting admin note:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
