import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { id } = params

    const { data, error } = await supabase
      .from('all_leads')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    if (!data) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    return NextResponse.json({
      ...data,
      name: data.customer_name || data.name || null,
      source: data.first_touchpoint || data.last_touchpoint || 'whatsapp',
    })
  } catch (error) {
    console.error('[leads/[id]] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch lead' }, { status: 500 })
  }
}

// PATCH handler — update editable lead fields from the dashboard
//
// Supported body fields:
//   customer_name → renames the lead
//   email         → updates email
//   city          → unified_context.<brand>.city
//   session_type  → unified_context.<brand>.session_type (online | offline)
//
// Stamps last_actor with the editor's identity so LAST TOUCH shows who
// made the change.
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const userSupabase = await createClient()
    const {
      data: { user },
    } = await userSupabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const service = getServiceClient()
    if (!service) {
      return NextResponse.json({ error: 'Service client unavailable' }, { status: 500 })
    }

    const leadId = params.id
    const body = await request.json()

    const { data: lead, error: fetchErr } = await service
      .from('all_leads')
      .select('id, customer_name, email, unified_context, brand')
      .eq('id', leadId)
      .maybeSingle()
    if (fetchErr || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    const updates: Record<string, any> = {}
    const auditChanges: string[] = []
    const ctx = lead.unified_context || {}
    const brand = lead.brand || 'windchasers'
    const brandCtx = ctx[brand] || ctx.windchasers || ctx.bcon || {}
    const newBrandCtx: Record<string, any> = { ...brandCtx }
    let ctxChanged = false

    if (body.customer_name !== undefined) {
      const name = String(body.customer_name || '').trim()
      updates.customer_name = name || null
      if ((lead.customer_name || null) !== (updates.customer_name || null)) {
        auditChanges.push(`Name: ${lead.customer_name || 'empty'} -> ${updates.customer_name || 'empty'}`)
      }
    }
    if (body.email !== undefined) {
      const email = String(body.email || '').trim().toLowerCase() || null
      updates.email = email
      if ((lead.email || null) !== email) {
        auditChanges.push(`Email: ${lead.email || 'empty'} -> ${email || 'empty'}`)
      }
    }
    if (body.city !== undefined) {
      const previous = brandCtx.city || null
      const city = String(body.city || '').trim() || null
      newBrandCtx.city = city
      ctxChanged = true
      if (previous !== city) auditChanges.push(`City: ${previous || 'empty'} -> ${city || 'empty'}`)
    }
    if (body.session_type !== undefined) {
      const previous = brandCtx.session_type || null
      const t = String(body.session_type || '').trim().toLowerCase()
      newBrandCtx.session_type = ['online', 'offline'].includes(t) ? t : null
      ctxChanged = true
      if (previous !== newBrandCtx.session_type) {
        auditChanges.push(`Session type: ${previous || 'empty'} -> ${newBrandCtx.session_type || 'empty'}`)
      }
    }
    if (body.application_status !== undefined) {
      const previous = brandCtx.application_status || null
      const s = String(body.application_status || '').trim().toLowerCase()
      const allowed = [
        'demo_booked',
        'demo_done_online',
        'demo_done_offline',
        'registration_pending',
        'registration_done',
        'joined',
      ]
      newBrandCtx.application_status = allowed.includes(s) ? s : null
      ctxChanged = true
      if (previous !== newBrandCtx.application_status) {
        auditChanges.push(`Application status: ${previous || 'empty'} -> ${newBrandCtx.application_status || 'empty'}`)
      }
    }
    if (body.class_12_pcm !== undefined) {
      const previous = brandCtx.class_12_pcm || null
      const c = String(body.class_12_pcm || '').trim().toLowerCase()
      const allowed = ['12th_pcm', '12th_non_pcm', 'pursuing_12_pcm', 'below_12th', 'unknown']
      newBrandCtx.class_12_pcm = allowed.includes(c) ? c : null
      ctxChanged = true
      if (previous !== newBrandCtx.class_12_pcm) {
        auditChanges.push(`Education: ${previous || 'empty'} -> ${newBrandCtx.class_12_pcm || 'empty'}`)
      }
    }

    if (Object.keys(updates).length === 0 && !ctxChanged) {
      return NextResponse.json({ error: 'No supported fields to update' }, { status: 400 })
    }

    const editorName = (user.email || 'User').split('@')[0]
      .replace(/[._-]+/g, ' ')
      .replace(/\b\w/g, (c: string) => c.toUpperCase())
    const newCtx = {
      ...ctx,
      ...(ctxChanged ? { [brand]: newBrandCtx } : {}),
      last_actor: {
        type: 'user',
        email: user.email,
        name: editorName,
        at: new Date().toISOString(),
        source: 'lead_edit',
      },
    }
    updates.unified_context = newCtx
    // NOTE: do NOT touch last_interaction_at here. That column tracks the
    // CUSTOMER's last activity (the "Active" column / time-ago). A manual
    // dashboard edit (name/email/city/etc.) is not customer activity — bumping
    // it made every edited lead jump to "now". The edit is recorded in
    // unified_context.last_actor + the activities audit instead.

    const { error: upErr } = await service
      .from('all_leads')
      .update(updates)
      .eq('id', leadId)
    if (upErr) throw upErr

    if (auditChanges.length > 0) {
      await service.from('activities').insert({
        lead_id: leadId,
        activity_type: 'note',
        note: `Lead updated by ${editorName}: ${auditChanges.join('; ')}`,
        created_by: user.email || user.id || 'system',
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[leads/PATCH] error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update lead' },
      { status: 500 },
    )
  }
}

// DELETE handler for /api/dashboard/leads/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  console.log('[DELETE] Handler invoked for lead:', params.id)

  try {
    // Use the service-role client so the cascade actually executes — the
    // anon/cookie client is filtered by RLS (`auth.role() = 'authenticated'`)
    // and silently returns 0 rows even though the response looks like success.
    const supabase = getServiceClient() || (await createClient())
    const { id } = params

    if (!id) {
      console.log('[DELETE] Missing lead ID')
      return NextResponse.json(
        { error: 'Missing lead ID' },
        { status: 400 }
      )
    }

    console.log('[DELETE] Attempting to delete lead:', id)

    // CASCADE DELETE: clear every child table that has a FK -> all_leads(id)
    // before deleting the parent row. Missing any table here causes the final
    // delete to fail silently with a 23503 FK constraint and the dashboard
    // "Delete Lead" button to look broken.
    const childTables = [
      'conversations',
      'messages',
      'activities',
      'agent_tasks',
      'lead_stage_changes',
      'lead_stage_overrides',
      'web_sessions',
      'whatsapp_sessions',
      'voice_sessions',
      'social_sessions',
    ] as const

    for (const table of childTables) {
      const { error: childErr } = await supabase.from(table).delete().eq('lead_id', id)
      if (childErr) {
        console.error(`[DELETE] Error deleting from ${table}:`, childErr)
      } else {
        console.log(`[DELETE] Cleared ${table}`)
      }
    }

    console.log('[DELETE] Deleting lead from all_leads...')
    const { data, error } = await supabase
      .from('all_leads')
      .delete()
      .eq('id', id)
      .select()

    if (error) {
      console.error('[DELETE] Supabase error deleting lead:', error)
      return NextResponse.json(
        { error: 'Failed to delete lead', details: error.message, code: error.code },
        { status: 500 }
      )
    }

    const deletedCount = data?.length || 0
    console.log('[DELETE] Successfully deleted lead:', id, 'Rows affected:', deletedCount)

    if (deletedCount === 0) {
      return NextResponse.json(
        { error: 'Lead not deleted (not found or blocked by policy)', leadId: id },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      deleted: deletedCount,
      leadId: id,
    })
  } catch (error: any) {
    console.error('[DELETE] Unexpected error:', error)
    console.error('[DELETE] Error stack:', error?.stack)
    return NextResponse.json(
      { 
        error: 'Failed to delete lead', 
        details: error?.message || 'Unknown error',
        type: error?.constructor?.name || 'Unknown'
      },
      { status: 500 }
    )
  }
}
