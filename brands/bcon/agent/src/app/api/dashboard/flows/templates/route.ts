/**
 * Flow template CRUD — backs the "Create Flow" / "Flow Settings" modals on the
 * Flows page. Operates on the shared `follow_up_templates` table, always scoped
 * to this brand (BRAND_ID) so BCON never reads or writes another brand's rows.
 *
 *   POST   — create a new template (meta_status defaults to 'pending')
 *   PATCH  — update an existing template (status, content, active flag, schedule)
 *   DELETE — remove a template by id (brand-guarded)
 *
 * Dashboard writes use the service-role client (RLS bypass) per the PROXe
 * safeguards. Every write is brand-filtered so cross-tenant edits are impossible.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, getClient } from '@/lib/services'

export const dynamic = 'force-dynamic'

// BCON has no BRAND_ID export — resolve brand from env the same way configs do
// (NEXT_PUBLIC_BRAND_ID || NEXT_PUBLIC_BRAND), falling back to 'bcon'.
const BRAND_ID = process.env.NEXT_PUBLIC_BRAND_ID || process.env.NEXT_PUBLIC_BRAND || 'bcon'

const VALID_CHANNELS = ['whatsapp', 'voice']
const VALID_STATUS = ['pending', 'approved', 'rejected']

function db() {
  return getServiceClient() || getClient()
}

// ── Create ──────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const supabase = db()
    if (!supabase) return NextResponse.json({ error: 'No database connection' }, { status: 500 })

    const body = await request.json().catch(() => ({}))
    const stage = String(body.stage || '').trim()
    const day = Number(body.day)
    const channel = String(body.channel || 'whatsapp').trim().toLowerCase()
    const content = String(body.content || '').trim()
    const variant = String(body.variant || 'A').trim().toUpperCase().slice(0, 1) || 'A'
    const templateName = String(body.templateName || '').trim()
    const language = String(body.language || 'en').trim()

    if (!stage) return NextResponse.json({ error: 'stage is required' }, { status: 400 })
    if (!Number.isFinite(day) || day < 0) return NextResponse.json({ error: 'day must be a non-negative number' }, { status: 400 })
    if (!VALID_CHANNELS.includes(channel)) return NextResponse.json({ error: `channel must be one of ${VALID_CHANNELS.join(', ')}` }, { status: 400 })
    if (!content) return NextResponse.json({ error: 'content is required' }, { status: 400 })

    const row = {
      brand: BRAND_ID,
      stage,
      day,
      channel,
      variant,
      current_variant: variant,
      content,
      language,
      meta_template_name: templateName || null,
      meta_status: 'pending',
      is_active: true,
      send_count: 0,
      metadata: {},
    }

    const { data, error } = await supabase.from('follow_up_templates').insert(row).select('*').single()
    if (error) {
      console.error('[flows/templates POST] insert failed:', error)
      return NextResponse.json({ error: 'Failed to create template', details: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true, template: data })
  } catch (error) {
    console.error('[flows/templates POST] error:', error)
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 })
  }
}

// ── Update ──────────────────────────────────────────────────────────
export async function PATCH(request: NextRequest) {
  try {
    const supabase = db()
    if (!supabase) return NextResponse.json({ error: 'No database connection' }, { status: 500 })

    const body = await request.json().catch(() => ({}))
    const id = String(body.id || '').trim()
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const patch: Record<string, any> = {}
    if (body.meta_status !== undefined) {
      const s = String(body.meta_status).toLowerCase()
      if (!VALID_STATUS.includes(s)) return NextResponse.json({ error: `meta_status must be one of ${VALID_STATUS.join(', ')}` }, { status: 400 })
      patch.meta_status = s
    }
    if (body.is_active !== undefined) patch.is_active = !!body.is_active
    if (body.content !== undefined) patch.content = String(body.content)
    if (body.templateName !== undefined) patch.meta_template_name = String(body.templateName) || null
    if (body.day !== undefined) patch.day = Number(body.day)
    if (body.channel !== undefined) {
      const c = String(body.channel).toLowerCase()
      if (!VALID_CHANNELS.includes(c)) return NextResponse.json({ error: 'invalid channel' }, { status: 400 })
      patch.channel = c
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
    patch.updated_at = new Date().toISOString()

    // Brand-guarded: only rows for THIS brand can be touched.
    const { data, error } = await supabase
      .from('follow_up_templates')
      .update(patch)
      .eq('id', id)
      .eq('brand', BRAND_ID)
      .select('*')
      .single()

    if (error) {
      console.error('[flows/templates PATCH] update failed:', error)
      return NextResponse.json({ error: 'Failed to update template', details: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true, template: data })
  } catch (error) {
    console.error('[flows/templates PATCH] error:', error)
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 })
  }
}

// ── Delete ──────────────────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  try {
    const supabase = db()
    if (!supabase) return NextResponse.json({ error: 'No database connection' }, { status: 500 })

    const id = String(new URL(request.url).searchParams.get('id') || '').trim()
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const { error } = await supabase
      .from('follow_up_templates')
      .delete()
      .eq('id', id)
      .eq('brand', BRAND_ID)

    if (error) {
      console.error('[flows/templates DELETE] failed:', error)
      return NextResponse.json({ error: 'Failed to delete template', details: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[flows/templates DELETE] error:', error)
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 })
  }
}
