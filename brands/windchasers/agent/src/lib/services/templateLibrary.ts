/**
 * BCON Template Library Service
 * 
 * Manages follow-up templates with database integration.
 * Adapted from master template library for BCON brand.
 */

import { createClient } from './supabase';

// ============================================================================
// TYPES
// ============================================================================

export type JourneyStage = 
  | 'one_touch' 
  | 'low_touch' 
  | 'engaged' 
  | 'high_intent' 
  | 'booking_made' 
  | 'no_show' 
  | 'demo_taken' 
  | 'proposal_sent' 
  | 'converted';

export type Channel = 'whatsapp' | 'voice' | 'sms' | 'email';
export type Variant = 'A' | 'B' | 'C';

export interface FollowUpTemplate {
  id: string;
  brand: string;
  stage: JourneyStage;
  day: number;
  channel: Channel;
  variant: Variant;
  meta_template_name: string | null;
  meta_template_id: string | null;
  meta_status: 'pending' | 'approved' | 'rejected';
  meta_rejection_reason: string | null;
  content: string;
  language: string;
  current_variant: Variant;
  send_count: number;
  is_active: boolean;
  metadata: {
    tone?: string;
    purpose?: string;
    parameters?: Array<{ index: number; name: string; example: string }>;
    category?: 'UTILITY' | 'MARKETING';
    buttons?: string[];
  };
  created_at: string;
  updated_at: string;
  last_sent_at: string | null;
}

// ============================================================================
// META API CONFIGURATION
// ============================================================================

const META_API_VERSION = 'v18.0';
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

// ============================================================================
// DATABASE FUNCTIONS
// ============================================================================

const supabase = createClient();

/**
 * Get next template variant for a specific slot (A/B/C rotation)
 */
export async function getNextTemplateVariant(
  stage: JourneyStage,
  day: number,
  channel: Channel,
  brand: string = 'bcon'
): Promise<{ variant: Variant; template: FollowUpTemplate | null }> {
  try {
    // Get the A variant to check current_variant
    const { data: variantA, error: errA } = await supabase
      .from('follow_up_templates')
      .select('current_variant')
      .eq('brand', brand)
      .eq('stage', stage)
      .eq('day', day)
      .eq('channel', channel)
      .eq('variant', 'A')
      .single();

    if (errA) {
      console.error('[TemplateLibrary] Error fetching current variant:', errA);
    }

    const nextVariant = variantA?.current_variant || 'A';

    // Get the actual template for that variant
    const { data: template, error } = await supabase
      .from('follow_up_templates')
      .select('*')
      .eq('brand', brand)
      .eq('stage', stage)
      .eq('day', day)
      .eq('channel', channel)
      .eq('variant', nextVariant)
      .eq('is_active', true)
      .eq('meta_status', 'approved')
      .single();

    if (error) {
      console.log(`[TemplateLibrary] No approved template found for ${stage} day ${day} variant ${nextVariant}`);
      return { variant: nextVariant, template: null };
    }

    return { variant: nextVariant, template };
  } catch (error) {
    console.error('[TemplateLibrary] Failed to get next variant:', error);
    return { variant: 'A', template: null };
  }
}

/**
 * Rotate to next variant after sending
 */
export async function rotateVariant(
  stage: JourneyStage,
  day: number,
  channel: Channel,
  brand: string = 'bcon'
): Promise<Variant> {
  try {
    const { data: templates } = await supabase
      .from('follow_up_templates')
      .select('id, variant, current_variant')
      .eq('brand', brand)
      .eq('stage', stage)
      .eq('day', day)
      .eq('channel', channel);

    if (!templates || templates.length === 0) {
      return 'A';
    }

    const currentVariant = templates[0]?.current_variant || 'A';
    const nextVariant: Variant = currentVariant === 'A' ? 'B' : currentVariant === 'B' ? 'C' : 'A';

    // Update all variants for this slot
    for (const template of templates) {
      const isCurrentVariant = template.variant === currentVariant;
      
      await supabase
        .from('follow_up_templates')
        .update({
          current_variant: nextVariant,
          send_count: isCurrentVariant 
            ? (template.send_count || 0) + 1 
            : template.send_count,
          last_sent_at: isCurrentVariant 
            ? new Date().toISOString() 
            : template.last_sent_at,
        })
        .eq('id', template.id);
    }

    console.log(`[TemplateLibrary] Rotated ${stage} day ${day} from ${currentVariant} to ${nextVariant}`);
    return nextVariant;
  } catch (error) {
    console.error('[TemplateLibrary] Failed to rotate variant:', error);
    return 'A';
  }
}

/**
 * Get template by exact match
 */
export async function getTemplate(
  stage: JourneyStage,
  day: number,
  channel: Channel,
  variant: Variant,
  brand: string = 'bcon'
): Promise<FollowUpTemplate | null> {
  const { data, error } = await supabase
    .from('follow_up_templates')
    .select('*')
    .eq('brand', brand)
    .eq('stage', stage)
    .eq('day', day)
    .eq('channel', channel)
    .eq('variant', variant)
    .single();

  if (error) {
    console.log(`[TemplateLibrary] Template not found: ${stage}/${day}/${channel}/${variant}`);
    return null;
  }

  return data;
}

/**
 * Get all templates for a stage
 */
export async function getTemplatesForStage(
  stage: JourneyStage,
  brand: string = 'bcon'
): Promise<FollowUpTemplate[]> {
  const { data, error } = await supabase
    .from('follow_up_templates')
    .select('*')
    .eq('brand', brand)
    .eq('stage', stage)
    .order('day', { ascending: true })
    .order('channel', { ascending: true })
    .order('variant', { ascending: true });

  if (error) {
    console.error('[TemplateLibrary] Failed to fetch templates:', error);
    return [];
  }

  return data || [];
}

