// Seed 117 rich Lokazen demo leads + conversation threads. Run: node scripts/seed-demo.cjs
// Tagged metadata.is_demo=true. created_at is spread over ~45 days so trend charts
// curve (no flat lines); ~15% have bookings (some upcoming); a batch is active in 24h;
// every engaged lead gets a realistic WhatsApp/web thread so the inbox/feed looks live.
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
const BRAND = 'lokazen'
const TOTAL = 117
const BOOKINGS = 18 // ~15% of 117

const BRANDS = ['Third Wave Coffee','Blue Tokai','Chai Point','FabIndia','Nykaa','Lenskart','Cult.fit','Decathlon','Wow! Momo','Burger Singh','Tanishq','Croma','Licious','Naturals Salon','Rebel Foods','Home Centre','boAt','Mokobara','Sleepwell','Pharmeasy','Country Delight','Subway','Chaayos','Beco','The Sleep Company','Bewakoof','Mamaearth','Sugar Cosmetics','Bira 91','Paradise Biryani','Truffles','Smoor','Leon Grill','Polar Bear','Zudio','Bluestone','GIVA','Boba Bhai','Curefoods','Wakefit','Pista House','Hocco','Savya Rasa','Almond House','Glen Café','Iiki','Daily Goods','Brewklyn','Nomad Pizza','Foxtrot']
const OWNERS = ['Prestige Group','Brigade Enterprises','Salarpuria Sattva','Sobha Realty','Embassy Group','RMZ Corp','Mantri Developers','Puravankara','Mr. Suresh Rao','Mrs. Lakshmi Iyer','Mr. Abdul Rahman','Karnataka Estates','GVS Ventures','Mr. Venkatesh','Divyasree','Bhartiya City','Mr. Imran Khan','Shriram Properties','Mrs. Anitha Reddy','Mr. Naveen Kumar','Mr. Rajesh Gupta','Mrs. Fatima Sheikh','Nitesh Estates','Mr. Prakash Shetty','Concorde Group']
const AREAS = ['Indiranagar','Koramangala','HSR Layout','Whitefield','Jayanagar','MG Road','Marathahalli','JP Nagar','Bellandur','Electronic City','BTM Layout','Hebbal','Sarjapur Road','Banashankari','Malleshwaram','Rajajinagar','Frazer Town','Yelahanka','Brookefield','Ulsoor']
const BIZ = ['Cafe','Restaurant','Retail Store','Gym','Salon','Clinic','Cloud Kitchen','Showroom','Pharmacy','Quick-service Restaurant']
const PROP = ['Office Tower','Retail Unit','Warehouse','Standalone Building','Mall Unit','Commercial Floor','High-street Shop','Co-working Floor']
const SOURCES = ['web','whatsapp','social','web','whatsapp','web']
const STAGE = { hot: ['High Intent','Booking Made'], warm: ['Qualified','Engaged'], cold: ['New','Cold'] }
const pick = (arr, i) => arr[i % arr.length]
const isoH = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString()
const isoD = (d) => new Date(Date.now() - d * 86400 * 1000).toISOString()
const tierFor = (i) => { const r = i % 10; return r < 2 ? 'hot' : r < 5 ? 'warm' : 'cold' }

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
// realistic CRE message thread per lead
function thread(type, tier, biz, area, sqft) {
  const rent = `₹${Math.max(1, Math.round(sqft * 0.09))}K`
  const T = []
  if (type === 'brand') {
    T.push(['customer', `Hi, looking for a ${sqft} sqft ${biz.toLowerCase()} space in ${area}.`])
    T.push(['agent', `Hi! Happy to help. What's your budget range and how soon do you want to move in?`])
    if (tier !== 'cold') {
      T.push(['customer', tier === 'hot' ? `Around ${rent}/month, want to move in 4-6 weeks.` : `Maybe ${rent}/month, sometime next month.`])
      T.push(['agent', `Got it. I have a few ${area} options that fit. Want me to shortlist and set up a site visit?`])
    }
    if (tier === 'hot') { T.push(['customer', `Yes please, this week works.`]); T.push(['agent', `Done. I'll confirm 2-3 spaces and a slot shortly.`]) }
  } else {
    T.push(['customer', `I have a ${sqft} sqft ${biz.toLowerCase()} in ${area} to list.`])
    T.push(['agent', `Great! What's the expected rent and is it ready to occupy?`])
    if (tier !== 'cold') {
      T.push(['customer', tier === 'hot' ? `${rent}/month, ready now. Want tenants ASAP.` : `Around ${rent}/month, available next month.`])
      T.push(['agent', `Perfect. I'll match it to active brands looking in ${area} and line up viewings.`])
    }
    if (tier === 'hot') { T.push(['customer', `Sounds good, please proceed.`]); T.push(['agent', `On it. You'll get matched brand profiles this week.`]) }
  }
  return T
}

