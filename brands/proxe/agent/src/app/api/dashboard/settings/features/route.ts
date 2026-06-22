/**
 * Per-brand FEATURE FLAGS — runtime on/off toggles for promoted features.
 *
 * The brand config (getBrandConfig().features) is the DEFAULT; this row in
 * dashboard_settings (key 'feature_flags') overrides it at runtime so the
 * Settings → Features panel can switch a feature on/off without a redeploy.
 *
 *   GET  → { features }              (read; cookie-auth)
 *   POST → merge partial → { features } (write; service-role so it's global)
 *
 * Mirrors settings/preferences: one config shared by every user of this brand;
 * once roles exist we can gate writes to admins.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'
import { getBrandConfig } from '@/configs'

export const dynamic = 'force-dynamic'

const FEATURES_KEY = 'feature_flags'

export interface FeatureFlags {
  voice?: boolean
  brain?: boolean
  pipelineFunnel?: boolean
  followUpSequence?: boolean
}

// The known flag keys — anything posted outside this set is ignored so the
// settings panel can't write arbitrary junk into the row.
const FLAG_KEYS: (keyof FeatureFlags)[] = ['voice', 'brain', 'pipelineFunnel', 'followUpSequence']

function pickFlags(input: any): FeatureFlags {
  const out: FeatureFlags = {}
  if (input && typeof input === 'object') {
    for (const k of FLAG_KEYS) {
      if (typeof input[k] === 'boolean') out[k] = input[k]
    }
  }
  return out
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('dashboard_settings')
      .select('value')
      .eq('key', FEATURES_KEY)
      .maybeSingle()

    if (error && error.code !== 'PGRST116') throw error

    // Config defaults underneath the stored overrides, so a brand that has never
    // saved still reports its compile-time defaults.
    const defaults = getBrandConfig().features || {}
    const stored = pickFlags(data?.value)
    return NextResponse.json({ features: { ...defaults, ...stored }, defaults })
  } catch (error) {
    console.error('[settings/features] GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch feature flags' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const partial = pickFlags(await request.json().catch(() => ({})))

    // Service-role for the write so it bypasses RLS and applies globally.
    const service = getServiceClient() || authClient

    const { data: existingRow } = await service
      .from('dashboard_settings')
      .select('value')
      .eq('key', FEATURES_KEY)
      .maybeSingle()

    // Merge into existing so a voice-only change never wipes brain (and vice versa).
    const merged: FeatureFlags = { ...pickFlags(existingRow?.value), ...partial }

    const { error } = await service
      .from('dashboard_settings')
      .upsert(
        {
          key: FEATURES_KEY,
          value: merged,
          description: 'Per-brand feature flags (voice/brain/pipelineFunnel/followUpSequence) — runtime overrides of the brand config defaults',
          updated_by: user.id,
        },
        { onConflict: 'key' },
      )

    if (error) throw error

    const defaults = getBrandConfig().features || {}
    return NextResponse.json({ features: { ...defaults, ...merged } })
  } catch (error) {
    console.error('[settings/features] POST error:', error)
    return NextResponse.json({ error: 'Failed to save feature flags' }, { status: 500 })
  }
}
