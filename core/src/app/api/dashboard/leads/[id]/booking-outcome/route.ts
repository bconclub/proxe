import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'
import { BRAND_ID } from '@/configs'
import { scopedQuery } from '@/lib/server/workspace'

export const dynamic = 'force-dynamic'

/**
 * POST /api/dashboard/leads/[id]/booking-outcome
 * Body: { outcome: 'done' | 'no_show' | 'rebooked', note?: string }
 *
 * Answers the pipeline's "this booking was yesterday - did it happen?"
 * prompt. Nothing else in the system knows: a booking date passing is not
 * evidence of anything, so 149 past bookings sit unresolved and the Demo Done
 * and No Show tiles read 0 forever. The system deliberately does NOT decide
 * this for itself - it asks the owner.
 *
 * Effects:
 *   done      -> lead_stage 'Demo Taken'
 *   no_show   -> lead_stage 'No Show'
 *   rebooked  -> stage untouched (still 'Booking Made'); clears the answer so
 *                the new date re-enters the queue when it passes
 *
 * The answer is stored on unified_context[BRAND_ID].booking_outcome with who
 * and when, keyed by the booking date it answers - so a lead that books again
 * later is asked again rather than being silently treated as settled.
 */
const OUTCOMES = {
  done: { stage: 'Demo Taken', label: 'Attended' },
  no_show: { stage: 'No Show', label: 'Did not turn up' },
  rebooked: { stage: null as string | null, label: 'Rebooked' },
} as const

type OutcomeKey = keyof typeof OUTCOMES

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { outcome, note, booking_date } = (await request.json()) as {
      outcome?: string
      note?: string
      booking_date?: string
    }
    if (!outcome || !(outcome in OUTCOMES)) {
      return NextResponse.json(
        { error: `Invalid outcome. Must be one of: ${Object.keys(OUTCOMES).join(', ')}` },
        { status: 400 },
      )
    }
    const cfg = OUTCOMES[outcome as OutcomeKey]
    // Cast: this project's typed Supabase client makes every .from() call
    // non-callable to tsc (the same shape as ~90 pre-existing errors
    // elsewhere). Casting keeps this new file clean.
    const supabase: any = getServiceClient() || authClient
    const leadId = params.id
    const now = new Date().toISOString()

    const { data: lead, error: readErr } = await (await scopedQuery(
      supabase
        .from('all_leads')
        .select('unified_context, lead_stage, owner_id')
        .eq('id', leadId)
    )).maybeSingle()
    if (readErr || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    const ctx: any = lead.unified_context || {}
    const brandCtx: any = ctx[BRAND_ID] || {}

    const updates: Record<string, any> = {
      unified_context: {
        ...ctx,
        [BRAND_ID]: {
          ...brandCtx,
          booking_outcome:
            outcome === 'rebooked'
              ? null
              : {
                  outcome,
                  // Stamped with the booking this answers, so a later booking
                  // asks again instead of inheriting this answer.
                  for_booking_date: booking_date || null,
                  note: note || null,
                  by: user.id,
                  at: now,
                },
        },
      },
    }

    // Answering IS a touch - whoever resolves it owns the lead from here,
    // unless someone already does.
    if (!lead.owner_id) updates.owner_id = user.id

    if (cfg.stage) {
      updates.lead_stage = cfg.stage
      updates.stage_override = true
    }

    const { error: writeErr } = await supabase.from('all_leads').update(updates).eq('id', leadId)
    if (writeErr) return NextResponse.json({ error: writeErr.message }, { status: 500 })

    // Visible trail, same table the call/note history reads.
    await supabase.from('activities').insert({
      lead_id: leadId,
      activity_type: 'note',
      note: `Booking outcome: ${cfg.label}${note ? ` - ${note}` : ''}`,
      created_by: user.id,
      created_at: now,
    }).then(undefined, () => { /* soft-fail: the outcome itself is stored */ })

    if (cfg.stage && lead.lead_stage !== cfg.stage) {
      await supabase.from('lead_stage_changes').insert({
        lead_id: leadId,
        old_stage: lead.lead_stage || null,
        new_stage: cfg.stage,
        changed_by: user.id,
        created_at: now,
      }).then(undefined, () => { /* soft-fail */ })
    }

    return NextResponse.json({ success: true, outcome, stage: cfg.stage })
  } catch (err: any) {
    console.error('[booking-outcome] failed:', err?.message || err)
    return NextResponse.json({ error: err?.message || 'unknown' }, { status: 500 })
  }
}
