import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateFromImage, type VisionMediaType } from '@/lib/agent-core'
import { BRAND_ID } from '@/configs'

export const dynamic = 'force-dynamic'
// Vision calls can run a few seconds; give them headroom on Vercel.
export const maxDuration = 60

const ALLOWED_MEDIA: Record<string, VisionMediaType> = {
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
  'image/gif': 'image/gif',
}

// ~7MB of base64 (Anthropic caps source images at ~5MB decoded). Reject early
// with a clear message instead of letting the API throw an opaque 400.
const MAX_BASE64_LEN = 7_000_000

// bcon (and its clone pop) run the agency-business extraction; other brands
// keep the aviation-training extraction their forks shipped with.
const IS_AGENCY_BRAND = ['bcon', 'pop'].includes(BRAND_ID)

const AGENCY_SYSTEM_PROMPT = `You read a screenshot of a WhatsApp (or similar messaging) chat / lead form and pull out business-lead details for BCON, an AI-first marketing agency that sells to businesses.

Return ONLY a single JSON object, no prose, no markdown fences. Schema:
{
  "name": string | null,             // the person's name from the chat header / contact
  "phone": string | null,            // their phone, digits + country code, else null
  "email": string | null,            // email if visible, else null
  "city": string | null,             // city/location if mentioned, else null
  "business_name": string | null,    // the company/brand name if mentioned
  "business_type": string | null,    // what the business does (e.g. "interior design", "dental clinic")
  "service_interest": string | null, // what they want from BCON (e.g. "lead automation", "AI brand audit", "ads", "website")
  "website_status": string | null,   // e.g. "has a website", "no website", a URL - if mentioned
  "lead_volume": string | null,      // any volume of leads/enquiries/customers mentioned (e.g. "around 100 leads a month")
  "urgency": string | null,          // how soon they want to start, if stated (e.g. "asap", "next month")
  "summary": string | null           // one or two short sentences summarising what they want
}

Rules:
- Only use information actually visible in the image. Never invent a phone number, email, or name.
- The name is usually at the top of the chat. If it is itself a phone number, put it in "phone" and leave "name" null.
- Phone: keep country code if shown (e.g. +91...). Strip spaces and dashes. If no digits are visible, use null.
- If a field isn't present, use null. Do not guess.`

const AVIATION_SYSTEM_PROMPT = `You read a screenshot of a WhatsApp (or similar messaging) chat and pull out lead details for an aviation-training CRM (Windchasers - pilot training, DGCA, cabin crew, helicopter).

Return ONLY a single JSON object, no prose, no markdown fences. Schema:
{
  "name": string | null,            // the person's name from the chat header / contact
  "phone": string | null,           // their phone number if visible, digits + country code, else null
  "email": string | null,           // email if visible, else null
  "city": string | null,            // city/location if mentioned, else null
  "interest": string | null,        // what they're asking about (e.g. "DGCA ground classes", "cabin crew course"), else null
  "education": string | null,       // education/qualification if mentioned (e.g. "12th with PCM", "B.Sc", "Diploma"), else null
  "summary": string | null          // one or two short sentences summarising what the person wants
}

Rules:
- Only use information actually visible in the image. Never invent a phone number, email, or name.
- The name is usually at the top of the chat. If it is itself a phone number, put it in "phone" and leave "name" null.
- Phone: keep country code if shown (e.g. +91...). Strip spaces and dashes. If no digits are visible, use null.
- If a field isn't present, use null. Do not guess.`

const SYSTEM_PROMPT = IS_AGENCY_BRAND ? AGENCY_SYSTEM_PROMPT : AVIATION_SYSTEM_PROMPT

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const image: string | undefined = body?.image
    if (!image || typeof image !== 'string') {
      return NextResponse.json({ error: 'Missing image' }, { status: 400 })
    }

    // Accept a data URL ("data:image/png;base64,AAAA...") or a bare base64 string.
    let mediaType: VisionMediaType = 'image/png'
    let base64 = image
    const dataUrlMatch = image.match(/^data:([^;]+);base64,(.*)$/s)
    if (dataUrlMatch) {
      const declared = dataUrlMatch[1].toLowerCase()
      if (!ALLOWED_MEDIA[declared]) {
        return NextResponse.json(
          { error: `Unsupported image type: ${declared}. Use JPEG, PNG, WebP, or GIF.` },
          { status: 400 },
        )
      }
      mediaType = ALLOWED_MEDIA[declared]
      base64 = dataUrlMatch[2]
    }

    base64 = base64.trim()
    if (!base64) {
      return NextResponse.json({ error: 'Empty image data' }, { status: 400 })
    }
    if (base64.length > MAX_BASE64_LEN) {
      return NextResponse.json(
        { error: 'Image too large. Please upload a screenshot under ~5MB.' },
        { status: 413 },
      )
    }

    let raw: string
    try {
      raw = await generateFromImage(
        SYSTEM_PROMPT,
        'Extract the lead details from this chat screenshot as JSON.',
        base64,
        mediaType,
      )
    } catch (err: any) {
      console.error('[extract-screenshot] vision call failed:', err?.message || err)
      return NextResponse.json(
        { error: 'Could not read the screenshot. Try a clearer image or enter the details manually.' },
        { status: 502 },
      )
    }

    // Model is instructed to return bare JSON, but be defensive: strip any
    // accidental ```json fences and pull the first {...} block out.
    const cleaned = raw.replace(/```json\s*|\s*```/g, '').trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    let parsed: Record<string, any> = {}
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0])
      } catch {
        console.warn('[extract-screenshot] JSON parse failed, raw:', raw.slice(0, 300))
      }
    }

    const str = (v: any): string | null => {
      if (v == null) return null
      const s = String(v).trim()
      return s && s.toLowerCase() !== 'null' ? s : null
    }

    return NextResponse.json({
      success: true,
      extracted: {
        name: str(parsed.name),
        phone: str(parsed.phone),
        email: str(parsed.email),
        city: str(parsed.city),
        ...(IS_AGENCY_BRAND
          ? {
              business_name: str(parsed.business_name),
              business_type: str(parsed.business_type),
              service_interest: str(parsed.service_interest),
              website_status: str(parsed.website_status),
              lead_volume: str(parsed.lead_volume),
              urgency: str(parsed.urgency),
            }
          : {
              interest: str(parsed.interest),
              education: str(parsed.education),
            }),
        summary: str(parsed.summary),
      },
    })
  } catch (error: any) {
    console.error('[extract-screenshot] Error:', error?.message || error)
    return NextResponse.json(
      { error: 'Failed to process screenshot' },
      { status: 500 },
    )
  }
}
