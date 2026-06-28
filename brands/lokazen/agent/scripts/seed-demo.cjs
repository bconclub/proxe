// Seed 117 rich Lokazen demo leads + conversation threads. Run: node scripts/seed-demo.cjs
// LEAD = a PERSON (contact). Brand/company + location are secondary.
// Tagged metadata.is_demo=true; created_at spread over ~45d (curved charts);
// ~15% bookings (some upcoming); a batch active in 24h; realistic message threads.
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
const BRAND = 'lokazen'; const TOTAL = 117; const BOOKINGS = 18

// PEOPLE — the actual lead (who we talk to)
const PEOPLE = ['Rahul Sharma','Priya Menon','Arjun Reddy','Sneha Iyer','Vikram Nair','Ananya Rao','Karthik Shetty','Divya Pillai','Rohan Gupta','Meera Krishnan','Aditya Verma','Pooja Hegde','Siddharth Jain','Lakshmi Bhat','Imran Sheikh','Nisha Agarwal','Varun Kamath','Deepa Naidu','Sanjay Kulkarni','Ritu Saxena','Manoj Pillai','Kavya Desai','Aravind Murthy','Shruti Rao','Naveen Kumar','Anjali Mehta','Faisal Khan','Swati Joshi','Harish Gowda','Tanvi Shah','Raghav Bhatia','Nandini Prabhu','Vivek Anand','Megha Kapoor','Suresh Babu','Aisha Rahman','Gautam Malhotra','Reshma Pai','Akash Singh','Bhavana Reddy','Nikhil Jose','Sweta Pillai']
// COMPANIES — the brand (seeking space)
const BRANDS = ['Third Wave Coffee','Blue Tokai','Chai Point','FabIndia','Nykaa','Lenskart','Cult.fit','Decathlon','Wow! Momo','Burger Singh','Tanishq','Croma','Licious','Naturals Salon','Rebel Foods','Home Centre','boAt','Mokobara','Sleepwell','Pharmeasy','Country Delight','Subway','Chaayos','Beco','The Sleep Company','Bewakoof','Mamaearth','Sugar Cosmetics','Bira 91','Truffles','Smoor','Leon Grill','Zudio','Bluestone','GIVA','Boba Bhai','Curefoods','Wakefit','Pista House','Hocco']
// REALTY FIRMS — the company a property owner represents
const FIRMS = ['Prestige Group','Brigade Enterprises','Salarpuria Sattva','Sobha Realty','Embassy Group','RMZ Corp','Mantri Developers','Puravankara','Divyasree','Bhartiya City','Shriram Properties','Nitesh Estates','Concorde Group','GVS Ventures','Independent Owner']
const AREAS = ['Indiranagar','Koramangala','HSR Layout','Whitefield','Jayanagar','MG Road','Marathahalli','JP Nagar','Bellandur','Electronic City','BTM Layout','Hebbal','Sarjapur Road','Banashankari','Malleshwaram','Rajajinagar','Frazer Town','Yelahanka','Brookefield','Ulsoor']
const BIZ = ['Cafe','Restaurant','Retail Store','Gym','Salon','Clinic','Cloud Kitchen','Showroom','Pharmacy','Quick-service Restaurant']
const PROP = ['Office Tower','Retail Unit','Warehouse','Standalone Building','Mall Unit','Commercial Floor','High-street Shop','Co-working Floor']
const SOURCES = ['web','whatsapp','social','web','whatsapp','web']
const STAGE = { hot: ['High Intent','Booking Made'], warm: ['Qualified','Engaged'], cold: ['New','Cold'] }
const pick = (arr, i) => arr[i % arr.length]
const isoH = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString()
const isoD = (d) => new Date(Date.now() - d * 86400 * 1000).toISOString()
const tierFor = (i) => { const r = i % 10; return r < 2 ? 'hot' : r < 5 ? 'warm' : 'cold' }
const firstName = (n) => n.split(' ')[0]

