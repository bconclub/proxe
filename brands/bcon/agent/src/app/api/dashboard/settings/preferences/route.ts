/**
 * Global dashboard preferences — ONE config shared by every user.
 *
 * Founder request: "Whatever setting changes I'm making on the dashboard should
 * be for all users until we make a differentiation of users." So sound + theme
 * prefs live server-side (dashboard_settings, key 'dashboard_prefs') instead of
 * per-browser localStorage. Any logged-in user can change them today; once we
 * add roles we can gate writes to admins.
 *
 * GET  → { prefs }              (read; cookie-auth)
 * POST → merge partial → { prefs } (write; service-role so it applies globally)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'

export const dynamic = 'force-dynamic'

const PREFS_KEY = 'dashboard_prefs'

export interface GlobalPrefs {
  sounds?: { muted?: boolean; new?: boolean; update?: boolean; ready?: boolean }
  theme?: { mode?: 'brand' | 'bw-dark' | 'bw-light'; accent?: string }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('dashboard_settings')
      .select('value')
      .eq('key', PREFS_KEY)
      .maybeSingle()

    if (error && error.code !== 'PGRST116') throw error

    return NextResponse.json({ prefs: (data?.value as GlobalPrefs) || {} })
  } catch (error) {
    console.error('[settings/preferences] GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const partial = (await request.json().catch(() => ({}))) as GlobalPrefs

    // Service-role for the write so it bypasses RLS and is genuinely global.
    const service = getServiceClient() || authClient

    // Merge into existing so a sounds-only change never wipes theme (and vice versa).
    const { data: existingRow } = await service
      .from('dashboard_settings')
      .select('value')
      .eq('key', PREFS_KEY)
      .maybeSingle()

    const existing = (existingRow?.value as GlobalPrefs) || {}
    const merged: GlobalPrefs = {
      ...existing,
      ...partial,
      sounds: { ...existing.sounds, ...partial.sounds },
      theme: { ...existing.theme, ...partial.theme },
    }

    const { data, error } = await service
      .from('dashboard_settings')
      .upsert(
        {
          key: PREFS_KEY,
          value: merged,
          description: 'Global dashboard preferences (sounds + theme) shared by all users',
          updated_by: user.id,
        },
        { onConflict: 'key' },
      )
      .select('value')
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, prefs: data.value })
  } catch (error) {
    console.error('[settings/preferences] POST error:', error)
    return NextResponse.json({ error: 'Failed to save preferences' }, { status: 500 })
  }
}
