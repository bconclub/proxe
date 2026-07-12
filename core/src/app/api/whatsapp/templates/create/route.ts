/**
 * POST /api/whatsapp/templates/create — create a WhatsApp message template on Meta.
 *
 * Submits a new template to the WhatsApp Business Management API
 * (POST /{waba-id}/message_templates). The template then goes through Meta's
 * review (PENDING → APPROVED/REJECTED). This is the dashboard-side of the
 * `whatsapp_business_management` permission used in the Tech Provider review.
 *
 * Env: META_WHATSAPP_ACCESS_TOKEN, META_WHATSAPP_PHONE_NUMBER_ID,
 *      META_WHATSAPP_WABA_ID (recommended; auto-discovered from the phone id if unset).
 *
 * Body: {
 *   name: string,                       // lowercase letters / digits / underscores
 *   category: 'MARKETING'|'UTILITY'|'AUTHENTICATION',
 *   language: string,                   // e.g. 'en_US'
 *   header?: { text: string, example?: string },   // TEXT header (optional, max 1 var)
 *   body: string,                       // body text, may contain {{1}}, {{2}}, ...
 *   bodyExample?: string[],             // one sample value per body variable (Meta requires it)
 *   footer?: string,                    // optional footer (no variables)
 *   buttons?: Array<                    // optional
 *     | { type: 'QUICK_REPLY', text: string }
 *     | { type: 'URL', text: string, url: string }
 *     | { type: 'PHONE_NUMBER', text: string, phone_number: string }
 *   >
 * }
 */
import { NextRequest, NextResponse } from 'next/server'
import { getWhatsAppCreds } from '@/lib/services/whatsappCreds'

export const dynamic = 'force-dynamic'
// Without this the route falls through to the ~10s catch-all and a cold start +
// Meta round-trip 504s (Vercel then returns a non-JSON "An error occurred" page,
// which the UI can't parse). Give it headroom.
export const maxDuration = 30

const GRAPH = 'https://graph.facebook.com/v21.0'

async function creds() {
  // Dashboard connection (embedded signup) first, META_WHATSAPP_* env fallback.
  return getWhatsAppCreds()
}