function summary(tier, type, biz, area, sqft, company) {
  const what = type === 'brand' ? `${biz.toLowerCase()} space for ${company}` : `${biz.toLowerCase()} listing`
  if (tier === 'hot') return `Urgent. Asked about pricing/rent, wants to book a site visit this week. Ready to sign if the ${sqft} sqft ${what} in ${area} fits. Budget confirmed, moving fast.`
  if (tier === 'warm') return `Interested in a ${sqft} sqft ${what} in ${area}. Asked about availability and options, comparing areas. Considering next month.`
  return `Initial enquiry about ${what} around ${area}. Just exploring, no firm timeline yet.`
}
function formData(tier) {
  if (tier === 'hot') return { has_website: true, has_ai_systems: false, urgency: 'asap', monthly_leads: '80' }
  if (tier === 'warm') return { has_website: true, has_ai_systems: false, urgency: 'this_month', monthly_leads: '30' }
  return {}
}
function thread(person, type, tier, biz, area, sqft, company) {
  const rent = `₹${Math.max(1, Math.round(sqft * 0.09))}K`; const T = []
  if (type === 'brand') {
    T.push(['customer', `Hi, this is ${firstName(person)} from ${company}. Looking for a ${sqft} sqft ${biz.toLowerCase()} space in ${area}.`])
    T.push(['agent', `Hi ${firstName(person)}! Happy to help. What's your budget and how soon do you want to move in?`])
    if (tier !== 'cold') { T.push(['customer', tier === 'hot' ? `Around ${rent}/month, move-in 4-6 weeks.` : `Maybe ${rent}/month, next month.`]); T.push(['agent', `Got it. I'll shortlist ${area} options and set up a site visit.`]) }
    if (tier === 'hot') { T.push(['customer', `Yes, this week works.`]); T.push(['agent', `Done. Confirming 2-3 spaces and a slot.`]) }
  } else {
    const owns = company === 'Independent Owner' ? 'my' : `our (${company})`
    T.push(['customer', `Hi, ${firstName(person)} here. I want to list ${owns} ${sqft} sqft ${biz.toLowerCase()} in ${area}.`])
    T.push(['agent', `Great ${firstName(person)}! Expected rent, and is it ready to occupy?`])
    if (tier !== 'cold') { T.push(['customer', tier === 'hot' ? `${rent}/month, ready now. Want tenants ASAP.` : `Around ${rent}/month, available next month.`]); T.push(['agent', `Perfect. I'll match it to active brands in ${area} and line up viewings.`]) }
    if (tier === 'hot') { T.push(['customer', `Please proceed.`]); T.push(['agent', `On it — matched brand profiles this week.`]) }
  }
  return T
}

