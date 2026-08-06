/**
 * Campaigns store - GET list / POST save / PATCH update / DELETE.
 *
 * One ROW per campaign in the brand's own Supabase (migration 041), not one
 * shared JSON document. The document version lost every campaign it held: a
 * read that returned nothing looked exactly like "no campaigns", and the next
 * save wrote that emptiness back over the lot. Rows cannot do that - a failed
 * read surfaces as an error, and a save touches only its own row.
 *
 * Falls back to the legacy dashboard_settings blob for READS only, so a
 * deployment that has not run 041 yet still shows what it has. Writes always
 * go to the table; there is no path back into the blob.
 *
 * Sending is NOT here - a campaign saves as 'ready' and the send wiring stays
 * an explicit, separate step.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'

export const dynamic = 'force-dynamic'

const LEGACY_KEY = 'campaigns_v1'
const MAX_CAMPAIGNS = 200

export interface CampaignAudience {
  description: string
  filters: Record<string, unknown>
  count: number
  sample?: Array<{ name: string; phone?: string; stage?: string }>
}

export interface CampaignTemplate {
  name: string
  body: string
  footer?: string
  buttons?: string[]
  status: 'approved' | 'draft'
  variables?: string[]
}

export interface Campaign {
  id: string
  name: string
  status: 'draft' | 'ready' | 'sending' | 'sent' | 'archived'
  audience: CampaignAudience
  template: CampaignTemplate | null
  channel?: string
  scheduled_at?: string | null
  sent_at?: string | null
  sent_count?: number
  failed_count?: number
  created_by: string
  created_at: string
  updated_at: string
}

const STATUSES = ['draft', 'ready', 'sending', 'sent', 'archived']

async function requireUser() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  return user
}

/** Legacy blob, read-only. Used only when the campaigns table isn't there. */
async function readLegacy(service: any): Promise<Campaign[]> {
  const { data } = await service
    .from('dashboard_settings')
    .select('value')
    .eq('key', LEGACY_KEY)
    .maybeSingle()
  const list = (data?.value as any)?.campaigns
  return Array.isArray(list) ? list : []
}

export async function GET() {
  try {
    const user = await requireUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const service: any = getServiceClient()
    if (!service) return NextResponse.json({ error: 'Service client unavailable' }, { status: 500 })

    const { data, error } = await service
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(MAX_CAMPAIGNS)

    if (error) {
      // Table missing = 041 hasn't been run. Show the legacy blob rather than
      // an empty list, so nothing LOOKS deleted while the migration is pending.
      console.error('[campaigns] table read failed, falling back to legacy blob:', error.message)
      return NextResponse.json({ campaigns: await readLegacy(service), legacy: true })
    }
    return NextResponse.json({ campaigns: data || [] })
  } catch (error) {
    console.error('[campaigns] GET failed:', error)
    return NextResponse.json({ error: 'Failed to load campaigns' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const service: any = getServiceClient()
    if (!service) return NextResponse.json({ error: 'Service client unavailable' }, { status: 500 })

    const body = await request.json().catch(() => ({}))
    const name = String(body.name || '').trim().slice(0, 80)
    const audience = body.audience
    if (!name || !audience || typeof audience.count !== 'number') {
      return NextResponse.json({ error: 'name and audience{count} are required' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const row = {
      id: `CMP-${now.slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      status: body.template ? 'ready' : 'draft',
      channel: body.channel === 'whatsapp' || !body.channel ? 'whatsapp' : String(body.channel).slice(0, 20),
      audience: {
        description: String(audience.description || '').slice(0, 300),
        filters: audience.filters || {},
        count: audience.count,
        sample: Array.isArray(audience.sample) ? audience.sample.slice(0, 10) : [],
      },
      template: body.template
        ? {
            name: String(body.template.name || '').slice(0, 100),
            body: String(body.template.body || '').slice(0, 2000),
            footer: body.template.footer ? String(body.template.footer).slice(0, 120) : null,
            buttons: Array.isArray(body.template.buttons) ? body.template.buttons.slice(0, 3) : null,
            status: body.template.status === 'approved' ? 'approved' : 'draft',
            variables: Array.isArray(body.template.variables) ? body.template.variables : null,
          }
        : null,
      scheduled_at: body.scheduled_at && !isNaN(new Date(body.scheduled_at).getTime())
        ? new Date(body.scheduled_at).toISOString()
        : null,
      created_by: user.email || user.id,
      created_at: now,
      updated_at: now,
    }

    const { data, error } = await service.from('campaigns').insert(row).select().single()
    // A save that fails must SAY so. The old version could report success
    // while the write went nowhere.
    if (error) {
      console.error('[campaigns] insert failed:', error.message)
      return NextResponse.json({ error: `Could not save: ${error.message}` }, { status: 500 })
    }
    return NextResponse.json({ success: true, campaign: data })
  } catch (error) {
    console.error('[campaigns] POST failed:', error)
    return NextResponse.json({ error: 'Failed to save campaign' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const service: any = getServiceClient()
    if (!service) return NextResponse.json({ error: 'Service client unavailable' }, { status: 500 })

    const body = await request.json().catch(() => ({}))
    const id = String(body.id || '')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const patch: Record<string, any> = { updated_at: new Date().toISOString() }
    if (body.status !== undefined) {
      if (!STATUSES.includes(String(body.status))) {
        return NextResponse.json({ error: 'invalid status' }, { status: 400 })
      }
      patch.status = String(body.status)
      if (body.status === 'sent') patch.sent_at = new Date().toISOString()
    }
    if (body.name !== undefined) patch.name = String(body.name).trim().slice(0, 80)
    if (body.template !== undefined) patch.template = body.template
    if (body.scheduled_at !== undefined) {
      patch.scheduled_at = body.scheduled_at && !isNaN(new Date(body.scheduled_at).getTime())
        ? new Date(body.scheduled_at).toISOString()
        : null
    }

    const { data, error } = await service.from('campaigns').update(patch).eq('id', id).select().single()
    if (error) {
      console.error('[campaigns] update failed:', error.message)
      return NextResponse.json({ error: `Could not update: ${error.message}` }, { status: 500 })
    }
    if (!data) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    return NextResponse.json({ success: true, campaign: data })
  } catch (error) {
    console.error('[campaigns] PATCH failed:', error)
    return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const service: any = getServiceClient()
    if (!service) return NextResponse.json({ error: 'Service client unavailable' }, { status: 500 })

    const id = new URL(request.url).searchParams.get('id') || ''
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    // Archive, don't destroy. A campaign carries who was messaged and when;
    // deleting the row would take the send log with it (ON DELETE CASCADE),
    // and that record is the only proof of what went out.
    const { data, error } = await service
      .from('campaigns')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) {
      console.error('[campaigns] archive failed:', error.message)
      return NextResponse.json({ error: `Could not archive: ${error.message}` }, { status: 500 })
    }
    return NextResponse.json({ success: true, campaign: data, archived: true })
  } catch (error) {
    console.error('[campaigns] DELETE failed:', error)
    return NextResponse.json({ error: 'Failed to archive campaign' }, { status: 500 })
  }
}
