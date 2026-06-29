import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
// Seeding 117 leads + ~350 messages + score re-asserts is heavy; give it room.
export const maxDuration = 300

function svc() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}
const BRAND = process.env.NEXT_PUBLIC_BRAND_ID || process.env.NEXT_PUBLIC_BRAND || 'lokazen'
const TOTAL = 117, BOOKINGS = 18

const PEOPLE = ['Rahul Sharma', 'Priya Menon', 'Arjun Reddy', 'Sneha Iyer', 'Vikram Nair', 'Ananya Rao', 'Karthik Shetty', 'Divya Pillai', 'Rohan Gupta', 'Meera Krishnan', 'Aditya Verma', 'Pooja Hegde', 'Siddharth Jain', 'Lakshmi Bhat', 'Imran Sheikh', 'Nisha Agarwal', 'Varun Kamath', 'Deepa Naidu', 'Sanjay Kulkarni', 'Ritu Saxena', 'Manoj Pillai', 'Kavya Desai', 'Aravind Murthy', 'Shruti Rao', 'Naveen Kumar', 'Anjali Mehta', 'Faisal Khan', 'Swati Joshi', 'Harish Gowda', 'Tanvi Shah', 'Raghav Bhatia', 'Nandini Prabhu', 'Vivek Anand', 'Megha Kapoor', 'Suresh Babu', 'Aisha Rahman', 'Gautam Malhotra', 'Reshma Pai', 'Akash Singh', 'Bhavana Reddy', 'Nikhil Jose', 'Sweta Pillai']
const BRANDS = ['Third Wave Coffee', 'Blue Tokai', 'Chai Point', 'FabIndia', 'Nykaa', 'Lenskart', 'Cult.fit', 'Decathlon', 'Wow! Momo', 'Burger Singh', 'Tanishq', 'Croma', 'Licious', 'Naturals Salon', 'Rebel Foods', 'Home Centre', 'boAt', 'Mokobara', 'Sleepwell', 'Pharmeasy', 'Country Delight', 'Subway', 'Chaayos', 'Beco', 'The Sleep Company', 'Bewakoof', 'Mamaearth', 'Sugar Cosmetics', 'Bira 91', 'Truffles', 'Smoor', 'Leon Grill', 'Zudio', 'Bluestone', 'GIVA', 'Boba Bhai', 'Curefoods', 'Wakefit', 'Pista House', 'Hocco']
const FIRMS = ['Prestige Group', 'Brigade Enterprises', 'Salarpuria Sattva', 'Sobha Realty', 'Embassy Group', 'RMZ Corp', 'Mantri Developers', 'Puravankara', 'Divyasree', 'Bhartiya City', 'Shriram Properties', 'Nitesh Estates', 'Concorde Group', 'GVS Ventures', 'Independent Owner']
const AREAS = ['Indiranagar', 'Koramangala', 'HSR Layout', 'Whitefield', 'Jayanagar', 'MG Road', 'Marathahalli', 'JP Nagar', 'Bellandur', 'Electronic City', 'BTM Layout', 'Hebbal', 'Sarjapur Road', 'Banashankari', 'Malleshwaram', 'Rajajinagar', 'Frazer Town', 'Yelahanka', 'Brookefield', 'Ulsoor']
const BIZ = ['Cafe', 'Restaurant', 'Retail Store', 'Gym', 'Salon', 'Clinic', 'Cloud Kitchen', 'Showroom', 'Pharmacy', 'Quick-service Restaurant']
const PROP = ['Office Tower', 'Retail Unit', 'Warehouse', 'Standalone Building', 'Mall Unit', 'Commercial Floor', 'High-street Shop', 'Co-working Floor']
const SOURCES = ['web', 'whatsapp', 'social', 'web', 'whatsapp', 'web']
const STAGE: Record<string, string[]> = { hot: ['High Intent', 'Booking Made'], warm: ['Qualified', 'Engaged'], cold: ['New', 'Cold'] }
const pick = (a: string[], i: number) => a[i % a.length]

