/**
 * Campaigns store — GET list / POST save / PATCH update-status / DELETE.
 *
 * Campaigns live as ONE JSON document in dashboard_settings (key
 * 'campaigns_v1') in the brand's own Supabase — same zero-migration pattern as
 * dashboard prefs. Volume is small (a team plans campaigns by hand); cap 100,
 * newest first. Sending is NOT here — a campaign saves as 'ready' and the send
 * wiring stays an explicit, separate step.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'

export const dynamic = 'force-dynamic'

const KEY = 'campaigns_v1'
const MAX_CAMPAIGNS = 100

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
  status: 'draft' | 'ready' | 'sent' | 'archived'
  audience: CampaignAudience
  template: CampaignTemplate | null
  channel?: string
  scheduled_at?: string | null
  created_by: string
  created_at: string
  updated_at: string
}

async function readAll(service: any): Promise<Campaign[]> {
  const { data } = await service
    .from('dashboard_settings')
    .select('value')
    .eq('key', KEY)
    .maybeSingle()
  const list = (data?.value as any)?.campaigns
  return Array.isArray(list) ? list : []
}

async function writeAll(service: any, campaigns: Campaign[], userId: string) {
  const { error } = await service
    .from('dashboard_settings')
    .upsert(
      {
        key: KEY,
        value: { campaigns: campaigns.slice(0, MAX_CAMPAIGNS) },
        description: 'Campaign builder — saved campaigns (audience + template + status)',
        updated_by: userId,
      },
      { onConflict: 'key' },
    )
  if (error) throw new Error(error.message)
}

async function requireUser() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  return user
}

export async function GET() {
  try {
    const user = await requireUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const service: any = getServiceClient()
    if (!service) return NextResponse.json({ error: 'Service client unavailable' }, { status: 500 })
    return NextResponse.json({ campaigns: await readAll(service) })
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
    const campaign: Campaign = {
      id: `CMP-${now.slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      status: body.template ? 'ready' : 'draft',
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
            footer: body.template.footer ? String(body.template.footer).slice(0, 120) : undefined,
            buttons: Array.isArray(body.template.buttons) ? body.template.buttons.slice(0, 3) : undefined,
            status: body.template.status === 'approved' ? 'approved' : 'draft',
            variables: Array.isArray(body.template.variables) ? body.template.variables : undefined,
          }
        : null,
      channel: body.channel === 'whatsapp' || !body.channel ? 'whatsapp' : String(body.channel).slice(0, 20),
      scheduled_at: body.scheduled_at && !isNaN(new Date(body.scheduled_at).getTime())
        ? new Date(body.scheduled_at).toISOString()
        : null,
      created_by: user.email || user.id,
      created_at: now,
      updated_at: now,
    }

    const all = await readAll(service)
    await writeAll(service, [campaign, ...all], user.id)
    return NextResponse.json({ success: true, campaign })
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
    const status = String(body.status || '')
    if (!id || !['draft', 'ready', 'sent', 'archived'].includes(status)) {
      return NextResponse.json({ error: 'id and a valid status are required' }, { status: 400 })
    }
    const all = await readAll(service)
    const idx = all.findIndex((c) => c.id === id)
    if (idx === -1) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    all[idx] = { ...all[idx], status: status as Campaign['status'], updated_at: new Date().toISOString() }
    await writeAll(service, all, user.id)
    return NextResponse.json({ success: true, campaign: all[idx] })
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
    const all = await readAll(service)
    await writeAll(service, all.filter((c) => c.id !== id), user.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[campaigns] DELETE failed:', error)
    return NextResponse.json({ error: 'Failed to delete campaign' }, { status: 500 })
  }
}
