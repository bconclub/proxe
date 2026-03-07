import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CALENDAR_ID = 'bconclubx@gmail.com'
const TIMEZONE = 'Asia/Kolkata'
const EVENT_DURATION_MINUTES = 30

const bookings = [
  {
    name: 'Abu Jafar',
    brand: 'Work Planet Urban Solutions',
    date: '2026-03-04',
    time: '10:00',
    email: 'abu.jafar@workplaneturban.com',
    phone: '+916360171453',
    leadId: '073c9be1-93ca-49f1-b696-e2e4d5c1a07b',
    title: 'AI Lead Qualification for Meta Ads - Work Planet Urban Solutions',
  },
  {
    name: null as string | null,
    brand: 'Sparta Moto Defence',
    date: '2026-03-03',
    time: '11:00',
    email: null as string | null,
    phone: null as string | null,
    leadId: '103dad08-abb0-43d7-97c4-ce57bf3df918',
    title: 'AI Lead Generation for Auto Detailing - Sparta Moto Defence',
  },
  {
    name: null as string | null,
    brand: 'SM Agro Seeds & Pots',
    date: '2026-03-06',
    time: '15:00',
    email: null as string | null,
    phone: null as string | null,
    leadId: '2c886a16-b32f-46fc-af6b-e1aea10ac207',
    title: 'Online Customer Acquisition - SM Agro Seeds & Pots',
  },
  {
    name: 'Ankush Bihani',
    brand: 'Sobha LTD',
    date: '2026-03-04',
    time: '18:00',
    email: 'ankushbihani45@gmail.com',
    phone: '+919593661548',
    leadId: '86305e62-c158-43c9-81b7-08c442d7bb9d',
    title: 'AI Lead Machine at Scale - Sobha LTD',
  },
  {
    name: 'Rajkumar',
    brand: 'Vips Paramedical College',
    date: '2026-03-04',
    time: '15:00',
    email: null as string | null,
    phone: null as string | null,
    leadId: '4819268a-555e-4abb-9c2d-39d9bba0a4fe',
    title: 'AI Enrollment System for Multi-Branch Growth - Vips Paramedical College',
  },
  {
    name: 'Abhishek Vk',
    brand: 'Digital It Up',
    date: '2026-03-04',
    time: '13:00',
    email: 'technology@digitalitup.in',
    phone: '+918310596381',
    leadId: 'f382f3dd-70bd-4ff5-9416-43260b0b783c',
    title: 'AI Integration Strategy - Digital It Up',
  },
  {
    name: null as string | null,
    brand: null as string | null,
    date: '2026-03-04',
    time: '15:00',
    email: null as string | null,
    phone: null as string | null,
    leadId: 'b09a9467-71ff-48e6-93b0-78081e2d88e3',
    title: 'AI Lead Nurturing for Parent Enrollment',
  },
  {
    name: 'Ramesh Babu',
    brand: 'Confexmeet',
    date: '2026-03-04',
    time: '13:00',
    email: 'ramesh.sri804@gmail.com',
    phone: '+9108431429127',
    leadId: 'c7324d53-1985-47f9-8930-61708767a142',
    title: 'AI Audience Targeting Strategy - Confexmeet',
  },
  {
    name: 'Leslin',
    brand: 'Claysol',
    date: '2026-03-04',
    time: '18:00',
    email: 'columbus@claysol.com',
    phone: '+918095288163',
    leadId: '7096a261-2551-46d7-8c7a-1b0f0ba055ea',
    title: 'AI Lead Generation for OTT & Automotive - Claysol',
  },
  {
    name: 'Manu Gowda',
    brand: 'Savari Holidays',
    date: '2026-03-04',
    time: '11:00',
    email: 'manumandya123@gmail.com',
    phone: '+919538221531',
    leadId: '1e5b4ae7-ab08-4087-82de-12f785511d87',
    title: 'Google Ads Conversion Fix - Savari Holidays',
  },
]

function getGoogleAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  let key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY

  if (!email || !key) {
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')
  }

  key = key
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()

  return new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  })
}

