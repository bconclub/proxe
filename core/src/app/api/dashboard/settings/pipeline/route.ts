/**
 * Pipeline page settings - ONE config per brand, shared by every user.
 *
 * The key event stage ("Demo Booked") is a name, not a behavior - brands whose
 * milestone isn't a demo (site visit, trial class…) rename it here once and it
 * sticks. Stored in dashboard_settings (key 'pipeline_config') in the brand's
 * own Supabase, so each brand keeps its own label.
 *
 * GET  → { config, isAdmin }        (read; cookie-auth)
 * POST → merge partial → { config } (write; admin only, service-role)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'

export const dynamic = 'force-dynamic'

const SETTINGS_KEY = 'pipeline_config'

export interface PipelineSettings {
  keyEventLabel?: string
}

async function isCallerAdmin(supabase: any, userId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('dashboard_users')
      .select('role')
      .eq('id', userId)
      .maybeSingle()
    return (data as any)?.role === 'admin'
  } catch {
    return false
  }
}

export async function GET() {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Union of service/auth client narrows to `never` on chained builders -
    // same any-cast the sibling settings routes rely on.
    const supabase: any = getServiceClient() || authClient
    const { data, error } = await supabase
      .from('dashboard_settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .maybeSingle()
    if (error && error.code !== 'PGRST116') throw error

    const isAdmin = await isCallerAdmin(supabase, user.id)
    return NextResponse.json({ config: (data?.value as PipelineSettings) || {}, isAdmin })
  } catch (error) {
    console.error('[settings/pipeline] GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch pipeline settings' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const service: any = getServiceClient() || authClient
    if (!(await isCallerAdmin(service, user.id))) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    const partial = (await request.json().catch(() => ({}))) as PipelineSettings
    const keyEventLabel = typeof partial.keyEventLabel === 'string'
      ? partial.keyEventLabel.trim().slice(0, 40)
      : undefined

    // Merge into existing so future fields never get wiped by a label-only save.
    const { data: existingRow } = await service
      .from('dashboard_settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .maybeSingle()
    const existing = (existingRow?.value as PipelineSettings) || {}
    const merged: PipelineSettings = { ...existing }
    if (keyEventLabel !== undefined) {
      if (keyEventLabel) merged.keyEventLabel = keyEventLabel
      else delete merged.keyEventLabel // empty string → reset to brand default
    }

    const { data, error } = await service
      .from('dashboard_settings')
      .upsert(
        {
          key: SETTINGS_KEY,
          value: merged,
          description: 'Pipeline page config (key event label) shared by all users of this brand',
          updated_by: user.id,
        },
        { onConflict: 'key' },
      )
      .select('value')
      .single()
    if (error) throw error

    return NextResponse.json({ success: true, config: data.value })
  } catch (error) {
    console.error('[settings/pipeline] POST error:', error)
    return NextResponse.json({ error: 'Failed to save pipeline settings' }, { status: 500 })
  }
}
