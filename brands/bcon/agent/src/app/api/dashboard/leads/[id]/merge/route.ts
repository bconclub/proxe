/**
 * POST /api/dashboard/leads/[id]/merge
 *
 * Merges two leads into one. Hard delete: the loser row is removed from
 * all_leads after every FK-bearing table has its lead_id repointed to the
 * winner.
 *
 * Winner picking: higher lead_score wins. On tie, earlier created_at wins.
 *
 * Request body:  { other_lead_id: UUID }
 *   [id]          — one of the two leads (from the route param)
 *   other_lead_id — the other one
 *
 * Response: { winner_lead_id, merged_lead_id, moved: {...}, merged_phones: [] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'

export const dynamic = 'force-dynamic'

// Tables that have a lead_id column and need to be re-pointed to the winner
// before we delete the loser. MUST be complete or we'll orphan rows.
const FK_TABLES = [
  'conversations',
  'activities',
  'agent_tasks',
  'lead_stage_changes',
  'lead_stage_overrides',
  'messages',
  'web_sessions',
  'whatsapp_sessions',
  'voice_sessions',
  'social_sessions',
] as const

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    // Auth check via cookie client (need a logged-in dashboard user)
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServiceClient() || authClient

    const leadAId = params.id
    const body = await request.json().catch(() => ({}))
    const leadBId = body?.other_lead_id

    if (!leadAId || !leadBId) {
      return NextResponse.json({ error: 'Both lead IDs are required' }, { status: 400 })
    }
    if (leadAId === leadBId) {
      return NextResponse.json({ error: 'Cannot merge a lead with itself' }, { status: 400 })
    }

    // Fetch both leads
    const { data: leads, error: fetchErr } = await supabase
      .from('all_leads')
      .select('id, customer_name, email, phone, lead_score, created_at, unified_context')
      .in('id', [leadAId, leadBId])
    if (fetchErr || !leads || leads.length !== 2) {
      return NextResponse.json(
        { error: 'Could not fetch both leads', detail: fetchErr?.message },
        { status: 404 },
      )
    }

    const leadA = leads.find((l: any) => l.id === leadAId)!
    const leadB = leads.find((l: any) => l.id === leadBId)!

    // Pick winner: higher score, tiebreak by earlier created_at.
    const scoreA = leadA.lead_score ?? 0
    const scoreB = leadB.lead_score ?? 0
    let winner: any, loser: any
    if (scoreA !== scoreB) {
      winner = scoreA > scoreB ? leadA : leadB
      loser = scoreA > scoreB ? leadB : leadA
    } else {
      const tA = new Date(leadA.created_at).getTime()
      const tB = new Date(leadB.created_at).getTime()
      winner = tA <= tB ? leadA : leadB
      loser  = tA <= tB ? leadB : leadA
    }

    // Build merged unified_context. Winner's fields win on conflicts; the
    // loser's identity is preserved under merged_from[] for audit.
    const winnerCtx = winner.unified_context || {}
    const loserCtx = loser.unified_context || {}
    const mergedFrom = Array.isArray(winnerCtx.merged_from) ? winnerCtx.merged_from : []
    mergedFrom.push({
      lead_id:        loser.id,
      customer_name:  loser.customer_name || null,
      phone:          loser.phone || null,
      email:          loser.email || null,
      lead_score:     loser.lead_score ?? null,
      merged_at:      new Date().toISOString(),
      merged_by:      user.email || 'system',
      original_ctx:   loserCtx,
    })
    const mergedCtx = {
      ...loserCtx,
      ...winnerCtx,
      merged_from: mergedFrom,
    }

    const mergedPhones: string[] = []
    if (loser.phone && loser.phone !== winner.phone) mergedPhones.push(loser.phone)

    // ── Re-point FKs ───────────────────────────────────────────────────
    const moves: Record<string, number> = {}
    for (const table of FK_TABLES) {
      try {
        const { error, count } = await supabase
          .from(table)
          .update({ lead_id: winner.id }, { count: 'exact' })
          .eq('lead_id', loser.id)
        if (error) {
          console.error(`[merge] Failed re-pointing ${table}:`, error.message)
          moves[table] = -1
        } else {
          moves[table] = count ?? 0
        }
      } catch (e: any) {
        console.error(`[merge] Exception re-pointing ${table}:`, e?.message)
        moves[table] = -1
      }
    }

    const { error: updateErr } = await supabase
      .from('all_leads')
      .update({ unified_context: mergedCtx })
      .eq('id', winner.id)
    if (updateErr) {
      console.error('[merge] Failed updating winner context:', updateErr.message)
      // Soft-fail: data already moved, only the audit trail couldn't write.
    }

    // ── Delete the loser ───────────────────────────────────────────────
    const { error: deleteErr } = await supabase
      .from('all_leads')
      .delete()
      .eq('id', loser.id)
    if (deleteErr) {
      console.error('[merge] Failed deleting loser:', deleteErr.message)
      return NextResponse.json(
        {
          error: 'FKs moved but loser delete failed — data is in inconsistent state, contact engineering',
          detail: deleteErr.message,
          winner_lead_id: winner.id,
          merged_lead_id: loser.id,
          moved: moves,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      winner_lead_id: winner.id,
      merged_lead_id: loser.id,
      moved: moves,
      merged_phones: mergedPhones,
    })
  } catch (error: any) {
    console.error('[merge] Unexpected error:', error?.message || error)
    return NextResponse.json(
      { error: error?.message || 'Unknown merge error' },
      { status: 500 },
    )
  }
}