;(async () => {
  await supabase.from('all_leads').delete().eq('brand', BRAND).eq('metadata->>is_demo', 'true')
  const leadRows = []
  for (let i = 0; i < TOTAL; i++) {
    const type = i % 2 === 0 ? 'brand' : 'owner'
    const tier = tierFor(i)
    const name = type === 'brand' ? pick(BRANDS, Math.floor(i / 2)) : pick(OWNERS, Math.floor(i / 2))
    const area = pick(AREAS, i * 3); const biz = type === 'brand' ? pick(BIZ, i) : pick(PROP, i)
    const sqft = type === 'brand' ? 800 + (i % 12) * 600 : 2000 + (i % 15) * 2500
    const src = pick(SOURCES, i)
    // created over ~45d, weighted: recent third denser. ensure spread → curved charts.
    const createdDaysAgo = Math.floor(((i * 37) % 45))
    // ~22 leads active within 24h (recent interaction); others older
    const activeRecent = i % 5 === 0
    const interHrs = activeRecent ? (1 + (i % 23)) : (tier === 'hot' ? 12 + (i % 24) : tier === 'warm' ? 48 + (i % 72) : 96 + (i % 360))
    const hasBooking = i % Math.floor(TOTAL / BOOKINGS) === 0 // ~18 leads
    const bookingFuture = hasBooking && (i % 2 === 0)
    const s = summary(tier, type, biz, area, sqft)
    leadRows.push({
      _idx: i, _type: type, _tier: tier, _biz: biz, _area: area, _sqft: sqft, _src: src,
      customer_name: name,
      email: `${name.toLowerCase().replace(/[^a-z0-9]+/g,'.').replace(/^\.|\.$/g,'')}.${i}@example.com`,
      phone: `+9198${String(45000000 + i * 137).slice(0,8)}`,
      first_touchpoint: src, last_touchpoint: src,
      last_interaction_at: isoH(interHrs), created_at: isoD(createdDaysAgo),
      brand: BRAND,
      unified_context: {
        unified_summary: s, form_data: formData(tier),
        web: { user_type: type, conversation_summary: s },
        lokazen: { user_type: type, business_type: biz, area, city: 'Bangalore', carpet_area_sqft: sqft,
          requirement: type === 'brand' ? `Needs ${sqft} sqft ${biz.toLowerCase()} in ${area}` : `Lists ${sqft} sqft ${biz.toLowerCase()} in ${area}` },
      },
      metadata: { is_demo: true, lead_type_label: type === 'brand' ? 'Brand Owner' : 'Property Owner', heat: tier },
      lead_score: tier === 'hot' ? 78 + (i % 18) : tier === 'warm' ? 45 + (i % 22) : 12 + (i % 24),
      lead_stage: hasBooking ? 'Booking Made' : pick(STAGE[tier], i), status: tier, last_scored_at: isoH(interHrs),
      booking_date: hasBooking ? new Date(Date.now() + (bookingFuture ? ((i % 10) + 1) : -((i % 8) + 1)) * 86400000).toISOString().slice(0,10) : null,
    })
  }
  // insert leads (strip helper _fields), keep order to map ids back
  const clean = leadRows.map(({ _idx,_type,_tier,_biz,_area,_sqft,_src, ...r }) => r)
  const ids = []
  for (let c = 0; c < clean.length; c += 50) {
    const { data, error } = await supabase.from('all_leads').insert(clean.slice(c, c+50)).select('id')
    if (error) { console.error('Lead insert error:', error); process.exit(1) }
    data.forEach(d => ids.push(d.id))
  }
  // build conversations for engaged leads (skip ~half the cold to keep it natural)
  const convRows = []
  leadRows.forEach((l, i) => {
    if (l._tier === 'cold' && i % 2 === 0) return
    const msgs = thread(l._type, l._tier, l._biz, l._area, l._sqft)
    const baseHrs = l._tier === 'hot' ? (1 + (i % 20)) : l._tier === 'warm' ? (30 + (i % 60)) : (100 + (i % 200))
    msgs.forEach((m, k) => {
      convRows.push({ lead_id: ids[i], channel: l._src === 'social' ? 'social' : l._src,
        sender: m[0], content: m[1], message_type: 'text',
        metadata: { is_demo: true },
        created_at: isoH(baseHrs - k * 0.3) })
    })
  })
  let conv = 0
  for (let c = 0; c < convRows.length; c += 100) {
    const { data, error } = await supabase.from('conversations').insert(convRows.slice(c, c+100)).select('id')
    if (error) { console.error('Conversation insert error:', error); process.exit(1) }
    conv += data.length
  }
  console.log(`Seeded ${ids.length} demo leads + ${conv} conversation messages.`)
  console.log(`Bookings: ~${leadRows.filter(l => l.booking_date).length}, created over 45 days, ~${leadRows.filter((_,i)=>i%5===0).length} active in 24h.`)
})()