;(async () => {
  await supabase.from('all_leads').delete().eq('brand', BRAND).eq('metadata->>is_demo', 'true')
  const leadRows = []
  for (let i = 0; i < TOTAL; i++) {
    const type = i % 2 === 0 ? 'brand' : 'owner'
    const tier = tierFor(i)
    const person = pick(PEOPLE, i)
    const company = type === 'brand' ? pick(BRANDS, Math.floor(i / 2)) : pick(FIRMS, Math.floor(i / 2))
    const area = pick(AREAS, i * 3); const biz = type === 'brand' ? pick(BIZ, i) : pick(PROP, i)
    const sqft = type === 'brand' ? 800 + (i % 12) * 600 : 2000 + (i % 15) * 2500
    const src = pick(SOURCES, i)
    const createdDaysAgo = (i * 37) % 45
    const activeRecent = i % 5 === 0
    const interHrs = activeRecent ? (1 + (i % 23)) : (tier === 'hot' ? 12 + (i % 24) : tier === 'warm' ? 48 + (i % 72) : 96 + (i % 360))
    const hasBooking = i % Math.floor(TOTAL / BOOKINGS) === 0
    const bookingFuture = hasBooking && (i % 2 === 0)
    const s = summary(tier, type, biz, area, sqft, company)
    leadRows.push({
      _i: i, _type: type, _tier: tier, _biz: biz, _area: area, _sqft: sqft, _src: src, _person: person, _company: company,
      customer_name: person,
      email: `${person.toLowerCase().replace(/[^a-z0-9]+/g,'.')}.${i}@example.com`,
      phone: `+9198${String(45000000 + i * 137).slice(0,8)}`,
      first_touchpoint: src, last_touchpoint: src,
      last_interaction_at: isoH(interHrs), created_at: isoD(createdDaysAgo),
      brand: BRAND,
      unified_context: {
        unified_summary: s, form_data: formData(tier),
        web: { user_type: type, conversation_summary: s, profile: { full_name: person, company, city: 'Bangalore' } },
        lokazen: { user_type: type, company, business_type: biz, area, city: 'Bangalore', carpet_area_sqft: sqft,
          requirement: type === 'brand' ? `${company} needs ${sqft} sqft ${biz.toLowerCase()} in ${area}` : `Lists ${sqft} sqft ${biz.toLowerCase()} in ${area}` },
      },
      metadata: { is_demo: true, lead_type_label: type === 'brand' ? 'Brand Owner' : 'Property Owner', heat: tier, company },
      lead_score: tier === 'hot' ? 78 + (i % 18) : tier === 'warm' ? 45 + (i % 22) : 12 + (i % 24),
      lead_stage: hasBooking ? 'Booking Made' : pick(STAGE[tier], i), status: tier, last_scored_at: isoH(interHrs),
      booking_date: hasBooking ? new Date(Date.now() + (bookingFuture ? ((i % 10) + 1) : -((i % 8) + 1)) * 86400000).toISOString().slice(0,10) : null,
      booking_time: hasBooking ? pick(['10:30:00','11:00:00','15:00:00','16:30:00','17:00:00'], i) : null,
    })
  }
  const clean = leadRows.map(({ _i,_type,_tier,_biz,_area,_sqft,_src,_person,_company, ...r }) => r)
  const ids = []
  for (let c = 0; c < clean.length; c += 50) {
    const { data, error } = await supabase.from('all_leads').insert(clean.slice(c, c+50)).select('id')
    if (error) { console.error('Lead insert error:', error); process.exit(1) }
    data.forEach(d => ids.push(d.id))
  }
  const convRows = []
  leadRows.forEach((l, i) => {
    if (l._tier === 'cold' && i % 2 === 0) return
    const msgs = thread(l._person, l._type, l._tier, l._biz, l._area, l._sqft, l._company)
    const baseHrs = l._tier === 'hot' ? (1 + (i % 20)) : l._tier === 'warm' ? (30 + (i % 60)) : (100 + (i % 200))
    msgs.forEach((m, k) => convRows.push({ lead_id: ids[i], channel: l._src === 'social' ? 'social' : l._src, sender: m[0], content: m[1], message_type: 'text',
      metadata: m[0] === 'agent' ? { is_demo: true, input_to_output_gap_ms: 1500 + ((i * 37 + k * 13) % 6500) } : { is_demo: true },
      created_at: isoH(baseHrs - k * 0.05) }))
  })
  let conv = 0
  for (let c = 0; c < convRows.length; c += 100) {
    const { data, error } = await supabase.from('conversations').insert(convRows.slice(c, c+100)).select('id')
    if (error) { console.error('Conversation insert error:', error); process.exit(1) }
    conv += data.length
  }
  // Re-assert intended scores/stages: inserting conversations fires
  // trigger_conversations_update_score which recomputes lead_score via the DB
  // function (low for demo data). A plain UPDATE does NOT re-trigger scoring, so
  // this sticks — metrics (High Intent = score>=70) then reflect our demo spread.
  for (let i = 0; i < leadRows.length; i++) {
    await supabase.from('all_leads').update({ lead_score: leadRows[i].lead_score, lead_stage: leadRows[i].lead_stage }).eq('id', ids[i])
  }
  console.log(`Seeded ${ids.length} demo leads (person-first) + ${conv} messages, scores re-asserted. Bookings: ${leadRows.filter(l => l.booking_date).length}.`)
})()
