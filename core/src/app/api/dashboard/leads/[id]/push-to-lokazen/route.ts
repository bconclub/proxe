import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'
import { BRAND_ID } from '@/configs'

export const dynamic = 'force-dynamic'

/**
 * POST /api/dashboard/leads/[id]/push-to-lokazen
 *
 * Takes a captured owner lead's property details and creates a LIVE LISTING on
 * the Lokazen site (lokazen.in/api/owner/property), so the property the agent
 * captured over WhatsApp actually gets listed. Returns the created propertyId
 * and stamps it back onto the lead so the "View listing" gallery resolves.
 */

const LOKAZEN_SITE = process.env.LOKAZEN_SITE_URL || 'https://www.lokazen.in'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await createClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getServiceClient() || auth
    const { data: lead } = await supabase
      .from('all_leads').select('id, customer_name, phone, unified_context').eq('id', params.id).maybeSingle()
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    const uc = lead.unified_context || {}
    const lkz = uc[BRAND_ID] || {}
    const phone = String(lead.phone || '').replace(/\D/g, '')
    if (!phone) return NextResponse.json({ error: 'Lead has no phone - cannot create a listing' }, { status: 400 })

    const size = parseInt(String(lkz.property_size_sqft || '').replace(/[^\d]/g, ''), 10) || undefined
    const rent = parseInt(String(lkz.asking_rent_monthly || '').replace(/[^\d]/g, ''), 10) || undefined
    const images = Array.isArray(lkz.property_images)
      ? lkz.property_images.map((i: any) => (typeof i === 'string' ? i : i?.url)).filter(Boolean)
      : []

    const payload = {
      owner: { name: lead.customer_name || undefined, phone, email: lkz.email || undefined },
      property: {
        propertyType: lkz.property_type || 'other',
        location: lkz.property_zone || lkz.city || 'Bangalore',
        ...(lkz.google_maps_url ? { mapLink: lkz.google_maps_url } : {}),
        ...(size ? { size } : {}),
        ...(rent ? { rent } : {}),
        ...(lkz.notes ? { description: String(lkz.notes) } : {}),
        ...(images.length ? { images } : {}),
      },
      source: 'proxe_dashboard',
    }

    const res = await fetch(`${LOKAZEN_SITE}/api/owner/property`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    }).catch(() => null)
    if (!res || !res.ok) {
      const detail = res ? await res.text().catch(() => '') : 'no response'
      console.error('[push-to-lokazen] lokazen rejected:', res?.status, detail.slice(0, 200))
      return NextResponse.json({ error: `Lokazen listing failed (${res?.status || 'network'})` }, { status: 502 })
    }
    const data = await res.json().catch(() => ({}))
    const propertyId = data?.propertyId || data?.property_id || null

    // Stamp the listing id back onto the lead so the gallery + "listed" state show.
    if (propertyId) {
      uc[BRAND_ID] = { ...lkz, property_id: propertyId, listed_on_lokazen_at: new Date().toISOString() }
      await supabase.from('all_leads').update({ unified_context: uc }).eq('id', lead.id)
    }
    return NextResponse.json({ success: true, propertyId })
  } catch (e: any) {
    console.error('[push-to-lokazen] error:', e?.message || e)
    return NextResponse.json({ error: e?.message || 'push failed' }, { status: 500 })
  }
}
