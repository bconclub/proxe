// Seed ~100 realistic Lokazen demo leads. Run: node scripts/seed-demo.cjs
// Every row tagged metadata.is_demo=true so the dashboard can clear them.
// Scores are DERIVED by the app from unified_context (summary keywords, form_data,
// booking, recency) — so we tune those per heat tier to get a realistic spread.
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs'); const path = require('path')

const envPath = path.join(__dirname, '..', '.env.local')
fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach((line) => {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
})
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Missing SUPABASE creds'); process.exit(1) }
const supabase = createClient(url, key, { auth: { persistSession: false } })

const BRANDS = ['Third Wave Coffee','Blue Tokai','Chai Point','FabIndia','Nykaa','Lenskart','Cult.fit','Decathlon','Wow! Momo','Burger Singh','Tanishq','Croma','Licious','Naturals Salon','Rebel Foods','Home Centre','boAt','Mokobara','Sleepwell','Pharmeasy','Country Delight','Subway','Chaayos','Beco','The Sleep Company','Bewakoof','Mamaearth','Sugar Cosmetics','Bira 91',' Paradise Biryani','Truffles','Smoor','Leon Grill','Polar Bear','Cred Store','Zudio','Bluestone','GIVA','Boba Bhai','Curefoods']
const OWNERS = ['Prestige Group','Brigade Enterprises','Salarpuria Sattva','Sobha Realty','Embassy Group','RMZ Corp','Mantri Developers','Puravankara','Mr. Suresh Rao','Mrs. Lakshmi Iyer','Mr. Abdul Rahman','Karnataka Estates','GVS Ventures','Mr. Venkatesh','Divyasree','Bhartiya City','Mr. Imran Khan','Shriram Properties','Mrs. Anitha Reddy','Mr. Naveen Kumar']
const AREAS = ['Indiranagar','Koramangala','HSR Layout','Whitefield','Jayanagar','MG Road','Marathahalli','JP Nagar','Bellandur','Electronic City','BTM Layout','Hebbal','Sarjapur Road','Banashankari','Malleshwaram','Rajajinagar','Frazer Town','Yelahanka','Brookefield','Ulsoor']
const BIZ = ['Cafe','Restaurant','Retail Store','Gym','Salon','Clinic','Cloud Kitchen','Showroom','Pharmacy','Quick-service Restaurant']
const PROP = ['Office Tower','Retail Unit','Warehouse','Standalone Building','Mall Unit','Commercial Floor','High-street Shop','Co-working Floor']
const SOURCES = ['web','whatsapp','social','web','whatsapp'] // weighted toward web/whatsapp

const pick = (arr, i) => arr[i % arr.length]
const iso = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString()

// heat tier per index: ~18 hot, ~42 warm, ~40 cold across 100
function tierFor(i) { const r = i % 10; if (r < 2) return 'hot'; if (r < 6) return 'warm'; return 'cold' }

function summary(tier, type, biz, area, sqft) {
  const what = type === 'brand' ? `${biz.toLowerCase()} space` : `${biz.toLowerCase()} listing`
  if (tier === 'hot') return `Urgent requirement. Asked about pricing and rent, wants to book a site visit this week. Ready to sign if the ${sqft} sqft ${what} in ${area} fits. Very interested, budget confirmed, looking to move fast.`
  if (tier === 'warm') return `Interested in a ${sqft} sqft ${what} in ${area}. Asked about availability and options, comparing a few areas. Considering next month, wants more details.`
  return `Initial enquiry about ${what} around ${area}. Just exploring for now, no firm timeline yet.`
}
function formData(tier) {
  if (tier === 'hot') return { has_website: true, has_ai_systems: false, urgency: 'asap', monthly_leads: '80' }
  if (tier === 'warm') return { has_website: true, has_ai_systems: false, urgency: 'this_month', monthly_leads: '30' }
  return {}
}
const STAGE = { hot: ['High Intent', 'Booking Made'], warm: ['Qualified', 'Engaged'], cold: ['New', 'Cold'] }
const STATUS = { hot: 'hot', warm: 'warm', cold: 'cold' }

function buildRows(n) {
  const rows = []
  for (let i = 0; i < n; i++) {
    const type = i % 2 === 0 ? 'brand' : 'owner'
    const tier = tierFor(i)
    const name = type === 'brand' ? pick(BRANDS, Math.floor(i / 2)) : pick(OWNERS, Math.floor(i / 2))
    const area = pick(AREAS, i * 3)
    const biz = type === 'brand' ? pick(BIZ, i) : pick(PROP, i)
    const sqft = type === 'brand' ? 800 + (i % 12) * 600 : 2000 + (i % 15) * 2500
    const src = pick(SOURCES, i)
    const hrs = tier === 'hot' ? 1 + (i % 12) : tier === 'warm' ? 24 + (i % 48) : 120 + (i % 240)
    const stage = pick(STAGE[tier], i)
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '')
    rows.push({
      customer_name: name,
      email: `${slug}.${i}@example.com`,
      phone: `+9198${String(45000000 + i * 137).slice(0, 8)}`,
      first_touchpoint: src, last_touchpoint: src,
      last_interaction_at: iso(hrs),
      brand: 'lokazen',
      unified_context: {
        unified_summary: summary(tier, type, biz, area, sqft),
        form_data: formData(tier),
        web: { user_type: type, conversation_summary: summary(tier, type, biz, area, sqft) },
        lokazen: { user_type: type, business_type: biz, area, city: 'Bangalore', carpet_area_sqft: sqft,
          requirement: type === 'brand' ? `Needs ${sqft} sqft ${biz.toLowerCase()} in ${area}` : `Lists ${sqft} sqft ${biz.toLowerCase()} in ${area}` },
      },
      metadata: { is_demo: true, lead_type_label: type === 'brand' ? 'Brand Owner' : 'Property Owner', heat: tier },
      lead_score: tier === 'hot' ? 78 + (i % 18) : tier === 'warm' ? 45 + (i % 22) : 12 + (i % 24),
      lead_stage: stage, status: STATUS[tier], last_scored_at: iso(hrs),
      booking_date: tier === 'hot' ? new Date(Date.now() + ((i % 7) + 1) * 86400000).toISOString().slice(0, 10) : null,
    })
  }
  return rows
}

;(async () => {
  await supabase.from('all_leads').delete().eq('brand', 'lokazen').eq('metadata->>is_demo', 'true')
  const rows = buildRows(100)
  // insert in chunks of 50
  let inserted = 0
  for (let c = 0; c < rows.length; c += 50) {
    const { data, error } = await supabase.from('all_leads').insert(rows.slice(c, c + 50)).select('id')
    if (error) { console.error('Insert error:', error); process.exit(1) }
    inserted += data.length
  }
  console.log(`Seeded ${inserted} demo leads (is_demo=true) — brand+owner mix, hot/warm/cold spread.`)
})()
