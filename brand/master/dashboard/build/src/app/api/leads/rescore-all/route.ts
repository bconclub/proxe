import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/leads/rescore-all
 * Background job: Rescore all active leads and calculate days_inactive
 * Should be called daily via cron
 */
export async function POST(request: NextRequest) {
  try {
    // Check for authorization header (cron secret)
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET || 'your-secret-key'
    
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createClient()

    // Fetch all active leads (not converted or closed_lost)
    const { data: leads, error: leadsError } = await supabase
      .from('all_leads')
      .select('id, lead_stage, is_manual_override')
      .not('lead_stage', 'in', '(converted,closed_lost)')
      .or('lead_stage.is.null,lead_stage.neq.converted,lead_stage.neq.closed_lost')

    if (leadsError) {
      console.error('Error fetching leads:', leadsError)
      return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 })
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No leads to rescore',
        processed: 0 
      })
    }

    console.log(`Rescoring ${leads.length} leads...`)

    let processed = 0
    let errors = 0

    // Process leads in batches to avoid overwhelming the API
    const batchSize = 10
    for (let i = 0; i < leads.length; i += batchSize) {
      const batch = leads.slice(i, i + batchSize)
      
      await Promise.all(
        batch.map(async (lead) => {
          try {
            // Skip if manual override is active
            if (lead.is_manual_override) {
              processed++
              return
            }

            // Call scoring endpoint for each lead
            const scoreResponse = await fetch(
              `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/leads/score`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ lead_id: lead.id }),
              }
            )

            if (scoreResponse.ok) {
              processed++
            } else {
              errors++
              console.error(`Error scoring lead ${lead.id}:`, await scoreResponse.text())
            }
          } catch (error) {
            errors++
            console.error(`Error processing lead ${lead.id}:`, error)
          }
        })
      )

      // Small delay between batches to avoid rate limiting
      if (i + batchSize < leads.length) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    // Bulk update days_inactive for all leads
    // Fetch leads with dates to calculate days_inactive
    const { data: leadsWithDates, error: datesError } = await supabase
      .from('all_leads')
      .select('id, last_interaction_at, created_at, lead_stage')
      .not('lead_stage', 'in', '(converted,closed_lost)')

    if (datesError) {
      console.error('Error fetching leads for days_inactive update:', datesError)
    } else if (leadsWithDates && leadsWithDates.length > 0) {
      // Calculate and update days_inactive in batches
      const updateBatchSize = 50
      for (let i = 0; i < leadsWithDates.length; i += updateBatchSize) {
        const batch = leadsWithDates.slice(i, i + updateBatchSize)
        
        await Promise.all(
          batch.map(async (lead) => {
            const lastInteraction = lead.last_interaction_at || lead.created_at
            if (!lastInteraction) return

            const now = new Date()
            const lastInteractionDate = new Date(lastInteraction)
            const diffMs = now.getTime() - lastInteractionDate.getTime()
            const daysInactive = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))

            const { error: updateError } = await supabase
              .from('all_leads')
              .update({ days_inactive: daysInactive })
              .eq('id', lead.id)

            if (updateError) {
              console.error(`Error updating days_inactive for lead ${lead.id}:`, updateError)
            }
          })
        )
      }
      console.log(`Updated days_inactive for ${leadsWithDates.length} leads`)
    }

    return NextResponse.json({
      success: true,
      processed,
      errors,
      total: leads.length,
      message: `Processed ${processed} leads, ${errors} errors`,
    })
  } catch (error) {
    console.error('Error in rescore-all job:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