export async function GET(request: NextRequest) {
  // Simple secret check to prevent accidental triggers
  const secret = request.nextUrl.searchParams.get('secret')
  if (secret !== 'backfill-2026-03-04') {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 })
  }

  const logs: string[] = []
  const log = (msg: string) => {
    logs.push(msg)
    console.log(msg)
  }

  try {
    log('Starting backfill of Google Calendar events...')

    const auth = getGoogleAuth()
    const calendar = google.calendar({ version: 'v3', auth })

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null

    let success = 0
    let failed = 0
    const results: Array<Record<string, unknown>> = []

    for (let i = 0; i < bookings.length; i++) {
      const b = { ...bookings[i] }
      log(`\n── Booking ${i + 1}/${bookings.length}: ${b.title} ──`)

      // Fill in missing fields from Supabase
      if (supabase && (!b.name || !b.email || !b.phone || !b.brand)) {
        try {
          const { data: lead } = await supabase
            .from('all_leads')
            .select('customer_name, email, phone, unified_context')
            .eq('id', b.leadId)
            .maybeSingle()

          if (lead) {
            if (!b.name && lead.customer_name) b.name = lead.customer_name
            if (!b.email && lead.email) b.email = lead.email
            if (!b.phone && lead.phone) b.phone = lead.phone
            if (!b.brand) {
              const profile = (lead.unified_context as Record<string, any>)?.whatsapp?.profile
              if (profile?.company) b.brand = profile.company
            }
            log(`   DB lookup: name=${b.name}, email=${b.email}, phone=${b.phone}`)
          } else {
            log(`   Lead ${b.leadId} not found in DB`)
          }
        } catch (err: any) {
          log(`   DB lookup failed: ${err.message}`)
        }
      }

      // Append brand to title if it was null and we found one
      if (b.title === 'AI Lead Nurturing for Parent Enrollment' && b.brand) {
        b.title = `${b.title} - ${b.brand}`
      }

      // Create calendar event
      const startISO = `${b.date}T${b.time}:00`
      const endMin = parseInt(b.time.split(':')[1] || '0') + EVENT_DURATION_MINUTES
      const endH = Math.floor(endMin / 60) + parseInt(b.time.split(':')[0])
      const endM = endMin % 60
      const endTimeISO = `${b.date}T${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`

      try {
        const event = await calendar.events.insert({
          calendarId: CALENDAR_ID,
          conferenceDataVersion: 1,
          resource: {
            summary: b.title,
            description: [
              'BCON Strategy Call',
              `Lead: ${b.name || 'Unknown'}`,
              `Brand: ${b.brand || 'Unknown'}`,
              `Phone: ${b.phone || 'N/A'}`,
              `Lead ID: ${b.leadId}`,
            ].join('\n'),
            start: { dateTime: startISO, timeZone: TIMEZONE },
            end: { dateTime: endTimeISO, timeZone: TIMEZONE },
            conferenceData: {
              createRequest: {
                requestId: crypto.randomUUID(),
                conferenceSolutionKey: { type: 'hangoutsMeet' },
              },
            },
            reminders: {
              useDefault: false,
              overrides: [
                { method: 'popup', minutes: 1440 },
                { method: 'popup', minutes: 60 },
              ],
            },
          },
        })

        const meetLink =
          event.data.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri || null
        const calendarLink = event.data.htmlLink
        const eventId = event.data.id

        log(`   Created | Meet: ${meetLink || 'none'} | Calendar: ${calendarLink}`)

        results.push({
          title: b.title,
          date: b.date,
          time: b.time,
          eventId,
          meetLink,
          calendarLink,
          success: true,
        })

        // Update whatsapp_sessions with booking data
        if (supabase) {
          try {
            const { data: session } = await supabase
              .from('whatsapp_sessions')
              .select('id')
              .eq('lead_id', b.leadId)
              .maybeSingle()

            if (session) {
              await supabase
                .from('whatsapp_sessions')
                .update({
                  booking_date: b.date,
                  booking_time: b.time,
                  booking_status: 'Call Booked',
                  booking_title: b.title,
                  booking_meet_link: meetLink || null,
                })
                .eq('id', session.id)
              log(`   Updated whatsapp_sessions (session: ${session.id})`)
            } else {
              log(`   No whatsapp_session found for lead ${b.leadId}`)
            }

            // Update all_leads unified_context
            const { data: lead } = await supabase
              .from('all_leads')
              .select('unified_context')
              .eq('id', b.leadId)
              .maybeSingle()

            if (lead) {
              const ctx = (lead.unified_context as Record<string, any>) || {}
              const wa = ctx.whatsapp || {}
              await supabase
                .from('all_leads')
                .update({
                  unified_context: {
                    ...ctx,
                    whatsapp: {
                      ...wa,
                      booking_status: 'Call Booked',
                      booking_date: b.date,
                      booking_time: b.time,
                      booking_meet_link: meetLink,
                    },
                  },
                })
                .eq('id', b.leadId)
              log(`   Updated all_leads unified_context`)
            }
          } catch (dbErr: any) {
            log(`   DB update failed: ${dbErr.message}`)
          }
        }

        success++
      } catch (err: any) {
        log(`   FAILED: ${err.message}`)
        results.push({ title: b.title, date: b.date, time: b.time, success: false, error: err.message })
        failed++
      }
    }

    log(`\nDone! ${success} created, ${failed} failed`)

    return NextResponse.json({
      success: true,
      created: success,
      failed,
      results,
      logs,
    })
  } catch (error: any) {
    log(`Fatal error: ${error.message}`)
    return NextResponse.json({ error: error.message, logs }, { status: 500 })
  }
}
