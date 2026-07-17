/**
 * GET /api/dashboard/whatsapp/overview — the WhatsApp health header for the
 * Configure → WhatsApp page.
 *
 * Pulls the number's live status from Meta (quality rating + messaging tier +
 * throughput + name status) and the brand's own send volume from the
 * conversations log (last 7 / 30 days). Best-effort: any missing piece comes
 * back null so the page degrades gracefully rather than erroring.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'
import { getWhatsAppCreds } from '@/lib/services/whatsappCreds'

export const dynamic = 'force-dynamic'

const GRAPH = 'https://graph.facebook.com/v21.0'

// Meta's messaging limit tiers → a friendly cap + label.
const TIER_INFO: Record<string, { label: string; cap: string }> = {
  TIER_50: { label: 'Tier 1', cap: '50 / day' },
  TIER_250: { label: 'Tier 1', cap: '250 / day' },
  TIER_1K: { label: 'Tier 2', cap: '1,000 / day' },
  TIER_10K: { label: 'Tier 3', cap: '10,000 / day' },
  TIER_100K: { label: 'Tier 4', cap: '100,000 / day' },
  TIER_UNLIMITED: { label: 'Unlimited', cap: 'Unlimited' },
}

async function countSent(service: any, sinceIso: string): Promise<number | null> {
  try {
    const { count } = await service
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('sender', 'agent')
      .in('message_type', ['template', 'text'])
      .gte('created_at', sinceIso)
    return count ?? 0
  } catch {
    return null
  }
}

export async function GET() {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // ── Meta phone status (best-effort) ──
    let phone: any = null
    let metaError: string | null = null
    const creds = await getWhatsAppCreds()
    if (creds) {
      try {
        const res = await fetch(
          `${GRAPH}/${creds.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier,throughput,name_status`,
          { headers: { Authorization: `Bearer ${creds.accessToken}` } },
        )
        const data = await res.json()
        if (res.ok) phone = data
        else metaError = data?.error?.message || `Meta HTTP ${res.status}`
      } catch (e: any) {
        metaError = e?.message || 'Meta request failed'
      }
    } else {
      metaError = 'WhatsApp is not connected for this brand yet.'
    }

    const tierKey = phone?.messaging_limit_tier || null
    const tier = tierKey
      ? { key: tierKey, ...(TIER_INFO[tierKey] || { label: tierKey, cap: '—' }) }
      : null

    // ── Send volume from our own log ──
    const service: any = getServiceClient()
    let sent7: number | null = null, sent30: number | null = null
    if (service) {
      const now = Date.now()
      ;[sent7, sent30] = await Promise.all([
        countSent(service, new Date(now - 7 * 86400000).toISOString()),
        countSent(service, new Date(now - 30 * 86400000).toISOString()),
      ])
    }

    return NextResponse.json({
      connected: !!phone,
      metaError,
      quality: phone?.quality_rating || null,      // GREEN | YELLOW | RED | UNKNOWN
      tier,                                          // { key, label, cap } | null
      throughput: phone?.throughput?.level || null,  // STANDARD | HIGH …
      nameStatus: phone?.name_status || null,        // APPROVED | …
      displayNumber: phone?.display_phone_number || null,
      verifiedName: phone?.verified_name || null,
      sent7,
      sent30,
    })
  } catch (error) {
    console.error('[whatsapp/overview] failed:', error)
    return NextResponse.json({ error: 'Failed to load WhatsApp overview' }, { status: 500 })
  }
}