// ── Brief variable derivations (Configuration Brief v1.0) ──────────────────
const CATEGORY_BY_BIZ: Record<string, string> = {
  'Cafe': 'Café/Bakery', 'Restaurant': 'F&B', 'Retail Store': 'Retail', 'Gym': 'Fitness',
  'Salon': 'Wellness', 'Clinic': 'Wellness', 'Cloud Kitchen': 'Cloud Kitchen',
  'Showroom': 'Retail', 'Pharmacy': 'Services', 'Quick-service Restaurant': 'QSR',
}
const PROPTYPE_BY_BIZ: Record<string, string> = {
  'Office Tower': 'office', 'Retail Unit': 'retail', 'Warehouse': 'standalone',
  'Standalone Building': 'standalone', 'Mall Unit': 'retail', 'Commercial Floor': 'office',
  'High-street Shop': 'retail', 'Co-working Floor': 'office',
}
const FORMATS = ['high-street', 'mall', 'standalone', 'food-court', 'kiosk']
const LANGS = ['en', 'en', 'en', 'hi', 'kn', 'en']
const FLOORS = ['ground', 'upper', 'basement']
const AMEN = ['parking, storage', 'parking, kitchen setup', 'storage', 'parking', 'kitchen setup, parking, storage']
const rentK = (sqft: number) => Math.max(20, Math.round(sqft * 0.09))
const isoH = (h: number) => new Date(Date.now() - h * 3600 * 1000).toISOString()
const isoD = (d: number) => new Date(Date.now() - d * 86400 * 1000).toISOString()
const tierFor = (i: number) => { const r = i % 10; return r < 2 ? 'hot' : r < 5 ? 'warm' : 'cold' }

function summary(tier: string, type: string, biz: string, area: string, sqft: number, company: string) {
  const what = type === 'brand' ? `${biz.toLowerCase()} space for ${company}` : `${biz.toLowerCase()} listing`
  if (tier === 'hot') return `Urgent. Asked about pricing/rent, wants to book a site visit this week. Ready to sign if the ${sqft} sqft ${what} in ${area} fits. Budget confirmed, moving fast.`
  if (tier === 'warm') return `Interested in a ${sqft} sqft ${what} in ${area}. Asked about availability and options, comparing areas. Considering next month.`
  return `Initial enquiry about ${what} around ${area}. Just exploring, no firm timeline yet.`
}
function formData(tier: string) {
  if (tier === 'hot') return { has_website: true, has_ai_systems: false, urgency: 'asap', monthly_leads: '80' }
  if (tier === 'warm') return { has_website: true, has_ai_systems: false, urgency: 'this_month', monthly_leads: '30' }
  return {}
}

