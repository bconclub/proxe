import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'
import { BRAND_ID } from '@/configs'

export const dynamic = 'force-dynamic'

/**
 * POST /api/dashboard/leads/[id]/set-type
 * Body: { type: 'brand' | 'owner' | 'scout' | 'lead' }
 *
 * Manual override of a lead's audience/segment type, written to the brand's
 * unified_context namespace (+ a visible admin note) so it works without any
 * table dependency. Once set, LeadsTable routes the lead into the right view.
 *
 * - lokazen types ('brand' / 'owner' / 'scout'): the original use — move a
 *   lead between the Leads and Gigs views / correct a mis-tag. These write
 *   to unified_context.lokazen (unchanged behavior).
 * - 'lead' (windchasers "Move to Leads"): promotes a webinar registrant into
 *   the main Leads view by CLEARING lead_type from unified_context[BRAND_ID].
 */
const TYPE_MAP: Record<string, { user_type: string; lead_type: string; label: string; brandKey?: string }> = {
  brand: { user_type: 'brand', lead_type: 'brand', label: 'Brand', brandKey: 'lokazen' },
  owner: { user_type: 'owner', lead_type: 'property_owner', label: 'Property Owner', brandKey: 'lokazen' },
  scout: { user_type: 'scout', lead_type: 'scout', label: 'Scout', brandKey: 'lokazen' },
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
    const isPromoteToLead = type === 'lead'
    const mapped = type && !isPromoteToLead ? TYPE_MAP[type] : undefined
    if (!mapped && !isPromoteToLead) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${[...Object.keys(TYPE_MAP), 'lead'].join(', ')}` },
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

    let brandKey: string
    let nextBrandCtx: Record<string, any>
    let label: string
    let userType: string | null
    if (isPromoteToLead) {
      // "Move to Leads": clear the segment tag (webinar today; event later)
      // so the lead re-enters the main Leads view. user_type (student/parent)
      // stays — that's who they are, not which segment they're in.
      brandKey = BRAND_ID
      const prev = { ...(ctx[brandKey] || {}) }
      const prevSegment = prev.lead_type || null
      delete prev.lead_type
      nextBrandCtx = {
        ...prev,
        type_overridden_by: user.email || user.id,
        type_overridden_at: now,
      }
      label = prevSegment ? `Lead (moved from ${prevSegment})` : 'Lead'
      userType = prev.user_type || null
    } else {
      brandKey = mapped!.brandKey || BRAND_ID
      nextBrandCtx = {
        ...(ctx[brandKey] || {}),
        user_type: mapped!.user_type,
        lead_type: mapped!.lead_type,
        type_overridden_by: user.email || user.id,
        type_overridden_at: now,
      }
      label = mapped!.label
      userType = mapped!.user_type
    }

    // Visible audit note (kept in unified_context — no table dependency).
    const adminNotes: any[] = Array.isArray(ctx.admin_notes) ? ctx.admin_notes : []
    adminNotes.push({
      id: `type_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      text: `Lead type set to ${label} (manual)`,
      created_by: user.email || 'system',
      created_at: now,
      source: 'set_type',
    })

    const { error: updateErr } = await supabase
      .from('all_leads')
      .update({ unified_context: { ...ctx, [brandKey]: nextBrandCtx, admin_notes: adminNotes } })
      .eq('id', leadId)
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, lead_id: leadId, user_type: userType, label })
  } catch (error) {
    console.error('[set-type] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
