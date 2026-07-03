import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'

export const dynamic = 'force-dynamic'

/**
 * POST /api/dashboard/leads/[id]/set-type
 * Body: { type: 'brand' | 'owner' | 'scout' }
 *
 * Manual override of a Lokazen lead's audience type. Auto-detection is solid
 * for brand/owner but scout is still being tuned, so operators need a one-click
 * way to move a lead to Scout (or correct any mis-tag). Writes ONLY to
 * unified_context.lokazen (+ a visible admin note) so it works even before the
 * activities/agent_tasks tables are migrated. Once set, LeadsTable routes the
 * lead into the right view (scouts drop out of the brand Leads list).
 */
const TYPE_MAP: Record<string, { user_type: string; lead_type: string; label: string }> = {
  brand: { user_type: 'brand', lead_type: 'brand', label: 'Brand' },
  owner: { user_type: 'owner', lead_type: 'property_owner', label: 'Property Owner' },
  scout: { user_type: 'scout', lead_type: 'scout', label: 'Scout' },
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const leadId = params.id
    const { type } = (await request.json()) as { type?: string }
    const mapped = type ? TYPE_MAP[type] : undefined
    if (!mapped) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${Object.keys(TYPE_MAP).join(', ')}` },
        { status: 400 },
      )
    }

    const supabase = getServiceClient() || authClient

    const { data: lead, error: readErr } = await supabase
      .from('all_leads')
      .select('unified_context')
      .eq('id', leadId)
      .single()
    if (readErr || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    const ctx = lead.unified_context || {}
    const now = new Date().toISOString()
    const nextLokazen = {
      ...(ctx.lokazen || {}),
      user_type: mapped.user_type,
      lead_type: mapped.lead_type,
      type_overridden_by: user.email || user.id,
      type_overridden_at: now,
    }

    // Visible audit note (kept in unified_context — no table dependency).
    const adminNotes: any[] = Array.isArray(ctx.admin_notes) ? ctx.admin_notes : []
    adminNotes.push({
      id: `type_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      text: `Lead type set to ${mapped.label} (manual)`,
      created_by: user.email || 'system',
      created_at: now,
      source: 'set_type',
    })

    const { error: updateErr } = await supabase
      .from('all_leads')
      .update({ unified_context: { ...ctx, lokazen: nextLokazen, admin_notes: adminNotes } })
      .eq('id', leadId)
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, lead_id: leadId, user_type: mapped.user_type, label: mapped.label })
  } catch (error) {
    console.error('[set-type] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