function buildLeadRows() {
  const rows: any[] = []
  for (let i = 0; i < TOTAL; i++) {
    const type = i % 2 === 0 ? 'brand' : 'owner'
    const tier = tierFor(i)
    const person = pick(PEOPLE, i)
    const company = type === 'brand' ? pick(BRANDS, Math.floor(i / 2)) : pick(FIRMS, Math.floor(i / 2))
    const area = pick(AREAS, i * 3); const biz = type === 'brand' ? pick(BIZ, i) : pick(PROP, i)
    const sqft = type === 'brand' ? 800 + (i % 12) * 600 : 2000 + (i % 15) * 2500
    const src = pick(SOURCES, i)
    const activeRecent = i % 5 === 0
    const interHrs = activeRecent ? (1 + (i % 23)) : (tier === 'hot' ? 12 + (i % 24) : tier === 'warm' ? 48 + (i % 72) : 96 + (i % 360))
    const hasBooking = i % Math.floor(TOTAL / BOOKINGS) === 0
    const bookingFuture = hasBooking && (i % 2 === 0)
    const s = summary(tier, type, biz, area, sqft, company)
    const lang = pick(LANGS, i * 3)
    const outlets = 1 + (i % 8)
    const zone2 = pick(AREAS, i * 7)
    const rk = rentK(sqft)
    const fmt = pick(FORMATS, i)
    const tl = tier === 'hot' ? 'immediate' : tier === 'warm' ? '1-3 mo' : 'exploring'
    // Full brief variable set per audience side, stored structured under [BRAND].
    const creCtx = type === 'brand'
      ? {
          user_type: 'brand', company, business_type: biz, area, city: 'Bangalore', carpet_area_sqft: sqft,
          requirement: `${company} needs ${sqft} sqft ${biz.toLowerCase()} in ${area}`,
          brand_name: company,
          brand_category: CATEGORY_BY_BIZ[biz] || 'Retail',
          current_outlets: String(outlets),
          expansion_intent: outlets === 1 ? 'first outlet' : outlets <= 5 ? '2-5' : '5+',
          target_zones: `${area}, ${zone2}`,
          required_size_sqft: `${sqft}-${sqft + 400}`,
          budget_monthly_rent: `₹${rk}K-${rk + 20}K`,
          preferred_format: fmt,
          timeline: tl,
          preferred_language: lang,
        }
      : {
          user_type: 'owner', company, business_type: biz, area, city: 'Bangalore', carpet_area_sqft: sqft,
          requirement: `Lists ${sqft} sqft ${biz.toLowerCase()} in ${area}`,
          property_zone: area,
          property_address: `${biz}, ${area} Main Road, Bengaluru`,
          property_size_sqft: String(sqft),
          asking_rent_monthly: `₹${rk}K`,
          property_type: PROPTYPE_BY_BIZ[biz] || 'other',
          floor: pick(FLOORS, i),
          frontage_ft: String(15 + (i % 6) * 5),
          availability_date: new Date(Date.now() + ((i % 30) + 5) * 86400000).toISOString().slice(0, 10),
          amenities: pick(AMEN, i),
          preferred_language: lang,
        }
    rows.push({
      customer_name: person,
      email: `${person.toLowerCase().replace(/[^a-z0-9]+/g, '.')}.${i}@example.com`,
      phone: `+9198${String(45000000 + i * 137).slice(0, 8)}`,
      first_touchpoint: src, last_touchpoint: src, last_interaction_at: isoH(interHrs), created_at: isoD((i * 37) % 45),
      brand: BRAND,
      unified_context: {
        unified_summary: s, form_data: formData(tier),
        web: { user_type: type, conversation_summary: s, profile: { full_name: person, company, city: 'Bangalore' } },
        [BRAND]: creCtx,
      },
      metadata: { is_demo: true, lead_type_label: type === 'brand' ? 'Brand Owner' : 'Property Owner', heat: tier, company },
      lead_score: tier === 'hot' ? 78 + (i % 18) : tier === 'warm' ? 45 + (i % 22) : 12 + (i % 24),
      lead_stage: hasBooking ? 'Booking Made' : pick(STAGE[tier], i), status: tier, last_scored_at: isoH(interHrs),
      booking_date: hasBooking ? new Date(Date.now() + (bookingFuture ? ((i % 10) + 1) : -((i % 8) + 1)) * 86400000).toISOString().slice(0, 10) : null,
      booking_time: hasBooking ? pick(['10:30:00', '11:00:00', '15:00:00', '16:30:00', '17:00:00'], i) : null,
      _i: i, _type: type, _tier: tier, _biz: biz, _area: area, _sqft: sqft, _src: src, _person: person, _company: company,
    })
  }
  return rows
}

