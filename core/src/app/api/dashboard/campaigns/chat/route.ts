/**
 * POST /api/dashboard/campaigns/chat — the campaign builder's brain.
 *
 * The user describes who they want to reach in plain words. Claude (tool loop)
 * queries the brand's real leads (query_audience) and the approved WhatsApp
 * template registry (list_templates), then answers with STRICT JSON the page
 * renders as cards: audience count + sample, matching approved templates, or
 * exactly two fresh template drafts with {{variables}} when nothing fits.
 *
 * Read-only: no sends, no writes. Saving a campaign is the page's explicit
 * button (POST /api/dashboard/campaigns).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'
import { generateResponseWithTools, type ToolDefinition } from '@/lib/agent-core/claudeClient'
import { getBrandConfig, BRAND_ID } from '@/configs'
import { PIPELINE_STAGE_GROUPS } from '@/configs/lead-stages'
import { COURSE_OPTIONS, normalizeCourse } from '@/configs/courses'
import { WA_TEMPLATE_BODIES } from '@/configs/whatsapp-template-bodies'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_FETCH = 3000
const SAMPLE_SIZE = 8

// ─── query_audience ──────────────────────────────────────────────────────────

async function queryAudience(input: Record<string, any>): Promise<string> {
  const service: any = getServiceClient()
  if (!service) return JSON.stringify({ error: 'Service client unavailable' })

  let q = service
    .from('all_leads')
    .select('id,customer_name,phone,lead_stage,created_at,last_interaction_at,first_touchpoint,last_touchpoint,unified_context')
    .order('created_at', { ascending: false })
    .limit(MAX_FETCH)

  // Column-level filters first (cheap), JSON-field filters in JS after.
  if (input.stage) {
    const group = PIPELINE_STAGE_GROUPS.find(
      (g) => g.key === input.stage || g.label.toLowerCase() === String(input.stage).toLowerCase() || g.values.includes(input.stage),
    )
    if (group) q = q.in('lead_stage', group.values.filter(Boolean))
    else q = q.eq('lead_stage', input.stage)
  }
  if (input.created_within_days) {
    q = q.gte('created_at', new Date(Date.now() - Number(input.created_within_days) * 86400000).toISOString())
  }
  const { data, error } = await q
  if (error) return JSON.stringify({ error: error.message })

  let rows: any[] = data || []
  const brandCtx = (l: any) => l.unified_context?.[BRAND_ID] || {}

  if (input.course) {
    const want = normalizeCourse(String(input.course))
    rows = rows.filter((l) => normalizeCourse(brandCtx(l).course_interest) === want)
  }
  if (input.user_type) {
    const want = String(input.user_type).toLowerCase()
    rows = rows.filter((l) => String(brandCtx(l).user_type || '').toLowerCase() === want)
  }
  if (input.city) {
    // city is not a column on every brand's all_leads — read it from the
    // brand's unified_context blob instead.
    const want = String(input.city).toLowerCase()
    rows = rows.filter((l) => String(brandCtx(l).city || '').toLowerCase().includes(want))
  }
  if (input.webinar === true) rows = rows.filter((l) => brandCtx(l).lead_type === 'webinar')
  if (input.webinar === false) rows = rows.filter((l) => brandCtx(l).lead_type !== 'webinar')
  if (input.source) {
    const want = String(input.source).toLowerCase()
    rows = rows.filter(
      (l) => String(l.first_touchpoint || '').toLowerCase().includes(want) || String(l.last_touchpoint || '').toLowerCase().includes(want),
    )
  }
  if (input.active_within_days) {
    const cutoff = Date.now() - Number(input.active_within_days) * 86400000
    rows = rows.filter((l) => l.last_interaction_at && new Date(l.last_interaction_at).getTime() >= cutoff)
  }
  if (input.inactive_for_days) {
    const cutoff = Date.now() - Number(input.inactive_for_days) * 86400000
    rows = rows.filter((l) => !l.last_interaction_at || new Date(l.last_interaction_at).getTime() < cutoff)
  }

  const withPhone = rows.filter((l) => l.phone)
  return JSON.stringify({
    count: rows.length,
    with_phone: withPhone.length,
    truncated_at: rows.length >= MAX_FETCH ? MAX_FETCH : undefined,
    filters_applied: input,
    sample: withPhone.slice(0, SAMPLE_SIZE).map((l) => ({
      name: l.customer_name || 'Unknown',
      phone: l.phone,
      stage: l.lead_stage || 'New',
      course: brandCtx(l).course_interest || null,
    })),
  })
}

// ─── list_templates ──────────────────────────────────────────────────────────

async function listTemplates(): Promise<string> {
  // The registry is Meta-APPROVED windchasers content; other brands have no
  // registry yet — the model falls through to drafting fresh templates.
  if (BRAND_ID !== 'windchasers') {
    return JSON.stringify({ templates: [], note: 'No approved template registry for this brand yet — draft new templates.' })
  }
  const templates = Object.entries(WA_TEMPLATE_BODIES).map(([name, t]) => ({
    name,
    body: t.body,
    footer: t.footer,
    buttons: t.buttons,
    status: 'approved',
  }))
  return JSON.stringify({ templates })
}

// ─── Tools + prompt ──────────────────────────────────────────────────────────

// Tools are built per brand so a brand's taxonomy never bleeds into another's
// prompt. course/user_type/webinar are Windchasers-aviation filters — off
// elsewhere; every brand keeps the neutral stage/source/city/recency filters.
function buildTools(): ToolDefinition[] {
  const props: Record<string, any> = {
    stage: { type: 'string', description: `Pipeline group key or label: ${PIPELINE_STAGE_GROUPS.map((g) => g.key).join(', ')}` },
    source: { type: 'string', description: 'Touchpoint substring: whatsapp, web, facebook, instagram, google…' },
    city: { type: 'string' },
    created_within_days: { type: 'number', description: 'Only leads created in the last N days' },
    active_within_days: { type: 'number', description: 'Only leads with activity in the last N days' },
    inactive_for_days: { type: 'number', description: 'Only leads silent for at least N days (re-engagement)' },
  }
  if (BRAND_ID === 'windchasers') {
    props.course = { type: 'string', description: `Course interest, one of: ${COURSE_OPTIONS.join(', ')}` }
    props.user_type = { type: 'string', description: 'student | parent | professional' }
    props.webinar = { type: 'boolean', description: 'true = only webinar registrants, false = exclude them' }
  }
  return [
    {
      name: 'query_audience',
      description: 'Count and sample the brand\'s leads matching filters. ALWAYS call this before stating any audience numbers. Combine filters freely.',
      input_schema: { type: 'object', properties: props },
    },
    {
      name: 'list_templates',
      description: 'List the brand\'s Meta-approved WhatsApp templates (name, body, footer, buttons). Call before proposing templates.',
      input_schema: { type: 'object', properties: {} },
    },
  ]
}

// The ONLY personalization variables the brain may put in drafts for this brand.
// customer_name is always safe; the brand's config vars + (for windchasers) the
// real registry template vars extend it. A brand with no registry/config gets
// customer_name only — so nothing like {{course_name}} bleeds onto a non-aviation
// brand just because the LLM had no template to anchor to.
function allowedVariables(): string[] {
  const set = new Set<string>(['customer_name'])
  for (const v of (getBrandConfig().campaigns?.variables || [])) set.add(v)
  if (BRAND_ID === 'windchasers') {
    for (const t of Object.values(WA_TEMPLATE_BODIES)) {
      for (const m of (t.body || '').matchAll(/\{\{([^}]+)\}\}/g)) set.add(m[1].trim())
    }
  }
  return [...set].filter((v) => v && v !== 'param')
}

function systemPrompt(): string {
  const brand = getBrandConfig()
  const allowed = allowedVariables()
  return `You are the campaign strategist inside ${brand.name}'s PROXe dashboard. A teammate describes who they want to reach on WhatsApp; you pull the real audience and line up the message.

RULES
- ALWAYS call query_audience before stating any count. Never invent numbers.
- ALWAYS call list_templates before proposing or drafting templates.
- Match approved templates to the audience's intent. Include at most 3 matches, best first.
- If NO approved template fits the campaign's purpose, write EXACTLY TWO fresh drafts:
  - names in the brand's style (lowercase_snake, e.g. ${BRAND_ID}_<purpose>_v1)
  - {{variable}} placeholders for personalization (e.g. {{customer_name}})
  - body under 550 characters, optional footer, up to 3 button labels
  - marketing-safe copy (no spam bait, includes a clear next step)
- PERSONALIZATION VARIABLES: the ONLY variables you may put in any draft body, footer or button are: ${allowed.map((v) => `{{${v}}}`).join(', ')}. Do NOT invent any other variable (never {{course_name}}, {{product}}, {{offer}}, etc.). If you want to reference a detail that is not in this list, write it in plain words instead of a placeholder. When unsure, use only {{customer_name}}.
- Keep "message" short and practical (2-4 sentences). No markdown headings.
- NEVER use em dashes or en dashes (— or –) anywhere, in messages, drafts, footers or the goal. Use a comma, a period, or the word "and".

OUTPUT — your FINAL reply must be STRICT JSON only (no prose around it, no code fences):
{
  "message": string,
  "audience": { "description": string, "filters": object, "count": number, "with_phone": number, "sample": [{"name": string, "phone": string, "stage": string}] } | null,
  "templates": [{"name": string, "body": string, "footer": string|null, "buttons": [string]|null, "status": "approved"}],
  "drafts": [{"name": string, "body": string, "footer": string|null, "buttons": [string]|null, "variables": [string]}],
  "suggestedCampaignName": string | null,
  "goal": string | null
}
"goal" = one short line naming what this campaign is trying to achieve, in ${brand.name}'s own words (e.g. "Re-engage leads who went quiet").
Set "audience" from your query_audience result (echo its filters). Empty arrays when nothing applies.`
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Feature gate honors the runtime override (Settings → Features) on top of
    // the brand-config default, mirroring useFeatureFlags on the client.
    let campaignsOn = !!getBrandConfig().features?.campaigns
    try {
      const service: any = getServiceClient()
      if (service) {
        const { data } = await service
          .from('dashboard_settings')
          .select('value')
          .eq('key', 'feature_flags')
          .maybeSingle()
        if (typeof data?.value?.campaigns === 'boolean') campaignsOn = data.value.campaigns
      }
    } catch { /* config default stands */ }
    if (!campaignsOn) {
      return NextResponse.json({ error: 'Campaigns is not enabled for this brand' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const messages: Array<{ role: string; content: string }> = Array.isArray(body.messages) ? body.messages : []
    if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
      return NextResponse.json({ error: 'messages ending with a user turn are required' }, { status: 400 })
    }

    // The client keeps the whole conversation; serialize it as a transcript so
    // multi-turn refinement ("only Mumbai", "make it shorter") works.
    const transcript = messages
      .slice(-16)
      .map((m) => `${m.role === 'user' ? 'Teammate' : 'You'}: ${String(m.content).slice(0, 2000)}`)
      .join('\n\n')

    const raw = await generateResponseWithTools(
      systemPrompt(),
      `${transcript}\n\n(Reply now with the STRICT JSON object only.)`,
      { tools: buildTools(), toolHandlers: { query_audience: queryAudience, list_templates: listTemplates }, maxToolRounds: 6 },
      2000,
      'chat',
    )

    // Tolerant parse: take the outermost JSON object; anything else becomes a
    // plain message so the chat never hard-fails on a formatting slip.
    let reply: any = null
    try {
      const start = raw.indexOf('{')
      const end = raw.lastIndexOf('}')
      if (start !== -1 && end > start) reply = JSON.parse(raw.slice(start, end + 1))
    } catch { /* fall through */ }
    if (!reply || typeof reply.message !== 'string') {
      reply = { message: raw, audience: null, templates: [], drafts: [], suggestedCampaignName: null }
    }
    reply.templates = Array.isArray(reply.templates) ? reply.templates : []
    reply.drafts = Array.isArray(reply.drafts) ? reply.drafts : []

    // Hard guard: strip any personalization variable the model invented outside
    // this brand's allowed set (e.g. {{course_name}} on a non-aviation brand).
    // Disallowed placeholders become "it" so the sentence stays readable and no
    // rogue variable can ever render, regardless of what the LLM returned.
    const allowedSet = new Set(allowedVariables())
    const sanitize = (s: unknown): string =>
      typeof s === 'string'
        ? s.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, name) => (allowedSet.has(String(name).trim()) ? `{{${String(name).trim()}}}` : 'it'))
        : (s as string)
    for (const d of reply.drafts) {
      if (d && typeof d === 'object') {
        d.body = sanitize(d.body)
        if (d.footer) d.footer = sanitize(d.footer)
        if (Array.isArray(d.buttons)) d.buttons = d.buttons.map(sanitize)
        if (Array.isArray(d.variables)) d.variables = d.variables.filter((v: string) => allowedSet.has(String(v).trim()))
      }
    }
    reply.message = sanitize(reply.message)

    return NextResponse.json({ reply })
  } catch (error) {
    console.error('[campaigns/chat] failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Campaign brain failed' },
      { status: 500 },
    )
  }
}
