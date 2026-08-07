/**
 * POST /api/dashboard/backfill-maps  (Lokazen)
 *
 * One-time: resolve google_maps_url on existing leads into a readable place name
 * + coordinates, so the agent can reference the actual location instead of an
 * opaque URL. New links are resolved at capture time (see the Meta webhook);
 * this fills in everything captured before that shipped.
 *
 * Auth: x-api-key = INBOUND_API_KEY.  ?dry=1 previews without writing.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/services'
import { BRAND_ID } from '@/configs'
import { resolveMapsLink } from '@/lib/services/mapsResolver'
import { scopedQuery } from '@/lib/server/workspace'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  if (BRAND_ID !== 'lokazen') return NextResponse.json({ error: 'Lokazen only' }, { status: 400 })
  const key = request.headers.get('x-api-key')?.trim()
  if (!key || key !== process.env.INBOUND_API_KEY?.trim()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabase = getServiceClient()
  if (!supabase) return NextResponse.json({ error: 'No DB' }, { status: 500 })
  const dry = request.nextUrl.searchParams.get('dry') === '1'

  const { data: leads, error } = await scopedQuery(
    supabase
      .from('all_leads')
      .select('id, customer_name, unified_context')
      .order('last_interaction_at', { ascending: false })
      .limit(300)
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results: any[] = []
  for (const lead of leads || []) {
    const ctx = (lead as any).unified_context || {}
    const bctx = ctx[BRAND_ID] || {}
    const url = bctx.google_maps_url
    if (!url || bctx.property_location_name) continue // nothing to do / already resolved

    const r = await resolveMapsLink(String(url))
    if (!r.name && !r.coords) { results.push({ id: lead.id, name: lead.customer_name, status: 'unresolved' }); continue }

    if (!dry) {
      ctx[BRAND_ID] = {
        ...bctx,
        ...(r.name ? { property_location_name: r.name } : {}),
        ...(r.coords ? { property_coords: r.coords } : {}),
        ...(r.name && !bctx.property_zone ? { property_zone: r.name } : {}),
      }
      await supabase.from('all_leads').update({ unified_context: ctx }).eq('id', lead.id)
    }
    results.push({ id: lead.id, name: lead.customer_name, resolved: r.name || null, coords: r.coords || null })
  }

  return NextResponse.json({
    ok: true, dry,
    scanned: (leads || []).length,
    updated: results.filter((r) => r.resolved || r.coords).length,
    unresolved: results.filter((r) => r.status === 'unresolved').length,
    results,
  })
}