function thread(person: string, type: string, tier: string, biz: string, area: string, sqft: number, company: string) {
  const fn = person.split(' ')[0]; const rent = `₹${Math.max(1, Math.round(sqft * 0.09))}K`; const T: [string, string][] = []
  if (type === 'brand') {
    T.push(['customer', `Hi, this is ${fn} from ${company}. Looking for a ${sqft} sqft ${biz.toLowerCase()} space in ${area}.`])
    T.push(['agent', `Hi ${fn}! Happy to help. What's your budget and how soon do you want to move in?`])
    if (tier !== 'cold') { T.push(['customer', tier === 'hot' ? `Around ${rent}/month, move-in 4-6 weeks.` : `Maybe ${rent}/month, next month.`]); T.push(['agent', `Got it. I'll shortlist ${area} options and set up a site visit.`]) }
    if (tier === 'hot') { T.push(['customer', `Yes, this week works.`]); T.push(['agent', `Done. Confirming 2-3 spaces and a slot.`]) }
  } else {
    const owns = company === 'Independent Owner' ? 'my' : `our (${company})`
    T.push(['customer', `Hi, ${fn} here. I want to list ${owns} ${sqft} sqft ${biz.toLowerCase()} in ${area}.`])
    T.push(['agent', `Great ${fn}! Expected rent, and is it ready to occupy?`])
    if (tier !== 'cold') { T.push(['customer', tier === 'hot' ? `${rent}/month, ready now. Want tenants ASAP.` : `Around ${rent}/month, available next month.`]); T.push(['agent', `Perfect. I'll match it to active brands in ${area} and line up viewings.`]) }
    if (tier === 'hot') { T.push(['customer', `Please proceed.`]); T.push(['agent', `On it — matched brand profiles this week.`]) }
  }
  return T
}

export async function GET() {
  const supabase = svc()
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
  const { count, error } = await supabase.from('all_leads').select('id', { count: 'exact', head: true })
    .eq('brand', BRAND).eq('metadata->>is_demo', 'true')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ count: count || 0 })
}

export async function POST() {
  const supabase = svc()
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
  // Clear prior demo data — conversations first (FK on lead_id) so reseeds don't
  // leave orphaned demo messages behind, then the demo leads themselves.
  const { data: oldLeads } = await supabase.from('all_leads').select('id')
    .eq('brand', BRAND).eq('metadata->>is_demo', 'true')
  const oldIds = (oldLeads || []).map((l: any) => l.id)
  for (let c = 0; c < oldIds.length; c += 100) {
    await supabase.from('conversations').delete().in('lead_id', oldIds.slice(c, c + 100))
  }
  await supabase.from('all_leads').delete().eq('brand', BRAND).eq('metadata->>is_demo', 'true')
  const rows = buildLeadRows()
  const clean = rows.map(({ _i, _type, _tier, _biz, _area, _sqft, _src, _person, _company, ...r }: any) => r)
  const ids: string[] = []
  for (let c = 0; c < clean.length; c += 50) {
    const { data, error } = await supabase.from('all_leads').insert(clean.slice(c, c + 50)).select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    ;(data || []).forEach((d: any) => ids.push(d.id))
  }
  // Conversation threads (skip half the cold leads for natural variety)
  const convRows: any[] = []
  rows.forEach((l: any, i: number) => {
    if (l._tier === 'cold' && i % 2 === 0) return
    const msgs = thread(l._person, l._type, l._tier, l._biz, l._area, l._sqft, l._company)
    const baseHrs = l._tier === 'hot' ? (1 + (i % 20)) : l._tier === 'warm' ? (30 + (i % 60)) : (100 + (i % 200))
    msgs.forEach((m, k) => convRows.push({
      lead_id: ids[i], channel: l._src === 'social' ? 'social' : l._src, sender: m[0], content: m[1], message_type: 'text',
      metadata: m[0] === 'agent' ? { is_demo: true, input_to_output_gap_ms: 1500 + ((i * 37 + k * 13) % 6500) } : { is_demo: true },
      created_at: isoH(baseHrs - k * 0.05),
    }))
  })
  for (let c = 0; c < convRows.length; c += 100) {
    const { error } = await supabase.from('conversations').insert(convRows.slice(c, c + 100))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  // Re-assert scores — inserting conversations fires the DB scoring trigger which
  // overwrites lead_score; a plain UPDATE doesn't re-trigger, so this sticks.
  for (let i = 0; i < rows.length; i++) {
    await supabase.from('all_leads').update({ lead_score: rows[i].lead_score, lead_stage: rows[i].lead_stage }).eq('id', ids[i])
  }
  return NextResponse.json({ seeded: ids.length, messages: convRows.length })
}

export async function DELETE() {
  const supabase = svc()
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
  const { data, error } = await supabase.from('all_leads').delete()
    .eq('brand', BRAND).eq('metadata->>is_demo', 'true').select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: data?.length || 0 })
}
