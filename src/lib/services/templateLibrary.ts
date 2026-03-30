/**
 * Template Library Service
 * 
 * Manages follow-up templates: Meta API integration, database sync,
 * template assignment, and variant rotation.
 */

import { createClient } from '@/lib/supabase/client'
import { 
  JourneyStageId, 
  Channel, 
  Variant,
  generateTemplateName,
  STAGE_MAP,
} from '@/lib/constants/flowStages'

// ============================================================================
// TYPES
// ============================================================================

export interface MetaTemplate {
  id: string
  name: string
  language: string
  status: 'APPROVED' | 'PENDING' | 'REJECTED'
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION'
  components: Array<{
    type: 'BODY' | 'HEADER' | 'FOOTER' | 'BUTTONS'
    text?: string
    format?: string
    example?: any
  }>
}

export interface FollowUpTemplate {
  id: string
  brand: string
  stage: JourneyStageId
  day: number
  channel: Channel
  variant: Variant
  meta_template_name: string | null
  meta_template_id: string | null
  meta_status: 'pending' | 'approved' | 'rejected'
  meta_rejection_reason: string | null
  content: string
  language: string
  current_variant: Variant
  send_count: number
  is_active: boolean
  created_at: string
  updated_at: string
  last_sent_at: string | null
}

export interface TemplateAssignment {
  stageId: JourneyStageId
  day: number
  channel: Channel
  variant: Variant
  metaTemplateName: string
  content: string
  language?: string
}

export interface TemplateStats {
  totalSlots: number
  filledSlots: number
  pendingApproval: number
  rejected: number
  coverage: number
}

// ============================================================================
// META API FUNCTIONS
// ============================================================================

const META_API_VERSION = 'v18.0'
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`

/**
 * Fetch all approved templates from Meta API
 */
export async function fetchMetaTemplates(
  businessAccountId: string,
  accessToken: string
): Promise<MetaTemplate[]> {
  try {
    const url = `${META_API_BASE}/${businessAccountId}/message_templates?limit=1000`
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Meta API error: ${response.status} - ${error}`)
    }

    const data = await response.json()
    return data.data || []
  } catch (error) {
    console.error('[TemplateLibrary] Failed to fetch Meta templates:', error)
    throw error
  }
}

/**
 * Submit a new template to Meta for approval
 */
export async function submitTemplateToMeta(
  businessAccountId: string,
  accessToken: string,
  templateData: {
    name: string
    category: 'UTILITY' | 'MARKETING'
    language: string
    body: string
    header?: { type: 'TEXT'; text: string }
    footer?: { text: string }
  }
): Promise<{ id: string; status: string }> {
  try {
    const url = `${META_API_BASE}/${businessAccountId}/message_templates`
    
    const components: any[] = [
      {
        type: 'BODY',
        text: templateData.body,
      },
    ]

    if (templateData.header) {
      components.push({
        type: 'HEADER',
        format: 'TEXT',
        text: templateData.header.text,
      })
    }

    if (templateData.footer) {
      components.push({
        type: 'FOOTER',
        text: templateData.footer.text,
      })
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: templateData.name,
        category: templateData.category,
        language: templateData.language,
        components,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error?.message || `Meta API error: ${response.status}`)
    }

    const data = await response.json()
    return { id: data.id, status: data.status }
  } catch (error) {
    console.error('[TemplateLibrary] Failed to submit template:', error)
    throw error
  }
}

/**
 * Send test message using a template
 */
export async function sendTestMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  templateName: string,
  languageCode: string = 'en'
): Promise<void> {
  try {
    const url = `${META_API_BASE}/${phoneNumberId}/messages`
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
        },
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error?.message || `Meta API error: ${response.status}`)
    }
  } catch (error) {
    console.error('[TemplateLibrary] Failed to send test message:', error)
    throw error
  }
}

// ============================================================================
// DATABASE FUNCTIONS
// ============================================================================

const supabase = createClient()

/**
 * Sync Meta templates with database
 */
