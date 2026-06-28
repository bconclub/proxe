import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// Service-role client (server-only). Dynamic env access is fine server-side.
function svc() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

const BRAND = process.env.NEXT_PUBLIC_BRAND_ID || process.env.NEXT_PUBLIC_BRAND || 'lokazen'

// type: 'brand' = needs space, 'owner' = lists space
const LEADS = [
  { name: 'Third Wave Coffee', type: 'brand', biz: 'Cafe', area: 'Indiranagar', sqft: 1500, src: 'web', score: 84, stage: 'High Intent', status: 'hot', hrs: 2, book: 1 },
  { name: 'FabIndia', type: 'brand', biz: 'Retail', area: 'Jayanagar', sqft: 3000, src: 'whatsapp', score: 68, stage: 'Qualified', status: 'warm', hrs: 6 },
  { name: 'Cult.fit', type: 'brand', biz: 'Gym', area: 'HSR Layout', sqft: 5000, src: 'web', score: 47, stage: 'Engaged', status: 'warm', hrs: 26 },
  { name: 'Sapient', type: 'brand', biz: 'Office', area: 'Whitefield', sqft: 12000, src: 'social', score: 28, stage: 'New', status: 'cold', hrs: 50 },
  { name: 'Prestige Group', type: 'owner', biz: 'Office Tower', area: 'Whitefield', sqft: 20000, src: 'web', score: 76, stage: 'Qualified', status: 'hot', hrs: 4, book: 2 },
  { name: 'Brigade Enterprises', type: 'owner', biz: 'Retail Unit', area: 'Koramangala', sqft: 2200, src: 'whatsapp', score: 72, stage: 'High Intent', status: 'hot', hrs: 9 },
  { name: 'Mr. Suresh Rao', type: 'owner', biz: 'Standalone Building', area: 'Jayanagar', sqft: 4000, src: 'web', score: 41, stage: 'New', status: 'warm', hrs: 30 },
  { name: 'Salarpuria Sattva', type: 'owner', biz: 'Warehouse', area: 'Hosur Road', sqft: 30000, src: 'social', score: 55, stage: 'Engaged', status: 'warm', hrs: 70 },
]

function buildRows() {
  const now = Date.now()
  const hrsAgo = (h: number) => new Date(now - h * 3600 * 1000).toISOString()
  return LEADS.map((l, i) => ({
    customer_name: l.name,
    email: `${l.name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '')}@example.com`,
    phone: `+9198${String(45670000 + i)}`,
    first_touchpoint: l.src, last_touchpoint: l.src,
    last_interaction_at: hrsAgo(l.hrs),
    brand: BRAND,
    unified_context: {
      [BRAND]: {
        user_type: l.type, business_type: l.biz, area: l.area, city: 'Bangalore', carpet_area_sqft: l.sqft,
        requirement: l.type === 'brand'
          ? `Looking for ${l.sqft} sqft ${l.biz.toLowerCase()} space in ${l.area}`
          : `Listing ${l.sqft} sqft ${l.biz.toLowerCase()} in ${l.area}`,
      },
      web: { user_type: l.type },
    },
    metadata: { is_demo: true, lead_type_label: l.type === 'brand' ? 'Brand Owner' : 'Property Owner' },
    lead_score: l.score, lead_stage: l.stage, status: l.status, last_scored_at: hrsAgo(l.hrs),
    booking_date: l.book ? new Date(now + l.book * 86400000).toISOString().slice(0, 10) : null,
  }))
}

// GET — how many demo rows currently exist
export async function GET() {
  const supabase = svc()
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
  const { count, error } = await supabase
    .from('all_leads').select('id', { count: 'exact', head: true })
    .eq('brand', BRAND).eq('metadata->>is_demo', 'true')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ count: count || 0 })
}

// POST — (re)seed demo leads
export async function POST() {
  const supabase = svc()
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
  await supabase.from('all_leads').delete().eq('brand', BRAND).eq('metadata->>is_demo', 'true')
  const { data, error } = await supabase.from('all_leads').insert(buildRows()).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ seeded: data?.length || 0 })
}

// DELETE — remove all demo leads (call before going live with ads)
export async function DELETE() {
  const supabase = svc()
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
  const { data, error } = await supabase
    .from('all_leads').delete().eq('brand', BRAND).eq('metadata->>is_demo', 'true').select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: data?.length || 0 })
}
