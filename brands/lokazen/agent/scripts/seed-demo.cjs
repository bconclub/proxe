// Seed realistic Lokazen demo leads. Run: node scripts/seed-demo.cjs
// Every row is tagged metadata.is_demo=true so it can be cleared from the dashboard.
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// Load .env.local
const envPath = path.join(__dirname, '..', '.env.local')
fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach((line) => {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
})

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const supabase = createClient(url, key, { auth: { persistSession: false } })

const now = Date.now()
const hrsAgo = (h) => new Date(now - h * 3600 * 1000).toISOString()

// type: 'brand' = needs space, 'owner' = lists space
const LEADS = [
  { name: 'Third Wave Coffee', type: 'brand', biz: 'Cafe', area: 'Indiranagar', sqft: 1500, src: 'web',      score: 84, stage: 'High Intent', status: 'hot',  hrs: 2,  book: 1 },
  { name: 'FabIndia',          type: 'brand', biz: 'Retail', area: 'Jayanagar', sqft: 3000, src: 'whatsapp', score: 68, stage: 'Qualified',   status: 'warm', hrs: 6 },
  { name: "Cult.fit",          type: 'brand', biz: 'Gym', area: 'HSR Layout', sqft: 5000, src: 'web',        score: 47, stage: 'Engaged',     status: 'warm', hrs: 26 },
  { name: 'Sapient',           type: 'brand', biz: 'Office', area: 'Whitefield', sqft: 12000, src: 'social', score: 28, stage: 'New',         status: 'cold', hrs: 50 },
  { name: 'Prestige Group',    type: 'owner', biz: 'Office Tower', area: 'Whitefield', sqft: 20000, src: 'web', score: 76, stage: 'Qualified', status: 'hot', hrs: 4, book: 2 },
  { name: 'Brigade Enterprises', type: 'owner', biz: 'Retail Unit', area: 'Koramangala', sqft: 2200, src: 'whatsapp', score: 72, stage: 'High Intent', status: 'hot', hrs: 9 },
  { name: 'Mr. Suresh Rao',    type: 'owner', biz: 'Standalone Building', area: 'Jayanagar', sqft: 4000, src: 'web',  score: 41, stage: 'New',     status: 'warm', hrs: 30 },
  { name: 'Salarpuria Sattva', type: 'owner', biz: 'Warehouse', area: 'Hosur Road', sqft: 30000, src: 'social',    score: 55, stage: 'Engaged',   status: 'warm', hrs: 70 },
]

function row(l, i) {
  const label = l.type === 'brand' ? 'Brand Owner' : 'Property Owner'
  const ctx = {
    lokazen: {
      user_type: l.type, business_type: l.biz, area: l.area, city: 'Bangalore',
      carpet_area_sqft: l.sqft, requirement: l.type === 'brand' ? `Looking for ${l.sqft} sqft ${l.biz.toLowerCase()} space in ${l.area}` : `Listing ${l.sqft} sqft ${l.biz.toLowerCase()} in ${l.area}`,
    },
    web: { user_type: l.type },
  }
  return {
    customer_name: l.name,
    email: `${l.name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '')}@example.com`,
    phone: `+9198${String(45670000 + i)}`,
    first_touchpoint: l.src, last_touchpoint: l.src,
    last_interaction_at: hrsAgo(l.hrs),
    brand: 'lokazen',
    unified_context: ctx,
    metadata: { is_demo: true, lead_type_label: label },
    lead_score: l.score, lead_stage: l.stage, status: l.status,
    last_scored_at: hrsAgo(l.hrs),
    booking_date: l.book ? new Date(now + l.book * 86400000).toISOString().slice(0, 10) : null,
  }
}

;(async () => {
  const rows = LEADS.map(row)
  const { data, error } = await supabase.from('all_leads').insert(rows).select('id,customer_name')
  if (error) { console.error('Insert error:', error); process.exit(1) }
  console.log(`Seeded ${data.length} demo leads (is_demo=true):`)
  data.forEach((d) => console.log('  -', d.customer_name))
})()