export async function syncTemplatesWithDatabase(
  metaTemplates: MetaTemplate[],
  brand: string = 'default'
): Promise<{
  created: number
  updated: number
  unchanged: number
}> {
  let created = 0
  let updated = 0
  let unchanged = 0

  for (const template of metaTemplates) {
    // Check if template exists in database
    const { data: existing } = await supabase
      .from('follow_up_templates')
      .select('id, meta_status')
      .eq('meta_template_id', template.id)
      .single()

    const metaStatus = template.status.toLowerCase() as 'approved' | 'pending' | 'rejected'

    if (!existing) {
      // Template doesn't exist - don't create automatically
      // User must explicitly assign it to a slot
      unchanged++
    } else if (existing.meta_status !== metaStatus) {
      // Update status
      const { error } = await supabase
        .from('follow_up_templates')
        .update({
          meta_status: metaStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)

      if (!error) updated++
    } else {
      unchanged++
    }
  }

  return { created, updated, unchanged }
}

/**
 * Get templates for a specific stage/day/channel
 */
export async function getTemplatesForStageDay(
  stageId: JourneyStageId,
  day: number,
  channel: Channel,
  brand: string = 'default'
): Promise<FollowUpTemplate[]> {
  const { data, error } = await supabase
    .from('follow_up_templates')
    .select('*')
    .eq('brand', brand)
    .eq('stage', stageId)
    .eq('day', day)
    .eq('channel', channel)
    .order('variant', { ascending: true })

  if (error) {
    console.error('[TemplateLibrary] Failed to fetch templates:', error)
    throw error
  }

  return data || []
}

/**
 * Get all templates for a stage (all days/channels)
 */
export async function getTemplatesForStage(
  stageId: JourneyStageId,
  brand: string = 'default'
): Promise<FollowUpTemplate[]> {
  const { data, error } = await supabase
    .from('follow_up_templates')
    .select('*')
    .eq('brand', brand)
    .eq('stage', stageId)
    .order('day', { ascending: true })
    .order('channel', { ascending: true })
    .order('variant', { ascending: true })

  if (error) {
    console.error('[TemplateLibrary] Failed to fetch templates:', error)
    throw error
  }

  return data || []
}

/**
 * Get all templates grouped by stage
 */
export async function getAllTemplates(
  brand: string = 'default'
): Promise<Record<JourneyStageId, FollowUpTemplate[]>> {
  const { data, error } = await supabase
    .from('follow_up_templates')
    .select('*')
    .eq('brand', brand)
    .order('stage', { ascending: true })
    .order('day', { ascending: true })
    .order('channel', { ascending: true })
    .order('variant', { ascending: true })

  if (error) {
    console.error('[TemplateLibrary] Failed to fetch all templates:', error)
    throw error
  }

  // Group by stage
  const grouped: Record<string, FollowUpTemplate[]> = {}
  for (const template of data || []) {
    if (!grouped[template.stage]) {
      grouped[template.stage] = []
    }
    grouped[template.stage].push(template)
  }

  return grouped as Record<JourneyStageId, FollowUpTemplate[]>
}

/**
 * Assign a template to a slot
 */
export async function assignTemplateToSlot(
  assignment: TemplateAssignment,
  brand: string = 'default'
): Promise<FollowUpTemplate> {
  const { stageId, day, channel, variant, metaTemplateName, content, language = 'en' } = assignment

  const { data, error } = await supabase
    .from('follow_up_templates')
    .upsert({
      brand,
      stage: stageId,
      day,
      channel,
      variant,
      meta_template_name: metaTemplateName,
      content,
      language,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'brand,stage,day,channel,variant',
    })
    .select()
    .single()

  if (error) {
    console.error('[TemplateLibrary] Failed to assign template:', error)
    throw error
  }

  return data
}

/**
 * Remove template assignment from a slot
 */
export async function removeTemplateFromSlot(
  stageId: JourneyStageId,
  day: number,
  channel: Channel,
  variant: Variant,
  brand: string = 'default'
): Promise<void> {
  const { error } = await supabase
    .from('follow_up_templates')
    .delete()
    .eq('brand', brand)
    .eq('stage', stageId)
    .eq('day', day)
    .eq('channel', channel)
    .eq('variant', variant)

  if (error) {
    console.error('[TemplateLibrary] Failed to remove template:', error)
    throw error
  }
}

/**
 * Get next variant to send (A/B/C rotation)
 */
export async function getNextVariant(
  stageId: JourneyStageId,
  day: number,
  channel: Channel,
  brand: string = 'default'
): Promise<{ variant: Variant; template: FollowUpTemplate | null }> {
  // Get the A variant to check current_variant
  const { data: variantA } = await supabase
    .from('follow_up_templates')
    .select('current_variant')
    .eq('brand', brand)
    .eq('stage', stageId)
    .eq('day', day)
    .eq('channel', channel)
    .eq('variant', 'A')
    .single()

  const nextVariant = variantA?.current_variant || 'A'

  // Get the actual template for that variant
  const { data: template } = await supabase
    .from('follow_up_templates')
    .select('*')
    .eq('brand', brand)
    .eq('stage', stageId)
    .eq('day', day)
    .eq('channel', channel)
    .eq('variant', nextVariant)
    .eq('is_active', true)
    .eq('meta_status', 'approved')
    .single()

  return { variant: nextVariant, template }
}

/**
 * Rotate to next variant after sending
 */
export async function rotateVariant(
  stageId: JourneyStageId,
  day: number,
  channel: Channel,
  brand: string = 'default'
): Promise<Variant> {
  const { data: templates } = await supabase
    .from('follow_up_templates')
    .select('id, variant, current_variant')
    .eq('brand', brand)
    .eq('stage', stageId)
    .eq('day', day)
    .eq('channel', channel)

  if (!templates || templates.length === 0) {
    return 'A'
  }

  // Get current variant from first template
  const currentVariant = templates[0]?.current_variant || 'A'

  // Determine next variant
  const nextVariant: Variant = currentVariant === 'A' ? 'B' : currentVariant === 'B' ? 'C' : 'A'

  // Update all variants for this slot
  for (const template of templates) {
    await supabase
      .from('follow_up_templates')
      .update({
        current_variant: nextVariant,
        send_count: template.variant === currentVariant 
          ? (await supabase.from('follow_up_templates').select('send_count').eq('id', template.id).single()).data?.send_count + 1 || 1
          : undefined,
        last_sent_at: template.variant === currentVariant ? new Date().toISOString() : undefined,
      })
      .eq('id', template.id)
  }

  return nextVariant
}

// ============================================================================
// STATS FUNCTIONS
// ============================================================================

/**
 * Get template statistics
 */
export async function getTemplateStats(brand: string = 'default'): Promise<{
  byStage: Record<JourneyStageId, TemplateStats>
  overall: TemplateStats
  lastSync: string | null
}> {
  const { data: templates, error } = await supabase
    .from('follow_up_templates')
    .select('*')
    .eq('brand', brand)

  if (error) {
    console.error('[TemplateLibrary] Failed to fetch stats:', error)
    throw error
  }

  const byStage: Record<string, TemplateStats> = {}

  // Initialize all stages
  for (const stageId of Object.keys(STAGE_MAP)) {
    const stage = STAGE_MAP[stageId as JourneyStageId]
    const expectedSlots = stage.timingRules.reduce((acc, rule) => acc + rule.channels.length, 0)
    
    byStage[stageId] = {
      totalSlots: expectedSlots * 3, // A, B, C variants
      filledSlots: 0,
      pendingApproval: 0,
      rejected: 0,
      coverage: 0,
    }
  }

  // Count actual templates
  for (const template of templates || []) {
    if (!byStage[template.stage]) continue

    byStage[template.stage].filledSlots++

    if (template.meta_status === 'pending') {
      byStage[template.stage].pendingApproval++
    } else if (template.meta_status === 'rejected') {
      byStage[template.stage].rejected++
    }
  }

  // Calculate coverage
  for (const stageId of Object.keys(byStage)) {
    const stats = byStage[stageId]
    stats.coverage = stats.totalSlots > 0 
      ? Math.round((stats.filledSlots / stats.totalSlots) * 100)
      : 100
  }

  // Overall stats
  const overall: TemplateStats = {
    totalSlots: Object.values(byStage).reduce((acc, s) => acc + s.totalSlots, 0),
    filledSlots: Object.values(byStage).reduce((acc, s) => acc + s.filledSlots, 0),
    pendingApproval: Object.values(byStage).reduce((acc, s) => acc + s.pendingApproval, 0),
    rejected: Object.values(byStage).reduce((acc, s) => acc + s.rejected, 0),
    coverage: 0,
  }
  overall.coverage = overall.totalSlots > 0
    ? Math.round((overall.filledSlots / overall.totalSlots) * 100)
    : 0

  // Get last sync time (most recent updated_at)
  const lastSync = templates && templates.length > 0
    ? templates.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0].updated_at
    : null

  return { byStage: byStage as Record<JourneyStageId, TemplateStats>, overall, lastSync }
}