/**
 * Render template with parameters
 */
export function renderTemplate(
  template: FollowUpTemplate,
  params: Record<string, string>
): string {
  let rendered = template.content;
  
  // Replace {{1}}, {{2}}, etc. with actual values
  template.metadata?.parameters?.forEach((param) => {
    const value = params[param.name] || params[`param${param.index}`] || '';
    rendered = rendered.replace(new RegExp(`{{${param.index}}}`, 'g'), value);
  });

  return rendered;
}

/**
 * Get template parameters for a specific template
 */
export function getTemplateParams(
  template: FollowUpTemplate,
  lead: { name?: string; business_type?: string; [key: string]: any }
): Array<{ parameter_name: string; value: string }> {
  const params: Array<{ parameter_name: string; value: string }> = [];
  
  template.metadata?.parameters?.forEach((param) => {
    let value = '';
    
    switch (param.name) {
      case 'customer_name':
        value = lead.name?.split(' ')[0] || lead.customer_name?.split(' ')[0] || 'there';
        break;
      case 'business_type':
        value = lead.business_type || lead.unified_context?.web?.business_type || 'your';
        break;
      default:
        value = lead[param.name] || '';
    }
    
    params.push({
      parameter_name: param.name,
      value: value || 'there',
    });
  });

  return params;
}

// ============================================================================
// TEMPLATE SELECTION FOR TASK WORKER
// ============================================================================

/**
 * Get the best template for a task based on lead context
 * This is the main function used by task-worker.js
 */
export async function getTemplateForTask(
  taskType: string,
  lead: {
    id?: string;
    name?: string;
    customer_name?: string;
    business_type?: string;
    response_count?: number;
    lead_stage?: string;
    last_follow_up_template?: string;
    unified_context?: any;
  }
): Promise<{ 
  templateName: string; 
  content: string;
  params: Array<{ parameter_name: string; value: string }>;
} | null> {
  
  // Map task types to journey stages and days
  const taskMapping: Record<string, { stage: JourneyStage; day: number }> = {
    'first_outreach': { stage: 'one_touch', day: 1 },
    'follow_up_day1': { stage: 'one_touch', day: 3 },
    'follow_up_day3': { stage: 'one_touch', day: 7 },
    'follow_up_day7': { stage: 'one_touch', day: 30 },
    'follow_up_day30': { stage: 'one_touch', day: 90 },
    'follow_up_24h': { stage: 'engaged', day: 1 },
    'nudge_waiting': { stage: 'high_intent', day: 1 },
    'push_to_book': { stage: 'high_intent', day: 1 },
    'booking_reminder_24h': { stage: 'booking_made', day: 1 },
    'booking_reminder_30m': { stage: 'booking_made', day: 1 },
    'no_show_recovery': { stage: 'no_show', day: 1 },
    'demo_followup': { stage: 'demo_taken', day: 1 },
    'proposal_followup': { stage: 'proposal_sent', day: 1 },
  };

  const mapping = taskMapping[taskType];
  if (!mapping) {
    console.log(`[TemplateLibrary] No mapping found for task type: ${taskType}`);
    return null;
  }

  // Get next variant with rotation
  const { variant, template } = await getNextTemplateVariant(
    mapping.stage,
    mapping.day,
    'whatsapp'
  );

  if (!template) {
    console.log(`[TemplateLibrary] No approved template for ${mapping.stage} day ${mapping.day}`);
    return null;
  }

  // Get parameters
  const params = getTemplateParams(template, lead);

  // Render content
  const content = renderTemplate(template, 
    params.reduce((acc, p) => ({ ...acc, [p.parameter_name]: p.value }), {})
  );

  // Rotate for next time
  await rotateVariant(mapping.stage, mapping.day, 'whatsapp');

  return {
    templateName: template.meta_template_name || 'unknown',
    content,
    params,
  };
}

// ============================================================================
// META API INTEGRATION
// ============================================================================

/**
 * Submit template to Meta for approval
 */
export async function submitTemplateToMeta(
  template: FollowUpTemplate,
  businessAccountId: string,
  accessToken: string
): Promise<{ success: boolean; templateId?: string; error?: string }> {
  try {
    const url = `${META_API_BASE}/${businessAccountId}/message_templates`;
    
    const components: any[] = [
      {
        type: 'BODY',
        text: template.content,
        example: {
          body_text: [template.metadata?.parameters?.map(p => p.example) || []]
        }
      }
    ];

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: template.meta_template_name,
        category: template.metadata?.category || 'UTILITY',
        language: template.language,
        components,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || `Meta API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Update database with template ID
    await supabase
      .from('follow_up_templates')
      .update({
        meta_template_id: data.id,
        meta_status: 'pending',
      })
      .eq('id', template.id);

    return { success: true, templateId: data.id };
  } catch (error) {
    console.error('[TemplateLibrary] Failed to submit template:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Sync template status from Meta
 */
export async function syncTemplateStatus(
  templateId: string,
  businessAccountId: string,
  accessToken: string
): Promise<void> {
  try {
    const url = `${META_API_BASE}/${businessAccountId}/message_templates?template_id=${templateId}`;
    
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) return;

    const data = await response.json();
    const template = data.data?.[0];
    
    if (template) {
      await supabase
        .from('follow_up_templates')
        .update({
          meta_status: template.status.toLowerCase(),
          meta_rejection_reason: template.rejection_reason || null,
        })
        .eq('meta_template_id', templateId);
    }
  } catch (error) {
    console.error('[TemplateLibrary] Failed to sync template status:', error);
  }
}
