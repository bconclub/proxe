/**
 * API Routes for Template Management
 * 
 * GET: Fetch all templates grouped by stage
 * POST: Assign a template to a slot
 * PUT: Update template assignment
 * DELETE: Remove template from slot
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { 
  assignTemplateToSlot, 
  removeTemplateFromSlot,
  getAllTemplates,
  getTemplatesForStage,
} from '@/lib/services/templateLibrary'
import { JourneyStageId, Channel, Variant } from '@/lib/constants/flowStages'

export const dynamic = 'force-dynamic'

// GET /api/dashboard/flows/templates - Get all templates
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get query params
    const { searchParams } = new URL(request.url)
    const stage = searchParams.get('stage') as JourneyStageId | null
    const brand = searchParams.get('brand') || 'default'

    let templates
    if (stage) {
      templates = await getTemplatesForStage(stage, brand)
    } else {
      templates = await getAllTemplates(brand)
    }

    return NextResponse.json({ success: true, templates })
  } catch (error) {
    console.error('[API] Failed to fetch templates:', error)
    return NextResponse.json(
      { error: 'Failed to fetch templates' },
      { status: 500 }
    )
  }
}

// POST /api/dashboard/flows/templates - Assign template to slot
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const {
      stageId,
      day,
      channel,
      variant,
      metaTemplateName,
      content,
      language = 'en',
      brand = 'default',
    } = body

    // Validate required fields
    if (!stageId || !day || !channel || !variant || !metaTemplateName || !content) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Validate stage
    const validStages: JourneyStageId[] = [
      'one_touch', 'low_touch', 'engaged', 'high_intent',
      'booking_made', 'no_show', 'demo_taken', 'proposal_sent', 'converted'
    ]
    if (!validStages.includes(stageId)) {
      return NextResponse.json(
        { error: `Invalid stage: ${stageId}` },
        { status: 400 }
      )
    }

    // Validate channel
    const validChannels: Channel[] = ['whatsapp', 'voice', 'sms', 'email']
    if (!validChannels.includes(channel)) {
      return NextResponse.json(
        { error: `Invalid channel: ${channel}` },
        { status: 400 }
      )
    }

    // Validate variant
    const validVariants: Variant[] = ['A', 'B', 'C']
    if (!validVariants.includes(variant)) {
      return NextResponse.json(
        { error: `Invalid variant: ${variant}` },
        { status: 400 }
      )
    }

    const template = await assignTemplateToSlot({
      stageId,
      day,
      channel,
      variant,
      metaTemplateName,
      content,
      language,
    }, brand)

    return NextResponse.json({ success: true, template })
  } catch (error) {
    console.error('[API] Failed to assign template:', error)
    return NextResponse.json(
      { error: 'Failed to assign template' },
      { status: 500 }
    )
  }
}

// PUT /api/dashboard/flows/templates - Update template
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const { id, updates } = body

    if (!id || !updates) {
      return NextResponse.json(
        { error: 'Missing id or updates' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('follow_up_templates')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[API] Failed to update template:', error)
      return NextResponse.json(
        { error: 'Failed to update template' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, template: data })
  } catch (error) {
    console.error('[API] Failed to update template:', error)
    return NextResponse.json(
      { error: 'Failed to update template' },
      { status: 500 }
    )
  }
}

// DELETE /api/dashboard/flows/templates - Remove template from slot
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    
    const stageId = searchParams.get('stageId') as JourneyStageId
    const day = parseInt(searchParams.get('day') || '0')
    const channel = searchParams.get('channel') as Channel
    const variant = searchParams.get('variant') as Variant
    const brand = searchParams.get('brand') || 'default'

    if (!stageId || !day || !channel || !variant) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }

    await removeTemplateFromSlot(stageId, day, channel, variant, brand)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API] Failed to remove template:', error)
    return NextResponse.json(
      { error: 'Failed to remove template' },
      { status: 500 }
    )
  }
}