/**
 * Get template slot status (filled, pending, empty)
 */
export async function getSlotStatus(
  stageId: JourneyStageId,
  day: number,
  channel: Channel,
  brand: string = 'default'
): Promise<{
  hasTemplate: boolean
  status: 'empty' | 'pending' | 'approved' | 'rejected' | 'mixed'
  variants: FollowUpTemplate[]
}> {
  const { data: templates } = await supabase
    .from('follow_up_templates')
    .select('*')
    .eq('brand', brand)
    .eq('stage', stageId)
    .eq('day', day)
    .eq('channel', channel)

  const variants = templates || []

  if (variants.length === 0) {
    return { hasTemplate: false, status: 'empty', variants: [] }
  }

  const hasApproved = variants.some(v => v.meta_status === 'approved')
  const hasPending = variants.some(v => v.meta_status === 'pending')
  const hasRejected = variants.some(v => v.meta_status === 'rejected')

  let status: 'empty' | 'pending' | 'approved' | 'rejected' | 'mixed' = 'empty'
  if (hasApproved && !hasPending && !hasRejected) status = 'approved'
  else if (hasPending && !hasApproved && !hasRejected) status = 'pending'
  else if (hasRejected && !hasApproved && !hasPending) status = 'rejected'
  else status = 'mixed'

  return { hasTemplate: true, status, variants }
}
