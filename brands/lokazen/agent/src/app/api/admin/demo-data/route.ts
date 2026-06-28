import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

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
    rows.push({
      customer_name: person,
      email: `${person.toLowerCase().replace(/[^a-z0-9]+/g, '.')}.${i}@example.com`,
      phone: `+9198${String(45000000 + i * 137).slice(0, 8)}`,
      first_touchpoint: src, last_touchpoint: src, last_interaction_at: isoH(interHrs), created_at: isoD((i * 37) % 45),
      brand: BRAND,
      unified_context: {
        unified_summary: s, form_data: formData(tier),
        web: { user_type: type, conversation_summary: s, profile: { full_name: person, company, city: 'Bangalore' } },
        [BRAND]: { user_type: type, company, business_type: biz, area, city: 'Bangalore', carpet_area_sqft: sqft,
          requirement: type === 'brand' ? `${company} needs ${sqft} sqft ${biz.toLowerCase()} in ${area}` : `Lists ${sqft} sqft ${biz.toLowerCase()} in ${area}` },
      },
      metadata: { is_demo: true, lead_type_label: type === 'brand' ? 'Brand Owner' : 'Property Owner', heat: tier, company },
      lead_score: tier === 'hot' ? 78 + (i % 18) : tier === 'warm' ? 45 + (i % 22) : 12 + (i % 24),
      lead_stage: hasBooking ? 'Booking Made' : pick(STAGE[tier], i), status: tier, last_scored_at: isoH(interHrs),
      booking_date: hasBooking ? new Date(Date.now() + (bookingFuture ? ((i % 10) + 1) : -((i % 8) + 1)) * 86400000).toISOString().slice(0, 10) : null,
    })
  }
  return rows
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
  await supabase.from('all_leads').delete().eq('brand', BRAND).eq('metadata->>is_demo', 'true')
  const rows = buildLeadRows()
  let seeded = 0
  for (let c = 0; c < rows.length; c += 50) {
    const { data, error } = await supabase.from('all_leads').insert(rows.slice(c, c + 50)).select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    seeded += data?.length || 0
  }
  return NextResponse.json({ seeded })
}

export async function DELETE() {
  const supabase = svc()
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
  const { data, error } = await supabase.from('all_leads').delete()
    .eq('brand', BRAND).eq('metadata->>is_demo', 'true').select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: data?.length || 0 })
}