// WABA id: env first, else resolve from the phone-number edge.
async function resolveWaba(c: { phoneNumberId: string; accessToken: string; wabaId: string | null }) {
  if (c.wabaId) return c.wabaId
  try {
    const r = await fetch(`${GRAPH}/${c.phoneNumberId}?fields=whatsapp_business_account`, {
      headers: { Authorization: `Bearer ${c.accessToken}` },
      signal: AbortSignal.timeout(8000),
    })
    const d = await r.json()
    return d?.whatsapp_business_account?.id || null
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const c = await creds()
    if (!c) {
      return NextResponse.json({ error: 'Missing META_WHATSAPP_ACCESS_TOKEN / META_WHATSAPP_PHONE_NUMBER_ID' }, { status: 500 })
    }

    const b = await request.json().catch(() => ({} as any))
    const name = String(b.name || '').trim().toLowerCase()
    const category = String(b.category || '').toUpperCase()
    const language = String(b.language || 'en_US').trim()
    const bodyText = String(b.body || '').trim()

    // ── validate (mirror Meta's rules so the demo fails loudly, not at Meta) ──
    if (!/^[a-z0-9_]{1,512}$/.test(name)) {
      return NextResponse.json({ error: 'Name must be lowercase letters, digits and underscores only.' }, { status: 400 })
    }
    if (!['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(category)) {
      return NextResponse.json({ error: 'Category must be MARKETING, UTILITY or AUTHENTICATION.' }, { status: 400 })
    }

    // PASSTHROUGH: if the caller already built a components array, submit it
    // verbatim — don't strip or rebuild anything (the BODY example values etc.
    // are already inside). Used when a full payload is forwarded in.
    if (Array.isArray(b.components) && b.components.length) {
      const wabaId = await resolveWaba(c)
      if (!wabaId) return NextResponse.json({ error: 'Could not resolve WABA id. Set META_WHATSAPP_WABA_ID on Vercel.' }, { status: 400 })
      const payload = { name, language, category, components: b.components }
      const res = await fetch(`${GRAPH}/${wabaId}/message_templates`, {
        method: 'POST', headers: { Authorization: `Bearer ${c.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(20000),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg = data?.error?.error_user_msg || data?.error?.message || 'Meta rejected the template.'
        return NextResponse.json({ success: false, error: msg, meta: data?.error, payload }, { status: 400 })
      }
      return NextResponse.json({ success: true, id: data.id, name, status: data.status || 'PENDING', category: data.category || category, submittedComponents: (b.components as any[]).map((x: any) => x.type), payload })
    }

    if (!bodyText) {
      return NextResponse.json({ error: 'Body text is required.' }, { status: 400 })
    }

    // Variable format — Meta supports either positional {{1}} (NUMBER) or
    // named {{order_id}} (NAMED). A template uses one style throughout.
    const varType = String(b.varType || 'NUMBER').toUpperCase() === 'NAMED' ? 'NAMED' : 'NUMBER'
    const NUM_RE = /\{\{\s*\d+\s*\}\}/g
    const NAME_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g
    const namedExamplesFrom = (input: any) => {
      const arr = Array.isArray(input) ? input : []
      return new Map(arr.map((p: any) => [String(p.param_name || ''), String(p.example ?? '')]))
    }

    const components: any[] = []

    // HEADER (TEXT) — optional, at most one variable.
    if (b.header && String(b.header.text || '').trim()) {
      const headerText = String(b.header.text).trim()
      const comp: any = { type: 'HEADER', format: 'TEXT', text: headerText }
      if (varType === 'NAMED') {
        const names = Array.from(headerText.matchAll(NAME_RE)).map((m) => m[1])
        if (names.length) {
          const ne = b.header.namedExample || {}
          if (!ne.param_name || !String(ne.example || '').trim()) return NextResponse.json({ error: 'Header variable needs a name and a sample value.' }, { status: 400 })
          comp.example = { header_text_named_params: [{ param_name: String(ne.param_name), example: String(ne.example) }] }
        }
      } else {
        const vars = headerText.match(NUM_RE) || []
        if (vars.length) {
          if (!b.header.example) return NextResponse.json({ error: 'Header has a variable — provide a sample value.' }, { status: 400 })
          comp.example = { header_text: [String(b.header.example)] }
        }
      }
      components.push(comp)
    }

    // BODY — variables need a sample value each.
    const bodyComp: any = { type: 'BODY', text: bodyText }
    if (varType === 'NAMED') {
      const names = Array.from(new Set(Array.from(bodyText.matchAll(NAME_RE)).map((m) => m[1])))
      if (names.length) {
        const map = namedExamplesFrom(b.bodyNamedExamples)
        if (names.some((n) => !String(map.get(n) || '').trim())) {
          return NextResponse.json({ error: `Provide a sample value for each named variable: ${names.map((n) => `{{${n}}}`).join(', ')}` }, { status: 400 })
        }
        bodyComp.example = { body_text_named_params: names.map((n) => ({ param_name: n, example: String(map.get(n)) })) }
      }
    } else {
      const vars = bodyText.match(NUM_RE) || []
      if (vars.length) {
        const ex = Array.isArray(b.bodyExample) ? b.bodyExample.map((s: any) => String(s)) : []
        if (ex.length !== vars.length || ex.some((s: string) => !s.trim())) {
          return NextResponse.json({ error: `Body has ${vars.length} variable(s) — provide a sample value for each.` }, { status: 400 })
        }
        bodyComp.example = { body_text: [ex] }
      }
    }
    components.push(bodyComp)

    // FOOTER (no variables allowed by Meta).
    if (b.footer && String(b.footer).trim()) {
      components.push({ type: 'FOOTER', text: String(b.footer).trim() })
    }

    // BUTTONS — quick reply (Custom), URL (Visit website), phone (Call), and
    // copy-code (Copy offer code). Up to 10 (Meta shows >3 as a list).
    if (Array.isArray(b.buttons) && b.buttons.length > 0) {
      const buttons = b.buttons.slice(0, 10).map((btn: any) => {
        const t = String(btn.type || '').toUpperCase()
        if (t === 'URL') return { type: 'URL', text: String(btn.text || '').slice(0, 25), url: String(btn.url || '') }
        if (t === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: String(btn.text || '').slice(0, 25), phone_number: String(btn.phone_number || '') }
        if (t === 'COPY_CODE') return { type: 'COPY_CODE', example: String(btn.example || btn.text || '').slice(0, 15) }
        return { type: 'QUICK_REPLY', text: String(btn.text || '').slice(0, 25) }
      }).filter((btn: any) => (btn.type === 'COPY_CODE' ? btn.example : btn.text))
      if (buttons.length) components.push({ type: 'BUTTONS', buttons })
    }

    const wabaId = await resolveWaba(c)
    if (!wabaId) {
      return NextResponse.json({ error: 'Could not resolve WABA id. Set META_WHATSAPP_WABA_ID on Vercel.' }, { status: 400 })
    }

    const payload = { name, language, category, components }
    const res = await fetch(`${GRAPH}/${wabaId}/message_templates`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${c.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    })
    const data = await res.json()

    if (!res.ok) {
      // Surface Meta's error verbatim so the operator can fix and resubmit.
      const msg = data?.error?.error_user_msg || data?.error?.message || 'Meta rejected the template.'
      return NextResponse.json({ success: false, error: msg, meta: data?.error, payload }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      id: data.id,
      name,
      status: data.status || 'PENDING',
      category: data.category || category,
      // Echo what we actually sent Meta so the operator can verify every
      // component (header / body+examples / footer / buttons) made it.
      submittedComponents: components.map((c: any) => c.type),
      payload,
    })
  } catch (error) {
    console.error('[whatsapp/templates/create] error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
  }
}
