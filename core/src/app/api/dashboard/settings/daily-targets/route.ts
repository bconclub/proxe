/**
 * DAILY TARGETS — the War Room's target-vs-actual gauges.
 *
 * One brand-global row in dashboard_settings (key 'daily_targets'):
 *   { voices, volunteers, knocks, events }  — numbers per day.
 *
 *   GET  → { targets }          (cookie auth)
 *   POST → merge partial → { targets }  (service-role write, features pattern)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'

export const dynamic = 'force-dynamic'

const KEY = 'daily_targets'
const TARGET_KEYS = ['voices', 'volunteers', 'knocks', 'events'] as const
type DailyTargets = Partial<Record<(typeof TARGET_KEYS)[number], number>>

function pickTargets(input: any): DailyTargets {
  const out: DailyTargets = {}
  if (input && typeof input === 'object') {
    for (const k of TARGET_KEYS) {
      const v = Number(input[k])
      if (Number.isFinite(v) && v >= 0) out[k] = Math.round(v)
    }
  }
  return out
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await (supabase as any)
      .from('dashboard_settings')
      .select('value')
      .eq('key', KEY)
      .maybeSingle()
    if (error && error.code !== 'PGRST116') throw error

    return NextResponse.json({ targets: pickTargets((data as any)?.value) })
  } catch (error) {
    console.error('[settings/daily-targets] GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch daily targets' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const partial = pickTargets(await request.json().catch(() => ({})))
    const service: any = getServiceClient() || authClient

    const { data: existingRow } = await service
      .from('dashboard_settings')
      .select('value')
      .eq('key', KEY)
      .maybeSingle()

    const merged: DailyTargets = { ...pickTargets(existingRow?.value), ...partial }

    const { error } = await service
      .from('dashboard_settings')
      .upsert(
        {
          key: KEY,
          value: merged,
          description: 'War Room daily targets (voices/volunteers/knocks/events per day)',
          updated_by: user.id,
        },
        { onConflict: 'key' },
      )
    if (error) throw error

    return NextResponse.json({ targets: merged })
  } catch (error) {
    console.error('[settings/daily-targets] POST error:', error)
    return NextResponse.json({ error: 'Failed to save daily targets' }, { status: 500 })
  }
}
