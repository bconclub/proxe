/**
 * Config / Connections — admin only.
 *
 * GET /api/dashboard/config → one place to SEE the whole app configuration:
 *   per-integration connection status, the non-secret identifiers (URLs, IDs,
 *   phone numbers, from-addresses…), whether each secret is set (never the
 *   secret value itself), plus the lead sources, connected channels and lead
 *   fields the agent uses.
 *
 * Phase 1 is read-only visibility. Secret VALUES are never returned — only a
 * boolean `set`. (Phase 2 adds write-only secret updates.)
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'

export const dynamic = 'force-dynamic'

async function requireAdmin(userSupabase: any) {
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const }
  const service = getServiceClient()
  if (!service) return { error: 'Service client unavailable', status: 500 as const }
  const { data: dashboardUser } = await service
    .from('dashboard_users')
    .select('role, is_active')
    .eq('id', user.id)
    .maybeSingle()
  if (!dashboardUser) return { error: 'Your account is not provisioned in dashboard_users. Ask another admin to add you.', status: 403 as const }
  if (dashboardUser.is_active === false) return { error: 'Your account is deactivated', status: 403 as const }
  if (dashboardUser.role !== 'admin') return { error: 'Forbidden — admins only', status: 403 as const }
  return { user, role: dashboardUser.role, status: 200 as const, service }
}

type FieldSpec = { env: string; label: string; secret?: boolean; required?: boolean }
type IntegrationSpec = { id: string; name: string; desc: string; fields: FieldSpec[] }

// The integration map mirrors the env template. `secret: true` → the value is
// never sent to the client (only whether it's set). Everything else is a
// non-secret identifier shown as-is so the admin can verify it at a glance.
const INTEGRATIONS: IntegrationSpec[] = [
  {
    id: 'supabase', name: 'Supabase', desc: 'Database & auth',
    fields: [
      { env: 'NEXT_PUBLIC_BCON_SUPABASE_URL', label: 'Project URL', required: true },
      { env: 'NEXT_PUBLIC_BCON_SUPABASE_ANON_KEY', label: 'Anon key', secret: true, required: true },
      { env: 'SUPABASE_SERVICE_ROLE_KEY', label: 'Service-role key', secret: true, required: true },
    ],
  },
  {
    id: 'claude', name: 'Claude (AI)', desc: 'Agent brain',
    fields: [
      { env: 'CLAUDE_API_KEY', label: 'API key', secret: true, required: true },
      { env: 'CLAUDE_MODEL', label: 'Model', required: false },
    ],
  },
  {
    id: 'groq', name: 'Groq (fast inference)', desc: 'Low-latency text generation',
    fields: [
      { env: 'AI_PROVIDER', label: 'Active provider' },
      { env: 'GROQ_API_KEY', label: 'API key', secret: true, required: false },
      { env: 'GROQ_MODEL', label: 'Model', required: false },
    ],
  },
  {
    id: 'redis', name: 'Redis cache', desc: 'Call telemetry and response cache',
    fields: [
      { env: 'REDIS_URL', label: 'Redis URL', secret: true, required: false },
    ],
  },
  {
    id: 'whatsapp', name: 'WhatsApp (Meta)', desc: 'WhatsApp Business messaging',
    fields: [
      { env: 'META_WHATSAPP_PHONE_NUMBER_ID', label: 'Phone number ID', required: true },
      { env: 'META_WHATSAPP_WABA_ID', label: 'WABA ID', required: true },
      { env: 'META_WHATSAPP_ACCESS_TOKEN', label: 'Access token', secret: true, required: true },
      { env: 'META_WHATSAPP_VERIFY_TOKEN', label: 'Webhook verify token', secret: true },
    ],
  },
  {
    id: 'instagram', name: 'Instagram (Meta)', desc: 'Instagram DM channel',
    fields: [
      { env: 'META_IG_BUSINESS_ACCOUNT_ID', label: 'IG business account ID', required: true },
      { env: 'META_IG_ACCESS_TOKEN', label: 'Access token', secret: true, required: true },
      { env: 'META_IG_APP_SECRET', label: 'App secret', secret: true },
      { env: 'META_IG_VERIFY_TOKEN', label: 'Webhook verify token', secret: true },
    ],
  },
  {
    id: 'voice', name: 'Voice (Vapi + VoBiz)', desc: 'Outbound/inbound calls',
    fields: [
      { env: 'VAPI_ASSISTANT_ID', label: 'Vapi assistant ID' },
      { env: 'VAPI_OUTBOUND_PHONE_NUMBER_ID', label: 'Vapi outbound number ID' },
      { env: 'VAPI_SIP_URI', label: 'Vapi SIP URI' },
      { env: 'VAPI_PRIVATE_API_KEY', label: 'Vapi private key', secret: true },
      { env: 'VAPI_WEBHOOK_SECRET', label: 'Vapi webhook secret', secret: true },
      { env: 'VOBIZ_FROM_NUMBER', label: 'VoBiz from-number' },
      { env: 'VOBIZ_AUTH_ID', label: 'VoBiz auth ID', secret: true },
      { env: 'VOBIZ_AUTH_TOKEN', label: 'VoBiz auth token', secret: true },
    ],
  },
  {
    id: 'calendar', name: 'Google Calendar', desc: 'Booking calendar',
    fields: [
      { env: 'GOOGLE_CALENDAR_ID', label: 'Calendar ID', required: true },
      { env: 'GOOGLE_CALENDAR_TIMEZONE', label: 'Timezone' },
      { env: 'GOOGLE_SERVICE_ACCOUNT_EMAIL', label: 'Service account email', required: true },
      { env: 'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY', label: 'Service account private key', secret: true, required: true },
    ],
  },
  {
    id: 'email', name: 'Email (Resend)', desc: 'Transactional email',
    fields: [
      { env: 'RESEND_FROM_EMAIL', label: 'From email', required: true },
      { env: 'RESEND_FROM_NAME', label: 'From name' },
      { env: 'RESEND_API_KEY', label: 'API key', secret: true, required: true },
    ],
  },
]

// Lead sources the inbound pipeline attributes (see api/agent/leads/inbound).
const SOURCES = [
  { id: 'meta_forms', label: 'Meta Lead Forms' },
  { id: 'whatsapp_ctwa', label: 'WhatsApp Click-to-WhatsApp ads' },
  { id: 'instagram', label: 'Instagram DM' },
  { id: 'instagram_comment', label: 'Instagram comments' },
  { id: 'web', label: 'Website chat widget' },
]

// Lead profile fields the agent collects (see leadManager).
const LEAD_FIELDS = [
  { key: 'customer_name', label: 'Name', required: true },
  { key: 'customer_phone_normalized', label: 'Phone', required: true },
  { key: 'customer_email', label: 'Email', required: false },
  { key: 'customer_company', label: 'Company', required: false },
  { key: 'customer_city', label: 'City', required: false },
  { key: 'customer_website', label: 'Website', required: false },
  { key: 'customer_notes', label: 'Notes', required: false },
]

export async function GET() {
  try {
    const supabase = await createClient()
    const auth = await requireAdmin(supabase)
    if (auth.status !== 200) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const integrations = INTEGRATIONS.map((intg) => {
      const fields = intg.fields.map((f) => {
        const raw = process.env[f.env] || ''
        const isSet = raw.trim().length > 0
        return {
          env: f.env,
          label: f.label,
          secret: !!f.secret,
          required: !!f.required,
          set: isSet,
          // Non-secret values are returned as-is; secret values are NEVER sent.
          value: f.secret ? null : (isSet ? raw : null),
        }
      })
      const required = fields.filter((f) => f.required)
      const reqSet = required.filter((f) => f.set).length
      const status: 'connected' | 'partial' | 'missing' =
        required.length === 0
          ? (fields.some((f) => f.set) ? 'connected' : 'missing')
          : reqSet === required.length ? 'connected'
          : reqSet === 0 ? 'missing'
          : 'partial'
      return { id: intg.id, name: intg.name, desc: intg.desc, status, fields }
    })

    // Connected channels = the live sending endpoints, from non-secret env.
    const channels = [
      { label: 'WhatsApp number', value: process.env.META_WHATSAPP_PHONE_NUMBER_ID || null },
      { label: 'Instagram account', value: process.env.META_IG_BUSINESS_ACCOUNT_ID || null },
      { label: 'Voice from-number', value: process.env.VOBIZ_FROM_NUMBER || null },
      { label: 'Web chat', value: '/api/agent/web/chat' },
    ]

    return NextResponse.json({ integrations, sources: SOURCES, channels, leadFields: LEAD_FIELDS })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load config' }, { status: 500 })
  }
}
