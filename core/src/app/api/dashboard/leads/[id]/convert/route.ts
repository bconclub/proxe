import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessLeadId } from '@/lib/services/leadAccess'
import { assignOwnerOnTouch } from '@/lib/services/leadOwnership'

/**
 * POST /api/dashboard/leads/[id]/convert
 *
 * Explicit "Convert lead" action (the + menu in the lead modal). Unlike the
 * generic stage dropdown, this is a first-class conversion: it records WHEN it
 * converted and the deal details, stops all autonomous follow-ups, and logs it.
 *
 * Body: { converted_at?: ISO date, program?, amount?, currency?, notes? }
 *   converted_at — the conversion date (defaults to now).
 *   program      — what they converted to (e.g. "October CPL batch").
 *   amount       — deal value (number, optional).
 *   notes        — free text.
 *
 * Effects:
 *   - lead_stage = 'Closed Won' (stage_override=true)
 *   - converted_at column (soft-fail if a brand's DB lacks it — migration 037)
 *   - unified_context.conversion = { at, program, amount, currency, notes, by }
 *     (always stored, no migration needed — the durable source of truth)
 *   - cancels pending follow-up tasks
 *   - logs a stage change + an activity note
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const leadId = params.id
    if (!(await canAccessLeadId(supabase, user.id, leadId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const convertedAt = (typeof body.converted_at === 'string' && body.converted_at.trim())
      ? new Date(body.converted_at).toISOString()
      : new Date().toISOString()
    const program = typeof body.program === 'string' ? body.program.trim() : ''
    const amountRaw = body.amount
    const amount = amountRaw != null && amountRaw !== '' && !isNaN(Number(amountRaw)) ? Number(amountRaw) : null
    const currency = typeof body.currency === 'string' && body.currency.trim() ? body.currency.trim() : 'INR'
    const notes = typeof body.notes === 'string' ? body.notes.trim() : ''

    const { data: lead, error: fetchErr } = await supabase
      .from('all_leads')
      .select('lead_stage, unified_context')
      .eq('id', leadId)
      .single()
    if (fetchErr || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    const oldStage = lead.lead_stage
    const conversion = {
      at: convertedAt,
      ...(program ? { program } : {}),
      ...(amount != null ? { amount, currency } : {}),
      ...(notes ? { notes } : {}),
      converted_by: user.email || user.id,
    }

    // 1. Stage → Converted + conversion details in unified_context (always works).
    const { error: updErr } = await supabase
      .from('all_leads')
      .update({
        lead_stage: 'Closed Won',
        stage_override: true,
        is_manual_override: true,
        unified_context: { ...(lead.unified_context || {}), conversion },
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId)
    if (updErr) {
      console.error('[convert] update failed:', updErr.message)
      return NextResponse.json({ error: 'Failed to convert lead' }, { status: 500 })
    }

    // 2. converted_at column — separate soft-fail write (brands may not have run
    //    migration 037 yet; never block the conversion on a missing column).
    const { error: colErr } = await supabase
      .from('all_leads')
      .update({ converted_at: convertedAt })
      .eq('id', leadId)
    if (colErr) console.warn(`[convert] converted_at column not written (run migration 037): ${colErr.message}`)

    // 3. Stop autonomous follow-ups — a won lead shouldn't get nudged.
    const { data: cancelled } = await supabase
      .from('agent_tasks')
      .update({ status: 'cancelled', completed_at: new Date().toISOString(), error_message: 'Cancelled: lead converted' })
      .eq('lead_id', leadId)
      .in('status', ['pending', 'queued', 'in_queue', 'awaiting_approval'])
      .select('id')

    // 4. Ownership + logs.
    await assignOwnerOnTouch(supabase, leadId, user).catch(() => {})

    const detailParts = [
      program ? program : null,
      amount != null ? `${currency} ${amount}` : null,
      notes || null,
    ].filter(Boolean)
    await supabase.from('activities').insert({
      lead_id: leadId,
      activity_type: 'note',
      created_by: user.id || null,
      note: `Closed Won on ${convertedAt.slice(0, 10)}${detailParts.length ? ' — ' + detailParts.join(' · ') : ''}`,
    }).then(() => {}, () => {})

    if (oldStage !== 'Closed Won') {
      await supabase.from('lead_stage_changes').insert({
        lead_id: leadId,
        old_stage: oldStage,
        new_stage: 'Closed Won',
        changed_by: user.id,
        is_automatic: false,
        change_reason: `Converted via Convert action${detailParts.length ? ': ' + detailParts.join(' · ') : ''}`,
      }).then(() => {}, () => {})
    }

    return NextResponse.json({
      success: true,
      converted_at: convertedAt,
      cancelled_tasks: cancelled?.length || 0,
      conversion,
    })
  } catch (error: any) {
    console.error('[convert] Error:', error?.message || error)
    return NextResponse.json({ error: 'Failed to convert lead' }, { status: 500 })
  }
}
