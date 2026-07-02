import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/dashboard/leads/property-media?property_id=<id>
 *
 * Lazily fetches a Lokazen property's photos for the lead gallery. Images live
 * on the Loka side (lokazen.in), NOT in PROXe — so instead of bloating every
 * lead with image blobs at inbound time, the lead only stores property_id and
 * this endpoint pulls the media on demand from Loka's PUBLIC property API.
 * Same-origin for the dashboard (no CORS); server-side (no Loka creds needed).
 *
 * Loka stores images as base64 data-URIs (verified: ~all listings), which
 * render directly in <img src> but are large — so we cap the count and skip any
 * single image over ~3MB to keep the response sane.
 */
const LOKA_BASE = process.env.LOKAZEN_SITE_URL || 'https://www.lokazen.in'
const MAX_IMAGES = 6
const MAX_IMAGE_BYTES = 3_000_000

export async function GET(request: NextRequest) {
  const propertyId = request.nextUrl.searchParams.get('property_id')?.trim()
  if (!propertyId) {
    return NextResponse.json({ error: 'property_id is required' }, { status: 400 })
  }

  try {
    const res = await fetch(`${LOKA_BASE}/api/properties/${encodeURIComponent(propertyId)}`, {
      headers: { accept: 'application/json' },
      // Property media rarely changes; let the platform cache it briefly.
      next: { revalidate: 300 },
    })
    if (!res.ok) {
      return NextResponse.json({ images: [], property_url: null, error: `upstream ${res.status}` }, { status: 200 })
    }
    const body = await res.json().catch(() => ({}))
    // The property payload may be the object itself or wrapped in { property } / { data }.
    const prop = body?.property || body?.data || body || {}
    const rawImages: unknown[] = Array.isArray(prop.images) ? prop.images : []

    // Accept http(s) URLs and base64 data-URIs (both render in <img>); skip
    // anything oversized, and cap the count.
    const images = rawImages
      .filter((img): img is string =>
        typeof img === 'string'
        && (/^https?:\/\//i.test(img) || /^data:image\//i.test(img))
        && img.length <= MAX_IMAGE_BYTES,
      )
      .slice(0, MAX_IMAGES)

    return NextResponse.json(
      {
        images,
        count: images.length,
        property_url: `${LOKA_BASE}/properties/${encodeURIComponent(propertyId)}`,
        title: typeof prop.title === 'string' ? prop.title : null,
      },
      { headers: { 'Cache-Control': 'private, max-age=300' } },
    )
  } catch (err: any) {
    console.error('[property-media] fetch failed:', err?.message || err)
    return NextResponse.json({ images: [], property_url: null, error: 'fetch_failed' }, { status: 200 })
  }
}
